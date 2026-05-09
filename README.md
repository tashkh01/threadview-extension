# ThreadView

> **A reader for Gmail.** A Chrome extension that opens any Gmail conversation
> in a clean, distraction-free reading view. No data leaves your browser.
>
> Marketing site and privacy policy: <https://threadview.app>

---

## What it does

ThreadView gives any Gmail thread a quiet reading view. Click the floating
button on a Gmail tab; the conversation opens in a new tab as a stack of
clean message cards with reading-tuned typography:

- Sanitized HTML bodies (sender's inline styles are stripped so the thread
  reads in your typography, not theirs).
- Quoted history collapsed under a "Show quoted history" toggle, except on
  pure-forward messages where the quote IS the body — in which case it's
  expanded by default.
- Inline images load via the same authenticated browser session you used
  to read your inbox.
- Recipients fold into a single line, expandable on click.
- Three reading widths (Medium / Wide / X Wide) persisted per browser
  profile.

The fetch + parse path goes nowhere except `mail.google.com`. There is no
backend, no analytics, no telemetry, no third-party services.

---

## Why this approach

The "obvious" Gmail extension reads Gmail's rendered DOM and re-renders it.
That path is a maintenance treadmill — Gmail's class names rotate, the SPA
virtualizes messages, and quoted-reply boundaries can't be cleanly recovered.

The "right but heavy" path uses Gmail's REST API. That requires OAuth, a
Google Cloud project, app verification, and a CASA security audit to ship
past ~100 users.

ThreadView takes a third path:

1. Gmail itself exposes a stable, server-rendered HTML view of any thread at
   `https://mail.google.com/mail/u/<N>/?ik=<key>&view=pt&permthid=<id>`.
   This is the same surface Gmail's own Print button uses.
2. The extension's background service worker fetches that URL using the
   user's existing browser session.
3. The viewer page parses that HTML once and renders it through a sanitizing
   reader.

No OAuth. No Google verification. No API quotas. No per-session cost. The
trade-off is a dependency on Google keeping the print-view template
accessible, which has been stable for years but is not a documented API.

---

## Install

### From the Chrome Web Store

[Coming soon at chrome.google.com/webstore — submission in progress.]

### Unpacked (for development)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Select this folder
   (`C:\Users\tkhan\Documents\Claude Code Projects\threadview`).
5. The "ThreadView" extension should appear in the list with no errors.

If you change source files, click the **reload** icon on the ThreadView card
in `chrome://extensions` to pick them up. Content-script changes also
require reloading the Gmail tab.

---

## Use

1. Open Gmail (`https://mail.google.com/`). The blue **ThreadView** button
   appears in the bottom-right corner.
2. Open any conversation (a thread with one or more messages).
3. Click the **ThreadView** button. A new tab opens with the thread
   formatted for reading.

The width preset toggle in the viewer's header (Medium / Wide / X Wide)
remembers your choice for the next thread.

---

## File map

```
threadview/
├── manifest.json              MV3 manifest. Two permissions: storage,
│                              host_permissions on mail.google.com.
├── icons/
│   ├── icon.svg               Source SVG for all three rasters.
│   ├── icon-16.png            Toolbar size.
│   ├── icon-48.png            Extensions list size.
│   └── icon-128.png           Web Store listing size.
├── README.md
├── LICENSE                    MIT.
├── docs/
│   └── planning/HANDOFF_*.md  Session handoff notes for future maintainers.
└── src/
    ├── background/
    │   └── sw.js              Service worker. Three message handlers:
    │                           THREADVIEW_OPEN (creates viewer tab),
    │                           THREADVIEW_FETCH_PRINT (fetches thread HTML),
    │                           THREADVIEW_FETCH_IMAGE (fetches inline images
    │                           as data: URLs). Also records firstLaunchedAt
    │                           on first install.
    ├── content/
    │   ├── inject.js          Floating button mounted in a Shadow DOM root
    │                           on Gmail. Inlines a copy of extractContext
    │                           helpers (MV3 content scripts can't import).
    │                           Keep in sync with src/lib/extractContext.js.
    │   └── inject.css         Floating button styles (Shadow-DOM-isolated).
    ├── viewer/
    │   ├── viewer.html        Reading-view page markup.
    │   ├── viewer.js          Pipeline: read params → fetch via bg →
    │                           parse → render cards. Includes the width
    │                           preset toggle and storage persistence.
    │   └── viewer.css         Reading typography. Width controlled by the
    │                           --tv-reading-width CSS custom property.
    └── lib/
        ├── extractContext.js  Pure helpers for reading Gmail's DOM:
        │                       readAccountIndex, readPermthidFromDom (with
        │                       visibility-based disambiguation for
        │                       search-result threads), readIkFromDom (uses
        │                       performance.getEntriesByType first).
        ├── gmailUrl.js        Builds the print-view URL.
        ├── parsePrintView.js  Parses Gmail's print HTML into a Thread
        │                       object using <table class="message"> as
        │                       the per-message anchor.
        └── renderBody.js      Sanitize + rewrite img URLs + collapse
                                quoted history → DocumentFragment. Allowlist
                                tag/attr filter, scheme filter, async image
                                hydration via fetchImage callback.
```

The file most likely to need maintenance when Google changes anything is
`src/lib/parsePrintView.js`. The rest is structural.

---

## Sharp edges (read this before editing)

These are real bugs that took an hour each to diagnose. Don't re-discover
them.

1. **Gmail's own service worker on `mail.google.com` intercepts every fetch
   to that origin from page contexts.** Direct `fetch()` from the viewer
   (which is `chrome-extension://`) is rejected by Gmail's
   `sw.js?offline_allowed=1` with a network error from `fetchhandler.js`.
   ALL fetches to `mail.google.com` go through the BACKGROUND service
   worker, which Gmail's SW cannot intercept. This is why we have
   `THREADVIEW_FETCH_PRINT` and `THREADVIEW_FETCH_IMAGE` in `sw.js`. Don't
   "simplify" by fetching from the viewer.

2. **`ik` is not always in the DOM.** The reliable source is
   `performance.getEntriesByType('resource')` — every recent Gmail XHR
   carries `ik=` in its URL, and the resource-timing API remembers them.
   `readIkFromDom` tries this first; DOM scans are fallbacks only.

3. **`web_accessible_resources` MUST include `src/content/inject.css`**, not
   just the viewer files. The content script loads its CSS by URL into a
   Shadow DOM, and Chrome treats Shadow DOM as "loaded by a page outside
   the extension." Without WAR, the floating button is invisible because
   its CSS is denied.

4. **Two-step reload after extension changes.** When you change ANY content
   script file (`inject.js`) or any file the content script loads
   (`inject.css`), you must (a) reload the extension at
   `chrome://extensions` AND (b) reload the Gmail tab. Without (b), Gmail
   has the OLD content script running, which throws "Extension context
   invalidated" on every button click. Background-only changes need only
   (a). Viewer-only changes need only (a) + a fresh viewer tab.

5. **Each reply contains the full thread quoted underneath.** The parser
   gives faithful `bodyHtml` per message, which means the same content
   appears N times across N messages. The reading UI handles this by
   collapsing quoted history. A "small" 6-message thread is often 200+ KB
   of HTML.

6. **Print-view URL parameters that work** (verified 2026-05-09):
   `https://mail.google.com/mail/u/<N>/?ik=<key>&view=pt&search=all&permthid=thread-f:<digits>`.
   `permthid` is `thread-f:<digits>` literally; the colon does NOT need to
   be URL-encoded (URLSearchParams encodes it as `%3A` and Gmail accepts
   both forms).

7. **Search-result thread disambiguation.** When a user opens a thread, then
   searches, then opens a different thread from search results, Gmail's
   SPA leaves the previously-open thread's DOM mounted briefly. The
   visibility-based disambiguation in `readPermthidFromDom` filters by
   `getBoundingClientRect()` non-zero area to pick the actually-rendered
   thread.

8. **Auth heuristic, not "From:" string.** The viewer's "did Gmail return
   a thread or a sign-in page" check keys on the structural marker
   `<table class="message">`, not the literal string "From:". Some
   notification-style emails (Upwork, etc.) render the sender label
   without a "From:" prefix, which used to false-positive the old check.

---

## Privacy

ThreadView does not store, transmit, or share any data. All processing
happens locally in your browser. Full policy: <https://threadview.app/privacy>.

The extension requests two permissions:

- **`host_permissions: mail.google.com`** — required to fetch Gmail's
  print-view HTML using your existing browser session.
- **`storage`** — used only for the reading-width preference and a
  one-time installation timestamp.

No `tabs`, no `activeTab`, no `cookies`, no third-party network requests.

---

## Limitations

- **Reading-pane modes:** ThreadView is tested with Gmail's "No split"
  reading-pane setting (Settings → Quick Settings → Reading pane → No split).
  Right-of-inbox and Below-inbox modes may work but are not tested.
- **Read-only.** ThreadView does not send, archive, label, or modify any
  email. (Doing so would require the Gmail REST API.)
- **One thread at a time.** No background indexing, no batch operations.
- **Multi-account note.** `accountIndex` is read per-click from the Gmail
  tab the user is on. Multi-account works because each Gmail tab has its
  own URL.
- **Conversation View off, custom labs:** untested. Likely to need extra
  cases in `extractContext.js`.

---

## Roadmap

These are gated on user demand, not currently in flight:

- Saved reading positions (jump back to where you stopped reading a thread).
- Dark mode reading theme.
- Exportable archives (download a thread as PDF or Markdown).
- Right-of-inbox reading-pane mode support.

---

## License

[MIT](./LICENSE).

---

## Marketing site

The threadview.app marketing site (landing page + privacy policy) lives in
a separate repository: `threadview-site`. It is a static site deployed to
Vercel.
