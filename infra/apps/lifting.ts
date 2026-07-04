import * as path from "path";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { AppContext, AppRegistration } from "../platform/types";
import { uploadSite, createHttpApi } from "../platform/web-app";
import { buildLambda } from "../platform/lambda";

/**
 * Lifting app ("Lift Coach") — SPA + JSON API. Pulls training history from Hevy
 * and serves computed coaching insights: strength progression, volume, muscle
 * balance, session history, a weekly muscle heatmap, and a Claude-powered
 * analysis card.
 *
 * Two Hevy integrations, selected per authenticated user:
 *   - the consumer **user API** (per-user bearer token) when the user has a
 *     `config.hevy` seed — this mirrors what they see in the Hevy app, and
 *   - the global **Pro API key** (`HEVY_API_KEY`, env) as a fallback.
 * With neither configured the API serves deterministic mock data.
 *
 * The single `hevy` DynamoDB table (generic PK/SK single-table design) persists
 * rotated per-user access/refresh tokens, since `users.json` is bundled
 * read-only and Hevy rotates the refresh token on every refresh.
 */
export class LiftingApp extends pulumi.ComponentResource {
  public readonly registration: AppRegistration;

  constructor(name: string, ctx: AppContext, opts?: pulumi.ComponentResourceOptions) {
    super("billynorris:app:Lifting", name, {}, opts);

    // Single-table store for "all things Hevy" (tokens today; room for more).
    const table = new aws.dynamodb.Table(
      `${name}-hevy`,
      {
        billingMode: "PAY_PER_REQUEST",
        hashKey: "PK",
        rangeKey: "SK",
        attributes: [
          { name: "PK", type: "S" },
          { name: "SK", type: "S" },
        ],
      },
      { parent: this },
    );

    const entry = path.resolve(__dirname, "..", "..", "apps", name, "api", "src", "index.ts");

    const { fn } = buildLambda(
      `${name}-api`,
      {
        entry,
        // The AI analysis call can take a few seconds; give it headroom.
        timeout: 30,
        memorySize: 256,
        environment: {
          // Global Hevy Pro API key (fallback when a user has no config.hevy).
          HEVY_API_KEY: process.env.HEVY_API_KEY ?? "",
          // Single-table store for per-user Hevy tokens.
          HEVY_TABLE: table.name,
          // Optional: enables the Claude-powered coaching card. Empty => rule-based.
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
          ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
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
                ],
                Resource: [tableArn, `${tableArn}/index/*`],
              },
            ],
          }),
        ),
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
