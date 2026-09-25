import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// End-to-end tests: exercise the running application over HTTP, covering the
// four spec workflows. Set E2E_BASE_URL to point at another deployment.
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

async function postJSON(pathname: string, body?: unknown) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

beforeAll(async () => {
  const res = await fetch(`${BASE}/api/health`).catch(() => null);
  if (!res || !res.ok) {
    throw new Error(
      `The application is not reachable at ${BASE}. Start it (npm run dev / docker compose up) before running e2e tests.`
    );
  }
});

describe("Health", () => {
  it("reports ok with database connectivity", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
  });
});

describe("Workflow: Medical Document — upload → process → extract → display", () => {
  it("processes a sample document end to end", async () => {
    const { status, body } = await postJSON("/api/documents/sample", {
      file: "medical-report-aylin-yilmaz.pdf",
    });
    expect(status).toBe(201);
    const doc = body.document;
    expect(doc.status).toBe("PROCESSED");
    expect(doc.kind).toBe("MEDICAL_REPORT");
    expect(doc.extraction.patientName).toBe("Aylin Yilmaz");
    expect(doc.extraction.summary.length).toBeGreaterThan(20);

    // Display: fetch it back the way the UI does.
    const fetched = await fetch(`${BASE}/api/documents/${doc.id}`);
    expect(fetched.status).toBe(200);
    const detail = (await fetched.json()).document;
    expect(detail.extraction.diagnosis).toContain("gastroenteritis");
  });

  it("processes a real multipart upload", async () => {
    const pdfPath = path.join(process.cwd(), "public", "demo-documents", "hospital-invoice-james-carter.pdf");
    const form = new FormData();
    form.append(
      "file",
      new File([fs.readFileSync(pdfPath)], "e2e-invoice.pdf", { type: "application/pdf" })
    );
    const res = await fetch(`${BASE}/api/documents`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const doc = (await res.json()).document;
    expect(doc.status).toBe("PROCESSED");
    expect(doc.kind).toBe("HOSPITAL_INVOICE");
    expect(Number(doc.extraction.invoiceAmount)).toBe(800);
  });

  it("rejects unsupported uploads with a clean message", async () => {
    const form = new FormData();
    form.append("file", new File(["not a pdf"], "evil.js", { type: "text/javascript" }));
    const res = await fetch(`${BASE}/api/documents`, { method: "POST", body: form });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/only pdf/i);
  });
});

describe("Workflow: Case Manager — request → AI analysis → create case → visible", () => {
  it("analyses and creates a case", async () => {
    const text =
      "My husband is travelling in Istanbul and has developed severe stomach pain. We are staying near Taksim. We need help finding a hospital.";
    const analyzed = await postJSON("/api/cases/analyze", { text });
    expect(analyzed.status).toBe(200);
    expect(analyzed.body.analysis.urgency).toBe("HIGH");

    const { existingCase: _drop, ...analysis } = analyzed.body.analysis;
    const createRes = await postJSON("/api/cases", { requestText: text, analysis });
    expect(createRes.status).toBe(201);
    const ref = createRes.body.case.ref;
    expect(ref).toMatch(/^CASE-\d+$/);

    const visible = await fetch(`${BASE}/api/cases/${ref}`);
    expect(visible.status).toBe(200);
    expect((await visible.json()).case.ref).toBe(ref);
  });

  it("rejects empty input", async () => {
    const res = await postJSON("/api/cases/analyze", { text: "  " });
    expect(res.status).toBe(400);
  });
});

describe("Workflow: Voice — request → search → select → confirm → appointment → case", () => {
  it("books an appointment end to end", async () => {
    const started = await postJSON("/api/voice/start");
    expect(started.status).toBe(201);
    const conversationId = started.body.conversationId;

    const date = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 21);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    const say = (utterance: string) =>
      postJSON("/api/voice/message", { conversationId, utterance });

    await say(`Hi, I'm near Taksim with a bad fever and need a doctor on ${date} in the afternoon.`);
    await say("My name is End ToEnd");
    await say("English");
    let turn = await say("my number is +44 7700 900777");
    expect(turn.body.state.step).toBe("PRESENTING");
    expect(turn.body.options.length).toBeGreaterThan(0);

    turn = await say("option 1");
    expect(turn.body.state.step).toBe("CONFIRMING");

    turn = await say("yes please");
    expect(turn.body.state.step).toBe("BOOKED");
    expect(turn.body.appointment.status).toBe("CONFIRMED");
    expect(turn.body.case.ref).toMatch(/^CASE-/);

    const kase = await fetch(`${BASE}/api/cases/${turn.body.case.ref}`);
    const detail = (await kase.json()).case;
    expect(detail.appointments).toHaveLength(1);
    expect(detail.assignedTo).toMatch(/human case manager/i);
  });
});

describe("Workflow: Claims — upload → process → validation → review", () => {
  it("creates a claim from documents and applies a review action", async () => {
    const patientsRes = await fetch(`${BASE}/api/patients`);
    const patient = (await patientsRes.json()).patients[0];

    const form = new FormData();
    form.append("patientId", patient.id);
    for (const f of [
      "medical-report-aylin-yilmaz.pdf",
      "hospital-invoice-aylin-yilmaz.pdf",
      "discharge-summary-aylin-yilmaz.pdf",
    ]) {
      const filePath = path.join(process.cwd(), "public", "demo-documents", f);
      form.append("files", new File([fs.readFileSync(filePath)], f, { type: "application/pdf" }));
    }
    const res = await fetch(`${BASE}/api/claims/upload`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const claim = (await res.json()).claim;
    expect(claim.status).toBe("NEEDS_REVIEW");
    expect(claim.documents).toHaveLength(3);
    const issues = claim.issues as { severity: string; message: string }[];
    expect(issues.some((i) => /medical report available/i.test(i.message))).toBe(true);

    const action = await postJSON(`/api/claims/${claim.id}/action`, {
      action: "APPROVE",
      note: "e2e test approval",
    });
    expect(action.status).toBe(200);
    expect(action.body.claim.status).toBe("APPROVED");
  });
});

describe("Provider search API", () => {
  it("returns scored providers with reasons", async () => {
    const res = await postJSON("/api/providers/search", {
      city: "Istanbul",
      district: "Taksim",
      specialty: "General Medicine",
      timeOfDay: "afternoon",
      language: "English",
    });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].reasons.length).toBeGreaterThan(0);
  });

  it("validates bad dates", async () => {
    const res = await postJSON("/api/providers/search", { date: "not-a-date" });
    expect(res.status).toBe(400);
  });
});

describe("Internal assistant API", () => {
  it("answers with sources", async () => {
    const res = await postJSON("/api/assistant/ask", {
      question: "What documents are required for a hospitalization case?",
    });
    expect(res.status).toBe(200);
    expect(res.body.answer).toMatch(/medical report/i);
    expect(res.body.sources.length).toBeGreaterThan(0);
  });
});
