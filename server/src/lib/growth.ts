/** Growth journey and streaks — all derived from real client actions. */
import { prisma } from "../db.js";
import { buildSeries } from "../ai/analyzers.js";
import { getCorpus } from "../ai/corpus.js";
import { runAnalysis } from "../ai/intelligence.js";
import { RESOLUTION } from "../ai/lexicon.js";
import { addDays, startOfDay, startOfWeek } from "./periods.js";

export interface TimelineEvent {
  date: string;
  kind: "breakthrough" | "challenge" | "session" | "goal" | "pattern";
  title: string;
  detail?: string;
}

export async function weeklyStreak(clientId: string, now = new Date()) {
  const subs = await prisma.submission.findMany({
    where: { clientId, status: "SUBMITTED", form: { frequency: "WEEKLY" } },
    select: { periodStart: true },
  });
  const weeks = new Set(subs.map((s) => startOfWeek(s.periodStart).getTime()));
  let cursor = startOfWeek(now);
  if (!weeks.has(cursor.getTime())) cursor = addDays(cursor, -7); // current week still open
  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  // best streak
  const sorted = [...weeks].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] - sorted[i - 1] === 7 * 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current: streak, best, total: weeks.size };
}

/**
 * Daily reflection streak with one day of grace.
 * - Today never breaks the streak: it's still open.
 * - A single missed day is forgiven; two missed days in a row reset the streak.
 * - The count is the number of days actually reflected (grace days aren't counted).
 */
export async function dailyStreak(clientId: string, now = new Date()) {
  const subs = await prisma.submission.findMany({
    where: { clientId, status: "SUBMITTED", form: { frequency: "DAILY" } },
    select: { periodStart: true },
  });
  const days = new Set(subs.map((s) => startOfDay(s.periodStart).getTime()));
  const today = startOfDay(now);
  const has = (d: Date) => days.has(d.getTime());

  // Current streak: walk back from yesterday (today is pending), allowing single-day gaps.
  let current = has(today) ? 1 : 0;
  let cursor = addDays(today, -1);
  let misses = 0;
  const earliest = Math.min(...[...days], today.getTime());
  while (cursor.getTime() >= earliest) {
    if (has(cursor)) {
      current++;
      misses = 0;
    } else if (++misses > 1) break;
    cursor = addDays(cursor, -1);
  }

  // Best streak ever, same rule.
  const sorted = [...days].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    const gapDays =
      i === 0 ? 0 : Math.round((sorted[i] - sorted[i - 1]) / 86_400_000);
    run = i > 0 && gapDays <= 2 ? run + 1 : 1;
    best = Math.max(best, run);
  }

  // Grace in use: yesterday was missed but the streak is still alive — reflect today to keep it.
  const graceUsed = current > 0 && !has(today) && !has(addDays(today, -1));

  return {
    current,
    best: Math.max(best, current),
    total: days.size,
    doneToday: has(today),
    graceUsed,
    last14: [...Array(14)].map((_, i) => has(addDays(today, -13 + i))),
  };
}

export async function reflectionHeatmap(clientId: string, now = new Date()) {
  const since = addDays(startOfDay(now), -371);
  const subs = await prisma.submission.findMany({
    where: { clientId, status: "SUBMITTED", submittedAt: { gte: since } },
    select: { submittedAt: true, form: { select: { frequency: true } } },
  });
  const days: Record<string, { count: number; kinds: string[] }> = {};
  for (const s of subs) {
    const key = s.submittedAt!.toISOString().slice(0, 10);
    const d = (days[key] ??= { count: 0, kinds: [] });
    d.count++;
    d.kinds.push(s.form.frequency);
  }
  return {
    end: startOfDay(now).toISOString().slice(0, 10),
    days,
    total: subs.length,
    activeDays: Object.keys(days).length,
  };
}

/** Lightweight consistency data (no AI): day streak + heat map. Loads fast so the UI can show it first. */
export async function reflectionActivity(clientId: string) {
  const [streak, heatmap] = await Promise.all([
    dailyStreak(clientId),
    reflectionHeatmap(clientId),
  ]);
  return { dailyStreak: streak, heatmap };
}

export async function growthJourney(clientId: string) {
  const corpus = await getCorpus(clientId);
  // AI patterns only add timeline items; the rest of the page is raw data and works without AI.
  // Timeline patterns come from the analysis tools — no need to wait for the LLM briefing.
  const report = await runAnalysis(clientId);
  const series = ["confidence", "energy", "stress", "team", "goalProgress"].map(
    (k) => buildSeries(corpus.metrics, k as "confidence"),
  );

  // Commitment completion over time (cumulative completion rate by week)
  const cms = await prisma.commitment.findMany({
    where: { clientId },
    include: { updates: true },
  });
  const start = corpus.submissions[0]
    ? startOfWeek(new Date(corpus.submissions[0].date))
    : startOfWeek(new Date());
  const completionSeries: { date: string; value: number }[] = [];
  for (let w = start; w.getTime() <= Date.now(); w = addDays(w, 7)) {
    const end = addDays(w, 7).getTime();
    const created = cms.filter((c) => c.createdAt.getTime() < end);
    if (!created.length) continue;
    const done = created.filter((c) =>
      c.updates.some(
        (u) => u.status === "COMPLETED" && u.createdAt.getTime() < end,
      ),
    );
    completionSeries.push({
      date: w.toISOString(),
      value: Math.round((done.length / created.length) * 100),
    });
  }

  const timeline: TimelineEvent[] = [];
  for (const s of corpus.snippets) {
    if (/achievement/i.test(s.question) && RESOLUTION.test(s.text))
      timeline.push({ date: s.date, kind: "breakthrough", title: s.text });
  }
  for (const p of report?.recurring.slice(0, 3) ?? [])
    timeline.push({
      date: String(p.stats?.firstObserved),
      kind: "challenge",
      title: `${p.title.replace(" pattern detected", "")} first observed`,
      detail: p.evidence[0]?.quote,
    });
  for (const p of report?.emerging ?? [])
    timeline.push({
      date: p.evidence[0]?.date ?? report!.generatedAt,
      kind: "pattern",
      title: p.title,
      detail: p.summary,
    });
  const sessions = await prisma.session.findMany({
    where: { clientId, status: "COMPLETED" },
    orderBy: { scheduledAt: "asc" },
  });
  for (const s of sessions)
    timeline.push({
      date: s.scheduledAt.toISOString(),
      kind: "session",
      title: s.topic,
      detail: s.summary,
    });
  for (const c of cms.filter((c) => c.status === "COMPLETED")) {
    const at =
      c.updates
        .filter((u) => u.status === "COMPLETED")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
        ?.createdAt ?? c.updatedAt;
    timeline.push({
      date: at.toISOString(),
      kind: "goal",
      title: `Completed: ${c.title}`,
      detail: c.goal,
    });
  }
  timeline.sort((a, b) => b.date.localeCompare(a.date));

  return {
    series,
    completionSeries,
    timeline: timeline.slice(0, 40),
    weeklyStreak: await weeklyStreak(clientId),
    dailyStreak: await dailyStreak(clientId),
    disclaimer:
      "Scores are self-reported by the client in reflections, or coach-defined. They are indicators for conversation, not validated measurements.",
  };
}
