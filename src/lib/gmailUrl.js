// gmailUrl.js
//
// Pure URL builder. The shape comes from the print-view URL we observed
// directly in this user's Gmail on 2026-05-08:
//
//   https://mail.google.com/mail/u/1/?ik=1c871043fc&view=pt&search=all
//     &permthid=thread-f:1862364016133180829
//     &simpl=msg-f:1862364016133180829
//     &simpl=msg-f:1864374143214436753
//     &simpl=msg-f:1864393247792395538
//
// `simpl` is one-per-message and Gmail will happily render the entire thread
// without it as long as `permthid` is present. We omit `simpl` from the
// constructed URL because we don't know the message ids ahead of time.
// Gmail returns the full thread regardless. (Validated in v1 testing.)

/**
 * Build the Gmail print-view URL for a thread.
 *
 * @param {{ accountIndex: number, ik: string, permthid: string }} ctx
 * @returns {string}
 */
export function buildPrintViewUrl(ctx) {
  if (!ctx) throw new Error("buildPrintViewUrl: missing context");
  const { accountIndex, ik, permthid } = ctx;
  if (typeof accountIndex !== "number") throw new Error("buildPrintViewUrl: accountIndex must be a number");
  if (!ik) throw new Error("buildPrintViewUrl: ik is required");
  if (!permthid) throw new Error("buildPrintViewUrl: permthid is required");

  const params = new URLSearchParams({
    ik,
    view: "pt",
    search: "all",
    permthid,
  });

  return `https://mail.google.com/mail/u/${accountIndex}/?${params.toString()}`;
}
