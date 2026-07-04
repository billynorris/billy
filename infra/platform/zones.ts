import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface HostedZones {
  /** domain -> hosted zone id (for cert validation + alias records). */
  zoneIds: Record<string, pulumi.Output<string>>;
  /** domain -> the 4 NS records to set at your registrar to delegate the zone. */
  nameServers: Record<string, pulumi.Output<string[]>>;
}

/**
 * Create a Route53 public hosted zone per root domain. The zones are managed in
 * this stack; export `nameservers` and set them at your registrar to delegate.
 *
 * Note on first deploy: ACM uses DNS validation, so the cert won't issue (and
 * the distribution won't create) until the registrar delegates to these zones.
 * Create the zones first (`pulumi up --target` the Zone resources), set the NS
 * at the registrar, wait for propagation, then run the full `pulumi up`.
 */
export function createHostedZones(rootDomains: string[]): HostedZones {
  const zoneIds: Record<string, pulumi.Output<string>> = {};
  const nameServers: Record<string, pulumi.Output<string[]>> = {};

  for (const domain of rootDomains) {
    const zone = new aws.route53.Zone(`zone-${domain.replace(/\./g, "-")}`, {
      name: domain,
      comment: "Managed by Pulumi (billynorris platform)",
    });
    zoneIds[domain] = zone.zoneId;
    nameServers[domain] = zone.nameServers;
  }

  return { zoneIds, nameServers };
}
