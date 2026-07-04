import type {
  ExerciseTemplate,
  MuscleGroup,
  TrainingData,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@billynorris/lifting-shared";

interface MockExercise {
  id: string;
  name: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  startWeight: number;
  weeklyGain: number;
  topReps: number;
}

const EXERCISES: MockExercise[] = [
  { id: "bench", name: "Bench Press", primary: "chest", secondary: ["triceps", "shoulders"], startWeight: 60, weeklyGain: 0.6, topReps: 5 },
  { id: "squat", name: "Barbell Squat", primary: "quadriceps", secondary: ["glutes", "hamstrings"], startWeight: 80, weeklyGain: 0.9, topReps: 5 },
  { id: "deadlift", name: "Deadlift", primary: "lower_back", secondary: ["hamstrings", "glutes", "traps"], startWeight: 100, weeklyGain: 1.0, topReps: 3 },
  { id: "ohp", name: "Overhead Press", primary: "shoulders", secondary: ["triceps"], startWeight: 40, weeklyGain: 0.3, topReps: 6 },
  { id: "row", name: "Barbell Row", primary: "upper_back", secondary: ["lats", "biceps"], startWeight: 50, weeklyGain: 0.5, topReps: 8 },
  { id: "pulldown", name: "Lat Pulldown", primary: "lats", secondary: ["biceps"], startWeight: 45, weeklyGain: 0.4, topReps: 10 },
];

// Simple weekly split: which exercises are trained on which day offset.
const SPLIT: Array<{ dayOffset: number; ids: string[] }> = [
  { dayOffset: 0, ids: ["squat", "bench", "row"] },
  { dayOffset: 2, ids: ["deadlift", "ohp", "pulldown"] },
  { dayOffset: 4, ids: ["bench", "squat", "pulldown"] },
];

const WEEKS = 26;

function round2p5(n: number): number {
  return Math.round(n / 2.5) * 2.5;
}

function buildSets(weight: number, topReps: number, week: number): WorkoutSet[] {
  // A warmup, then three working sets; small noise so trends aren't perfectly linear.
  const noise = ((week * 7919) % 5) - 2; // deterministic -2..2
  const top = round2p5(weight + noise);
  return [
    { index: 0, type: "warmup", weightKg: round2p5(weight * 0.5), reps: 8, rpe: null, distanceMeters: null, durationSeconds: null },
    { index: 1, type: "normal", weightKg: top, reps: topReps, rpe: 8, distanceMeters: null, durationSeconds: null },
    { index: 2, type: "normal", weightKg: top, reps: topReps, rpe: 8.5, distanceMeters: null, durationSeconds: null },
    { index: 3, type: "normal", weightKg: round2p5(top * 0.95), reps: topReps + 2, rpe: 9, distanceMeters: null, durationSeconds: null },
  ];
}

export function buildMockTrainingData(now = new Date()): TrainingData {
  const templates: Record<string, ExerciseTemplate> = {};
  for (const e of EXERCISES) {
    templates[e.id] = {
      id: e.id,
      name: e.name,
      kind: "weight_reps",
      primaryMuscle: e.primary,
      secondaryMuscles: e.secondary,
      isCustom: false,
    };
  }

  const workouts: Workout[] = [];
  const start = new Date(now);
  start.setDate(start.getDate() - WEEKS * 7);

  for (let week = 0; week < WEEKS; week++) {
    for (const session of SPLIT) {
      const day = new Date(start);
      day.setDate(start.getDate() + week * 7 + session.dayOffset);
      if (day > now) continue;
      const exercises: WorkoutExercise[] = session.ids.map((id, idx) => {
        const def = EXERCISES.find((e) => e.id === id)!;
        // Gains taper off in the back third to create a realistic plateau.
        const effectiveWeek = week < 18 ? week : 18 + (week - 18) * 0.2;
        const weight = def.startWeight + def.weeklyGain * effectiveWeek;
        return {
          index: idx,
          templateId: id,
          name: def.name,
          notes: "",
          sets: buildSets(weight, def.topReps, week),
        };
      });
      const startTime = new Date(day);
      startTime.setHours(18, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 62);
      workouts.push({
        id: `w-${week}-${session.dayOffset}`,
        title: "Training Session",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        exercises,
      });
    }
  }

  return { workouts, templates, fetchedAt: now.toISOString() };
}
