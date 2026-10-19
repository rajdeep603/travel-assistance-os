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
