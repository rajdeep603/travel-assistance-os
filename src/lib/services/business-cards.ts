import { z } from "zod";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { withRef } from "@/lib/refs";
import { sniffType } from "@/lib/uploads";
import { aiMode, runAI } from "./ai";
import { NO_QUOTATION, SUMMARY_SELECT, contactInput, findLeadFor, type LeadSummary } from "./leads";
import type { AISource, BusinessCard } from "./types";

// ---------------------------------------------------------------------------
// Business cards: the presenter photographs a visitor's card at the booth, the
// model reads it into a draft, the presenter corrects it, and it becomes a
// lead (or updates the lead with the same e-mail address). The photo is read
// and dropped, never stored. A card is not consent to e-mail: the send panel
// asks for that before anything goes out.
// ---------------------------------------------------------------------------

export const CARD_MAX_BYTES = 10 * 1024 * 1024;
const CARD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The card as the presenter checks it: every field a string, empty when the card doesn't say. */
export interface CardDraft {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  website: string;
}

export const EMPTY_CARD: CardDraft = { name: "", company: "", role: "", email: "", phone: "", website: "" };

export interface CardReading {
  draft: CardDraft;
  source: AISource;
  /** Why the draft is empty or thin, for the presenter; null when the card was read. */
  note: string | null;
}

const NO_AI_NOTE = "Reading cards needs the live AI model, which isn't set up on this server. Type the details in from the card.";
const FAILED_NOTE = "The card couldn't be read just now. Type the details in from the card, or try another photo.";
const NOTHING_NOTE = "Nothing could be read on that photo. Type the details in, or take another with the card filling the frame.";

/** The photo's type from its bytes, or a 400 for anything but a JPEG, PNG or WebP image within the limit. */
export function cardPhotoType(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" {
  if (!buffer.length) throw badRequest("The photo is empty. Take it again.");
  if (buffer.length > CARD_MAX_BYTES) throw badRequest(`The photo is too large (max ${CARD_MAX_BYTES / 1024 / 1024} MB).`);
  const type = sniffType(buffer);
  if (!type || !CARD_TYPES.has(type)) throw badRequest("Take a photo of the card, or choose a JPEG, PNG or WebP image.");
  return type as "image/jpeg" | "image/png" | "image/webp";
}

const clip = (value: string | null | undefined, max: number) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The model's reading as a draft: tidied, clipped to what a lead holds. */
export function toCardDraft(card: BusinessCard): CardDraft {
  return {
    name: clip(card.name, 120),
    company: clip(card.company, 120),
    role: clip(card.jobTitle, 120),
    email: clip(card.email, 200).replace(/^mailto:/i, "").replace(/\s/g, "").toLowerCase(),
    phone: clip(card.phone, 40),
    website: clip(card.website, 200),
  };
}

/**
 * Reads a photographed card into a draft. Without a live model, or when it
 * fails, the draft comes back empty with a note, so the presenter types the
 * card in instead: never an error for that.
 */
export async function readBusinessCard(photo: { buffer: Buffer; filename: string }): Promise<CardReading> {
  const mimeType = cardPhotoType(photo.buffer);
  let read: { value: BusinessCard; source: AISource } | null = null;
  try {
    read = await runAI("readBusinessCard", (ai) => ai.readBusinessCard({ buffer: photo.buffer, mimeType, filename: photo.filename }));
  } catch (err) {
    console.warn("[cards] reading a card failed:", err instanceof Error ? err.message : err);
  }
  if (!read || read.source === "offline") {
    return { draft: EMPTY_CARD, source: "offline", note: aiMode().mode === "claude" ? FAILED_NOTE : NO_AI_NOTE };
  }
  const draft = toCardDraft(read.value);
  const found = draft.name || draft.company || draft.email || draft.phone;
  return { draft, source: read.source, note: found ? null : NOTHING_NOTE };
}

/** The checked card, as the presenter saves it. */
export const CardLeadSchema = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(120),
  company: z.string().trim().min(2, "Enter their company.").max(120),
  role: z.string().trim().max(120).default(""),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .refine((v) => !v || z.email().safeParse(v).success, "That e-mail address doesn't look right.")
    .default(""),
  phone: z.string().trim().max(40).default(""),
  website: z.string().trim().max(200).default(""),
});

export type CardLead = z.infer<typeof CardLeadSchema>;

/** Adds a line to the notes once. */
const withLine = (notes: string | null, line: string | null) => (!line || notes?.includes(line) ? notes : notes ? `${notes}\n${line}` : line);

/**
 * Saves a checked card as a lead. A lead with the same e-mail address (or,
 * without one, the same company and name) is updated instead: what the card
 * adds is kept, what it leaves blank isn't blanked. The lead's consent is
 * never touched: a card handed over is not an agreement to be e-mailed.
 */
export async function saveCardLead(card: CardLead, operator: string | null): Promise<{ lead: LeadSummary; existing: boolean }> {
  const email = card.email || null;
  const website = card.website ? `Website: ${card.website}` : null;
  const found = await findLeadFor({ email, companyName: card.company, customerName: card.name });
  if (found) {
    const lead = await prisma.lead.update({
      where: { id: found.id },
      data: {
        customerName: card.name,
        companyName: card.company,
        email: email ?? found.email,
        phone: card.phone || found.phone,
        role: card.role || found.role,
        notes: withLine(found.notes, website),
      },
      select: SUMMARY_SELECT,
    });
    return { lead, existing: true };
  }
  const lead = await withRef("lead", (ref) =>
    prisma.lead.create({
      data: {
        ref,
        source: "CARD",
        ...NO_QUOTATION,
        customerName: card.name,
        companyName: card.company,
        email,
        phone: card.phone || null,
        role: card.role || null,
        notes: website,
        input: contactInput({ name: card.name, company: card.company, email, phone: card.phone || null }),
        createdBy: operator,
      },
      select: SUMMARY_SELECT,
    })
  );
  return { lead, existing: false };
}
