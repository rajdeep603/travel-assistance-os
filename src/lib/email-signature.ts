// ---------------------------------------------------------------------------
// What Sthiram sends a prospect in its own name (the quotation, the follow-up,
// the Teams invite) as a readable HTML e-mail: the presenter's text at 16 px,
// "- " lines as bullet lists, the quotation's summary in a box of its own, and
// Sthiram's signature (the one in Sthiram's own mail template: logo, products,
// certifications) last. The demo's own mail (hospitals, vendors, travellers)
// is the assistance company's and never carries it.
// ---------------------------------------------------------------------------

const ASSETS = "https://listmonk.sthiramservices.com/uploads";

export const SIGNATURE_HTML = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;border:0;border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#121412;">
  <tr><td style="padding:12px 0 6px 0;font-size:16px;line-height:24px;color:#121412;">Best regards,<br><strong>Team Sthiram Services LLP</strong></td></tr>
  <tr><td style="padding:14px 0 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;border:0;border-collapse:collapse;"><tr>
      <td valign="middle" style="padding:0 18px 0 0;border-right:2px solid #0A6B47;"><a href="https://sthiramservices.com" target="_blank" style="text-decoration:none;"><img src="${ASSETS}/sthiram-logo-email.png" width="180" height="42" alt="Sthiram – Efficiency with Stability" style="display:block;border:0;outline:none;width:180px;height:42px;"></a></td>
      <td valign="middle" style="padding:0 0 0 18px;font-size:13px;line-height:20px;color:#3A3F3B;"><strong style="color:#121412;">Sthiram Services LLP</strong><br>AI voice agents, automation &amp; custom<br>platforms for healthcare<br><a href="https://sthiramservices.com" target="_blank" style="color:#0A6B47;text-decoration:none;font-weight:bold;">sthiramservices.com</a> &nbsp;·&nbsp; Hyderabad, India</td>
    </tr></table></td></tr>
  <tr><td style="padding:18px 0 6px 0;font-size:11px;line-height:16px;letter-spacing:1px;color:#4D534F;text-transform:uppercase;font-weight:bold;">Our products</td></tr>
  <tr><td style="padding:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;border:0;border-collapse:collapse;"><tr>
      <td valign="middle" style="padding:10px 16px;height:44px;background:#EEF5F1;border-radius:8px;"><a href="https://caretrack.info" target="_blank" style="text-decoration:none;"><img src="${ASSETS}/caretrack-logo-email.png" width="150" height="44" alt="CareTrack – Powered by Sthiram" style="display:block;border:0;outline:none;width:150px;height:44px;"></a></td>
      <td style="width:12px;padding:0;font-size:0;line-height:0;">&nbsp;</td>
      <td valign="middle" style="padding:10px 16px;height:44px;background:#EEF5F1;border-radius:8px;"><a href="https://www.sthiramservices.com/caretrail" target="_blank" style="text-decoration:none;"><img src="${ASSETS}/caretrail-logo-email.png" width="150" height="29" alt="CareTrail – Powered by Sthiram" style="display:block;border:0;outline:none;width:150px;height:29px;"></a></td>
    </tr></table></td></tr>
  <tr><td style="padding:18px 0 6px 0;font-size:11px;line-height:16px;letter-spacing:1px;color:#4D534F;text-transform:uppercase;font-weight:bold;">Certified &amp; trusted</td></tr>
  <tr><td style="padding:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:auto;border:0;border-collapse:collapse;"><tr>
      <td valign="middle" style="padding:0 20px 0 0;"><img src="${ASSETS}/iso-27001-removebg-preview-%281%29.png" width="56" height="44" alt="ISO/IEC 27001 Certified" style="display:block;border:0;outline:none;width:56px;height:44px;"></td>
      <td valign="middle" style="padding:0;"><img src="${ASSETS}/microsoft-cloud-solution.png" width="153" height="44" alt="Microsoft Cloud Solution Partner" style="display:block;border:0;outline:none;width:153px;height:44px;"></td>
    </tr></table></td></tr>
</table>`;

/** The same signature for mail clients that show plain text. */
export const SIGNATURE_TEXT = [
  "Best regards,",
  "Team Sthiram Services LLP",
  "",
  "Sthiram Services LLP",
  "AI voice agents, automation & custom platforms for healthcare",
  "sthiramservices.com · Hyderabad, India",
  "Our products: CareTrack (caretrack.info) · CareTrail (sthiramservices.com/caretrail)",
].join("\n");

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escaped text with its web addresses as links; a full stop or bracket after one stays text. */
function linked(s: string): string {
  return escapeHtml(s).replace(/https?:\/\/[^\s<>"]+/g, (match) => {
    const url = match.replace(/[.,;:!?)]+$/, "");
    return `<a href="${url}" style="color:#0A6B47;">${url}</a>${match.slice(url.length)}`;
  });
}

const FONT = "font-family:Arial,Helvetica,sans-serif;color:#121412;";
const BULLET = /^[-•]\s+/;

/**
 * One paragraph of text (lines between blank lines): "- " lines become a list,
 * and the line just before a list is its heading, in bold. In the summary a
 * bullet's "Label:" is bold too, so the figures are easy to find.
 */
function block(text: string, gap: number, labels = false): string {
  const lines = text.split("\n");
  let html = "";
  let prose: string[] = [];
  let items: string[] = [];
  const flushProse = () => {
    if (prose.length) html += `<p style="margin:0 0 ${gap}px 0;">${prose.map(linked).join("<br>")}</p>`;
    prose = [];
  };
  const flushItems = () => {
    if (items.length) html += `<ul style="margin:0 0 ${gap}px 0;padding:0 0 0 22px;">${items.join("")}</ul>`;
    items = [];
  };
  lines.forEach((line, i) => {
    if (BULLET.test(line)) {
      const item = linked(line.replace(BULLET, ""));
      const label = labels ? /^([^:<]{2,60}):\s/.exec(item) : null;
      items.push(`<li style="margin:0 0 4px 0;">${label ? `<strong>${label[1]}:</strong>${item.slice(label[1].length + 1)}` : item}</li>`);
      return;
    }
    flushItems();
    if (BULLET.test(lines[i + 1] ?? "")) {
      flushProse();
      html += `<p style="margin:0 0 6px 0;"><strong>${linked(line)}</strong></p>`;
    } else {
      prose.push(line);
    }
  });
  flushProse();
  flushItems();
  return html;
}

const blocks = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .filter((b) => b.trim());

/**
 * The quotation's summary in a light box: its first line as the title, the
 * line below it (who it was prepared for) muted, the closing disclaimer small.
 */
function summaryBox(summary: string): string {
  const [first = "", ...rest] = blocks(summary);
  const [title = "", ...under] = first.split("\n");
  const closing = rest.length > 1 && !rest.at(-1)!.split("\n").some((l) => BULLET.test(l)) ? rest.pop()! : null;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;border-collapse:collapse;margin:4px 0 8px 0;"><tr><td style="padding:20px 22px;background:#F4F8F6;border:1px solid #DCE8E1;border-radius:10px;${FONT}font-size:15px;line-height:24px;">
<p style="margin:0;font-size:18px;line-height:26px;font-weight:bold;color:#0A6B47;">${linked(title)}</p>
${under.length ? `<p style="margin:0 0 16px 0;color:#3A3F3B;">${under.map(linked).join("<br>")}</p>` : `<div style="height:12px;"></div>`}
${rest.map((b) => block(b, 14, true)).join("")}${closing ? `<p style="margin:4px 0 0 0;font-size:12px;line-height:18px;color:#5B615D;">${linked(closing)}</p>` : ""}
</td></tr></table>`;
}

/** The presenter's text, the quotation's summary when there is one, then the signature. */
export function signedHtml(text: string, summary?: string): string {
  const body = blocks(text)
    .map((b) => block(b, 16))
    .join("");
  return `<div style="${FONT}font-size:16px;line-height:26px;">${body}${summary?.trim() ? summaryBox(summary) : ""}</div>${SIGNATURE_HTML}`;
}

/** An e-mail's two bodies, both ending with the signature. */
export function signedEmail(text: string, summary?: string): { text: string; html: string } {
  return {
    text: [text.trim(), summary?.trim(), SIGNATURE_TEXT].filter(Boolean).join("\n\n"),
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:16px;">${signedHtml(text, summary)}</body></html>`,
  };
}
