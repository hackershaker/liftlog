import type { WorkoutTemplate } from '../types';

export function moveRoutineExercise(templates: WorkoutTemplate[], source: WorkoutTemplate, exerciseId: string, targetId: string): WorkoutTemplate[] {
  const exercise = source.exercises.find(e => e.id === exerciseId);
  const target = templates.find(t => t.id === targetId);
  if (!exercise || !target || source.id === targetId || target.exercises.length >= 256) return templates;
  const modified = new Date().toISOString();
  const moved = { ...exercise, id: target.exercises.some(e => e.id === exercise.id) ? crypto.randomUUID() : exercise.id };
  return templates.map(t => {
    if (t.id === source.id) return { ...source, lastModified: modified, exercises: source.exercises.filter(e => e.id !== exerciseId).map((e, i) => ({ ...e, order: i + 1 })) };
    if (t.id === targetId) return { ...t, lastModified: modified, exercises: [...t.exercises, moved].map((e, i) => ({ ...e, order: i + 1 })) };
    return t;
  });
}
