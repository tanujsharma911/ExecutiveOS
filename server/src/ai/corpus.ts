import { prisma } from "../db.js";
import { detectThemes } from "./lexicon.js";

export interface AnswerSnapshot {
  questionId: string;
  label: string;
  type: string;
  metricKey: string | null;
  value: unknown;
}

export interface Snippet {
  submissionId: string;
  date: string;
  formTitle: string;
  frequency: string;
  question: string;
  text: string;
  themes: string[];
}

export interface MetricPoint {
  submissionId: string;
  date: string;
  frequency: string;
  confidence?: number;
  team?: number;
  energy?: number;
  stress?: number;
  goalProgress?: number;
  emotion?: string;
}

export interface Corpus {
  clientId: string;
  clientName: string;
  firstName: string;
  submissions: {
    id: string;
    date: string;
    formTitle: string;
    frequency: string;
  }[];
  snippets: Snippet[];
  metrics: MetricPoint[];
  commitments: Awaited<ReturnType<typeof loadCommitments>>;
  lastWeeklyAt: string | null;
  now: string;
}

function loadCommitments(clientId: string) {
  return prisma.commitment.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: { updates: { orderBy: { createdAt: "asc" } } },
  });
}

const cache = new Map<string, { at: number; corpus: Corpus }>();

export function invalidateCorpus(clientId: string) {
  cache.delete(clientId);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"“'])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Builds a client-specific corpus from profile, submission, and commitment data.
 *
 * @param clientId The ID of the client whose corpus should be retrieved.
 * @returns The client-specific corpus, using the cached value when it is still fresh.
 */
export async function getCorpus(clientId: string): Promise<Corpus> {
  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < 10_000) return hit.corpus;

  const client = await prisma.clientProfile.findUniqueOrThrow({
    where: { id: clientId },
    include: { user: true },
  });
  const subs = await prisma.submission.findMany({
    where: { clientId, status: "SUBMITTED" },
    include: { form: { select: { title: true, frequency: true } } },
    orderBy: { submittedAt: "asc" },
  });

  const snippets: Snippet[] = [];
  const metrics: MetricPoint[] = [];
  for (const s of subs) {
    const date = (s.submittedAt ?? s.periodStart).toISOString();
    const answers = (s.answers as unknown as AnswerSnapshot[]) ?? [];
    const point: MetricPoint = {
      submissionId: s.id,
      date,
      frequency: s.form.frequency,
    };
    for (const a of answers) {
      if (a.value === null || a.value === undefined || a.value === "") continue;
      if (
        a.metricKey &&
        a.metricKey !== "emotion" &&
        typeof a.value === "number"
      ) {
        (point as unknown as Record<string, unknown>)[a.metricKey] = a.value;
      }
      if (a.metricKey === "emotion" && typeof a.value === "string")
        point.emotion = a.value;
      if (
        (a.type === "LONG_TEXT" || a.type === "SHORT_TEXT") &&
        typeof a.value === "string"
      ) {
        for (const sentence of splitSentences(a.value)) {
          snippets.push({
            submissionId: s.id,
            date,
            formTitle: s.form.title,
            frequency: s.form.frequency,
            question: a.label,
            text: sentence,
            themes: detectThemes(sentence),
          });
        }
      }
    }
    metrics.push(point);
  }

  const weekly = subs.filter((s) => s.form.frequency === "WEEKLY");
  const corpus: Corpus = {
    clientId,
    clientName: client.user.name,
    firstName: client.user.name.split(" ")[0],
    submissions: subs.map((s) => ({
      id: s.id,
      date: (s.submittedAt ?? s.periodStart).toISOString(),
      formTitle: s.form.title,
      frequency: s.form.frequency,
    })),
    snippets,
    metrics,
    commitments: await loadCommitments(clientId),
    lastWeeklyAt: weekly.length
      ? (
          weekly[weekly.length - 1].submittedAt ??
          weekly[weekly.length - 1].periodStart
        ).toISOString()
      : null,
    now: new Date().toISOString(),
  };
  cache.set(clientId, { at: Date.now(), corpus });
  return corpus;
}
