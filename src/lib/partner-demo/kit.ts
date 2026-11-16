// ---------------------------------------------------------------------------
// What a partner demo portal shows: the scenarios (agent, case, languages,
// the role card) and the partner-specific lines. Client-safe (no server
// imports): the portal page renders it and the session route reads the same
// definitions, so what a card promises is what the agent is started with.
// ALL PEOPLE, POLICIES, HOSPITALS AND AMOUNTS ARE FICTIONAL.
// ---------------------------------------------------------------------------

import { VOICE_LANGUAGES } from "@/lib/voice/languages";

export type PortalLang = "tr" | "en";
export interface Bi {
  tr: string;
  en: string;
}

export type ScenarioId = "hotline" | "hospital" | "interpreter" | "guarantee";

export interface ScriptCard {
  id: string;
  title: Bi;
  youPlay: Bi;
  facts: { label: Bi; value: Bi }[];
  /**
   * Lines to say, in the language spoken on the call, with an English gloss.
   * Keyed by voice language name; a language without its own lines shows the
   * English ones (else the Turkish ones, with their gloss) to say in it.
   */
  say: Record<string, { text: string; gloss?: string }[]>;
  watch: Bi[];
}

export interface VoiceOption {
  /** English name, as the voice layer knows it ("Turkish"). */
  name: string;
  /** What a speaker calls it ("Deutsch"). */
  label: string;
  /** Shown first, above the other languages: the partner's own markets. */
  featured?: boolean;
}

export interface Scenario {
  id: ScenarioId;
  kind: "voice" | "documents";
  /** The agent profile a voice scenario starts (src/lib/voice/agents). */
  agentId?: string;
  /** Works on the kit's case (hospital call, interpreter, guarantee). */
  onCase?: boolean;
  title: Bi;
  tagline: Bi;
  summary: Bi;
  /** Voice scenarios: the languages offered, the first is the default. */
  languages?: VoiceOption[];
  languageLabel?: Bi;
  scripts: ScriptCard[];
}

export type ModuleId = "inbox" | "documents" | "claims";

/** A sample message the inbox module receives (an EMAIL_SAMPLES, FAX_SAMPLES or WHATSAPP_SAMPLES id). */
export interface InboxSampleCard {
  id: string;
  channel: "email" | "fax" | "whatsapp";
  from: string;
  title: Bi;
  note: Bi;
  /** ISO 639-1 code of what the sender wrote. */
  language: string;
}

/** A sample file Document AI reads (a path under public/). */
export interface DocumentSampleCard {
  file: string;
  title: Bi;
  note: Bi;
  language: string;
}

export interface PortalKit {
  id: string;
  company: string;
  /** Whom the agents say they work for. */
  operatingFor: string;
  intro: Bi;
  nextMeeting: Bi;
  /** Keyterms for the recogniser on every session: names and places of the scenarios. */
  keyterms: string[];
  scenarios: Scenario[];
  /** The rest of the platform, on samples: the inbox and Document AI (the claim uses the bundled claim pack). */
  modules: { inbox: InboxSampleCard[]; documents: DocumentSampleCard[] };
}

const bi = (tr: string, en: string): Bi => ({ tr, en });

/**
 * Every language CareTrail's voice agents take calls in (VOICE_LANGUAGES),
 * the partner's own markets first; `except` leaves languages out (the
 * interpreter's patient side never speaks the doctor's language).
 */
function callLanguages(featured: string[], except: string[] = []): VoiceOption[] {
  const byName = new Map(VOICE_LANGUAGES.map((l) => [l.name, l]));
  const head = featured.flatMap((n) => {
    const l = byName.get(n);
    return l ? [{ name: l.name, label: l.native, featured: true }] : [];
  });
  const rest = VOICE_LANGUAGES.filter((l) => !featured.includes(l.name)).map((l) => ({ name: l.name, label: l.native }));
  return [...head, ...rest].filter((l) => !except.includes(l.name));
}

const HOTLINE_LANGUAGES = callLanguages(["Turkish", "German", "English", "Russian", "Arabic"]);

/** The hospital call: Turkish by default, any other language when asked. */
const HOSPITAL_LANGUAGES = callLanguages(["Turkish", "English"]);

/** The interpreter's patient side; the doctor speaks Turkish. */
export const INTERPRETER_PATIENT_LANGUAGES = callLanguages(["German", "English", "Russian", "Arabic"], ["Turkish"]);

export const BENEFIT_KIT: PortalKit = {
  id: "benefit",
  company: "Benefit Global Assistance",
  operatingFor: "Benefit Global Assistance",
  intro: bi(
    "13 Kasım'daki görüşmemizde istediğiniz gibi, CareTrail'i bir görüşmeye gerek kalmadan, kendi süreçlerinize uyarlanmış haliyle inceleyebilmeniz için bu alanı hazırladık. Yapay zekâ ajanlarını tarayıcınızda Türkçe deneyebilir, her görüşmenin sonucunu (vaka kaydı, transkript, özet ve CRM'inize yazılacak veri) hemen görebilirsiniz.",
    "As you asked on our call on 13 November, we prepared this space so you can study CareTrail, tailored to your own processes, without needing a call. You can try the AI agents in Turkish in your browser and see the result of every conversation straight away: the case record, the transcript, the summary and the data written to your CRM."
  ),
  nextMeeting: bi("20 Kasım Cuma, 14:00 (Türkiye saati)", "Friday 20 November, 2:00 pm Türkiye time"),
  keyterms: ["Benefit", "Benefit Global Assistance", "BGA", "Murat Aydın", "Elif Aydın", "Petra Hoffmann", "Akdeniz", "Selin Arslan", "Lara", "Kemer", "Belek", "Antalya"],
  scenarios: [
    {
      id: "hotline",
      kind: "voice",
      agentId: "inbound-hotline",
      title: bi("Sigortalı arıyor: 7/24 asistans hattı", "An insured member calls the 24/7 line"),
      tagline: bi("Acil durum ayrımı, poliçe doğrulama, anlaşmalı hastane, doktora aktarım", "Emergency triage, policy check, network hospital, transfer to a doctor"),
      summary: bi(
        "Antalya'da tatildeki bir sigortalı ya da yakını arıyor. Ajan önce acil durumu ayırt eder; poliçeyi numara ve doğum tarihiyle doğrular, anlaşmalı ağda doktor bulur ve gerektiğinde nöbetçi doktora özetle aktarır.",
        "An insured member on holiday in Antalya, or a relative, calls. The agent puts emergencies first, verifies the policy by number and date of birth, finds a doctor in the network and, when needed, transfers to the on-call doctor with a summary."
      ),
      languages: HOTLINE_LANGUAGES,
      languageLabel: bi("Görüşme dili", "Language of the call"),
      scripts: [
        {
          id: "emergency",
          title: bi("Acil durum: göğüs ağrısı", "Emergency: chest pain"),
          youPlay: bi(
            "Elif Aydın'sınız. Eşiniz Murat Aydın (Benefit sigortalısı) Lara'daki otelinizde göğüs ağrısı çekiyor.",
            "You are Elif Aydın. Your husband Murat Aydın, insured with Benefit, has chest pain at your hotel in Lara."
          ),
          facts: [
            { label: bi("Sigortalı", "Insured"), value: bi("Murat Aydın", "Murat Aydın") },
            { label: bi("Poliçe no", "Policy number"), value: bi("BGA-204417", "BGA-204417") },
            { label: bi("Doğum tarihi", "Date of birth"), value: bi("12 Mayıs 1968", "12 May 1968") },
            { label: bi("Konum", "Location"), value: bi("Otel, Lara, Antalya", "Hotel, Lara, Antalya") },
          ],
          say: {
            Turkish: [
              {
                text: "Merhaba, Antalya Lara'da oteldeyiz. Eşim Murat Aydın, poliçe numarası BGA iki sıfır dört dört bir yedi. Göğsünde çok kötü bir ağrı var, sol koluna vuruyor.",
                gloss: "Hello, we're at a hotel in Lara, Antalya. My husband is Murat Aydın, policy number BGA two zero four four one seven. He has very bad chest pain; it spreads to his left arm.",
              },
              { text: "Nefes almakta da zorlanıyor, terliyor.", gloss: "He's struggling to breathe too, and sweating." },
            ],
          },
          watch: [
            bi("Rutin soruları bırakır; önce 112'yi aramanızı söyler.", "It drops routine questions and first tells you to call 112."),
            bi("Vakayı KRİTİK öncelikle açar ve nöbetçi doktora iki cümlelik bir özetle aktarır.", "It opens the case as CRITICAL and transfers to the on-call doctor with a two-sentence summary."),
            bi(
              "Tarayıcıda aktarım yapılamadığı için doktorun geri arayacağını söyler; telefonda arayan, özet doktora okunduktan sonra bağlanır.",
              "A browser can't be transferred, so it says the doctor will call back; on the phone the caller is connected once the doctor has heard the summary."
            ),
            bi("Görüşme bitince: vaka, öncelik, aktarım özeti ve transkript.", "Afterwards: the case, its priority, the transfer summary and the transcript."),
          ],
        },
        {
          id: "coverage",
          title: bi("Kapsam sorusu ve doktor randevusu", "Coverage question and a doctor's appointment"),
          youPlay: bi(
            "Murat Aydın'sınız, Benefit sigortalısı. Kemer'de tatildesiniz; iki gündür ateşiniz ve boğaz ağrınız var.",
            "You are Murat Aydın, insured with Benefit, on holiday in Kemer, with a fever and a sore throat for two days."
          ),
          facts: [
            { label: bi("Poliçe no", "Policy number"), value: bi("BGA-204417", "BGA-204417") },
            { label: bi("Doğum tarihi", "Date of birth"), value: bi("12 Mayıs 1968", "12 May 1968") },
            { label: bi("Konum", "Location"), value: bi("Kemer, Antalya", "Kemer, Antalya") },
          ],
          say: {
            Turkish: [
              { text: "Merhaba, Kemer'de tatildeyim. İki gündür ateşim ve boğaz ağrım var.", gloss: "Hello, I'm on holiday in Kemer. I've had a fever and a sore throat for two days." },
              { text: "Poliçem doktor muayenesini karşılıyor mu?", gloss: "Does my policy cover a doctor's visit?" },
              { text: "Yarın sabah bir doktora gitmek istiyorum.", gloss: "I'd like to see a doctor tomorrow morning." },
              { text: "Birinci seçenek olsun, onaylıyorum.", gloss: "The first option, please. I confirm." },
            ],
          },
          watch: [
            bi("Poliçeyi numara ve doğum tarihiyle doğrular; yalnızca poliçede yazanı söyler ve son kararın tazminat ekibinde olduğunu ekler.", "It verifies the policy by number and date of birth, says only what the policy says, and adds that the claims team decides."),
            bi("Anlaşmalı ağdan seçenekler sunar, onayınızla randevuyu açar ve referans numarasını okur.", "It offers options from the network, books with your confirmation and reads out the reference."),
          ],
        },
      ],
    },
    {
      id: "hospital",
      kind: "voice",
      agentId: "outbound-hospital-coordination",
      onCase: true,
      title: bi("Hastane ile koordinasyon", "Calling the hospital"),
      tagline: bi("Yatış, servis, hekim, tahmini maliyet ve epikriz: Türkçe", "Admission, ward, doctor, cost estimate and report: in Turkish"),
      summary: bi(
        "Ajan, Petra Hoffmann'ın yattığı Antalya'daki hastaneyi Benefit adına arar: yatışı, servisi, sorumlu hekimi, tahmini maliyeti ve epikrizin ne zaman hazır olacağını sorar, bilgileri vakaya kaydeder. Siz hastanenin uluslararası hasta birimisiniz.",
        "The agent calls the Antalya hospital where Petra Hoffmann is admitted, on Benefit's behalf: it asks about the admission, the ward, the attending doctor, the cost estimate and when the report will be ready, and records it all on the case. You are the hospital's international patients desk."
      ),
      languages: HOSPITAL_LANGUAGES,
      languageLabel: bi("Görüşme dili", "Language of the call"),
      scripts: [
        {
          id: "admission",
          title: bi("Yatış bilgisi ve maliyet tahmini", "Admission details and the cost estimate"),
          youPlay: bi(
            "Antalya Demo Akdeniz Hastanesi, Uluslararası Hasta Birimi çalışanısınız. Ajan sizi arıyor; ilk o konuşur.",
            "You work at the international patients desk of Antalya Demo Akdeniz Hastanesi. The agent is calling you, so it speaks first."
          ),
          facts: [
            { label: bi("Hasta", "Patient"), value: bi("Petra Hoffmann, 3 Eylül 1958, Almanya", "Petra Hoffmann, 3 September 1958, Germany") },
            { label: bi("Yatış", "Admission"), value: bi("Dün akşam acilden; ortopedi servisi, oda 412", "Last night via the ER; orthopaedics ward, room 412") },
            { label: bi("Sorumlu hekim", "Attending doctor"), value: bi("Op. Dr. Selin Arslan", "Op. Dr. Selin Arslan") },
            { label: bi("Tanı", "Diagnosis"), value: bi("Sol kalça kırığı; yarın sabah ameliyat", "Left hip fracture; surgery tomorrow morning") },
            { label: bi("Tahmini maliyet", "Cost estimate"), value: bi("7.860 Euro", "EUR 7,860") },
            { label: bi("Epikriz", "Medical report"), value: bi("Taburculukta, yaklaşık 5 gün sonra", "At discharge, in about 5 days") },
          ],
          say: {
            Turkish: [
              { text: "Akdeniz Hastanesi, uluslararası hasta birimi, buyurun.", gloss: "Akdeniz Hospital, international patients desk, how can I help?" },
              { text: "Evet, hasta dün akşam acilden yatırıldı. Ortopedi servisinde, 412 numaralı odada.", gloss: "Yes, she was admitted through the ER last night. Orthopaedics ward, room 412." },
              { text: "Sorumlu hekimi Operatör Doktor Selin Arslan. Yarın sabah ameliyat olacak.", gloss: "Her doctor is Op. Dr. Selin Arslan. Surgery is tomorrow morning." },
              { text: "Tahmini maliyet yedi bin sekiz yüz altmış Euro.", gloss: "The estimated cost is seven thousand eight hundred and sixty euros." },
              { text: "Epikriz taburculukta hazır olur, yaklaşık beş gün sonra.", gloss: "The discharge report will be ready at discharge, in about five days." },
            ],
            English: [
              { text: "Akdeniz Hospital, international patients desk, how can I help?" },
              { text: "Yes, she was admitted through the ER last night. Orthopaedics ward, room 412." },
              { text: "Her doctor is Op. Dr. Selin Arslan. Surgery is tomorrow morning." },
              { text: "The estimated cost is seven thousand eight hundred and sixty euros." },
            ],
          },
          watch: [
            bi("Tutarları ve tarihleri tekrar ederek teyit eder.", "It repeats amounts and dates back to confirm them."),
            bi("Bilgileri vakaya kaydeder, ardından raporun e-postayla gönderilmesini ister.", "It records the details on the case, then asks for the report by e-mail."),
            bi("İsterseniz “Garanti mektubu gelmeden bilgi veremem” deyin; nasıl davrandığını görün.", "Try saying “I can't share anything without a guarantee of payment” and see how it handles it."),
          ],
        },
      ],
    },
    {
      id: "interpreter",
      kind: "voice",
      agentId: "conversation-interpreter",
      onCase: true,
      title: bi("Canlı tercüman", "Live interpreter"),
      tagline: bi("Hasta ve doktor tek cihazda, iki yönlü çeviri, altyazılı", "Patient and doctor on one device, both ways, with captions"),
      summary: bi(
        "Petra Hoffmann ile Türk doktoru aynı telefonu ya da bilgisayarı paylaşır. Ajan her cümleyi diğer kişinin diline, birinci ağızdan çevirir; kendi yorumunu eklemez. Transkript iki dilde vakaya kaydedilir.",
        "Petra Hoffmann and her Turkish doctor share one phone or laptop. The agent says each sentence in the other person's language, in the first person, adding nothing of its own. The transcript is filed on the case in both languages."
      ),
      languages: INTERPRETER_PATIENT_LANGUAGES,
      languageLabel: bi("Hastanın dili (doktor Türkçe konuşur)", "The patient's language (the doctor speaks Turkish)"),
      scripts: [
        {
          id: "bedside",
          title: bi("Hasta başında: doktor ve hasta", "At the bedside: doctor and patient"),
          youPlay: bi(
            "Türk doktorusunuz (Türkçe konuşun); isterseniz hastanın cümlelerini de siz okuyun. Her cümleden sonra kısa bir duraklama verin.",
            "You are the Turkish doctor (speak Turkish); read the patient's lines too if you like. Pause briefly after each sentence."
          ),
          facts: [
            { label: bi("Hasta", "Patient"), value: bi("Petra Hoffmann, 66", "Petra Hoffmann, 66") },
            { label: bi("Durum", "Condition"), value: bi("Sol kalça kırığı, yarın ameliyat", "Left hip fracture, surgery tomorrow") },
            { label: bi("Yer", "Where"), value: bi("Antalya Demo Akdeniz Hastanesi, ortopedi servisi", "Antalya Demo Akdeniz Hastanesi, orthopaedics ward") },
          ],
          say: {
            Turkish: [
              { text: "Merhaba Bayan Hoffmann, ben Doktor Arslan. Ağrınız şu an sıfırdan ona kadar kaç?", gloss: "Hello Mrs Hoffmann, I'm Dr Arslan. How bad is your pain right now, from zero to ten?" },
              { text: "Yarın sabah ameliyat yapacağız. Gece yarısından sonra bir şey yemeyin ve içmeyin.", gloss: "We'll operate tomorrow morning. Don't eat or drink anything after midnight." },
            ],
            German: [
              { text: "Ich habe starke Schmerzen in der linken Hüfte, ungefähr acht von zehn.", gloss: "I have severe pain in my left hip, about eight out of ten." },
              { text: "Wie lange muss ich nach der Operation im Krankenhaus bleiben?", gloss: "How long will I have to stay in hospital after the operation?" },
            ],
            English: [
              { text: "I have severe pain in my left hip, about eight out of ten." },
              { text: "How long will I have to stay in hospital after the operation?" },
            ],
            Russian: [
              { text: "У меня сильная боль в левом бедре, примерно восемь из десяти.", gloss: "I have severe pain in my left hip, about eight out of ten." },
              { text: "Сколько мне придётся пробыть в больнице после операции?", gloss: "How long will I have to stay in hospital after the operation?" },
            ],
            Arabic: [
              { text: "عندي ألم شديد في الورك الأيسر، حوالي ثمانية من عشرة.", gloss: "I have severe pain in my left hip, about eight out of ten." },
              { text: "كم يوماً سأبقى في المستشفى بعد العملية؟", gloss: "How many days will I stay in hospital after the operation?" },
            ],
          },
          watch: [
            bi("Ajan önce iki dilde kendini tanıtır, sonra yalnızca çevirir.", "The agent introduces itself once in both languages, then only interprets."),
            bi("Sayılar, saatler ve ilaç adları olduğu gibi aktarılır.", "Numbers, times and medication names come through exactly."),
            bi("Transkript iki dilde Petra Hoffmann'ın vakasına kaydedilir.", "The bilingual transcript is filed on Petra Hoffmann's case."),
          ],
        },
      ],
    },
    {
      id: "guarantee",
      kind: "documents",
      onCase: true,
      title: bi("Provizyon: garanti mektubu", "Guarantee of payment"),
      tagline: bi("E-postayla gelen maliyet tahmini → kurallar → Türkçe-İngilizce garanti mektubu", "A cost estimate by e-mail → rules → a Turkish-English letter"),
      summary: bi(
        "Hastane, Petra Hoffmann'ın ameliyatı için Türkçe maliyet tahminini e-postayla gönderir. CareTrail belgeyi okur, vakayla eşleştirir, poliçe kurallarını uygular ve garanti mektubunu hazırlar. Karar kuralları sabittir; yapay zekâ yalnızca belgeyi okur. Bu senaryo ses süresi kullanmaz.",
        "The hospital e-mails its Turkish cost estimate for Petra Hoffmann's surgery. CareTrail reads the document, matches it to the case, applies the policy rules and issues the guarantee letter. The decision is made by fixed rules; the AI only reads the document. This scenario uses no voice minutes."
      ),
      scripts: [],
    },
  ],
  modules: {
    inbox: [
      {
        id: "benefit-arabic-report-jeddah",
        channel: "email",
        from: "Al Shati Demo Hospital, Jeddah",
        title: bi("Cidde'den Arapça e-posta ve taranmış rapor", "An Arabic e-mail and a scanned report from Jeddah"),
        note: bi(
          "Hastane, umre dönüşü zatürre olan Hasan Kılıç için yazıyor. E-posta ve rapor İngilizceye çevrilir, rapor görüntüden okunur ve Hasan'ın dosyasına eklenir.",
          "The hospital writes about Hasan Kılıç, admitted with pneumonia after umrah. The e-mail and the report are translated into English, the report is read from the image, and both are filed on his case."
        ),
        language: "ar",
      },
      {
        id: "benefit-french-report-paris",
        channel: "email",
        from: "Clinique Démo des Batignolles, Paris",
        title: bi("Paris'ten Fransızca hastane raporu", "A French hospital report from Paris"),
        note: bi(
          "Klinik, Elif Şahin'in apandisit ameliyatı raporunu gönderiyor ve masrafların onayını istiyor. E-posta ve rapor İngilizceye çevrilir ve dosyasına eklenir.",
          "The clinic sends Elif Şahin's appendicitis surgery report and asks you to confirm the costs. The e-mail and the report are translated into English and filed on her case."
        ),
        language: "fr",
      },
      {
        id: "fax-medical-report",
        channel: "fax",
        from: "+90 212 000 2005",
        title: bi("El yazısıyla doldurulmuş faks", "A fax filled in by hand"),
        note: bi(
          "Metin katmanı olmayan bir tıbbi rapor faksı: görüntüden okunur (OCR), alanlar çıkarılır ve doğru vakaya eklenir.",
          "A medical report fax with no text layer: read from the image (OCR), its fields extracted and filed on the right case."
        ),
        language: "en",
      },
      {
        id: "wa-traveller-status-es",
        channel: "whatsapp",
        from: "+34 600 000 109",
        title: bi("WhatsApp'tan İspanyolca soru", "A question on WhatsApp, in Spanish"),
        note: bi(
          "Bir sigortalı dosyasının durumunu soruyor: dosya bulunur ve yanıt, kayıtlardaki gerçek durumla, kendi dilinde gider.",
          "A traveller asks where their case stands: the case is found and the answer goes back in Spanish, with the case's real status."
        ),
        language: "es",
      },
    ],
    documents: [
      {
        file: "demo-documents/medical-report-ar-hasan-kilic-jeddah.pdf",
        title: bi("Arapça tıbbi rapor (taranmış)", "Arabic medical report (scanned)"),
        note: bi("Cidde · zatürre · görüntüden okunur, İngilizceye çevrilir", "Jeddah · pneumonia · read from the image, translated into English"),
        language: "ar",
      },
      {
        file: "demo-documents/compte-rendu-elif-sahin-paris.pdf",
        title: bi("Fransızca hastane raporu", "French hospital report"),
        note: bi("Paris · apandisit ameliyatı · İngilizceye çevrilir", "Paris · appendicitis surgery · translated into English"),
        language: "fr",
      },
      {
        file: "demo-inbound/fax-medical-report-lena-koch.pdf",
        title: bi("El yazısı faks", "Handwritten fax"),
        note: bi("İstanbul · göğüs ağrısı · görüntüden okunur (OCR)", "Istanbul · chest pain · read from the image (OCR)"),
        language: "en",
      },
    ],
  },
};

export const PORTAL_KITS: Record<string, PortalKit> = { benefit: BENEFIT_KIT };

export function kitOf(id: string): PortalKit | null {
  return PORTAL_KITS[id] ?? null;
}

export function scenarioOf(kit: PortalKit, id: string): Scenario | null {
  return kit.scenarios.find((s) => s.id === id) ?? null;
}
