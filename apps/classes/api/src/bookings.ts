/**
 * DynamoDB persistence for bookings — the source of truth for what's queued /
 * booked (replacing the old "read it off the EventBridge schedule list"). One
 * table, PK `classId`, plus a `status`+`bookingOpens` GSI the poller queries to
 * find bookings whose window is imminent.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.BOOKINGS_TABLE!;
const STATUS_INDEX = "status-bookingOpens-index";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type BookingStatus = "queued" | "processing" | "booked" | "failed" | "cancelled";

export interface BookingRecord {
  classId: string;
  /** Which user (from the users registry) this booking belongs to. */
  userId: string;
  status: BookingStatus;
  name: string;
  trainerName?: string;
  clubId?: number;
  clubName?: string;
  startDate: string;
  /** ISO UTC — also the GSI sort key, so lexicographic = chronological. */
  bookingOpens: string;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: string;
}

export async function putBooking(record: BookingRecord): Promise<void> {
  await doc.send(new PutCommand({ TableName: TABLE, Item: record }));
}

export async function getBooking(classId: string): Promise<BookingRecord | undefined> {
  const out = await doc.send(new GetCommand({ TableName: TABLE, Key: { classId } }));
  return out.Item as BookingRecord | undefined;
}

export async function listBookings(
  opts: { upcomingOnly?: boolean } = {},
): Promise<BookingRecord[]> {
  const out = await doc.send(new ScanCommand({ TableName: TABLE }));
  let items = (out.Items ?? []) as BookingRecord[];
  if (opts.upcomingOnly) {
    const now = Date.now();
    items = items.filter((b) => Date.parse(b.startDate) >= now);
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Queued bookings whose window opens at/before `horizonIso`. */
export async function queryDue(horizonIso: string): Promise<BookingRecord[]> {
  const out = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: STATUS_INDEX,
      KeyConditionExpression: "#s = :q AND bookingOpens <= :h",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":q": "queued", ":h": horizonIso },
    }),
  );
  return (out.Items ?? []) as BookingRecord[];
}

/**
 * Atomically claim a queued booking (queued -> processing) so overlapping poller
 * runs can't double-book. Returns false if another run already claimed it.
 */
export async function claim(classId: string): Promise<boolean> {
  try {
    await doc.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { classId },
        UpdateExpression: "SET #s = :p, updatedAt = :now",
        ConditionExpression: "#s = :q",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":p": "processing",
          ":q": "queued",
          ":now": new Date().toISOString(),
        },
      }),
    );
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

export async function update(
  classId: string,
  patch: { status: BookingStatus; result?: unknown; error?: string },
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { classId },
      UpdateExpression: "SET #s = :s, updatedAt = :now, #r = :r, #e = :e",
      ExpressionAttributeNames: { "#s": "status", "#r": "result", "#e": "error" },
      ExpressionAttributeValues: {
        ":s": patch.status,
        ":now": new Date().toISOString(),
        ":r": patch.result ?? null,
        ":e": patch.error ?? null,
      },
    }),
  );
}

export async function cancelBooking(classId: string): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { classId },
      UpdateExpression: "SET #s = :c, updatedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":c": "cancelled", ":now": new Date().toISOString() },
    }),
  );
}
