/**
 * Client for the ThirdSpace (Fisikal) member API. Driven by a per-user
 * ThirdSpaceConfig from the users registry ([[@billynorris/config]]) — no env.
 * Auth is an `x-fisikal-token` header, supplied directly via `token` or rebuilt
 * from `id` + `sig`. Multi-club: no hardcoded club; `clubIds` optionally narrows.
 */
import type { ThirdSpaceConfig } from "@billynorris/config";

export interface GymClass {
  id: number;
  name: string;
  startDate: string;
  bookingOpens: string;
  trainerName: string;
  /** "join" when bookable; becomes "cancel" once you're booked in. */
  eventAction: string;
  locationId?: number;
  locationName?: string;
  attendeeCount?: number;
  duration?: string;
  [key: string]: unknown;
}

export interface Club {
  id: number;
  name: string;
}

const BASE_URL = "https://api.thirdspace-london.app";

function resolveToken(config: ThirdSpaceConfig): string {
  if (config.token) return config.token;

  if (!config.id || !config.sig) {
    throw new Error(
      "Missing ThirdSpace credentials: set config.thirdspace.token (or id + sig) for this user",
    );
  }

  const payload = {
    id: Number(config.id),
    redirect_url: "/",
    sig: config.sig,
    user_type: "Client",
    expiry_date_utc: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    check: null,
    permissions: [] as string[],
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export class ThirdSpaceClient {
  private readonly token: string;
  private readonly clubIds?: number[];
  readonly defaultClubId?: number;

  constructor(config: ThirdSpaceConfig) {
    this.token = resolveToken(config);
    this.clubIds = config.clubIds && config.clubIds.length ? config.clubIds : undefined;
    this.defaultClubId = config.defaultClubId;
  }

  private headers(): Record<string, string> {
    return {
      accept: "*/*",
      "x-fisikal-token": this.token,
      "accept-language": "en-GB,en;q=0.9",
      "content-type": "application/json",
    };
  }

  async getClasses(opts: {
    startDate?: string;
    endDate?: string;
    clubIds?: number[];
    limit?: number;
  } = {}): Promise<GymClass[]> {
    const now = new Date();
    const start = opts.startDate ?? now.toISOString();
    const end =
      opts.endDate ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const url = new URL("/api/v2/member/classes/get_classes", BASE_URL);
    url.searchParams.set("api-version", "2.0");
    url.searchParams.set("Limits.Count", String(opts.limit ?? 1000));
    url.searchParams.set("StartDate", start);
    url.searchParams.set("EndDate", end);

    // No hardcoded club. Filter only if asked (or via the user's default);
    // otherwise request across all clubs.
    const clubIds = opts.clubIds ?? this.clubIds;
    for (const id of clubIds ?? []) url.searchParams.append("ClubIds", String(id));

    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`getClasses failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { classes: GymClass[] };
    return json.classes;
  }

  /**
   * List clubs by querying the API: derive distinct locations from upcoming
   * classes across all clubs (no documented clubs endpoint). Always includes the
   * configured default club, named, even if its query is needed separately.
   */
  async getClubs(): Promise<Club[]> {
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const byId = new Map<number, string>();

    const collect = (classes: GymClass[]) => {
      for (const c of classes) {
        if (typeof c.locationId === "number") {
          byId.set(c.locationId, c.locationName ?? `Club ${c.locationId}`);
        }
      }
    };

    // All clubs (explicit empty filter) — works if the API returns multi-club.
    try {
      collect(
        await this.getClasses({
          startDate: now.toISOString(),
          endDate: end.toISOString(),
          clubIds: [],
          limit: 5000,
        }),
      );
    } catch {
      /* API may require a club filter; fall through to the default club. */
    }

    // Guarantee the default club is present and named.
    if (this.defaultClubId && !byId.has(this.defaultClubId)) {
      try {
        const classes = await this.getClasses({
          startDate: now.toISOString(),
          endDate: end.toISOString(),
          clubIds: [this.defaultClubId],
          limit: 1000,
        });
        const named = classes.find((c) => c.locationId === this.defaultClubId)?.locationName;
        byId.set(this.defaultClubId, named ?? `Club ${this.defaultClubId}`);
      } catch {
        byId.set(this.defaultClubId, `Club ${this.defaultClubId}`);
      }
    }

    return [...byId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getClassDetails(classId: string): Promise<{ serverDate: string | null; data: GymClass }> {
    const url = new URL(`/api/v2/member/classes/class_details/${classId}`, BASE_URL);
    url.searchParams.set("api-version", "2.0");

    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`getClassDetails failed: ${res.status} ${await res.text()}`);
    }
    return { serverDate: res.headers.get("date"), data: (await res.json()) as GymClass };
  }

  async bookClass(classId: string): Promise<{ eventAction?: string; [key: string]: unknown }> {
    const url = new URL("/api/v2/member/classes/book_class", BASE_URL);
    url.searchParams.set("api-version", "2.0");

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ classId: Number(classId) }),
    });
    return (await res.json()) as { eventAction?: string };
  }
}
