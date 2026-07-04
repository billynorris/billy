# Design Specification: Personal Training Analytics Platform

> **Purpose:** This document is a complete, implementation-ready specification for an AI to build a personal training analytics web application. It must be followed precisely. The app replaces the existing `apps/lifting` workspace in the `billynorris` monorepo.

---

## 1. Overview & Goals

### What to Build

A full-stack training analytics dashboard that pulls workout data from a third-party fitness API (currently Hevy), stores and processes it server-side, and presents rich analytics to two types of users:

- **Athlete** — views their own workout data, progress charts, PRs, muscle heatmaps, and coach-set goals
- **Coach** — views any athlete's data (read-only), leaves session comments, and manages athlete goals

### Core Design Principles

1. **Provider-agnostic UI** — no reference to "Hevy" anywhere in the UI, component names, or API response bodies. Use generic terms: "workout," "session," "exercise."
2. **Single ID system — no dual IDs** — there is no internal UUID that shadows a provider ID. The backend uses Hevy IDs natively throughout (S3 files, DynamoDB, sync logic). A single `toPublicId()` transform at the API boundary converts provider IDs to opaque public IDs before any response is serialized. There is no mapping table and no `_sourceId` / `id` pair on any object.
3. **Provider abstraction layer** — a `ProviderClient` interface isolates all Hevy-specific logic. Swapping providers requires only a new implementation of this interface and a one-time re-sync.
4. **Server-side data ownership** — workout data is synced from the provider into S3 on a schedule. The frontend never calls the provider API directly.
5. **Monorepo conventions** — follow all existing patterns in the `billynorris` monorepo exactly: Pulumi IaC, Hono on Lambda, Vite + React 18 frontend, pnpm workspaces, HTTP Basic auth, shared packages.

### Display Name

The UI should display the name **"Training"** as the app title. This is defined as a single constant `APP_DISPLAY_NAME = "Training"` in `apps/lifting/src/constants.ts` and used everywhere it appears in the UI.

---

## 2. Repository Structure

This app lives in the existing monorepo at `/Users/billy/Projects/billynorris/billy`.

```
apps/
└── lifting/                        # ← Fully replaced (was a simpler app)
    ├── src/                        # Vite + React 18 frontend
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── constants.ts
    │   ├── api.ts                  # typed API client (same pattern as classes)
    │   ├── types.ts                # re-exports from lifting-shared
    │   ├── pages/
    │   │   ├── DashboardPage.tsx
    │   │   ├── ExercisesPage.tsx
    │   │   ├── HistoryPage.tsx
    │   │   ├── MusclesPage.tsx
    │   │   ├── GoalsPage.tsx
    │   │   └── coach/
    │   │       ├── CoachRosterPage.tsx
    │   │       └── CoachAthletePage.tsx
    │   ├── components/
    │   │   ├── shell/              # AppHeader, TabBar, AppShell
    │   │   ├── dashboard/          # all dashboard widgets
    │   │   ├── exercises/          # exercise list + detail
    │   │   ├── history/            # session list + detail
    │   │   ├── muscles/            # body map + muscle charts
    │   │   ├── goals/              # goal cards
    │   │   ├── coach/              # roster, comments, goal manager
    │   │   └── ui/                 # shared primitives
    │   ├── hooks/
    │   │   ├── useApi.ts           # generic fetch hook with auth
    │   │   ├── useDashboard.ts
    │   │   ├── useExercises.ts
    │   │   ├── useHistory.ts
    │   │   ├── useMuscles.ts
    │   │   └── useGoals.ts
    │   └── utils/
    │       └── units.ts            # kg ↔ lbs conversion
    ├── api/
    │   └── src/
    │       ├── index.ts            # Hono Lambda entry
    │       ├── env.ts
    │       ├── routes/
    │       │   ├── dashboard.ts
    │       │   ├── exercises.ts
    │       │   ├── history.ts
    │       │   ├── muscles.ts
    │       │   ├── goals.ts
    │       │   ├── comments.ts
    │       │   ├── coach.ts
    │       │   └── sync.ts         # manual sync trigger
    │       ├── analytics/          # all computation (PRs, trends, etc.)
    │       │   ├── personalRecords.ts
    │       │   ├── exerciseTrend.ts
    │       │   ├── volumeSeries.ts
    │       │   ├── muscleSeries.ts
    │       │   ├── hypertrophy.ts
    │       │   ├── activityHeatmap.ts
    │       │   ├── weeklyRhythm.ts
    │       │   ├── streaks.ts
    │       │   ├── summary.ts
    │       │   └── plateauDetection.ts
    │       ├── provider/           # abstraction layer
    │       │   ├── types.ts        # ProviderClient interface
    │       │   └── hevy.ts         # HevyProviderClient implementation
    │       ├── storage/
    │       │   ├── s3.ts           # S3 read/write helpers
    │       │   └── dynamo.ts       # DynamoDB helpers
    │       └── sync/
    │           └── syncUser.ts     # per-user sync logic
    ├── package.json
    └── vite.config.ts

packages/
└── lifting-shared/                 # ← Fully replaced
    └── src/
        ├── domain.ts               # WorkoutData, Exercise, Session, Set, etc.
        ├── dto.ts                  # All API response shapes
        └── index.ts                # barrel export

infra/
└── apps/
    └── lifting.ts                  # Pulumi ComponentResource (update this)
```

---

## 3. Infrastructure (Pulumi)

Update `infra/apps/lifting.ts` to provision:

### AWS Resources

| Resource                 | Configuration                                                      |
| ------------------------ | ------------------------------------------------------------------ |
| S3 bucket object prefix  | `lifting/` (static site, same shared bucket)                       |
| Lambda function          | `apps/lifting/api/src/index.ts`, `nodejs20.x`, 512 MB, 30s timeout |
| API Gateway HTTP         | catch-all `$default` route → Lambda                                |
| DynamoDB table           | `lifting-data`, PAY_PER_REQUEST, PK `(string)`, SK `(string)`      |
| DynamoDB table           | Existing `lifting-hevy` — keep as-is for Hevy auth tokens          |
| EventBridge Scheduler    | Rate: `rate(30 minutes)`, sends `{ "sync": true }` to Lambda       |
| Scheduler execution role | IAM role with `lambda:InvokeFunction` on the lifting Lambda        |

### Lambda Environment Variables

```
TABLE_NAME=lifting-data
HEVY_TABLE_NAME=lifting-hevy
DATA_BUCKET=<shared bucket name>
ANTHROPIC_API_KEY=<from .env>
```

### CloudFront Path Pattern

`/api/lifting/*` → API Gateway origin (cache disabled, all headers forwarded)

Static site served from S3 key prefix `lifting/` at `lifting.billynorris.co.uk`.

---

## 4. Data Architecture

### 4.1 S3 Layout

All keys under the shared data bucket:

```
lifting-data/
  <userId>/
    data.json          # complete normalized workout dataset
    sync-state.json    # sync cursor / metadata
```

#### `data.json` Schema

```typescript
interface UserDataFile {
  meta: {
    userId: string;
    syncedAt: string; // ISO 8601
    workoutCount: number;
    exerciseCount: number;
  };
  workouts: StoredWorkout[];
  exerciseTemplates: StoredExerciseTemplate[];
}

interface StoredWorkout {
  hevyId: string; // Hevy's workout ID — used natively as the primary key
  hevyUpdatedAt: string; // used to detect stale records during incremental sync
  title: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  durationSeconds: number;
  exercises: StoredExerciseInstance[];
}

interface StoredExerciseInstance {
  hevyTemplateId: string; // Hevy exercise template ID — primary key
  name: string; // denormalized; also used to derive the public exercise ID
  primaryMuscles: string[];
  secondaryMuscles: string[];
  sets: StoredSet[];
}

interface StoredSet {
  index: number;
  type: 'warmup' | 'normal' | 'failure' | 'dropset';
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
}

interface StoredExerciseTemplate {
  hevyId: string; // Hevy's exercise template ID — primary key for sync
  name: string; // human name; used to derive the public exercise ID
  category: string; // e.g. 'barbell', 'dumbbell', 'machine'
  primaryMuscles: string[];
  secondaryMuscles: string[];
  isCustom: boolean;
}
```

#### `sync-state.json` Schema

```typescript
interface SyncState {
  userId: string;
  firstSyncComplete: boolean;
  lastSyncAt: string; // ISO 8601 — used as `since` param for incremental sync
  lastFullSyncAt: string; // when last full re-sync was done
  workoutCount: number;
}
```

### 4.2 DynamoDB Schema (Table: `lifting-data`)

Single-table design with composite `PK` + `SK`.

| Entity        | PK                    | SK                                  | Attributes                                                                                                                              |
| ------------- | --------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Coach comment | `SESSION#<sessionId>` | `COMMENT#<isoTimestamp>#<authorId>` | `authorId`, `authorName`, `body`, `createdAt`                                                                                           |
| Athlete goal  | `USER#<userId>`       | `GOAL#<goalId>`                     | `goalId`, `exerciseId?`, `exerciseName?`, `type`, `target`, `unit`, `description`, `targetDate?`, `createdBy`, `createdAt`, `updatedAt` |

> Note: Hevy auth tokens remain in the existing `lifting-hevy` table as-is.

### 4.3 Public ID Derivation (No Mapping Table)

The backend stores and queries data using Hevy's native IDs directly. There is no separate internal UUID and no mapping table. Provider IDs are converted to public-facing IDs at the API boundary via two deterministic functions in `apps/lifting/api/src/ids.ts`:

```typescript
// Exercise templates: name-based slug (provider-agnostic)
// "Barbell Squat" → "barbell-squat"
// If you switch providers, the same exercise name produces the same slug.
export function exercisePublicId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Workouts/sessions: deterministic hash of the provider ID
// "hevy-workout-abc123" → "a3f8bc2d1e9f" (opaque, not obviously from Hevy)
// APP_ID_SALT is a deploy-time env var (set it once, never change it).
export function sessionPublicId(providerWorkoutId: string): string {
  return createHash('sha256')
    .update(providerWorkoutId + process.env.APP_ID_SALT)
    .digest('hex')
    .slice(0, 16);
}
```

**Reverse lookup:** Given a public session ID, find the matching Hevy record by re-deriving `sessionPublicId()` for each stored workout and comparing — O(n) over the user's S3 data, acceptable for a personal dataset.

**Provider migration:** If you switch providers, exercise slugs remain identical (they're name-derived). Session IDs will change (new provider IDs hash differently), which is acceptable — old session URLs break, but you're starting from a new data import.

**Rule:** Every API route handler MUST call `toPublicWorkout()` / `toPublicExercise()` helper functions before serializing responses. These helpers apply the transforms above to every ID field and ensure no raw Hevy IDs appear in API output. Add `APP_ID_SALT` to the Lambda env vars list.

---

## 5. Provider Integration & Sync

### 5.1 ProviderClient Interface

```typescript
// apps/lifting/api/src/provider/types.ts

interface ProviderWorkout {
  sourceId: string;
  sourceUpdatedAt: string;
  title: string;
  startTime: string;
  endTime: string;
  exercises: ProviderExerciseInstance[];
}

interface ProviderExerciseInstance {
  sourceTemplateId: string;
  sets: ProviderSet[];
}

interface ProviderSet {
  index: number;
  type: 'warmup' | 'normal' | 'failure' | 'dropset';
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  rpe: number | null;
}

interface ProviderExerciseTemplate {
  sourceId: string;
  name: string;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  isCustom: boolean;
}

interface ProviderSyncEvent {
  type: 'upsert' | 'delete';
  workoutSourceId: string;
  updatedAt: string;
}

interface ProviderClient {
  getAllWorkouts(): AsyncGenerator<ProviderWorkout[]>; // paginates all
  getWorkoutsSince(since: string): Promise<ProviderSyncEvent[]>; // incremental
  getWorkout(sourceId: string): Promise<ProviderWorkout>;
  getAllExerciseTemplates(): AsyncGenerator<ProviderExerciseTemplate[]>;
  getUserInfo(): Promise<{ displayName: string }>;
}
```

### 5.2 HevyProviderClient Implementation

```typescript
// apps/lifting/api/src/provider/hevy.ts
```

Implements `ProviderClient` using the Hevy API:

- **Auth:** `api-key` header on every request (value from `users.json` `providerApiKey` field)
- **Base URL:** `https://api.hevyapp.com`
- **Rate limiting:** Hevy limits are not published; implement exponential backoff on 429
- **`getAllWorkouts()`:** Paginates `GET /v1/workouts?page=N&pageSize=10` until `page * 10 >= totalWorkouts`. Yields each page's array.
- **`getWorkoutsSince(since)`:** Calls `GET /v1/workouts/events?since=<since>` — returns array of events indicating new/updated/deleted workout IDs
- **`getWorkout(sourceId)`:** Calls `GET /v1/workouts/<sourceId>`
- **`getAllExerciseTemplates()`:** Paginates `GET /v1/exercise_templates?page=N&pageSize=100`
- **`getUserInfo()`:** Calls `GET /v1/user/info`

### 5.3 Sync Job (Lambda Dual-Mode Handler)

The Lambda export handles two event shapes (same pattern as `apps/classes`):

```typescript
// apps/lifting/api/src/index.ts

export const handler = async (event: APIGatewayProxyEventV2 | SyncEvent) => {
  if (isSyncEvent(event)) {
    await runSyncJob();
    return;
  }
  return handle(app)(event); // Hono HTTP handler
};

function isSyncEvent(event: unknown): event is SyncEvent {
  return typeof event === 'object' && event !== null && 'sync' in event;
}
```

### 5.4 `runSyncJob()` Logic

Located in `apps/lifting/api/src/sync/syncUser.ts`:

```
For each user in users.json that has a `providerApiKey` field:
  1. Load sync-state.json from S3 (or default if not exists)
  2. Create HevyProviderClient with user's providerApiKey
  3. If !syncState.firstSyncComplete:
       a. Paginate getAllWorkouts() — yield page by page
       b. For each workout: assignInternalIds() → push to workouts array
       c. Paginate getAllExerciseTemplates() — build templates array
       d. Write data.json to S3
       e. Set firstSyncComplete=true, record lastSyncAt=now
  4. Else (incremental):
       a. events = await getWorkoutsSince(syncState.lastSyncAt)
       b. Load existing data.json from S3
       c. For each 'upsert' event:
            - Fetch full workout via getWorkout(event.workoutSourceId)
            - Find existing stored workout by hevyId
            - If found: update in-place (overwrite all fields, keep hevyId)
            - If not: append as new StoredWorkout (hevyId is the key)
       d. For each 'delete' event:
            - Remove workout with matching hevyId
       e. Also refresh any exercise templates whose hevyId appears in upserted workouts
       f. Write updated data.json back to S3
  5. Write updated sync-state.json to S3
```

**No ID assignment step.** The Hevy workout ID is stored directly as `hevyId`. The public-facing ID is derived on the fly at the API boundary via `sessionPublicId(hevyId)` — no UUID assignment, no mapping table.

### 5.5 users.json Changes

Add `providerApiKey` field to each user entry:

```json
{
  "id": "billy",
  "username": "billy",
  "password": "...",
  "role": "athlete",
  "providerApiKey": "...",
  "config": { ... }
}
```

Valid `role` values: `"athlete"` | `"coach"`. Coach users do NOT have a `providerApiKey`.

---

## 6. Authentication & Authorization

### Mechanism

HTTP Basic auth via `@billynorris/api-auth` middleware — identical to existing apps. No changes.

### Authorization Rules

| Route Pattern                             | Allowed Roles               |
| ----------------------------------------- | --------------------------- |
| All `GET /api/lifting/*`                  | `athlete`, `coach`          |
| `GET /api/lifting/athletes/:userId/*`     | `coach` only                |
| `POST /api/lifting/sessions/:id/comments` | `coach` only                |
| `POST/PUT/DELETE /api/lifting/goals*`     | `coach` only                |
| `POST /api/lifting/sync`                  | `athlete` only (syncs self) |

Role-checking middleware reads `c.get("user").role` after `basicAuth()` runs. If a `coach` tries to access a route without `?userId=` param where it's required, return 400. If an `athlete` tries a coach-only route, return 403.

**Coach viewing athlete data:** Coach can view any athlete's data by passing `?userId=<athleteId>` to any of the primary data routes (`/dashboard`, `/exercises`, `/history`, `/muscles`, `/goals`). The handler detects this param, verifies the requester is a coach, then loads that athlete's S3 data.

---

## 7. Backend API Design

### 7.1 Conventions

- Base path: `/api/lifting`
- All responses: `{ data: <payload> }` wrapper, or `{ error: string }` on failure
- Auth: `Authorization: Basic <base64>` header via shared cookie
- Weight units: always return **kg** from API; frontend converts to user preference
- Dates: always ISO 8601 strings
- Pagination: `?page=1&pageSize=20` query params; response includes `{ total, page, pageSize, data }`
- `_source*` fields: always stripped before response serialization

### 7.2 Route: Health

```
GET /api/lifting/health
```

Open (no auth). Returns `{ status: "ok", ts: <iso> }`.

### 7.3 Route: Me

```
GET /api/lifting/me
```

Returns current user info.

**Response:**

```typescript
{
  userId: string;
  displayName: string;
  role: 'athlete' | 'coach';
  syncedAt: string | null; // last data sync timestamp, null if never
}
```

### 7.4 Route: Sync (Manual Trigger)

```
POST /api/lifting/sync
```

Athletes only. Triggers `runSyncJob()` for the requesting user inline (not async — waits for completion, max Lambda timeout). Returns `{ syncedAt: string; workoutCount: number }`.

### 7.5 Route: Dashboard

```
GET /api/lifting/dashboard?userId=<id>&from=<iso>&to=<iso>
```

`userId` optional (coach use). `from`/`to` optional date range filter (ISO dates, default: all time).

**Response DTO:**

```typescript
interface DashboardDto {
  period: { start: string; end: string };
  kpis: {
    totalWorkouts: number;
    totalVolume: number; // sum of weight_kg * reps, all sets
    totalSets: number;
    currentStreak: number; // consecutive days with a workout
    longestStreak: number;
    recentPRCount: number; // PRs in last 30 days
    avgWeeklyWorkouts: number;
  };
  activityHeatmap: Array<{ date: string; count: number }>; // last 52 weeks
  volumeTrend: Array<{ week: string; volumeKg: number; sets: number }>;
  muscleTrend: Array<{ week: string } & Record<string, number>>; // dynamic muscle keys
  weeklySets: Array<{ muscle: string; avgSets: number; lastWeekSets: number }>;
  topExercises: Array<{
    id: string;
    name: string;
    totalVolumeKg: number;
    sessions: number;
  }>;
  prTrend: Array<{ week: string; count: number }>;
  weeklyRhythm: Array<{ day: string; sessions: number; avgVolumeKg: number }>;
  intensityBands: Array<{
    week: string;
    heavy: number;
    moderate: number;
    light: number;
  }>; // % by rep range
  recentPRs: Array<{
    exerciseId: string;
    exerciseName: string;
    type: 'weight' | 'oneRm' | 'volume';
    value: number;
    date: string;
  }>;
  plateauAlerts: Array<{
    exerciseId: string;
    exerciseName: string;
    weeksSincePR: number;
    trendStatus: string;
  }>;
  goals: GoalWithProgressDto[]; // active goals with current progress
  summaryText: string; // natural language 2-sentence summary
}
```

### 7.6 Route: Exercises

```
GET /api/lifting/exercises?userId=<id>&muscle=<group>&search=<query>&sort=<field>
```

**Response:**

```typescript
interface ExerciseListDto {
  exercises: Array<{
    id: string;
    name: string;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    totalSets: number;
    totalVolumeKg: number;
    lastPerformed: string;
    trendStatus: 'overloading' | 'stable' | 'plateau' | 'regressing' | 'new';
    currentMaxWeightKg: number;
    currentEstimated1RmKg: number;
    recentChangePercent: number; // % Δ in est 1RM over last 4 sessions
    sessionCount: number;
  }>;
}
```

```
GET /api/lifting/exercises/:id?userId=<id>
```

**Response:**

```typescript
interface ExerciseDetailDto {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  trendStatus: string;
  stats: {
    totalSets: number;
    totalVolumeKg: number;
    maxWeightKg: number;
    bestEstimated1RmKg: number;
    sessionCount: number;
    firstPerformed: string;
    lastPerformed: string;
  };
  progression: Array<{
    date: string;
    weightKg: number;
    reps: number;
    estimated1RmKg: number;
    isPR: boolean;
    prTypes: string[];
    sessionTitle: string;
    sessionId: string;
  }>;
}
```

### 7.7 Route: History

```
GET /api/lifting/history?userId=<id>&page=1&pageSize=20&from=<iso>&to=<iso>
```

**Response:**

```typescript
interface HistoryPageDto {
  page: number;
  pageSize: number;
  total: number;
  sessions: SessionSummaryDto[];
}

interface SessionSummaryDto {
  id: string;
  date: string;
  title: string;
  durationSeconds: number;
  totalVolumeKg: number;
  totalSets: number;
  exerciseCount: number;
  muscleGroups: string[];
  prCount: number;
  highlights: string[]; // e.g. "PR: Bench Press 100kg × 5"
  coachComments: CommentDto[];
}
```

```
GET /api/lifting/history/:sessionId?userId=<id>
```

**Response:**

```typescript
interface SessionDetailDto extends SessionSummaryDto {
  exercises: Array<{
    id: string; // template ID
    name: string;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    totalVolumeKg: number;
    sets: Array<{
      index: number;
      type: string;
      weightKg: number | null;
      reps: number | null;
      durationSeconds: number | null;
      distanceMeters: number | null;
      rpe: number | null;
      estimated1RmKg: number | null;
      isPR: boolean;
      prTypes: string[];
      analysisStatus: 'success' | 'warning' | 'danger' | 'neutral';
      analysisMessage: string;
    }>;
  }>;
}
```

### 7.8 Route: Muscles

```
GET /api/lifting/muscles?userId=<id>
```

**Response:**

```typescript
interface MuscleAnalysisDto {
  muscles: Array<{
    muscleId: string;
    name: string;
    displayName: string;
    weeklyVolumeSeries: Array<{ week: string; sets: number }>;
    currentWeekSets: number;
    avgWeeklySets: number;
    lastWorkedDate: string | null;
    stimulusLevel: 'below_mev' | 'mev' | 'mav' | 'mrv' | 'above_mrv';
    topExercises: Array<{ id: string; name: string; setContribution: number }>;
    lifetimeSets: number;
  }>;
}
```

### 7.9 Route: Goals

```
GET    /api/lifting/goals?userId=<id>
POST   /api/lifting/goals        (coach only, body: CreateGoalDto)
PUT    /api/lifting/goals/:id    (coach only, body: UpdateGoalDto)
DELETE /api/lifting/goals/:id    (coach only)
```

**Goal DTOs:**

```typescript
interface GoalWithProgressDto {
  id: string;
  targetUserId: string;
  exerciseId: string | null;
  exerciseName: string | null;
  type: 'one_rm' | 'volume_per_week' | 'frequency' | 'total_volume';
  targetValue: number;
  unit: string;
  description: string;
  targetDate: string | null;
  createdBy: string;
  createdAt: string;
  progress: {
    currentValue: number;
    percentComplete: number;
    trend: 'on_track' | 'at_risk' | 'achieved' | 'overdue' | 'not_started';
  };
}

interface CreateGoalDto {
  targetUserId: string;
  exerciseId?: string;
  type: 'one_rm' | 'volume_per_week' | 'frequency' | 'total_volume';
  targetValue: number;
  unit: string;
  description: string;
  targetDate?: string;
}
```

### 7.10 Route: Session Comments

```
POST   /api/lifting/sessions/:sessionId/comments   (coach only)
DELETE /api/lifting/comments/:commentId            (coach only)
```

```typescript
interface CommentDto {
  id: string; // COMMENT#<timestamp>#<authorId>
  sessionId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

interface CreateCommentDto {
  body: string;
}
```

### 7.11 Route: Coach Roster

```
GET /api/lifting/coach/athletes    (coach only)
```

**Response:**

```typescript
interface CoachRosterDto {
  athletes: Array<{
    userId: string;
    displayName: string;
    lastWorkoutDate: string | null;
    workoutsThisWeek: number;
    workoutsThisMonth: number;
    syncedAt: string | null;
    activeGoalCount: number;
    recentPRCount: number; // last 30 days
    trendSummary: string; // e.g. "Overloading on 3 exercises"
  }>;
}
```

---

## 8. Analytics Computation Layer

All computation is performed server-side in the Lambda. Functions live in `apps/lifting/api/src/analytics/`. They operate on `UserDataFile` (the parsed `data.json`) and return typed results.

### 8.1 Personal Records (`personalRecords.ts`)

**Input:** All sets for a given exercise template ID, sorted ascending by `startTime`.

**Output:** Same sets with added `isPR: boolean` and `prTypes: Array<'weight'|'oneRm'|'volume'>`.

**Algorithm:**

1. Maintain running max for `maxWeight`, `maxOneRm`, `maxSetVolume`.
2. Epley formula: `estimated1Rm = weight * (1 + reps / 30)`. Skip sets where reps > 30 (unreliable).
3. For each set (in chronological order): if any metric exceeds the running max, mark as PR and record which types improved.
4. Both "all-time gold PR" (ever seen) and "silver PR" (exceeds rolling 60-day max before this set) should be detectable. Tag with `prGold: boolean` and `prSilver: boolean`.

### 8.2 Exercise Trend Status (`exerciseTrend.ts`)

**Input:** All sessions for an exercise (each session = its best set's estimated 1RM).

**Output:** `'overloading' | 'stable' | 'plateau' | 'regressing' | 'new'`

**Algorithm:**

1. If fewer than 3 sessions: return `'new'`.
2. Take last 6 sessions' best estimated 1RM values.
3. Fit a simple linear trend (least-squares slope over the series).
4. Normalize slope as % change per session.
5. `> +1%/session` → `'overloading'`; `-3% to +1%` → `'stable'` or `'plateau'`; `< -3%` → `'regressing'`.
6. Distinguish `'stable'` vs `'plateau'`: plateau means no new all-time PR in last 4 sessions AND no upward trend.

**Also compute per-set analysis:**

- Compare each set to the same set number in the previous session
- If weight increased: `status='success'`, message: `"Up Xkg from last session"`
- If weight same, reps increased: `status='success'`, message: `"More reps at same weight"`
- If weight same, reps same: `status='neutral'`, message: `"Held"`
- If weight decreased: `status='warning'`, message: `"Down Xkg from last session"`

### 8.3 Volume Time Series (`volumeSeries.ts`)

**Input:** All workouts, optional date range.

**Output:** `Array<{ week: string; volumeKg: number; sets: number }>` — ISO week strings like `"2024-W03"`.

**Algorithm:**

1. Assign each workout to its ISO week.
2. Sum `weightKg * reps` across all sets in that week (skip sets where either is null).
3. Fill gaps (weeks with no workouts) as `{ week, volumeKg: 0, sets: 0 }`.

### 8.4 Muscle Volume Series (`muscleSeries.ts`)

**Input:** All workouts.

**Output:** Per-muscle `Array<{ week: string; sets: number }>`.

**Algorithm:**

1. For each workout's exercise, look up muscle groups from the exercise template.
2. Per set: primary muscles get `1.0` set credit; secondary muscles get `0.5`.
3. Aggregate by muscle and ISO week.
4. Muscle IDs to use (match to SVG body map): `chest`, `back_lats`, `back_upper`, `shoulders_front`, `shoulders_side`, `shoulders_rear`, `biceps`, `triceps`, `forearms`, `core`, `glutes`, `quads`, `hamstrings`, `calves`, `neck`, `traps`.

**Hevy → Internal Muscle Mapping:**

```
"chest"          → "chest"
"upper back"     → "back_upper"
"lats"           → "back_lats"
"shoulders"      → "shoulders_side"
"front delts"    → "shoulders_front"
"rear delts"     → "shoulders_rear"
"biceps"         → "biceps"
"triceps"        → "triceps"
"forearms"       → "forearms"
"abs"            → "core"
"obliques"       → "core"
"glutes"         → "glutes"
"quads"          → "quads"
"hamstrings"     → "hamstrings"
"calves"         → "calves"
"traps"          → "traps"
"neck"           → "neck"
```

### 8.5 Hypertrophy Stimulus (`hypertrophy.ts`)

**Input:** Last 4-week average weekly sets per muscle.

**Output:** Per-muscle `stimulusLevel: 'below_mev' | 'mev' | 'mav' | 'mrv' | 'above_mrv'`.

**Threshold table (sets/week, intermediate lifter):**

| Muscle        | MEV | MAV low | MAV high | MRV |
| ------------- | --- | ------- | -------- | --- |
| chest         | 8   | 12      | 20       | 22  |
| back_lats     | 8   | 14      | 22       | 25  |
| back_upper    | 6   | 10      | 18       | 20  |
| shoulders\_\* | 6   | 12      | 20       | 22  |
| biceps        | 8   | 14      | 20       | 26  |
| triceps       | 6   | 10      | 18       | 22  |
| quads         | 8   | 12      | 20       | 25  |
| hamstrings    | 6   | 10      | 20       | 25  |
| glutes        | 4   | 8       | 16       | 20  |
| calves        | 8   | 12      | 16       | 20  |
| core          | 4   | 8       | 16       | 20  |

### 8.6 Activity Heatmap (`activityHeatmap.ts`)

**Input:** All workouts.

**Output:** `Array<{ date: string; count: number }>` — one entry per calendar day with at least one workout, for the last 365 days. Dates formatted `YYYY-MM-DD`.

### 8.7 Weekly Rhythm (`weeklyRhythm.ts`)

**Input:** All workouts.

**Output:** `Array<{ day: 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'; sessions: number; avgVolumeKg: number }>`.

### 8.8 Streak Calculation (`streaks.ts`)

**Input:** All workout dates (deduplicated to one per day).

**Output:** `{ currentStreak: number; longestStreak: number; lastWorkoutDate: string }`.

**Algorithm:** Consecutive calendar-day counting. A gap of exactly 1 day continues the streak; 2+ days breaks it. Compute from most recent date backwards for current streak; scan full history for longest.

### 8.9 Dashboard Summary (`summary.ts`)

**Input:** Computed KPIs + trends.

**Output:** Plain English 2-sentence string.

**Rules-based template:**

- Compare this month's workouts vs last month (% change)
- Note most-improved exercise (highest trend score)
- Note if any PRs set this week

Example: `"Solid month — 14 sessions, up 17% from last month. Bench Press is trending upward with a new all-time 1RM this week."`

### 8.10 Plateau Detection (`plateauDetection.ts`)

**Input:** All exercises with their trend status and last PR date.

**Output:** Exercises where: `trendStatus === 'plateau'` AND `weeksSinceLastPR >= 3` AND `sessionCount >= 5` (ignore rarely-done exercises).

---

## 9. Frontend Design

### 9.1 Tech Stack

- Vite 5 + React 18 + TypeScript
- React Router v6 (HashRouter, `/#/path`)
- Recharts for all charts
- Tailwind CSS (import from `@billynorris/ui` theme, same as other apps)
- `lucide-react` for icons
- `motion` (Framer Motion) for transitions
- `@billynorris/ui` for `AuthGuard`, `LoginGate`, `authedFetch`

### 9.2 Route Structure

```
/#/                    → redirect to /#/dashboard
/#/dashboard           → DashboardPage
/#/exercises           → ExercisesPage
/#/exercises/:id       → ExercisesPage (with selected exercise)
/#/history             → HistoryPage
/#/history/:sessionId  → HistoryPage (with expanded session)
/#/muscles             → MusclesPage
/#/goals               → GoalsPage
/#/coach               → CoachRosterPage    (role: coach only)
/#/coach/:userId       → CoachAthletePage   (role: coach only)
```

### 9.3 App Shell

#### `App.tsx`

Root component. Wrapped in `AuthGuard`. Reads `GET /api/lifting/me` to determine role. Renders `AppShell` with role passed as context.

#### `AppShell.tsx`

Renders `AppHeader` + `<Outlet>` for React Router routes.

#### `AppHeader.tsx`

- Left: `APP_DISPLAY_NAME` text (configurable constant)
- Center: `TabBar` (tabs depend on role)
- Right: calendar filter button, settings icon
- Coach header shows athlete breadcrumb when viewing athlete: "Viewing: Billy"
- Props: `role`, `activeTab`, `onTabChange`, `currentAthleteId?`

#### `TabBar.tsx`

Renders navigation tabs. Athlete sees: Dashboard, Exercises, History, Muscles, Goals. Coach sees: Roster (home), then athlete tabs when inside `/#/coach/:userId`.

### 9.4 Page: Dashboard (`DashboardPage.tsx`)

Calls `GET /api/lifting/dashboard` (with optional `?userId=` if coach context). Shows full analytics overview.

**Layout (CSS Grid):**

- Row 1: `KPIBar` (4 stat tiles)
- Row 2: `ActivityHeatmap` (full width)
- Row 3: `VolumeTrendChart` (60%) | `RecentPRsPanel` + `PlateauAlertPanel` (40%)
- Row 4: `MuscleTrendCard` (50%) | `WeeklySetsCard` (50%)
- Row 5: `TopExercisesCard` (50%) | `WeeklyRhythmCard` (50%)
- Row 6: `GoalProgressPanel` (full width, only if goals exist)
- Row 7: `IntensityBandsChart` (full width)
- Bottom: `DashboardSummaryCard`

#### `KPIBar.tsx`

Four `KPICard` components: **Total Workouts**, **Total Volume (kg)**, **Current Streak**, **PRs This Month**.

#### `KPICard.tsx`

Props: `label: string`, `value: number | string`, `subtitle?: string`, `trend?: number` (% change, shows colored arrow). Animated with `CountUp` on mount.

#### `ActivityHeatmap.tsx`

GitHub-style yearly contribution heatmap. 52 weeks × 7 days grid. Each cell colored by workout count (0 = empty, 1 = light, 2+ = darker). Shows year label on left, month labels across top. Hover tooltip: date + workout count.

Data: `dashboard.activityHeatmap`.

#### `VolumeTrendChart.tsx`

Recharts `LineChart`. X-axis: week labels. Y-axis: kg. Single line for total weekly volume. Shows last 26 weeks by default with a zoom control (3m / 6m / 1y / all). Tooltip shows week, volume, sets count.

#### `MuscleTrendCard.tsx`

Recharts `AreaChart` with stacked areas, one per muscle group. Color-coded by muscle. Toggle between area and bar chart. Shows last 12 weeks. Card header shows top 3 most-trained muscles.

#### `WeeklySetsCard.tsx`

Two view modes (toggle): **Heatmap** — grid of muscle rows × week columns, cell color intensity = set count. **Radar** — Recharts `RadarChart` with muscle groups on each axis, showing current week vs 4-week average.

#### `TopExercisesCard.tsx`

Recharts `BarChart` (horizontal). Top 8 exercises by total volume in the selected period. Bar color matches primary muscle group color. Click an exercise → navigate to `/#/exercises/:id`.

#### `WeeklyRhythmCard.tsx`

Recharts `RadarChart` with 7 axes (Mon–Sun). Shows session count per day. Secondary line for avg volume per day. Toggle between radar and bar chart.

#### `IntensityBandsChart.tsx`

Recharts `AreaChart` stacked. Three bands: Heavy (1–5 reps), Moderate (6–12 reps), Light (13+ reps). Shows % of sets in each band per week. Reveals training style changes over time.

#### `RecentPRsPanel.tsx`

List of last 10 PRs. Each shows: exercise name, type (Weight / 1RM / Volume), value + unit, date. Click → navigate to exercise.

#### `PlateauAlertPanel.tsx`

Collapsible panel (hidden if no plateaus). Lists exercises in plateau with week count since last PR. Each links to exercise detail.

#### `GoalProgressPanel.tsx`

Shows only when there are active goals. Grid of `GoalProgressBar` cards, one per goal. Shows target, current, % complete, trend badge.

#### `DashboardSummaryCard.tsx`

Full-width card at the bottom. Displays `summaryText` in a styled quote block.

### 9.5 Page: Exercises (`ExercisesPage.tsx`)

Calls `GET /api/lifting/exercises` on mount. Split-panel layout (desktop: 30%/70%, mobile: stacked).

#### `ExerciseListPanel.tsx`

- Search input: filters by exercise name (client-side)
- Sort dropdown: by Name / Volume / Last Performed / Trend
- Muscle filter chips: click to filter by muscle group
- Scrollable list of `ExerciseListRow`

#### `ExerciseListRow.tsx`

Props: `exercise: ExerciseListItem`, `isSelected: boolean`, `onClick`.

Renders: exercise name, primary muscle badge, trend status badge (color-coded), current max weight.

Trend badge colors: overloading=green, stable=blue, plateau=yellow, regressing=red, new=gray.

#### `ExerciseSummaryPanel.tsx`

Shown when an exercise is selected. Calls `GET /api/lifting/exercises/:id`.

Contains:

- `ExerciseOverviewCard` — stat tiles: Best Weight, Est. 1RM, Total Sets, Sessions, First/Last Date
- `ExerciseStatusCard` — trend status with explanation text
- `ExerciseProgressChart` — main chart

#### `ExerciseProgressChart.tsx`

Recharts `ComposedChart`. X-axis: date. Two Y-axes: left=weight (kg), right=est. 1RM.

- `Line` for estimated 1RM over time
- `Scatter` for individual sets (size proportional to reps)
- PR points rendered as special colored dots with a star marker

Zoom control: 3m / 6m / 1y / all. Tooltip on hover shows: date, weight, reps, est. 1RM, PR badge if applicable.

### 9.6 Page: History (`HistoryPage.tsx`)

Calls `GET /api/lifting/history?page=1&pageSize=20`.

#### `HistorySessionBlock.tsx`

Expandable card for a single session. Collapsed: shows date, title, duration, volume, exercise count, muscle group pills, PR count badge, coach comment count badge.

Expanded (click to expand): shows full exercise + set breakdown. Calls `GET /api/lifting/history/:sessionId` lazily when first expanded.

#### `HistorySessionHeader.tsx`

Renders: formatted date, workout title, duration (`Xh Ym`), total volume (`X kg`), muscle group colored dots, PR badge (`3 PRs`).

If coach is viewing: shows coach comment count and a "Add Comment" button.

#### `HistoryExerciseCard.tsx`

Card within an expanded session. Shows exercise name, set count, total volume, best set. Expands to `HistorySetTable`.

#### `HistorySetTable.tsx`

Table rows. Columns: Set #, Type (W/N/F/D badge), Weight, Reps, Est. 1RM, RPE, Analysis status icon + tooltip.

PR rows highlighted with colored background. Analysis tooltip on hover (status + message).

#### `HistoryPaginationControls.tsx`

Previous/Next page buttons. Shows "Page X of Y" and total session count.

#### `SessionCommentPanel.tsx`

Rendered inside expanded `HistorySessionBlock` when coach is viewing. Shows thread of comments. Coach input at bottom.

#### `CommentInput.tsx`

Textarea + submit button. Calls `POST /api/lifting/sessions/:id/comments`. Optimistic update.

### 9.7 Page: Muscles (`MusclesPage.tsx`)

Calls `GET /api/lifting/muscles`. Two-panel layout: body map (left) + detail (right).

#### `BodyMapPanel.tsx`

SVG body map, interactive. Two views: front and back (toggle). Gender selector (male/female) — renders appropriate SVG.

Each muscle group SVG path is colored based on its `stimulusLevel`:

- below_mev: gray (inactive)
- mev: light tint (theme hue)
- mav: medium
- mrv: bright
- above_mrv: intense / warning color

Click a muscle → select it. Hover → tooltip with muscle name + current week sets.

**SVG Body Map Assets:** Use the SVG body map files from LiftShift (`/Users/billy/Projects/randomgithub/LiftShift/frontend/public/`) — specifically the male/female front/back SVGs. Copy these into `apps/lifting/src/assets/bodymaps/`. These are open-source assets.

**Muscle path IDs in the SVG:** Each `<path>` has an `id` attribute matching the internal muscle IDs (e.g. `id="chest"`, `id="quads"`).

#### `MuscleDetailPanel.tsx`

Shown when a muscle is selected. Contains:

- `MuscleStatBar` — current week sets, avg weekly sets, last worked date, stimulus level badge
- `MuscleVolumeChart` — weekly set count line chart (26 weeks)
- `MuscleExerciseList` — exercises targeting this muscle, sorted by set contribution

#### `MuscleVolumeChart.tsx`

Recharts `LineChart`. X: week. Y: set count. Reference lines for MEV, MAV thresholds (dashed horizontal lines with labels). Tooltip shows week + sets.

#### `MuscleExerciseList.tsx`

List of exercises. Each row: name, set contribution (% of muscle's total sets), trend badge. Click → navigate to `/#/exercises/:id`.

### 9.8 Page: Goals (`GoalsPage.tsx`)

Calls `GET /api/lifting/goals`. Athlete sees their goals. Coach sees full goal management UI.

#### `GoalCard.tsx`

Props: `goal: GoalWithProgressDto`.

Shows: goal description, exercise name (if exercise-specific), target value + unit, target date (if set), progress bar, current value, trend badge. Color-coded: achieved=green, on_track=blue, at_risk=yellow, overdue=red.

#### `GoalProgressBar.tsx`

Visual bar showing `percentComplete`. Animated on mount. Shows milestone markers if target has a date.

#### Athlete view

Grid of `GoalCard` components. If no goals: empty state "Your coach hasn't set any goals yet."

#### Coach view (when on `/#/goals` viewing an athlete)

Same grid + **Add Goal** button. Click → `GoalFormModal`.

#### `GoalFormModal.tsx`

Form fields: Exercise (searchable dropdown, or leave blank for general goal), Goal Type (dropdown), Target Value (number input), Unit (auto-filled from type), Description (text area), Target Date (date picker, optional). Submit → `POST /api/lifting/goals`.

### 9.9 Page: Coach Roster (`CoachRosterPage.tsx`)

Only rendered for role=`coach`. Calls `GET /api/lifting/coach/athletes`.

#### `CoachRosterPage.tsx`

Grid of `AthleteCard` components. Header shows total athlete count.

#### `AthleteCard.tsx`

Shows: athlete display name, last workout date (relative: "3 days ago"), workouts this week, active goal count, recent PR count, trend summary text. Click → navigate to `/#/coach/:userId`.

### 9.10 Page: Coach Athlete View (`CoachAthletePage.tsx`)

When coach navigates to `/#/coach/:userId`, this page renders. It:

1. Sets a `coachViewContext` (React Context) with `{ targetUserId, targetDisplayName }`
2. Renders the same `TabBar` as athlete view (Dashboard, Exercises, History, Muscles, Goals)
3. All API calls within sub-pages automatically append `?userId=<targetUserId>` (handled in `useApi.ts` via context)
4. Header shows breadcrumb: "← Roster / Billy"

All athlete pages (Dashboard, Exercises, History, Muscles, Goals) work identically in coach view — they just pass the `userId` context. No duplication of page components.

### 9.11 Shared UI Components (`components/ui/`)

#### `CountUp.tsx`

Animates a number from 0 to its value over 800ms on first render. Uses `requestAnimationFrame`. Props: `value: number`, `decimals?: number`, `prefix?: string`, `suffix?: string`.

#### `Sparkline.tsx`

Mini Recharts `LineChart` (no axes, no tooltip). Props: `data: number[]`, `color?: string`, `height?: number`.

#### `ChartSkeleton.tsx`

Gray animated placeholder div at chart dimensions. Shows while data loads.

#### `SegmentControl.tsx`

Row of buttons, one active at a time. Props: `options: { label; value }[]`, `value`, `onChange`.

#### `Select.tsx`

Styled `<select>` wrapper. Props: `options: { label; value }[]`, `value`, `onChange`.

#### `Tooltip.tsx`

Portal-rendered tooltip. Appears on hover. Props: `content: ReactNode`, `children: ReactNode`.

#### `Badge.tsx`

Colored pill. Props: `label: string`, `variant: 'green'|'yellow'|'red'|'blue'|'gray'`.

#### `EmptyState.tsx`

Centered illustration + message for empty data states. Props: `title: string`, `subtitle?: string`.

#### `LoadingSpinner.tsx`

Centered spinner shown while pages load initial data.

### 9.12 API Client (`api.ts`)

Single `api` object (same pattern as `apps/classes/src/api.ts`). Uses `authedFetch` from `@billynorris/ui`.

```typescript
const api = {
  getMe: () => get<MeDto>('/api/lifting/me'),
  getDashboard: (params) => get<DashboardDto>('/api/lifting/dashboard', params),
  getExercises: (params) =>
    get<ExerciseListDto>('/api/lifting/exercises', params),
  getExercise: (id, params) =>
    get<ExerciseDetailDto>(`/api/lifting/exercises/${id}`, params),
  getHistory: (params) => get<HistoryPageDto>('/api/lifting/history', params),
  getSession: (id, params) =>
    get<SessionDetailDto>(`/api/lifting/history/${id}`, params),
  getMuscles: (params) =>
    get<MuscleAnalysisDto>('/api/lifting/muscles', params),
  getGoals: (params) => get<GoalsDto>('/api/lifting/goals', params),
  createGoal: (body) => post<GoalWithProgressDto>('/api/lifting/goals', body),
  updateGoal: (id, body) =>
    put<GoalWithProgressDto>(`/api/lifting/goals/${id}`, body),
  deleteGoal: (id) => del(`/api/lifting/goals/${id}`),
  addComment: (sessionId, body) =>
    post<CommentDto>(`/api/lifting/sessions/${sessionId}/comments`, body),
  deleteComment: (id) => del(`/api/lifting/comments/${id}`),
  getCoachAthletes: () => get<CoachRosterDto>('/api/lifting/coach/athletes'),
  triggerSync: () => post<SyncResultDto>('/api/lifting/sync'),
};
```

### 9.13 State Management

No external state library. Each page component manages its own state via `useState` + custom hooks. No cross-page shared state except:

- `UserContext` — `{ userId, displayName, role }` from `GET /me`, provided at root
- `CoachViewContext` — `{ targetUserId, targetDisplayName }` when coach is viewing an athlete

### 9.14 Theming

Import and reuse `@billynorris/ui` theme CSS. No additional theme system needed. The app uses the same CSS custom properties as other apps in the platform.

---

## 10. Shared Package: `lifting-shared`

Replace the existing `packages/lifting-shared/src/` entirely.

### `domain.ts`

Internal domain types for Lambda use only (not exported to frontend):

- `WorkoutData` = `UserDataFile` from section 4.1
- `StoredWorkout`, `StoredSet`, etc.

### `dto.ts`

All response DTOs from section 7. These are used by both the Lambda (to type responses) and the frontend (to type API calls).

Export everything from `index.ts`.

---

## 11. Environment Variables

### Lambda Environment (set via Pulumi from `.env`)

| Variable            | Value                       | Purpose                                                                                     |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| `TABLE_NAME`        | `lifting-data`              | DynamoDB table name                                                                         |
| `HEVY_TABLE_NAME`   | `lifting-hevy`              | DynamoDB table for auth tokens                                                              |
| `DATA_BUCKET`       | `<shared bucket name>`      | S3 bucket for data files                                                                    |
| `APP_ID_SALT`       | `<random secret, set once>` | Salt for `sessionPublicId()` hash — generate once with `openssl rand -hex 32`, never rotate |
| `ANTHROPIC_API_KEY` | `<from .env>`               | Optional: AI-generated coaching card                                                        |
| `ANTHROPIC_MODEL`   | `claude-haiku-4-5-20251001` | Model for coaching card generation                                                          |

### `users.json` User Object Shape

```typescript
interface User {
  id: string;
  username: string;
  password: string; // plain text for now (matches existing system)
  role: 'athlete' | 'coach';
  providerApiKey?: string; // Hevy API key — athletes only
  displayName?: string; // fallback to username if absent
  config?: Record<string, unknown>;
}
```

---

## 12. S3 Storage Helpers (`storage/s3.ts`)

```typescript
async function readUserData(userId: string): Promise<UserDataFile | null>;
async function writeUserData(userId: string, data: UserDataFile): Promise<void>;
async function readSyncState(userId: string): Promise<SyncState | null>;
async function writeSyncState(userId: string, state: SyncState): Promise<void>;
```

S3 key format: `lifting-data/<userId>/data.json` and `lifting-data/<userId>/sync-state.json`.

Use `@aws-sdk/client-s3` with `GetObjectCommand` and `PutObjectCommand`. Content-Type: `application/json`. The bucket name comes from `process.env.DATA_BUCKET`.

---

## 13. DynamoDB Helpers (`storage/dynamo.ts`)

```typescript
async function getComments(sessionId: string): Promise<CommentRecord[]>;
async function addComment(comment: CommentRecord): Promise<void>;
async function deleteComment(pk: string, sk: string): Promise<void>;
async function getGoals(userId: string): Promise<GoalRecord[]>;
async function putGoal(goal: GoalRecord): Promise<void>;
async function deleteGoal(userId: string, goalId: string): Promise<void>;
```

Use `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient`. Table name from `process.env.TABLE_NAME`.

---

## 14. Pulumi Infrastructure Update (`infra/apps/lifting.ts`)

Update the existing `LiftingApp` Pulumi component to:

1. Add a new DynamoDB table `lifting-data` (keep `lifting-hevy` as-is)
2. Add an `aws.scheduler.Schedule` for sync (rate 30 minutes, same pattern as classes)
3. Add an IAM role for the scheduler to invoke the Lambda
4. Inject new env vars: `TABLE_NAME`, `DATA_BUCKET`
5. Pass the shared S3 bucket ARN and name to the Lambda env (read from the parent `infra/index.ts` via constructor params or resource reference)

---

## 15. Migration Notes

The existing `apps/lifting` app has working API routes (`/api/lifting/health`, `/api/lifting/context`, `/api/lifting/summary`, etc.) and a working frontend. **All of this is replaced in full.** Do not attempt to preserve any existing routes or components — start fresh from this spec.

The `lifting-hevy` DynamoDB table and its token-rotation logic should be **preserved** — the new sync job reads Hevy API keys from `users.json`, but the token refresh mechanism for credential-based auth (the existing table) can remain in case it's useful later.

---

## 16. Feature Parity with LiftShift Reference App

The following analytics features from LiftShift are implemented in this spec:

| LiftShift Feature                                      | Implemented In                                 |
| ------------------------------------------------------ | ---------------------------------------------- |
| Activity heatmap (GitHub-style)                        | `ActivityHeatmap.tsx` + `activityHeatmap.ts`   |
| Weekly volume trend chart                              | `VolumeTrendChart.tsx` + `volumeSeries.ts`     |
| Exercise progress chart (1RM over time)                | `ExerciseProgressChart.tsx` + PR tagging       |
| Personal record detection (weight / 1RM / volume)      | `personalRecords.ts`                           |
| Exercise trend status (overloading/plateau/regressing) | `exerciseTrend.ts`                             |
| Muscle group trend (stacked area)                      | `MuscleTrendCard.tsx` + `muscleSeries.ts`      |
| Weekly sets per muscle (heatmap + radar)               | `WeeklySetsCard.tsx`                           |
| Top exercises by volume                                | `TopExercisesCard.tsx`                         |
| PR trend over time                                     | `PrTrendCard` in dashboard data                |
| Intensity evolution (rep ranges)                       | `IntensityBandsChart.tsx`                      |
| Weekly rhythm chart                                    | `WeeklyRhythmCard.tsx`                         |
| Hypertrophy stimulus scoring                           | `hypertrophy.ts` + `MuscleDetailPanel`         |
| Plateau detection alerts                               | `plateauDetection.ts` + `PlateauAlertPanel`    |
| Interactive SVG body map                               | `BodyMapPanel.tsx` (SVG assets from LiftShift) |
| Muscle volume time series                              | `MuscleVolumeChart.tsx`                        |
| Session-by-session history                             | `HistoryPage.tsx`                              |
| Set-level analysis messages                            | `exerciseTrend.ts` per-set analysis            |
| Streak tracking                                        | `streaks.ts`                                   |
| Natural language dashboard summary                     | `summary.ts`                                   |

**New features not in LiftShift:**

| Feature                                    | Where                                            |
| ------------------------------------------ | ------------------------------------------------ |
| Coach roster view                          | `CoachRosterPage`, `/api/lifting/coach/athletes` |
| Coach ↔ athlete session comments           | `SessionCommentPanel`, comment routes            |
| Coach-set goals with progress tracking     | `GoalsPage`, goal routes                         |
| Server-side data storage + background sync | S3 + EventBridge Scheduler + sync job            |
| Multi-user architecture                    | users.json roles + `?userId=` param              |
| Provider abstraction layer                 | `provider/types.ts` + `provider/hevy.ts`         |
| Internal UID system (source ID isolation)  | `_sourceId` → internal UUID mapping              |
