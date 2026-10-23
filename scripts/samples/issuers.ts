import type { Issuer, Stamp } from "./model";

// Letterheads of the fictional providers in prisma/seed-data.ts. Phone and fax
// numbers follow the seed (+90 212 000 20NN); domains use the reserved
// .example TLD, so nothing here points at a real organisation.

export const ISTANBUL_CENTRAL: Issuer = {
  name: "Istanbul Central Demo Hospital",
  tagline: "International Patient Center",
  address: ["Halaskargazi Cd. No: 120, Şişli", "34371 İstanbul, Türkiye"],
  phone: "+90 212 000 2003",
  fax: "+90 212 000 2093",
  email: "international@istanbulcentral-demo.example",
  web: "www.istanbulcentral-demo.example",
  color: "#0e7490",
  tint: "#ecfeff",
  logo: "cross",
  registry: "Ministry of Health licence 34-ÖH-0003 · Şişli Tax Office 0000000003",
};

export const BOSPHORUS_ORTHO: Issuer = {
  name: "Bosphorus Demo Orthopedic Clinic",
  tagline: "Orthopaedics, Trauma and Sports Injuries",
  address: ["Barbaros Blv. No: 45, Beşiktaş", "34353 İstanbul, Türkiye"],
  phone: "+90 212 000 2004",
  fax: "+90 212 000 2094",
  email: "info@bosphorus-ortho-demo.example",
  web: "www.bosphorus-ortho-demo.example",
  color: "#1e3a8a",
  tint: "#eff6ff",
  logo: "joint",
  registry: "Ministry of Health licence 34-ÖH-0004 · Beşiktaş Tax Office 0000000004",
};

export const MARMARA_HEART: Issuer = {
  name: "Marmara Demo Heart Center",
  tagline: "Cardiology and Cardiovascular Surgery",
  address: ["Büyükdere Cd. No: 88, Şişli", "34394 İstanbul, Türkiye"],
  phone: "+90 212 000 2005",
  fax: "+90 212 000 2005",
  email: "international@demo-heart.example",
  web: "www.demo-heart.example",
  color: "#b91c1c",
  tint: "#fef2f2",
  logo: "heart",
  registry: "Ministry of Health licence 34-ÖH-0005 · Şişli Tax Office 0000000005",
};

export const MARMARA_HEART_TR: Issuer = {
  ...MARMARA_HEART,
  tagline: "Kardiyoloji ve Kalp-Damar Cerrahisi",
  registry: "Sağlık Bakanlığı ruhsat 34-ÖH-0005 · Şişli Vergi Dairesi 0000000005",
};

export const BESIKTAS_SPORTS: Issuer = {
  name: "Besiktas Demo Sports Medicine",
  tagline: "Sports Medicine and Arthroscopy",
  address: ["Çırağan Cd. No: 40, Beşiktaş", "34349 İstanbul, Türkiye"],
  phone: "+90 212 000 2017",
  fax: "+90 212 000 2017",
  email: "patients@besiktas-sports-demo.example",
  web: "www.besiktas-sports-demo.example",
  color: "#047857",
  tint: "#ecfdf5",
  logo: "arc",
  registry: "Ministry of Health licence 34-ÖH-0017 · Beşiktaş Tax Office 0000000017",
};

// Asia-Pacific letterheads, for the Singapore demo storyline.

export const PUDONG_INTERNATIONAL: Issuer = {
  name: "Pudong Demo Medical Center",
  tagline: "International Medical Services · Neurology",
  address: ["Demo Road No. 88, Pudong New Area", "Shanghai 200120, China"],
  phone: "+86 0000 2026",
  fax: "+86 0000 2096",
  email: "ims@pudong-demo.example",
  web: "www.pudong-demo.example",
  color: "#7c2d12",
  tint: "#fff7ed",
  logo: "cross",
  registry: "Medical institution licence DEMO-310115-0026 · Unified credit code 00000000000000026X",
};

export const SUKHUMVIT_INTERNATIONAL: Issuer = {
  name: "Sukhumvit Demo International Hospital",
  tagline: "International Patient Services",
  address: ["Sukhumvit Soi 3, Khlong Toei Nuea, Watthana", "Bangkok 10110, Thailand"],
  phone: "+66 0000 2024",
  fax: "+66 0000 2094",
  email: "ips@sukhumvit-demo.example",
  web: "www.sukhumvit-demo.example",
  color: "#6d28d9",
  tint: "#f5f3ff",
  logo: "arc",
  registry: "Hospital licence DEMO-10110-0024 · Tax ID 0000000000024",
};

// Letterheads for the booth's other regions: the Red Sea, the Caribbean,
// North Africa, Florida, the Western Balkans, the Gulf and Switzerland.

export const RED_SEA_HOSPITAL: Issuer = {
  name: "Red Sea Demo Hospital",
  tagline: "Tourist Medical Services · 24 hours",
  address: ["Sheraton Road, El Dahar", "Hurghada, Red Sea Governorate, Egypt"],
  phone: "+20 0000 2027",
  fax: "+20 0000 2097",
  email: "tourists@redsea-demo.example",
  web: "www.redsea-demo.example",
  color: "#0369a1",
  tint: "#f0f9ff",
  logo: "cross",
  registry: "Ministry of Health licence DEMO-RS-0027 · Tax card 000-000-027",
};

export const BAVARO_CLINIC: Issuer = {
  name: "Clínica Demo Bávaro",
  tagline: "Emergencias y Traumatología · Turistas internacionales",
  address: ["Av. Barceló, Bávaro", "Punta Cana 23000, República Dominicana"],
  phone: "+1 809 000 2028",
  fax: "+1 809 000 2098",
  email: "internacional@bavaro-demo.example",
  web: "www.bavaro-demo.example",
  color: "#be123c",
  tint: "#fff1f2",
  logo: "joint",
  registry: "Habilitación SNS DEMO-0028 · RNC 0-00-00028-0",
};

export const OLIVIERS_CLINIC: Issuer = {
  name: "Clinique Demo Les Oliviers",
  tagline: "Médecine interne · Patients internationaux",
  address: ["Boulevard du 14 Janvier, Khezama", "4051 Sousse, Tunisie"],
  phone: "+216 00 002 029",
  fax: "+216 00 002 099",
  email: "international@oliviers-demo.example",
  web: "www.oliviers-demo.example",
  color: "#15803d",
  tint: "#f0fdf4",
  logo: "arc",
  registry: "Autorisation Ministère de la Santé DEMO-0029 · Matricule fiscal 0000029/A",
};

export const ATLANTIC_MEDICAL: Issuer = {
  name: "Atlantic Demo Medical Center",
  tagline: "Patient Financial Services",
  address: ["1200 Demo Boulevard", "Fort Lauderdale, FL 33301, USA"],
  phone: "+1 954 000 2030",
  fax: "+1 954 000 2090",
  email: "pfs@atlantic-demo.example",
  web: "www.atlantic-demo.example",
  color: "#1d4ed8",
  tint: "#eff6ff",
  logo: "heart",
  registry: "AHCA licence DEMO-2030 · NPI 0000002030 · EIN 00-0002030",
};

export const SARANDA_POLYCLINIC: Issuer = {
  name: "Saranda Demo Polyclinic",
  tagline: "Surgery and Emergency Care · Riviera",
  address: ["Rruga Demo 12", "Saranda 9701, Albania"],
  phone: "+355 00 002 031",
  fax: "+355 00 002 091",
  email: "patients@saranda-demo.example",
  web: "www.saranda-demo.example",
  color: "#b45309",
  tint: "#fffbeb",
  logo: "cross",
  registry: "Ministry of Health licence DEMO-0031 · NIPT L00000031A",
};

export const JUMEIRAH_HOSPITAL: Issuer = {
  name: "Jumeirah Demo Hospital",
  tagline: "Urology and Emergency Medicine",
  address: ["Al Wasl Road, Jumeirah 2", "Dubai, United Arab Emirates"],
  phone: "+971 0 000 2032",
  fax: "+971 0 000 2092",
  email: "insurance@jumeirah-demo.example",
  web: "www.jumeirah-demo.example",
  color: "#0f766e",
  tint: "#f0fdfa",
  logo: "arc",
  registry: "DHA facility licence DEMO-0032 · TRN 000000000000032",
};

export const LEMAN_CLINIC: Issuer = {
  name: "Lac Léman Demo Clinic",
  tagline: "Orthopaedic and Trauma Surgery",
  address: ["Route de Demo 32", "1211 Genève, Switzerland"],
  phone: "+41 22 000 2033",
  fax: "+41 22 000 2093",
  email: "international@leman-demo.example",
  web: "www.leman-demo.example",
  color: "#9f1239",
  tint: "#fff1f2",
  logo: "joint",
  registry: "Cantonal licence GE-DEMO-0033 · UID CHE-000.000.033",
};

const INK_BLUE = "#27408b";
const INK_RED = "#b3202a";

export const trueCopy = (issuer: Issuer): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • İSTANBUL •`,
  center: ["ASLI GİBİDİR", "TRUE COPY"],
  color: INK_BLUE,
});

export const paid = (issuer: Issuer, date: string): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • VEZNE •`,
  center: ["TAHSİL EDİLDİ", "PAID", date],
  color: INK_RED,
});

/** English-only stamps for hospitals outside Türkiye. */
export const certifiedCopy = (issuer: Issuer, city: string): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • ${city.toUpperCase()} •`,
  center: ["CERTIFIED", "TRUE COPY"],
  color: INK_BLUE,
});

export const patientAccounts = (issuer: Issuer): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • PATIENT ACCOUNTS •`,
  center: ["BILLING", "OFFICE"],
  color: INK_BLUE,
});

export const billingOffice = (issuer: Issuer): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • FATURALAMA •`,
  center: ["BILLING", "OFFICE"],
  color: INK_BLUE,
});

/** French billing stamp, for North African and Swiss clinics. */
export const facturation = (issuer: Issuer): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • FACTURATION •`,
  center: ["SERVICE", "FACTURATION"],
  color: INK_BLUE,
});

/** Spanish certified-copy stamp, for Caribbean and Latin American clinics. */
export const copiaFiel = (issuer: Issuer): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • PUNTA CANA •`,
  center: ["COPIA FIEL", "DEL ORIGINAL"],
  color: INK_BLUE,
});

/** French certified-copy stamp, for medical reports. */
export const copieConforme = (issuer: Issuer, city: string): Stamp => ({
  ring: `${issuer.name.toUpperCase()} • ${city.toUpperCase()} •`,
  center: ["COPIE", "CONFORME"],
  color: INK_BLUE,
});
