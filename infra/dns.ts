import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const awsUsEast1 = new aws.Provider("aws-provider-us-east-1", { region: "us-east-1" });

export function configureDns(key: string, domain: string, zoneId: pulumi.Input<string>) {
    const sslCertificate = new aws.acm.Certificate(
        `ssl-cert-${key}`,
        {
            domainName: domain,
            validationMethod: "DNS",
        },
        { provider: awsUsEast1 },
    );
    
    const sslCertificateValidationDnsRecord = new aws.route53.Record(
        `ssl-cert-validation-dns-record-${key}`,
        {
            zoneId: zoneId,
            name: sslCertificate.domainValidationOptions[0].resourceRecordName,
            type: sslCertificate.domainValidationOptions[0].resourceRecordType,
            records: [sslCertificate.domainValidationOptions[0].resourceRecordValue],
            ttl: 3600
        },
    );
    const validatedSslCertificate = new aws.acm.CertificateValidation(
        `ssl-cert-validation-${key}`,
        {
            certificateArn: sslCertificate.arn,
            validationRecordFqdns: [sslCertificateValidationDnsRecord.fqdn],
        },
        { provider: awsUsEast1 },
    );

    const apiDomainName = new aws.apigateway.DomainName(`api-domain-name-${key}`, {
        certificateArn: validatedSslCertificate.certificateArn,
        domainName: domain,
    });

    new aws.route53.Record(`api-dns-${key}`, {
        zoneId: zoneId,
        type: "A",
        name: domain,
        aliases: [{
            name: apiDomainName.cloudfrontDomainName,
            evaluateTargetHealth: false,
            zoneId: apiDomainName.cloudfrontZoneId,
        }],
    });

    return apiDomainName;
}