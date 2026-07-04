import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { createSiteBucket } from "./platform/storage";
import { createHostedZones } from "./platform/zones";
import { createCertificate } from "./platform/certificate";
import { createDistribution } from "./platform/distribution";
import { createDnsRecords } from "./platform/dns";
import { AppContext } from "./platform/types";

import { HubApp } from "./apps/hub";
import { ClassesApp } from "./apps/classes";
import { LiftingApp } from "./apps/lifting";

const cfg = new pulumi.Config();
const rootDomains = cfg.requireObject<string[]>("rootDomains");
const region = aws.config.requireRegion().toString();

// ACM certs for CloudFront must live in us-east-1.
const usEast1 = new aws.Provider("us-east-1", { region: "us-east-1" });

// Route53 hosted zones per root domain, managed in this stack. Export their
// nameservers (below) and set them at your registrar to delegate the domains.
const { zoneIds, nameServers } = createHostedZones(rootDomains);

// One shared bucket for every app's static build.
const bucket = createSiteBucket();
const ctx: AppContext = { bucket, region, rootDomains };

// ---------------------------------------------------------------------------
// Apps — each is a self-contained, pluggable component. Adding an app is two
// lines: instantiate it and include it in `apps`.
// ---------------------------------------------------------------------------
const apps = [
  new HubApp("hub", ctx),
  new ClassesApp("classes", ctx),
  new LiftingApp("lifting", ctx),
];
const registrations = apps.map((a) => a.registration);

// One multi-SAN cert + one distribution + DNS, assembled from all apps.
const cert = createCertificate(rootDomains, zoneIds, usEast1);
const aliases = rootDomains.flatMap((d) => [d, `*.${d}`]);

const distribution = createDistribution({
  bucket,
  certificateArn: cert.arn,
  aliases,
  apps: registrations,
  rootDomains,
});

createDnsRecords({
  rootDomains,
  appNames: registrations.map((r) => r.name),
  zoneIds,
  distribution,
});

// Set these at your registrar (per domain) to delegate DNS to Route53.
export const nameservers = nameServers;
export const distributionDomain = distribution.domainName;
export const siteBucket = bucket.bucket;
export const urls = rootDomains.flatMap((d) => [
  `https://${d}`,
  ...registrations.filter((r) => r.name !== "hub").map((r) => `https://${r.name}.${d}`),
]);
