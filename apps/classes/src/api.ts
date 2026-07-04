/** Typed client for the same-origin classes API (`/api/classes/*`). */
import { authedFetch } from "@billynorris/ui";

export interface GymClass {
  id: number;
  name: string;
  startDate: string;
  bookingOpens: string;
  trainerName: string;
  eventAction: string;
  locationId?: number;
  locationName?: string;
}

export interface Club {
  id: number;
  name: string;
}

export type BookingStatus = "queued" | "processing" | "booked" | "failed" | "cancelled";

export interface Booking {
  classId: string;
  status: BookingStatus;
  name: string;
  trainerName?: string;
  clubName?: string;
  startDate: string;
  bookingOpens: string;
  error?: string;
}

const BASE = "/api/classes";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function listClubs(): Promise<{ clubs: Club[]; defaultClubId: number | null }> {
  return json<{ clubs: Club[]; defaultClubId: number | null }>(await authedFetch(`${BASE}/clubs`));
}

export async function listClasses(params: { clubId?: number; from?: string; to?: string } = {}): Promise<GymClass[]> {
  const qs = new URLSearchParams();
  if (params.clubId) qs.set("clubIds", String(params.clubId));
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return (await json<{ classes: GymClass[] }>(await authedFetch(`${BASE}/classes?${qs}`))).classes;
}

export async function listBookings(scope: "upcoming" | "all" = "all"): Promise<Booking[]> {
  const qs = scope === "upcoming" ? "?scope=upcoming" : "";
  return (await json<{ bookings: Booking[] }>(await authedFetch(`${BASE}/bookings${qs}`))).bookings;
}

export async function queueAutobook(classId: number): Promise<Booking> {
  return json<Booking>(
    await authedFetch(`${BASE}/autobook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classId }),
    }),
  );
}

export async function cancelBooking(classId: string): Promise<void> {
  await authedFetch(`${BASE}/bookings/${classId}`, { method: "DELETE" });
}
