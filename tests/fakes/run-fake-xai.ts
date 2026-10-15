import { WebSocketServer } from "ws";

// ---------------------------------------------------------------------------
// Manual-testing harness (not part of the product): a scripted stand-in for
// the Grok Voice endpoint so the browser voice page and Call Center can be
// exercised end to end without an xAI key. Greets with a real PCM tone,
// searches when the caller mentions a doctor, books when they pick an option.
//
//   npx tsx tests/fakes/run-fake-xai.ts 8099
//   XAI_REALTIME_URL=ws://localhost:8099 XAI_API_KEY=fake npm run dev:gateway
// ---------------------------------------------------------------------------

const port = Number(process.argv[2] ?? 8099);
const wss = new WebSocketServer({ port });
let n = 0;

function tone(seconds: number, rate = 24000): string {
  const samples = new Int16Array(Math.round(seconds * rate));
  for (let i = 0; i < samples.length; i++) {
    const fade = Math.min(1, i / 2400, (samples.length - i) / 2400);
    samples[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 6000 * fade);
  }
  return Buffer.from(samples.buffer).toString("base64");
}

wss.on("connection", (ws) => {
  const send = (e: Record<string, unknown>) => ws.send(JSON.stringify(e));
  let pcm = true;
  let lastOptions: { provider_id: string; slots: string[] }[] = [];
  let lastDate = "";

  const say = (text: string) => {
    send({ type: "response.created", response: { id: `r${++n}` } });
    if (pcm) send({ type: "response.output_audio.delta", delta: tone(0.8) });
    for (const word of text.split(" ")) send({ type: "response.output_audio_transcript.delta", delta: `${word} ` });
    send({ type: "response.output_audio_transcript.done", transcript: text });
    send({ type: "response.done" });
  };
  const call = (name: string, args: Record<string, unknown>) => {
    send({ type: "response.created", response: { id: `r${++n}` } });
    send({ type: "response.function_call_arguments.done", call_id: `c${++n}`, name, arguments: JSON.stringify(args) });
    send({ type: "response.done" });
  };

  send({ type: "conversation.created", conversation: { id: `conv${++n}` } });
  ws.on("message", (raw) => {
    const e = JSON.parse(raw.toString());
    if (e.type === "session.update") {
      pcm = e.session?.audio?.output?.format?.type === "audio/pcm";
      send({ type: "session.updated" });
      return;
    }
    if (e.type === "conversation.item.create" && e.item?.type === "message") {
      const text: string = e.item.content?.[0]?.text ?? "";
      if (text.includes("call has connected")) {
        say("Hello, this is Ada, an AI assistant on a demonstration line. Please don't share real medical details. How can I help?");
      } else if (/option|first|yes/i.test(text) && lastOptions.length) {
        call("book_appointment", {
          provider_id: lastOptions[0].provider_id,
          date: lastDate,
          time: lastOptions[0].slots[0],
          patient_name: "Browser Test Traveller",
          contact: "+44 7700 900555",
          reason: "fever",
          caller_confirmed: true,
        });
      } else if (/doctor|fever|pain|appointment/i.test(text)) {
        call("search_providers", { location: "Taksim", specialty: "General Medicine", date: "tomorrow", time_of_day: "afternoon", language: "English" });
      } else {
        say("Could you tell me where you are and what the problem is?");
      }
      return;
    }
    if (e.type === "conversation.item.create" && e.item?.type === "function_call_output") {
      const out = JSON.parse(e.item.output);
      if (out.options) {
        lastOptions = out.options;
        lastDate = out.date;
        say(
          out.options.length
            ? `I found ${out.options.length} options. The first is ${out.options[0].doctor} at ${out.options[0].facility}, ${out.date_spoken} at ${out.options[0].slots[0]}. Shall I book it?`
            : "Nothing is free then. Shall I try another day?"
        );
      } else if (out.booked) {
        say(`You're booked: appointment ${out.appointment_ref}, case ${out.case_ref}. A human case manager now has the summary. Goodbye!`);
      } else if (out.error) {
        say(`Sorry: ${out.error}`);
      }
    }
  });
});

console.log(`[fake-xai] listening on ws://localhost:${port}`);
