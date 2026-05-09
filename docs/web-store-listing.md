# Chrome Web Store listing copy — ThreadView v1.0

This is the source-of-truth Markdown for the Web Store submission. When you
fill in the dev console form, copy each section verbatim from here. Keeping
the listing copy in version control means future updates can be diffed and
reviewed instead of typed live into a web form.

Submission target date: when icons + screenshots + Vercel site are all live.

---

## Field-by-field

### Name (45 char max)

```
ThreadView — A reader for Gmail
```

(31 chars. Leaves headroom and reads cleanly in install dialogs.)

### Summary (132 char max — single line below the name in store listings)

```
Open any Gmail thread in a clean, distraction-free reading view. Sanitized HTML, collapsed quotes, no data leaves your browser.
```

(127 chars.)

### Category

```
Productivity
```

(Best fit. Communication is also valid but Productivity has higher install
rates for Gmail tools, per a quick scan of comparable extensions.)

### Language

```
English (United States)
```

### Description (16,000 char max)

The description is the longest free-form field. Structure: hook → features
→ privacy → how it works → limitations → roadmap. Keeps reviewers and
end-users on the same page.

```
ThreadView opens any Gmail conversation in a clean, distraction-free
reading view. No sidebar. No labels. No chat panel. Just the thread,
formatted for reading.

Click the floating ThreadView button on any Gmail tab; the open thread
appears in a new tab as a stack of clean message cards with reading-tuned
typography. Quoted history collapses. Inline images load. Recipients fold
into a single line. The UI chrome is gone.


WHAT IT DOES

• Sanitized HTML rendering. The sender's inline styles, fonts, and tables
  are stripped so the thread reads in your typography, not theirs.

• Collapsed quoted history. A reply with five rounds of quoted text shows
  only what's new — with a "Show quoted history" toggle for when you do
  want the chain. Pure forwards expand by default so you actually see the
  forwarded content.

• Inline images. Authenticated image fetches use the same Gmail session you
  used to read your inbox. Nothing is uploaded; nothing is proxied through
  a third-party server.

• Reading-width control. Three preset widths (Medium / Wide / X Wide) let
  you tune the reading column to your monitor. Your choice persists across
  threads.

• Search-result safe. Open a thread, search Gmail, click a different
  thread — ThreadView opens the new thread, not the previous one. (Yes,
  that bug existed; it's fixed.)

• Multi-account aware. Each Gmail tab carries its own account index in
  its URL; ThreadView reads it on every click.


PRIVACY (the short version)

ThreadView does not store, transmit, or share any data. There is no
backend. No analytics. No telemetry. No third-party services. The
extension fetches Gmail's own server-rendered print template using your
existing browser session and renders it in a new tab on your machine.
That's it.

Two permissions are requested:

• host_permissions on mail.google.com — required to fetch Gmail's
  print-view HTML using your existing browser session.

• storage — used only to remember your reading-width preference and a
  one-time install timestamp. Stored locally; never transmitted.

No tabs permission. No cookies permission. No activeTab. No identity. No
clipboard. No remote network destinations.

Full privacy policy: https://threadview.app/privacy


HOW IT WORKS (under the hood)

The "obvious" Gmail extension reads Gmail's rendered DOM and re-renders
it. That's a maintenance treadmill — Gmail's class names rotate, the SPA
virtualizes messages, and quoted-reply boundaries can't be cleanly
recovered.

The "right but heavy" path uses Gmail's REST API. That requires OAuth, a
Google Cloud project, app verification, and a CASA security audit to ship
past ~100 users.

ThreadView takes a third path: Gmail itself exposes a stable,
server-rendered HTML view of any thread at the same URL Gmail's own Print
button uses (?view=pt). The extension's background service worker
fetches that URL using your existing browser session, parses the HTML
once, and renders it through a sanitizing reader. No OAuth. No Google
verification. No API quotas.


KNOWN LIMITATIONS

• Tested with Gmail's "No split" reading-pane setting. Right-of-inbox and
  Below-inbox modes may work but are not officially supported.

• Read-only. ThreadView does not send, archive, label, or modify any
  email — it has no Gmail write access.

• One thread at a time. No background indexing or batch operations.

• ThreadView depends on Google keeping Gmail's print-view template
  accessible. The template has been stable for years but is not a
  documented API. If Google removes it, the extension breaks until
  patched.


ROADMAP (gated on user demand)

• Saved reading positions across sessions.
• Dark mode reading theme.
• Exportable archives (PDF or Markdown).
• Right-of-inbox reading-pane support.


SOURCE & CONTACT

ThreadView is open source under the MIT license. Source code:
https://github.com/tashkh01/threadview-extension

Privacy or feature requests: threadview@betterwayiq.com
```

When submitting, remember to:
- Replace `[OWNER]` placeholder with the actual GitHub username.
- Add the real Web Store install URL to the marketing site's "Install" button only AFTER approval (the chicken-and-egg: the listing has to exist before you can link to it).

### Permissions justifications

Required form fields. Each permission needs a one-line justification.
Reviewers read these carefully for Gmail-touching extensions.

**`host_permissions: https://mail.google.com/*`**

```
Required to fetch Gmail's print-view HTML using the user's existing browser session. This is the core function of the extension — without this permission, no thread can be read. ThreadView does not request access to any other domain.
```

**`storage`**

```
Used to remember the user's reading-width preference (Medium / Wide / X Wide) across viewer tabs and a one-time installation timestamp. Stored only in chrome.storage.local; never transmitted off the user's machine.
```

### Single-purpose justification

Required form field. Web Store policy mandates each extension have a single
clear purpose.

```
ThreadView's single purpose is to display Gmail threads in a clean, reading-focused interface. All functionality — the floating button, the viewer page, the sanitizing renderer, the width preset, the inline image hydration — exists to support that single purpose.
```

### Privacy practices certifications

Web Store now asks an explicit set of yes/no questions. Answers for
ThreadView:

| Practice | Answer | Notes |
|---|---|---|
| Does this item collect personally identifiable information? | No | The extension reads Gmail HTML in the user's browser; nothing is collected or transmitted. |
| Does this item collect health information? | No | |
| Does this item collect financial and payment information? | No | |
| Does this item collect authentication information? | No | The user's Gmail session cookies are used by the browser to authenticate the print-view fetch — but the extension does not read, store, or transmit those cookies. |
| Does this item collect personal communications? | No | The extension renders Gmail thread HTML in a tab on the user's machine. The HTML is not stored, transmitted, or shared. |
| Does this item collect location? | No | |
| Does this item collect web history? | No | |
| Does this item collect user activity? | No | No analytics, no telemetry, no logging. |
| Does this item collect website content? | No | (See "personal communications" above. The Gmail HTML is read for rendering only, never stored or transmitted.) |
| Is the data used or transferred for purposes unrelated to the item's core functionality? | No | |
| Is the data used or transferred to determine creditworthiness or for lending purposes? | No | |
| Is the data sold to third parties? | No | |

### URLs for the listing form

| Field | Value |
|---|---|
| Homepage URL | https://threadview.app |
| Support URL | https://threadview.app |
| Privacy policy URL | https://threadview.app/privacy |

### Visibility & Pricing

```
Visibility: Public
Pricing: Free
```

### Distribution regions

```
All regions
```

(No reason to exclude any region for a privacy-respecting reader. Adjust
later if there's a specific reason.)

---

## Asset checklist

What needs to exist before submission:

| Asset | Required? | Spec | Status |
|---|---|---|---|
| Extension ZIP | yes | manifest at root, no dev artifacts | TODO at submission time |
| Icon 16x16 | yes (in manifest) | PNG, transparent background OK | DONE |
| Icon 48x48 | yes (in manifest) | PNG | DONE |
| Icon 128x128 | yes (Web Store) | PNG | DONE |
| Screenshot #1 | yes (min 1) | 1280x800 or 640x400 | TODO |
| Screenshot #2 | optional | 1280x800 or 640x400 | TODO |
| Screenshot #3 | optional | 1280x800 or 640x400 | TODO |
| Screenshot #4 | optional | 1280x800 or 640x400 | TODO |
| Screenshot #5 | optional | 1280x800 or 640x400 | TODO |
| Small promo tile 440x280 | optional but recommended | PNG/JPG | TODO |
| Marquee promo tile 1400x560 | optional | PNG/JPG | NICE-TO-HAVE |

Privacy policy URL must be live and reachable BEFORE submission. Reviewer
will check it. ✅ once Vercel deploy completes.

---

## Submission-day checklist

1. [ ] Pull this listing copy into the Web Store dev console form.
2. [ ] Replace `[OWNER]` placeholder in the description with the real
       GitHub username.
3. [ ] Verify privacy policy URL loads in incognito.
4. [ ] Verify support email (threadview@betterwayiq.com) is configured and
       reachable — send a test message from another address.
5. [ ] Build the extension ZIP. Verify root contains manifest.json directly.
6. [ ] Verify a fresh-profile install of the ZIP works end-to-end.
7. [ ] Upload at least one 1280x800 screenshot (more is better; up to 5).
8. [ ] Upload the 128x128 icon and (if available) the 440x280 small tile.
9. [ ] Fill in permissions justifications and single-purpose justification
       from this file.
10. [ ] Answer the privacy practices certifications honestly.
11. [ ] Set Visibility=Public, Pricing=Free, all regions.
12. [ ] Click Submit for review.
13. [ ] Screenshot the "In review" status as proof.

---

## Pre-written rejection responses

Save time on the back-and-forth dance. If/when the reviewer pushes back,
these are the most likely complaints and the responses you'd send. Adapt
specifics to the actual feedback.

### "Permission scope appears broader than functionality requires"

```
The extension's host permission is scoped to the single domain
mail.google.com, which is necessary because the extension's core function
is reading Gmail thread HTML using the user's existing browser session.
There is no narrower permission that would allow the same functionality:
the activeTab permission would allow access only on user gesture, but the
viewer tab opens at chrome-extension:// origin and would have no way to
authenticate to mail.google.com. The optional_host_permissions API
similarly does not allow authenticated cross-origin fetches. The
mail.google.com host permission is the minimum required permission for
the extension's described functionality.
```

### "Single-purpose policy concerns"

```
ThreadView has a single purpose: display Gmail threads in a clean,
reading-focused interface. Every code path in the extension is in
service of that single purpose. The floating button is the entry point;
the background service worker fetches the thread HTML; the viewer page
parses and renders it; the width preset and inline image hydration are
reading-experience refinements. There is no code path that touches a
non-Gmail domain, no telemetry, no auxiliary feature, and no user-data
storage beyond a reading-width preference and an installation timestamp.
```

### "Privacy policy is missing required disclosures"

```
The privacy policy at https://threadview.app/privacy lists every category
of data the extension reads from the user's browser, where that data is
processed (always locally, in a tab on the user's machine), and where it
is sent (nowhere — the extension makes no outbound network requests
other than to mail.google.com to fetch the thread the user explicitly
requested via the floating button). If specific disclosures are missing,
please indicate which categories of the Privacy Practices Disclosure
form require additional detail and the policy will be updated to address
them.
```

### "Trademark concern (Gmail)"

```
The listing uses "Gmail" descriptively to indicate the service the
extension works with, in line with Google's own guidance for third-party
products that integrate with Gmail. The listing does not claim
endorsement by Google, does not use Gmail logos or branding, and the
extension's name "ThreadView" is original and unrelated to any Google
product. Specific listing language can be revised if any phrase is
flagged as implying endorsement.
```

### "Functionality matches an existing extension"

```
ThreadView is differentiated from existing Gmail-reading extensions by
its no-backend, no-OAuth architecture: it uses Gmail's print-view URL
(the same surface Gmail's own Print button uses) rather than the Gmail
REST API, which lets it operate entirely client-side with no Google
Cloud project, no OAuth flow, and no data ever leaving the user's
browser. The closest comparable extensions in the Gmail-reader category
either require Gmail API access (and the OAuth/CASA process that
implies) or scrape Gmail's live SPA DOM (which is unmaintainable). The
combination of features — collapsed quoted history with smart
auto-expand, sanitized HTML, persisted reading-width preset,
search-result thread disambiguation — does not exist as a single bundle
in any other extension.
```

---

## After approval

The day approval lands:

1. Copy the published Web Store URL.
2. In the marketing site, replace the `href="#"` on the "Install on Chrome
   Web Store" button with the real listing URL. Redeploy to Vercel
   (single-file change; ~20 seconds).
3. Update the extension's GitHub repo README "Install" section to link to
   the published listing.
4. Take one screenshot of the live listing and save it as a launch artifact
   (reference for future "since launch we've grown by..." metrics).

If you want, you can announce on whatever channels you have. Don't rush —
a quiet launch and word-of-mouth is fine for stage-1 free.
