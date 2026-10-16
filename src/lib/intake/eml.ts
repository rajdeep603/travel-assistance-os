import PostalMime, { type Address } from "postal-mime";
import { badRequest } from "@/lib/errors";
import type { InboundFile, InboundInput } from "./intake";

// ---------------------------------------------------------------------------
// Reads a saved e-mail (.eml, RFC 5322 / MIME) into an inbound message, so an
// operator can drop one exported from any mail app into the Inbox. Inline
// images (logos in signatures) are skipped; every real attachment is kept.
// ---------------------------------------------------------------------------

const HEADER = /^(from|to|subject|date|message-id|mime-version|received|return-path):/im;

/** An .eml by name, or text that starts with mail headers. */
export function looksLikeEml(buffer: Buffer, filename: string): boolean {
  if (/\.eml$/i.test(filename)) return true;
  const head = buffer.subarray(0, 4096).toString("latin1");
  return HEADER.test(head) && /\r?\n\r?\n/.test(head) && /^from:/im.test(head);
}

function mailbox(a: Address | undefined): string | null {
  if (!a) return null;
  const box = a.address ? a : a.group?.[0];
  if (!box?.address) return null;
  return box.name ? `${box.name} <${box.address}>` : box.address;
}

const toBuffer = (content: ArrayBuffer | Uint8Array | string) =>
  typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content instanceof Uint8Array ? content : new Uint8Array(content));

const htmlToText = (html: string) =>
  html
    .replace(/<(br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function parseEml(buffer: Buffer): Promise<InboundInput> {
  const mail = await PostalMime.parse(buffer, { attachmentEncoding: "arraybuffer" }).catch(() => {
    throw badRequest("This file could not be read as an e-mail.");
  });
  const from = mailbox(mail.from);
  if (!from) throw badRequest("This e-mail has no sender (From:).");

  const files: InboundFile[] = [];
  const names = new Set<string>();
  for (const [i, a] of mail.attachments.entries()) {
    if (a.related || (a.disposition === "inline" && a.contentId)) continue;
    let name = a.filename?.trim() || `attachment-${i + 1}`;
    // Intake looks attachments up by name, so two with the same name must differ.
    for (let n = 2; names.has(name); n++) name = name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
    names.add(name);
    files.push({ filename: name, buffer: toBuffer(a.content) });
  }

  return {
    channel: "EMAIL",
    from,
    to: mailbox(mail.to?.[0]),
    subject: mail.subject?.trim() || null,
    body: mail.text?.trim() || (mail.html ? htmlToText(mail.html) : null),
    files,
  };
}
