import { createHash } from "node:crypto";

// Builds a standard RFC 5322 / MIME message (.eml) that any mail app opens:
// a text and HTML body plus base64 attachments.

export interface EmlInput {
  from: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string; // ISO 8601 with offset
  attachments: { filename: string; content: Buffer; type: string }[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15T09:14:00+01:00" → "Thu, 15 Oct 2026 09:14:00 +0100", keeping the sender's offset. */
function rfc2822(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})([+-])(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Bad sentAt: ${iso}`);
  const [, y, mo, d, time, sign, oh, om] = m;
  const day = DAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  return `${day}, ${+d} ${MONTHS[+mo - 1]} ${y} ${time} ${sign}${oh}${om}`;
}

/** RFC 2047 for headers that are not plain ASCII. */
function encodeWord(text: string): string {
  return /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

/** "Name <addr>" with the display name encoded when needed. */
function encodeAddress(address: string): string {
  const m = address.match(/^(.*)<([^>]+)>$/);
  if (!m) return address;
  const name = m[1].trim();
  return name ? `${encodeWord(name.includes(",") ? `"${name}"` : name)} <${m[2]}>` : `<${m[2]}>`;
}

const base64Lines = (buf: Buffer) => buf.toString("base64").replace(/.{76}/g, "$&\r\n");

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlBody(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">\n${paragraphs}\n</body></html>`;
}

export function buildEml(e: EmlInput): string {
  const id = createHash("sha1").update(`${e.from}|${e.subject}|${e.sentAt}`).digest("hex").slice(0, 16);
  const domain = e.from.match(/@([^>\s]+)/)?.[1] ?? "example.com";
  const mixed = `mixed_${id}`;
  const alt = `alt_${id}`;
  const lines = [
    `From: ${encodeAddress(e.from)}`,
    `To: ${encodeAddress(e.to)}`,
    `Subject: ${encodeWord(e.subject)}`,
    `Date: ${rfc2822(e.sentAt)}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    "X-Sample: fictional demonstration message",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(e.body, "utf8")),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(htmlBody(e.body), "utf8")),
    `--${alt}--`,
  ];
  for (const a of e.attachments) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${a.type}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(a.content)
    );
  }
  lines.push(`--${mixed}--`, "");
  return lines.join("\r\n");
}
