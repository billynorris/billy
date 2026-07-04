/**
 * Lifting Lambda (HTTP via API Gateway v2 -> Hono). Serves the "Lift Coach"
 * analytics under `/api/lifting/*`: strength progression, volume, muscle
 * balance, session history, a weekly muscle heatmap, and a Claude-powered
 * coaching card.
 *
 * Data comes from Hevy, selected per authenticated user: their consumer "user"
 * API token (config.hevy) when set, else the global Pro API key, else a
 * deterministic mock dataset so the whole app runs offline. Auth is the shared
 * platform Basic auth; only `/health` is left open.
 */
import { Hono, type Context } from "hono";
import { handle } from "hono/aws-lambda";
import { basicAuth, type AuthVariables } from "@billynorris/api-auth";
import { resolveLiftingSubject } from "@billynorris/config";
import { loadEnv } from "./env";
import { getTrainingData } from "./data/source";
import { buildSummary } from "./insights/summary";
import { buildExerciseList, buildProgression } from "./insights/exercises";
import { buildVolume } from "./insights/volume";
import { buildBalance } from "./insights/balance";
import { buildHistory } from "./insights/sessions";
import { buildHeatmap } from "./insights/heatmap";
import { buildAnalysis } from "./insights/analysis";

const env = loadEnv();

const app = new Hono<{ Variables: AuthVariables }>();

/**
 * Whose data to serve: the authenticated user, unless they're a coach whose
 * `config.lifting.viewUserId` points at someone else (then that person's data,
 * read-only). All data endpoints resolve through this.
 */
const subjectFor = (c: Context<{ Variables: AuthVariables }>) =>
  resolveLiftingSubject(c.get("user")).subject;

// --- open endpoint ---
app.get("/api/lifting/health", (c) =>
  c.json({ status: "ok", proKey: Boolean(env.providerApiKey), tokenStore: Boolean(env.hevyTable) }),
);

// --- everything below requires Basic auth ---
app.use("/api/lifting/*", basicAuth());

app.get("/api/lifting/context", (c) => {
  const { subject, viewing } = resolveLiftingSubject(c.get("user"));
  return c.json({ subjectName: subject.displayName ?? subject.username, viewing });
});

app.get("/api/lifting/summary", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(buildSummary(data));
});

app.get("/api/lifting/exercises", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(buildExerciseList(data));
});

app.get("/api/lifting/exercises/:id/progression", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  const dto = buildProgression(data, c.req.param("id"));
  if (!dto) return c.json({ error: "not_found", message: "Unknown exercise" }, 404);
  return c.json(dto);
});

app.get("/api/lifting/volume", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(buildVolume(data));
});

app.get("/api/lifting/balance", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(buildBalance(data));
});

app.get("/api/lifting/history", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(buildHistory(data));
});

app.get("/api/lifting/heatmap", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(buildHeatmap(data));
});

app.get("/api/lifting/analysis", async (c) => {
  const data = await getTrainingData(env, subjectFor(c));
  return c.json(await buildAnalysis(env, data));
});

export const handler = handle(app);
