import { BRAND } from "@/lib/brand";

// Fictional assistance requests for case intake, written the way they reach a
// desk: a call note, a WhatsApp export, e-mails and an auto transcript. The
// offline analyser reads names from "my name is / his name is", places from
// Istanbul districts and urgency from symptoms, so the wording keeps those
// plain. Written to public/samples/intake/ by `npm run demo:samples`.

export interface IntakeRequest {
  file: string;
  text: string;
}

export const INTAKE_REQUESTS: IntakeRequest[] = [
  {
    file: "call-note-taksim-stomach-pain.txt",
    text: `Assistance hotline · call note
Taken: 16 October 2026, 08:12 Istanbul time
Caller: Anna Novak, wife of the insured
Callback: +420 600 000 147

My husband is travelling in Istanbul and has developed severe stomach pain since last night. He has vomited twice this morning and cannot keep water down. We are staying at a hotel near Taksim. We need help finding a hospital where the staff speak English.

Policy number not to hand; the caller will send it by e-mail.
`,
  },
  {
    file: "whatsapp-kadikoy-child-fever.txt",
    text: `[16/10/2026, 07:41:12] Emma Van Dijk: Hello, is this the travel insurance assistance line?
[16/10/2026, 07:41:40] ${BRAND.name} Assistance: Good morning, yes it is. How can we help?
[16/10/2026, 07:42:55] Emma Van Dijk: My name is Emma Van Dijk, policy POL-TR-100949. My son is 6 and has had a high fever and a cough since last night. 39.4 this morning.
[16/10/2026, 07:43:30] Emma Van Dijk: We are in an apartment in Kadikoy. We need a doctor today, preferably one who speaks English or Dutch.
[16/10/2026, 07:43:52] ${BRAND.name} Assistance: Thank you, Emma. We are looking for a paediatric clinic close to you now.
`,
  },
  {
    file: "email-hotel-sultanahmet-toothache.txt",
    text: `From: Front Office <frontoffice@sultanahmet-hotel-demo.example>
To: assistance@demo-assistance.example
Date: Fri, 16 Oct 2026 10:05:00 +0300
Subject: Guest needs a dentist today

Dear assistance team,

Our guest in room 214 has had a severe toothache and a swollen cheek since yesterday evening, and asked us to contact his travel insurance. His name is Marco Bianchi and his policy number is POL-TR-100948.

He would like an appointment with a dentist near the hotel in Sultanahmet today, ideally in the afternoon. He speaks Italian and some English.

Kind regards,
Front Office
Sultanahmet Demo Hotel
`,
  },
  {
    file: "email-tour-operator-case-1013.txt",
    text: `From: Duty Desk <duty@bosphorus-tours-demo.example>
To: assistance@demo-assistance.example
Date: Fri, 16 Oct 2026 09:20:00 +0300
Subject: Re: CASE-1013 - dizziness again

Hello,

Following up on CASE-1013. Our tour guide reports that the guest is dizzy again this morning and had a headache overnight. His name is Oliver Bennett, born 5 December 1956. He is resting at the group hotel in Besiktas.

The group flies home on Sunday. Could your doctor advise whether he is fit to travel, and arrange a check-up before then?

Best regards,
Duty Desk
Bosphorus Demo Tours
`,
  },
  {
    file: "call-transcript-sisli-chest-pain.txt",
    text: `Assistance hotline · automatic transcript
16 October 2026, 22:17 Istanbul time · 3 min 05 s

Agent: ${BRAND.name} assistance, good evening. How can we help?
Caller: Hello, my father needs help. His name is Thomas Weber, he is 71. We are at our hotel in Sisli. He has strong chest pain and says he cannot breathe properly. It started twenty minutes ago.
Agent: Is he awake and talking to you?
Caller: Yes, but he is very pale and sweating. He takes tablets for his heart.
Agent: Please call 112 now. We will also arrange an ambulance to the hotel and tell the nearest cardiology unit that he is coming. Stay with him and keep him sitting up.
Caller: Okay. Our room is 508.
`,
  },
];
