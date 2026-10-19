// ---------------------------------------------------------------------------
// Fictional demo seed data for the ITIC Global demonstration platform.
// Every person, hospital, policy and phone number here is invented.
// Istanbul-heavy on purpose: the platform is demonstrated at ITIC Global,
// with a few Asia-Pacific records (marked below) so the same flows show for
// assistance companies run out of Singapore. Their refs sit below the ITIC
// data and the live sequences (PAT-095x, CASE-100x, PRV-202x), so they never
// collide with records the running app creates.
// ---------------------------------------------------------------------------

export const PATIENTS = [
  { ref: "PAT-1001", firstName: "Aylin", lastName: "Yilmaz", dateOfBirth: "1987-03-14", nationality: "United Kingdom", language: "English", phone: "+44 7700 900101", email: "aylin.yilmaz@example.com", policyNumber: "POL-TR-100944" },
  { ref: "PAT-1002", firstName: "James", lastName: "Carter", dateOfBirth: "1979-11-02", nationality: "United States", language: "English", phone: "+1 555 0102", email: "james.carter@example.com", policyNumber: "POL-TR-100945" },
  { ref: "PAT-1003", firstName: "Lena", lastName: "Koch", dateOfBirth: "1964-07-29", nationality: "Germany", language: "German", phone: "+49 1512 3456701", email: "lena.koch@example.com", policyNumber: "POL-TR-100946" },
  { ref: "PAT-1004", firstName: "Sophie", lastName: "Martin", dateOfBirth: "1992-05-21", nationality: "France", language: "French", phone: "+33 6 12 34 56 01", email: "sophie.martin@example.com", policyNumber: "POL-TR-100947" },
  { ref: "PAT-1005", firstName: "Marco", lastName: "Bianchi", dateOfBirth: "1985-09-09", nationality: "Italy", language: "English", phone: "+39 320 000 0105", email: "marco.bianchi@example.com", policyNumber: "POL-TR-100948" },
  { ref: "PAT-1006", firstName: "Emma", lastName: "Van Dijk", dateOfBirth: "1998-01-17", nationality: "Netherlands", language: "English", phone: "+31 6 1234 0106", email: "emma.vandijk@example.com", policyNumber: "POL-TR-100949" },
  { ref: "PAT-1007", firstName: "Oliver", lastName: "Bennett", dateOfBirth: "1956-12-05", nationality: "United Kingdom", language: "English", phone: "+44 7700 900107", email: "oliver.bennett@example.com", policyNumber: "POL-TR-100950" },
  { ref: "PAT-1008", firstName: "Irina", lastName: "Volkova", dateOfBirth: "1990-08-23", nationality: "Russia", language: "Russian", phone: "+7 900 000 0108", email: "irina.volkova@example.com", policyNumber: "POL-TR-100951" },
  { ref: "PAT-1009", firstName: "Carlos", lastName: "Garcia", dateOfBirth: "1973-04-30", nationality: "Spain", language: "Spanish", phone: "+34 600 000 109", email: "carlos.garcia@example.com", policyNumber: "POL-TR-100952" },
  { ref: "PAT-1010", firstName: "Siobhan", lastName: "Murphy", dateOfBirth: "1969-06-11", nationality: "Ireland", language: "English", phone: "+353 85 000 0110", email: "siobhan.murphy@example.com", policyNumber: "POL-TR-100953" },
  // Asia-Pacific
  { ref: "PAT-0951", firstName: "Daniel", lastName: "Tan", dateOfBirth: "1964-03-03", nationality: "Singapore", language: "English", phone: "+65 0000 0951", email: "daniel.tan@example.com", policyNumber: "POL-SG-200101" },
  { ref: "PAT-0952", firstName: "Rachel", lastName: "Lim", dateOfBirth: "1991-08-17", nationality: "Singapore", language: "English", phone: "+65 0000 0952", email: "rachel.lim@example.com", policyNumber: "POL-SG-200102" },
];

// Weekly availability templates (expanded to concrete dates at query time),
// in Istanbul wall-clock time. Every provider takes bookings seven days a
// week until at least 22:00 — the demo runs at evening receptions and on
// Sundays — and the international / urgent-care clinics stay open later.

/** "HH:MM" slots from `from` to `to` inclusive, every `step` minutes. */
function slots(from: string, to: string, step = 60): string[] {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const pad = (n: number) => String(n).padStart(2, "0");
  const out: string[] = [];
  for (let m = minutes(from); m <= minutes(to); m += step) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

const week = (weekday: string[], sat: string[], sun: string[]) => ({ mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat, sun });

// Clinics and practices: day and evening hours, shorter (later-starting) weekends.
const CLINIC = week([...slots("09:00", "12:00"), ...slots("14:00", "22:00")], slots("10:00", "22:00", 120), slots("12:00", "22:00", 120));
// Hospital specialists: a morning clinic and an evening clinic.
const SPECIALIST = week([...slots("08:30", "11:30"), ...slots("18:00", "22:00")], ["10:30", "11:30", "18:00", "20:00", "22:00"], ["10:30", "11:30", "18:00", "20:00", "22:00"]);
// Afternoon practices running into the evening.
const AFTERNOON = week(slots("13:00", "22:00"), slots("14:00", "22:00", 120), slots("14:00", "22:00", 120));
// International and urgent-care clinics: every day, half-hourly in the evening, until 23:30.
const LATE_DAY = [...slots("08:00", "17:00"), ...slots("17:30", "23:30", 30)];
const LATE = week(LATE_DAY, LATE_DAY, LATE_DAY);
// Resort clinic: every day 09:00–23:00.
const RESORT = week(slots("09:00", "23:00"), slots("09:00", "23:00"), slots("09:00", "23:00"));

export const PROVIDERS = [
  { ref: "PRV-2001", name: "Dr. Deniz Arslan", facility: "Taksim Demo International Clinic", specialty: "General Medicine", address: "Istiklal Cd. 12", district: "Taksim", city: "Istanbul", latitude: 41.037, longitude: 28.9857, languages: ["Turkish", "English"], phone: "+90 212 000 2001", email: "d.arslan@demo-clinic.example", rating: 4.8, availability: LATE },
  { ref: "PRV-2002", name: "Dr. Meltem Sahin", facility: "Beyoglu Demo Medical Center", specialty: "General Medicine", address: "Mesrutiyet Cd. 45", district: "Beyoglu", city: "Istanbul", latitude: 41.033, longitude: 28.977, languages: ["Turkish", "English", "French"], phone: "+90 212 000 2002", email: "m.sahin@demo-med.example", rating: 4.6, availability: CLINIC },
  { ref: "PRV-2003", name: "Dr. Kerem Aydin", facility: "Istanbul Central Demo Hospital", specialty: "Gastroenterology", address: "Halaskargazi Cd. 100", district: "Sisli", city: "Istanbul", latitude: 41.06, longitude: 28.987, languages: ["Turkish", "English"], phone: "+90 212 000 2003", email: "k.aydin@demo-hospital.example", rating: 4.9, availability: AFTERNOON },
  { ref: "PRV-2004", name: "Dr. Selin Kaya", facility: "Bosphorus Demo Orthopedic Clinic", specialty: "Orthopedics", address: "Barbaros Blv. 8", district: "Besiktas", city: "Istanbul", latitude: 41.043, longitude: 29.007, languages: ["Turkish", "English", "German"], phone: "+90 212 000 2004", email: "s.kaya@demo-ortho.example", rating: 4.7, availability: CLINIC },
  { ref: "PRV-2005", name: "Dr. Baran Ozturk", facility: "Marmara Demo Heart Center", specialty: "Cardiology", address: "Buyukdere Cd. 22", district: "Sisli", city: "Istanbul", latitude: 41.063, longitude: 28.99, languages: ["Turkish", "English"], phone: "+90 212 000 2005", email: "b.ozturk@demo-heart.example", rating: 4.9, availability: SPECIALIST },
  { ref: "PRV-2006", name: "Dr. Zeynep Erdem", facility: "Kadikoy Demo Family Practice", specialty: "General Medicine", address: "Bahariye Cd. 33", district: "Kadikoy", city: "Istanbul", latitude: 40.99, longitude: 29.026, languages: ["Turkish", "English"], phone: "+90 216 000 2006", email: "z.erdem@demo-family.example", rating: 4.5, availability: CLINIC },
  { ref: "PRV-2007", name: "Dr. Volkan Demir", facility: "Nisantasi Demo Dental Studio", specialty: "Dentistry", address: "Tesvikiye Cd. 5", district: "Nisantasi", city: "Istanbul", latitude: 41.048, longitude: 28.994, languages: ["Turkish", "English"], phone: "+90 212 000 2007", email: "v.demir@demo-dental.example", rating: 4.8, availability: CLINIC },
  { ref: "PRV-2008", name: "Dr. Elif Yildiz", facility: "Uskudar Demo Polyclinic", specialty: "Dermatology", address: "Hakimiyet-i Milliye Cd. 60", district: "Uskudar", city: "Istanbul", latitude: 41.023, longitude: 29.016, languages: ["Turkish", "English", "Arabic"], phone: "+90 216 000 2008", email: "e.yildiz@demo-poly.example", rating: 4.4, availability: SPECIALIST },
  { ref: "PRV-2009", name: "Dr. Murat Celik", facility: "Fatih Demo University Hospital", specialty: "Neurology", address: "Millet Cd. 90", district: "Fatih", city: "Istanbul", latitude: 41.019, longitude: 28.94, languages: ["Turkish", "English"], phone: "+90 212 000 2009", email: "m.celik@demo-uni.example", rating: 4.6, availability: SPECIALIST },
  { ref: "PRV-2010", name: "Dr. Aysegul Koc", facility: "Levent Demo Medical Plaza", specialty: "General Medicine", address: "Levent Cd. 14", district: "Levent", city: "Istanbul", latitude: 41.078, longitude: 29.013, languages: ["Turkish", "English", "Russian"], phone: "+90 212 000 2010", email: "a.koc@demo-plaza.example", rating: 4.7, availability: AFTERNOON },
  { ref: "PRV-2011", name: "Dr. Hakan Polat", facility: "Bakirkoy Demo General Hospital", specialty: "Emergency Medicine", address: "Incirli Cd. 70", district: "Bakirkoy", city: "Istanbul", latitude: 40.982, longitude: 28.877, languages: ["Turkish", "English"], phone: "+90 212 000 2011", email: "h.polat@demo-general.example", rating: 4.5, availability: LATE },
  { ref: "PRV-2012", name: "Dr. Nazli Aksoy", facility: "Taksim Demo Women's Health Clinic", specialty: "Obstetrics & Gynecology", address: "Siraselviler Cd. 21", district: "Taksim", city: "Istanbul", latitude: 41.035, longitude: 28.984, languages: ["Turkish", "English", "French"], phone: "+90 212 000 2012", email: "n.aksoy@demo-womens.example", rating: 4.8, availability: CLINIC },
  { ref: "PRV-2013", name: "Dr. Emre Gunes", facility: "Kadikoy Demo Eye Institute", specialty: "Ophthalmology", address: "Moda Cd. 48", district: "Kadikoy", city: "Istanbul", latitude: 40.987, longitude: 29.03, languages: ["Turkish", "English"], phone: "+90 216 000 2013", email: "e.gunes@demo-eye.example", rating: 4.6, availability: SPECIALIST },
  { ref: "PRV-2014", name: "Dr. Pelin Ates", facility: "Sisli Demo Children's Clinic", specialty: "Pediatrics", address: "Abide-i Hurriyet Cd. 36", district: "Sisli", city: "Istanbul", latitude: 41.06, longitude: 28.982, languages: ["Turkish", "English", "German"], phone: "+90 212 000 2014", email: "p.ates@demo-childrens.example", rating: 4.9, availability: CLINIC },
  { ref: "PRV-2015", name: "Dr. Onur Karaca", facility: "Beyoglu Demo ENT Center", specialty: "Ear, Nose & Throat", address: "Galip Dede Cd. 9", district: "Beyoglu", city: "Istanbul", latitude: 41.029, longitude: 28.974, languages: ["Turkish", "English"], phone: "+90 212 000 2015", email: "o.karaca@demo-ent.example", rating: 4.4, availability: AFTERNOON },
  { ref: "PRV-2016", name: "Dr. Gamze Ucar", facility: "Atasehir Demo Medical Park", specialty: "Gastroenterology", address: "Atasehir Blv. 110", district: "Atasehir", city: "Istanbul", latitude: 40.992, longitude: 29.124, languages: ["Turkish", "English"], phone: "+90 216 000 2016", email: "g.ucar@demo-park.example", rating: 4.5, availability: CLINIC },
  { ref: "PRV-2017", name: "Dr. Cem Duran", facility: "Besiktas Demo Sports Medicine", specialty: "Orthopedics", address: "Ciragan Cd. 40", district: "Besiktas", city: "Istanbul", latitude: 41.044, longitude: 29.012, languages: ["Turkish", "English", "Spanish"], phone: "+90 212 000 2017", email: "c.duran@demo-sports.example", rating: 4.7, availability: AFTERNOON },
  { ref: "PRV-2018", name: "Dr. Leyla Ozkan", facility: "Sultanahmet Demo Health House", specialty: "General Medicine", address: "Divanyolu Cd. 3", district: "Sultanahmet", city: "Istanbul", latitude: 41.006, longitude: 28.976, languages: ["Turkish", "English", "Arabic"], phone: "+90 212 000 2018", email: "l.ozkan@demo-health.example", rating: 4.3, availability: LATE },
  { ref: "PRV-2019", name: "Dr. Kaan Simsek", facility: "Antalya Demo Coastal Clinic", specialty: "General Medicine", address: "Konyaalti Cd. 55", district: "Konyaalti", city: "Antalya", latitude: 36.886, longitude: 30.63, languages: ["Turkish", "English", "German", "Russian"], phone: "+90 242 000 2019", email: "k.simsek@demo-coastal.example", rating: 4.6, availability: RESORT },
  { ref: "PRV-2020", name: "Dr. Berna Tan", facility: "Ankara Demo Central Hospital", specialty: "Cardiology", address: "Ataturk Blv. 200", district: "Cankaya", city: "Ankara", latitude: 39.918, longitude: 32.854, languages: ["Turkish", "English"], phone: "+90 312 000 2020", email: "b.tan@demo-central.example", rating: 4.7, availability: SPECIALIST },
  // Asia-Pacific
  { ref: "PRV-2021", name: "Dr. Chua Wei Ming", facility: "Orchard Demo Neuroscience Centre", specialty: "Neurology", address: "Orchard Rd 290", district: "Orchard", city: "Singapore", country: "Singapore", latitude: 1.3048, longitude: 103.8318, languages: ["English", "Mandarin", "Malay"], phone: "+65 0000 2021", email: "w.chua@demo-neuro.example", rating: 4.9, availability: SPECIALIST },
  { ref: "PRV-2022", name: "Dr. Siti Rahman", facility: "Novena Demo Medical Centre", specialty: "General Medicine", address: "Irrawaddy Rd 10", district: "Novena", city: "Singapore", country: "Singapore", latitude: 1.3204, longitude: 103.8438, languages: ["English", "Malay", "Mandarin"], phone: "+65 0000 2022", email: "s.rahman@demo-novena.example", rating: 4.7, availability: LATE },
  { ref: "PRV-2023", name: "Dr. Arjun Menon", facility: "Marina Demo Heart Clinic", specialty: "Cardiology", address: "Marina Blvd 12", district: "Marina Bay", city: "Singapore", country: "Singapore", latitude: 1.28, longitude: 103.854, languages: ["English", "Hindi"], phone: "+65 0000 2023", email: "a.menon@demo-marina.example", rating: 4.8, availability: SPECIALIST },
  { ref: "PRV-2024", name: "Dr. Kanya Srisuk", facility: "Sukhumvit Demo International Hospital", specialty: "General Medicine", address: "Sukhumvit Soi 3", district: "Watthana", city: "Bangkok", country: "Thailand", latitude: 13.74, longitude: 100.556, languages: ["Thai", "English"], phone: "+66 0000 2024", email: "k.srisuk@demo-sukhumvit.example", rating: 4.6, availability: LATE },
  { ref: "PRV-2025", name: "Dr. Farid Hassan", facility: "Ampang Demo Medical Centre", specialty: "Emergency Medicine", address: "Jalan Ampang 50", district: "KLCC", city: "Kuala Lumpur", country: "Malaysia", latitude: 3.1579, longitude: 101.712, languages: ["Malay", "English", "Mandarin"], phone: "+60 0000 2025", email: "f.hassan@demo-ampang.example", rating: 4.5, availability: LATE },
  { ref: "PRV-2026", name: "Dr. Zhang Wei", facility: "Pudong Demo Medical Center", specialty: "Neurology", address: "Demo Rd 88", district: "Pudong", city: "Shanghai", country: "China", latitude: 31.2304, longitude: 121.544, languages: ["Mandarin", "English"], phone: "+86 0000 2026", email: "z.wei@demo-pudong.example", rating: 4.8, availability: SPECIALIST },
];

export interface SeedCase {
  ref: string;
  patientRef: string;
  title: string;
  description: string;
  location: string;
  /** Turkiye unless set. */
  country?: string;
  assistanceType: "MEDICAL" | "DENTAL" | "HOSPITALIZATION" | "EVACUATION" | "REPATRIATION" | "GENERAL";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "NEW" | "IN_PROGRESS" | "PENDING_INFO" | "ESCALATED" | "RESOLVED" | "CLOSED";
  symptoms: string[];
  aiSummary: string;
  suggestedActions: string[];
  assignedTo: string | null;
  daysAgo: number;
  /** Istanbul wall-clock time the case was opened on that day. */
  openedAt: string;
}

export const CASES: SeedCase[] = [
  { ref: "CASE-1010", patientRef: "PAT-1004", title: "Fever and sore throat — Sultanahmet", description: "Traveller reports fever and sore throat after sightseeing; requests a French or English speaking GP.", location: "Sultanahmet, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "RESOLVED", symptoms: ["Fever / infection"], aiSummary: "Sophie Martin reports fever and sore throat in Sultanahmet. GP visit arranged and completed.", suggestedActions: ["Find medical provider", "Arrange appointment"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 12, openedAt: "11:20" },
  { ref: "CASE-1011", patientRef: "PAT-1005", title: "Toothache — Nisantasi", description: "Severe toothache; requests dentist appointment.", location: "Nisantasi, Istanbul", assistanceType: "DENTAL", priority: "MEDIUM", status: "RESOLVED", symptoms: ["Dental pain"], aiSummary: "Marco Bianchi reported severe toothache. Dental appointment completed; claim CLM-10237 is waiting for the clinic's itemised invoice.", suggestedActions: ["Chase the itemised invoice from the dental clinic", "Keep the traveller updated on CLM-10237"], assignedTo: "Elif Demirtas (Case Manager)", daysAgo: 20, openedAt: "21:10" },
  { ref: "CASE-1012", patientRef: "PAT-1006", title: "Skin rash — Kadikoy", description: "Itchy rash on both arms, possibly allergic reaction to sun cream.", location: "Kadikoy, Istanbul", assistanceType: "MEDICAL", priority: "LOW", status: "RESOLVED", symptoms: ["Skin reaction / allergy"], aiSummary: "Emma Van Dijk developed a mild allergic rash. Dermatology consult completed.", suggestedActions: ["Find dermatologist", "Arrange appointment"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 9, openedAt: "16:39" },
  { ref: "CASE-1013", patientRef: "PAT-1007", title: "Dizziness and headache — Taksim", description: "Elderly traveller reports recurring dizziness and headaches; daughter requests assessment.", location: "Taksim, Istanbul", assistanceType: "MEDICAL", priority: "HIGH", status: "IN_PROGRESS", symptoms: ["Headache / dizziness"], aiSummary: "Oliver Bennett (69) reports recurring dizziness and headaches. Seen by a GP; before a neurology consult could be booked he was admitted for cardiac observation (CASE-1024), so the dizziness will be reviewed at his cardiology follow-up.", suggestedActions: ["Review dizziness at the cardiology follow-up", "Monitor condition", "Escalate if symptoms worsen"], assignedTo: "Elif Demirtas (Case Manager)", daysAgo: 3, openedAt: "10:05" },
  { ref: "CASE-1014", patientRef: "PAT-1008", title: "Food poisoning — Beyoglu", description: "Vomiting and diarrhea after restaurant meal; hotel doctor unavailable.", location: "Beyoglu, Istanbul", assistanceType: "MEDICAL", priority: "HIGH", status: "RESOLVED", symptoms: ["Abdominal pain"], aiSummary: "Irina Volkova suffered suspected food poisoning. GP visit and medication arranged.", suggestedActions: ["Find medical provider", "Arrange appointment"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 15, openedAt: "08:40" },
  { ref: "CASE-1015", patientRef: "PAT-1009", title: "Knee injury — Besiktas", description: "Twisted knee during stadium tour; swelling and difficulty walking.", location: "Besiktas, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "IN_PROGRESS", symptoms: ["Suspected fracture / injury"], aiSummary: "Carlos Garcia twisted his knee. Orthopedic assessment done; the MRI shows a meniscus tear and the clinic proposes arthroscopic repair. Letter of Guarantee LOG-0904 is above the automatic approval limit and waits for a case manager.", suggestedActions: ["Decide on Letter of Guarantee LOG-0904", "Discuss treatment now vs. at home with the traveller", "Collect imaging results"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 2, openedAt: "13:30" },
  { ref: "CASE-1016", patientRef: "PAT-1010", title: "Eye irritation — Kadikoy", description: "Persistent eye redness and irritation; wears contact lenses.", location: "Kadikoy, Istanbul", assistanceType: "MEDICAL", priority: "LOW", status: "PENDING_INFO", symptoms: ["Eye problem"], aiSummary: "Siobhan Murphy reports eye irritation. Awaiting photo and lens details from traveller.", suggestedActions: ["Request additional information", "Arrange ophthalmology consult if needed"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 4, openedAt: "17:50" },
  { ref: "CASE-1017", patientRef: "PAT-1002", title: "Follow-up: ankle fracture — Beyoglu", description: "Follow-up review of cast and fit-to-fly assessment after ankle fracture.", location: "Beyoglu, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "IN_PROGRESS", symptoms: ["Suspected fracture / injury"], aiSummary: "James Carter needs a cast review and fit-to-fly clearance before flying home; the review was booked through the voice agent (APT-2026-1007).", suggestedActions: ["Book follow-up appointment", "Prepare fit-to-fly certificate"], assignedTo: "Elif Demirtas (Case Manager)", daysAgo: 1, openedAt: "08:50" },
  { ref: "CASE-1018", patientRef: "PAT-1004", title: "Lost medication — Sisli", description: "Traveller lost prescription medication for hypertension; needs replacement.", location: "Sisli, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "RESOLVED", symptoms: [], aiSummary: "Sophie Martin lost hypertension medication. Replacement prescription arranged via GP.", suggestedActions: ["Arrange GP appointment", "Coordinate pharmacy"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 7, openedAt: "18:25" },
  { ref: "CASE-1019", patientRef: "PAT-1005", title: "Travel vaccination query — Istanbul", description: "Traveller asks whether booster vaccination is required for onward travel.", location: "Istanbul", assistanceType: "GENERAL", priority: "LOW", status: "CLOSED", symptoms: [], aiSummary: "General advice request about vaccinations; answered from medical information line.", suggestedActions: ["Provide travel health information"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 18, openedAt: "12:10" },
  { ref: "CASE-1020", patientRef: "PAT-1001", title: "Hospitalization: gastroenteritis — Sisli", description: "Traveller admitted with severe gastroenteritis; guarantee of payment issued to hospital.", location: "Sisli, Istanbul", assistanceType: "HOSPITALIZATION", priority: "HIGH", status: "RESOLVED", symptoms: ["Abdominal pain"], aiSummary: "Aylin Yilmaz was hospitalised for acute gastroenteritis at Istanbul Central Demo Hospital (2 nights). Discharged stable; claim CLM-10245 in review.", suggestedActions: ["Collect discharge documents", "Process claim"], assignedTo: "Elif Demirtas (Case Manager)", daysAgo: 8, openedAt: "08:10" },
  { ref: "CASE-1021", patientRef: "PAT-1002", title: "Ankle fracture — Beyoglu", description: "Traveller slipped on stairs near Galata Tower; suspected ankle fracture.", location: "Beyoglu, Istanbul", assistanceType: "MEDICAL", priority: "HIGH", status: "RESOLVED", symptoms: ["Suspected fracture / injury"], aiSummary: "James Carter sustained a non-displaced ankle fracture; treated at Bosphorus Demo Orthopedic Clinic.", suggestedActions: ["Collect invoice", "Open claim"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 5, openedAt: "15:40" },
  { ref: "CASE-1022", patientRef: "PAT-1003", title: "Chest pain — Sisli", description: "Traveller admitted from hotel with acute chest pain; cardiology workup performed.", location: "Sisli, Istanbul", assistanceType: "HOSPITALIZATION", priority: "CRITICAL", status: "ESCALATED", symptoms: ["Chest pain"], aiSummary: "Lena Koch admitted with unstable angina at Marmara Demo Heart Center. Letter of Guarantee LOG-0902 approved by the senior desk and confirmed by the hospital. Needs cardiology clearance before flying; medical escort under evaluation.", suggestedActions: ["Obtain fit-to-fly assessment", "Evaluate medical escort", "Keep family informed"], assignedTo: "Senior Desk — Dr. Arda Yavuz", daysAgo: 3, openedAt: "07:05" },
  { ref: "CASE-1023", patientRef: "PAT-1006", title: "Repatriation assessment — Istanbul", description: "Assessment for early return home after hospital treatment.", location: "Istanbul", assistanceType: "REPATRIATION", priority: "MEDIUM", status: "PENDING_INFO", symptoms: [], aiSummary: "Emma Van Dijk requests early repatriation on medical grounds; awaiting treating physician's report.", suggestedActions: ["Request medical report", "Check airline requirements"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 2, openedAt: "11:15" },
  { ref: "CASE-1024", patientRef: "PAT-1007", title: "Hospital admission: cardiac observation — Sisli", description: "Traveller admitted for overnight cardiac observation after episode of chest tightness at hotel.", location: "Sisli, Istanbul", assistanceType: "HOSPITALIZATION", priority: "HIGH", status: "IN_PROGRESS", symptoms: ["Chest pain"], aiSummary: "Oliver Bennett admitted for cardiac observation at Marmara Demo Heart Center (coronary care unit). Guarantee of payment issued (LOG-0903, sent by fax); monitoring results awaited.", suggestedActions: ["Follow up on test results", "Extend guarantee of payment if required", "Plan discharge and the cardiology follow-up"], assignedTo: "Elif Demirtas (Case Manager)", daysAgo: 1, openedAt: "18:49" },
  // Asia-Pacific: the hospital's final invoice (final-invoice-rachel-lim-bangkok.pdf) is added during the demo.
  { ref: "CASE-1006", patientRef: "PAT-0952", title: "Hospitalization: dengue fever — Bangkok", description: "Traveller admitted with dengue fever with warning signs at a private hospital in Bangkok; the hospital bills the insurer directly.", location: "Bangkok", country: "Thailand", assistanceType: "HOSPITALIZATION", priority: "HIGH", status: "IN_PROGRESS", symptoms: ["Fever / infection"], aiSummary: "Rachel Lim was admitted with dengue fever with warning signs at Sukhumvit Demo International Hospital, Bangkok, from 9 to 12 October. Discharged stable; the hospital's final invoice needs a bill review before it is paid.", suggestedActions: ["Review the final invoice line by line", "Confirm the stay dates with the hospital", "Keep the traveller updated"], assignedTo: "Aisha Rahman (Case Manager)", daysAgo: 11, openedAt: "09:30" },
];

export interface SeedClaim {
  ref: string;
  patientRef: string;
  caseRef?: string;
  status: "SUBMITTED" | "PROCESSING" | "NEEDS_REVIEW" | "INFO_REQUESTED" | "APPROVED" | "ESCALATED" | "REJECTED" | "PAID";
  amount?: number;
  currency?: string;
  summary?: string;
  issues?: { severity: "error" | "warning" | "ok"; message: string }[];
  daysAgo: number;
}

export const CLAIMS: SeedClaim[] = [
  { ref: "CLM-10236", patientRef: "PAT-1004", caseRef: "CASE-1010", status: "PAID", amount: 950, currency: "TRY", summary: "GP consultation and medication for fever. Paid in full.", issues: [{ severity: "ok", message: "All required documents available" }], daysAgo: 10 },
  { ref: "CLM-10237", patientRef: "PAT-1005", caseRef: "CASE-1011", status: "INFO_REQUESTED", amount: 2400, currency: "TRY", summary: "Emergency dental treatment at Nisantasi Demo Dental Studio. Waiting for the clinic's itemised invoice — the card receipt on file doesn't list the treatment.", issues: [{ severity: "ok", message: "Medical report available" }, { severity: "error", message: "Itemised invoice missing" }, { severity: "ok", message: "Policy number found (POL-TR-100948)" }], daysAgo: 17 },
  { ref: "CLM-10238", patientRef: "PAT-1006", caseRef: "CASE-1012", status: "APPROVED", amount: 700, currency: "TRY", summary: "Dermatology consultation approved for payment.", issues: [{ severity: "ok", message: "All required documents available" }], daysAgo: 6 },
  { ref: "CLM-10239", patientRef: "PAT-1008", caseRef: "CASE-1014", status: "APPROVED", amount: 1150, currency: "TRY", summary: "GP visit and medication after food poisoning.", issues: [{ severity: "ok", message: "All required documents available" }], daysAgo: 12 },
  { ref: "CLM-10240", patientRef: "PAT-1009", caseRef: "CASE-1015", status: "PROCESSING", summary: "Orthopedic consultation; invoice awaited from clinic.", issues: [{ severity: "warning", message: "Hospital invoice not yet received" }], daysAgo: 1 },
  { ref: "CLM-10241", patientRef: "PAT-1010", status: "INFO_REQUESTED", summary: "Ophthalmology claim; proof of payment requested from traveller.", issues: [{ severity: "error", message: "Proof of payment missing" }, { severity: "ok", message: "Medical report available" }], daysAgo: 3 },
  { ref: "CLM-10242", patientRef: "PAT-1007", caseRef: "CASE-1013", status: "SUBMITTED", summary: "GP consultation for dizziness and headaches submitted; not yet processed.", daysAgo: 0 },
  { ref: "CLM-10243", patientRef: "PAT-1002", caseRef: "CASE-1021", status: "NEEDS_REVIEW", amount: 800, currency: "EUR", summary: "Ankle fracture treatment at Bosphorus Demo Orthopedic Clinic. Discharge summary missing.", issues: [{ severity: "ok", message: "Medical report available" }, { severity: "ok", message: "Hospital invoice available" }, { severity: "error", message: "Discharge summary missing" }, { severity: "error", message: "Policy number missing" }], daysAgo: 4 },
  { ref: "CLM-10244", patientRef: "PAT-1001", status: "REJECTED", amount: 180, currency: "TRY", summary: "Pharmacy-only claim rejected: prescription predates policy start.", issues: [{ severity: "error", message: "Treatment date outside policy period" }], daysAgo: 14 },
  { ref: "CLM-10245", patientRef: "PAT-1001", caseRef: "CASE-1020", status: "NEEDS_REVIEW", amount: 25250, currency: "TRY", summary: "Hospitalization for acute gastroenteritis at Istanbul Central Demo Hospital. Policy number missing from documents.", issues: [{ severity: "error", message: "Policy number missing" }, { severity: "ok", message: "Invoice available" }, { severity: "ok", message: "Medical report available" }, { severity: "ok", message: "Discharge summary available" }], daysAgo: 6 },
];

export interface SeedAppointment {
  ref: string;
  patientRef: string;
  providerRef: string;
  caseRef?: string;
  daysFromNow: number; // negative = past
  time: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  reason: string;
  source: "WEB" | "VOICE" | "PHONE";
  notes?: string;
}

export const APPOINTMENTS: SeedAppointment[] = [
  { ref: "APT-2026-1001", patientRef: "PAT-1004", providerRef: "PRV-2018", caseRef: "CASE-1010", daysFromNow: -11, time: "10:00", status: "COMPLETED", reason: "Fever and sore throat", source: "WEB" },
  { ref: "APT-2026-1002", patientRef: "PAT-1005", providerRef: "PRV-2007", caseRef: "CASE-1011", daysFromNow: -19, time: "14:00", status: "COMPLETED", reason: "Severe toothache", source: "WEB" },
  { ref: "APT-2026-1003", patientRef: "PAT-1006", providerRef: "PRV-2008", caseRef: "CASE-1012", daysFromNow: -8, time: "09:30", status: "COMPLETED", reason: "Allergic skin rash", source: "PHONE", notes: "Booked by the voice agent on CALL-0902." },
  { ref: "APT-2026-1004", patientRef: "PAT-1008", providerRef: "PRV-2002", caseRef: "CASE-1014", daysFromNow: -14, time: "11:00", status: "COMPLETED", reason: "Suspected food poisoning", source: "VOICE" },
  { ref: "APT-2026-1005", patientRef: "PAT-1009", providerRef: "PRV-2017", caseRef: "CASE-1015", daysFromNow: -1, time: "15:00", status: "COMPLETED", reason: "Knee injury assessment", source: "WEB" },
  // After discharge from cardiac observation (CASE-1024); also reviews his dizziness (CASE-1013).
  { ref: "APT-2026-1006", patientRef: "PAT-1007", providerRef: "PRV-2005", caseRef: "CASE-1024", daysFromNow: 5, time: "10:30", status: "CONFIRMED", reason: "Cardiology follow-up after discharge", source: "WEB" },
  { ref: "APT-2026-1007", patientRef: "PAT-1002", providerRef: "PRV-2004", caseRef: "CASE-1017", daysFromNow: 3, time: "14:00", status: "CONFIRMED", reason: "Cast review and fit-to-fly", source: "VOICE", notes: "Booked by the voice agent on CALL-0912." },
  { ref: "APT-2026-1008", patientRef: "PAT-1003", providerRef: "PRV-2005", caseRef: "CASE-1022", daysFromNow: 2, time: "11:30", status: "CONFIRMED", reason: "Cardiology clearance", source: "WEB" },
  { ref: "APT-2026-1009", patientRef: "PAT-1010", providerRef: "PRV-2013", caseRef: "CASE-1016", daysFromNow: 2, time: "10:30", status: "PENDING", reason: "Eye irritation", source: "WEB" },
  { ref: "APT-2026-1010", patientRef: "PAT-1001", providerRef: "PRV-2003", caseRef: "CASE-1020", daysFromNow: -6, time: "16:00", status: "CANCELLED", reason: "Post-discharge check", source: "VOICE", notes: "Cancelled on CALL-0906: Feels well since her discharge this morning; doesn't need the check-up" },
];

export const KNOWLEDGE_DOCUMENTS = [
  {
    slug: "plan-benefits",
    title: "Travel Policy Plans and Benefits (Essential, Plus, Premier)",
    category: "Coverage",
    content:
      "Three plans are sold. Essential: emergency medical expenses up to EUR 50,000 with a EUR 100 excess; emergency dental up to EUR 300; medical evacuation and repatriation covered when medically necessary; baggage delay EUR 150 after 12 hours; trip delay, trip cancellation and pre-existing conditions are NOT covered. Plus: medical expenses up to EUR 250,000 with a EUR 50 excess; emergency dental up to EUR 500; evacuation and repatriation covered; trip delay EUR 30 per full 6 hours of delay, up to EUR 300, after a minimum 6-hour delay; baggage delay EUR 300; trip cancellation up to EUR 3,000; declared stable pre-existing conditions up to EUR 10,000. Premier: medical expenses up to EUR 1,000,000 with no excess; emergency dental up to EUR 1,000; evacuation and repatriation covered; trip delay EUR 50 per full 6 hours, up to EUR 600, after a minimum 4-hour delay; baggage delay EUR 500; trip cancellation up to EUR 10,000; declared pre-existing conditions covered within the medical limit. All benefits require a valid policy on the date of the event; final decisions are made by the claims team.",
  },
  {
    slug: "trip-delay-cover",
    title: "Trip Delay and Missed Connection Cover",
    category: "Coverage",
    content:
      "Trip delay benefit compensates delays of the booked public transport (flight, train, ship) caused by weather, strikes or mechanical failure of the carrier. It is paid per full block of 6 hours after the plan's minimum delay (Plus: 6 hours, Premier: 4 hours) up to the plan limit; Essential has no trip delay cover. Delays caused by the traveller, known strikes announced before departure, or voluntary changes of itinerary are excluded. Claims need written confirmation from the carrier stating the scheduled and actual departure times and the reason for the delay. Receipts for reasonable meals and accommodation are needed only when claiming above the flat benefit. The claim must be submitted within 30 days of return.",
  },
  {
    slug: "hospitalization-required-documents",
    title: "Required Documents for a Hospitalization Case",
    category: "Case Procedures",
    content:
      "For every hospitalization case the following documents are required before a claim can be settled: a medical report from the treating physician, an itemised hospital invoice, a discharge summary, and the patient's policy number. A prescription is required only when medication costs are claimed separately. The case manager must verify that the policy number on the documents matches the policy in the system. If the policy number is missing, request it from the patient or the insurer before approving the claim. Documents should be uploaded to the case within 48 hours of discharge.",
  },
  {
    slug: "hospital-admission-process",
    title: "Process for Arranging Hospital Admission",
    category: "Case Procedures",
    content:
      "To arrange a hospital admission: 1) Confirm the patient's identity, policy number and coverage. 2) Select a network hospital using Provider Search, preferring providers close to the patient with the required specialty and language. 3) Call the hospital's international patient desk and confirm bed availability. 4) Issue a guarantee of payment (GOP) to the hospital — by fax, or by e-mail when no fax number is known — stating the guaranteed amount. 5) Inform the patient and their family of the admission details. 6) Create or update the assistance case with the admission date, hospital and attending physician. 7) Monitor the patient daily until discharge and collect the discharge documents.",
  },
  {
    slug: "guarantee-of-payment",
    title: "Guarantee of Payment (GOP) Procedure",
    category: "Finance",
    content:
      "A guarantee of payment (Letter of Guarantee, LOG) is issued to network hospitals for inpatient cases after coverage verification, in answer to the hospital's cost estimate. The letter states the patient name, policy number, admission date, the covered treatment, the guaranteed amount and any excess. The amount is set by fixed rules against the policy — the remaining medical limit, the hospital admission benefit and the excess — never by the AI. Letters within the policy and up to EUR 10,000 (the automatic approval limit) are approved and faxed to the hospital automatically. Letters above EUR 10,000, or flagged by the rules (estimate above the remaining limit, possible pre-existing condition, policy not valid), wait for a case manager, who approves, lowers or declines them. Extensions are granted per 48 hours of stay after a medical update from the treating physician. The LOG reference is recorded on the case timeline.",
  },
  {
    slug: "claims-processing-sop",
    title: "Claims Processing Standard Operating Procedure",
    category: "Claims",
    content:
      "Claims are processed in five steps: document intake, document classification, information extraction, completeness check and human review. A claim is complete when it holds a medical report, an itemised invoice, a discharge summary (for inpatient cases) and a valid policy number. Incomplete claims are set to 'Information Requested' and the traveller is contacted. Claims with all documents but unusual amounts (over 20,000 TRY outpatient or 100,000 TRY inpatient) are escalated to a senior claims handler. Approved claims are paid within 10 business days.",
  },
  {
    slug: "istanbul-provider-network",
    title: "Istanbul Provider Network Overview",
    category: "Providers",
    content:
      "The demo Istanbul network covers 18 providers across Taksim, Beyoglu, Sisli, Besiktas, Kadikoy, Uskudar, Fatih, Sultanahmet, Levent, Nisantasi, Bakirkoy and Atasehir. Specialties include general medicine, cardiology, gastroenterology, orthopedics, dentistry, dermatology, neurology, pediatrics, ophthalmology, ENT and obstetrics. English-speaking doctors are available at all network facilities; German, French, Russian, Arabic and Spanish are available at selected clinics. Every network clinic takes bookings seven days a week until at least 22:00, with evening clinics for most specialists. For late-evening needs use Taksim Demo International Clinic, Sultanahmet Demo Health House or Bakirkoy Demo General Hospital, which see patients every day until 23:30.",
  },
  {
    slug: "emergency-escalation",
    title: "Emergency Escalation Procedure",
    category: "Case Procedures",
    content:
      "Cases involving chest pain, loss of consciousness, severe bleeding, stroke symptoms or difficulty breathing are classified CRITICAL. For CRITICAL cases: advise the caller to contact local emergency services (dial 112 in Turkiye) immediately, then alert the on-duty medical officer, open a case with priority CRITICAL, and notify the senior desk within 15 minutes. An AI agent must never provide medical advice beyond directing to emergency services; the medical officer takes clinical decisions.",
  },
  {
    slug: "repatriation-guidelines",
    title: "Medical Repatriation Guidelines",
    category: "Case Procedures",
    content:
      "Repatriation on medical grounds requires: a written report from the treating physician, a fit-to-fly assessment, airline medical clearance (MEDIF form) where needed, and approval by the medical director. Options in ascending order of cost: commercial flight unescorted, commercial flight with medical escort, stretcher on commercial aircraft, and air ambulance. The case manager coordinates ground transport on both ends and informs the receiving hospital.",
  },
  {
    slug: "language-support-policy",
    title: "Language Support Policy",
    category: "Operations",
    content:
      "Travellers should be served in their preferred language where possible. Provider Search records the languages spoken at each facility. If no provider speaks the traveller's language at the required time, offer the nearest alternative and arrange a telephone interpreter. Interpreter costs are covered under assistance operations, not the medical claim.",
  },
];

export const DEMO_KB_COUNTS = {
  patients: PATIENTS.length,
  providers: PROVIDERS.length,
  cases: CASES.length,
  claims: CLAIMS.length,
  appointments: APPOINTMENTS.length,
  knowledgeDocuments: KNOWLEDGE_DOCUMENTS.length,
};

// --- Travel policies (one per patient; fictional) ------------------------------

type Benefit = {
  code: string;
  label: string;
  covered: boolean;
  limit: number | null;
  unit?: string;
  excess: number;
  waitingHours?: number;
  conditions: string[];
};

export const POLICY_PLANS: Record<"Essential" | "Plus" | "Premier", { medicalLimit: number; benefits: Benefit[] }> = {
  Essential: {
    medicalLimit: 50000,
    benefits: [
      { code: "MEDICAL_EXPENSES", label: "Emergency medical expenses", covered: true, limit: 50000, excess: 100, conditions: ["Emergency treatment only", "Network providers preferred"] },
      { code: "HOSPITALIZATION", label: "Hospital admission", covered: true, limit: 50000, excess: 100, conditions: ["Requires a guarantee of payment from the assistance team"] },
      { code: "EMERGENCY_DENTAL", label: "Emergency dental treatment", covered: true, limit: 300, excess: 0, conditions: ["Pain relief only"] },
      { code: "MEDICAL_EVACUATION", label: "Medical evacuation", covered: true, limit: null, excess: 0, conditions: ["When medically necessary and arranged by the assistance team"] },
      { code: "REPATRIATION", label: "Medical repatriation", covered: true, limit: null, excess: 0, conditions: ["Arranged by the assistance team"] },
      { code: "TRIP_DELAY", label: "Trip delay", covered: false, limit: null, excess: 0, conditions: ["Not included in Essential"] },
      { code: "BAGGAGE_DELAY", label: "Baggage delay", covered: true, limit: 150, excess: 0, waitingHours: 12, conditions: ["Carrier's property irregularity report required"] },
      { code: "TRIP_CANCELLATION", label: "Trip cancellation", covered: false, limit: null, excess: 0, conditions: ["Not included in Essential"] },
      { code: "PRE_EXISTING_CONDITIONS", label: "Pre-existing conditions", covered: false, limit: null, excess: 0, conditions: ["Not included in Essential"] },
    ],
  },
  Plus: {
    medicalLimit: 250000,
    benefits: [
      { code: "MEDICAL_EXPENSES", label: "Emergency medical expenses", covered: true, limit: 250000, excess: 50, conditions: ["Emergency treatment only"] },
      { code: "HOSPITALIZATION", label: "Hospital admission", covered: true, limit: 250000, excess: 50, conditions: ["Requires a guarantee of payment from the assistance team"] },
      { code: "EMERGENCY_DENTAL", label: "Emergency dental treatment", covered: true, limit: 500, excess: 0, conditions: ["Pain relief only"] },
      { code: "MEDICAL_EVACUATION", label: "Medical evacuation", covered: true, limit: null, excess: 0, conditions: ["When medically necessary and arranged by the assistance team"] },
      { code: "REPATRIATION", label: "Medical repatriation", covered: true, limit: null, excess: 0, conditions: ["Arranged by the assistance team"] },
      { code: "TRIP_DELAY", label: "Trip delay", covered: true, limit: 300, unit: "EUR 30 per full 6 hours", excess: 0, waitingHours: 6, conditions: ["Carrier's written confirmation of the delay and its reason", "Claim within 30 days of return"] },
      { code: "BAGGAGE_DELAY", label: "Baggage delay", covered: true, limit: 300, excess: 0, waitingHours: 12, conditions: ["Carrier's property irregularity report required"] },
      { code: "TRIP_CANCELLATION", label: "Trip cancellation", covered: true, limit: 3000, excess: 100, conditions: ["Listed reasons only (illness, bereavement, jury service)"] },
      { code: "PRE_EXISTING_CONDITIONS", label: "Pre-existing conditions", covered: true, limit: 10000, excess: 50, conditions: ["Declared and stable for 6 months before travel"] },
    ],
  },
  Premier: {
    medicalLimit: 1000000,
    benefits: [
      { code: "MEDICAL_EXPENSES", label: "Emergency medical expenses", covered: true, limit: 1000000, excess: 0, conditions: ["Emergency treatment"] },
      { code: "HOSPITALIZATION", label: "Hospital admission", covered: true, limit: 1000000, excess: 0, conditions: ["Requires a guarantee of payment from the assistance team"] },
      { code: "EMERGENCY_DENTAL", label: "Emergency dental treatment", covered: true, limit: 1000, excess: 0, conditions: ["Pain relief and temporary repairs"] },
      { code: "MEDICAL_EVACUATION", label: "Medical evacuation", covered: true, limit: null, excess: 0, conditions: ["When medically necessary and arranged by the assistance team"] },
      { code: "REPATRIATION", label: "Medical repatriation", covered: true, limit: null, excess: 0, conditions: ["Arranged by the assistance team"] },
      { code: "TRIP_DELAY", label: "Trip delay", covered: true, limit: 600, unit: "EUR 50 per full 6 hours", excess: 0, waitingHours: 4, conditions: ["Carrier's written confirmation of the delay and its reason", "Claim within 30 days of return"] },
      { code: "BAGGAGE_DELAY", label: "Baggage delay", covered: true, limit: 500, excess: 0, waitingHours: 6, conditions: ["Carrier's property irregularity report required"] },
      { code: "TRIP_CANCELLATION", label: "Trip cancellation", covered: true, limit: 10000, excess: 0, conditions: ["Listed reasons only (illness, bereavement, jury service)"] },
      { code: "PRE_EXISTING_CONDITIONS", label: "Pre-existing conditions", covered: true, limit: 1000000, excess: 0, conditions: ["Declared before travel"] },
    ],
  },
};

/** Which plan each fictional patient holds, and how much of the medical limit is used. */
export const PATIENT_POLICIES: { patientRef: string; plan: keyof typeof POLICY_PLANS; medicalUsed: number; currency?: string }[] = [
  { patientRef: "PAT-1001", plan: "Plus", medicalUsed: 4200 },
  { patientRef: "PAT-1002", plan: "Premier", medicalUsed: 0 },
  { patientRef: "PAT-1003", plan: "Essential", medicalUsed: 1850 },
  { patientRef: "PAT-1004", plan: "Plus", medicalUsed: 640 },
  { patientRef: "PAT-1005", plan: "Essential", medicalUsed: 0 },
  { patientRef: "PAT-1006", plan: "Plus", medicalUsed: 0 },
  { patientRef: "PAT-1007", plan: "Premier", medicalUsed: 12500 },
  { patientRef: "PAT-1008", plan: "Essential", medicalUsed: 46200 },
  { patientRef: "PAT-1009", plan: "Plus", medicalUsed: 980 },
  { patientRef: "PAT-1010", plan: "Premier", medicalUsed: 0 },
  // Asia-Pacific: limits in SGD.
  { patientRef: "PAT-0951", plan: "Premier", medicalUsed: 0, currency: "SGD" },
  { patientRef: "PAT-0952", plan: "Plus", medicalUsed: 0, currency: "SGD" },
];

// --- Activity history: calls, e-mail & fax intake, Letters of Guarantee -------
// A modest, realistic history so every module has something to show on a
// fresh database. Times are Istanbul wall-clock, relative to the seed run.
// Refs use numbers below the live sequences (CALL-/MSG-/LOG- start at 1001),
// so they never collide with records the running app creates.

/** When something happened: `daysAgo` at an Istanbul wall-clock time, or `minutesAgo`. */
export type SeedWhen = { daysAgo: number; time: string } | { minutesAgo: number };

/** Calendar helpers the history is written with (provided by the seed run). */
export interface SeedClock {
  /** Istanbul date `n` days from today, "YYYY-MM-DD" (negative = past). */
  date(n: number): string;
  /** The same date in words, e.g. "Monday 19 October". */
  spoken(n: number): string;
}

export interface SeedTimelineEvent {
  type: "CALL" | "NOTE" | "APPOINTMENT";
  title: string;
  body: string | null;
  actor: string;
  data?: Record<string, unknown>;
  /** Seconds after the call was answered. */
  after: number;
}

export interface SeedCall {
  ref: string;
  when: SeedWhen;
  direction: "INBOUND" | "OUTBOUND";
  channel: "PHONE" | "BROWSER";
  agentProfile: string;
  status: "COMPLETED" | "TRANSFERRED" | "VOICEMAIL";
  /** ISO 639-1 language the caller spoke. */
  language: string;
  fromNumber: string | null;
  toNumber: string | null;
  caseRef?: string;
  placedBy?: string;
  ringSec: number;
  durationSec: number;
  transferredTo?: "doctor" | "case_manager";
  /** What the agent's tools recorded (outbound calls also carry their brief). */
  outcome: Record<string, unknown>;
  endReason: string;
  summary: string;
  transcript: ["agent" | "user", string][];
  /** Timeline entries the agent's tools wrote during the call. */
  events: SeedTimelineEvent[];
}

const HOTLINE = "+15550100199"; // AI hotline and outbound caller ID
const FAX_LINE = "+15550100198"; // the assistance desk's fax line
const MARMARA = "+902120002005"; // Marmara Demo Heart Center (PRV-2005)

const HOTLINE_GREETING =
  "Hello, you've reached the 24/7 assistance line. I'm Ada, an AI assistant — this is a demonstration line, so please don't share real medical details. How can I help?";
const BOOKING_GREETING =
  "Hello, I'm Ada, the AI medical assistance agent. This is a demonstration, so please don't share real medical details. How can I help you today?";

const LENA_HANDOFF =
  "Lena Koch has had severe chest pain and shortness of breath for twenty minutes at her hotel in Sisli. Her husband is on the line; the hotel has called 112.";

const OLIVER_HOSPITAL_UPDATE = {
  admitted: true,
  ward: "Coronary care unit (bed 4)",
  attending_doctor: "Dr. Baran Ozturk",
  estimated_cost: 1850,
  currency: "EUR",
  report_eta: "tomorrow around noon",
  guarantee_requested: true,
  condition_note: "Stable on cardiac monitoring; troponin results pending",
};

export function seedCalls(clock: SeedClock): SeedCall[] {
  return [
    {
      ref: "CALL-0901",
      when: { daysAgo: 10, time: "17:30" },
      direction: "OUTBOUND",
      channel: "PHONE",
      agentProfile: "outbound-wellbeing-followup",
      status: "COMPLETED",
      language: "fr",
      fromNumber: HOTLINE,
      toNumber: "+905550120417",
      caseRef: "CASE-1010",
      placedBy: "mehmet",
      ringSec: 6,
      durationSec: 104,
      outcome: {
        brief: { calling: "Sophie Martin (traveller)", language: "French", case: "CASE-1010", reason: "Fever and sore throat — Sultanahmet", lastVisit: `Dr. Leyla Ozkan, Sultanahmet Demo Health House, ${clock.date(-11)} (completed)` },
        retries: 0,
        followup: { attended: true, status: "better" },
      },
      endReason: "conversation complete",
      summary: "Wellbeing follow-up with Sophie Martin, in French, the day after her GP visit: the fever has gone, her throat is still a little sore and she needs nothing further. Case marked resolved.",
      transcript: [
        ["agent", "Bonjour, ici Ada, l'assistante IA de votre compagnie d'assistance voyage. Je souhaiterais parler à Sophie Martin. Est-ce un bon moment ?"],
        ["user", "Oui, c'est moi. Bonjour !"],
        ["agent", "Je vous appelle pour prendre de vos nouvelles après votre consultation d'hier avec le Dr Ozkan. Comment vous sentez-vous ?"],
        ["user", "Beaucoup mieux, merci. La fièvre est tombée cette nuit, j'ai encore un peu mal à la gorge."],
        ["agent", "Je suis contente de l'entendre. Avez-vous besoin d'un nouveau rendez-vous ou d'aide pour vos médicaments ?"],
        ["user", "Non, j'ai tout ce qu'il me faut. Je continue le traitement."],
        ["agent", "Parfait. Si quelque chose change, appelez la ligne d'assistance à tout moment, jour et nuit. Bon séjour à Istanbul !"],
        ["user", "Merci beaucoup, au revoir."],
      ],
      events: [
        { type: "NOTE", title: "Follow-up call CALL-0901: traveller feels better", body: "Visit attended.", data: { attended: true, status: "better" }, actor: "agent:outbound-wellbeing-followup", after: 85 },
      ],
    },
    {
      ref: "CALL-0902",
      when: { daysAgo: 9, time: "16:38" },
      direction: "INBOUND",
      channel: "PHONE",
      agentProfile: "inbound-hotline",
      status: "COMPLETED",
      language: "en",
      fromNumber: "+905550136652",
      toNumber: HOTLINE,
      caseRef: "CASE-1012",
      ringSec: 1,
      durationSec: 212,
      outcome: { caseRef: "CASE-1012", urgency: "LOW", appointmentRef: "APT-2026-1003" },
      endReason: "conversation complete",
      summary: "Emma Van Dijk called about an itchy rash on both arms, possibly from a new sun cream; no breathing problems or swelling. The agent opened CASE-1012 and booked dermatologist Dr. Elif Yildiz at Uskudar Demo Polyclinic for the next morning (APT-2026-1003).",
      transcript: [
        ["agent", HOTLINE_GREETING],
        ["user", "Hi! I've had an itchy red rash on both arms since yesterday. I think it might be a new sun cream. I'm staying in Kadikoy."],
        ["agent", "I'm sorry, that sounds uncomfortable. First — any trouble breathing, or swelling of your face or lips?"],
        ["user", "No, nothing like that. It's just really itchy."],
        ["agent", "Thank you. I've opened a case for you. Let me look for a dermatologist nearby… Dr. Elif Yildiz at Uskudar Demo Polyclinic, about ten minutes from Kadikoy, speaks English and can see you tomorrow at half past nine. Shall I book it?"],
        ["user", "Yes please, tomorrow morning is perfect."],
        ["agent", "Done. Your appointment reference is APT-2026-1003 and your case is CASE-1012. Please bring your passport and policy number. Is there anything else I can help with?"],
        ["user", "No, that's all. Thank you so much!"],
      ],
      events: [
        { type: "NOTE", title: "Case opened by the voice agent", body: "Emma Van Dijk (staying in Kadikoy) has had an itchy red rash on both arms since yesterday, possibly a reaction to a new sun cream. No breathing difficulty or facial swelling. Wants a dermatologist.", actor: "agent:inbound-hotline", after: 60 },
        { type: "APPOINTMENT", title: "Appointment APT-2026-1003 booked", body: `Dr. Elif Yildiz, Uskudar Demo Polyclinic (Uskudar) — ${clock.date(-8)} 09:30`, data: { appointmentRef: "APT-2026-1003", callRef: "CALL-0902" }, actor: "agent:inbound-hotline", after: 165 },
      ],
    },
    {
      ref: "CALL-0903",
      when: { daysAgo: 8, time: "12:20" },
      direction: "INBOUND",
      channel: "BROWSER",
      agentProfile: "appointment-booking",
      status: "COMPLETED",
      language: "ar",
      fromNumber: null,
      toNumber: null,
      ringSec: 0,
      durationSec: 148,
      outcome: {},
      endReason: "caller hung up",
      summary: "An Arabic-speaking mother in Sultanahmet asked for an Arabic-speaking doctor for her eight-year-old son's earache (mild fever, no red flags). The agent offered Dr. Leyla Ozkan at Sultanahmet Demo Health House at 16:00 or 18:00 the same day; she will talk to her husband and call back.",
      transcript: [
        ["agent", BOOKING_GREETING],
        ["user", "مرحباً، هل تتكلمين العربية؟ ابني عمره ثماني سنوات ويشكو من ألم في أذنه منذ الصباح. نحن في السلطان أحمد."],
        ["agent", "نعم، بالطبع. سلامته. هل لديه حرارة مرتفعة جداً، أو صعوبة في التنفس، أو نعاس غير عادي؟"],
        ["user", "حرارة خفيفة فقط، لكنه يبكي من الألم."],
        ["agent", "لحظة، أبحث عن طبيب قريب… الدكتورة ليلى أوزكان في عيادة Sultanahmet Demo Health House تتكلم العربية، وهي على بعد خمس دقائق مشياً، ولديها موعد اليوم الساعة الرابعة أو السادسة مساءً. هل أحجز لكم أحد الموعدين؟"],
        ["user", "شكراً جزيلاً. سأتكلم مع زوجي أولاً ثم أتصل بكم مرة أخرى."],
        ["agent", "على الرحب والسعة. اتصلوا بنا في أي وقت. وإذا ارتفعت الحرارة أو ساءت حالته، اتصلوا فوراً بالرقم 112. مع السلامة."],
      ],
      events: [],
    },
    {
      ref: "CALL-0904",
      when: { daysAgo: 7, time: "17:30" },
      direction: "OUTBOUND",
      channel: "PHONE",
      agentProfile: "outbound-wellbeing-followup",
      status: "VOICEMAIL",
      language: "en",
      fromNumber: HOTLINE,
      toNumber: "+905550136652",
      caseRef: "CASE-1012",
      placedBy: "mehmet",
      ringSec: 22,
      durationSec: 41,
      outcome: {
        brief: { calling: "Emma Van Dijk (traveller)", language: "English", case: "CASE-1012", reason: "Skin rash — Kadikoy", lastVisit: `Dr. Elif Yildiz, Uskudar Demo Polyclinic, ${clock.date(-8)} (completed)` },
        retries: 0,
        answeredBy: "machine_end_beep",
      },
      endReason: "conversation complete",
      summary: "Wellbeing follow-up after Emma Van Dijk's dermatology visit reached her voicemail. The agent left a short message: it will try again tomorrow, and she can call the assistance line any time.",
      transcript: [
        ["user", "Hi, this is Emma — I can't take your call right now. Leave a message after the beep!"],
        ["agent", "Hello Emma, this is Ada, the AI assistant at CareTrail, your travel assistance service. I'm calling to see how you're feeling after your visit to Dr. Yildiz yesterday. There's nothing you need to do — we'll try you again tomorrow, or you can call the assistance line any time, day or night. Take care!"],
      ],
      events: [],
    },
    {
      ref: "CALL-0905",
      when: { daysAgo: 6, time: "11:05" },
      direction: "INBOUND",
      channel: "PHONE",
      agentProfile: "inbound-hotline",
      status: "COMPLETED",
      language: "en",
      fromNumber: "+905550158804",
      toNumber: HOTLINE,
      ringSec: 1,
      durationSec: 156,
      outcome: { coverageChecked: { policy: "POL-TR-100953", benefit: "BAGGAGE_DELAY" } },
      endReason: "conversation complete",
      summary: "Siobhan Murphy asked whether her delayed suitcase is covered. Policy POL-TR-100953 (Premier) verified: baggage delay is covered up to EUR 500 once the bag is more than 6 hours late, with the airline's property irregularity report and receipts; the claims team makes the final decision.",
      transcript: [
        ["agent", HOTLINE_GREETING],
        ["user", "Hello. My suitcase didn't arrive with my flight this morning and the airline says it could take a day or two. Am I covered if I buy a few essentials?"],
        ["agent", "Let me check that for you. Could you give me your policy number and your date of birth?"],
        ["user", "It's POL-TR-100953, and I was born on the eleventh of June, 1969."],
        ["agent", "Thank you, Ms Murphy. Your Premier plan covers baggage delay up to 500 euros once your bag is more than six hours late, with no excess. You'll need the airline's property irregularity report and the receipts for what you buy. The claims team makes the final decision."],
        ["user", "Brilliant. I got the report at the airport, so I'll keep my receipts."],
        ["agent", "Perfect. Is there anything else I can help you with?"],
        ["user", "No, that's everything. Thanks so much."],
      ],
      events: [],
    },
    {
      ref: "CALL-0906",
      when: { daysAgo: 6, time: "11:40" },
      direction: "OUTBOUND",
      channel: "PHONE",
      agentProfile: "outbound-appointment-reminder",
      status: "COMPLETED",
      language: "en",
      fromNumber: HOTLINE,
      toNumber: "+447700900101",
      caseRef: "CASE-1020",
      placedBy: "elif",
      ringSec: 5,
      durationSec: 97,
      outcome: {
        brief: {
          calling: "Aylin Yilmaz (traveller)",
          language: "English",
          case: "CASE-1020",
          appointment: { ref: "APT-2026-1010", date: clock.date(-6), time: "16:00", doctor: "Dr. Kerem Aydin", facility: "Istanbul Central Demo Hospital", address: "Halaskargazi Cd. 100, Sisli", reason: "Post-discharge check" },
        },
        retries: 0,
        cancelled: "APT-2026-1010",
      },
      endReason: "conversation complete",
      summary: "Reminder call for Aylin Yilmaz's post-discharge check at Istanbul Central Demo Hospital that afternoon. She has felt well since her discharge in the morning and asked to cancel; APT-2026-1010 was cancelled with her agreement.",
      transcript: [
        ["agent", "Hello, this is Ada, the AI assistant at CareTrail, your travel assistance service. May I speak to Aylin Yilmaz?"],
        ["user", "Speaking."],
        ["agent", "I'm calling about your check-up with Dr. Kerem Aydin at Istanbul Central Demo Hospital this afternoon at four. Will you be able to make it?"],
        ["user", "Honestly, I've felt completely fine since they discharged me this morning. Do I still need it?"],
        ["agent", "I can't give medical advice, but I can cancel it if you'd like, and you can ask for a new appointment at any time. Shall I cancel it?"],
        ["user", "Yes, please cancel it."],
        ["agent", "Done — the four o'clock appointment is cancelled. If anything changes, call the assistance line and we'll find you a doctor quickly. Enjoy the rest of your trip."],
        ["user", "Thank you, bye!"],
      ],
      events: [
        { type: "APPOINTMENT", title: "APT-2026-1010 cancelled", body: "Feels well since her discharge this morning; doesn't need the check-up", actor: "agent:outbound-appointment-reminder", after: 75 },
      ],
    },
    {
      ref: "CALL-0907",
      when: { daysAgo: 4, time: "13:10" },
      direction: "INBOUND",
      channel: "PHONE",
      agentProfile: "inbound-hotline",
      status: "COMPLETED",
      language: "ru",
      fromNumber: "+905550172390",
      toNumber: HOTLINE,
      ringSec: 1,
      durationSec: 118,
      outcome: {},
      endReason: "conversation complete",
      summary: "Irina Volkova asked, in Russian, about claim CLM-10239. The agent confirmed it is approved (GP visit and medication, 1,150 TRY), that nothing else is needed, and that payment usually follows within 10 business days of approval.",
      transcript: [
        ["agent", HOTLINE_GREETING],
        ["user", "Здравствуйте! Можно по-русски? Я хотела узнать, что с моей заявкой на возмещение, номер CLM-10239."],
        ["agent", "Конечно. Минутку, проверяю… Заявка CLM-10239 одобрена: визит к врачу и лекарства, 1 150 турецких лир. Выплата обычно поступает в течение десяти рабочих дней после одобрения."],
        ["user", "Отлично. Мне нужно ещё что-нибудь прислать?"],
        ["agent", "Нет, все документы у нас есть. Могу ещё чем-нибудь помочь?"],
        ["user", "Нет, спасибо большое. До свидания!"],
        ["agent", "Всего доброго и хорошей поездки!"],
      ],
      events: [],
    },
    {
      ref: "CALL-0908",
      when: { daysAgo: 3, time: "07:05" },
      direction: "INBOUND",
      channel: "PHONE",
      agentProfile: "inbound-hotline",
      status: "TRANSFERRED",
      language: "de",
      fromNumber: "+905550164421",
      toNumber: HOTLINE,
      caseRef: "CASE-1022",
      ringSec: 1,
      durationSec: 74,
      transferredTo: "doctor",
      outcome: { caseRef: "CASE-1022", urgency: "CRITICAL", handoff: { target: "doctor", reason: "Chest pain and shortness of breath", summary: LENA_HANDOFF } },
      endReason: "call ended",
      summary: "Lena Koch's husband called, in German, at 07:05: severe chest pain and shortness of breath at their hotel in Sisli. The agent told him to call 112, opened critical case CASE-1022 and transferred the call to the on-call doctor.",
      transcript: [
        ["agent", HOTLINE_GREETING],
        ["user", "Hallo, sprechen Sie Deutsch? Meine Frau hat seit zwanzig Minuten starke Schmerzen in der Brust und bekommt schlecht Luft. Wir sind im Hotel in Şişli."],
        ["agent", "Ja, natürlich. Bitte rufen Sie sofort den Notruf 112 an. Ich verbinde Sie gleich mit unserem diensthabenden Arzt. Wie heißt Ihre Frau, und haben Sie die Versicherungsnummer zur Hand?"],
        ["user", "Lena Koch. Die Nummer ist POL-TR-100946. Die Rezeption hat schon den Krankenwagen gerufen."],
        ["agent", "Danke, Herr Koch. Ich habe einen dringenden Fall angelegt. Bleiben Sie bitte am Apparat — ich verbinde Sie jetzt mit dem Arzt."],
      ],
      events: [
        { type: "NOTE", title: "Case opened by the voice agent", body: LENA_HANDOFF, actor: "agent:inbound-hotline", after: 50 },
        { type: "CALL", title: "CALL-0908 handed to the on-call doctor", body: `Chest pain and shortness of breath. ${LENA_HANDOFF}`, actor: "agent:inbound-hotline", after: 66 },
      ],
    },
    {
      ref: "CALL-0909",
      when: { daysAgo: 3, time: "09:20" },
      direction: "OUTBOUND",
      channel: "PHONE",
      agentProfile: "outbound-log-confirmation",
      status: "COMPLETED",
      language: "tr",
      fromNumber: HOTLINE,
      toNumber: MARMARA,
      caseRef: "CASE-1022",
      placedBy: "elif",
      ringSec: 4,
      durationSec: 131,
      outcome: {
        brief: {
          calling: "Marmara Demo Heart Center — billing / international patients office",
          patient: "Lena Koch, born 1964-07-29",
          case: "CASE-1022",
          letter: { ref: "LOG-0902", amount: "11,850 EUR", sentBy: "fax", sentTo: MARMARA, validUntil: clock.date(4) },
        },
        retries: 0,
        letterReceipt: { ref: "LOG-0902", received: true },
      },
      endReason: "conversation complete",
      summary: "Turkish call to Marmara Demo Heart Center's international patients office: receipt of LOG-0902 (EUR 11,850) for Lena Koch confirmed. She is in the coronary care unit, angiography is scheduled for 11:00, and the discharge summary will follow by e-mail.",
      transcript: [
        ["agent", "İyi günler, ben Ada; seyahat asistans şirketinin tıbbi asistans masası adına arayan bir yapay zekâ asistanıyım. Faturalama ya da uluslararası hasta birimiyle mi görüşüyorum?"],
        ["user", "Evet, uluslararası hasta birimi. Buyurun."],
        ["agent", "Sigortalımız Lena Koch için LOG-0902 numaralı garanti mektubunu bu sabah sekiz buçuk sularında faksla gönderdik; tutar on bir bin sekiz yüz elli euro. Mektup size ulaştı mı?"],
        ["user", "Evet, ulaştı, dosyaya ekledik. Hasta koroner yoğun bakımda; anjiyografi saat on birde yapılacak."],
        ["agent", "Teşekkür ederim. Bizden başka bir belge ya da bilgi gerekiyor mu?"],
        ["user", "Şimdilik hayır. Epikrizi taburculukta e-postayla göndereceğiz."],
        ["agent", "Çok teşekkürler. İyi çalışmalar dilerim, hoşça kalın."],
      ],
      // The receipt itself is recorded with the letter (LOG-0902).
      events: [],
    },
    {
      ref: "CALL-0910",
      when: { daysAgo: 2, time: "19:00" },
      direction: "OUTBOUND",
      channel: "PHONE",
      agentProfile: "outbound-appointment-reminder",
      status: "COMPLETED",
      language: "en",
      fromNumber: HOTLINE,
      toNumber: "+905550189036",
      caseRef: "CASE-1015",
      placedBy: "mehmet",
      ringSec: 7,
      durationSec: 88,
      outcome: {
        brief: {
          calling: "Carlos Garcia (traveller)",
          language: "Spanish",
          case: "CASE-1015",
          appointment: { ref: "APT-2026-1005", date: clock.date(-1), time: "15:00", doctor: "Dr. Cem Duran", facility: "Besiktas Demo Sports Medicine", address: "Ciragan Cd. 40, Besiktas", reason: "Knee injury assessment" },
        },
        retries: 0,
        confirmed: "APT-2026-1005",
      },
      endReason: "conversation complete",
      summary: "Reminder call to Carlos Garcia for his orthopaedic appointment with Dr. Cem Duran at Besiktas Demo Sports Medicine the next afternoon. He confirmed he will attend; the knee is still swollen, so he will take a taxi.",
      transcript: [
        ["agent", "Hola, this is Ada, the AI assistant at CareTrail, your travel assistance service. Am I speaking with Carlos Garcia?"],
        ["user", "Yes, that's me. English is fine."],
        ["agent", "I'm calling to remind you of your appointment tomorrow at 3 p.m. with Dr. Cem Duran at Besiktas Demo Sports Medicine, Ciragan Caddesi 40. Will you be able to make it?"],
        ["user", "Yes, I'll be there. The knee is still swollen, so I'll take a taxi."],
        ["agent", "Good idea. I've confirmed your appointment. Please bring your passport and your policy number. Is there anything else I can do for you?"],
        ["user", "No, that's all. Gracias!"],
        ["agent", "De nada. Take care of that knee — goodbye!"],
      ],
      events: [
        { type: "APPOINTMENT", title: "Traveller confirmed APT-2026-1005", body: "Confirmed on reminder call CALL-0910.", actor: "agent:outbound-appointment-reminder", after: 62 },
      ],
    },
    {
      ref: "CALL-0911",
      when: { daysAgo: 2, time: "20:40" },
      direction: "INBOUND",
      channel: "PHONE",
      agentProfile: "inbound-hotline",
      status: "COMPLETED",
      language: "de",
      fromNumber: "+905550164421",
      toNumber: HOTLINE,
      ringSec: 1,
      durationSec: 167,
      outcome: { coverageChecked: { policy: "POL-TR-100946", benefit: "REPATRIATION" } },
      endReason: "conversation complete",
      summary: "Lena Koch's husband asked, in German, whether her flight home with a medical escort is covered. Policy POL-TR-100946 (Essential) verified: medical repatriation is covered with no excess when the assistance team arranges it; the doctors decide on an escort and the claims team makes the final decision.",
      transcript: [
        ["agent", HOTLINE_GREETING],
        ["user", "Guten Abend, hier ist Thomas Koch. Meine Frau liegt im Marmara Demo Heart Center. Die Ärzte sagen, sie darf bald nach Hause fliegen, vielleicht aber nur mit ärztlicher Begleitung. Ist der Rücktransport versichert?"],
        ["agent", "Guten Abend, Herr Koch. Das prüfe ich gern. Nennen Sie mir bitte die Versicherungsnummer und das Geburtsdatum Ihrer Frau."],
        ["user", "POL-TR-100946, geboren am 29. Juli 1964."],
        ["agent", "Danke. Der Essential-Tarif Ihrer Frau deckt den medizinischen Rücktransport ohne Selbstbeteiligung, wenn unser Assistance-Team ihn organisiert. Ob eine ärztliche Begleitung nötig ist, klären unsere Ärzte mit dem behandelnden Team. Die endgültige Entscheidung trifft die Schadenabteilung."],
        ["user", "Gut, dann warte ich auf Ihre Nachricht. Vielen Dank."],
        ["agent", "Gern geschehen. Ihr Fallmanager meldet sich bei Ihnen. Gute Besserung für Ihre Frau!"],
      ],
      events: [],
    },
    {
      ref: "CALL-0912",
      when: { daysAgo: 1, time: "09:05" },
      direction: "INBOUND",
      channel: "BROWSER",
      agentProfile: "appointment-booking",
      status: "COMPLETED",
      language: "en",
      fromNumber: null,
      toNumber: null,
      caseRef: "CASE-1017",
      ringSec: 0,
      durationSec: 196,
      outcome: { appointmentRef: "APT-2026-1007", caseRef: "CASE-1017" },
      endReason: "caller hung up",
      summary: `James Carter, in a cast after his ankle fracture, asked for a cast review and a fit-to-fly letter before flying home. The agent booked Dr. Selin Kaya at Bosphorus Demo Orthopedic Clinic, which treated him, for ${clock.spoken(3)} at 14:00 (APT-2026-1007).`,
      transcript: [
        ["agent", BOOKING_GREETING],
        ["user", "Hi. I broke my ankle a few days ago and I'm in a cast. I need it checked before I fly home, and the airline wants a fit-to-fly letter."],
        ["agent", "I can arrange that. Which area are you staying in, and when would suit you?"],
        ["user", "Beyoglu, near Galata Tower. Any afternoon in the next few days. The clinic that treated me was the Bosphorus orthopaedic one."],
        ["agent", `Let me check… Dr. Selin Kaya at Bosphorus Demo Orthopedic Clinic in Besiktas — the clinic that treated you — can see you on ${clock.spoken(3)} at two p.m. She speaks English. Shall I book it?`],
        ["user", "Yes, that's perfect."],
        ["agent", "Booked. Your appointment reference is APT-2026-1007, on your case CASE-1017. Your case manager will arrange the fit-to-fly letter with the clinic. Anything else?"],
        ["user", "No, that's great. Thanks!"],
      ],
      events: [
        { type: "APPOINTMENT", title: "Appointment APT-2026-1007 booked", body: `Dr. Selin Kaya, Bosphorus Demo Orthopedic Clinic (Besiktas) — ${clock.date(3)} 14:00`, data: { appointmentRef: "APT-2026-1007", callRef: "CALL-0912" }, actor: "agent:appointment-booking", after: 160 },
      ],
    },
    {
      ref: "CALL-0913",
      when: { daysAgo: 1, time: "18:47" },
      direction: "INBOUND",
      channel: "PHONE",
      agentProfile: "inbound-hotline",
      status: "COMPLETED",
      language: "en",
      fromNumber: "+447700900218",
      toNumber: HOTLINE,
      caseRef: "CASE-1024",
      ringSec: 1,
      durationSec: 183,
      outcome: { caseRef: "CASE-1024", urgency: "HIGH" },
      endReason: "conversation complete",
      summary: "Oliver Bennett's daughter reported that he was taken by ambulance from his hotel to Marmara Demo Heart Center with chest tightness and admitted for overnight observation. The agent opened CASE-1024; a case manager will coordinate with the hospital and send the guarantee of payment.",
      transcript: [
        ["agent", HOTLINE_GREETING],
        ["user", "Hi, I'm calling about my father, Oliver Bennett. He had chest tightness at the hotel this afternoon and the hotel doctor sent him by ambulance to the Marmara Demo Heart Center. He's insured with you."],
        ["agent", "I'm sorry to hear that. Is he with the doctors at the hospital now?"],
        ["user", "Yes. They've admitted him for observation overnight, and they say the insurer has to confirm the costs."],
        ["agent", "Thank you. Do you have his policy number?"],
        ["user", "Yes — POL-TR-100950."],
        ["agent", "Thank you. I've opened case CASE-1024 for your father's admission. A case manager will contact the hospital this evening and send the guarantee of payment, so you don't need to do anything. Can we reach you on this number?"],
        ["user", "Yes, this number is fine. Thank you so much."],
        ["agent", "You're welcome. If anything changes, call us any time, day or night. Take care."],
      ],
      events: [
        { type: "NOTE", title: "Case opened by the voice agent", body: "Oliver Bennett (Premier, POL-TR-100950) was taken by ambulance from his hotel to Marmara Demo Heart Center with chest tightness and admitted for overnight cardiac observation. The hospital needs the costs confirmed (guarantee of payment).", actor: "agent:inbound-hotline", after: 120 },
        { type: "NOTE", title: "Note from CALL-0913", body: "Family contact: his daughter, reachable on the number she called from. Please call her back after speaking to the hospital.", actor: "agent:inbound-hotline", after: 150 },
      ],
    },
    {
      ref: "CALL-0914",
      when: { daysAgo: 1, time: "20:05" },
      direction: "OUTBOUND",
      channel: "PHONE",
      agentProfile: "outbound-hospital-coordination",
      status: "COMPLETED",
      language: "tr",
      fromNumber: HOTLINE,
      toNumber: MARMARA,
      caseRef: "CASE-1024",
      placedBy: "elif",
      ringSec: 5,
      durationSec: 214,
      outcome: {
        brief: {
          calling: "Marmara Demo Heart Center (Sisli), international patients / admissions desk",
          patient: "Oliver Bennett, born 1956-12-05, United Kingdom",
          policy: "POL-TR-100950",
          case: "CASE-1024",
          reason: "Hospital admission: cardiac observation — Sisli",
          doctor: "Dr. Baran Ozturk",
          reportEmail: "medical@demo-assistance.example",
        },
        retries: 0,
        hospitalUpdate: OLIVER_HOSPITAL_UPDATE,
      },
      endReason: "conversation complete",
      summary: "Turkish call to Marmara Demo Heart Center: Oliver Bennett is admitted to the coronary care unit (bed 4) under Dr. Baran Ozturk and is stable on monitoring. Estimated cost EUR 1,850 for the overnight observation; the hospital is faxing the estimate and needs a Letter of Guarantee. Medical report expected tomorrow around noon.",
      transcript: [
        ["agent", "İyi akşamlar, ben Ada; seyahat asistans şirketi adına arayan bir yapay zekâ asistanıyım. Sigortalımız Oliver Bennett için arıyorum, dosya numaramız CASE-1024. Uluslararası hasta birimiyle mi görüşüyorum?"],
        ["user", "Evet, buyurun."],
        ["agent", "Hastamızın doğum tarihi 5 Aralık 1956. Yatışı yapıldı mı, hangi serviste?"],
        ["user", "Evet, yatışı yapıldı. Koroner yoğun bakımda, dört numaralı yatakta. Sorumlu hekim Dr. Baran Öztürk."],
        ["agent", "Teşekkürler. Tahmini tedavi maliyeti ne kadar, hangi para biriminde?"],
        ["user", "Bir gecelik gözlem ve tetkikler için bin sekiz yüz elli euro. Garanti mektubu gerekiyor."],
        ["agent", "Bin sekiz yüz elli euro, doğru anladım mı? Maliyet tahminini faksla, tıbbi raporu da medical@demo-assistance.example adresine e-postayla gönderebilir misiniz? Garanti mektubunu bu akşam iletiyoruz."],
        ["user", "Evet, doğru. Tahmini hemen faksla gönderiyoruz; rapor yarın öğlen hazır olur."],
        ["agent", "Çok teşekkür ederim. İyi akşamlar, kolay gelsin."],
      ],
      events: [
        {
          type: "NOTE",
          title: "Hospital update from CALL-0914",
          body: "Admitted, ward Coronary care unit (bed 4), attending Dr. Baran Ozturk, estimated cost 1,850 EUR, report tomorrow around noon, hospital requests a Letter of Guarantee. Condition: Stable on cardiac monitoring; troponin results pending",
          data: OLIVER_HOSPITAL_UPDATE,
          actor: "agent:outbound-hospital-coordination",
          after: 190,
        },
      ],
    },
  ];
}

export interface SeedExtraction {
  patientName: string | null;
  dateOfBirth: string | null;
  hospital: string | null;
  doctor: string | null;
  diagnosis: string | null;
  procedures: string[];
  admissionDate: string | null;
  invoiceAmount: number | null;
  currency: string | null;
  policyReference: string | null;
  summary: string;
  missingInfo: string[];
  confidence: number;
}

export interface SeedInboundDocument {
  filename: string;
  kind: "MEDICAL_REPORT" | "HOSPITAL_INVOICE" | "DISCHARGE_SUMMARY" | "COST_ESTIMATE" | "CORRESPONDENCE";
  /** Read by OCR (a fax scan with no text layer). */
  ocr?: boolean;
  language: string;
  textContent: string;
  translatedText?: string;
  extraction: SeedExtraction;
}

export interface SeedInboundMessage {
  ref: string;
  channel: "EMAIL" | "FAX";
  when: SeedWhen;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  bodyText: string | null;
  language: string;
  status: "MATCHED" | "NEEDS_REVIEW" | "REPLIED";
  riskFlags: string[];
  /** Scored case candidates, best first; matched when the best reaches the threshold (0.6). */
  candidates: { caseRef: string; score: number; reasons: string[]; claimRef?: string }[];
  /** Attachments read by the intake pipeline. */
  documents: SeedInboundDocument[];
  /** Already-seeded demo documents (public/demo-documents) that arrived with this message. */
  demoDocuments?: string[];
  /** Claim the attachments were filed on. */
  claimRef?: string;
  /** The reply sent: automatically, or approved by an operator. */
  reply?: { body: string; approvedBy?: string; afterSec: number };
}

const MARCO_ACK =
  "Dear Marco Bianchi,\n\nThank you for your message — we have received it.\n\nYour case reference is CASE-1011.\n\nKind regards,\nClaims team — CareTrail (demonstration platform; all data is fictional)";

export function seedInboundMessages(clock: SeedClock): SeedInboundMessage[] {
  return [
    {
      ref: "MSG-0901",
      channel: "EMAIL",
      when: { daysAgo: 11, time: "11:40" },
      fromAddress: "Marco Bianchi <marco.bianchi@example.com>",
      toAddress: "claims@inbound.demo-assistance.example",
      subject: "Dental claim CLM-10237",
      bodyText: "Hello,\n\nI was treated for a bad toothache at a dental clinic in Nisantasi and sent in my claim CLM-10237 straight away. Could you tell me when it will be paid?\n\nThanks,\nMarco Bianchi",
      language: "en",
      status: "REPLIED",
      riskFlags: [],
      candidates: [{ caseRef: "CASE-1011", score: 0.9, reasons: ["Claim reference CLM-10237 quoted", "Sent from Marco Bianchi's e-mail address on file"], claimRef: "CLM-10237" }],
      documents: [],
      reply: { body: MARCO_ACK, afterSec: 35 },
    },
    {
      ref: "MSG-0902",
      channel: "FAX",
      when: { daysAgo: 8, time: "09:05" },
      fromAddress: "+902120002003",
      toAddress: FAX_LINE,
      subject: null,
      bodyText: null,
      language: "en",
      status: "MATCHED",
      riskFlags: [],
      candidates: [{ caseRef: "CASE-1020", score: 0.95, reasons: ["Policy POL-TR-100944 belongs to Aylin Yilmaz", "Patient name Aylin Yilmaz on the document", "Date of birth 1987-03-14 matches"] }],
      documents: [
        {
          filename: "fax-cost-estimate-aylin-yilmaz.pdf",
          kind: "COST_ESTIMATE",
          ocr: true,
          language: "en",
          textContent: [
            "ISTANBUL CENTRAL DEMO HOSPITAL — INTERNATIONAL PATIENTS — FAX — FICTIONAL DEMO",
            "COST ESTIMATE",
            "",
            "Patient Name: Aylin Yilmaz",
            "Date of Birth: 1987-03-14",
            "Policy Number: POL-TR-100944",
            "Attending Physician: Dr. Kerem Aydin",
            "Diagnosis: Acute gastroenteritis with dehydration",
            `Admission: ${clock.date(-8)}`,
            "Planned Treatment: Intravenous rehydration; 2 nights internal medicine ward",
            "Estimated Total: 24,800.00 TRY",
            "Please send a Letter of Guarantee by fax.",
            "Signed: International Patients Office",
          ].join("\n"),
          extraction: {
            patientName: "Aylin Yilmaz",
            dateOfBirth: "1987-03-14",
            hospital: "Istanbul Central Demo Hospital",
            doctor: "Dr. Kerem Aydin",
            diagnosis: "Acute gastroenteritis with dehydration",
            procedures: ["Emergency admission", "Intravenous rehydration", "2 nights internal medicine ward"],
            admissionDate: clock.date(-8),
            invoiceAmount: 24800,
            currency: "TRY",
            policyReference: "POL-TR-100944",
            summary: "Cost estimate from Istanbul Central Demo Hospital for Aylin Yilmaz: admission for acute gastroenteritis with IV rehydration, 2 nights, 24,800 TRY. The hospital asks for a Letter of Guarantee by fax.",
            missingInfo: [],
            confidence: 0.9,
          },
        },
      ],
    },
    {
      ref: "MSG-0903",
      channel: "EMAIL",
      when: { daysAgo: 6, time: "19:10" },
      fromAddress: "Aylin Yilmaz <aylin.yilmaz@example.com>",
      toAddress: "claims@inbound.demo-assistance.example",
      subject: "Claim for my hospital stay in Istanbul",
      bodyText: "Hello,\n\nI was taken to the emergency department at Istanbul Central Demo Hospital and stayed two nights. I'm back at my hotel now and feeling much better. Attached are the medical report, the invoice and the discharge summary — please let me know if you need anything else for my claim.\n\nBest wishes,\nAylin Yilmaz",
      language: "en",
      // "emergency department" tripped the emergency rule, so a person checked it and sent the reply.
      status: "REPLIED",
      riskFlags: ["Possible medical emergency"],
      candidates: [
        {
          caseRef: "CASE-1020",
          score: 1,
          reasons: ["Sent from Aylin Yilmaz's e-mail address on file", "Patient name Aylin Yilmaz on the document", "Date of birth 1987-03-14 matches", "Hospital Istanbul Central Demo Hospital is treating this case"],
        },
      ],
      documents: [],
      demoDocuments: ["medical-report-aylin-yilmaz.pdf", "hospital-invoice-aylin-yilmaz.pdf", "discharge-summary-aylin-yilmaz.pdf"],
      claimRef: "CLM-10245",
      reply: {
        approvedBy: "elif",
        afterSec: 1680,
        body: "Dear Aylin Yilmaz,\n\nThank you for your message — we have received it with 3 documents: medical-report-aylin-yilmaz.pdf, hospital-invoice-aylin-yilmaz.pdf, discharge-summary-aylin-yilmaz.pdf.\nYour claim CLM-10245 is now being reviewed.\nTo complete it we still need your policy number — it isn't on the hospital documents. You can simply reply to this e-mail with it.\nYour case reference is CASE-1020.\n\nWe're glad you're feeling better — rest well.\n\nKind regards,\nClaims team — CareTrail (demonstration platform; all data is fictional)",
      },
    },
    {
      ref: "MSG-0904",
      channel: "EMAIL",
      when: { daysAgo: 5, time: "19:15" },
      fromAddress: "Marco Bianchi <marco.bianchi@example.com>",
      toAddress: "claims@inbound.demo-assistance.example",
      subject: "Still waiting — dental claim CLM-10237",
      bodyText: "Hello again,\n\nI wrote last week about my dental claim CLM-10237 and only received an automatic reply. It is still not paid. Can someone please look at it?\n\nMarco Bianchi",
      language: "en",
      status: "REPLIED",
      riskFlags: [],
      candidates: [{ caseRef: "CASE-1011", score: 0.9, reasons: ["Claim reference CLM-10237 quoted", "Sent from Marco Bianchi's e-mail address on file"], claimRef: "CLM-10237" }],
      documents: [],
      reply: { body: MARCO_ACK, afterSec: 30 },
    },
    {
      ref: "MSG-0905",
      channel: "EMAIL",
      when: { daysAgo: 4, time: "21:50" },
      fromAddress: "Pera Demo Hotel Front Desk <frontdesk@pera-demo-hotel.example>",
      toAddress: "medical@inbound.demo-assistance.example",
      subject: "Guest needs a doctor — room 512",
      bodyText: "Good evening,\n\nOur guest Mr Daniel Hoffmann (room 512) has a high temperature and would like a doctor to see him tomorrow morning. He says he is insured with you but doesn't have his policy details with him. He speaks German and English and can be reached on +90 555 014 22 87.\n\nKind regards,\nFront Desk, Pera Demo Hotel",
      language: "en",
      status: "NEEDS_REVIEW",
      riskFlags: ["No matching case"],
      candidates: [],
      documents: [],
    },
    {
      ref: "MSG-0906",
      channel: "EMAIL",
      when: { daysAgo: 3, time: "07:52" },
      fromAddress: "Marmara Demo Heart Center Billing <billing@demo-heart.example>",
      toAddress: "medical@inbound.demo-assistance.example",
      subject: "Maliyet tahmini — Lena Koch (POL-TR-100946)",
      bodyText: "Sayın yetkili,\n\nBu sabah hastanemize yatışı yapılan sigortalınız Lena Koch için maliyet tahminini ekte bulabilirsiniz. Koroner anjiyografi öncesinde garanti mektubunuzu rica ederiz.\n\nSaygılarımızla,\nFaturalama Birimi",
      language: "tr",
      status: "MATCHED",
      riskFlags: [],
      candidates: [{ caseRef: "CASE-1022", score: 0.95, reasons: ["Policy POL-TR-100946 belongs to Lena Koch", "Patient name Lena Koch on the document", "Date of birth 1964-07-29 matches"] }],
      documents: [
        {
          filename: "maliyet-tahmini-lena-koch.pdf",
          kind: "COST_ESTIMATE",
          language: "tr",
          textContent: [
            "KURGUSAL DEMO BELGESİ — YALNIZCA GÖSTERİM AMAÇLIDIR",
            "",
            "MALİYET TAHMİNİ",
            "",
            "Hastane: Marmara Demo Heart Center",
            "Sorumlu Hekim: Dr. Baran Ozturk",
            "",
            "Hasta Adı: Lena Koch",
            "Doğum Tarihi: 1964-07-29",
            "Poliçe No: POL-TR-100946",
            "",
            "Tanı: Kararsız angina pektoris",
            `Yatış Tarihi: ${clock.date(-3)}`,
            "Planlanan Tedavi: Koroner anjiyografi; 2 gece koroner yoğun bakım; EKG takibi",
            "",
            "Tahmini Toplam: 11.950,00 EUR",
            "",
            "İşlem öncesinde garanti mektubu gereklidir.",
            "İmza: Faturalama Birimi",
          ].join("\n"),
          translatedText: [
            "FICTIONAL DEMO DOCUMENT — FOR DEMONSTRATION ONLY",
            "",
            "COST ESTIMATE",
            "",
            "Hospital: Marmara Demo Heart Center",
            "Attending Physician: Dr. Baran Ozturk",
            "",
            "Patient Name: Lena Koch",
            "Date of Birth: 1964-07-29",
            "Policy Number: POL-TR-100946",
            "",
            "Diagnosis: Unstable angina pectoris",
            `Admission Date: ${clock.date(-3)}`,
            "Planned Treatment: Coronary angiography; 2 nights coronary care unit; ECG monitoring",
            "",
            "Estimated Total: 11,950.00 EUR",
            "",
            "A Letter of Guarantee is required before the procedure.",
            "Signed: Billing Office",
          ].join("\n"),
          extraction: {
            patientName: "Lena Koch",
            dateOfBirth: "1964-07-29",
            hospital: "Marmara Demo Heart Center",
            doctor: "Dr. Baran Ozturk",
            diagnosis: "Unstable angina pectoris",
            procedures: ["Coronary angiography", "2 nights coronary care unit", "ECG monitoring"],
            admissionDate: clock.date(-3),
            invoiceAmount: 11950,
            currency: "EUR",
            policyReference: "POL-TR-100946",
            summary: "Turkish cost estimate from Marmara Demo Heart Center for Lena Koch: coronary angiography and 2 nights in the coronary care unit, EUR 11,950. A Letter of Guarantee is required before the procedure.",
            missingInfo: [],
            confidence: 0.93,
          },
        },
      ],
    },
    {
      ref: "MSG-0907",
      channel: "FAX",
      when: { daysAgo: 2, time: "16:20" },
      fromAddress: "+902160002013",
      toAddress: FAX_LINE,
      subject: null,
      bodyText: null,
      language: "en",
      status: "NEEDS_REVIEW",
      riskFlags: ["Low-confidence case match"],
      candidates: [{ caseRef: "CASE-1016", score: 0.4, reasons: ["Patient name Siobhan Murphy on the document", "Hospital Kadikoy Demo Eye Institute is treating this case"] }],
      documents: [
        {
          filename: "fax-note-s-murphy.pdf",
          kind: "CORRESPONDENCE",
          ocr: true,
          language: "en",
          textContent: [
            "KADIKOY DEMO EYE INSTITUTE — FAX — FICTIONAL DEMO",
            "To: CareTrail Medical Desk",
            "",
            "Re: S. Murphy — appointment request",
            "Patient: Siobhan Murphy",
            "Complaint: red, irritated right eye; contact lens wearer",
            "Please ask the patient to bring her lens case and current prescription,",
            "and to stop wearing lenses until the visit.",
            "Dr. E. Gunes",
          ].join("\n"),
          extraction: {
            patientName: "Siobhan Murphy",
            dateOfBirth: null,
            hospital: "Kadikoy Demo Eye Institute",
            doctor: "Dr. Emre Gunes",
            diagnosis: null,
            procedures: [],
            admissionDate: null,
            invoiceAmount: null,
            currency: null,
            policyReference: null,
            summary: "Note from Kadikoy Demo Eye Institute about Siobhan Murphy's appointment request: she should bring her lens case and prescription and stop wearing contact lenses until the visit.",
            missingInfo: ["Date of birth", "Policy number"],
            confidence: 0.71,
          },
        },
      ],
    },
    {
      ref: "MSG-0908",
      channel: "FAX",
      when: { daysAgo: 1, time: "20:24" },
      fromAddress: MARMARA,
      toAddress: FAX_LINE,
      subject: null,
      bodyText: null,
      language: "en",
      status: "MATCHED",
      riskFlags: [],
      candidates: [{ caseRef: "CASE-1024", score: 0.95, reasons: ["Policy POL-TR-100950 belongs to Oliver Bennett", "Patient name Oliver Bennett on the document", "Date of birth 1956-12-05 matches"] }],
      documents: [
        {
          filename: "fax-admission-estimate-oliver-bennett.pdf",
          kind: "COST_ESTIMATE",
          ocr: true,
          language: "en",
          textContent: [
            "MARMARA DEMO HEART CENTER — EMERGENCY ADMISSIONS — FAX — FICTIONAL DEMO",
            "COST ESTIMATE",
            "",
            "Patient Name: Oliver Bennett",
            "Date of Birth: 1956-12-05",
            "Policy Number: POL-TR-100950",
            "Attending Physician: Dr. Baran Ozturk",
            "Diagnosis: Chest tightness, acute coronary syndrome to be ruled out",
            `Admission: ${clock.date(-1)}`,
            "Planned Treatment: Cardiac monitoring, 1 night; serial ECG and troponin tests",
            "Estimated Total: 1,850.00 EUR",
            "Letter of Guarantee required.",
            "Signed: Billing Office",
          ].join("\n"),
          extraction: {
            patientName: "Oliver Bennett",
            dateOfBirth: "1956-12-05",
            hospital: "Marmara Demo Heart Center",
            doctor: "Dr. Baran Ozturk",
            diagnosis: "Chest tightness, acute coronary syndrome to be ruled out",
            procedures: ["Emergency admission", "Cardiac monitoring (1 night)", "Serial ECG and troponin tests"],
            admissionDate: clock.date(-1),
            invoiceAmount: 1850,
            currency: "EUR",
            policyReference: "POL-TR-100950",
            summary: "Cost estimate from Marmara Demo Heart Center for Oliver Bennett's emergency admission: one night of cardiac monitoring with serial ECG and troponin tests, EUR 1,850. A Letter of Guarantee is required.",
            missingInfo: [],
            confidence: 0.88,
          },
        },
      ],
    },
    {
      ref: "MSG-0909",
      channel: "EMAIL",
      when: { minutesAgo: 48 },
      fromAddress: "Besiktas Demo Sports Medicine <c.duran@demo-sports.example>",
      toAddress: "medical@inbound.demo-assistance.example",
      subject: "Cost estimate — Carlos Garcia (POL-TR-100952)",
      bodyText: "Dear colleagues,\n\nThe MRI of Mr Garcia's right knee shows a medial meniscus tear. Dr. Cem Duran recommends arthroscopic repair with one night's stay. Please find the cost estimate attached; we need your Letter of Guarantee before scheduling the operation.\n\nKind regards,\nPatient Services",
      language: "en",
      status: "MATCHED",
      riskFlags: [],
      candidates: [
        {
          caseRef: "CASE-1015",
          score: 1,
          reasons: ["Policy POL-TR-100952 belongs to Carlos Garcia", "Patient name Carlos Garcia on the document", "Date of birth 1973-04-30 matches", "Hospital Besiktas Demo Sports Medicine is treating this case"],
        },
      ],
      documents: [
        {
          filename: "cost-estimate-carlos-garcia.pdf",
          kind: "COST_ESTIMATE",
          language: "en",
          textContent: [
            "BESIKTAS DEMO SPORTS MEDICINE — FICTIONAL DEMO DOCUMENT",
            "COST ESTIMATE",
            "",
            "Patient Name: Carlos Garcia",
            "Date of Birth: 1973-04-30",
            "Policy Number: POL-TR-100952",
            "Attending Physician: Dr. Cem Duran",
            `Diagnosis: Medial meniscus tear, right knee (MRI ${clock.date(-1)})`,
            `Planned Admission: ${clock.date(2)}`,
            "Planned Treatment: Arthroscopic meniscus repair; 1 night orthopaedic ward; physiotherapy session",
            "Estimated Total: 11,400.00 EUR",
            "A Letter of Guarantee is required before the operation.",
            "Signed: Patient Services",
          ].join("\n"),
          extraction: {
            patientName: "Carlos Garcia",
            dateOfBirth: "1973-04-30",
            hospital: "Besiktas Demo Sports Medicine",
            doctor: "Dr. Cem Duran",
            diagnosis: "Medial meniscus tear, right knee",
            procedures: ["Arthroscopic meniscus repair", "1 night orthopaedic ward", "Physiotherapy session"],
            admissionDate: clock.date(2),
            invoiceAmount: 11400,
            currency: "EUR",
            policyReference: "POL-TR-100952",
            summary: "Cost estimate from Besiktas Demo Sports Medicine for Carlos Garcia: arthroscopic repair of a medial meniscus tear with one night's stay, EUR 11,400. A Letter of Guarantee is required before the operation.",
            missingInfo: [],
            confidence: 0.94,
          },
        },
      ],
    },
  ];
}

export interface SeedLetter {
  ref: string;
  caseRef: string;
  providerRef: string;
  /** The cost estimate it answers: an attachment of a seeded inbound message. */
  estimate: { messageRef: string; filename: string };
  status: "DRAFT" | "SENT" | "ACKNOWLEDGED";
  /** The person who approved it, when the rules held it for a human. */
  approved?: { by: string; when: SeedWhen };
  /** Who recorded the hospital's receipt (an operator, or "agent:…" for the AI call). */
  acknowledged?: { by: string; when: SeedWhen; note?: string };
}

// Amounts, excess, conditions and flags are decided at seed time by the same
// rules the app uses (src/lib/services/guarantee-decision.ts).
export const GUARANTEE_LETTERS: SeedLetter[] = [
  {
    ref: "LOG-0901",
    caseRef: "CASE-1020",
    providerRef: "PRV-2003",
    estimate: { messageRef: "MSG-0902", filename: "fax-cost-estimate-aylin-yilmaz.pdf" },
    status: "ACKNOWLEDGED",
    acknowledged: { by: "elif", when: { daysAgo: 8, time: "11:30" } },
  },
  {
    // Above the automatic approval limit, so the senior desk approved it.
    ref: "LOG-0902",
    caseRef: "CASE-1022",
    providerRef: "PRV-2005",
    estimate: { messageRef: "MSG-0906", filename: "maliyet-tahmini-lena-koch.pdf" },
    status: "ACKNOWLEDGED",
    approved: { by: "arda", when: { daysAgo: 3, time: "08:35" } },
    acknowledged: { by: "agent:outbound-log-confirmation", when: { daysAgo: 3, time: "09:22" }, note: "Received by fax; patient in the coronary care unit, angiography at 11:00." },
  },
  {
    // CASE-1024's "Guarantee of payment issued": approved and faxed automatically.
    ref: "LOG-0903",
    caseRef: "CASE-1024",
    providerRef: "PRV-2005",
    estimate: { messageRef: "MSG-0908", filename: "fax-admission-estimate-oliver-bennett.pdf" },
    status: "SENT",
  },
  {
    // Above the automatic approval limit: waiting for a case manager.
    ref: "LOG-0904",
    caseRef: "CASE-1015",
    providerRef: "PRV-2017",
    estimate: { messageRef: "MSG-0909", filename: "cost-estimate-carlos-garcia.pdf" },
    status: "DRAFT",
  },
];

// --- Bill review history --------------------------------------------------------
// Invoices reviewed in the last weeks (no file: the history behind the
// overview's savings). Reviewed by the real rules at seed time; amounts EUR.

export interface SeedBill {
  documentNumber: string;
  filename: string;
  caseRef: string;
  hospital: string;
  diagnosis: string;
  admissionDate?: string;
  dischargeDate?: string;
  daysAgo: number;
  /** [code, description, quantity, unit price] */
  lines: [string, string, number, number][];
  status: "ACCEPTED" | "WAIVED" | "PROPOSED";
  decidedBy?: string;
}

export const BILL_HISTORY: SeedBill[] = [
  {
    documentNumber: "BMC-INV-2026-7781",
    filename: "invoice-beyoglu-demo-medical-center-irina-volkova.pdf",
    caseRef: "CASE-1014",
    hospital: "Beyoglu Demo Medical Center",
    diagnosis: "Acute gastroenteritis",
    daysAgo: 18,
    lines: [
      ["520.030", "Emergency department admission", 1, 420],
      ["510.120", "Ward accommodation (per night)", 3, 380],
      ["600.200", "Medication and consumables", 1, 260],
      ["901.050", "Laboratory: basic panel", 1, 95],
      ["901.050", "Laboratory: basic panel", 1, 95],
      ["520.080", "Physician fees, internal medicine", 1, 380],
      ["950.910", "Companion meals", 2, 30],
    ],
    status: "ACCEPTED",
    decidedBy: "Senior Desk",
  },
  {
    documentNumber: "TIC-2026-04122",
    filename: "invoice-taksim-demo-international-clinic-oliver-bennett.pdf",
    caseRef: "CASE-1013",
    hospital: "Taksim Demo International Clinic",
    diagnosis: "Dizziness and headache, cause under investigation",
    daysAgo: 9,
    lines: [
      ["520.010", "Emergency consultation", 1, 240],
      ["802.310", "MRI scan, head", 1, 780],
      ["901.050", "Laboratory: basic panel", 1, 45],
      ["520.020", "Specialist consultation, neurology", 1, 120],
    ],
    status: "ACCEPTED",
    decidedBy: "Claims Team",
  },
  {
    documentNumber: "BSM-INV-2026-0187",
    filename: "invoice-besiktas-demo-sports-medicine-carlos-garcia.pdf",
    caseRef: "CASE-1015",
    hospital: "Besiktas Demo Sports Medicine",
    diagnosis: "Knee sprain, suspected meniscus tear",
    daysAgo: 6,
    lines: [
      ["520.010", "Emergency consultation", 1, 180],
      ["801.230", "X-ray, knee (2 views)", 1, 210],
      ["802.310", "MRI scan, knee", 1, 610],
      ["950.120", "Knee brace and crutches", 1, 200],
    ],
    status: "ACCEPTED",
    decidedBy: "Claims Team",
  },
  {
    documentNumber: "KFP-2026-1093",
    filename: "invoice-kadikoy-demo-family-practice-emma-van-dijk.pdf",
    caseRef: "CASE-1012",
    hospital: "Kadikoy Demo Family Practice",
    diagnosis: "Allergic contact dermatitis",
    daysAgo: 15,
    lines: [
      ["520.020", "Specialist consultation, dermatology", 1, 150],
      ["600.100", "Medication", 1, 45],
      ["950.930", "VIP lounge waiting fee", 1, 60],
    ],
    status: "ACCEPTED",
    decidedBy: "Claims Team",
  },
  {
    documentNumber: "KEI-2026-0558",
    filename: "invoice-kadikoy-demo-eye-institute-siobhan-murphy.pdf",
    caseRef: "CASE-1016",
    hospital: "Kadikoy Demo Eye Institute",
    diagnosis: "Contact lens related keratitis",
    daysAgo: 2,
    lines: [
      ["520.020", "Specialist consultation, ophthalmology", 1, 190],
      ["803.120", "Optical coherence tomography (OCT)", 1, 260],
      ["600.100", "Medication", 1, 35],
    ],
    status: "PROPOSED",
  },
];
