// viewer.js
//
// Runs in the chrome-extension://<id>/src/viewer/viewer.html page that the
// background worker opens.
//
// Pipeline:
//   1. Read context (accountIndex, ik, permthid) from URL params.
//   2. Build the Gmail print-view URL.
//   3. Ask the background worker to fetch that URL (must go through bg —
//      Gmail's own service worker intercepts every fetch to mail.google.com
//      from non-bg contexts and rejects ours).
//   4. Parse the print HTML into structured Thread { subject, messages[] }.
//   5. Render each message as a card with sanitized HTML body and a
//      collapsible quoted-history block.
//
// All errors render in the page rather than throwing — the user should
// always see something useful.

import { buildPrintViewUrl } from "../lib/gmailUrl.js";
import { parsePrintView } from "../lib/parsePrintView.js";
import { renderBody } from "../lib/renderBody.js";

const $ = (id) => document.getElementById(id);
const subjectEl = $("tv-subject");
const metaEl = $("tv-meta");
const statusEl = $("tv-status");
const threadEl = $("tv-thread");
const parsedEl = $("tv-parsed");
const rawEl = $("tv-raw");

function setStatus(text, kind /* "ok" | "error" | "" */) {
  statusEl.hidden = false;
  statusEl.textContent = text;
  statusEl.classList.remove("is-error", "is-ok");
  if (kind === "ok") statusEl.classList.add("is-ok");
  if (kind === "error") statusEl.classList.add("is-error");
}

function setStatusWithLink(prefix, url) {
  statusEl.hidden = false;
  statusEl.textContent = "";
  statusEl.classList.remove("is-error", "is-ok");
  statusEl.appendChild(document.createTextNode(prefix + "\n"));
  const linkEl = document.createElement("a");
  linkEl.href = url;
  linkEl.target = "_blank";
  linkEl.rel = "noopener noreferrer";
  linkEl.textContent = url;
  linkEl.style.wordBreak = "break-all";
  statusEl.appendChild(linkEl);
}

function showError(title, detail) {
  setStatus(`${title}\n\n${detail || ""}`.trim(), "error");
}

function hideStatus() {
  statusEl.hidden = true;
}

// Reading-width presets. Keys are persisted in chrome.storage.local;
// values are applied as the --tv-reading-width CSS custom property.
const WIDTH_PRESETS = {
  medium: "900px",
  wide: "1100px",
  xwide: "1300px",
};
const DEFAULT_WIDTH = "xwide";
const WIDTH_STORAGE_KEY = "threadview.readingWidth";

async function initWidthToggle() {
  // Load saved preset (or default), apply, wire up clicks, persist on change.
  let saved = DEFAULT_WIDTH;
  try {
    const stored = await chrome.storage.local.get(WIDTH_STORAGE_KEY);
    if (stored && stored[WIDTH_STORAGE_KEY] && WIDTH_PRESETS[stored[WIDTH_STORAGE_KEY]]) {
      saved = stored[WIDTH_STORAGE_KEY];
    }
  } catch (_) { /* fall through to default */ }

  applyWidth(saved);

  const buttons = document.querySelectorAll(".tv-width-btn");
  for (const btn of buttons) {
    btn.addEventListener("click", () => {
      const choice = btn.getAttribute("data-width");
      if (!WIDTH_PRESETS[choice]) return;
      applyWidth(choice);
      try {
        chrome.storage.local.set({ [WIDTH_STORAGE_KEY]: choice });
      } catch (_) { /* ignore — preset still applied for this tab */ }
    });
  }
}

function applyWidth(choice) {
  const px = WIDTH_PRESETS[choice] || WIDTH_PRESETS[DEFAULT_WIDTH];
  document.documentElement.style.setProperty("--tv-reading-width", px);
  for (const btn of document.querySelectorAll(".tv-width-btn")) {
    btn.setAttribute("aria-checked", btn.getAttribute("data-width") === choice ? "true" : "false");
  }
}

(async function main() {
  // Apply the saved reading-width preset before any content renders to
  // avoid a flash at the default width.
  initWidthToggle();

  const params = new URLSearchParams(window.location.search);
  const noThread = params.get("noThread") === "1";
  const accountIndex = params.get("accountIndex");
  const ik = params.get("ik");
  const permthid = params.get("permthid");

  if (noThread || !permthid || !ik) {
    subjectEl.textContent = "No thread is open in Gmail.";
    metaEl.textContent = "";
    showError(
      "Open a thread first.",
      "Click the ThreadView button while you have a Gmail thread (conversation) open. " +
      "If you clicked while a thread was open and still see this, Gmail may not have " +
      "finished loading yet — try again in a second.",
    );
    return;
  }

  const ctx = {
    accountIndex: accountIndex ? Number(accountIndex) : 0,
    ik,
    permthid,
  };

  let url;
  try {
    url = buildPrintViewUrl(ctx);
  } catch (err) {
    showError("Couldn't build the Gmail print-view URL.", String(err));
    return;
  }

  subjectEl.textContent = "Loading thread…";
  metaEl.textContent = `account u/${ctx.accountIndex}`;
  setStatusWithLink("Fetching from Gmail…", url);

  console.log("[ThreadView viewer] Asking background to fetch:", url);

  let fetchResult;
  try {
    const reqStart = performance.now();
    fetchResult = await chrome.runtime.sendMessage({
      type: "THREADVIEW_FETCH_PRINT",
      url,
    });
    const reqMs = Math.round(performance.now() - reqStart);
    console.log(
      "[ThreadView viewer] Background responded in",
      reqMs,
      "ms — result:",
      fetchResult && {
        ok: fetchResult.ok,
        status: fetchResult.status,
        finalUrl: fetchResult.finalUrl,
        htmlLen: fetchResult.html ? fetchResult.html.length : null,
        error: fetchResult.error,
      },
    );
  } catch (err) {
    console.error("[ThreadView viewer] sendMessage failed:", err);
    showError(
      "Couldn't reach the extension's background worker.",
      String(err) + "\n\nTry reloading the extension at chrome://extensions and then try again.",
    );
    return;
  }

  if (!fetchResult) {
    showError(
      "Background worker returned no response.",
      "Try reloading the extension at chrome://extensions and then try again.",
    );
    return;
  }

  if (!fetchResult.ok) {
    const isAbort = fetchResult.name === "AbortError";
    showError(
      isAbort ? "Fetch timed out after 30 seconds." : "Network error while fetching the Gmail print view.",
      String(fetchResult.error) +
        "\n\nMake sure you are signed into Gmail in this browser, then try again.",
    );
    return;
  }

  if (fetchResult.status !== 200) {
    showError(
      `Gmail returned HTTP ${fetchResult.status} ${fetchResult.statusText || ""}.`,
      "If this is 401/403, you may be signed out of this Gmail account in this browser. " +
        "If this is 404, Gmail's print-view URL may have changed shape.\n\n" +
        `Response final URL: ${fetchResult.finalUrl}`,
    );
    return;
  }

  const html = fetchResult.html || "";
  console.log("[ThreadView viewer] Got HTML —", html.length, "bytes.");

  // Heuristic auth check. The print template's structural marker is
  // `<table class="message">` — one per message. Sign-in / error pages
  // don't have it. The earlier check (looking for the literal string "From:")
  // false-positived on senders rendered without that label, e.g. Upwork
  // notification emails where the cell content is "Name via Upwork <room_...>"
  // with no "From:" prefix.
  if (!/<table[^>]*class=["']?message["']?/i.test(html)) {
    rawEl.textContent = html.slice(0, 2000);
    showError(
      "Got a response, but it doesn't look like a thread print view.",
      "This usually means Gmail returned a sign-in page or an error page.",
    );
    return;
  }

  let thread;
  try {
    thread = parsePrintView(html);
  } catch (err) {
    rawEl.textContent = html.slice(0, 4000);
    showError("Parser threw an exception.", String(err));
    return;
  }

  // ---- Render the reading view ----

  const subject = thread.subject || "(no subject)";
  subjectEl.textContent = subject;
  metaEl.textContent =
    `${thread.messageCount} message${thread.messageCount === 1 ? "" : "s"}` +
    `  ·  account u/${ctx.accountIndex}`;
  document.title = `${subject} — ThreadView`;

  hideStatus();
  threadEl.innerHTML = "";

  if (thread.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tv-empty";
    empty.textContent = "No messages found in this thread.";
    threadEl.appendChild(empty);
  } else {
    // Gmail base used to resolve relative <img src> URLs in message bodies.
    const gmailBase = `https://mail.google.com/mail/u/${ctx.accountIndex}/`;
    for (const msg of thread.messages) {
      threadEl.appendChild(renderMessage(msg, gmailBase));
    }
  }

  // Debug payloads stay in collapsed <details> at the bottom.
  parsedEl.textContent = JSON.stringify(thread, null, 2);
  rawEl.textContent = html;
})();

// Ask the background worker to fetch an authenticated Gmail attachment image
// and return it as a data URL. Resolves to null on failure (caller leaves the
// original src in place).
async function fetchImageViaBg(url) {
  try {
    const res = await chrome.runtime.sendMessage({
      type: "THREADVIEW_FETCH_IMAGE",
      url,
    });
    if (res && res.ok && res.dataUrl) return res.dataUrl;
    return null;
  } catch (_) {
    return null;
  }
}

// ---- Message card renderer ----

function renderMessage(msg, gmailBase) {
  const card = document.createElement("article");
  card.className = "tv-msg";

  // Header: from + date
  const header = document.createElement("div");
  header.className = "tv-msg-header";

  const fromEl = document.createElement("h2");
  fromEl.className = "tv-msg-from";
  const fromParts = parseAddress(msg.from);
  fromEl.appendChild(document.createTextNode(fromParts.name || fromParts.email || "(unknown sender)"));
  if (fromParts.name && fromParts.email) {
    const emailSpan = document.createElement("span");
    emailSpan.className = "tv-msg-email";
    emailSpan.textContent = `<${fromParts.email}>`;
    fromEl.appendChild(emailSpan);
  }
  header.appendChild(fromEl);

  if (msg.date) {
    const dateEl = document.createElement("div");
    dateEl.className = "tv-msg-date";
    dateEl.textContent = msg.date;
    header.appendChild(dateEl);
  }
  card.appendChild(header);

  // Recipients (collapsible — defaults closed since they're often long)
  if (msg.to || msg.cc) {
    const recip = document.createElement("details");
    recip.className = "tv-msg-recipients";
    const summary = document.createElement("summary");
    const recipientCount =
      (msg.to ? msg.to.split(",").length : 0) + (msg.cc ? msg.cc.split(",").length : 0);
    summary.textContent = `Recipients (${recipientCount})`;
    recip.appendChild(summary);
    const list = document.createElement("ul");
    list.className = "tv-msg-recipients-list";
    if (msg.to) list.appendChild(recipientLine("To", msg.to));
    if (msg.cc) list.appendChild(recipientLine("Cc", msg.cc));
    recip.appendChild(list);
    card.appendChild(recip);
  }

  // Body — sanitized HTML with quoted-history collapsed
  const body = document.createElement("div");
  body.className = "tv-msg-body";
  try {
    const { fragment } = renderBody(msg.bodyHtml || "", {
      gmailBase,
      fetchImage: fetchImageViaBg,
    });
    body.appendChild(fragment);
  } catch (err) {
    console.error("[ThreadView viewer] renderBody failed:", err);
    body.textContent = msg.bodyText || "(failed to render body)";
  }
  card.appendChild(body);

  return card;
}

function recipientLine(label, addresses) {
  const li = document.createElement("li");
  const labelSpan = document.createElement("span");
  labelSpan.className = "tv-label";
  labelSpan.textContent = label + ":";
  li.appendChild(labelSpan);
  li.appendChild(document.createTextNode(" " + addresses));
  return li;
}

// "Alice Example <alice@example.com>" → { name: "Alice Example", email: "alice@example.com" }
function parseAddress(s) {
  if (!s) return { name: "", email: "" };
  const m = s.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^["']|["']$/g, ""), email: m[2] };
  return { name: "", email: s.trim() };
}
