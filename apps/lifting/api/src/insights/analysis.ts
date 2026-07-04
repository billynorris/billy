import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisDTO, TrainingData } from "@billynorris/lifting-shared";
import type { Env } from "../env";
import { buildSummary } from "./summary";
import { buildBalance } from "./balance";
import { buildExerciseList } from "./exercises";
import { muscleLabel } from "./labels";

/**
 * The coaching analysis card. When an Anthropic key is configured, Claude turns
 * the computed insights into a short, specific coaching note; otherwise a
 * deterministic rule-based summary keeps the card useful offline.
 */
export async function buildAnalysis(env: Env, data: TrainingData): Promise<AnalysisDTO> {
  const facts = collectFacts(data);

  if (!env.anthropicApiKey) {
    return { ...ruleBased(facts), source: "rules", generatedAt: new Date().toISOString() };
  }

  try {
    return { ...(await aiAnalysis(env, facts)), source: "ai", generatedAt: new Date().toISOString() };
  } catch {
    // Any API/parse failure degrades gracefully to the offline summary.
    return { ...ruleBased(facts), source: "rules", generatedAt: new Date().toISOString() };
  }
}

interface Facts {
  workoutsThisWeek: number;
  weeklyVolumeKg: number;
  weeklyVolumeChangePct: number | null;
  setsThisWeek: number;
  streakWeeks: number;
  pushPullRatio: number | null;
  progressing: string[];
  stalling: string[];
  staleMuscles: string[];
  recentPrs: string[];
}

function collectFacts(data: TrainingData): Facts {
  const summary = buildSummary(data);
  const balance = buildBalance(data);
  const exercises = buildExerciseList(data);

  return {
    workoutsThisWeek: summary.workoutsThisWeek,
    weeklyVolumeKg: summary.weeklyVolumeKg,
    weeklyVolumeChangePct: summary.weeklyVolumeChangePct,
    setsThisWeek: summary.setsThisWeek,
    streakWeeks: summary.currentStreakWeeks,
    pushPullRatio: balance.pushPullRatio,
    progressing: exercises.filter((e) => e.trend === "overload").map((e) => e.name).slice(0, 4),
    stalling: exercises
      .filter((e) => e.trend === "plateau" || e.trend === "stagnant" || e.trend === "regression")
      .map((e) => e.name)
      .slice(0, 4),
    staleMuscles: balance.muscles
      .filter((m) => (m.daysSinceLastTrained ?? 0) >= 10)
      .map((m) => muscleLabel(m.muscle))
      .slice(0, 3),
    recentPrs: summary.recentPrs.map((p) => `${p.exerciseName} (${p.e1rmKg}kg e1RM)`).slice(0, 3),
  };
}

async function aiAnalysis(env: Env, facts: Facts): Promise<{ headline: string; bullets: string[] }> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  const system =
    "You are a concise, evidence-based strength coach. Given a JSON snapshot of a " +
    "lifter's recent training, return STRICT JSON only (no prose, no markdown fences) " +
    'matching {"headline": string, "bullets": string[]}. The headline is one short ' +
    "encouraging sentence. Provide 2-4 bullets, each one actionable sentence grounded " +
    "in the numbers given (progression, plateaus, push/pull balance, stale muscles, " +
    "consistency). Do not invent data not present.";

  const message = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 700,
    system,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = JSON.parse(stripFences(text)) as { headline?: unknown; bullets?: unknown };
  const headline = typeof parsed.headline === "string" ? parsed.headline : "";
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.filter((b): b is string => typeof b === "string")
    : [];
  if (!headline || bullets.length === 0) throw new Error("Empty analysis");
  return { headline, bullets };
}

/** Tolerate a model that wraps JSON in ```json fences despite instructions. */
function stripFences(text: string): string {
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text.trim());
  return fence ? fence[1] : text;
}

function ruleBased(facts: Facts): { headline: string; bullets: string[] } {
  const bullets: string[] = [];

  if (facts.workoutsThisWeek === 0) {
    bullets.push("No sessions logged this week yet — a single workout keeps your streak alive.");
  } else if (facts.weeklyVolumeChangePct != null && facts.weeklyVolumeChangePct <= -15) {
    bullets.push(
      `Weekly volume is down ${Math.abs(facts.weeklyVolumeChangePct)}% — fine for a deload, otherwise add a couple of sets back.`,
    );
  } else if (facts.weeklyVolumeChangePct != null && facts.weeklyVolumeChangePct >= 20) {
    bullets.push(
      `Volume jumped ${facts.weeklyVolumeChangePct}% this week — watch recovery before pushing further.`,
    );
  }

  if (facts.progressing.length > 0) {
    bullets.push(`Still progressing on ${facts.progressing.join(", ")} — keep adding load.`);
  }
  if (facts.stalling.length > 0) {
    bullets.push(
      `${facts.stalling.join(", ")} ${facts.stalling.length === 1 ? "has" : "have"} stalled — try a small deload then rebuild, or vary rep ranges.`,
    );
  }
  if (facts.pushPullRatio != null && (facts.pushPullRatio > 1.3 || facts.pushPullRatio < 0.77)) {
    bullets.push(
      facts.pushPullRatio > 1.3
        ? `Push/pull ratio is ${facts.pushPullRatio.toFixed(2)} — add pulling volume to even things out.`
        : `Push/pull ratio is ${facts.pushPullRatio.toFixed(2)} — add pressing volume to even things out.`,
    );
  }
  if (facts.staleMuscles.length > 0) {
    bullets.push(`Haven't trained ${facts.staleMuscles.join(", ")} in over a week — worth a slot soon.`);
  }
  if (bullets.length === 0) {
    bullets.push("Balanced week with steady progress — stay the course and keep logging.");
  }

  const headline =
    facts.streakWeeks >= 2
      ? `${facts.streakWeeks}-week streak going strong.`
      : facts.recentPrs.length > 0
        ? `New PR on ${facts.recentPrs[0]}.`
        : "Here's where your training stands.";

  return { headline, bullets: bullets.slice(0, 4) };
}
