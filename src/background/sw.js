// sw.js
//
// Background service worker. Two responsibilities:
//
//   1. THREADVIEW_OPEN — content script tells us the user clicked the button.
//      We open a viewer tab with the context encoded as URL params.
//
//   2. THREADVIEW_FETCH_PRINT — viewer page asks us to fetch the Gmail print
//      view for it. We MUST do this in the background instead of in the
//      viewer because Gmail registers its own service worker on
//      mail.google.com that intercepts every fetch to that origin and rejects
//      ours with a network error from sw.js?offline_allowed=1 / fetchhandler.js.
//      Fetches initiated from the extension's background service worker are
//      not subject to mail.google.com's service worker, so they pass through.

// ---- First-launch timestamp ----
//
// Record the millisecond timestamp the very first time this extension runs
// in a given browser profile. This is a forward-looking signal: if/when we
// ever introduce a paid tier, "users who installed before paywall date X are
// free forever" needs a per-install timestamp to read against. Without
// recording it now, that grandfathering check cannot be implemented later.
//
// Idempotent — only writes when the value is missing. Runs from two paths
// for safety: (a) chrome.runtime.onInstalled (fires once per install/update),
// and (b) defensively at the top of the THREADVIEW_OPEN handler in case
// onInstalled was missed (e.g. unpacked load that pre-dates this code).
async function ensureFirstLaunchedAt() {
  try {
    const existing = await chrome.storage.local.get("firstLaunchedAt");
    if (!existing || !existing.firstLaunchedAt) {
      await chrome.storage.local.set({ firstLaunchedAt: Date.now() });
    }
  } catch (_) {
    // chrome.storage may fail in edge cases (worker shutdown, quota). Silent
    // failure is correct — we'll retry on the next event.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureFirstLaunchedAt();
});

// ---- Open viewer tab on user click ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "THREADVIEW_OPEN") return false;

  // Defensive: backfill the first-launch timestamp for installs that
  // pre-date the onInstalled listener (unpacked loads, etc).
  ensureFirstLaunchedAt();

  const ctx = message.ctx || {};

  const params = new URLSearchParams();
  if (typeof ctx.accountIndex === "number") {
    params.set("accountIndex", String(ctx.accountIndex));
  }
  if (ctx.ik) params.set("ik", ctx.ik);
  if (ctx.permthid) params.set("permthid", ctx.permthid);
  if (ctx.ok === false) params.set("noThread", "1");

  const url = chrome.runtime.getURL("src/viewer/viewer.html") + "?" + params.toString();

  chrome.tabs.create({ url }).then(
    (tab) => sendResponse({ ok: true, tabId: tab.id }),
    (err) => sendResponse({ ok: false, error: String(err) }),
  );

  return true;
});

// ---- Fetch Gmail print HTML on the viewer's behalf ----
//
// Returns: { ok: true, status: 200, html: "..." } or { ok: false, error: "..." }
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "THREADVIEW_FETCH_PRINT") return false;

  const url = message.url;
  if (!url || typeof url !== "string") {
    sendResponse({ ok: false, error: "Missing or invalid url" });
    return false;
  }

  console.log("[ThreadView sw] Fetching print view:", url);

  // 30s timeout for safety.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  fetch(url, { credentials: "include", redirect: "follow", signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timeoutId);
      console.log(
        "[ThreadView sw] Response:",
        res.status,
        res.statusText,
        "type:",
        res.type,
        "url:",
        res.url,
      );
      const text = await res.text();
      console.log("[ThreadView sw] Body length:", text.length);
      sendResponse({
        ok: true,
        status: res.status,
        statusText: res.statusText,
        finalUrl: res.url,
        html: text,
      });
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      console.error("[ThreadView sw] Fetch failed:", err);
      sendResponse({
        ok: false,
        error: String(err),
        name: err && err.name,
      });
    });

  return true; // keep the channel open for async sendResponse
});

// ---- Fetch an attachment image and return it as a data URL ----
//
// Inline images in Gmail's print HTML have URLs like
//   https://mail.google.com/mail/u/1/?ui=2&ik=...&view=fimg&th=...&attid=0.5&...
// These require the user's Gmail session cookies. The viewer page is
// chrome-extension:// origin and doesn't carry those cookies, so we fetch
// here in the background (which DOES carry them via host_permissions) and
// return base64-encoded image data the viewer can drop into <img src>.
//
// Returns: { ok: true, dataUrl: "data:image/png;base64,..." } or { ok: false, error: "..." }
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "THREADVIEW_FETCH_IMAGE") return false;

  const url = message.url;
  if (!url || typeof url !== "string") {
    sendResponse({ ok: false, error: "Missing or invalid url" });
    return false;
  }
  // Safety: only fetch from mail.google.com.
  if (!/^https:\/\/mail\.google\.com\//i.test(url)) {
    sendResponse({ ok: false, error: "URL is not on mail.google.com" });
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  fetch(url, { credentials: "include", redirect: "follow", signal: controller.signal })
    .then(async (res) => {
      clearTimeout(timeoutId);
      if (!res.ok) {
        sendResponse({ ok: false, error: `HTTP ${res.status} ${res.statusText}` });
        return;
      }
      const blob = await res.blob();
      // Cap at 10 MB to avoid runaway base64 expansion in the message channel.
      if (blob.size > 10 * 1024 * 1024) {
        sendResponse({ ok: false, error: `Image too large (${blob.size} bytes)` });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => sendResponse({ ok: true, dataUrl: reader.result });
      reader.onerror = () => sendResponse({ ok: false, error: "FileReader error" });
      reader.readAsDataURL(blob);
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      sendResponse({ ok: false, error: String(err), name: err && err.name });
    });

  return true;
});
