import * as path from "path";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { AppContext, AppRegistration } from "../platform/types";
import { uploadSite, createHttpApi } from "../platform/web-app";
import { buildLambda } from "../platform/lambda";

/**
 * Classes app — the gym auto-book sniper, as SPA + JSON API.
 *
 * Backend is a single Lambda with two modes:
 *   - HTTP (API Gateway -> Hono): browse classes/clubs, queue auto-books,
 *     list/cancel bookings (Basic auth).
 *   - EventBridge recurring schedule (rate 1 min): a `{ poll: true }` payload
 *     runs the poller, which books due classes at the exact window.
 *
 * Bookings are persisted in DynamoDB (the source of truth) — replacing the old
 * one-schedule-per-booking pattern with a single coherent recurring schedule.
 * Per-user gym credentials come from packages/config/users.json. Multi-club: no
 * hardcoded club; the user's config optionally narrows the default set.
 */
export class ClassesApp extends pulumi.ComponentResource {
  public readonly registration: AppRegistration;

  constructor(name: string, ctx: AppContext, opts?: pulumi.ComponentResourceOptions) {
    super("billynorris:app:Classes", name, {}, opts);

    // --- DynamoDB: booked/queued classes (source of truth) ---
    const table = new aws.dynamodb.Table(
      `${name}-bookings`,
      {
        billingMode: "PAY_PER_REQUEST",
        hashKey: "classId",
        attributes: [
          { name: "classId", type: "S" },
          { name: "status", type: "S" },
          { name: "bookingOpens", type: "S" },
        ],
        globalSecondaryIndexes: [
          {
            name: "status-bookingOpens-index",
            hashKey: "status",
            rangeKey: "bookingOpens",
            projectionType: "ALL",
          },
        ],
      },
      { parent: this },
    );

    // Role assumed by EventBridge Scheduler to invoke the Lambda.
    const schedulerRole = new aws.iam.Role(
      `${name}-scheduler-role`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "scheduler.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      },
      { parent: this },
    );

    const entry = path.resolve(__dirname, "..", "..", "apps", name, "api", "src", "index.ts");

    const { fn } = buildLambda(
      `${name}-api`,
      {
        entry,
        timeout: 180, // the poller may sleep until a booking window opens
        memorySize: 256,
        // ThirdSpace credentials now come from the per-user config bundled in
        // packages/config/users.json (config.thirdspace), not env.
        environment: {
          BOOKINGS_TABLE: table.name,
        },
        policy: table.arn.apply((tableArn) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [
                  "dynamodb:GetItem",
                  "dynamodb:PutItem",
                  "dynamodb:UpdateItem",
                  "dynamodb:DeleteItem",
                  "dynamodb:Query",
                  "dynamodb:Scan",
                ],
                Resource: [tableArn, `${tableArn}/index/*`],
              },
            ],
          }),
        ),
      },
      { parent: this },
    );

    // Let the scheduler role invoke this function.
    new aws.iam.RolePolicy(
      `${name}-scheduler-invoke`,
      {
        role: schedulerRole.id,
        policy: fn.arn.apply((arn) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "lambda:InvokeFunction", Resource: arn }],
          }),
        ),
      },
      { parent: this },
    );

    // One recurring schedule (coherent in the console) drives the poller.
    new aws.scheduler.Schedule(
      `${name}-poll`,
      {
        scheduleExpression: "rate(1 minute)",
        flexibleTimeWindow: { mode: "OFF" },
        target: {
          arn: fn.arn,
          roleArn: schedulerRole.arn,
          input: JSON.stringify({ poll: true }),
        },
      },
      { parent: this },
    );

    const { originDomainName } = createHttpApi(name, fn, this);

    const distDir = path.resolve(__dirname, "..", "..", "apps", name, "dist");
    uploadSite(name, ctx.bucket, distDir, this);

    this.registration = {
      name,
      apiRoutes: [{ pathPattern: `/api/${name}/*`, originDomainName }],
    };
    this.registerOutputs({ registration: this.registration });
  }
}
