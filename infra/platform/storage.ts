import * as aws from "@pulumi/aws";

/**
 * The single S3 bucket that holds every app's static build, each under its own
 * `<app>/` key prefix. Private — only the CloudFront distribution can read it
 * (via Origin Access Control; the bucket policy is attached in distribution.ts).
 */
export function createSiteBucket(): aws.s3.BucketV2 {
  const bucket = new aws.s3.BucketV2("site", {});

  new aws.s3.BucketPublicAccessBlock("site-pab", {
    bucket: bucket.id,
    blockPublicAcls: true,
    blockPublicPolicy: true,
    ignorePublicAcls: true,
    restrictPublicBuckets: true,
  });

  new aws.s3.BucketOwnershipControls("site-ownership", {
    bucket: bucket.id,
    rule: { objectOwnership: "BucketOwnerEnforced" },
  });

  return bucket;
}
