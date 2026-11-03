import type { WorkoutLog, WorkoutTemplate } from '../types';

export function updateRoutineFromWorkout(template: WorkoutTemplate, log: WorkoutLog): WorkoutTemplate {
  const matches = log.templateId ? log.templateId === template.id
    : template.category !== 'custom' && template.category === log.category && template.templateType === log.templateType;
  if (!matches) return template;

  let changed = false;
  const exercises = template.exercises.map(exercise => {
    const performed = log.exercises.find(e => e.exerciseId === exercise.id);
    const completed = performed?.sets.filter(s => s.completed && Number.isInteger(s.reps) && s.reps >= 0);
    if (!completed?.length) return exercise;
    changed = true;
    const reps = completed.map(s => s.reps);
    const weights = exercise.type === 'weighted' ? completed.map((s, i) =>
      s.weight !== undefined && Number.isFinite(s.weight) && s.weight >= 0 ? s.weight : exercise.defaultWeightsBySet?.[i] ?? exercise.defaultWeight ?? 0) : undefined;
    return { ...exercise, defaultSets: completed.length, defaultReps: reps[0], defaultRepsBySet: reps,
      defaultWeight: weights?.[0], defaultWeightsBySet: weights };
  });
  return changed ? { ...template, exercises, lastModified: new Date().toISOString() } : template;
}
