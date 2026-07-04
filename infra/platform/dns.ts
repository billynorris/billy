import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface DnsArgs {
  rootDomains: string[];
  /** App names. "hub" maps to the apex; others map to `<name>.<domain>`. */
  appNames: string[];
  zoneIds: Record<string, pulumi.Input<string>>;
  distribution: aws.cloudfront.Distribution;
}

/**
 * A + AAAA alias records pointing every domain/subdomain at the distribution.
 * For each root domain: the apex (for the hub) plus one record per non-hub app.
 */
export function createDnsRecords(args: DnsArgs): void {
  for (const domain of args.rootDomains) {
    const fqdns = [
      domain,
      ...args.appNames.filter((n) => n !== "hub").map((n) => `${n}.${domain}`),
    ];

    for (const fqdn of fqdns) {
      const key = fqdn.replace(/\./g, "-");
      for (const type of ["A", "AAAA"] as const) {
        new aws.route53.Record(`dns-${type}-${key}`, {
          zoneId: args.zoneIds[domain],
          name: fqdn,
          type,
          aliases: [
            {
              name: args.distribution.domainName,
              zoneId: args.distribution.hostedZoneId,
              evaluateTargetHealth: false,
            },
          ],
        });
      }
    }
  }
}
