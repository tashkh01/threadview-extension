// renderBody.js
//
// Take a raw `bodyHtml` string from the parsed thread and produce a sanitized
// DocumentFragment ready to insert into the reading UI.
//
// Two responsibilities:
//   1. SECURITY — strip <script>, on*= event handlers, javascript: URLs, etc.
//      Email HTML can come from anywhere; treat it as untrusted.
//   2. READABILITY — collapse quoted history into a click-to-expand block.
//      Identifies quoted regions via three known shapes:
//        a) Gmail's compose-style: <blockquote class="gmail_quote">
//        b) Gmail's print-marker:  <font size=1 color=#888888>[Quoted text hidden]</font>
//        c) Outlook reply chain:   <div id="...mail-editor-reference-message-container">
//        d) Outlook divRplyFwdMsg: <div id="...divRplyFwdMsg">
//        e) Inline forwarded:      lines starting with "From: ..." inside a div
//
// Returns: { fragment: DocumentFragment, quotedCount: number }
//
// NOTE: this is intentionally a small, allowlist-style sanitizer. We don't
// pull in a heavy library (DOMPurify) for v0.2. If we later add features
// that require trusting more of the email HTML (e.g. CSS rendering), we
// should switch to DOMPurify.

const ALLOWED_TAGS = new Set([
  "A", "ABBR", "ADDRESS", "AREA", "ARTICLE", "ASIDE", "AUDIO", "B", "BDI",
  "BDO", "BLOCKQUOTE", "BR", "BUTTON", "CAPTION", "CITE", "CODE", "COL",
  "COLGROUP", "DATA", "DD", "DEL", "DETAILS", "DFN", "DIV", "DL", "DT", "EM",
  "FIELDSET", "FIGCAPTION", "FIGURE", "FONT", "FOOTER", "H1", "H2", "H3",
  "H4", "H5", "H6", "HEADER", "HR", "I", "IMG", "INS", "KBD", "LABEL",
  "LEGEND", "LI", "MAIN", "MARK", "NAV", "OL", "P", "PRE", "Q", "S", "SAMP",
  "SECTION", "SMALL", "SPAN", "STRONG", "SUB", "SUMMARY", "SUP", "TABLE",
  "TBODY", "TD", "TFOOT", "TH", "THEAD", "TIME", "TR", "U", "UL", "VAR",
  "WBR",
]);

// Attributes we allow on any element. Style is allowed but URL values inside
// it are not vetted; we drop `expression(...)` and `javascript:` patterns
// defensively below.
const ALLOWED_ATTRS = new Set([
  "align", "alt", "border", "cellpadding", "cellspacing", "class", "colspan",
  "dir", "height", "href", "lang", "rel", "rowspan", "size", "src", "style",
  "target", "title", "type", "valign", "width",
]);

const URL_ATTRS = new Set(["href", "src"]);

// ---- Public API ----
//
// renderBody(bodyHtml, opts) — opts:
//   gmailBase: string  (e.g. "https://mail.google.com/mail/u/1/")
//     If provided, relative <img src> URLs in the print HTML (which all start
//     with "?ui=2&ik=...") are rewritten to absolute Gmail URLs. The viewer
//     is then expected to fetch those images via the background worker
//     (because the viewer page is chrome-extension:// origin and lacks the
//     Gmail session cookies needed to fetch attachment images directly).
//
//   fetchImage: async (url) => string|null
//     Optional. If provided, every absolute Gmail-attachment image URL
//     (matching mail.google.com with view=fimg or attid=) is replaced with
//     a data: URL produced by this function. If the function resolves to
//     null/throws, the image keeps its original src (which will likely
//     fail to load — the user just sees the alt text).
export function renderBody(bodyHtml, opts) {
  opts = opts || {};
  const doc = new DOMParser().parseFromString(`<div id="root">${bodyHtml || ""}</div>`, "text/html");
  const root = doc.getElementById("root");

  // 1. Sanitize.
  sanitize(root);

  // 2. Rewrite relative <img src> URLs to absolute Gmail URLs.
  if (opts.gmailBase) {
    rewriteImageSrcs(root, opts.gmailBase);
  }

  // 3. Collapse quoted history.
  const quotedCount = collapseQuoted(root);

  // 4. Asynchronously fetch attachment images and replace them with data URLs.
  // We do this AFTER the fragment is returned, so the UI shows immediately
  // and images fill in as they load.
  const imagePromise = opts.fetchImage
    ? hydrateImages(root, opts.fetchImage)
    : Promise.resolve(0);

  // 5. Move root's children into a real DocumentFragment for insertion.
  const frag = document.createDocumentFragment();
  while (root.firstChild) frag.appendChild(root.firstChild);

  return { fragment: frag, quotedCount, imagePromise };
}

// Rewrite relative <img src> values to absolute Gmail URLs.
function rewriteImageSrcs(root, gmailBase) {
  // Normalize gmailBase so it ends with "/".
  const base = gmailBase.endsWith("/") ? gmailBase : gmailBase + "/";

  for (const img of root.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src") || "";
    // Already absolute? Leave it alone.
    if (/^(?:https?:|data:|cid:|chrome-extension:|\/\/)/i.test(src)) continue;
    // Gmail's print HTML uses "?ui=2&ik=...&view=fimg&th=..." — no leading "/".
    // Resolve against the Gmail base. URL constructor handles "?..." correctly.
    try {
      const abs = new URL(src, base).toString();
      img.setAttribute("src", abs);
    } catch (_) { /* leave as-is */ }
  }
}

// For each Gmail-attachment <img>, ask the host to fetch it and replace src
// with a data: URL. Returns a promise that resolves with the count of images
// successfully hydrated. The fragment is already in the live DOM by the time
// this runs (the host appends it before awaiting), so updates are visible.
async function hydrateImages(root, fetchImage) {
  const imgs = Array.from(root.querySelectorAll("img[src]"));
  const targets = imgs.filter((img) => {
    const src = img.getAttribute("src") || "";
    return /mail\.google\.com\/.+\b(view=fimg|disp=emb|attid=)/i.test(src);
  });

  if (targets.length === 0) return 0;

  let hydrated = 0;
  await Promise.all(
    targets.map(async (img) => {
      const original = img.getAttribute("src");
      try {
        const dataUrl = await fetchImage(original);
        if (dataUrl) {
          img.setAttribute("src", dataUrl);
          hydrated++;
        }
      } catch (err) {
        console.warn("[ThreadView] image fetch failed:", original, err);
      }
    }),
  );
  return hydrated;
}

// ---- Sanitizer ----

function sanitize(root) {
  // Walk depth-first. Use a stack to avoid live-NodeList issues during removal.
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName;

    // Tag allowlist.
    if (!ALLOWED_TAGS.has(tag)) {
      // Replace the node with its children, so we strip <script>/<style>/etc
      // but keep their text content collapsed (which will be empty for those).
      // For block-level tags we don't want to lose, this preserves text.
      const parent = node.parentNode;
      if (parent) {
        // For <script> / <style> / <iframe> we want to drop entirely.
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" ||
            tag === "OBJECT" || tag === "EMBED" || tag === "FORM" ||
            tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
            tag === "META" || tag === "LINK") {
          parent.removeChild(node);
        } else {
          // Unwrap: replace with its children so inner content survives.
          while (node.firstChild) parent.insertBefore(node.firstChild, node);
          parent.removeChild(node);
        }
      }
      continue;
    }

    // Attribute allowlist + URL scheme filter.
    const attrs = Array.from(node.attributes);
    for (const a of attrs) {
      const name = a.name.toLowerCase();
      // Strip on* event handlers.
      if (name.startsWith("on")) { node.removeAttribute(a.name); continue; }
      // Strip data-* (often safe, but huge in Gmail; drops bytes).
      // Keep this: we want stable hooks for the quoted-text collapser later.
      if (!ALLOWED_ATTRS.has(name) && !name.startsWith("data-")) {
        node.removeAttribute(a.name);
        continue;
      }
      // URL safety: only http(s), mailto, tel, cid, and protocol-relative.
      if (URL_ATTRS.has(name)) {
        const val = (a.value || "").trim();
        if (!isSafeUrl(val)) {
          node.removeAttribute(a.name);
          continue;
        }
        // Make external links open in new tab + drop referrer.
        if (name === "href" && tag === "A" && /^https?:/i.test(val)) {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      }
      // Style safety: drop expression() and url(javascript:...) patterns.
      if (name === "style") {
        const val = (a.value || "");
        if (/expression\s*\(/i.test(val) || /url\s*\(\s*['"]?\s*javascript:/i.test(val)) {
          node.removeAttribute(a.name);
        }
      }
    }

    // Recurse into children. Snapshot first because we may have mutated.
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }
}

function isSafeUrl(url) {
  if (!url) return false;
  // Allow same-page fragment, mailto:, tel:, cid: (inline-image references),
  // protocol-relative //..., relative paths (starting with /, ./, ../, or
  // simply alphanumeric), and http(s).
  if (/^#/.test(url)) return true;
  if (/^mailto:/i.test(url)) return true;
  if (/^tel:/i.test(url)) return true;
  if (/^cid:/i.test(url)) return true;
  if (/^https?:/i.test(url)) return true;
  if (/^\/\//.test(url)) return true;
  if (/^\//.test(url)) return true;
  if (/^\.\.?\//.test(url)) return true;
  // Block javascript:, data:, vbscript:, file:, etc.
  if (/^[a-z][a-z0-9+\-.]*:/i.test(url)) return false;
  // Otherwise treat as a relative URL — allow it.
  return true;
}

// ---- Quoted-history collapser ----

function collapseQuoted(root) {
  let count = 0;

  // Strategy: find each top-level "quoted region" and wrap it in a
  // <details>-style toggle. We find them by selectors below; the order
  // matters because some Gmail emails contain Outlook chains and vice versa.
  const selectors = [
    'blockquote.gmail_quote',
    'div[id^="m_"][id*="mail-editor-reference-message-container"]',
    'div[id*="divRplyFwdMsg"]',
    'div.gmail_quote',
  ];

  const found = new Set();
  for (const sel of selectors) {
    for (const el of root.querySelectorAll(sel)) {
      // Skip if already inside another already-found quoted block — we want
      // the outermost quoted region, not nested ones.
      let isNested = false;
      for (const existing of found) {
        if (existing !== el && existing.contains(el)) { isNested = true; break; }
      }
      if (isNested) continue;
      found.add(el);
    }
  }

  for (const el of found) {
    // If the visible content OUTSIDE the quoted region is essentially empty
    // (e.g. a pure forward where the entire body is one big gmail_quote),
    // collapsing the quote leaves the user with nothing to read. In that
    // case expand the quote by default so the message content is visible.
    const visibleText = nonQuotedText(root, el);
    const expandByDefault = visibleText.length < 40;
    wrapAsQuoted(el, expandByDefault);
    count++;
  }

  // Special case: Gmail's print template marks Gmail-app-collapsed quotes
  // as <font size=1 color=#888888>[Quoted text hidden]</font>. These are
  // already-collapsed by Gmail; replace them with our toggle (with no
  // content to expand, since Gmail already hid it).
  for (const font of root.querySelectorAll("font")) {
    const txt = (font.textContent || "").trim();
    if (txt === "[Quoted text hidden]") {
      const placeholder = document.createElement("div");
      placeholder.className = "tv-quoted";
      placeholder.innerHTML =
        '<button type="button" class="tv-quoted-toggle" disabled title="Gmail already hid this content">' +
        '[Quoted text hidden by Gmail]</button>';
      font.parentNode.replaceChild(placeholder, font);
      count++;
    }
  }

  return count;
}

// Compute the text content of `root` minus the text inside `quotedEl`.
// Used to decide whether collapsing the quote would leave the body empty.
function nonQuotedText(root, quotedEl) {
  const rootText = collapseSpaces(root.textContent || "");
  const quotedText = collapseSpaces(quotedEl.textContent || "");
  // Subtract by simple length difference — close enough for the threshold check.
  // We don't need a precise diff; we only care "is there meaningful prose outside the quote?"
  if (rootText.length <= quotedText.length) return "";
  return rootText.slice(0, rootText.length - quotedText.length).trim();
}

function collapseSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function wrapAsQuoted(el, expandByDefault) {
  const wrapper = document.createElement("div");
  wrapper.className = "tv-quoted";
  if (!expandByDefault) wrapper.setAttribute("hidden-quote", "");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tv-quoted-toggle";
  toggle.textContent = expandByDefault ? "Hide quoted history ▴" : "Show quoted history ▾";
  toggle.addEventListener("click", () => {
    const isHidden = wrapper.hasAttribute("hidden-quote");
    if (isHidden) {
      wrapper.removeAttribute("hidden-quote");
      toggle.textContent = "Hide quoted history ▴";
    } else {
      wrapper.setAttribute("hidden-quote", "");
      toggle.textContent = "Show quoted history ▾";
    }
  });

  const content = document.createElement("div");
  content.className = "tv-quoted-content";

  // Move the original quoted element into our content wrapper.
  el.parentNode.insertBefore(wrapper, el);
  content.appendChild(el);
  wrapper.appendChild(toggle);
  wrapper.appendChild(content);
}
