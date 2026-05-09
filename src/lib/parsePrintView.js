// parsePrintView.js
//
// Parse Gmail's print-view HTML into a structured Thread object.
//
// The print template is HTML 4.01 strict, table-based, server-rendered.
// Verified against real HTML pulled from Gmail on 2026-05-09. Structure:
//
//   <body>
//     <div class="bodycontainer">
//       <table>...thread title bar (logo, account)...</table>
//       <hr>
//       <div class="maincontent">
//         <table>...thread title + message count...</table>
//         <hr>
//
//         <!-- one of these per message -->
//         <table class="message">
//           <tr><td>
//             <font size=-1><b>Sender Name</b> &lt;sender@x.com&gt;</font>
//           </td><td align=right>
//             <font size=-1>Mon, Apr 13, 2026 at 9:58 AM</font>
//           </td></tr>
//           <tr><td colspan=2>
//             <font size=-1 class="recipient">
//               <div>To: ...</div>
//               <div>Cc: ...</div>
//             </font>
//           </td></tr>
//           <tr><td colspan=2>
//             <table>...wrapper...
//               <tr><td>
//                 <div style="overflow: hidden;">
//                   <font size=-1>...message body HTML...</font>
//                 </div>
//               </td></tr>
//             </table>
//           </td></tr>
//         </table>
//         <hr>
//         ...
//       </div>
//     </div>
//   </body>
//
// Important contract details we discovered the hard way:
//
//   1) The per-message anchor is `<table class="message">`. Earlier code
//      used "any table containing 'From:'" which matched nested quoted-
//      history tables and caused duplicate messages.
//
//   2) The body lives in `<div style="overflow: hidden;">` (with optional
//      whitespace) inside the message table. Earlier code grabbed the
//      first non-empty <td> which often picked up the sender label cell
//      from the next message.
//
//   3) The "From:" line in this template is rendered as the cell content
//      itself (not as a "From:" label). That's why we read the sender from
//      the first <td> of the first <tr> directly, not by regex.

/**
 * Parse a Gmail print-view HTML document.
 * @param {string} html
 * @returns {object}
 */
export function parsePrintView(html) {
  const warnings = [];
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Subject from <title>: "<Account label> Mail - <Subject>".
  const titleText = (doc.title || "").trim();
  let subject = null;
  if (titleText) {
    const idx = titleText.indexOf(" - ");
    subject = idx >= 0 ? titleText.slice(idx + 3).trim() : titleText;
  }

  // Per-message anchor: <table class="message">. This is the canonical
  // hook the print template uses; one table per message, never nested.
  const messageTables = doc.body
    ? Array.from(doc.body.querySelectorAll("table.message"))
    : [];

  if (messageTables.length === 0) {
    warnings.push(
      "No <table class='message'> elements matched. The print template " +
      "may have changed; parser needs an update.",
    );
  }

  const messages = messageTables.map((table) => parseMessageTable(table, warnings));

  return {
    subject,
    messageCount: messages.length,
    messages,
    warnings,
  };
}

function parseMessageTable(table, warnings) {
  // Row 1, Cell 1: sender (e.g. "<b>Mohammad Banawan</b> <mohammad.b@x.org>").
  // Row 1, Cell 2 (align=right): date.
  // Row 2 (colspan=2): "<font class='recipient'>" with To/Cc divs.
  // Row 3+ (colspan=2): body wrapper with the actual content.

  const rows = Array.from(table.querySelectorAll(":scope > tbody > tr, :scope > tr"));

  let from = null;
  let date = null;
  let to = null;
  let cc = null;
  let bodyHtml = "";
  let bodyText = "";

  // ---- Row 1: sender + date ----
  if (rows.length >= 1) {
    const cells = Array.from(rows[0].querySelectorAll(":scope > td"));
    if (cells[0]) from = collapseWhitespace(cells[0].textContent || "") || null;
    if (cells[1]) date = collapseWhitespace(cells[1].textContent || "") || null;
  }

  // ---- Row 2: recipients (To / Cc) ----
  // Some messages put recipients in row 2; some skip it. We scan the first
  // few rows for a `font.recipient` element, which is the stable hook.
  for (let i = 0; i < Math.min(rows.length, 3); i++) {
    const recipFont = rows[i].querySelector("font.recipient");
    if (recipFont) {
      const divs = Array.from(recipFont.querySelectorAll("div"));
      for (const div of divs) {
        const txt = collapseWhitespace(div.textContent || "");
        const mTo = txt.match(/^To:\s*(.*)$/i);
        const mCc = txt.match(/^Cc:\s*(.*)$/i);
        if (mTo && !to) to = mTo[1].trim();
        if (mCc && !cc) cc = mCc[1].trim();
      }
      break;
    }
  }

  // ---- Body ----
  // Look for the body container: <div style="overflow: hidden;">. The print
  // template wraps every message body in this exact div. Use a CSS attribute
  // selector that's tolerant of style whitespace variations.
  let bodyContainer =
    table.querySelector('div[style*="overflow: hidden"]') ||
    table.querySelector('div[style*="overflow:hidden"]');

  if (bodyContainer) {
    bodyHtml = bodyContainer.innerHTML;
    bodyText = collapseWhitespace(bodyContainer.textContent || "");
  } else {
    // Fallback: take the last colspan=2 row's first cell and use its content.
    // Less reliable, but better than nothing.
    for (let i = rows.length - 1; i >= 0; i--) {
      const cells = Array.from(rows[i].querySelectorAll(":scope > td"));
      if (cells.length === 1 && cells[0].getAttribute("colspan") === "2") {
        const inner = cells[0].querySelector("table");
        if (inner) {
          bodyHtml = inner.innerHTML;
          bodyText = collapseWhitespace(inner.textContent || "");
          break;
        }
      }
    }
    if (!bodyHtml) warnings.push("A message had no body container recovered.");
  }

  return {
    from,
    to,
    cc,
    date,
    bodyHtml,
    bodyText,
  };
}

function collapseWhitespace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}
