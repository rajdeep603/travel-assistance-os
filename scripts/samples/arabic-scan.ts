import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import { seeded } from "./render";

// ---------------------------------------------------------------------------
// The Arabic medical report from Jeddah (Benefit demo: Hasan Kılıç), as a
// scanned page: the hospital's report is laid out in HTML and drawn by
// headless Chrome (which shapes Arabic and lays it out right to left, which
// pdfkit can't), then aged like a scan and wrapped in a PDF with no text
// layer. Its OCR ground truth is the report as written, in reading order.
// Needs Google Chrome (macOS). ALL CONTENT IS FICTIONAL DEMO DATA.
// ---------------------------------------------------------------------------

export const ARABIC_SCAN_FILE = "medical-report-ar-hasan-kilic-jeddah.pdf";

const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => fs.existsSync(p));

const R = {
  name: "مستشفى الشاطئ التجريبي",
  nameEn: "AL SHATI DEMO HOSPITAL · JEDDAH",
  tagline: "قسم الأمراض الباطنية · مكتب المرضى الدوليين",
  address: "طريق الكورنيش، حي الشاطئ، جدة 23511، المملكة العربية السعودية",
  phone: "+966 12 000 2210",
  email: "international@demo-alshati.example",
  title: "تقرير طبي",
  meta: [
    ["رقم الملف:", "SDH-2026-44817"],
    ["التاريخ:", "2026-11-14"],
  ],
  patient: [
    ["اسم المريض:", "حسن كيليتش (HASAN KILIÇ)"],
    ["تاريخ الميلاد:", "1961-03-22"],
    ["الجنسية:", "تركي"],
    ["شركة التأمين:", "Benefit Global Assistance"],
    ["رقم الوثيقة:", "BGA-207733"],
  ],
  stay: [
    ["المستشفى:", "مستشفى الشاطئ التجريبي، جدة"],
    ["الطبيب المعالج:", "د. خالد العمري، استشاري الأمراض الباطنية"],
    ["تاريخ الدخول:", "2026-11-11"],
    ["تاريخ الخروج:", "2026-11-14"],
    ["الغرفة:", "507"],
  ],
  summary: [
    ["التشخيص:", "التهاب رئوي مكتسب من المجتمع في الفص السفلي الأيمن، مع جفاف"],
    ["الأعراض:", "حمى 39.2 درجة مئوية؛ سعال مع بلغم؛ ضيق في التنفس؛ إرهاق شديد"],
    ["الفحوصات:", "أشعة الصدر: ارتشاح في الفص السفلي الأيمن؛ كريات الدم البيضاء 14,200؛ CRP ‏96 ملغ/لتر؛ تشبع الأكسجين 93٪"],
    ["الإجراءات:", "سيفترياكسون 2 غرام وريدياً يومياً؛ أزيثرومايسين 500 ملغ وريدياً؛ سوائل وريدية؛ أكسجين لمدة 24 ساعة"],
    ["علاج الخروج:", "أموكسيسيلين/حمض الكلافولانيك 1 غرام مرتين يومياً لمدة 5 أيام"],
  ],
  course: [
    "أُدخل المريض عن طريق قسم الطوارئ بعد أدائه العمرة، وكان يعاني من حمى وسعال منذ ثلاثة أيام. تحسنت حالته بشكل ملحوظ مع العلاج الوريدي، وانخفضت الحرارة بعد 48 ساعة، وارتفع تشبع الأكسجين إلى 97٪ على هواء الغرفة.",
    "خرج المريض بحالة عامة جيدة. لائق للسفر جواً على رحلة تجارية اعتباراً من 2026-11-16 دون الحاجة إلى أكسجين أو مرافق طبي. يُنصح بمراجعة الطبيب في تركيا بعد أسبوع مع أشعة صدر للمتابعة.",
  ],
  doctor: "د. خالد العمري",
  signature: "التوقيع والختم",
  place: "جدة، 2026-11-14",
  registry: "ترخيص وزارة الصحة رقم DEMO-JED-2210 · سجل تجاري 0000002210",
};

/** The report as written, in reading order: the offline OCR's ground truth. */
export function arabicScanText(): string {
  const rows = (pairs: string[][]) => pairs.map(([l, v]) => `${l} ${v}`);
  return [
    R.name,
    R.nameEn,
    R.tagline,
    R.address,
    `هاتف: ${R.phone} · البريد: ${R.email}`,
    R.title,
    ...rows(R.meta),
    "بيانات المريض",
    ...rows(R.patient),
    "بيانات الإقامة",
    ...rows(R.stay),
    "الملخص الطبي",
    ...rows(R.summary),
    "سير الحالة والتوصيات",
    ...R.course,
    `الطبيب المعالج: ${R.doctor}`,
    R.signature,
    R.place,
    R.registry,
  ].join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function html(): string {
  const table = (pairs: string[][]) =>
    `<table>${pairs.map(([l, v]) => `<tr><th>${esc(l)}</th><td><bdi>${esc(v)}</bdi></td></tr>`).join("")}</table>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
  @page { size: 1240px 1754px; margin: 0 }
  * { box-sizing: border-box }
  body { margin: 0; width: 1240px; height: 1754px; background: #fff; color: #1f2933; font-family: "Geeza Pro", "SF Arabic", "Noto Naskh Arabic", sans-serif; font-size: 23px; line-height: 1.55 }
  .page { padding: 70px 90px 0 }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 4px solid #0e7490; padding-bottom: 18px }
  .name { font-size: 40px; font-weight: 700; color: #0e7490; line-height: 1.2 }
  .en { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 17px; letter-spacing: 2px; color: #155e75; margin-top: 4px }
  .tag { font-size: 20px; color: #475569; margin-top: 2px }
  .addr { font-size: 17px; color: #64748b; margin-top: 12px; text-align: start }
  h1 { text-align: center; font-size: 46px; margin: 34px 0 6px; letter-spacing: 1px }
  .meta { display: flex; justify-content: center; gap: 60px; font-size: 21px; color: #334155 }
  h2 { font-size: 25px; color: #0e7490; margin: 30px 0 8px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px }
  table { width: 100%; border-collapse: collapse }
  th { width: 210px; text-align: start; vertical-align: top; font-weight: 700; padding: 3px 0 3px 18px; white-space: nowrap }
  td { padding: 3px 0 }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 50px }
  p { margin: 6px 0; text-align: justify }
  .sign { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px }
  footer { position: absolute; bottom: 60px; right: 90px; left: 90px; border-top: 1.5px solid #cbd5e1; padding-top: 10px; font-size: 16px; color: #64748b; text-align: center }
  </style></head><body><div class="page">
  <header>
    <div>
      <div class="name">${esc(R.name)}</div>
      <div class="en" dir="ltr">${esc(R.nameEn)}</div>
      <div class="tag">${esc(R.tagline)}</div>
    </div>
    <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="#0e7490" stroke-width="5"/>
      <path d="M22 74 C40 60 52 88 70 72 S96 66 100 70" fill="none" stroke="#0e7490" stroke-width="6" stroke-linecap="round"/>
      <path d="M22 88 C40 74 52 102 70 86 S96 80 100 84" fill="none" stroke="#38bdf8" stroke-width="5" stroke-linecap="round"/>
      <rect x="52" y="20" width="16" height="44" rx="3" fill="#0e7490"/><rect x="38" y="34" width="44" height="16" rx="3" fill="#0e7490"/>
    </svg>
  </header>
  <div class="addr">${esc(R.address)}<br>هاتف: <bdi dir="ltr">${esc(R.phone)}</bdi> · البريد: <bdi dir="ltr">${esc(R.email)}</bdi></div>
  <h1>${esc(R.title)}</h1>
  <div class="meta">${R.meta.map(([l, v]) => `<span><b>${esc(l)}</b> <bdi>${esc(v)}</bdi></span>`).join("")}</div>
  <div class="two">
    <section><h2>بيانات المريض</h2>${table(R.patient)}</section>
    <section><h2>بيانات الإقامة</h2>${table(R.stay)}</section>
  </div>
  <h2>الملخص الطبي</h2>${table(R.summary)}
  <h2>سير الحالة والتوصيات</h2>${R.course.map((c) => `<p>${esc(c)}</p>`).join("")}
  <div class="sign">
    <div>
      <div><b>الطبيب المعالج:</b> ${esc(R.doctor)}</div>
      <svg width="300" height="90" viewBox="0 0 300 90" aria-hidden="true"><path d="M20 60 C50 10 70 80 100 40 S150 20 160 55 S210 70 230 30 S270 50 285 45" fill="none" stroke="#1e3a8a" stroke-width="3.5" stroke-linecap="round"/></svg>
      <div>${esc(R.signature)} · <bdi>${esc(R.place)}</bdi></div>
    </div>
    <svg width="230" height="230" viewBox="0 0 230 230" style="transform: rotate(-14deg); opacity: .78" aria-hidden="true">
      <defs><path id="ring" d="M115 115 m-88 0 a88 88 0 1 1 176 0 a88 88 0 1 1 -176 0"/></defs>
      <circle cx="115" cy="115" r="108" fill="none" stroke="#1d4ed8" stroke-width="5"/>
      <circle cx="115" cy="115" r="70" fill="none" stroke="#1d4ed8" stroke-width="3"/>
      <text font-size="21" fill="#1d4ed8" font-weight="700"><textPath href="#ring" startOffset="2%">مستشفى الشاطئ التجريبي • جدة • مكتب المرضى الدوليين •</textPath></text>
      <text x="115" y="108" text-anchor="middle" font-size="26" fill="#1d4ed8" font-weight="700">صورة طبق</text>
      <text x="115" y="140" text-anchor="middle" font-size="26" fill="#1d4ed8" font-weight="700">الأصل</text>
    </svg>
  </div>
  </div>
  <footer>${esc(R.registry)}</footer>
  </body></html>`;
}

/** Draws the report with Chrome, ages it like a scan and wraps it in a PDF with no text layer. */
export async function renderArabicScan(): Promise<{ pdf: Buffer; text: string }> {
  if (!CHROME) throw new Error("Google Chrome is needed to draw the Arabic scan.");
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arabic-scan-"));
  const htmlFile = path.join(dir, "report.html");
  const png = path.join(dir, "report.png");
  fs.writeFileSync(htmlFile, html());
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1240,1754",
    `--screenshot=${png}`,
    `file://${htmlFile}`,
  ], { stdio: "ignore" });

  // A scan: warm grey paper, a slight tilt, soft ink, speckles.
  const page = await loadImage(fs.readFileSync(png));
  const W = 1240;
  const H = 1754;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f3f1ea";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(0.006);
  ctx.translate(-W / 2 + 6, -H / 2 + 4);
  ctx.filter = "grayscale(0.55) contrast(1.08) blur(0.45px)";
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(page, 0, 0, W, H);
  ctx.restore();
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
  const rand = seeded(ARABIC_SCAN_FILE);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(60,60,60,${0.05 + rand() * 0.18})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.6, 1 + rand() * 1.6);
  }
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.05)");
  shade.addColorStop(0.08, "rgba(0,0,0,0)");
  shade.addColorStop(0.92, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  const jpeg = c.toBuffer("image/jpeg", 82);
  fs.rmSync(dir, { recursive: true, force: true });

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: { Title: "Scanned document", Producer: "Demo scanner", CreationDate: new Date("2026-11-14T12:20:00Z") },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (d: Buffer) => chunks.push(d));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.image(jpeg, 0, 0, { width: doc.page.width, height: doc.page.height });
    doc.end();
  });
  return { pdf, text: arabicScanText() };
}
