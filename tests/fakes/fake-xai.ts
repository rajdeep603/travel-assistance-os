import { WebSocketServer, type WebSocket } from "ws";

// ---------------------------------------------------------------------------
// A scriptable stand-in for the Grok Voice realtime endpoint. Tests await
// client events (session.update, function_call_output, …) and push server
// events, so a whole voice session can run without the network.
// ---------------------------------------------------------------------------

export interface FakeConnection {
  received: Record<string, any>[];
  headers: Record<string, string | string[] | undefined>;
  url: string;
  send(event: Record<string, unknown>): void;
  /** Resolves with the first (or next unseen) client event matching. */
  waitFor(match: (e: Record<string, any>) => boolean, timeoutMs?: number): Promise<Record<string, any>>;
  /** Server side of one assistant turn that only calls a function. */
  callFunction(name: string, args: Record<string, unknown>, callId?: string): void;
  /** One assistant turn calling several functions in parallel. */
  callFunctions(calls: { name: string; args: Record<string, unknown> }[]): void;
  /** Server side of one spoken assistant turn. */
  say(text: string): void;
  /** Drops the connection, as the real service might mid-call. */
  close(): void;
}

export async function startFakeXai(): Promise<{
  url: string;
  nextConnection(): Promise<FakeConnection>;
  close(): Promise<void>;
}> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => wss.once("listening", () => resolve()));
  const port = (wss.address() as { port: number }).port;
  const waiting: ((c: FakeConnection) => void)[] = [];
  const queued: FakeConnection[] = [];
  let n = 0;

  wss.on("connection", (ws: WebSocket, req) => {
    const received: Record<string, any>[] = [];
    const listeners: (() => void)[] = [];
    let consumed = 0;
    ws.on("message", (raw) => {
      received.push(JSON.parse(raw.toString()));
      for (const l of [...listeners]) l();
    });
    const send = (event: Record<string, unknown>) => ws.send(JSON.stringify(event));

    const conn: FakeConnection = {
      received,
      headers: req.headers,
      url: req.url ?? "",
      send,
      waitFor(match, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
          const check = () => {
            for (let i = consumed; i < received.length; i++) {
              if (match(received[i])) {
                consumed = i + 1;
                listeners.splice(listeners.indexOf(check), 1);
                clearTimeout(timer);
                resolve(received[i]);
                return;
              }
            }
          };
          const timer = setTimeout(() => {
            listeners.splice(listeners.indexOf(check), 1);
            reject(new Error(`fake-xai: timed out waiting; got ${received.map((e) => e.type).join(", ")}`));
          }, timeoutMs);
          listeners.push(check);
          check();
        });
      },
      callFunction(name, args, callId = `call_${++n}`) {
        send({ type: "response.created", response: { id: `resp_${n}` } });
        send({
          type: "response.function_call_arguments.done",
          call_id: callId,
          name,
          arguments: JSON.stringify(args),
        });
        send({ type: "response.done" });
      },
      callFunctions(calls) {
        send({ type: "response.created", response: { id: `resp_${++n}` } });
        for (const { name, args } of calls) {
          send({
            type: "response.function_call_arguments.done",
            call_id: `call_${++n}`,
            name,
            arguments: JSON.stringify(args),
          });
        }
        send({ type: "response.done" });
      },
      say(text) {
        send({ type: "response.created", response: { id: `resp_${++n}` } });
        send({ type: "response.output_audio.delta", delta: Buffer.from(`audio:${text}`).toString("base64") });
        send({ type: "response.output_audio_transcript.done", transcript: text });
        send({ type: "response.done" });
      },
      close() {
        ws.close();
      },
    };

    send({ type: "conversation.created", conversation: { id: `conv_${++n}` } });
    const w = waiting.shift();
    if (w) w(conn);
    else queued.push(conn);
  });

  return {
    url: `ws://127.0.0.1:${port}`,
    nextConnection() {
      const q = queued.shift();
      if (q) return Promise.resolve(q);
      return new Promise((resolve) => waiting.push(resolve));
    },
    close: () =>
      new Promise((resolve) => {
        for (const c of wss.clients) c.terminate();
        wss.close(() => resolve());
      }),
  };
}
