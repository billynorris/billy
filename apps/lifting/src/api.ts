/** Typed client for the same-origin lifting API (`/api/lifting/*`). */
import { authedFetch } from "@billynorris/ui";
import type {
  AnalysisDTO,
  BalanceDTO,
  ExerciseListItemDTO,
  ExerciseProgressionDTO,
  HeatmapDTO,
  HistoryDTO,
  SummaryDTO,
  ViewerContextDTO,
  VolumeDTO,
} from "@billynorris/lifting-shared";

const BASE = "/api/lifting";

async function get<T>(path: string): Promise<T> {
  const res = await authedFetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${path}`);
  return (await res.json()) as T;
}

export const api = {
  context: () => get<ViewerContextDTO>("/context"),
  summary: () => get<SummaryDTO>("/summary"),
  exercises: () => get<ExerciseListItemDTO[]>("/exercises"),
  progression: (id: string) =>
    get<ExerciseProgressionDTO>(`/exercises/${encodeURIComponent(id)}/progression`),
  volume: () => get<VolumeDTO>("/volume"),
  balance: () => get<BalanceDTO>("/balance"),
  history: () => get<HistoryDTO>("/history"),
  heatmap: () => get<HeatmapDTO>("/heatmap"),
  analysis: () => get<AnalysisDTO>("/analysis"),
};
