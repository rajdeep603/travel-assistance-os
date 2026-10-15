import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// End-to-end tests: exercise the running application over HTTP, covering the
// four spec workflows. Set E2E_BASE_URL to point at another deployment, and
// E2E_OPERATOR / E2E_PASSWORD when it has operator sign-in enabled.
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
let session = "";

/** fetch with the operator session cookie, when signed in. */
function fetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (session) headers.set("Cookie", session);
  return globalThis.fetch(url, { ...init, headers });
}

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
  const name = process.env.E2E_OPERATOR;
  const password = process.env.E2E_PASSWORD;
  if (name && password) {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (login.status !== 200) throw new Error(`Sign-in as ${name} failed (${login.status}).`);
    session = login.headers.get("set-cookie")?.split(";")[0] ?? "";
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

describe("Workflow: Voice — session start", () => {
  // The live conversation (Grok Voice) is covered by tests/integration/voice-gateway.test.ts
  // against a scripted model; here we check the app hands out a gateway ticket.
  it("starts a voice session or explains that voice isn't configured", async () => {
    const res = await postJSON("/api/voice/session", {});
    if (res.status === 503) {
      expect(res.body.error.code).toBe("VOICE_NOT_CONFIGURED");
      return;
    }
    expect(res.status).toBe(201);
    expect(res.body.call.ref).toMatch(/^CALL-\d+$/);
    expect(res.body.url).toMatch(/\/ws\/voice\?ticket=/);
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
