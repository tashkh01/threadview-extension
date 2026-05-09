Branch: main
HEAD: d242f7f
Open PRs: none
Sibling handoffs: HANDOFF_2026-05-09.md (session 1, the original v0.2 reading-UI handoff)

# ThreadView — handoff 2026-05-09 (submission prep, end of day)

## Context

This is the end-of-day handoff for the Chrome Web Store submission push.
The previous handoff (`HANDOFF_2026-05-09.md`) covered the v0.2 reading UI.
A lot happened since then. Today's session got us 90% of the way to
"Submit for Review" — but the actual click is gated on Google's trader
verification, which is still pending on Google's side.

## TL;DR — what tomorrow's first 30 minutes look like

1. **Check email** for a message from Google's payments / Web Store team
   about trader verification. Subject line is something like "Your account
   is verified" or "Action required for your publisher account."
2. **Run the fresh-profile dry-run install** of `dist/threadview-v1.0.0.zip`
   while Google's email is hopefully arriving. (Steps below.)
3. **If verification cleared:** open the dev console listing →
   <https://chrome.google.com/webstore/devconsole/> → ThreadView item →
   Status tab → click **Submit for Review**.
4. **If verification NOT cleared:** wait. Refresh once a day. Don't poke
   Google's support channels — premature inquiry slows things down.

## What landed today (session 2)

### Live infrastructure

- **<https://threadview.app>** — landing page, served from Vercel.
- **<https://threadview.app/privacy>** — privacy policy.
- **Vercel project:** `tashkh01s-projects/threadview-site`. GitHub-connected;
  every push to `tashkh01/threadview-site:main` auto-deploys.
- **DNS at Namecheap:** A `@` 216.150.1.1 + CNAME `www` 439be95ed5989336.vercel-dns-016.com. + TXT `@` google-site-verification token.
- **Workspace alias:** `threadview@betterwayiq.com` (verified by test mail).

### Repos

- **<https://github.com/tashkh01/threadview-site>** — public, marketing site.
- **<https://github.com/tashkh01/threadview-extension>** — public, the
  extension code. (Originally tried name `threadview` but `tashkh01` had a
  pre-existing private repo with that name from 2026-05-06; left untouched.)
- **<https://github.com/tashkh01/threadview>** (private, untouched) —
  earlier exploration "Pro Thread Workspace." Not deleted; not relevant.

### Web Store dev console

- Account paid ($5), trader-declared, organization profile selected
  (`betterwayIQ`).
- **Trader verification: PENDING with Google.** D&B match failed; Google
  asked for additional documentation. Documents were submitted; awaiting
  Google's review. This is the gating step for Submit-for-Review.
- Publisher display name: `ThreadView`.
- Contact email: `threadview@betterwayiq.com` (verified).
- Item created — extension ID: `lokaloeclbjlhcajmlbikikfoekoihco`.
- All listing form tabs filled and saved:
  - **Store listing:** name "ThreadView — A reader for Gmail", summary,
    description (from `docs/web-store-listing.md`), category Productivity →
    Communication, English (US), 128x128 icon, 3 screenshots uploaded
    (`01-hero-thread.png`, `02-multi-message-thread.png` (NEW today, replaces
    `02-quoted-expanded.png`), `03-forward-auto-expand.png`), homepage URL
    `https://threadview.app`, support URL same.
  - **Privacy:** single-purpose justification pasted, storage justification
    pasted, host-permission justification pasted, "remote code: NO", all 9
    data-usage checkboxes UNCHECKED, three "no" yes/no questions answered,
    privacy policy URL `https://threadview.app/privacy`.
  - **Distribution:** Free, Public visibility, all regions.
  - **Test instructions:** trimmed to 491 chars (form has 500-char cap).
  - **Official URL:** verified in Search Console via TXT record at Namecheap;
    domain claim took ~5 min to propagate. May need a refresh of the dev
    console to make `threadview.app` appear in the dropdown.
- Item-support visibility ON; all 4 notification toggles ON (email + web).

### Source-of-truth files in the extension repo

- `manifest.json` — version 1.0.0, two permissions only (`storage`,
  `host_permissions: mail.google.com`).
- `dist/threadview-v1.0.0.zip` — 37KB submission ZIP, manifest at root,
  no dev artifacts. Built by `build-zip.ps1`.
- `docs/web-store-listing.md` — single source for all listing copy. Field
  values to paste from. Kept in version control. Updated today to lock
  GitHub URL to `tashkh01/threadview-extension`.
- `docs/screenshots/v1/01-hero-thread.png` (1280x800).
- `docs/screenshots/v1/02-multi-message-thread.png` (1280x800, NEW today).
- `docs/screenshots/v1/02-quoted-expanded.png` (1280x800, kept for backup
  but the multi-message version uploaded to Web Store instead).
- `docs/screenshots/v1/03-forward-auto-expand.png` (1280x800).
- `LICENSE` — MIT.
- `README.md` — full v1.0 rewrite, links to threadview.app.
- `build-zip.ps1` — produces `dist/threadview-v1.0.0.zip`. Idempotent;
  safe to re-run.

### Marketing site changes today

- Initial `index.html` and `privacy.html` deployed.
- **Contact** link added to nav bar on both pages
  (`mailto:threadview@betterwayiq.com`).
- Icon size in header bumped from 28px → 72px (much-bigger after user
  feedback that the wordmark was outshadowing it).
- Screenshot in hero is `screenshot-hero.png` — a 1280x900 render of the
  fake Q3-website-redesign thread (5 messages, Sarah Chen / Marcus Lee /
  Priya Patel). Synthetic data, no real PII.

## What's NOT done (action items for tomorrow)

### Blocking actions (must do before site goes "live to the public")

1. **Wait on Google trader verification.** Will arrive via email to
   `admin@betterwayiq.com` (the dev console contact email). When it lands,
   the Submit-for-Review button should appear on the dev console's Status
   tab.

2. **Click Submit for Review.** Once button appears, just click it.
   Screenshot the resulting "In review" status as proof.

3. **Run the fresh-profile dry-run install.** This is the last quality gate
   before submission. The user explicitly deferred this to tomorrow. Steps:

   ```powershell
   # Extract the ZIP somewhere clean.
   Expand-Archive -Path "C:\Users\tkhan\Documents\Claude Code Projects\threadview\dist\threadview-v1.0.0.zip" -DestinationPath "$env:TEMP\threadview-test" -Force
   explorer.exe "$env:TEMP\threadview-test"
   ```

   In Chrome:
   - Profile picker → **Add profile** → skip sync.
   - In the new profile: `chrome://extensions` → toggle Developer mode →
     Load unpacked → select `%TEMP%\threadview-test`.
   - Sign into a Gmail account.
   - Open three different threads (one short, one with images, one
     forwarded). Click ThreadView. All three should render correctly.
   - Verify `firstLaunchedAt`: at `chrome://extensions` → ThreadView →
     "Service worker" → console → `chrome.storage.local.get(null)`. Should
     show `firstLaunchedAt: <today's timestamp>`.

   If anything fails on the dry-run, **fix before clicking Submit on the
   Web Store**. The submitted ZIP is already uploaded; if the code has a
   bug, you'd need to rebuild and re-upload via the Package tab.

### Non-blocking polish (do whenever)

4. **Replace the synthetic Q3-thread `screenshot-hero.png` with a real
   anonymized one** if/when you want more authenticity. Not blocking.
5. **Add Open Graph image** (1200x630) to `threadview-site/index.html` and
   `privacy.html` for X/Slack/LinkedIn previews when the URL is shared.
6. **Submit the small promo tile (440x280)** to the Web Store listing if you
   want better Web Store visibility — generate via v0.
7. **Polish v1.1 roadmap** — pick the next feature for v1.1 (dark mode is
   the strongest candidate per the listing roadmap copy) and write a brief
   implementation note as a GitHub issue.

### Day-of-approval task (when Google approves)

8. **Swap the Install button href on threadview-site/index.html** from `#`
   to the real Web Store URL — likely
   `https://chrome.google.com/webstore/detail/lokaloeclbjlhcajmlbikikfoekoihco`.
   Push to `tashkh01/threadview-site:main`. Vercel auto-deploys.

## Sharp edges from today's work

1. **Workspace's "admin" display name leaked into the Web Store dev console
   profile** as the publisher display name. Had to manually fix to
   "ThreadView" (capital V matters for brand consistency).

2. **Vercel auto-connect to GitHub failed silently on the first deploy**
   ("Failed to connect tashkh01/threadview-site to project. Make sure there
   aren't any typos and that you have access to the repository if it's
   private."). The site still deployed, but the Vercel↔GitHub auto-deploy
   had to be configured manually after the fact via the Vercel project's
   Settings → Git tab. **For future Vercel projects:** authorize the
   Vercel GitHub app on the new repo BEFORE running `vercel deploy`.

3. **Headless Chrome rasterization of SVGs needs explicit pixel dimensions
   on both the wrapper div AND the SVG element.** The viewport-scaling
   approach (`width: 100vw; height: 100vh`) produced blank PNGs at small
   sizes (16x16). Workaround: separate `_render16.html`, `_render48.html`,
   `_render.html` files each with explicit dimensions matching the target
   size. The 16x16 icon used a simplified Tv-only design (no envelope,
   which becomes noise at small sizes); 48 and 128 use the full Tv-on-
   envelope. The render HTMLs were cleaned up after rasterization.

4. **Web Store form's Test instructions field has a 500-char cap.** Trimmed
   the verbose version to 491 chars. The longer architecture-context
   version is preserved in `docs/web-store-listing.md` for posterity.

5. **The "Are you using remote code?" radio defaulted to YES on the Privacy
   tab.** This is a critical reviewer-trust question. The correct answer
   for ThreadView is NO — we fetch Gmail HTML (data) but never fetch
   executable code at runtime. The user flipped it to NO before saving.

6. **D-U-N-S match failure for "BetterwayIQ"** triggered Google to fall back
   to manual trader-verification document review. Probably 1-3 day delay
   vs. instant verification. Indicates BetterWayIQ may not be fully
   registered as a legal entity yet — worth confirming separately later.

7. **Search Console verification of `threadview.app` succeeded under the
   BetterWayIQ Workspace account**, but the Web Store dev console's
   "Official URL" dropdown didn't immediately show the new property. May
   need a hard refresh or a save-then-reopen to pick it up. Not blocking;
   user opted to leave Official URL as `betterwayiq.com` for now (or skip
   to None).

## Memory worth saving (in addition to existing project memory)

- **`tashkh01s-projects` Vercel team is the live deployment scope** for
  `threadview-site`. Project URL:
  <https://vercel.com/tashkh01s-projects/threadview-site>.
- **Chrome extension ID is permanent:**
  `lokaloeclbjlhcajmlbikikfoekoihco`. Use this in the post-approval
  install URL: `chrome.google.com/webstore/detail/<id>`.
- **Vercel↔GitHub authorization gotcha** (sharp edge #2 above) — should be
  saved as feedback so future Vercel deploys do this step first.

## Verification commands for tomorrow's first 5 minutes

Quick sanity check that everything from today is still where it should be:

```powershell
# Marketing site live?
Invoke-WebRequest -Uri "https://threadview.app" -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest -Uri "https://threadview.app/privacy" -UseBasicParsing | Select-Object StatusCode

# Submission ZIP exists and is recent?
Get-Item "C:\Users\tkhan\Documents\Claude Code Projects\threadview\dist\threadview-v1.0.0.zip"

# Repos still exist on GitHub?
gh repo view tashkh01/threadview-extension --json name,visibility
gh repo view tashkh01/threadview-site --json name,visibility
```

Expected output: 200, 200, file size ~37KB, both repos `Public`.
