import type { Issuer, SampleDoc } from "./model";
import { billingOffice } from "./issuers";

// ---------------------------------------------------------------------------
// Benefit Global Assistance's private demo portal: the Antalya hospital's
// cost estimate for Petra Hoffmann (hip fracture), in Turkish, which the
// guarantee-of-payment scenario reads. Patient, policy and hospital match
// src/lib/partner-demo/benefit-records.ts. ALL CONTENT IS FICTIONAL DEMO DATA.
// ---------------------------------------------------------------------------

export const AKDENIZ_HOSPITAL: Issuer = {
  name: "Antalya Demo Akdeniz Hastanesi",
  tagline: "Ortopedi ve Travmatoloji · Uluslararası Hasta Birimi",
  address: ["Tekelioğlu Cd. No: 12, Lara", "07100 Antalya, Türkiye"],
  phone: "+90 242 000 2201",
  fax: "+90 242 000 2201",
  email: "international@demo-akdeniz.example",
  web: "www.demo-akdeniz.example",
  color: "#0f766e",
  tint: "#f0fdfa",
  logo: "joint",
  registry: "Sağlık Bakanlığı ruhsat 07-ÖH-2201 · Muratpaşa Vergi Dairesi 0000002201",
};

const MONEY_TR = [
  { label: "Kod", width: 0.12 },
  { label: "Açıklama / Description", width: 0.46 },
  { label: "Adet", width: 0.08, align: "right" as const },
  { label: "Birim fiyat", width: 0.16, align: "right" as const },
  { label: "Tutar", width: 0.18, align: "right" as const },
];

export const petraEstimate: SampleDoc = {
  file: "maliyet-tahmini-petra-hoffmann.pdf",
  dir: "demo-inbound",
  lang: "tr",
  issuer: AKDENIZ_HOSPITAL,
  title: "MALİYET TAHMİNİ",
  subtitle: "Cost estimate · sigorta şirketi için ön onay talebi",
  meta: [
    ["Tahmin No:", "ADH-CE-2026-1187"],
    ["Tarih:", "2026-11-15"],
    ["Geçerlilik:", "2026-11-29"],
  ],
  blocks: [
    {
      type: "fields",
      title: "Hasta",
      left: [
        ["Hasta Adı:", "Petra Hoffmann"],
        ["Doğum Tarihi:", "1958-09-03"],
        ["Uyruk:", "Almanya"],
      ],
      right: [
        ["Poliçe No:", "BGA-310582"],
        ["Para Birimi:", "EUR"],
      ],
      split: 0.55,
    },
    {
      type: "fields",
      title: "Yatış",
      left: [
        ["Hastane:", "Antalya Demo Akdeniz Hastanesi"],
        ["Sorumlu Hekim:", "Op. Dr. Selin Arslan"],
        ["Servis:", "Ortopedi, oda 412"],
      ],
      right: [
        ["Yatış Tarihi:", "2026-11-15"],
        ["Yatış süresi:", "4 gece"],
      ],
      split: 0.58,
      labelWidth: 96,
    },
    {
      type: "section",
      heading: "Tıbbi gerekçe",
      labelWidth: 110,
      fields: [
        ["Tanı:", "Sol femur boyun kırığı (left femoral neck fracture)"],
        ["Planlanan Tedavi:", "Hip fracture surgery, internal fixation; 4 nights ward"],
      ],
    },
    {
      type: "table",
      heading: "Tahmini masraflar",
      columns: MONEY_TR,
      rows: [
        ["612.810", "Kalça kırığı ameliyatı / Hip fracture surgery", "1", "3,200.00", "3,200.00"],
        ["612.815", "İmplant (kalça vidası) / Hip screw implant", "1", "1,450.00", "1,450.00"],
        ["510.120", "Servis yatışı / Ward accommodation", "4", "450.00", "1,800.00"],
        ["520.090", "Hekim ve anestezi / Physician and anaesthesia fees", "1", "650.00", "650.00"],
        ["600.200", "İlaç ve sarf / Medication and consumables", "1", "160.00", "160.00"],
        ["801.240", "Röntgen, kalça / X-ray, hip (2 views)", "1", "180.00", "180.00"],
        ["930.010", "Fizyoterapi / Physiotherapy session", "3", "75.00", "225.00"],
        ["950.110", "Koltuk değneği / Crutches (pair)", "1", "55.00", "55.00"],
        ["950.910", "Refakatçi yemeği / Companion meals", "4", "35.00", "140.00"],
      ],
      totals: [{ label: "Tahmini Toplam:", value: "7,860.00 EUR", strong: true }],
      note: "Ameliyattan önce garanti mektubu (provizyon) gereklidir. Lütfen faks ile +90 242 000 2201 numarasına veya e-posta ile international@demo-akdeniz.example adresine gönderiniz.",
    },
    {
      type: "signature",
      caption: "Faturalama birimi adına imza",
      name: "Faturalama Birimi",
      role: "Uluslararası Hasta Birimi",
      place: "Antalya, 15.11.2026",
      stamp: billingOffice(AKDENIZ_HOSPITAL),
    },
  ],
};

export const BENEFIT_SAMPLE_DOCS: SampleDoc[] = [petraEstimate];
