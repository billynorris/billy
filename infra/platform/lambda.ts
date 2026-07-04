import * as path from "path";
import * as fs from "fs";
import * as esbuild from "esbuild";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * Languages the Lambda builder can package. TypeScript is implemented today;
 * the switch in {@link buildLambda} is the single place to add Python, Go, Rust,
 * etc. later — each just needs to produce a code archive + runtime + handler.
 */
export type LambdaLanguage = "typescript"; // future: | "python" | "go" | "rust"

export interface LambdaArgs {
  /** Path to the handler source entry (cwd- or absolute path). */
  entry: string;
  /** Defaults to "typescript". */
  language?: LambdaLanguage;
  /** Defaults to "index.handler". */
  handler?: string;
  environment?: Record<string, pulumi.Input<string>>;
  /** Seconds. Default 30. */
  timeout?: number;
  /** MB. Default 256. */
  memorySize?: number;
  /** Inline IAM policy document (JSON string) attached to the function role. */
  policy?: pulumi.Input<string>;
}

export interface BuiltLambda {
  fn: aws.lambda.Function;
  role: aws.iam.Role;
}

const BUILD_ROOT = path.resolve(__dirname, "..", ".build");

/** Bundle a TypeScript entry into a single CJS file for Lambda. */
function bundleTypescript(name: string, entry: string): pulumi.asset.Archive {
  const outdir = path.join(BUILD_ROOT, name);
  fs.mkdirSync(outdir, { recursive: true });
  const outfile = path.join(outdir, "index.js");
  esbuild.buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    sourcemap: true,
    // The AWS SDK v3 ships in the Node 20 Lambda runtime — keep it external so
    // bundles stay small and use the runtime's copy.
    external: ["@aws-sdk/*"],
  });
  return new pulumi.asset.AssetArchive({
    "index.js": new pulumi.asset.FileAsset(outfile),
    "index.js.map": new pulumi.asset.FileAsset(`${outfile}.map`),
  });
}

/**
 * Build and provision a Lambda from source, language-agnostic by design.
 * Returns the function and its execution role so callers can grant extra access.
 */
export function buildLambda(
  name: string,
  args: LambdaArgs,
  opts?: pulumi.ResourceOptions,
): BuiltLambda {
  const language = args.language ?? "typescript";

  let code: pulumi.asset.Archive;
  let runtime: string;
  let handler: string;

  switch (language) {
    case "typescript":
      code = bundleTypescript(name, args.entry);
      runtime = "nodejs20.x";
      handler = args.handler ?? "index.handler";
      break;
    default:
      throw new Error(
        `Lambda language "${language}" is not supported yet. Add a bundler branch in platform/lambda.ts.`,
      );
  }

  const role = new aws.iam.Role(
    `${name}-role`,
    {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
          },
        ],
      }),
    },
    opts,
  );

  new aws.iam.RolePolicyAttachment(
    `${name}-logs`,
    { role: role.name, policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole },
    opts,
  );

  if (args.policy) {
    new aws.iam.RolePolicy(`${name}-policy`, { role: role.id, policy: args.policy }, opts);
  }

  const fn = new aws.lambda.Function(
    `${name}-fn`,
    {
      runtime,
      handler,
      role: role.arn,
      code,
      timeout: args.timeout ?? 30,
      memorySize: args.memorySize ?? 256,
      environment: args.environment ? { variables: args.environment } : undefined,
    },
    opts,
  );

  return { fn, role };
}
