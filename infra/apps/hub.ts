import * as path from "path";
import * as pulumi from "@pulumi/pulumi";
import { AppContext, AppRegistration } from "../platform/types";
import { uploadSite } from "../platform/web-app";

/**
 * The hub: the landing page served at each root apex (billynorris.co.uk /
 * billynorris.gay). Static only — no API.
 */
export class HubApp extends pulumi.ComponentResource {
  public readonly registration: AppRegistration;

  constructor(name: string, ctx: AppContext, opts?: pulumi.ComponentResourceOptions) {
    super("billynorris:app:Hub", name, {}, opts);

    const distDir = path.resolve(__dirname, "..", "..", "apps", "hub", "dist");
    uploadSite(name, ctx.bucket, distDir, this);

    this.registration = { name, apiRoutes: [] };
    this.registerOutputs({ registration: this.registration });
  }
}
