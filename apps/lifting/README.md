# lifting (Lift Coach)

A personal training-analytics dashboard — a "coaching" view over your lifting
history — served at `lifting.billynorris.co.uk` (and `.gay`). Data comes from
[Hevy](https://www.hevyapp.com/); nothing user-facing references the provider.

## Pieces

- **`/` (this dir)** — `@billynorris/lifting-web`, a React + Vite SPA (Recharts)
  with five views: Overview, Exercises, Volume, Balance, History.
- **`api/`** — `@billynorris/lifting-api`, a Hono Lambda exposing `/api/lifting/*`:
  - `GET /summary` — headline numbers (workouts, volume, streak, recent PRs)
  - `GET /exercises` — per-lift list with trend
  - `GET /exercises/:id/progression` — estimated-1RM series + trend note
  - `GET /volume` — weekly tonnage / sets + per-muscle breakdown
  - `GET /balance` — set distribution + push/pull ratio + staleness
  - `GET /history` — sessions tagged by goal (strength/hypertrophy/endurance/mixed)
  - `GET /heatmap` — weekly working-sets-per-muscle grid
  - `GET /analysis` — AI coaching card (Claude, or a rule-based fallback)
- **`packages/lifting-shared`** — the source-agnostic domain model + API DTOs
  shared by the web and API.

The Hevy integration is isolated in `api/src/provider/` (+ `api/src/hevy/` for
auth); the insight engine in `api/src/insights/` only ever sees the normalized
domain model.

## Hevy data sources (per user)

Each request resolves its data source from the authenticated user:

1. **Consumer "user API"** (primary) — when the user has `config.hevy` in
   `users.json`. This mirrors what they see in the Hevy app. Auth is a per-user
   bearer token: we seed a long-lived **refresh token** (no in-app login, which
   would need reCAPTCHA), refresh it for short-lived access tokens, and persist
   the rotated pair in DynamoDB (`api/src/hevy/`). User-API workouts identify
   exercises by title only, so muscle groups are joined from the Pro template
   library when a Pro key is present (otherwise "other").
2. **Pro API key** (`HEVY_API_KEY`, fallback) — the global Hevy Pro key, used
   when a user has no `config.hevy`.
3. **Mock** — with neither configured, a deterministic dataset so the app runs
   offline.

## Config

Per-user, in `packages/config/users.json` under `config.hevy`:

- `refreshToken` — long-lived Hevy refresh token (seed; rotated copies live in
  DynamoDB).
- `username` — Hevy username (needed by the workouts endpoint; auto-resolved via
  `/user/account` if omitted).

Server-side env (see root `.env.example`):

- `HEVY_API_KEY` — global Hevy **Pro** key (fallback). Empty ⇒ user token or mock.
- `HEVY_TABLE` — DynamoDB token-store table name (injected by infra).
- `ANTHROPIC_API_KEY` — optional; enables the Claude coaching card.
- `ANTHROPIC_MODEL` — optional model override (default `claude-opus-4-8`).

A single DynamoDB table (`lifting-hevy`, generic `PK`/`SK` single-table design)
persists rotated per-user tokens. Auth beyond Hevy is the shared platform Basic
auth (`@billynorris/api-auth`).

## Coach view (read-only)

A coach is just another user in `users.json` whose `config.lifting.viewUserId`
points at the person they coach:

```json
{ "id": "coach", "username": "coach", "password": "…",
  "config": { "lifting": { "viewUserId": "billy" } } }
```

They sign in (shared platform login) and every lifting endpoint resolves the
data subject via `resolveLiftingSubject` — serving the coached user's data
instead of their own. `GET /context` reports `{ subjectName, viewing }`, which
drives a "Coach view — showing <name>'s lifts" banner in the UI. Lifting is
read-only, so no write authorization is needed.

> Limitation: the platform login is shared across apps, so a coach account can
> technically reach other apps' APIs (they just have no config there). Per-app
> access control / hub app-filtering is a future enhancement.
