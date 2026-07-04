/**
 * Classes Lambda — dual mode:
 *   1. HTTP (API Gateway v2 -> Hono): browse classes/clubs, queue auto-books,
 *      list/cancel bookings. Protected by Basic auth (health is open).
 *   2. EventBridge recurring schedule: a `{ poll: true }` payload runs the
 *      poller that books due classes.
 */
import { Hono, type Context } from "hono";
import { handle } from "hono/aws-lambda";
import type { Context as LambdaContext } from "aws-lambda";
import { basicAuth, type AuthVariables } from "@billynorris/api-auth";
import { ThirdSpaceClient } from "./thirdspace";
import { queueBooking, runPoller } from "./scheduler";
import * as bookings from "./bookings";

type AppContext = Context<{ Variables: AuthVariables }>;

const app = new Hono<{ Variables: AuthVariables }>();

/** ThirdSpace client built from the authenticated user's config. */
function clientFor(c: AppContext): ThirdSpaceClient {
  return new ThirdSpaceClient(c.get("user").config?.thirdspace ?? {});
}

app.get("/api/classes/health", (c) => c.json({ ok: true }));

app.use("/api/classes/*", basicAuth());

app.get("/api/classes/clubs", async (c) => {
  const client = clientFor(c);
  return c.json({ clubs: await client.getClubs(), defaultClubId: client.defaultClubId ?? null });
});

app.get("/api/classes/classes", async (c) => {
  const classes = await clientFor(c).getClasses({
    startDate: c.req.query("from"),
    endDate: c.req.query("to"),
    clubIds: parseClubIds(c.req.query("clubIds")),
  });
  return c.json({ classes });
});

app.get("/api/classes/bookings", async (c) => {
  // ?scope=upcoming -> only classes starting from now; default = all.
  const upcomingOnly = c.req.query("scope") === "upcoming";
  return c.json({ bookings: await bookings.listBookings({ upcomingOnly }) });
});

app.post("/api/classes/autobook", async (c) => {
  const body = await c.req.json<{ classId: string | number }>();
  return c.json(await queueBooking(c.get("user"), String(body.classId)));
});

app.delete("/api/classes/bookings/:id", async (c) => {
  await bookings.cancelBooking(c.req.param("id"));
  return c.json({ success: true });
});

const honoHandler = handle(app);

function isPollEvent(event: unknown): event is { poll: true } {
  return !!event && typeof event === "object" && (event as { poll?: unknown }).poll === true;
}

export const handler = async (event: unknown, context: LambdaContext) => {
  if (isPollEvent(event)) {
    return runPoller();
  }
  return honoHandler(event as never, context);
};

function parseClubIds(q?: string): number[] | undefined {
  if (!q) return undefined;
  const ids = q
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  return ids.length ? ids : undefined;
}
