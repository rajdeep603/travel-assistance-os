import { BRAND } from "@/lib/brand";

// Fictional assistance requests for case intake, written the way they reach a
// desk: a call note, a WhatsApp export, e-mails and an auto transcript. The
// offline analyser reads names from "my name is / his name is", places from
// Istanbul districts (or a few Asia-Pacific cities) and urgency from symptoms,
// so the wording keeps those plain. Written to public/samples/intake/ by
// `npm run demo:samples`.

/** The one-line request behind "Use sample request" on the Cases page. */
export const QUICK_SAMPLE_REQUEST =
  "My husband is travelling in Istanbul and has developed severe stomach pain. We are staying near Taksim. We need help finding a hospital.";

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
  {
    file: "email-family-shanghai-stroke.txt",
    text: `From: Grace Tan <grace.tan@example.com>
To: assistance@demo-assistance.example
Date: Mon, 19 Oct 2026 08:40:00 +0800
Subject: Urgent: husband in hospital in Shanghai, needs to come home

Dear assistance team,

His name is Daniel Tan, born 3 March 1964, and his policy number is POL-SG-200101. My husband had a stroke during a business trip to Shanghai on 14 October. The hospital says it is a haemorrhage in the brain and he is in the neurology high-dependency unit at Pudong Demo Medical Center.

He is stable now, with weakness in his right arm and leg, and the neurologist says he can travel soon. We would like him repatriated to Singapore for rehabilitation. Please tell us whether he can fly home on a stretcher or needs an air ambulance.

Thank you,
Grace Tan
+65 0000 0953
`,
  },
  {
    file: "whatsapp-hurghada-resort-diver.txt",
    text: `[23/10/2026, 21:14:05] Resort Guest Relations: Good evening from the guest relations desk of a hotel in Hurghada.
[23/10/2026, 21:14:40] Resort Guest Relations: His name is Jonas Weber, policy POL-EG-300188. He came back from a dive with severe chest pain and difficulty breathing.
[23/10/2026, 21:15:02] Resort Guest Relations: The hotel doctor says he needs a hospital now. Which hospital will accept your guarantee? They are asking for a cash deposit.
`,
  },
  {
    file: "email-punta-cana-resort-child-ear.txt",
    text: `From: Front Desk <frontdesk@resort-bavaro.example>
To: assistance@demo-assistance.example
Date: Wed, 21 Oct 2026 19:22:00 -0400
Subject: Guest needs a doctor — child with ear pain

Hello,

Our guest's name is Olivia Grant, policy POL-DO-500144, staying with her family in Punta Cana. Her daughter, 7, has had ear pain and a fever since this afternoon. They would like a doctor who speaks English, tonight or early tomorrow.

Front Desk
`,
  },
];
