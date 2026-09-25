// ---------------------------------------------------------------------------
// Fictional demo seed data for the ITIC Global demonstration platform.
// Every person, hospital, policy and phone number here is invented.
// Istanbul-heavy on purpose: the platform is demonstrated at ITIC Global.
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
];

// Weekly availability templates (expanded to concrete dates at query time).
const WEEKDAYS_FULL = { mon: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"], tue: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"], wed: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"], thu: ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"], fri: ["09:00", "10:00", "11:00", "14:00", "15:00"], sat: ["10:00", "11:00"], sun: [] };
const WEEKDAYS_AM = { mon: ["08:30", "09:30", "10:30", "11:30"], tue: ["08:30", "09:30", "10:30", "11:30"], wed: ["08:30", "09:30", "10:30", "11:30"], thu: ["08:30", "09:30", "10:30", "11:30"], fri: ["08:30", "09:30", "10:30"], sat: [], sun: [] };
const WEEKDAYS_PM = { mon: ["13:00", "14:00", "15:00", "16:00", "17:00"], tue: ["13:00", "14:00", "15:00", "16:00", "17:00"], wed: ["13:00", "14:00", "15:00", "16:00", "17:00"], thu: ["13:00", "14:00", "15:00", "16:00", "17:00"], fri: ["13:00", "14:00", "15:00"], sat: ["13:00", "14:00"], sun: [] };
const EVERY_DAY = { mon: ["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"], tue: ["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"], wed: ["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"], thu: ["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"], fri: ["09:00", "12:00", "14:00", "16:00", "18:00", "20:00"], sat: ["10:00", "13:00", "16:00", "19:00"], sun: ["10:00", "13:00", "16:00"] };

export const PROVIDERS = [
  { ref: "PRV-2001", name: "Dr. Deniz Arslan", facility: "Taksim Demo International Clinic", specialty: "General Medicine", address: "Istiklal Cd. 12", district: "Taksim", city: "Istanbul", latitude: 41.037, longitude: 28.9857, languages: ["Turkish", "English"], phone: "+90 212 000 2001", email: "d.arslan@demo-clinic.example", rating: 4.8, availability: EVERY_DAY },
  { ref: "PRV-2002", name: "Dr. Meltem Sahin", facility: "Beyoglu Demo Medical Center", specialty: "General Medicine", address: "Mesrutiyet Cd. 45", district: "Beyoglu", city: "Istanbul", latitude: 41.033, longitude: 28.977, languages: ["Turkish", "English", "French"], phone: "+90 212 000 2002", email: "m.sahin@demo-med.example", rating: 4.6, availability: WEEKDAYS_FULL },
  { ref: "PRV-2003", name: "Dr. Kerem Aydin", facility: "Istanbul Central Demo Hospital", specialty: "Gastroenterology", address: "Halaskargazi Cd. 100", district: "Sisli", city: "Istanbul", latitude: 41.06, longitude: 28.987, languages: ["Turkish", "English"], phone: "+90 212 000 2003", email: "k.aydin@demo-hospital.example", rating: 4.9, availability: WEEKDAYS_PM },
  { ref: "PRV-2004", name: "Dr. Selin Kaya", facility: "Bosphorus Demo Orthopedic Clinic", specialty: "Orthopedics", address: "Barbaros Blv. 8", district: "Besiktas", city: "Istanbul", latitude: 41.043, longitude: 29.007, languages: ["Turkish", "English", "German"], phone: "+90 212 000 2004", email: "s.kaya@demo-ortho.example", rating: 4.7, availability: WEEKDAYS_FULL },
  { ref: "PRV-2005", name: "Dr. Baran Ozturk", facility: "Marmara Demo Heart Center", specialty: "Cardiology", address: "Buyukdere Cd. 22", district: "Sisli", city: "Istanbul", latitude: 41.063, longitude: 28.99, languages: ["Turkish", "English"], phone: "+90 212 000 2005", email: "b.ozturk@demo-heart.example", rating: 4.9, availability: WEEKDAYS_AM },
  { ref: "PRV-2006", name: "Dr. Zeynep Erdem", facility: "Kadikoy Demo Family Practice", specialty: "General Medicine", address: "Bahariye Cd. 33", district: "Kadikoy", city: "Istanbul", latitude: 40.99, longitude: 29.026, languages: ["Turkish", "English"], phone: "+90 216 000 2006", email: "z.erdem@demo-family.example", rating: 4.5, availability: WEEKDAYS_FULL },
  { ref: "PRV-2007", name: "Dr. Volkan Demir", facility: "Nisantasi Demo Dental Studio", specialty: "Dentistry", address: "Tesvikiye Cd. 5", district: "Nisantasi", city: "Istanbul", latitude: 41.048, longitude: 28.994, languages: ["Turkish", "English"], phone: "+90 212 000 2007", email: "v.demir@demo-dental.example", rating: 4.8, availability: WEEKDAYS_FULL },
  { ref: "PRV-2008", name: "Dr. Elif Yildiz", facility: "Uskudar Demo Polyclinic", specialty: "Dermatology", address: "Hakimiyet-i Milliye Cd. 60", district: "Uskudar", city: "Istanbul", latitude: 41.023, longitude: 29.016, languages: ["Turkish", "English", "Arabic"], phone: "+90 216 000 2008", email: "e.yildiz@demo-poly.example", rating: 4.4, availability: WEEKDAYS_AM },
  { ref: "PRV-2009", name: "Dr. Murat Celik", facility: "Fatih Demo University Hospital", specialty: "Neurology", address: "Millet Cd. 90", district: "Fatih", city: "Istanbul", latitude: 41.019, longitude: 28.94, languages: ["Turkish", "English"], phone: "+90 212 000 2009", email: "m.celik@demo-uni.example", rating: 4.6, availability: WEEKDAYS_AM },
  { ref: "PRV-2010", name: "Dr. Aysegul Koc", facility: "Levent Demo Medical Plaza", specialty: "General Medicine", address: "Levent Cd. 14", district: "Levent", city: "Istanbul", latitude: 41.078, longitude: 29.013, languages: ["Turkish", "English", "Russian"], phone: "+90 212 000 2010", email: "a.koc@demo-plaza.example", rating: 4.7, availability: WEEKDAYS_PM },
  { ref: "PRV-2011", name: "Dr. Hakan Polat", facility: "Bakirkoy Demo General Hospital", specialty: "Emergency Medicine", address: "Incirli Cd. 70", district: "Bakirkoy", city: "Istanbul", latitude: 40.982, longitude: 28.877, languages: ["Turkish", "English"], phone: "+90 212 000 2011", email: "h.polat@demo-general.example", rating: 4.5, availability: EVERY_DAY },
  { ref: "PRV-2012", name: "Dr. Nazli Aksoy", facility: "Taksim Demo Women's Health Clinic", specialty: "Obstetrics & Gynecology", address: "Siraselviler Cd. 21", district: "Taksim", city: "Istanbul", latitude: 41.035, longitude: 28.984, languages: ["Turkish", "English", "French"], phone: "+90 212 000 2012", email: "n.aksoy@demo-womens.example", rating: 4.8, availability: WEEKDAYS_FULL },
  { ref: "PRV-2013", name: "Dr. Emre Gunes", facility: "Kadikoy Demo Eye Institute", specialty: "Ophthalmology", address: "Moda Cd. 48", district: "Kadikoy", city: "Istanbul", latitude: 40.987, longitude: 29.03, languages: ["Turkish", "English"], phone: "+90 216 000 2013", email: "e.gunes@demo-eye.example", rating: 4.6, availability: WEEKDAYS_AM },
  { ref: "PRV-2014", name: "Dr. Pelin Ates", facility: "Sisli Demo Children's Clinic", specialty: "Pediatrics", address: "Abide-i Hurriyet Cd. 36", district: "Sisli", city: "Istanbul", latitude: 41.06, longitude: 28.982, languages: ["Turkish", "English", "German"], phone: "+90 212 000 2014", email: "p.ates@demo-childrens.example", rating: 4.9, availability: WEEKDAYS_FULL },
  { ref: "PRV-2015", name: "Dr. Onur Karaca", facility: "Beyoglu Demo ENT Center", specialty: "Ear, Nose & Throat", address: "Galip Dede Cd. 9", district: "Beyoglu", city: "Istanbul", latitude: 41.029, longitude: 28.974, languages: ["Turkish", "English"], phone: "+90 212 000 2015", email: "o.karaca@demo-ent.example", rating: 4.4, availability: WEEKDAYS_PM },
  { ref: "PRV-2016", name: "Dr. Gamze Ucar", facility: "Atasehir Demo Medical Park", specialty: "Gastroenterology", address: "Atasehir Blv. 110", district: "Atasehir", city: "Istanbul", latitude: 40.992, longitude: 29.124, languages: ["Turkish", "English"], phone: "+90 216 000 2016", email: "g.ucar@demo-park.example", rating: 4.5, availability: WEEKDAYS_FULL },
  { ref: "PRV-2017", name: "Dr. Cem Duran", facility: "Besiktas Demo Sports Medicine", specialty: "Orthopedics", address: "Ciragan Cd. 40", district: "Besiktas", city: "Istanbul", latitude: 41.044, longitude: 29.012, languages: ["Turkish", "English", "Spanish"], phone: "+90 212 000 2017", email: "c.duran@demo-sports.example", rating: 4.7, availability: WEEKDAYS_PM },
  { ref: "PRV-2018", name: "Dr. Leyla Ozkan", facility: "Sultanahmet Demo Health House", specialty: "General Medicine", address: "Divanyolu Cd. 3", district: "Sultanahmet", city: "Istanbul", latitude: 41.006, longitude: 28.976, languages: ["Turkish", "English", "Arabic"], phone: "+90 212 000 2018", email: "l.ozkan@demo-health.example", rating: 4.3, availability: EVERY_DAY },
  { ref: "PRV-2019", name: "Dr. Kaan Simsek", facility: "Antalya Demo Coastal Clinic", specialty: "General Medicine", address: "Konyaalti Cd. 55", district: "Konyaalti", city: "Antalya", latitude: 36.886, longitude: 30.63, languages: ["Turkish", "English", "German", "Russian"], phone: "+90 242 000 2019", email: "k.simsek@demo-coastal.example", rating: 4.6, availability: EVERY_DAY },
  { ref: "PRV-2020", name: "Dr. Berna Tan", facility: "Ankara Demo Central Hospital", specialty: "Cardiology", address: "Ataturk Blv. 200", district: "Cankaya", city: "Ankara", latitude: 39.918, longitude: 32.854, languages: ["Turkish", "English"], phone: "+90 312 000 2020", email: "b.tan@demo-central.example", rating: 4.7, availability: WEEKDAYS_FULL },
];

export interface SeedCase {
  ref: string;
  patientRef: string;
  title: string;
  description: string;
  location: string;
  assistanceType: "MEDICAL" | "DENTAL" | "HOSPITALIZATION" | "EVACUATION" | "REPATRIATION" | "GENERAL";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "NEW" | "IN_PROGRESS" | "PENDING_INFO" | "ESCALATED" | "RESOLVED" | "CLOSED";
  symptoms: string[];
  aiSummary: string;
  suggestedActions: string[];
  assignedTo: string | null;
  daysAgo: number;
}

export const CASES: SeedCase[] = [
  { ref: "CASE-1010", patientRef: "PAT-1004", title: "Fever and sore throat — Sultanahmet", description: "Traveller reports fever and sore throat after sightseeing; requests a French or English speaking GP.", location: "Sultanahmet, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "RESOLVED", symptoms: ["Fever / infection"], aiSummary: "Sophie Martin reports fever and sore throat in Sultanahmet. GP visit arranged and completed.", suggestedActions: ["Find medical provider", "Arrange appointment"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 12 },
  { ref: "CASE-1011", patientRef: "PAT-1005", title: "Toothache — Nisantasi", description: "Severe toothache; requests dentist appointment.", location: "Nisantasi, Istanbul", assistanceType: "DENTAL", priority: "MEDIUM", status: "CLOSED", symptoms: ["Dental pain"], aiSummary: "Marco Bianchi reported severe toothache. Dental appointment completed; case closed.", suggestedActions: ["Arrange dental appointment"], assignedTo: "Elif Demirtas (Human Case Manager)", daysAgo: 20 },
  { ref: "CASE-1012", patientRef: "PAT-1006", title: "Skin rash — Kadikoy", description: "Itchy rash on both arms, possibly allergic reaction to sun cream.", location: "Kadikoy, Istanbul", assistanceType: "MEDICAL", priority: "LOW", status: "RESOLVED", symptoms: ["Skin reaction / allergy"], aiSummary: "Emma Van Dijk developed a mild allergic rash. Dermatology consult completed.", suggestedActions: ["Find dermatologist", "Arrange appointment"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 9 },
  { ref: "CASE-1013", patientRef: "PAT-1007", title: "Dizziness and headache — Taksim", description: "Elderly traveller reports recurring dizziness and headaches; daughter requests assessment.", location: "Taksim, Istanbul", assistanceType: "MEDICAL", priority: "HIGH", status: "IN_PROGRESS", symptoms: ["Headache / dizziness"], aiSummary: "Oliver Bennett (69) reports recurring dizziness. Neurology assessment scheduled.", suggestedActions: ["Arrange neurology consult", "Monitor condition", "Escalate if symptoms worsen"], assignedTo: "Elif Demirtas (Human Case Manager)", daysAgo: 3 },
  { ref: "CASE-1014", patientRef: "PAT-1008", title: "Food poisoning — Beyoglu", description: "Vomiting and diarrhea after restaurant meal; hotel doctor unavailable.", location: "Beyoglu, Istanbul", assistanceType: "MEDICAL", priority: "HIGH", status: "RESOLVED", symptoms: ["Abdominal pain"], aiSummary: "Irina Volkova suffered suspected food poisoning. GP visit and medication arranged.", suggestedActions: ["Find medical provider", "Arrange appointment"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 15 },
  { ref: "CASE-1015", patientRef: "PAT-1009", title: "Knee injury — Besiktas", description: "Twisted knee during stadium tour; swelling and difficulty walking.", location: "Besiktas, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "IN_PROGRESS", symptoms: ["Suspected fracture / injury"], aiSummary: "Carlos Garcia twisted his knee. Orthopedic appointment booked; imaging pending.", suggestedActions: ["Arrange orthopedic consult", "Collect imaging results"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 2 },
  { ref: "CASE-1016", patientRef: "PAT-1010", title: "Eye irritation — Kadikoy", description: "Persistent eye redness and irritation; wears contact lenses.", location: "Kadikoy, Istanbul", assistanceType: "MEDICAL", priority: "LOW", status: "PENDING_INFO", symptoms: ["Eye problem"], aiSummary: "Siobhan Murphy reports eye irritation. Awaiting photo and lens details from traveller.", suggestedActions: ["Request additional information", "Arrange ophthalmology consult if needed"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 4 },
  { ref: "CASE-1017", patientRef: "PAT-1002", title: "Follow-up: ankle fracture — Beyoglu", description: "Follow-up review of cast and fit-to-fly assessment after ankle fracture.", location: "Beyoglu, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "IN_PROGRESS", symptoms: ["Suspected fracture / injury"], aiSummary: "James Carter needs orthopedic review in 10 days for fit-to-fly clearance.", suggestedActions: ["Book follow-up appointment", "Prepare fit-to-fly certificate"], assignedTo: "Elif Demirtas (Human Case Manager)", daysAgo: 1 },
  { ref: "CASE-1018", patientRef: "PAT-1004", title: "Lost medication — Sisli", description: "Traveller lost prescription medication for hypertension; needs replacement.", location: "Sisli, Istanbul", assistanceType: "MEDICAL", priority: "MEDIUM", status: "RESOLVED", symptoms: [], aiSummary: "Sophie Martin lost hypertension medication. Replacement prescription arranged via GP.", suggestedActions: ["Arrange GP appointment", "Coordinate pharmacy"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 7 },
  { ref: "CASE-1019", patientRef: "PAT-1005", title: "Travel vaccination query — Istanbul", description: "Traveller asks whether booster vaccination is required for onward travel.", location: "Istanbul", assistanceType: "GENERAL", priority: "LOW", status: "CLOSED", symptoms: [], aiSummary: "General advice request about vaccinations; answered from medical information line.", suggestedActions: ["Provide travel health information"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 18 },
  { ref: "CASE-1020", patientRef: "PAT-1001", title: "Hospitalization: gastroenteritis — Sisli", description: "Traveller admitted with severe gastroenteritis; guarantee of payment issued to hospital.", location: "Sisli, Istanbul", assistanceType: "HOSPITALIZATION", priority: "HIGH", status: "RESOLVED", symptoms: ["Abdominal pain"], aiSummary: "Aylin Yilmaz was hospitalised for acute gastroenteritis at Istanbul Central Demo Hospital (2 nights). Discharged stable; claim CLM-10245 in review.", suggestedActions: ["Collect discharge documents", "Process claim"], assignedTo: "Elif Demirtas (Human Case Manager)", daysAgo: 8 },
  { ref: "CASE-1021", patientRef: "PAT-1002", title: "Ankle fracture — Beyoglu", description: "Traveller slipped on stairs near Galata Tower; suspected ankle fracture.", location: "Beyoglu, Istanbul", assistanceType: "MEDICAL", priority: "HIGH", status: "RESOLVED", symptoms: ["Suspected fracture / injury"], aiSummary: "James Carter sustained a non-displaced ankle fracture; treated at Bosphorus Demo Orthopedic Clinic.", suggestedActions: ["Collect invoice", "Open claim"], assignedTo: "Mehmet Aksoy (Case Manager)", daysAgo: 5 },
  { ref: "CASE-1022", patientRef: "PAT-1003", title: "Chest pain — Sisli", description: "Traveller admitted from hotel with acute chest pain; cardiology workup performed.", location: "Sisli, Istanbul", assistanceType: "HOSPITALIZATION", priority: "CRITICAL", status: "ESCALATED", symptoms: ["Chest pain"], aiSummary: "Lena Koch admitted with unstable angina at Marmara Demo Heart Center. Needs cardiology clearance before flying; medical escort under evaluation.", suggestedActions: ["Obtain fit-to-fly assessment", "Evaluate medical escort", "Keep family informed"], assignedTo: "Senior Desk — Dr. Arda Yavuz", daysAgo: 3 },
  { ref: "CASE-1023", patientRef: "PAT-1006", title: "Repatriation assessment — Istanbul", description: "Assessment for early return home after hospital treatment.", location: "Istanbul", assistanceType: "REPATRIATION", priority: "MEDIUM", status: "PENDING_INFO", symptoms: [], aiSummary: "Emma Van Dijk requests early repatriation on medical grounds; awaiting treating physician's report.", suggestedActions: ["Request medical report", "Check airline requirements"], assignedTo: "Sofia Rossi (Case Manager)", daysAgo: 2 },
  { ref: "CASE-1024", patientRef: "PAT-1007", title: "Hospital admission: cardiac observation — Sisli", description: "Traveller admitted for overnight cardiac observation after episode of chest tightness at hotel.", location: "Sisli, Istanbul", assistanceType: "HOSPITALIZATION", priority: "HIGH", status: "IN_PROGRESS", symptoms: ["Chest pain"], aiSummary: "Oliver Bennett admitted for cardiac observation at Marmara Demo Heart Center. Guarantee of payment issued; monitoring results awaited.", suggestedActions: ["Follow up on test results", "Extend guarantee of payment if required", "Plan discharge support"], assignedTo: "Elif Demirtas (Human Case Manager)", daysAgo: 1 },
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
  { ref: "CLM-10237", patientRef: "PAT-1005", caseRef: "CASE-1011", status: "PAID", amount: 2400, currency: "TRY", summary: "Emergency dental treatment. Paid in full.", issues: [{ severity: "ok", message: "All required documents available" }], daysAgo: 17 },
  { ref: "CLM-10238", patientRef: "PAT-1006", caseRef: "CASE-1012", status: "APPROVED", amount: 700, currency: "TRY", summary: "Dermatology consultation approved for payment.", issues: [{ severity: "ok", message: "All required documents available" }], daysAgo: 6 },
  { ref: "CLM-10239", patientRef: "PAT-1008", caseRef: "CASE-1014", status: "APPROVED", amount: 1150, currency: "TRY", summary: "GP visit and medication after food poisoning.", issues: [{ severity: "ok", message: "All required documents available" }], daysAgo: 12 },
  { ref: "CLM-10240", patientRef: "PAT-1009", caseRef: "CASE-1015", status: "PROCESSING", summary: "Orthopedic consultation; invoice awaited from clinic.", issues: [{ severity: "warning", message: "Hospital invoice not yet received" }], daysAgo: 1 },
  { ref: "CLM-10241", patientRef: "PAT-1010", status: "INFO_REQUESTED", summary: "Ophthalmology claim; proof of payment requested from traveller.", issues: [{ severity: "error", message: "Proof of payment missing" }, { severity: "ok", message: "Medical report available" }], daysAgo: 3 },
  { ref: "CLM-10242", patientRef: "PAT-1007", caseRef: "CASE-1013", status: "SUBMITTED", summary: "Neurology assessment claim submitted; not yet processed.", daysAgo: 0 },
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
  source: "WEB" | "VOICE";
}

export const APPOINTMENTS: SeedAppointment[] = [
  { ref: "APT-2026-1001", patientRef: "PAT-1004", providerRef: "PRV-2018", caseRef: "CASE-1010", daysFromNow: -11, time: "10:00", status: "COMPLETED", reason: "Fever and sore throat", source: "WEB" },
  { ref: "APT-2026-1002", patientRef: "PAT-1005", providerRef: "PRV-2007", caseRef: "CASE-1011", daysFromNow: -19, time: "14:00", status: "COMPLETED", reason: "Severe toothache", source: "WEB" },
  { ref: "APT-2026-1003", patientRef: "PAT-1006", providerRef: "PRV-2008", caseRef: "CASE-1012", daysFromNow: -8, time: "09:30", status: "COMPLETED", reason: "Allergic skin rash", source: "WEB" },
  { ref: "APT-2026-1004", patientRef: "PAT-1008", providerRef: "PRV-2002", caseRef: "CASE-1014", daysFromNow: -14, time: "11:00", status: "COMPLETED", reason: "Suspected food poisoning", source: "VOICE" },
  { ref: "APT-2026-1005", patientRef: "PAT-1009", providerRef: "PRV-2017", caseRef: "CASE-1015", daysFromNow: -1, time: "15:00", status: "COMPLETED", reason: "Knee injury assessment", source: "WEB" },
  { ref: "APT-2026-1006", patientRef: "PAT-1007", providerRef: "PRV-2009", caseRef: "CASE-1013", daysFromNow: 1, time: "09:30", status: "CONFIRMED", reason: "Neurology consult: dizziness", source: "WEB" },
  { ref: "APT-2026-1007", patientRef: "PAT-1002", providerRef: "PRV-2004", caseRef: "CASE-1017", daysFromNow: 3, time: "14:00", status: "CONFIRMED", reason: "Cast review and fit-to-fly", source: "WEB" },
  { ref: "APT-2026-1008", patientRef: "PAT-1003", providerRef: "PRV-2005", caseRef: "CASE-1022", daysFromNow: 2, time: "08:30", status: "CONFIRMED", reason: "Cardiology clearance", source: "WEB" },
  { ref: "APT-2026-1009", patientRef: "PAT-1010", providerRef: "PRV-2013", caseRef: "CASE-1016", daysFromNow: 2, time: "10:30", status: "PENDING", reason: "Eye irritation", source: "WEB" },
  { ref: "APT-2026-1010", patientRef: "PAT-1001", providerRef: "PRV-2003", caseRef: "CASE-1020", daysFromNow: -6, time: "16:00", status: "CANCELLED", reason: "Post-discharge check (patient felt well)", source: "VOICE" },
];

export const KNOWLEDGE_DOCUMENTS = [
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
      "To arrange a hospital admission: 1) Confirm the patient's identity, policy number and coverage. 2) Select a network hospital using Provider Search, preferring providers close to the patient with the required specialty and language. 3) Call the hospital's international patient desk and confirm bed availability. 4) Issue a guarantee of payment (GOP) to the hospital by email, stating the coverage limit. 5) Inform the patient and their family of the admission details. 6) Create or update the assistance case with the admission date, hospital and attending physician. 7) Monitor the patient daily until discharge and collect the discharge documents.",
  },
  {
    slug: "guarantee-of-payment",
    title: "Guarantee of Payment (GOP) Procedure",
    category: "Finance",
    content:
      "A guarantee of payment is issued to network hospitals for inpatient cases after coverage verification. The GOP must state the patient name, policy number, admission date, the covered treatment and the financial limit. GOPs above 50,000 TRY require sign-off by a senior case manager. Extensions are granted per 48 hours of stay after a medical update from the treating physician. Always record the GOP reference in the case file.",
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
      "The demo Istanbul network covers 18 providers across Taksim, Beyoglu, Sisli, Besiktas, Kadikoy, Uskudar, Fatih, Sultanahmet, Levent, Nisantasi, Bakirkoy and Atasehir. Specialties include general medicine, cardiology, gastroenterology, orthopedics, dentistry, dermatology, neurology, pediatrics, ophthalmology, ENT and obstetrics. English-speaking doctors are available at all network facilities; German, French, Russian, Arabic and Spanish are available at selected clinics. For after-hours emergencies use Bakirkoy Demo General Hospital or Taksim Demo International Clinic, which operate seven days a week.",
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
