import * as aws from "@pulumi/aws";
import * as apigateway from "@pulumi/aws-apigateway";
import * as pulumi from "@pulumi/pulumi";
import { configureDns } from "./dns";

const api = new apigateway.RestAPI("api", {
    routes: [
        // Serve an entire directory of static content
        {
            path: "/",
            localPath: "www",
        },
    ],
});

const config = new pulumi.Config();
const domains = config.requireObject("domains") as Array<{fqdn: string; hostedZone: string;}>

domains.forEach((domain) => {
    const uniqueKey = domain.fqdn.toLowerCase().replace(/\./g, "-")

    const zone = aws.route53.getZoneOutput({ name: domain.hostedZone });
    const apiDomainName = configureDns(uniqueKey, domain.fqdn, zone.zoneId);
    
    const basePathMapping = new aws.apigateway.BasePathMapping(
        `api-domain-mapping-${uniqueKey}`,
        {
            restApi: api.api.id,
            stageName: api.stage.stageName,
            domainName: apiDomainName.domainName,
        },
    );
})

export const url = api.url;