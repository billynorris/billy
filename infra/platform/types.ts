import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

/**
 * A single API route an app contributes to the shared CloudFront distribution.
 * Routes are namespaced by path (`/api/<app>/*`) so each app keeps an isolated
 * origin without needing host-based origin selection (which would require
 * Lambda@Edge). See platform/distribution.ts.
 */
export interface ApiRoute {
  /** CloudFront path pattern, e.g. "/api/classes/*". */
  pathPattern: string;
  /** Origin host only (no scheme), e.g. "abc.execute-api.eu-west-2.amazonaws.com". */
  originDomainName: pulumi.Input<string>;
}

/**
 * What every app component exposes to the platform so the single distribution,
 * bucket and DNS can be assembled from all apps together.
 */
export interface AppRegistration {
  /** Unique app id. Doubles as the S3 key prefix and the subdomain label. */
  name: string;
  /** API routes this app serves (may be empty for a static-only app). */
  apiRoutes: ApiRoute[];
}

/** Shared context handed to every app component. */
export interface AppContext {
  /** The single shared S3 bucket; apps upload their build under `<name>/`. */
  bucket: aws.s3.BucketV2;
  /** Primary AWS region (where Lambdas/APIs/bucket live). */
  region: string;
  /** Root domains the platform serves. */
  rootDomains: string[];
}
