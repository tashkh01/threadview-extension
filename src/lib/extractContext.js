// extractContext.js
//
// Pure helpers for reading the Gmail tab's location/DOM and producing the
// {accountIndex, ik, permthid} tuple needed to build a print-view URL.
//
// Centralizing this here means:
//   - The content script stays small and stupid.
//   - When Gmail eventually changes one of these surfaces, only this file
//     needs an update.
//   - Each function is testable with a fake Location/Document.

/**
 * Read the account index from a Gmail URL pathname.
 * Gmail URLs look like: /mail/u/0/#inbox  or  /mail/u/2/#inbox/abc
 * Returns the integer N or 0 as a default.
 */
export function readAccountIndex(pathname) {
  const m = pathname && pathname.match(/\/mail\/u\/(\d+)\b/);
  return m ? Number(m[1]) : 0;
}

/**
 * Read the permthid (permanent thread id) from a Gmail URL hash.
 * Gmail URL when a thread is open looks like:
 *   #inbox/FMfcgzQbgHnXVZTbNzGckhnqTLpNmtPQ
 *   #label/Foo/FMfcgz...
 *   #search/foo/FMfcgz...
 *   #all/FMfcgz...
 *
 * The thread id is the segment after the last slash, when present and when
 * it looks like a Gmail-style id (long alphanumeric). Returns null if there
 * is no thread open.
 *
 * NOTE: Gmail's hash thread id is the "modern" form. Gmail's print URL
 * however expects a "permthid" of the shape `thread-f:<digits>`. We read the
 * canonical id straight from the live DOM in `readPermthid` below. This
 * function is a fallback / sanity check only.
 */
export function readHashThreadId(hash) {
  if (!hash) return null;
  const stripped = hash.replace(/^#/, "");
  const parts = stripped.split("/");
  const last = parts[parts.length - 1];
  // Gmail thread ids in the URL hash are long alphanumeric strings (>= 16 chars).
  if (!last || last.length < 16 || !/^[A-Za-z0-9_-]+$/.test(last)) return null;
  return last;
}

/**
 * Read the canonical permthid (`thread-f:<digits>`) by inspecting the DOM.
 *
 * Gmail decorates many elements with thread IDs:
 *   - <span data-thread-id="#thread-f:1864640062651273503">  (every thread row in the list)
 *   - <h2 data-thread-perm-id="thread-f:...">                (sometimes; less reliable)
 *
 * Multiple `data-thread-id` elements are present at any time (one per thread
 * in the visible inbox/list pane). To pick the OPEN thread, we use the URL
 * hash as a tiebreaker: Gmail's modern URL shape is `#inbox/<modernId>` where
 * <modernId> is also exposed on the open thread's row via `data-legacy-last-message-id`
 * or by being the only thread whose row has `aria-expanded="true"`. Failing all
 * of that, we fall back to the H2 within the open conversation.
 *
 * Strategy:
 *   1) If <h2 data-thread-perm-id="thread-f:..."> exists and is visible, use it.
 *      H2 with that attribute is only rendered for the OPEN conversation.
 *   2) Else look for [data-legacy-thread-id] within the open conversation pane.
 *   3) Else fall back to the FIRST data-thread-id element whose value starts
 *      with "#thread-f:". This is least reliable -- it may pick a list row.
 *
 * Returns null if no thread appears to be open.
 */
export function readPermthidFromDom(doc) {
  if (!doc) return null;

  // Pick the [data-thread-perm-id] element that is currently rendered and
  // taking visible viewport area. Gmail's SPA leaves stale DOM nodes from
  // previously-open threads in the document for a while after switching;
  // they're hidden (display:none) or zero-area. Filtering by visibility
  // disambiguates the open thread from the ghost(s) of older threads.
  // Symptom this fixes: searching → clicking a different thread in results
  // → ThreadView would open the previously-open thread, not the new one.
  const all = Array.from(doc.querySelectorAll("[data-thread-perm-id]"));
  const visible = all.filter(isVisible);

  if (visible.length === 1) {
    const v = visible[0].getAttribute("data-thread-perm-id");
    if (v && /^thread-/.test(v)) return v;
  }
  if (visible.length > 1) {
    // Prefer the one inside [role="main"] (Gmail's reading region). If
    // multiple still match, pick the one with the largest visible area —
    // that's the rendered thread, not a partially-painted ghost.
    const inMain = visible.filter((el) => el.closest('[role="main"]'));
    const pool = inMain.length > 0 ? inMain : visible;
    pool.sort((a, b) => visibleArea(b) - visibleArea(a));
    const v = pool[0].getAttribute("data-thread-perm-id");
    if (v && /^thread-/.test(v)) return v;
  }

  // Fallback for cases where data-thread-perm-id isn't surfaced at all (rare):
  // try data-legacy-thread-id, then data-thread-id="#thread-f:..." with the
  // same visibility-based disambiguation.
  const legacy = doc.querySelector("[data-legacy-thread-id]");
  if (legacy) {
    const v = legacy.getAttribute("data-legacy-thread-id");
    if (v && /^\d+$/.test(v)) return `thread-f:${v}`;
  }

  const candidates = Array.from(doc.querySelectorAll("[data-thread-id^='#thread-f:']"));
  const visibleCandidates = candidates.filter(isVisible);
  const pool = visibleCandidates.length > 0 ? visibleCandidates : candidates;
  if (pool.length === 1) {
    return pool[0].getAttribute("data-thread-id").replace(/^#/, "");
  }
  if (pool.length > 1) {
    const inMain = pool.filter((el) => el.closest('[role="main"]'));
    const finalPool = inMain.length > 0 ? inMain : pool;
    finalPool.sort((a, b) => visibleArea(b) - visibleArea(a));
    return finalPool[0].getAttribute("data-thread-id").replace(/^#/, "");
  }

  return null;
}

function isVisible(el) {
  if (!el || el.offsetParent === null) {
    // offsetParent is null for display:none elements and those with a
    // display:none ancestor. (Note: `position:fixed` elements have null
    // offsetParent too, but we don't expect Gmail to put thread containers
    // there.) Fall through to the rect check anyway as a safety net.
  }
  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (!rect) return false;
  return rect.width > 0 && rect.height > 0;
}

function visibleArea(el) {
  const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
  if (!rect) return 0;
  return rect.width * rect.height;
}

/**
 * Read Gmail's per-session inbox key (`ik`).
 *
 * STRATEGY ORDER MATTERS — earlier approaches are more reliable.
 *
 * 1. performance.getEntriesByType('resource') — every network request the page
 *    has ever made is recorded here, including their full URLs. Gmail's XHRs
 *    all carry `ik=...` so this is the most reliable source. Available to
 *    content scripts via the injected document's global. (Verified 2026-05-09:
 *    DOM-based selectors returned NOTHING in some Gmail UI states; this
 *    approach found `ik` immediately.)
 *
 * 2. <img src="...?ik=...">, <a href="...?ik=...">, <link href="...?ik=...">,
 *    <input name="ik"> — DOM-based fallbacks. Work in some Gmail UI states
 *    but not all.
 *
 * 3. Full-document attribute scan + script literals — last-resort exhaustive
 *    fallbacks.
 *
 * NOTE: window.GLOBALS in Gmail's page world contains ik, but we cannot read
 * it from a content script's isolated world. Use the resource timing API
 * instead (which is available on the same `window` object content scripts see).
 */
export function readIkFromDom(doc) {
  if (!doc) return null;

  // Approach 1: resource timing entries.
  // doc.defaultView is the content script's view of the Gmail window. Its
  // `performance` API includes resource timing entries for every fetch /
  // XHR / image / script the page has loaded, with full URL.
  try {
    const win = doc.defaultView;
    if (win && win.performance && typeof win.performance.getEntriesByType === "function") {
      const entries = win.performance.getEntriesByType("resource");
      for (const e of entries) {
        const m = e && e.name && e.name.match(/[?&]ik=([A-Za-z0-9]+)/);
        if (m) return m[1];
      }
    }
  } catch (_) { /* fall through */ }

  // Approach 2a: <img src="...?ik=...">
  const img = doc.querySelector("img[src*='ik=']");
  if (img) {
    const src = img.getAttribute("src") || "";
    const m = src.match(/[?&]ik=([A-Za-z0-9]+)/);
    if (m) return m[1];
  }

  // Approach 2b: form input named ik.
  const input = doc.querySelector("input[name='ik']");
  if (input && input.value) return input.value;

  // Approach 2c: anchor href with ?ik=...
  const link = doc.querySelector("a[href*='ik=']");
  if (link) {
    const href = link.getAttribute("href") || "";
    const m = href.match(/[?&]ik=([A-Za-z0-9]+)/);
    if (m) return m[1];
  }

  // Approach 2d: <link href="...?ik=...">
  const lnk = doc.querySelector("link[href*='ik=']");
  if (lnk) {
    const href = lnk.getAttribute("href") || "";
    const m = href.match(/[?&]ik=([A-Za-z0-9]+)/);
    if (m) return m[1];
  }

  // Approach 3a: full-document attribute scan.
  const all = doc.querySelectorAll("*");
  for (const el of all) {
    for (const attr of el.attributes) {
      const m = attr.value && attr.value.match(/[?&]ik=([A-Za-z0-9]+)/);
      if (m) return m[1];
    }
  }

  // Approach 3b: inline <script> tag contents.
  const scripts = doc.querySelectorAll("script");
  for (const s of scripts) {
    const t = s.textContent || "";
    const m = t.match(/['"]ik['"]\s*:\s*['"]([A-Za-z0-9]+)['"]/);
    if (m) return m[1];
  }

  return null;
}

/**
 * Compose the full context tuple. Returns null if any required piece is
 * missing (most commonly: no thread open).
 */
export function readContext(loc, doc) {
  const accountIndex = readAccountIndex(loc.pathname);
  const permthid = readPermthidFromDom(doc) || (() => {
    // Fallback: if we found a hash id but no DOM permthid, that means
    // the user may have just navigated and Gmail hasn't fully painted yet.
    // Returning null here causes a clean "no thread open" message rather
    // than a malformed fetch.
    return null;
  })();
  const ik = readIkFromDom(doc);

  if (!permthid || !ik) return null;
  return { accountIndex, ik, permthid };
}
