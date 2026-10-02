import type { Appointment, Case, Patient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, notFound } from "@/lib/errors";
import { nextCaseRef, nextPatientRef } from "@/lib/refs";
import { getAIService } from "./ai";
import { bookAppointment } from "./appointment";
import { getNotificationService } from "./notification";
import { ISTANBUL_DISTRICTS, matchSymptoms, maxUrgency } from "./nlu";
import { searchProviders, type ScoredProvider } from "./provider-search";
import type {
  ChatMessage,
  VoiceDialogState,
  VoicePatientInfo,
} from "./types";

// ---------------------------------------------------------------------------
// VoiceAgentService: a server-side dialog manager for the browser voice UI.
// The browser handles speech-to-text / text-to-speech (Web Speech API); this
// service owns understanding, slot collection, provider search, confirmation,
// booking and human handoff. State is persisted per conversation.
// ---------------------------------------------------------------------------

export interface PresentedOption {
  providerId: string;
  name: string;
  facility: string;
  specialty: string;
  district: string;
  distanceKm: number | null;
  languages: string[];
  phone: string;
  slot: { date: string; time: string } | null;
}

export interface VoiceTurnResult {
  conversationId: string;
  reply: string;
  state: VoiceDialogState;
  options: PresentedOption[];
  appointment: (Appointment & { providerName: string }) | null;
  case: Pick<Case, "id" | "ref" | "status" | "title"> | null;
  done: boolean;
}

const GREETING =
  "Hello, you've reached the travel medical assistance line. I'm the AI assistant — I can help you find a doctor and book an appointment. How can I help you today?";

const SLOT_QUESTIONS: [keyof VoicePatientInfo, string][] = [
  ["problem", "I'm sorry to hear that. Could you describe the medical problem?"],
  ["location", "Where are you staying right now — which district or city?"],
  ["preferredDate", "When would you like the appointment — for example today or tomorrow?"],
  ["preferredTime", "Do you prefer morning, afternoon or evening?"],
  ["name", "May I have the patient's full name, please?"],
  ["language", "Which language should the doctor speak?"],
  ["contact", "And finally, what's the best phone number or email to reach you?"],
];

const initialState = (): VoiceDialogState => ({
  step: "GREETING",
  expecting: null,
  info: {
    name: null,
    location: null,
    problem: null,
    specialty: null,
    preferredDate: null,
    preferredTime: null,
    language: null,
    contact: null,
  },
  presentedProviderIds: [],
  selectedProviderId: null,
  selectedSlot: null,
  appointmentRef: null,
  caseRef: null,
});

export async function startVoiceConversation(): Promise<VoiceTurnResult> {
  const state = initialState();
  const messages: ChatMessage[] = [
    { role: "agent", text: GREETING, at: new Date().toISOString() },
  ];
  const conversation = await prisma.conversation.create({
    data: {
      channel: "VOICE",
      messages: JSON.parse(JSON.stringify(messages)),
      state: JSON.parse(JSON.stringify(state)),
    },
  });
  return {
    conversationId: conversation.id,
    reply: GREETING,
    state,
    options: [],
    appointment: null,
    case: null,
    done: false,
  };
}

export async function handleVoiceUtterance(
  conversationId: string,
  utterance: string
): Promise<VoiceTurnResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw notFound("Conversation");

  const state = (conversation.state as unknown as VoiceDialogState) ?? initialState();
  const messages = (conversation.messages as unknown as ChatMessage[]) ?? [];
  messages.push({ role: "user", text: utterance, at: new Date().toISOString() });

  const nlu = await getAIService().interpretVoiceUtterance(utterance, state);
  // Merge newly extracted slots (never overwrite confirmed values with null).
  for (const [key, value] of Object.entries(nlu.info)) {
    if (value != null && value !== "") {
      (state.info as unknown as Record<string, unknown>)[key] = value;
    }
  }

  let result: Omit<VoiceTurnResult, "conversationId">;
  try {
    result = await advance(state, nlu, messages, conversationId);
  } catch (err) {
    console.error("[voice] turn failed:", err);
    result = {
      reply:
        "I'm sorry, something went wrong on my side while handling that. Could you say it again, or ask for a human case manager?",
      state,
      options: [],
      appointment: null,
      case: null,
      done: false,
    };
  }

  messages.push({ role: "agent", text: result.reply, at: new Date().toISOString() });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      messages: JSON.parse(JSON.stringify(messages)),
      state: JSON.parse(JSON.stringify(result.state)),
    },
  });

  return { conversationId, ...result };
}

// --- Dialog policy ----------------------------------------------------------

async function advance(
  state: VoiceDialogState,
  nlu: { selectedOption: number | null; confirmation: "yes" | "no" | null },
  messages: ChatMessage[],
  conversationId: string
): Promise<Omit<VoiceTurnResult, "conversationId">> {
  const base = { options: [] as PresentedOption[], appointment: null, case: null, done: false };

  if (state.step === "BOOKED" || state.step === "HANDOFF") {
    state.step = "HANDOFF";
    return {
      ...base,
      reply:
        "Your appointment is booked and a human case manager now has your case. They will contact you shortly. Take care!",
      state,
      done: true,
    };
  }

  if (state.step === "CONFIRMING") {
    if (nlu.confirmation === "yes") {
      return finalizeBooking(state, messages, conversationId);
    }
    if (nlu.confirmation === "no") {
      state.step = "PRESENTING";
      state.selectedProviderId = null;
      state.selectedSlot = null;
      const { options, reply } = await presentOptions(state, "No problem. ");
      return { ...base, options, reply, state };
    }
    return {
      ...base,
      reply: "Just to be sure — shall I go ahead and book this appointment? Please say yes or no.",
      state,
    };
  }

  if (state.step === "PRESENTING") {
    if (nlu.selectedOption != null) {
      const chosen = state.presentedProviderIds[nlu.selectedOption - 1];
      if (chosen) {
        return confirmSelection(state, chosen);
      }
      const { options, reply } = await presentOptions(
        state,
        "I didn't catch which option you meant. "
      );
      return { ...base, options, reply, state };
    }
    // The user may have changed a constraint (new date/time) — re-search.
    const { options, reply } = await presentOptions(state, "Let me check again. ");
    return { ...base, options, reply, state };
  }

  // GREETING / COLLECTING: ask for the next missing slot.
  state.step = "COLLECTING";
  const missing = SLOT_QUESTIONS.find(([slot]) => !state.info[slot]);
  if (missing) {
    const [slot, question] = missing;
    state.expecting = slot;
    const ack = acknowledge(state);
    return { ...base, reply: `${ack}${question}`, state };
  }

  // Everything collected → search.
  state.expecting = null;
  state.step = "SEARCHING";
  const { options, reply } = await presentOptions(state, "");
  return { ...base, options, reply, state };
}

function acknowledge(state: VoiceDialogState): string {
  const i = state.info;
  if (state.step === "COLLECTING" && !i.problem && (i.location || i.preferredDate)) {
    return "I understand you need medical assistance. ";
  }
  return "";
}

async function runSearch(state: VoiceDialogState): Promise<ScoredProvider[]> {
  const info = state.info;
  const location = info.location ?? "";
  const isDistrict = ISTANBUL_DISTRICTS[location.toLowerCase()] != null;
  return searchProviders({
    city: isDistrict ? "Istanbul" : location || "Istanbul",
    district: isDistrict ? location : undefined,
    specialty: info.specialty ?? undefined,
    date: info.preferredDate ?? undefined,
    timeOfDay: info.preferredTime ?? undefined,
    language: info.language ?? undefined,
    limit: 3,
  });
}

async function presentOptions(
  state: VoiceDialogState,
  prefix: string
): Promise<{ options: PresentedOption[]; reply: string }> {
  let results = await runSearch(state);
  let relaxedNote = "";
  if (results.length === 0 && state.info.language) {
    // Relax the language constraint rather than dead-ending the caller.
    const saved = state.info.language;
    state.info.language = null;
    results = await runSearch(state);
    state.info.language = saved;
    if (results.length > 0) {
      relaxedNote = ` I couldn't find a ${saved}-speaking doctor for that time, so some options may need an interpreter.`;
    }
  }
  // Only present options the caller can actually book (a concrete slot).
  const bookable = results.map(toOption).filter((o) => o.slot != null);
  if (bookable.length === 0) {
    state.step = "COLLECTING";
    state.expecting = "preferredDate";
    state.info.preferredDate = null;
    return {
      options: [],
      reply: `${prefix}I'm sorry — I couldn't find an available provider for that day. Could we try a different day?`,
    };
  }

  const options = bookable;
  state.step = "PRESENTING";
  state.presentedProviderIds = options.map((o) => o.providerId);

  const lines = options.map((o, idx) => {
    const when = o.slot ? ` available ${spokenOn(o.slot.date)} at ${spokenTime(o.slot.time)}` : "";
    const dist = o.distanceKm != null ? `, about ${o.distanceKm} kilometres away` : "";
    return `Option ${idx + 1}: ${o.name}, ${o.specialty} at ${o.facility} in ${o.district}${dist},${when}.`;
  });
  return {
    options,
    reply:
      `${prefix}I found ${options.length} provider${options.length > 1 ? "s" : ""} for you.${relaxedNote} ` +
      `${lines.join(" ")} Which option would you like?`,
  };
}

function toOption(result: ScoredProvider): PresentedOption {
  return {
    providerId: result.provider.id,
    name: result.provider.name,
    facility: result.provider.facility,
    specialty: result.provider.specialty,
    district: result.provider.district,
    distanceKm: result.distanceKm,
    languages: result.provider.languages,
    phone: result.provider.phone,
    slot: result.slots[0] ?? null,
  };
}

async function confirmSelection(
  state: VoiceDialogState,
  providerId: string
): Promise<Omit<VoiceTurnResult, "conversationId">> {
  const results = await runSearch(state);
  const match = results.find((r) => r.provider.id === providerId);
  const provider =
    match?.provider ?? (await prisma.provider.findUnique({ where: { id: providerId } }));
  if (!provider) {
    return {
      reply: "I'm sorry, that provider is no longer available. Let me look again.",
      state,
      options: [],
      appointment: null,
      case: null,
      done: false,
    };
  }
  const slot = match?.slots[0] ?? null;
  state.selectedProviderId = provider.id;
  state.selectedSlot = slot;
  state.step = "CONFIRMING";
  state.expecting = null;

  const when = slot
    ? `${spokenOn(slot.date)} at ${spokenTime(slot.time)}`
    : "at the next available time";
  return {
    reply:
      `To confirm: an appointment with ${provider.name} (${provider.specialty}) at ${provider.facility} in ${provider.district}, ${when}, ` +
      `for ${state.info.name}. Shall I book it?`,
    state,
    options: [],
    appointment: null,
    case: null,
    done: false,
  };
}

async function finalizeBooking(
  state: VoiceDialogState,
  messages: ChatMessage[],
  conversationId: string
): Promise<Omit<VoiceTurnResult, "conversationId">> {
  const providerId = state.selectedProviderId;
  const slot = state.selectedSlot;
  if (!providerId || !slot) {
    state.step = "PRESENTING";
    const { options, reply } = await presentOptions(state, "Let me show the options again. ");
    return { options, reply, state, appointment: null, case: null, done: false };
  }

  const patient = await findOrCreateVoicePatient(state.info);

  // Book first — only a successful booking creates the case, so a taken
  // slot never leaves an orphan case behind.
  let appointment;
  try {
    appointment = await bookAppointment({
      patientId: patient.id,
      providerId,
      date: slot.date,
      time: slot.time,
      reason: state.info.problem ?? "Medical assistance",
      source: "VOICE",
      notes: "Booked by AI voice assistant",
    });
  } catch (err) {
    if (err instanceof ApiError) {
      state.selectedProviderId = null;
      state.selectedSlot = null;
      const { options, reply } = await presentOptions(
        state,
        "I'm sorry — that slot was taken just now. "
      );
      return { options, reply, state, appointment: null, case: null, done: false };
    }
    throw err;
  }

  const kase = await createVoiceCase(state, patient);
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { caseId: kase.id },
  });

  const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
  const summary = await getAIService().summarizeConversation(messages);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { caseId: kase.id, summary },
  });

  const updatedCase = await prisma.case.update({
    where: { id: kase.id },
    data: {
      status: "IN_PROGRESS",
      assignedTo: "Elif Demirtas (Human Case Manager)",
      aiSummary: `${kase.aiSummary ?? ""} Voice summary: ${summary}`.trim(),
    },
  });

  state.step = "BOOKED";
  state.appointmentRef = appointment.ref;
  state.caseRef = updatedCase.ref;

  await getNotificationService().notify({
    kind: "HANDOFF",
    subject: `Case ${updatedCase.ref} handed to human case manager`,
    body: summary,
  });

  return {
    reply:
      `Great news — your appointment is confirmed. Reference ${appointment.ref}, with ${provider.name} at ${provider.facility} ` +
      `${spokenOn(slot.date)} at ${spokenTime(slot.time)}. I've also created assistance case ${updatedCase.ref} and handed it ` +
      `to a human case manager, who can see the full summary of our conversation and will follow up on ${state.info.contact ?? "your contact details"}. ` +
      `Is there anything else I can help you with?`,
    state,
    options: [],
    appointment: { ...appointment, providerName: provider.name },
    case: { id: updatedCase.id, ref: updatedCase.ref, status: updatedCase.status, title: updatedCase.title },
    done: true,
  };
}

// --- Helpers ----------------------------------------------------------------

async function findOrCreateVoicePatient(info: VoicePatientInfo): Promise<Patient> {
  const fullName = (info.name ?? "Unregistered Traveller").trim();
  const parts = fullName.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || "(unknown)";
  const existing = await prisma.patient.findFirst({
    where: {
      firstName: { equals: firstName, mode: "insensitive" },
      lastName: { equals: lastName, mode: "insensitive" },
    },
  });
  if (existing) return existing;
  const ref = await nextPatientRef();
  const n = Number(ref.split("-")[1]);
  return prisma.patient.create({
    data: {
      ref,
      firstName,
      lastName,
      dateOfBirth: new Date("1985-06-15"),
      nationality: "Unknown",
      language: info.language ?? "English",
      phone: info.contact ?? "(not provided)",
      email: info.contact?.includes("@") ? info.contact : "(not provided)",
      policyNumber: `POL-TR-${100000 + n}`,
    },
  });
}

async function createVoiceCase(state: VoiceDialogState, patient: Patient): Promise<Case> {
  const info = state.info;
  const symptoms = matchSymptoms(info.problem ?? "");
  const urgency = maxUrgency(symptoms, info.problem ?? "");
  return prisma.case.create({
    data: {
      ref: await nextCaseRef(),
      title: `${info.problem ?? "Medical assistance"} — ${info.location ?? "Istanbul"}`,
      description: `Voice-assisted intake: traveller requested medical assistance in ${info.location ?? "Istanbul"}.`,
      location: info.location ?? "Istanbul",
      country: "Turkiye",
      assistanceType: "MEDICAL",
      priority: urgency,
      status: "NEW",
      urgency,
      symptoms: symptoms.map((s) => s.symptom),
      aiSummary: `Traveller ${info.name ?? "(unknown)"} reported ${info.problem ?? "a medical issue"} in ${info.location ?? "Istanbul"}; requested a ${info.specialty ?? "medical"} appointment (${info.preferredDate ?? "date open"}, ${info.preferredTime ?? "time open"}).`,
      suggestedActions: ["Confirm appointment attendance", "Follow up after consultation", "Check if a claim will be filed"],
      patientId: patient.id,
    },
  });
}

function spokenOn(date: string): string {
  const spoken = spokenDate(date);
  return spoken === "today" || spoken === "tomorrow" ? spoken : `on ${spoken}`;
}

function spokenDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function spokenTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}
