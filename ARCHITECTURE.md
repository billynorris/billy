# Architecture

One Pulumi application deploys a multi-app platform behind a **single CloudFront
distribution**, serving every app and both domains.

```
        ONE CloudFront distribution
        aliases: billynorris.co.uk, *.billynorris.co.uk,
                 billynorris.gay,   *.billynorris.gay
        cert:    one multi-SAN ACM certificate (us-east-1)
                          │
            CloudFront Function (viewer-request)
            Host → app prefix  +  SPA fallback
                          │
   ┌──────────────────────┼───────────────────────────────┐
   │ default behavior     │ /api/classes/*    │ /api/lifting/*
   ▼                      ▼                   ▼
 S3 (one bucket)     API Gateway v2      API Gateway v2
   /hub/*            → Lambda (TS)       → Lambda (TS)
   /classes/*          classes-api          lifting-api
   /lifting/*          + EventBridge        + Hevy + Claude
```

## How routing works

CloudFront selects a cache behavior from the **original** request path, so:

- **`/api/<app>/*`** matches that app's ordered behavior → the app's own API
  Gateway origin. Each app's API stays isolated by *path* — no Lambda@Edge, no
  host-based origin selection.
- **everything else** hits the default behavior (the S3 bucket) with a
  [CloudFront Function](infra/platform/distribution.ts) attached. It reads the
  `Host` header, maps the subdomain label to an app (`apex`/`www` → `hub`), and
  rewrites the URI into that app's S3 key prefix — with SPA fallback to
  `index.html` for extension-less client routes.

Each app's frontend calls its API at the already-namespaced path
(`/api/classes/...`), so behavior selection just works.

## The `.gay` pride theme

`.gay` is the **same site** in a pride skin, not a redirect. The CloudFront
Function ignores the TLD (it keys off the subdomain label only), so
`lifting.billynorris.gay` serves the exact same bundle as `lifting.billynorris.co.uk`.
The theme is decided **client-side**: an inline `<head>` script sets
`data-theme="pride"` before paint when `location.hostname` ends in `.gay`
(see any app's `index.html` and `packages/ui`). No server or edge logic.

## Single distribution, pluggable apps

Adding an app is two lines in [`infra/index.ts`](infra/index.ts): construct its
component and include it in the `apps` array. Each app component
([`infra/apps/*.ts`](infra/apps)) is self-contained — it builds its own Lambdas,
API Gateway and uploads its frontend — and exposes an `AppRegistration`
(`{ name, apiRoutes }`). The platform assembles the **one** bucket, cert,
distribution and DNS from all registrations together. The distribution aliases
and the cert use apex + wildcard per domain, so adding an app never touches them.

## Platform building blocks (`infra/platform/`)

| File | Responsibility |
|------|----------------|
| `lambda.ts` | Language-agnostic Lambda builder. TypeScript implemented (esbuild); the `switch` is the single place to add Python/Go/Rust. |
| `web-app.ts` | `uploadSite` (S3 upload under `<app>/`) and `createHttpApi` (API Gateway v2 → Lambda). |
| `zones.ts` | Route53 hosted zone per root domain (managed in-stack); exports nameservers to delegate at the registrar. |
| `certificate.ts` | One multi-SAN ACM cert in us-east-1 + DNS validation. |
| `storage.ts` | The shared private S3 bucket. |
| `distribution.ts` | The CloudFront Function, the distribution, OAC + bucket policy. |
| `dns.ts` | A/AAAA alias records for every domain/subdomain. |
| `types.ts` | `AppRegistration`, `ApiRoute`, `AppContext`. |

## Lambda runtimes

The builder packages **TypeScript** today (bundled to a single CJS file with
esbuild; the AWS SDK v3 is kept external since the Node 20 runtime provides it).
Other languages plug in at the `switch` in `platform/lambda.ts` — each branch
just needs to produce a code archive + runtime + handler. Apps can mix runtimes
freely since each is its own Lambda.

## Auth

All services share **HTTP Basic** auth. Credentials live in an in-repo users
registry (`packages/config/users.json`, default user `billy`) — deliberately
weak. The server middleware `@billynorris/api-auth` validates `Authorization:
Basic …` against it.

Sign-in is **centralised at the hub**. The hub renders the one `LoginGate`
(`@billynorris/ui`); on submit it stores the credential in a cookie scoped to the
**registrable domain** (`.billynorris.co.uk` / `.billynorris.gay`), so every
subdomain app reads the same credential without re-entry. Apps wrap themselves in
`AuthGuard` instead of prompting: with no shared credential — or after any API
call 401s — they bounce the user to the hub (`?return=<app-url>`, `?expired=1`),
which signs them in and sends them back. `authedFetch` attaches the credential to
every call. One credential works across every service; the cookie is per TLD, so
`.co.uk` and `.gay` sign in independently (matching the per-TLD theme). On
localhost (single host, no subdomains) `AuthGuard` falls back to a local
`LoginGate` for standalone dev. Health-check endpoints are left open.

## Data

- **Classes** persists to **DynamoDB** (source of truth for queued/booked
  classes). A single recurring EventBridge schedule drives a poller that books
  due classes — replacing the old one-schedule-per-booking pattern. See
  [apps/classes/README.md](apps/classes/README.md).
- **Lifting** (Lift Coach) reads training history from **Hevy**, choosing a
  source per authenticated user: the consumer **user API** (per-user bearer
  token) when the user has `config.hevy`, else the global **Pro API key**, else
  mock data. Rotated per-user Hevy tokens are persisted in a single **DynamoDB**
  table (`lifting-hevy`, generic `PK`/`SK` single-table design) because
  `users.json` is bundled read-only and Hevy rotates the refresh token; the
  computed dataset is cached per user in the warm Lambda container.
- No relational database.

## Deploy notes

- Secrets are read from the deploy environment (see `.env.example`) and injected
  as Lambda env vars by the app components.
- `pnpm build` must precede `pulumi up` — `uploadSite` reads each app's `dist/`.
- ACM certs for CloudFront must be in **us-east-1** (a dedicated provider); all
  other resources use the configured region (`eu-west-2`).
- **First deploy is two-phase** because zones are managed in-stack and ACM uses
  DNS validation:
  1. `pulumi up --target` the two `Zone` resources to create just the hosted
     zones, then `pulumi stack output nameservers`.
  2. Set those NS at your registrar and wait for propagation (`dig NS …`).
  3. `pulumi up` the rest — the cert now validates and the distribution creates.
  Subsequent deploys are a single `pulumi up`.
