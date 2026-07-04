/**
 * DynamoDB persistence for "all things Hevy", single-table design with generic
 * `PK`/`SK`. Today it holds one item per user: their live (rotated) Hevy tokens.
 * The seed refresh token comes from `users.json` (`config.hevy`), but because
 * Hevy rotates the refresh token on every refresh — and the bundled config is
 * read-only — the live tokens must live here.
 *
 *   PK = USER#<userId>   SK = HEVY#AUTH
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface HevyAuthRecord {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires (undefined = unknown). */
  expiresAtMs?: number;
  /** Hevy username, needed by the workouts endpoint. */
  username?: string;
  /** Hevy user id, if known. */
  hevyUserId?: string;
  updatedAt: string;
}

const authKey = (userId: string) => ({ PK: `USER#${userId}`, SK: "HEVY#AUTH" });

export async function getAuthRecord(
  table: string,
  userId: string,
): Promise<HevyAuthRecord | undefined> {
  const out = await doc.send(new GetCommand({ TableName: table, Key: authKey(userId) }));
  if (!out.Item) return undefined;
  const { PK: _pk, SK: _sk, ...rest } = out.Item;
  return rest as HevyAuthRecord;
}

export async function putAuthRecord(
  table: string,
  userId: string,
  record: HevyAuthRecord,
): Promise<void> {
  await doc.send(
    new PutCommand({ TableName: table, Item: { ...authKey(userId), ...record } }),
  );
}
