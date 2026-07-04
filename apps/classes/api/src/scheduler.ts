/**
 * Booking engine. Two entry points:
 *   - `queueBooking` — record a booking intent in DynamoDB (status=queued).
 *   - `runPoller` — invoked once a minute by a single recurring EventBridge
 *     schedule; finds queued bookings whose window is imminent, claims them,
 *     syncs to the gym server clock, and books at the exact open moment.
 *
 * The ThirdSpace client is built per-user from the users registry: the API
 * caller's config when queuing, and each booking's stored `userId` when polling.
 */
import { DateTime } from "luxon";
import { findUserById, type User } from "@billynorris/config";
import { ThirdSpaceClient } from "./thirdspace";
import * as bookings from "./bookings";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How far ahead of a booking window the poller starts handling it. */
const HORIZON_MS = 75_000;

function clientForUser(user: User): ThirdSpaceClient {
  return new ThirdSpaceClient(user.config?.thirdspace ?? {});
}

export async function queueBooking(user: User, classId: string): Promise<bookings.BookingRecord> {
  const client = clientForUser(user);
  const { data: info } = await client.getClassDetails(classId);
  const now = new Date().toISOString();
  const bookingOpens = DateTime.fromISO(info.bookingOpens, { zone: "Europe/London" })
    .toUTC()
    .toISO()!;

  const record: bookings.BookingRecord = {
    classId: String(classId),
    userId: user.id,
    status: info.eventAction === "cancel" ? "booked" : "queued",
    name: info.name,
    trainerName: info.trainerName,
    clubId: info.locationId,
    clubName: info.locationName,
    startDate: info.startDate,
    bookingOpens,
    createdAt: now,
    updatedAt: now,
  };
  await bookings.putBooking(record);
  return record;
}

export async function runPoller(): Promise<{ processed: number; booked: number }> {
  const horizonIso = new Date(Date.now() + HORIZON_MS).toISOString();
  const due = await bookings.queryDue(horizonIso);

  let processed = 0;
  let booked = 0;
  for (const b of due) {
    if (!(await bookings.claim(b.classId))) continue; // another run took it
    processed++;

    const user = findUserById(b.userId);
    if (!user?.config?.thirdspace) {
      await bookings.update(b.classId, {
        status: "failed",
        error: `No ThirdSpace config for user "${b.userId}"`,
      });
      continue;
    }

    try {
      const result = await bookClassAtWindow(clientForUser(user), b);
      await bookings.update(b.classId, { status: "booked", result });
      booked++;
    } catch (e) {
      await bookings.update(b.classId, { status: "failed", error: String(e) });
    }
  }
  return { processed, booked };
}

/** Sync to the gym server clock, wait until the window opens, then book. */
async function bookClassAtWindow(
  client: ThirdSpaceClient,
  b: bookings.BookingRecord,
): Promise<unknown> {
  const { serverDate, data: info } = await client.getClassDetails(b.classId);
  if (info.eventAction === "cancel") return { alreadyBooked: true };

  const bookingOpens = DateTime.fromISO(info.bookingOpens, { zone: "Europe/London" }).toUTC();
  const serverTime = serverDate ? DateTime.fromHTTP(serverDate).toUTC() : DateTime.utc();
  const waitMs = bookingOpens.toMillis() - serverTime.toMillis();

  if (waitMs > 120_000) {
    throw new Error(`Booking window more than 120s away (${waitMs}ms) — aborting`);
  }
  if (waitMs > 0) await sleep(waitMs);

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await client.bookClass(b.classId);
    if (result?.eventAction === "cancel") return result;
    if (attempt < 2) await sleep(1000);
  }
  throw new Error(`Failed to book class ${b.classId} after 3 attempts`);
}
