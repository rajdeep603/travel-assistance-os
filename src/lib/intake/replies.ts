import { BRAND } from "@/lib/brand";

// ---------------------------------------------------------------------------
// Automatic e-mail replies, written from facts in a fixed phrasebook per
// language, so a traveller who writes in Spanish is answered in Spanish even
// offline, and nothing in the reply is invented. Languages outside the
// phrasebook fall back to English (and to the AI translation when it's live).
// ---------------------------------------------------------------------------

export type CaseStatusCode = "NEW" | "IN_PROGRESS" | "PENDING_INFO" | "ESCALATED" | "RESOLVED" | "CLOSED";
export type ClaimStatusCode = "SUBMITTED" | "PROCESSING" | "NEEDS_REVIEW" | "INFO_REQUESTED" | "APPROVED" | "ESCALATED" | "REJECTED" | "PAID";
export type GuaranteeStatusCode = "DRAFT" | "APPROVED" | "SENT" | "ACKNOWLEDGED" | "REJECTED";
export type TransportModeCode = "COMMERCIAL" | "COMMERCIAL_ESCORTED" | "COMMERCIAL_STRETCHER" | "AIR_AMBULANCE" | "NOT_FIT_TO_FLY";
export type MissingItem = "MEDICAL_REPORT" | "HOSPITAL_INVOICE" | "DISCHARGE_SUMMARY" | "POLICY_NUMBER" | "PROOF_OF_PAYMENT";

/** The claims team's recorded issue ("Itemised invoice missing") as a document the reply can name. */
export function missingItem(message: string): MissingItem | null {
  if (/medical report/i.test(message)) return "MEDICAL_REPORT";
  if (/invoice/i.test(message)) return "HOSPITAL_INVOICE";
  if (/discharge/i.test(message)) return "DISCHARGE_SUMMARY";
  if (/policy number/i.test(message)) return "POLICY_NUMBER";
  if (/proof of payment|receipt/i.test(message)) return "PROOF_OF_PAYMENT";
  return null;
}

/** What a traveller's reply may say about their case. */
export interface TravellerFacts {
  name: string;
  documents: string[];
  caseRef: string;
  caseStatus: CaseStatusCode;
  /** Upcoming appointment, Istanbul wall-clock. */
  appointment: { date: string; time: string; doctor: string; facility: string } | null;
  guarantee: { hospital: string; status: GuaranteeStatusCode } | null;
  transport: TransportModeCode | null;
  /** `complete`: the claims team recorded nothing outstanding. */
  claim: { ref: string; status: ClaimStatusCode; missing: MissingItem[]; complete: boolean } | null;
}

interface Phrasebook {
  locale: string;
  greet(name: string): string;
  received(files: string[]): string;
  caseStatus: Record<CaseStatusCode, string>;
  caseLine(ref: string, predicate: string): string;
  appointment(date: string, time: string, doctor: string, facility: string): string;
  guarantee(hospital: string, status: "ACK" | "SENT" | "PREP"): string;
  transport: Record<Exclude<TransportModeCode, "NOT_FIT_TO_FLY">, string>;
  transportLine(mode: string): string;
  notFitToFly: string;
  claimStatus: Record<ClaimStatusCode, string>;
  claimLine(ref: string, predicate: string): string;
  missingItems: Record<MissingItem, string>;
  missing(list: string): string;
  complete: string;
  signoff: [string, string];
}

const DEMO = (s: string) => `${BRAND.name} (${s})`;

const PHRASES: Record<string, Phrasebook> = {
  en: {
    locale: "en-GB",
    greet: (n) => `Dear ${n},`,
    received: (f) =>
      f.length ? `Thank you for your message; we have received it with ${f.length === 1 ? "1 document" : `${f.length} documents`}: ${f.join(", ")}.` : "Thank you for your message; we have received it.",
    caseStatus: { NEW: "is open", IN_PROGRESS: "is in progress", PENDING_INFO: "is waiting for information", ESCALATED: "is being handled as a priority", RESOLVED: "is resolved", CLOSED: "is closed" },
    caseLine: (r, p) => `Your case ${r} ${p}.`,
    appointment: (d, t, doc, f) => `Your appointment with ${doc} at ${f} is on ${d} at ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `${h} has received our guarantee of payment, so you won't be asked for a deposit.` : s === "SENT" ? `We have sent our guarantee of payment to ${h}.` : `We are preparing the guarantee of payment for ${h}.`,
    transport: { COMMERCIAL: "a scheduled flight, seated", COMMERCIAL_ESCORTED: "a scheduled flight with a medical escort", COMMERCIAL_STRETCHER: "a stretcher on a scheduled flight", AIR_AMBULANCE: "an air ambulance" },
    transportLine: (m) => `We are arranging your journey home: ${m}.`,
    notFitToFly: "We will arrange your journey home as soon as the doctor confirms you are fit to fly.",
    claimStatus: { SUBMITTED: "has been submitted", PROCESSING: "is being processed", NEEDS_REVIEW: "is being reviewed", INFO_REQUESTED: "is waiting for documents", APPROVED: "is approved", ESCALATED: "is with a senior claims handler", REJECTED: "was declined", PAID: "has been paid" },
    claimLine: (r, p) => `Your claim ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "the medical report", HOSPITAL_INVOICE: "the hospital invoice", DISCHARGE_SUMMARY: "the discharge summary", POLICY_NUMBER: "the policy number", PROOF_OF_PAYMENT: "proof of payment" },
    missing: (l) => `To complete it we still need: ${l}. You can simply reply to this e-mail with the documents.`,
    complete: "All required documents are on file; a claims handler will review the claim shortly.",
    signoff: ["Kind regards,", `Assistance team, ${DEMO("demonstration platform; all data is fictional")}`],
  },
  es: {
    locale: "es-ES",
    greet: (n) => `Estimado/a ${n}:`,
    received: (f) =>
      f.length ? `Gracias por su mensaje; lo hemos recibido junto con ${f.length === 1 ? "1 documento" : `${f.length} documentos`}: ${f.join(", ")}.` : "Gracias por su mensaje; lo hemos recibido.",
    caseStatus: { NEW: "está abierto", IN_PROGRESS: "está en curso", PENDING_INFO: "está a la espera de información", ESCALATED: "se está gestionando con prioridad", RESOLVED: "está resuelto", CLOSED: "está cerrado" },
    caseLine: (r, p) => `Su caso ${r} ${p}.`,
    appointment: (d, t, doc, f) => `Su cita con ${doc} en ${f} es el ${d} a las ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `${h} ha recibido nuestra garantía de pago, por lo que no se le pedirá ningún depósito.` : s === "SENT" ? `Hemos enviado nuestra garantía de pago a ${h}.` : `Estamos preparando la garantía de pago para ${h}.`,
    transport: { COMMERCIAL: "vuelo regular, sentado", COMMERCIAL_ESCORTED: "vuelo regular con acompañamiento médico", COMMERCIAL_STRETCHER: "camilla en vuelo regular", AIR_AMBULANCE: "avión ambulancia" },
    transportLine: (m) => `Estamos organizando su regreso a casa: ${m}.`,
    notFitToFly: "Organizaremos su regreso a casa en cuanto el médico confirme que puede volar.",
    claimStatus: { SUBMITTED: "ha sido presentada", PROCESSING: "está en tramitación", NEEDS_REVIEW: "está en revisión", INFO_REQUESTED: "está pendiente de documentación", APPROVED: "ha sido aprobada", ESCALATED: "está en manos de un tramitador sénior", REJECTED: "ha sido rechazada", PAID: "ha sido pagada" },
    claimLine: (r, p) => `Su reclamación ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "el informe médico", HOSPITAL_INVOICE: "la factura del hospital", DISCHARGE_SUMMARY: "el informe de alta", POLICY_NUMBER: "el número de póliza", PROOF_OF_PAYMENT: "el justificante de pago" },
    missing: (l) => `Para completarla todavía necesitamos: ${l}. Puede responder a este correo con los documentos.`,
    complete: "Tenemos todos los documentos necesarios; un tramitador revisará la reclamación en breve.",
    signoff: ["Atentamente,", `Equipo de asistencia, ${DEMO("plataforma de demostración; todos los datos son ficticios")}`],
  },
  de: {
    locale: "de-DE",
    greet: (n) => `Guten Tag ${n},`,
    received: (f) =>
      f.length
        ? `vielen Dank für Ihre Nachricht; sie ist mit ${f.length === 1 ? "1 Dokument" : `${f.length} Dokumenten`} bei uns eingegangen: ${f.join(", ")}.`
        : "vielen Dank für Ihre Nachricht; sie ist bei uns eingegangen.",
    caseStatus: { NEW: "ist eröffnet", IN_PROGRESS: "ist in Bearbeitung", PENDING_INFO: "wartet auf weitere Informationen", ESCALATED: "wird vorrangig bearbeitet", RESOLVED: "ist erledigt", CLOSED: "ist abgeschlossen" },
    caseLine: (r, p) => `Ihr Fall ${r} ${p}.`,
    appointment: (d, t, doc, f) => `Ihr Termin bei ${doc} (${f}) ist am ${d} um ${t} Uhr.`,
    guarantee: (h, s) =>
      s === "ACK"
        ? `${h} hat unsere Kostenübernahmegarantie erhalten; Sie müssen also keine Anzahlung leisten.`
        : s === "SENT"
          ? `Wir haben unsere Kostenübernahmegarantie an ${h} geschickt.`
          : `Wir bereiten die Kostenübernahmegarantie für ${h} vor.`,
    transport: { COMMERCIAL: "Linienflug, sitzend", COMMERCIAL_ESCORTED: "Linienflug mit medizinischer Begleitung", COMMERCIAL_STRETCHER: "Liegendtransport im Linienflug", AIR_AMBULANCE: "Ambulanzflug" },
    transportLine: (m) => `Wir organisieren Ihre Heimreise: ${m}.`,
    notFitToFly: "Wir organisieren Ihre Heimreise, sobald der Arzt bestätigt, dass Sie flugtauglich sind.",
    claimStatus: { SUBMITTED: "ist eingereicht", PROCESSING: "wird bearbeitet", NEEDS_REVIEW: "wird geprüft", INFO_REQUESTED: "wartet auf Unterlagen", APPROVED: "ist genehmigt", ESCALATED: "liegt bei einem erfahrenen Sachbearbeiter", REJECTED: "wurde abgelehnt", PAID: "ist ausgezahlt" },
    claimLine: (r, p) => `Ihr Erstattungsantrag ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "der ärztliche Bericht", HOSPITAL_INVOICE: "die Krankenhausrechnung", DISCHARGE_SUMMARY: "der Entlassungsbericht", POLICY_NUMBER: "die Policennummer", PROOF_OF_PAYMENT: "der Zahlungsnachweis" },
    missing: (l) => `Damit wir ihn abschließen können, fehlen noch: ${l}. Sie können die Unterlagen einfach als Antwort auf diese E-Mail senden.`,
    complete: "Alle erforderlichen Unterlagen liegen vor; ein Sachbearbeiter prüft den Antrag in Kürze.",
    signoff: ["Mit freundlichen Grüßen", `Ihr Assistance-Team, ${DEMO("Demonstrationsplattform; alle Daten sind fiktiv")}`],
  },
  fr: {
    locale: "fr-FR",
    greet: (n) => `Bonjour ${n},`,
    received: (f) =>
      f.length ? `Merci pour votre message ; nous l'avons bien reçu avec ${f.length === 1 ? "1 document" : `${f.length} documents`} : ${f.join(", ")}.` : "Merci pour votre message ; nous l'avons bien reçu.",
    caseStatus: { NEW: "est ouvert", IN_PROGRESS: "est en cours de traitement", PENDING_INFO: "est en attente d'informations", ESCALATED: "est traité en priorité", RESOLVED: "est résolu", CLOSED: "est clôturé" },
    caseLine: (r, p) => `Votre dossier ${r} ${p}.`,
    appointment: (d, t, doc, f) => `Votre rendez-vous avec ${doc} (${f}) est prévu le ${d} à ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `${h} a reçu notre garantie de paiement : aucun acompte ne vous sera demandé.` : s === "SENT" ? `Nous avons envoyé notre garantie de paiement à ${h}.` : `Nous préparons la garantie de paiement pour ${h}.`,
    transport: { COMMERCIAL: "vol régulier, en position assise", COMMERCIAL_ESCORTED: "vol régulier avec escorte médicale", COMMERCIAL_STRETCHER: "civière sur vol régulier", AIR_AMBULANCE: "avion sanitaire" },
    transportLine: (m) => `Nous organisons votre rapatriement : ${m}.`,
    notFitToFly: "Nous organiserons votre rapatriement dès que le médecin confirmera que vous pouvez prendre l'avion.",
    claimStatus: { SUBMITTED: "a été déposée", PROCESSING: "est en cours de traitement", NEEDS_REVIEW: "est en cours d'examen", INFO_REQUESTED: "est en attente de documents", APPROVED: "est approuvée", ESCALATED: "est confiée à un gestionnaire senior", REJECTED: "a été refusée", PAID: "a été payée" },
    claimLine: (r, p) => `Votre demande de remboursement ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "le rapport médical", HOSPITAL_INVOICE: "la facture de l'hôpital", DISCHARGE_SUMMARY: "le compte rendu de sortie", POLICY_NUMBER: "le numéro de police", PROOF_OF_PAYMENT: "le justificatif de paiement" },
    missing: (l) => `Pour la compléter, il nous manque encore : ${l}. Vous pouvez simplement répondre à cet e-mail avec les documents.`,
    complete: "Tous les documents nécessaires sont au dossier ; un gestionnaire examinera la demande sous peu.",
    signoff: ["Cordialement,", `L'équipe d'assistance, ${DEMO("plateforme de démonstration ; toutes les données sont fictives")}`],
  },
  it: {
    locale: "it-IT",
    greet: (n) => `Gentile ${n},`,
    received: (f) =>
      f.length ? `grazie per il suo messaggio; l'abbiamo ricevuto con ${f.length === 1 ? "1 documento" : `${f.length} documenti`}: ${f.join(", ")}.` : "grazie per il suo messaggio; l'abbiamo ricevuto.",
    caseStatus: { NEW: "è aperta", IN_PROGRESS: "è in lavorazione", PENDING_INFO: "è in attesa di informazioni", ESCALATED: "è gestita con priorità", RESOLVED: "è risolta", CLOSED: "è chiusa" },
    caseLine: (r, p) => `La sua pratica ${r} ${p}.`,
    appointment: (d, t, doc, f) => `Il suo appuntamento con ${doc} (${f}) è ${d} alle ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `${h} ha ricevuto la nostra garanzia di pagamento: non le sarà chiesto alcun deposito.` : s === "SENT" ? `Abbiamo inviato la nostra garanzia di pagamento a ${h}.` : `Stiamo preparando la garanzia di pagamento per ${h}.`,
    transport: { COMMERCIAL: "volo di linea, seduto", COMMERCIAL_ESCORTED: "volo di linea con accompagnamento medico", COMMERCIAL_STRETCHER: "barella su volo di linea", AIR_AMBULANCE: "aeroambulanza" },
    transportLine: (m) => `Stiamo organizzando il suo rientro a casa: ${m}.`,
    notFitToFly: "Organizzeremo il suo rientro non appena il medico confermerà che può volare.",
    claimStatus: { SUBMITTED: "è stata presentata", PROCESSING: "è in lavorazione", NEEDS_REVIEW: "è in verifica", INFO_REQUESTED: "è in attesa di documenti", APPROVED: "è stata approvata", ESCALATED: "è stata affidata a un liquidatore senior", REJECTED: "è stata respinta", PAID: "è stata pagata" },
    claimLine: (r, p) => `La sua richiesta di rimborso ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "il referto medico", HOSPITAL_INVOICE: "la fattura dell'ospedale", DISCHARGE_SUMMARY: "la lettera di dimissione", POLICY_NUMBER: "il numero di polizza", PROOF_OF_PAYMENT: "la prova di pagamento" },
    missing: (l) => `Per completarla ci servono ancora: ${l}. Può semplicemente rispondere a questa e-mail con i documenti.`,
    complete: "Abbiamo tutti i documenti necessari; un liquidatore esaminerà la richiesta a breve.",
    signoff: ["Cordiali saluti,", `Il team di assistenza, ${DEMO("piattaforma dimostrativa; tutti i dati sono fittizi")}`],
  },
  tr: {
    locale: "tr-TR",
    greet: (n) => `Sayın ${n},`,
    received: (f) => (f.length ? `Mesajınız için teşekkür ederiz; ${f.length} belgeyle birlikte elimize ulaştı: ${f.join(", ")}.` : "Mesajınız için teşekkür ederiz; elimize ulaştı."),
    caseStatus: { NEW: "açıldı", IN_PROGRESS: "işlemde", PENDING_INFO: "bilgi bekliyor", ESCALATED: "öncelikli olarak ele alınıyor", RESOLVED: "çözüldü", CLOSED: "kapatıldı" },
    caseLine: (r, p) => `${r} numaralı dosyanız ${p}.`,
    appointment: (d, t, doc, f) => `Randevunuz: ${d}, saat ${t}, ${doc} (${f}).`,
    guarantee: (h, s) =>
      s === "ACK" ? `Ödeme garantimiz ${h} tarafından alındı; sizden depozito istenmeyecek.` : s === "SENT" ? `Ödeme garantimiz gönderildi: ${h}.` : `Ödeme garantisi hazırlanıyor: ${h}.`,
    transport: { COMMERCIAL: "tarifeli uçuş, oturarak", COMMERCIAL_ESCORTED: "tıbbi refakatli tarifeli uçuş", COMMERCIAL_STRETCHER: "tarifeli uçuşta sedye", AIR_AMBULANCE: "ambulans uçak" },
    transportLine: (m) => `Eve dönüşünüzü organize ediyoruz: ${m}.`,
    notFitToFly: "Doktorunuz uçabileceğinizi onayladığında eve dönüşünüzü organize edeceğiz.",
    claimStatus: { SUBMITTED: "alındı", PROCESSING: "işleniyor", NEEDS_REVIEW: "inceleniyor", INFO_REQUESTED: "belge bekliyor", APPROVED: "onaylandı", ESCALATED: "kıdemli bir uzmana iletildi", REJECTED: "reddedildi", PAID: "ödendi" },
    claimLine: (r, p) => `${r} numaralı talebiniz ${p}.`,
    missingItems: { MEDICAL_REPORT: "tıbbi rapor", HOSPITAL_INVOICE: "hastane faturası", DISCHARGE_SUMMARY: "taburcu özeti (epikriz)", POLICY_NUMBER: "poliçe numarası", PROOF_OF_PAYMENT: "ödeme belgesi" },
    missing: (l) => `Tamamlamak için hâlâ şunlara ihtiyacımız var: ${l}. Belgeleri bu e-postayı yanıtlayarak gönderebilirsiniz.`,
    complete: "Gerekli tüm belgeler elimizde; talebiniz kısa süre içinde incelenecek.",
    signoff: ["Saygılarımızla,", `Asistans ekibi, ${DEMO("tanıtım platformu; tüm veriler kurgusaldır")}`],
  },
  ru: {
    locale: "ru-RU",
    greet: (n) => `Здравствуйте, ${n}!`,
    received: (f) => (f.length ? `Спасибо за ваше сообщение, мы получили его вместе с документами (${f.length}): ${f.join(", ")}.` : "Спасибо за ваше сообщение, мы его получили."),
    caseStatus: { NEW: "открыто", IN_PROGRESS: "в работе", PENDING_INFO: "ожидает информации", ESCALATED: "рассматривается в приоритетном порядке", RESOLVED: "решено", CLOSED: "закрыто" },
    caseLine: (r, p) => `Ваше дело ${r} ${p}.`,
    appointment: (d, t, doc, f) => `Ваш приём у врача ${doc} (${f}) назначен на ${d}, ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `Клиника ${h} получила наше гарантийное письмо, поэтому депозит с вас не потребуют.` : s === "SENT" ? `Мы отправили гарантийное письмо в клинику ${h}.` : `Мы готовим гарантийное письмо для клиники ${h}.`,
    transport: { COMMERCIAL: "регулярный рейс, сидя", COMMERCIAL_ESCORTED: "регулярный рейс с медицинским сопровождением", COMMERCIAL_STRETCHER: "носилки на регулярном рейсе", AIR_AMBULANCE: "санитарный самолёт" },
    transportLine: (m) => `Мы организуем ваше возвращение домой: ${m}.`,
    notFitToFly: "Мы организуем ваше возвращение домой, как только врач подтвердит, что вам можно лететь.",
    claimStatus: { SUBMITTED: "подано", PROCESSING: "обрабатывается", NEEDS_REVIEW: "на проверке", INFO_REQUESTED: "ожидает документов", APPROVED: "одобрено", ESCALATED: "передано старшему специалисту", REJECTED: "отклонено", PAID: "оплачено" },
    claimLine: (r, p) => `Ваше заявление на возмещение ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "медицинское заключение", HOSPITAL_INVOICE: "счёт из больницы", DISCHARGE_SUMMARY: "выписка из больницы", POLICY_NUMBER: "номер полиса", PROOF_OF_PAYMENT: "подтверждение оплаты" },
    missing: (l) => `Чтобы завершить его, нам ещё нужны: ${l}. Просто ответьте на это письмо, приложив документы.`,
    complete: "Все необходимые документы получены; специалист рассмотрит заявление в ближайшее время.",
    signoff: ["С уважением,", `Служба ассистанса, ${DEMO("демонстрационная платформа; все данные вымышлены")}`],
  },
  ar: {
    locale: "ar-u-nu-latn",
    greet: (n) => `عزيزي/عزيزتي ${n}،`,
    received: (f) => (f.length ? `شكرًا لرسالتك، لقد استلمناها مع ${f.length === 1 ? "مستند واحد" : `${f.length} مستندات`}: ${f.join("، ")}.` : "شكرًا لرسالتك، لقد استلمناها."),
    caseStatus: { NEW: "مفتوح", IN_PROGRESS: "قيد المعالجة", PENDING_INFO: "بانتظار معلومات", ESCALATED: "قيد المعالجة بأولوية", RESOLVED: "تمت تسويته", CLOSED: "مغلق" },
    caseLine: (r, p) => `ملفك ${r} ${p}.`,
    appointment: (d, t, doc, f) => `موعدك مع ${doc} في ${f} يوم ${d} الساعة ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `استلم ${h} خطاب ضمان الدفع، لذا لن يُطلب منك أي مبلغ تأمين.` : s === "SENT" ? `أرسلنا خطاب ضمان الدفع إلى ${h}.` : `نقوم بإعداد خطاب ضمان الدفع لـ ${h}.`,
    transport: { COMMERCIAL: "رحلة منتظمة، جلوسًا", COMMERCIAL_ESCORTED: "رحلة منتظمة بمرافقة طبية", COMMERCIAL_STRETCHER: "نقالة على رحلة منتظمة", AIR_AMBULANCE: "طائرة إسعاف" },
    transportLine: (m) => `نقوم بترتيب عودتك إلى بلدك: ${m}.`,
    notFitToFly: "سنرتب عودتك إلى بلدك فور تأكيد الطبيب أنك قادر على السفر جوًا.",
    claimStatus: { SUBMITTED: "مقدَّمة", PROCESSING: "قيد المعالجة", NEEDS_REVIEW: "قيد المراجعة", INFO_REQUESTED: "بانتظار المستندات", APPROVED: "تمت الموافقة عليها", ESCALATED: "محالة إلى موظف مطالبات أول", REJECTED: "مرفوضة", PAID: "مدفوعة" },
    claimLine: (r, p) => `مطالبتك ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "التقرير الطبي", HOSPITAL_INVOICE: "فاتورة المستشفى", DISCHARGE_SUMMARY: "ملخص الخروج من المستشفى", POLICY_NUMBER: "رقم الوثيقة", PROOF_OF_PAYMENT: "إثبات الدفع" },
    missing: (l) => `لإكمالها ما زلنا نحتاج إلى: ${l}. يمكنك ببساطة الرد على هذا البريد مع المستندات.`,
    complete: "جميع المستندات المطلوبة متوفرة لدينا؛ سيراجع موظف المطالبات طلبك قريبًا.",
    signoff: ["مع أطيب التحيات،", `فريق المساعدة، ${DEMO("منصة تجريبية؛ جميع البيانات وهمية")}`],
  },
  pt: {
    locale: "pt-PT",
    greet: (n) => `Caro/a ${n},`,
    received: (f) =>
      f.length ? `Obrigado pela sua mensagem; recebemo-la com ${f.length === 1 ? "1 documento" : `${f.length} documentos`}: ${f.join(", ")}.` : "Obrigado pela sua mensagem; recebemo-la.",
    caseStatus: { NEW: "foi aberto", IN_PROGRESS: "está em curso", PENDING_INFO: "aguarda informações", ESCALATED: "está a ser tratado com prioridade", RESOLVED: "está resolvido", CLOSED: "está encerrado" },
    caseLine: (r, p) => `O seu processo ${r} ${p}.`,
    appointment: (d, t, doc, f) => `A sua consulta com ${doc} (${f}) é ${d} às ${t}.`,
    guarantee: (h, s) =>
      s === "ACK" ? `${h} recebeu a nossa garantia de pagamento, por isso não lhe será pedido nenhum depósito.` : s === "SENT" ? `Enviámos a nossa garantia de pagamento a ${h}.` : `Estamos a preparar a garantia de pagamento para ${h}.`,
    transport: { COMMERCIAL: "voo regular, sentado", COMMERCIAL_ESCORTED: "voo regular com acompanhamento médico", COMMERCIAL_STRETCHER: "maca em voo regular", AIR_AMBULANCE: "avião-ambulância" },
    transportLine: (m) => `Estamos a organizar o seu regresso a casa: ${m}.`,
    notFitToFly: "Organizaremos o seu regresso assim que o médico confirmar que pode viajar de avião.",
    claimStatus: { SUBMITTED: "foi submetido", PROCESSING: "está em processamento", NEEDS_REVIEW: "está em análise", INFO_REQUESTED: "aguarda documentos", APPROVED: "foi aprovado", ESCALATED: "está com um gestor sénior", REJECTED: "foi recusado", PAID: "foi pago" },
    claimLine: (r, p) => `O seu pedido de reembolso ${r} ${p}.`,
    missingItems: { MEDICAL_REPORT: "o relatório médico", HOSPITAL_INVOICE: "a fatura do hospital", DISCHARGE_SUMMARY: "a nota de alta", POLICY_NUMBER: "o número da apólice", PROOF_OF_PAYMENT: "o comprovativo de pagamento" },
    missing: (l) => `Para o concluir ainda precisamos de: ${l}. Pode simplesmente responder a este e-mail com os documentos.`,
    complete: "Temos todos os documentos necessários; um gestor analisará o pedido em breve.",
    signoff: ["Com os melhores cumprimentos,", `Equipa de assistência, ${DEMO("plataforma de demonstração; todos os dados são fictícios")}`],
  },
};

/** Languages the replies are written in without AI. */
export const REPLY_LANGUAGES = Object.keys(PHRASES);

function spokenDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/** The traveller's reply, in `lang` when the phrasebook has it, else English. */
export function travellerReply(facts: TravellerFacts, lang: string): { text: string; language: string } {
  const language = PHRASES[lang] ? lang : "en";
  const p = PHRASES[language];
  const lines: string[] = [p.greet(facts.name), "", p.received(facts.documents), p.caseLine(facts.caseRef, p.caseStatus[facts.caseStatus])];
  if (facts.appointment) {
    const a = facts.appointment;
    lines.push(p.appointment(spokenDay(a.date, p.locale), a.time, a.doctor, a.facility));
  }
  if (facts.guarantee && facts.guarantee.status !== "REJECTED") {
    const s = facts.guarantee.status === "ACKNOWLEDGED" ? "ACK" : facts.guarantee.status === "SENT" ? "SENT" : "PREP";
    lines.push(p.guarantee(facts.guarantee.hospital, s));
  }
  if (facts.transport) lines.push(facts.transport === "NOT_FIT_TO_FLY" ? p.notFitToFly : p.transportLine(p.transport[facts.transport]));
  if (facts.claim) {
    lines.push(p.claimLine(facts.claim.ref, p.claimStatus[facts.claim.status]));
    if (facts.claim.missing.length) lines.push(p.missing(facts.claim.missing.map((m) => p.missingItems[m]).join("; ")));
    else if (facts.claim.complete && !["APPROVED", "REJECTED", "PAID"].includes(facts.claim.status)) lines.push(p.complete);
  }
  lines.push("", ...p.signoff);
  return { text: lines.join("\n"), language };
}

/** A hospital asking whether its guarantee was issued. */
export interface GuaranteeEnquiryFacts {
  patient: string;
  dateOfBirth: string;
  caseRef: string;
  letter: {
    ref: string;
    status: GuaranteeStatusCode;
    amount: number;
    currency: string;
    excess: number;
    /** YYYY-MM-DD, as printed on the letter. */
    validUntil: string;
    sentVia: "FAX" | "EMAIL" | null;
    sentAt: string | null;
    acknowledgedAt: string | null;
  } | null;
}

const PROVIDER = {
  en: {
    locale: "en-GB",
    greet: "Dear colleagues,",
    about: (f: GuaranteeEnquiryFacts) => `Regarding ${f.patient} (born ${f.dateOfBirth}), case ${f.caseRef}:`,
    letter: (ref: string, amount: string, until: string, excess: string | null) =>
      `Letter of Guarantee ${ref}: ${amount}, valid until ${until}${excess ? `; the patient pays an excess of ${excess}` : ""}.`,
    sent: (via: string, on: string, ack: string | null) => `It was sent by ${via === "EMAIL" ? "e-mail" : "fax"} on ${on}${ack ? `, and your receipt was confirmed on ${ack}` : ""}.`,
    attached: "We attach the letter again.",
    draft: "The Letter of Guarantee is with a case manager for approval; we will send it as soon as it is approved.",
    rejected: "The guarantee could not be approved as requested; a case manager will contact you.",
    none: "We have no Letter of Guarantee for this patient yet. Please send the cost estimate and we will issue one.",
    billing: (ref: string) => `Please invoice us directly, quoting ${ref}. Costs above the guaranteed amount need a top-up first: send an updated cost estimate and we will review it.`,
    signoff: ["Kind regards,", `Medical assistance desk, ${DEMO("demonstration platform; all data is fictional")}`],
  },
  tr: {
    locale: "tr-TR",
    greet: "Sayın ilgili,",
    about: (f: GuaranteeEnquiryFacts) => `${f.patient} (doğum tarihi ${f.dateOfBirth}), ${f.caseRef} numaralı dosya hakkında:`,
    letter: (ref: string, amount: string, until: string, excess: string | null) =>
      `${ref} numaralı ödeme garanti mektubu: ${amount}, ${until} tarihine kadar geçerli${excess ? `; hastanın ödeyeceği muafiyet ${excess}` : ""}.`,
    sent: (via: string, on: string, ack: string | null) => `${on} tarihinde ${via === "EMAIL" ? "e-postayla" : "faksla"} gönderildi${ack ? `; alındığı ${ack} tarihinde teyit edildi` : ""}.`,
    attached: "Mektubu tekrar ekte gönderiyoruz.",
    draft: "Ödeme garanti mektubu onay için vaka yöneticisinde; onaylanır onaylanmaz göndereceğiz.",
    rejected: "Garanti talep edildiği şekilde onaylanamadı; vaka yöneticisi sizinle iletişime geçecek.",
    none: "Bu hasta için henüz bir ödeme garanti mektubu yok. Maliyet tahminini gönderirseniz mektubu düzenleyeceğiz.",
    billing: (ref: string) => `Faturayı ${ref} referansıyla doğrudan bize iletiniz. Garanti tutarını aşan masraflar için önce güncel maliyet tahmini gönderiniz; değerlendirip size dönüş yapacağız.`,
    signoff: ["Saygılarımızla,", `Tıbbi asistans masası, ${DEMO("tanıtım platformu; tüm veriler kurgusaldır")}`],
  },
  es: {
    locale: "es-ES",
    greet: "Estimados colegas:",
    about: (f: GuaranteeEnquiryFacts) => `En relación con ${f.patient} (nacido/a el ${f.dateOfBirth}), expediente ${f.caseRef}:`,
    letter: (ref: string, amount: string, until: string, excess: string | null) =>
      `Garantía de pago ${ref}: ${amount}, válida hasta el ${until}${excess ? `; el paciente abona una franquicia de ${excess}` : ""}.`,
    sent: (via: string, on: string, ack: string | null) => `Se envió por ${via === "EMAIL" ? "correo electrónico" : "fax"} el ${on}${ack ? `, y ustedes confirmaron su recepción el ${ack}` : ""}.`,
    attached: "Adjuntamos de nuevo la carta.",
    draft: "La garantía de pago está pendiente de aprobación por un gestor de casos; la enviaremos en cuanto se apruebe.",
    rejected: "La garantía no pudo aprobarse tal como se solicitó; un gestor de casos se pondrá en contacto con ustedes.",
    none: "Todavía no hay una garantía de pago para este paciente. Envíennos el presupuesto y la emitiremos.",
    billing: (ref: string) => `Por favor, facturen directamente a nosotros indicando ${ref}. Los costes por encima del importe garantizado necesitan antes una ampliación: envíen un presupuesto actualizado y lo revisaremos.`,
    signoff: ["Saludos cordiales,", `Central de asistencia médica, ${DEMO("plataforma de demostración; todos los datos son ficticios")}`],
  },
  fr: {
    locale: "fr-FR",
    greet: "Chers collègues,",
    about: (f: GuaranteeEnquiryFacts) => `Concernant ${f.patient} (né(e) le ${f.dateOfBirth}), dossier ${f.caseRef} :`,
    letter: (ref: string, amount: string, until: string, excess: string | null) =>
      `Garantie de paiement ${ref} : ${amount}, valable jusqu'au ${until}${excess ? ` ; une franchise de ${excess} reste à la charge du patient` : ""}.`,
    sent: (via: string, on: string, ack: string | null) => `Elle a été envoyée par ${via === "EMAIL" ? "e-mail" : "fax"} le ${on}${ack ? `, et vous en avez confirmé la réception le ${ack}` : ""}.`,
    attached: "Vous trouverez la lettre à nouveau en pièce jointe.",
    draft: "La garantie de paiement est en cours de validation par un chargé d'assistance ; nous l'enverrons dès son approbation.",
    rejected: "La garantie n'a pas pu être accordée telle que demandée ; un chargé d'assistance va vous contacter.",
    none: "Nous n'avons pas encore de garantie de paiement pour ce patient. Merci de nous envoyer le devis et nous l'émettrons.",
    billing: (ref: string) => `Merci de nous facturer directement en rappelant ${ref}. Les frais au-delà du montant garanti nécessitent d'abord une extension : envoyez-nous un devis actualisé et nous l'examinerons.`,
    signoff: ["Bien cordialement,", `Plateau d'assistance médicale, ${DEMO("plateforme de démonstration ; toutes les données sont fictives")}`],
  },
  pt: {
    locale: "pt-BR",
    greet: "Prezados colegas,",
    about: (f: GuaranteeEnquiryFacts) => `Referente a ${f.patient} (nascido/a em ${f.dateOfBirth}), processo ${f.caseRef}:`,
    letter: (ref: string, amount: string, until: string, excess: string | null) =>
      `Garantia de pagamento ${ref}: ${amount}, válida até ${until}${excess ? `; o paciente paga uma franquia de ${excess}` : ""}.`,
    sent: (via: string, on: string, ack: string | null) => `Foi enviada por ${via === "EMAIL" ? "e-mail" : "fax"} em ${on}${ack ? `, e o recebimento foi confirmado em ${ack}` : ""}.`,
    attached: "Enviamos a carta novamente em anexo.",
    draft: "A garantia de pagamento está com um gestor de casos para aprovação; enviaremos assim que for aprovada.",
    rejected: "A garantia não pôde ser aprovada como solicitado; um gestor de casos entrará em contato.",
    none: "Ainda não há garantia de pagamento para este paciente. Envie o orçamento e nós a emitiremos.",
    billing: (ref: string) => `Por favor, faturem diretamente para nós indicando ${ref}. Custos acima do valor garantido precisam antes de uma complementação: enviem um orçamento atualizado e nós o analisaremos.`,
    signoff: ["Atenciosamente,", `Central de assistência médica, ${DEMO("plataforma de demonstração; todos os dados são fictícios")}`],
  },
  de: {
    locale: "de-DE",
    greet: "Sehr geehrte Kolleginnen und Kollegen,",
    about: (f: GuaranteeEnquiryFacts) => `zu ${f.patient} (geboren am ${f.dateOfBirth}), Fall ${f.caseRef}:`,
    letter: (ref: string, amount: string, until: string, excess: string | null) =>
      `Kostenübernahmeerklärung ${ref}: ${amount}, gültig bis ${until}${excess ? `; der Patient trägt eine Selbstbeteiligung von ${excess}` : ""}.`,
    sent: (via: string, on: string, ack: string | null) => `Sie wurde am ${on} per ${via === "EMAIL" ? "E-Mail" : "Fax"} versandt${ack ? `, und Sie haben den Eingang am ${ack} bestätigt` : ""}.`,
    attached: "Wir senden Ihnen das Schreiben erneut im Anhang.",
    draft: "Die Kostenübernahme liegt einer Fallmanagerin zur Freigabe vor; wir senden sie, sobald sie freigegeben ist.",
    rejected: "Die Kostenübernahme konnte nicht wie angefragt erteilt werden; eine Fallmanagerin meldet sich bei Ihnen.",
    none: "Für diesen Patienten liegt noch keine Kostenübernahme vor. Bitte senden Sie uns den Kostenvoranschlag, dann stellen wir sie aus.",
    billing: (ref: string) => `Bitte rechnen Sie direkt mit uns ab und geben Sie ${ref} an. Kosten über dem garantierten Betrag brauchen zuerst eine Erhöhung: Senden Sie uns einen aktualisierten Kostenvoranschlag.`,
    signoff: ["Mit freundlichen Grüßen", `Medizinische Assistance, ${DEMO("Demonstrationsplattform; alle Daten sind fiktiv")}`],
  },
};

/** Languages a hospital's guarantee enquiry is answered in; anything else gets English. */
export const PROVIDER_REPLY_LANGUAGES = Object.keys(PROVIDER);

const day = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(iso));
/** A calendar date (YYYY-MM-DD), as the letter prints it. */
const date = (ymd: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ymd.slice(0, 10)}T12:00:00Z`));

/** The reply to a hospital's guarantee enquiry, in the language it wrote in (English when we don't have it). */
export function guaranteeEnquiryReply(f: GuaranteeEnquiryFacts, lang: string): { text: string; attachLetter: boolean } {
  const p = PROVIDER[lang as keyof typeof PROVIDER] ?? PROVIDER.en;
  const lines: string[] = [p.greet, "", p.about(f)];
  let attachLetter = false;
  const l = f.letter;
  if (!l) lines.push(p.none);
  else if (l.status === "DRAFT" || l.status === "APPROVED") lines.push(p.draft);
  else if (l.status === "REJECTED") lines.push(p.rejected);
  else {
    const money = (n: number) => new Intl.NumberFormat(p.locale, { style: "currency", currency: l.currency }).format(n);
    lines.push(p.letter(l.ref, money(l.amount), date(l.validUntil, p.locale), l.excess > 0 ? money(l.excess) : null));
    if (l.sentAt) lines.push(p.sent(l.sentVia ?? "FAX", day(l.sentAt, p.locale), l.acknowledgedAt ? day(l.acknowledgedAt, p.locale) : null));
    lines.push(p.attached, p.billing(l.ref));
    attachLetter = true;
  }
  lines.push("", ...p.signoff);
  return { text: lines.join("\n"), attachLetter };
}
