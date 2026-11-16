import type { Issuer, SampleDoc } from "./model";
import { billingOffice, copieConforme } from "./issuers";

// ---------------------------------------------------------------------------
// Benefit Global Assistance's private demo portal: the Antalya hospital's
// cost estimate for Petra Hoffmann (hip fracture), in Turkish, which the
// guarantee-of-payment scenario reads, and a Paris clinic's report in French
// for Elif Şahin, which Document AI translates (the Arabic report from
// Jeddah is a scan: scripts/samples/arabic-scan.ts). Patient, policy and hospital match
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

export const BATIGNOLLES_CLINIC: Issuer = {
  name: "Clinique Démo des Batignolles",
  tagline: "Chirurgie viscérale · Urgences 24h/24 · Patients internationaux",
  address: ["18 rue Démo des Batignolles", "75017 Paris, France"],
  phone: "+33 1 00 00 22 17",
  fax: "+33 1 00 00 22 18",
  email: "international@demo-batignolles.example",
  web: "www.demo-batignolles.example",
  color: "#1d4ed8",
  tint: "#eff6ff",
  logo: "cross",
  registry: "Établissement de santé privé DEMO-75-2217 · SIRET 000 000 002 00017",
};

/** Elif Şahin's hospital report, in French: Document AI translates it into English. */
export const elifReportFr: SampleDoc = {
  file: "compte-rendu-elif-sahin-paris.pdf",
  dir: "demo-documents",
  lang: "fr",
  issuer: BATIGNOLLES_CLINIC,
  title: "COMPTE RENDU",
  subtitle: "Compte rendu d'hospitalisation · Chirurgie viscérale",
  meta: [
    ["N° dossier:", "CDB-2026-31877"],
    ["Date:", "2026-11-12"],
  ],
  blocks: [
    {
      type: "fields",
      title: "Patient",
      left: [
        ["Nom du patient:", "Elif Şahin"],
        ["Date de naissance:", "1990-07-08"],
        ["Nationalité:", "Turquie"],
      ],
      right: [
        ["Numéro de police:", "BGA-318264"],
        ["Assureur:", "Benefit Global Assistance"],
        ["Sexe:", "Féminin"],
      ],
      split: 0.52,
      labelWidth: 108,
    },
    {
      type: "fields",
      title: "Séjour",
      left: [
        ["Établissement:", "Clinique Démo des Batignolles"],
        ["Médecin traitant:", "Dr Camille Rousseau"],
        ["Service:", "Chirurgie viscérale"],
      ],
      right: [
        ["Date d'admission:", "2026-11-09"],
        ["Date de sortie:", "2026-11-12"],
        ["Chambre:", "318"],
      ],
      split: 0.6,
      labelWidth: 104,
    },
    {
      type: "section",
      heading: "Synthèse médicale",
      labelWidth: 108,
      fields: [
        ["Diagnostic:", "Appendicite aiguë non compliquée"],
        ["Symptômes:", "douleur de la fosse iliaque droite; nausées; fièvre à 38,4 °C"],
        ["Actes réalisés:", "Scanner abdominal; appendicectomie par cœlioscopie le 2026-11-10"],
        ["Traitement de sortie:", "Paracétamol 1 g trois fois par jour pendant 5 jours; soins de pansement"],
      ],
    },
    {
      type: "section",
      heading: "Évolution",
      text: [
        "Patiente admise par les urgences le 9 novembre pour une douleur abdominale apparue la veille. Le scanner confirme une appendicite aiguë sans perforation. Appendicectomie par cœlioscopie le 10 novembre, sans complication.",
        "Suites opératoires simples, reprise alimentaire à J1. Sortie le 12 novembre en bon état général. Apte au voyage en vol commercial à partir du 19 novembre. Ablation des fils et contrôle par un médecin en Turquie à J10.",
      ],
    },
    {
      type: "signature",
      caption: "Signature et cachet",
      name: "Dr Camille Rousseau",
      role: "Chirurgie viscérale",
      place: "Paris, 2026-11-12",
      stamp: copieConforme(BATIGNOLLES_CLINIC, "Paris"),
    },
  ],
};

export const BENEFIT_SAMPLE_DOCS: SampleDoc[] = [petraEstimate, elifReportFr];
