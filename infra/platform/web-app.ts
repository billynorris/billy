import * as path from "path";
import * as fs from "fs";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export { AppContext, AppRegistration, ApiRoute } from "./types";

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
};

/**
 * Upload an app's built static site into the shared bucket under `<appName>/`.
 * If the build directory doesn't exist yet, logs a warning and uploads nothing
 * (so infra still deploys before any frontend has been built).
 */
export function uploadSite(
  appName: string,
  bucket: aws.s3.BucketV2,
  distDir: string,
  parent: pulumi.Resource,
): aws.s3.BucketObject[] {
  const objects: aws.s3.BucketObject[] = [];

  if (!fs.existsSync(distDir)) {
    pulumi.log.warn(
      `[${appName}] no build found at ${distDir} — run \`pnpm --filter @billynorris/${appName}-web build\` before deploy. Uploading nothing.`,
      parent,
    );
    return objects;
  }

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(distDir, full).split(path.sep).join("/");
      const ext = path.extname(entry.name).toLowerCase();
      objects.push(
        new aws.s3.BucketObject(
          `${appName}/${rel}`,
          {
            bucket: bucket.id,
            key: `${appName}/${rel}`,
            source: new pulumi.asset.FileAsset(full),
            contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
            // HTML must revalidate so deploys are picked up; hashed assets are
            // immutable and can be cached hard.
            cacheControl:
              ext === ".html"
                ? "no-cache"
                : "public, max-age=31536000, immutable",
          },
          { parent },
        ),
      );
    }
  };

  walk(distDir);
  return objects;
}

/**
 * Create an HTTP API (API Gateway v2) that proxies everything to a Lambda. The
 * Lambda (Hono) does its own routing on the full path, so a single `$default`
 * route is enough. Returns the origin host for use as a CloudFront origin.
 */
export function createHttpApi(
  appName: string,
  fn: aws.lambda.Function,
  parent: pulumi.Resource,
): { api: aws.apigatewayv2.Api; originDomainName: pulumi.Output<string> } {
  const api = new aws.apigatewayv2.Api(
    `${appName}-api`,
    { protocolType: "HTTP" },
    { parent },
  );

  const integration = new aws.apigatewayv2.Integration(
    `${appName}-api-integ`,
    {
      apiId: api.id,
      integrationType: "AWS_PROXY",
      integrationUri: fn.arn,
      integrationMethod: "POST",
      payloadFormatVersion: "2.0",
    },
    { parent },
  );

  new aws.apigatewayv2.Route(
    `${appName}-api-route`,
    {
      apiId: api.id,
      routeKey: "$default",
      target: pulumi.interpolate`integrations/${integration.id}`,
    },
    { parent },
  );

  new aws.apigatewayv2.Stage(
    `${appName}-api-stage`,
    { apiId: api.id, name: "$default", autoDeploy: true },
    { parent },
  );

  new aws.lambda.Permission(
    `${appName}-api-perm`,
    {
      action: "lambda:InvokeFunction",
      function: fn.name,
      principal: "apigateway.amazonaws.com",
      sourceArn: pulumi.interpolate`${api.executionArn}/*/*`,
    },
    { parent },
  );

  const originDomainName = api.apiEndpoint.apply((e) => e.replace("https://", ""));
  return { api, originDomainName };
}
