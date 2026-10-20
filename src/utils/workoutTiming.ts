import type { LoggedExercise, WorkoutRestTimer } from '../types';

export function elapsedSeconds(startedAt: string, now = Date.now()): number {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}

export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${remaining}` : `${String(minutes).padStart(2, '0')}:${remaining}`;
}

// Start rest only when a set becomes complete, not when reps or weights change.
export function nextRestTimer(
  previous: LoggedExercise, updated: LoggedExercise, others: LoggedExercise[], now = Date.now()
): WorkoutRestTimer | undefined {
  const justCompleted = updated.sets.some((set, i) => set.completed && !previous.sets[i]?.completed);
  if (!justCompleted) return undefined;
  const exerciseComplete = updated.sets.length > 0 && updated.sets.every(set => set.completed);
  if (exerciseComplete && !others.some(e => e.sets.some(set => !set.completed))) return undefined;
  const seconds = exerciseComplete ? updated.restAfterExerciseSeconds : updated.restBetweenSetsSeconds;
  if (!seconds || seconds <= 0) return undefined;
  return { endsAt: now + seconds * 1000, exerciseId: updated.id, kind: exerciseComplete ? 'exercise' : 'set' };
}
