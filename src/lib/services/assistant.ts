import { prisma } from "@/lib/db";
import { getAIService } from "./ai";
import { findCity } from "./nlu";
import type { AssistantAnswer, ContextChunk } from "./types";

// ---------------------------------------------------------------------------
// Internal AI Assistant: lightweight RAG over the seeded operational
// knowledge base (TF-IDF retrieval — a simple in-process vector store),
// plus live database lookups for case / provider questions.
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9-]{2,}/g) ?? [];
}

interface IndexedDoc {
  title: string;
  slug: string;
  vector: Map<string, number>;
  norm: number;
  content: string;
}

function buildVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const vec = new Map<string, number>();
  for (const [term, count] of tf) {
    vec.set(term, (count / tokens.length) * (idf.get(term) ?? 1));
  }
  return vec;
}

function cosine(a: Map<string, number>, aNorm: number, b: Map<string, number>, bNorm: number): number {
  if (aNorm === 0 || bNorm === 0) return 0;
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, w] of small) {
    const w2 = large.get(term);
    if (w2) dot += w * w2;
  }
  return dot / (aNorm * bNorm);
}

const vecNorm = (v: Map<string, number>) =>
  Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));

/** Retrieve the most relevant knowledge documents for a question. */
export async function retrieveContext(question: string, k = 3): Promise<ContextChunk[]> {
  const docs = await prisma.knowledgeDocument.findMany();
  if (docs.length === 0) return [];

  const docTokens = docs.map((d) => tokenize(`${d.title} ${d.content}`));
  const idf = new Map<string, number>();
  const allTerms = new Set(docTokens.flat());
  for (const term of allTerms) {
    const df = docTokens.filter((toks) => toks.includes(term)).length;
    idf.set(term, Math.log(1 + docs.length / df));
  }

  const index: IndexedDoc[] = docs.map((d, i) => {
    const vector = buildVector(docTokens[i], idf);
    return { title: d.title, slug: d.slug, vector, norm: vecNorm(vector), content: d.content };
  });

  const qVec = buildVector(tokenize(question), idf);
  const qNorm = vecNorm(qVec);

  return index
    .map((doc) => ({
      title: doc.title,
      source: `knowledge-base/${doc.slug}`,
      content: doc.content,
      score: cosine(qVec, qNorm, doc.vector, doc.norm),
    }))
    .filter((c) => c.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function askAssistant(question: string): Promise<AssistantAnswer> {
  // Structured intent 1: case status lookup (e.g. "status of CASE-1024").
  const caseRef = question.match(/\bCASE-\d+\b/i)?.[0]?.toUpperCase();
  if (caseRef) {
    const c = await prisma.case.findUnique({
      where: { ref: caseRef },
      include: { patient: true, appointments: { include: { provider: true } } },
    });
    if (!c) {
      return {
        answer: `I could not find ${caseRef} in the case database. Please check the reference.`,
        sources: [{ title: "Case database", source: "db/cases" }],
      };
    }
    const apt = c.appointments[0];
    return {
      answer:
        `${c.ref} — ${c.title}. Status: ${c.status.replace(/_/g, " ")}, priority ${c.priority}. ` +
        `Patient: ${c.patient.firstName} ${c.patient.lastName}, location: ${c.location}. ` +
        (c.assignedTo ? `Assigned to ${c.assignedTo}. ` : `Not yet assigned. `) +
        (apt
          ? `Next appointment: ${apt.ref} with ${apt.provider.name} on ${apt.scheduledAt.toISOString().slice(0, 16).replace("T", " at ")}.`
          : `No appointment booked yet.`) +
        (c.aiSummary ? ` Summary: ${c.aiSummary}` : ""),
      sources: [{ title: `Case ${c.ref}`, source: "db/cases" }],
    };
  }

  // Structured intent 2: provider availability by city.
  if (/\bproviders?\b|\bdoctors?\b|\bclinics?\b|\bhospitals?\b/i.test(question) && /\bavailable\b|\bin\b/i.test(question)) {
    const city = findCity(question);
    if (city) {
      const providers = await prisma.provider.findMany({
        where: { city: { equals: city, mode: "insensitive" } },
        take: 8,
      });
      if (providers.length > 0) {
        const lines = providers.map(
          (p) => `• ${p.name} — ${p.specialty}, ${p.facility} (${p.district}); languages: ${p.languages.join(", ")}`
        );
        return {
          answer: `We currently have ${providers.length} demo providers in ${city}:\n${lines.join("\n")}`,
          sources: [{ title: "Provider network database", source: "db/providers" }],
        };
      }
      return {
        answer: `No providers found in ${city} in the demo network.`,
        sources: [{ title: "Provider network database", source: "db/providers" }],
      };
    }
  }

  // Otherwise: RAG over the knowledge base.
  const context = await retrieveContext(question);
  const answer = await getAIService().answerWithContext(question, context);
  return {
    answer,
    sources: context.map((c) => ({ title: c.title, source: c.source })),
  };
}
