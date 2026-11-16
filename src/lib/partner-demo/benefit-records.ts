import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { nextRef } from "@/lib/refs";
import type { Benefit } from "@/lib/services/policy";

// ---------------------------------------------------------------------------
// The FICTIONAL records behind Benefit Global Assistance's demo portal: two
// insured members, the Antalya network hospitals and Petra Hoffmann's case
// (hip fracture in Lara), plus two members abroad whose hospitals write in
// Arabic (Jeddah) and French (Paris), for the inbox and Document AI; which the hospital call, the interpreter and the
// guarantee-of-payment scenario all work on. Created on demand, found again
// by natural keys (policy numbers, provider refs, the case's patient), so a
// deploy never needs a re-seed and repeated calls change nothing. Refs come
// from the usual sequences, so other demos keep their numbering.
// ---------------------------------------------------------------------------

/** Benefits shared by both plans, in the shape the hotline and the guarantee rules read. */
const PLUS: Benefit[] = [
  { code: "MEDICAL_EXPENSES", label: "Emergency medical expenses", covered: true, limit: 250000, excess: 50, conditions: ["Emergency treatment only", "Network providers preferred"] },
  { code: "HOSPITALIZATION", label: "Hospital admission", covered: true, limit: 250000, excess: 50, conditions: ["Requires a guarantee of payment from the assistance team"] },
  { code: "EMERGENCY_DENTAL", label: "Emergency dental treatment", covered: true, limit: 500, excess: 0, conditions: ["Pain relief only"] },
  { code: "MEDICAL_EVACUATION", label: "Medical evacuation", covered: true, limit: null, excess: 0, conditions: ["When medically necessary and arranged by the assistance team"] },
  { code: "REPATRIATION", label: "Medical repatriation", covered: true, limit: null, excess: 0, conditions: ["Arranged by the assistance team"] },
  { code: "TRIP_DELAY", label: "Trip delay", covered: true, limit: 300, unit: "EUR 30 per full 6 hours", excess: 0, waitingHours: 6, conditions: ["Carrier's written confirmation of the delay and its reason", "Claim within 30 days of return"] },
  { code: "BAGGAGE_DELAY", label: "Baggage delay", covered: true, limit: 300, excess: 0, waitingHours: 12, conditions: ["Carrier's property irregularity report required"] },
  { code: "TRIP_CANCELLATION", label: "Trip cancellation", covered: true, limit: 3000, excess: 100, conditions: ["Listed reasons only (illness, bereavement, jury service)"] },
  { code: "PRE_EXISTING_CONDITIONS", label: "Pre-existing conditions", covered: true, limit: 10000, excess: 50, conditions: ["Declared and stable for 6 months before travel"] },
] as Benefit[];

const PREMIER: Benefit[] = [
  { code: "MEDICAL_EXPENSES", label: "Emergency medical expenses", covered: true, limit: 1000000, excess: 0, conditions: ["Emergency treatment"] },
  { code: "HOSPITALIZATION", label: "Hospital admission", covered: true, limit: 1000000, excess: 0, conditions: ["Requires a guarantee of payment from the assistance team"] },
  { code: "EMERGENCY_DENTAL", label: "Emergency dental treatment", covered: true, limit: 1000, excess: 0, conditions: ["Pain relief and temporary repairs"] },
  { code: "MEDICAL_EVACUATION", label: "Medical evacuation", covered: true, limit: null, excess: 0, conditions: ["When medically necessary and arranged by the assistance team"] },
  { code: "REPATRIATION", label: "Medical repatriation", covered: true, limit: null, excess: 0, conditions: ["Arranged by the assistance team"] },
  { code: "TRIP_DELAY", label: "Trip delay", covered: true, limit: 600, unit: "EUR 50 per full 6 hours", excess: 0, waitingHours: 4, conditions: ["Carrier's written confirmation of the delay and its reason", "Claim within 30 days of return"] },
  { code: "BAGGAGE_DELAY", label: "Baggage delay", covered: true, limit: 500, excess: 0, waitingHours: 6, conditions: ["Carrier's property irregularity report required"] },
  { code: "TRIP_CANCELLATION", label: "Trip cancellation", covered: true, limit: 10000, excess: 0, conditions: ["Listed reasons only (illness, bereavement, jury service)"] },
  { code: "PRE_EXISTING_CONDITIONS", label: "Pre-existing conditions", covered: true, limit: 1000000, excess: 0, conditions: ["Declared before travel"] },
] as Benefit[];

export const BENEFIT_PLANS = { Plus: { medicalLimit: 250000, benefits: PLUS }, Premier: { medicalLimit: 1000000, benefits: PREMIER } } as const;

export const BENEFIT_MEMBERS = {
  murat: {
    firstName: "Murat",
    lastName: "Aydın",
    dateOfBirth: "1968-05-12",
    nationality: "Türkiye",
    language: "Turkish",
    phone: "+90 532 000 1701",
    email: "murat.aydin@example.com",
    policyNumber: "BGA-204417",
    plan: "Plus" as const,
  },
  petra: {
    firstName: "Petra",
    lastName: "Hoffmann",
    dateOfBirth: "1958-09-03",
    nationality: "Germany",
    language: "German",
    phone: "+49 170 000 1702",
    email: "petra.hoffmann@example.com",
    policyNumber: "BGA-310582",
    plan: "Premier" as const,
  },
  // Abroad, with documents in other languages: the inbox and Document AI scenarios.
  hasan: {
    firstName: "Hasan",
    lastName: "Kılıç",
    dateOfBirth: "1961-03-22",
    nationality: "Türkiye",
    language: "Turkish",
    phone: "+90 533 000 1704",
    email: "hasan.kilic@example.com",
    policyNumber: "BGA-207733",
    plan: "Plus" as const,
  },
  elif: {
    firstName: "Elif",
    lastName: "Şahin",
    dateOfBirth: "1990-07-08",
    nationality: "Türkiye",
    language: "Turkish",
    phone: "+90 535 000 1705",
    email: "elif.sahin@example.com",
    policyNumber: "BGA-318264",
    plan: "Premier" as const,
  },
};

/** "HH:MM" slots from `from` to `to`, every `step` minutes. */
function slots(from: string, to: string, step = 60): string[] {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const pad = (n: number) => String(n).padStart(2, "0");
  const out: string[] = [];
  for (let m = minutes(from); m <= minutes(to); m += step) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
const week = (weekday: string[], sat: string[], sun: string[]) => ({ mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun });
const EVERY_DAY = slots("08:00", "23:00");
const RESORT = week(EVERY_DAY, EVERY_DAY, EVERY_DAY);
const HOSPITAL = week([...slots("08:30", "12:30"), ...slots("14:00", "21:00")], slots("09:00", "18:00"), slots("10:00", "18:00", 120));

/** Benefit's network in Antalya (fictional). The first is the hospital Petra Hoffmann is admitted to. */
export const BENEFIT_PROVIDERS = [
  {
    ref: "PRV-2201",
    name: "Op. Dr. Selin Arslan",
    facility: "Antalya Demo Akdeniz Hastanesi",
    specialty: "Orthopedics",
    address: "Tekelioğlu Cd. No: 12",
    district: "Lara",
    city: "Antalya",
    latitude: 36.856,
    longitude: 30.759,
    languages: ["Turkish", "English", "German", "Russian"],
    phone: "+90 242 000 2201",
    email: "international@demo-akdeniz.example",
    rating: 4.7,
    kind: "HOSPITAL" as const,
    accreditations: ["JCI"],
    availability: HOSPITAL,
  },
  {
    ref: "PRV-2202",
    name: "Dr. Emre Koç",
    facility: "Antalya Demo Akdeniz Hastanesi",
    specialty: "Cardiology",
    address: "Tekelioğlu Cd. No: 12",
    district: "Lara",
    city: "Antalya",
    latitude: 36.856,
    longitude: 30.759,
    languages: ["Turkish", "English", "German"],
    phone: "+90 242 000 2202",
    email: "cardiology@demo-akdeniz.example",
    rating: 4.6,
    kind: "HOSPITAL" as const,
    accreditations: ["JCI"],
    availability: HOSPITAL,
  },
  {
    ref: "PRV-2203",
    name: "Dr. Ayten Güler",
    facility: "Belek Demo International Hospital",
    specialty: "General Medicine",
    address: "Kongre Cd. No: 5",
    district: "Belek",
    city: "Antalya",
    latitude: 36.862,
    longitude: 31.055,
    languages: ["Turkish", "English", "German", "Russian"],
    phone: "+90 242 000 2203",
    email: "info@demo-belek-hospital.example",
    rating: 4.5,
    kind: "HOSPITAL" as const,
    accreditations: [],
    availability: RESORT,
  },
  {
    ref: "PRV-2204",
    name: "Dr. Mert Şen",
    facility: "Kemer Demo Sağlık Merkezi",
    specialty: "General Medicine",
    address: "Liman Cd. No: 21",
    district: "Kemer",
    city: "Antalya",
    latitude: 36.598,
    longitude: 30.561,
    languages: ["Turkish", "English", "Russian"],
    phone: "+90 242 000 2204",
    email: "info@demo-kemer-saglik.example",
    rating: 4.4,
    kind: "CLINIC" as const,
    accreditations: [],
    availability: RESORT,
  },
  {
    ref: "PRV-2205",
    name: "Dr. Deniz Yalçın",
    facility: "Alanya Demo Marin Hastanesi",
    specialty: "Emergency Medicine",
    address: "Atatürk Blv. No: 140",
    district: "Alanya",
    city: "Antalya",
    latitude: 36.544,
    longitude: 31.999,
    languages: ["Turkish", "English", "German", "Russian"],
    phone: "+90 242 000 2205",
    email: "er@demo-alanya-marin.example",
    rating: 4.5,
    kind: "HOSPITAL" as const,
    accreditations: [],
    availability: RESORT,
  },
];

/** How Petra Hoffmann's case reads (and how it is found again). */
export const PETRA_CASE = {
  title: "Hip fracture after a fall at the hotel — Lara, Antalya",
  description:
    "Petra Hoffmann (Germany) fell on the stairs at her hotel in Lara and was taken by ambulance to Antalya Demo Akdeniz Hastanesi. X-ray: left femoral neck fracture; surgery planned. The hospital needs a guarantee of payment before the operation. Fictional demo case for Benefit Global Assistance.",
  location: "Lara, Antalya",
};

/** Cases abroad whose hospitals write in Arabic and French (the documents' patients). */
export const ABROAD_CASES = {
  hasan: {
    title: "Pneumonia after an umrah trip — Jeddah, Saudi Arabia",
    description:
      "Hasan Kılıç (Türkiye) fell ill with fever and a cough after performing umrah and was admitted to Al Shati Demo Hospital, Jeddah. The hospital writes in Arabic. Fictional demo case for Benefit Global Assistance.",
    location: "Jeddah",
    country: "Saudi Arabia",
    assistanceType: "HOSPITALIZATION" as const,
    priority: "HIGH" as const,
    urgency: "Inpatient abroad; fitness to fly and the hospital's costs to settle",
    symptoms: ["fever", "cough", "shortness of breath"],
    aiSummary:
      "Turkish traveller, 65, admitted in Jeddah with suspected pneumonia after umrah. Next: get the medical report, confirm fitness to fly, guarantee the hospital's costs, plan the return home.",
    event: { title: "Hotline call from the traveller's son: admitted in Jeddah", body: "Son reported fever and breathlessness since the umrah; father admitted to Al Shati Demo Hospital, Jeddah. Case opened, priority high." },
  },
  elif: {
    title: "Acute appendicitis — Paris, France",
    description:
      "Elif Şahin (Türkiye) went to the emergency department in Paris with abdominal pain; acute appendicitis, operated at Clinique Démo des Batignolles. The clinic writes in French. Fictional demo case for Benefit Global Assistance.",
    location: "Paris",
    country: "France",
    assistanceType: "HOSPITALIZATION" as const,
    priority: "HIGH" as const,
    urgency: "Surgery abroad; the clinic needs the costs confirmed",
    symptoms: ["abdominal pain", "nausea"],
    aiSummary:
      "Turkish traveller, 36, operated in Paris for acute appendicitis. Next: read the clinic's report, confirm the costs with the clinic, confirm when she can fly home.",
    event: { title: "Hotline call from the traveller: abdominal pain in Paris", body: "Traveller with severe abdominal pain sent to the nearest emergency department in Paris (17th arrondissement). Case opened, priority high." },
  },
};

export interface BenefitRecords {
  murat: { patientId: string };
  petra: { patientId: string; caseId: string; caseRef: string };
  hasan: { patientId: string; caseId: string; caseRef: string };
  elif: { patientId: string; caseId: string; caseRef: string };
  providers: { id: string; ref: string }[];
}

/** One of the abroad cases, found again by its patient and title. */
async function ensureAbroadCase(patientId: string, c: (typeof ABROAD_CASES)[keyof typeof ABROAD_CASES]) {
  const existing = await prisma.case.findFirst({ where: { patientId, title: c.title }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return prisma.case.create({
    data: {
      ref: await nextRef("case"),
      title: c.title,
      description: c.description,
      location: c.location,
      country: c.country,
      assistanceType: c.assistanceType,
      priority: c.priority,
      status: "IN_PROGRESS",
      urgency: c.urgency,
      symptoms: c.symptoms,
      aiSummary: c.aiSummary,
      patientId,
      events: {
        create: [{ type: "CALL", title: c.event.title, body: c.event.body, actor: "agent:inbound-hotline", createdAt: new Date(Date.now() - 30 * 3600_000) }],
      },
    },
  });
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function ensurePatient(m: (typeof BENEFIT_MEMBERS)[keyof typeof BENEFIT_MEMBERS]) {
  const existing = await prisma.patient.findUnique({ where: { policyNumber: m.policyNumber } });
  const patient =
    existing ??
    (await prisma.patient.create({
      data: {
        ref: await nextRef("patient"),
        firstName: m.firstName,
        lastName: m.lastName,
        dateOfBirth: new Date(m.dateOfBirth),
        nationality: m.nationality,
        language: m.language,
        phone: m.phone,
        email: m.email,
        policyNumber: m.policyNumber,
      },
    }));
  const plan = BENEFIT_PLANS[m.plan];
  // Valid from the start of the season to a year ahead, so the dates never lapse during the demo.
  const validTo = new Date(Math.max(Date.parse("2027-10-31T23:59:59Z"), Date.now() + 300 * 86_400_000));
  await prisma.policy.upsert({
    where: { number: m.policyNumber },
    create: {
      number: m.policyNumber,
      plan: m.plan,
      validFrom: new Date("2026-06-01T00:00:00Z"),
      validTo,
      currency: "EUR",
      medicalLimit: plan.medicalLimit,
      medicalUsed: 0,
      benefits: json(plan.benefits),
    },
    update: {},
  });
  return patient;
}

/** Creates whatever of the Benefit demo records is missing and returns them. */
export async function ensureBenefitRecords(): Promise<BenefitRecords> {
  const providers: { id: string; ref: string }[] = [];
  for (const p of BENEFIT_PROVIDERS) {
    const row = await prisma.provider.upsert({
      where: { ref: p.ref },
      create: { ...p, availability: json(p.availability), status: "VERIFIED", hours: "24/7 emergency department", acceptsDirectBilling: true },
      update: {},
      select: { id: true, ref: true },
    });
    providers.push(row);
  }
  const murat = await ensurePatient(BENEFIT_MEMBERS.murat);
  const petra = await ensurePatient(BENEFIT_MEMBERS.petra);

  let kase = await prisma.case.findFirst({ where: { patientId: petra.id, title: PETRA_CASE.title }, orderBy: { createdAt: "asc" } });
  if (!kase) {
    const hospital = providers[0];
    const now = Date.now();
    kase = await prisma.case.create({
      data: {
        ref: await nextRef("case"),
        title: PETRA_CASE.title,
        description: PETRA_CASE.description,
        location: PETRA_CASE.location,
        country: "Turkiye",
        assistanceType: "HOSPITALIZATION",
        priority: "HIGH",
        status: "IN_PROGRESS",
        urgency: "Surgery planned; guarantee of payment needed before the operation",
        symptoms: ["hip pain", "fall"],
        aiSummary:
          "German traveller, 66, admitted after a fall with a left femoral neck fracture. Surgery planned at Antalya Demo Akdeniz Hastanesi; the hospital asks for a guarantee of payment. Next: confirm admission details with the hospital, issue the guarantee, keep the family informed.",
        patientId: petra.id,
        familyContactName: "Jürgen Hoffmann",
        familyContactRelation: "husband",
        familyContactPhone: "+49 170 000 1703",
        familyContactLanguage: "German",
        events: {
          create: [
            {
              type: "CALL",
              title: "Hotline call from the hotel: guest fell on the stairs",
              body: "Hotel reception in Lara reported a fall; ambulance on its way to Antalya Demo Akdeniz Hastanesi. Case opened, priority high.",
              actor: "agent:inbound-hotline",
              createdAt: new Date(now - 14 * 3600_000),
            },
            {
              type: "NOTE",
              title: "Emergency department: X-ray shows a left femoral neck fracture",
              body: "Orthopaedic surgeon Op. Dr. Selin Arslan plans surgery. Hospital will send a cost estimate for the guarantee of payment.",
              actor: "operator:benefit-demo",
              createdAt: new Date(now - 12 * 3600_000),
            },
          ],
        },
      },
    });
    await prisma.appointment.create({
      data: {
        ref: await nextRef("appointment"),
        scheduledAt: new Date(now - 13 * 3600_000),
        status: "COMPLETED",
        reason: "Emergency admission after a fall: hip fracture",
        notes: "Admitted to the orthopaedics ward",
        source: "WEB",
        patientId: petra.id,
        providerId: hospital.id,
        caseId: kase.id,
      },
    });
  }
  const hasan = await ensurePatient(BENEFIT_MEMBERS.hasan);
  const elif = await ensurePatient(BENEFIT_MEMBERS.elif);
  const hasanCase = await ensureAbroadCase(hasan.id, ABROAD_CASES.hasan);
  const elifCase = await ensureAbroadCase(elif.id, ABROAD_CASES.elif);
  return {
    murat: { patientId: murat.id },
    petra: { patientId: petra.id, caseId: kase.id, caseRef: kase.ref },
    hasan: { patientId: hasan.id, caseId: hasanCase.id, caseRef: hasanCase.ref },
    elif: { patientId: elif.id, caseId: elifCase.id, caseRef: elifCase.ref },
    providers,
  };
}
