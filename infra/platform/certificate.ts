import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * One multi-SAN ACM certificate covering every root domain's apex + wildcard,
 * created in us-east-1 (required for CloudFront). For each root domain the apex
 * and its wildcard share the same DNS validation record, so we create exactly
 * one Route53 validation record per root domain (keyed off the apex option).
 */
export function createCertificate(
  rootDomains: string[],
  zoneIds: Record<string, pulumi.Input<string>>,
  provider: aws.Provider,
): aws.acm.Certificate {
  const sans = rootDomains.flatMap((d) => [d, `*.${d}`]);

  const cert = new aws.acm.Certificate(
    "platform-cert",
    {
      domainName: sans[0],
      subjectAlternativeNames: sans.slice(1),
      validationMethod: "DNS",
    },
    { provider },
  );

  const validationRecords = rootDomains.map((domain) => {
    // The apex validation option carries the CNAME that validates both the apex
    // and its wildcard, so we only need this one record per domain.
    const option = cert.domainValidationOptions.apply((opts) => {
      const match = opts.find((o) => o.domainName === domain);
      if (!match) {
        throw new Error(`No ACM validation option found for ${domain}`);
      }
      return match;
    });

    return new aws.route53.Record(`cert-validation-${domain.replace(/\./g, "-")}`, {
      zoneId: zoneIds[domain],
      name: option.resourceRecordName,
      type: option.resourceRecordType,
      records: [option.resourceRecordValue],
      ttl: 300,
      allowOverwrite: true,
    });
  });

  new aws.acm.CertificateValidation(
    "platform-cert-validation",
    {
      certificateArn: cert.arn,
      validationRecordFqdns: validationRecords.map((r) => r.fqdn),
    },
    { provider },
  );

  return cert;
}
