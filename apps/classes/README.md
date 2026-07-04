# classes

Auto-book gym classes the instant the booking window opens. Served at
`classes.billynorris.co.uk` (and `.gay`). An SPA + JSON API (the redesign of an
earlier server-rendered Python prototype).

## Pieces

- **`/` (this dir)** — `@billynorris/classes-web`, a React + Vite SPA: pick a
  club, browse classes, queue auto-books, see/cancel your bookings. Behind an
  `AuthGuard` (sign-in is centralised at the hub); all calls use `authedFetch`
  (Basic auth).
- **`api/`** — `@billynorris/classes-api`, a single Hono Lambda with **two modes**:
  - **HTTP** (API Gateway): `GET /clubs`, `GET /classes`, `GET /bookings`,
    `POST /autobook`, `DELETE /bookings/:id`. Basic auth on everything except
    `/health`.
  - **Recurring poller**: a `{ poll: true }` payload (from one EventBridge
    schedule, every minute) books due classes.

## Scheduling (the coherent pattern)

Instead of creating one EventBridge schedule per booking (which made the console
an incoherent list), there is **one** recurring schedule. It invokes the poller
every minute; the poller (`api/src/scheduler.ts`):

1. queries DynamoDB for `queued` bookings whose window opens within ~75s,
2. atomically claims each (`queued → processing`, so overlapping runs can't
   double-book),
3. **syncs to the gym server clock** (HTTP `Date` header), waits until the exact
   open moment, books with retries,
4. writes the outcome back (`booked` / `failed`).

**DynamoDB is the source of truth** for what's queued/booked (`api/src/bookings.ts`):
table keyed by `classId`, with a `status`+`bookingOpens` GSI the poller queries.

## Multi-club

No hardcoded club. `GET /clubs` lists clubs (derived from class data across
clubs, always including the configured default) and returns `defaultClubId`;
`GET /classes?clubIds=…` filters (omit for all clubs). The UI pre-selects the
default club and lets you change the filter. Per-user config in `users.json`:
`defaultClubId` (the pre-selected club, e.g. 39) and optional `clubIds` (narrows
which clubs are ever queried; empty = all).

> Club discovery uses the class API. If the gym requires a club filter on that
> endpoint (so an unfiltered query can't return every club), the dropdown shows
> the default club plus any discoverable ones — point me at a dedicated clubs
> endpoint and I'll use it directly.

## Bookings (from DynamoDB)

`GET /bookings` lists stored bookings; `GET /bookings?scope=upcoming` returns
only classes starting from now. The UI shows an "Upcoming bookings" panel with
live status (queued / processing / booked / failed) and cancel.

## Config & auth

- **Gym creds are per-user**, in `packages/config/users.json` (`token` or
  `id` + `sig`, optional `clubIds`). Both the HTTP API (the authenticated
  caller's config) and the poller (each booking's stored `userId`) build their
  gym client from it — no env vars.
- Login: HTTP Basic against the same `users.json` (default user `billy`). One
  credential works across all billynorris services.
