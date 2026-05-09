// inject.js
//
// Content script. Runs in Gmail's tab on every load (`document_idle`).
// Mounts a floating ThreadView button inside an isolated Shadow DOM root
// so Gmail's CSS cannot interfere with us and our CSS cannot interfere with
// Gmail.
//
// The button is intentionally always visible (does not appear/disappear
// based on whether a thread is open). The "no thread open" case is handled
// by the viewer page rendering a friendly message — keeps the content
// script's responsibility tiny.
//
// IMPORTANT: content scripts in MV3 cannot use ES module `import`. We
// manually inline the small amount of helper logic we need rather than
// adding a bundler. The same logic exists as a pure module under
// src/lib/extractContext.js for the viewer page to use.

(() => {
  // Avoid double-injecting if Gmail does an internal navigation that
  // re-triggers our content script.
  const MOUNT_ATTR = "data-threadview-mounted";
  if (document.documentElement.hasAttribute(MOUNT_ATTR)) return;
  document.documentElement.setAttribute(MOUNT_ATTR, "true");

  // ---- Helpers (inlined from src/lib/extractContext.js) ----
  // Keep these in sync with the module if you change anything.

  function readAccountIndex(pathname) {
    const m = pathname && pathname.match(/\/mail\/u\/(\d+)\b/);
    return m ? Number(m[1]) : 0;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect) return false;
    return rect.width > 0 && rect.height > 0;
  }

  function visibleArea(el) {
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!rect) return 0;
    return rect.width * rect.height;
  }

  function readPermthidFromDom(doc) {
    if (!doc) return null;

    // Pick the [data-thread-perm-id] element that is currently rendered and
    // taking visible viewport area. Gmail's SPA leaves stale DOM nodes from
    // previously-open threads in the document after switching; they're
    // hidden or zero-area. Visibility filtering disambiguates the open
    // thread from ghosts. Fixes: search → click different thread → ThreadView
    // would open the previously-open thread instead of the new one.
    const all = Array.from(doc.querySelectorAll("[data-thread-perm-id]"));
    const visible = all.filter(isVisible);

    if (visible.length === 1) {
      const v = visible[0].getAttribute("data-thread-perm-id");
      if (v && /^thread-/.test(v)) return v;
    }
    if (visible.length > 1) {
      const inMain = visible.filter((el) => el.closest('[role="main"]'));
      const pool = inMain.length > 0 ? inMain : visible;
      pool.sort((a, b) => visibleArea(b) - visibleArea(a));
      const v = pool[0].getAttribute("data-thread-perm-id");
      if (v && /^thread-/.test(v)) return v;
    }

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

  function readIkFromDom(doc) {
    if (!doc) return null;

    // 1) Resource timing API — every recent network request URL is here,
    // and Gmail's XHRs all carry ?ik=... This is the most reliable source
    // because it works even when Gmail's UI state doesn't surface ik in
    // any DOM element.
    try {
      const win = doc.defaultView || window;
      if (win && win.performance && typeof win.performance.getEntriesByType === "function") {
        const entries = win.performance.getEntriesByType("resource");
        for (const e of entries) {
          const m = e && e.name && e.name.match(/[?&]ik=([A-Za-z0-9]+)/);
          if (m) return m[1];
        }
      }
    } catch (_) { /* fall through */ }

    // 2) <img src="...?ik=...">
    const img = doc.querySelector("img[src*='ik=']");
    if (img) {
      const src = img.getAttribute("src") || "";
      const m = src.match(/[?&]ik=([A-Za-z0-9]+)/);
      if (m) return m[1];
    }

    // 3) Form input named ik.
    const input = doc.querySelector("input[name='ik']");
    if (input && input.value) return input.value;

    // 4) Anchor href with ?ik=...
    const link = doc.querySelector("a[href*='ik=']");
    if (link) {
      const href = link.getAttribute("href") || "";
      const m = href.match(/[?&]ik=([A-Za-z0-9]+)/);
      if (m) return m[1];
    }

    // 5) <link href="...?ik=...">
    const lnk = doc.querySelector("link[href*='ik=']");
    if (lnk) {
      const href = lnk.getAttribute("href") || "";
      const m = href.match(/[?&]ik=([A-Za-z0-9]+)/);
      if (m) return m[1];
    }

    // 6) Last-resort full attribute scan.
    const all = doc.querySelectorAll("*");
    for (const el of all) {
      for (const attr of el.attributes) {
        const m = attr.value && attr.value.match(/[?&]ik=([A-Za-z0-9]+)/);
        if (m) return m[1];
      }
    }

    // 7) Script literals.
    const scripts = doc.querySelectorAll("script");
    for (const s of scripts) {
      const t = s.textContent || "";
      const m = t.match(/['"]ik['"]\s*:\s*['"]([A-Za-z0-9]+)['"]/);
      if (m) return m[1];
    }

    return null;
  }

  function readContext() {
    const accountIndex = readAccountIndex(window.location.pathname);
    const permthid = readPermthidFromDom(document);
    const ik = readIkFromDom(document);
    if (!permthid || !ik) return { accountIndex, ik, permthid, ok: false };
    return { accountIndex, ik, permthid, ok: true };
  }

  // ---- Mount the floating button ----

  const host = document.createElement("div");
  host.id = "threadview-host";
  // Reset the host element so it inherits nothing visible; the Shadow Root
  // owns all visible styles.
  host.style.all = "initial";
  document.body.appendChild(host);

  const root = host.attachShadow({ mode: "open" });

  // Inject our stylesheet into the shadow root.
  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = chrome.runtime.getURL("src/content/inject.css");
  root.appendChild(styleLink);

  const btn = document.createElement("button");
  btn.className = "tv-fab";
  btn.type = "button";
  btn.setAttribute("aria-label", "Open thread in ThreadView");
  btn.title = "Open this thread in ThreadView";

  const icon = document.createElement("span");
  icon.className = "tv-icon";
  icon.setAttribute("aria-hidden", "true");
  btn.appendChild(icon);

  const label = document.createElement("span");
  label.textContent = "ThreadView";
  btn.appendChild(label);

  root.appendChild(btn);

  btn.addEventListener("click", async () => {
    const ctx = readContext();

    // Always log so PoC step 3 is verifiable from DevTools console.
    console.log("[ThreadView] click context:", ctx);

    try {
      await chrome.runtime.sendMessage({
        type: "THREADVIEW_OPEN",
        ctx,
      });
    } catch (err) {
      // The service worker may have shut down; sendMessage triggers a wake.
      // If it still fails, log so the user can see it in DevTools.
      console.warn("[ThreadView] sendMessage failed:", err);
    }
  });
})();
