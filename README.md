# billynorris platform

A small multi-app platform served under **billynorris.co.uk** and **billynorris.gay**,
deployed as a single Pulumi application onto AWS (S3 + one CloudFront distribution +
Lambda + API Gateway).

- **hub** — landing page at the apex of each domain
- **classes** — auto-book gym classes the instant the window opens
- **lifting** — Lift Coach: strength, volume & muscle-balance analytics from Hevy

`billynorris.gay` is the **same site in a pride skin** — not a redirect. The theme is
chosen client-side from the hostname (zero extra infra).

See **[ARCHITECTURE.md](ARCHITECTURE.md)** for how it all fits together.

## Layout

```
infra/            Pulumi app (one stack deploys everything)
  platform/       reusable building blocks (cert, bucket, distribution, dns, lambda)
  apps/           pluggable per-app components (hub, classes, lifting)
apps/
  hub/            landing SPA (React + Vite)
  classes/        classes SPA  +  api/  (Hono Lambda, TS)
  lifting/        Lift Coach SPA  +  api/  (Hono Lambda, TS)
packages/
  ui/             shared design system + pride theme
  lifting-shared/ Lift Coach domain model + API DTOs
```

## Develop

```bash
pnpm install
pnpm -r typecheck          # typecheck every workspace
pnpm --filter @billynorris/classes-web dev   # run an app locally (Vite)
```

## Deploy

Secrets are read from your environment at deploy time (see `.env.example`).

```bash
# build all SPAs, then apply infra (uploads builds + provisions AWS)
pnpm deploy            # == pnpm build && pulumi up (stack: prod)

# or step by step
pnpm build
pnpm --filter @billynorris/infra preview
pnpm --filter @billynorris/infra up
```

> `pnpm build` must run before `pulumi up` — the infra uploads each app's `dist/`
> to S3. The deploy script does this for you.
