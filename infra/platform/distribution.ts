import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { AppRegistration } from "./types";

// AWS-managed CloudFront cache/origin-request policy IDs.
const CACHE_OPTIMIZED = "658327ea-f89d-4fab-a63d-7e88639e58f6";
const CACHE_DISABLED = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad";
const ORIGIN_ALL_VIEWER_EXCEPT_HOST = "b689b0a8-53d0-40ab-baf2-68738e2966ac";

/**
 * Generate the viewer-request CloudFront Function. CloudFront selects a cache
 * behavior from the *original* path, so:
 *   - `/api/<app>/*` requests are left untouched and matched by their own
 *     behavior -> the app's API origin.
 *   - everything else is static: we map the Host's first label to an app and
 *     rewrite the URI into that app's S3 prefix, with SPA fallback to
 *     index.html for extension-less (client-route) paths.
 * The `.gay` vs `.co.uk` TLD is ignored here — the theme is decided client-side.
 */
function renderRouterFunction(appNames: string[], rootDomains: string[]): string {
  return `function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = (request.headers.host && request.headers.host.value) || "";

  // API calls are already namespaced (/api/<app>/*) and routed by their own
  // cache behavior -> leave them untouched.
  if (uri.indexOf('/api/') === 0) {
    return request;
  }

  var rootDomains = ${JSON.stringify(rootDomains)};
  var apps = ${JSON.stringify(appNames)};

  // Strip a known root domain suffix to find the subdomain label.
  var label = host;
  for (var i = 0; i < rootDomains.length; i++) {
    if (host === rootDomains[i]) { label = ""; break; }
    var suffix = "." + rootDomains[i];
    if (host.length >= suffix.length && host.slice(-suffix.length) === suffix) {
      label = host.slice(0, host.length - suffix.length);
      break;
    }
  }

  // apex / www / unknown -> hub.
  var app = "hub";
  if (label && label !== "www" && apps.indexOf(label) !== -1) {
    app = label;
  }

  // Static asset (has extension) -> serve from prefix; otherwise SPA fallback.
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') !== -1) {
    request.uri = '/' + app + uri;
  } else {
    request.uri = '/' + app + '/index.html';
  }
  return request;
}`;
}

export interface DistributionArgs {
  bucket: aws.s3.BucketV2;
  certificateArn: pulumi.Input<string>;
  /** CNAMEs on the distribution (apex + wildcard per root domain). */
  aliases: string[];
  apps: AppRegistration[];
  rootDomains: string[];
}

export function createDistribution(args: DistributionArgs): aws.cloudfront.Distribution {
  const appNames = args.apps.map((a) => a.name);

  const oac = new aws.cloudfront.OriginAccessControl("site-oac", {
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
  });

  const routerFn = new aws.cloudfront.Function("router", {
    runtime: "cloudfront-js-2.0",
    comment: "Host -> app prefix routing + SPA fallback",
    publish: true,
    code: renderRouterFunction(appNames, args.rootDomains),
  });

  const S3_ORIGIN_ID = "s3-site";

  const apiOrigins: aws.types.input.cloudfront.DistributionOrigin[] = args.apps.flatMap(
    (app) =>
      app.apiRoutes.map((route) => ({
        originId: `api-${app.name}`,
        domainName: route.originDomainName,
        customOriginConfig: {
          httpPort: 80,
          httpsPort: 443,
          originProtocolPolicy: "https-only",
          originSslProtocols: ["TLSv1.2"],
        },
      })),
  );

  const apiBehaviors: aws.types.input.cloudfront.DistributionOrderedCacheBehavior[] =
    args.apps.flatMap((app) =>
      app.apiRoutes.map((route) => ({
        pathPattern: route.pathPattern,
        targetOriginId: `api-${app.name}`,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
        cachedMethods: ["GET", "HEAD"],
        cachePolicyId: CACHE_DISABLED,
        originRequestPolicyId: ORIGIN_ALL_VIEWER_EXCEPT_HOST,
        compress: true,
      })),
    );

  const distribution = new aws.cloudfront.Distribution("site", {
    enabled: true,
    httpVersion: "http2and3",
    isIpv6Enabled: true,
    aliases: args.aliases,
    priceClass: "PriceClass_100",
    origins: [
      {
        originId: S3_ORIGIN_ID,
        domainName: args.bucket.bucketRegionalDomainName,
        originAccessControlId: oac.id,
      },
      ...apiOrigins,
    ],
    defaultCacheBehavior: {
      targetOriginId: S3_ORIGIN_ID,
      viewerProtocolPolicy: "redirect-to-https",
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD"],
      cachePolicyId: CACHE_OPTIMIZED,
      compress: true,
      functionAssociations: [{ eventType: "viewer-request", functionArn: routerFn.arn }],
    },
    orderedCacheBehaviors: apiBehaviors,
    restrictions: { geoRestriction: { restrictionType: "none" } },
    viewerCertificate: {
      acmCertificateArn: args.certificateArn,
      sslSupportMethod: "sni-only",
      minimumProtocolVersion: "TLSv1.2_2021",
    },
  });

  // Let only this distribution read the bucket (OAC).
  new aws.s3.BucketPolicy("site-bucket-policy", {
    bucket: args.bucket.id,
    policy: pulumi
      .all([args.bucket.arn, distribution.arn])
      .apply(([bucketArn, distArn]) =>
        JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Sid: "AllowCloudFrontRead",
              Effect: "Allow",
              Principal: { Service: "cloudfront.amazonaws.com" },
              Action: "s3:GetObject",
              Resource: `${bucketArn}/*`,
              Condition: { StringEquals: { "AWS:SourceArn": distArn } },
            },
          ],
        }),
      ),
  });

  return distribution;
}
