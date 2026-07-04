import { useCallback, useEffect, useState } from "react";
import { PrideRibbon } from "@billynorris/ui";
import {
  cancelBooking,
  listBookings,
  listClasses,
  listClubs,
  queueAutobook,
  type Booking,
  type Club,
  type GymClass,
} from "./api";

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
function toDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDay(dayStr: string, delta: number): string {
  const d = new Date(`${dayStr}T12:00:00`); // noon dodges DST edges
  d.setDate(d.getDate() + delta);
  return toDayStr(d);
}

function dayRange(dayStr: string): { from: string; to: string } {
  return { from: `${dayStr}T00:00:00`, to: `${dayStr}T23:59:59` };
}

const TODAY = toDayStr(new Date());

export function App() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubId, setClubId] = useState<number | "all">("all");
  const [day, setDay] = useState<string>(TODAY);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const queuedIds = new Set(
    bookings.filter((b) => b.status !== "cancelled" && b.status !== "failed").map((b) => b.classId),
  );

  const refreshBookings = useCallback(() => {
    listBookings("upcoming").then(setBookings).catch((e) => setError(String(e)));
  }, []);

  const loadClasses = useCallback((club: number | "all", dayStr: string) => {
    setLoading(true);
    listClasses({ clubId: club === "all" ? undefined : club, ...dayRange(dayStr) })
      .then((cls) => {
        setClasses(cls);
        // Enrich club names from the class data (each class carries locationName),
        // so e.g. 39 shows "Canary Wharf" rather than a "Club 39" placeholder.
        setClubs((prev) => {
          const names = new Map(prev.map((c) => [c.id, c.name]));
          for (const cl of cls) {
            if (typeof cl.locationId === "number" && cl.locationName) {
              names.set(cl.locationId, cl.locationName);
            }
          }
          return [...names]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshBookings();
    listClubs()
      .then(({ clubs, defaultClubId }) => {
        setClubs(clubs);
        const initial: number | "all" = defaultClubId ?? "all";
        setClubId(initial);
        loadClasses(initial, TODAY);
      })
      .catch(() => loadClasses("all", TODAY));
  }, [loadClasses, refreshBookings]);

  function onClubChange(value: string) {
    const next = value === "all" ? "all" : Number(value);
    setClubId(next);
    loadClasses(next, day);
  }

  function goToDay(next: string) {
    setDay(next);
    loadClasses(clubId, next);
  }

  async function onAutobook(c: GymClass) {
    try {
      await queueAutobook(c.id);
      refreshBookings();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onCancel(classId: string) {
    try {
      await cancelBooking(classId);
      refreshBookings();
    } catch (e) {
      setError(String(e));
    }
  }

  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <>
      <PrideRibbon />
      <main className="wrap">
        <header>
          <h1>Classes</h1>
          <p className="sub">
            Queue an auto-book and it fires the instant the booking window opens.
          </p>
        </header>

        {error && <p className="error">{error}</p>}

        {bookings.length > 0 && (
          <section>
            <h2>Upcoming bookings</h2>
            <ul className="rows">
              {bookings.map((b) => (
                <li key={b.classId} className="card row">
                  <div>
                    <div className="name">{b.name}</div>
                    <div className="muted">
                      {new Date(b.startDate).toLocaleString()}
                      {b.clubName ? ` · ${b.clubName}` : ""}
                    </div>
                  </div>
                  <div className="right">
                    <span className={`status status-${b.status}`}>{b.status}</span>
                    {b.status === "queued" && (
                      <button className="link" onClick={() => onCancel(b.classId)}>
                        cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="toolbar">
            <h2>Classes</h2>
            <select value={String(clubId)} onChange={(e) => onClubChange(e.target.value)}>
              <option value="all">All clubs</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="datenav">
            <button className="nav" onClick={() => goToDay(shiftDay(day, -1))} aria-label="Previous day">
              ‹
            </button>
            <input type="date" value={day} onChange={(e) => goToDay(e.target.value)} />
            <button className="nav" onClick={() => goToDay(shiftDay(day, 1))} aria-label="Next day">
              ›
            </button>
            <span className="day-label">{dayLabel}</span>
            {day !== TODAY && (
              <button className="link" onClick={() => goToDay(TODAY)}>
                today
              </button>
            )}
          </div>

          {loading && <p className="muted">Loading classes…</p>}

          <ul className="rows">
            {classes.map((c) => (
              <li key={c.id} className="card row">
                <div>
                  <div className="name">{c.name}</div>
                  <div className="muted">
                    {new Date(c.startDate).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {c.trainerName}
                    {c.locationName ? ` · ${c.locationName}` : ""}
                  </div>
                </div>
                <button
                  className="btn"
                  disabled={queuedIds.has(String(c.id))}
                  onClick={() => onAutobook(c)}
                >
                  {queuedIds.has(String(c.id)) ? "Queued" : "Auto-book"}
                </button>
              </li>
            ))}
          </ul>

          {!loading && classes.length === 0 && (
            <p className="muted">No classes on {dayLabel}.</p>
          )}
        </section>
      </main>
    </>
  );
}
