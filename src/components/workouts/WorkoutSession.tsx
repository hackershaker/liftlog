import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Save, Clock, Edit3, X, ChevronDown, ChevronUp, Plus, Dumbbell, User } from 'lucide-react';
import { WorkoutTemplate, WorkoutLog, LoggedExercise, WorkoutCategory, TemplateType, TemplateExercise, ActiveWorkoutSession, WorkoutRestTimer } from '../../types';
import { PPL_CATEGORY_COLORS } from '../../constants';
import ExerciseCard from './ExerciseCard';
import { elapsedSeconds, formatDuration, nextRestTimer } from '../../utils/workoutTiming';
import { restAudio } from '../../utils/restAudio';

interface CustomExerciseForm {
  name: string;
  type: 'weighted' | 'bodyweight';
  sets: number;
  reps: number;
  weight: number;
}

interface WorkoutSessionProps {
  category: WorkoutCategory;
  templateType: TemplateType;
  template: WorkoutTemplate;
  logs: WorkoutLog[];
  onSave: (log: WorkoutLog) => void;
  onEditTemplate: () => void;
  onCancel: () => void;
  activeWorkout?: ActiveWorkoutSession;
  onUpdateActiveWorkout: (activeWorkout: ActiveWorkoutSession | undefined) => void;
}

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Format date for display
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function WorkoutSession({ category, templateType, template, logs, onSave, onEditTemplate, onCancel, activeWorkout, onUpdateActiveWorkout }: WorkoutSessionProps) {
  const [startedAt] = useState(() => activeWorkout?.startedAt || new Date().toISOString());
  const [now, setNow] = useState(() => Date.now());
  const [restTimer, setRestTimer] = useState<WorkoutRestTimer | undefined>(activeWorkout?.restTimer);
  const [soundNotice, setSoundNotice] = useState('');
  const lastAlertedTimer = useRef<string | null>(null);

  useEffect(() => {
    if (!restTimer || restTimer.notified || now < restTimer.endsAt) return;
    const key = `${restTimer.exerciseId}-${restTimer.kind}-${restTimer.endsAt}`;
    if (lastAlertedTimer.current === key) return;
    lastAlertedTimer.current = key;
    const played = restAudio.play();
    setRestTimer({ ...restTimer, notified: true });
    if (!played) setSoundNotice('Tap Test Sound to enable alerts.');
  }, [now, restTimer]);

  const testSound = () => {
    void restAudio.unlock().then(ready => {
      setSoundNotice(ready && restAudio.play() ? 'Sound enabled.' : 'Sound unavailable. Check your browser and volume.');
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const refreshClock = () => setNow(Date.now());
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);
  // Match by routine ID, with compatibility for logs saved before routine IDs existed.
  const lastWorkout = useMemo(() => {
    return logs
      .filter(l => l.templateId ? l.templateId === template.id : template.category !== 'custom' && l.category === category && l.templateType === templateType)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [logs, category, templateType, template.id]);

  // Extract unique exercise names from all workout history (for autocomplete)
  const historicExercises = useMemo(() => {
    const exerciseMap = new Map<string, { name: string; type: 'weighted' | 'bodyweight'; count: number }>();

    logs.forEach(log => {
      log.exercises.forEach(exercise => {
        const existing = exerciseMap.get(exercise.name);
        if (existing) {
          existing.count++;
        } else {
          exerciseMap.set(exercise.name, { name: exercise.name, type: exercise.type, count: 1 });
        }
      });
    });

    // Sort by usage count (most used first)
    return Array.from(exerciseMap.values()).sort((a, b) => b.count - a.count);
  }, [logs]);

  // Initialize current workout from active workout (if exists) or template
  const [currentExercises, setCurrentExercises] = useState<LoggedExercise[]>(() => {
    // Restore from persisted active workout if available
    if (activeWorkout) {
      return activeWorkout.exercises.map(e => {
        const source = template.exercises.find(t => t.id === e.exerciseId);
        return { ...e, restBetweenSetsSeconds: e.restBetweenSetsSeconds ?? source?.restBetweenSetsSeconds ?? 0,
          restAfterExerciseSeconds: e.restAfterExerciseSeconds ?? source?.restAfterExerciseSeconds ?? 0 };
      });
    }
    // Otherwise initialize from template
    return template.exercises.map(te => ({
      id: generateId(),
      exerciseId: te.id,
      name: te.name,
      type: te.type,
      restBetweenSetsSeconds: te.restBetweenSetsSeconds ?? 0,
      restAfterExerciseSeconds: te.restAfterExerciseSeconds ?? 0,
      sets: Array.from({ length: te.defaultSets }, (_, i) => ({
        setNumber: i + 1,
        reps: te.defaultRepsBySet?.[i] ?? te.defaultReps,
        weight: te.type === 'weighted' ? te.defaultWeight : undefined,
        completed: false
      }))
    }));
  });

  const [notes, setNotes] = useState(activeWorkout?.notes || '');
  const [showNotes, setShowNotes] = useState(!!activeWorkout?.notes);
  const [lastWorkoutExpanded, setLastWorkoutExpanded] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [showExerciseSuggestions, setShowExerciseSuggestions] = useState(false);
  const [newExercise, setNewExercise] = useState<CustomExerciseForm>({
    name: '',
    type: 'weighted',
    sets: 3,
    reps: 10,
    weight: 10
  });
  // Track custom templates for exercises added during workout
  const [customTemplates, setCustomTemplates] = useState<Map<string, TemplateExercise>>(new Map());

  // Persist workout state whenever it changes (survives tab switches)
  useEffect(() => {
    onUpdateActiveWorkout({
      templateId: template.id,
      category,
      templateType,
      exercises: currentExercises,
      notes,
      startedAt,
      restTimer,
    });
  }, [currentExercises, notes, category, templateType, template.id, startedAt, restTimer]);

  const handleExerciseChange = (index: number, exercise: LoggedExercise) => {
    const previous = currentExercises[index];
    const completionChanged = exercise.sets.some((s, i) => s.completed !== previous.sets[i]?.completed);
    if (completionChanged) {
      void restAudio.unlock();
      setRestTimer(nextRestTimer(previous, exercise, currentExercises.filter((_, i) => i !== index)));
      setNow(Date.now());
    }
    const newExercises = [...currentExercises];
    newExercises[index] = exercise;
    setCurrentExercises(newExercises);
  };

  const handleAddCustomExercise = () => {
    if (!newExercise.name.trim()) return;

    const exerciseId = generateId();
    const isWeighted = newExercise.type === 'weighted';

    // Create a mock template for this custom exercise
    const mockTemplate: TemplateExercise = {
      id: exerciseId,
      name: newExercise.name.trim(),
      type: newExercise.type,
      defaultSets: newExercise.sets,
      defaultReps: newExercise.reps,
      defaultWeight: isWeighted ? newExercise.weight : undefined,
      order: currentExercises.length
    };

    // Add to custom templates map
    setCustomTemplates(prev => new Map(prev).set(exerciseId, mockTemplate));

    // Create the logged exercise
    const loggedExercise: LoggedExercise = {
      id: generateId(),
      exerciseId: exerciseId,
      name: newExercise.name.trim(),
      type: newExercise.type,
      sets: Array.from({ length: newExercise.sets }, (_, i) => ({
        setNumber: i + 1,
        reps: newExercise.reps,
        weight: isWeighted ? newExercise.weight : undefined,
        completed: false
      }))
    };

    setCurrentExercises([...currentExercises, loggedExercise]);
    setShowAddExercise(false);
    setNewExercise({ name: '', type: 'weighted', sets: 3, reps: 10, weight: 10 });
  };

  const handleRemoveExercise = (index: number) => {
    const exercise = currentExercises[index];
    if (restTimer?.exerciseId === exercise.id) setRestTimer(undefined);
    // Also remove from custom templates if it exists
    if (customTemplates.has(exercise.exerciseId)) {
      setCustomTemplates(prev => {
        const newMap = new Map(prev);
        newMap.delete(exercise.exerciseId);
        return newMap;
      });
    }
    setCurrentExercises(currentExercises.filter((_, i) => i !== index));
  };

  // Get template for exercise (from real template or custom templates)
  const getTemplateForExercise = (exercise: LoggedExercise): TemplateExercise => {
    const realTemplate = template.exercises.find(t => t.id === exercise.exerciseId);
    if (realTemplate) return realTemplate;

    const customTemplate = customTemplates.get(exercise.exerciseId);
    if (customTemplate) return customTemplate;

    // Fallback: create a default template from exercise data
    return {
      id: exercise.exerciseId,
      name: exercise.name,
      type: exercise.type,
      defaultSets: exercise.sets.length,
      defaultReps: exercise.sets[0]?.reps || 10,
      defaultWeight: exercise.sets[0]?.weight,
      order: 0
    };
  };

  const handleSave = () => {
    const completedSetsCount = currentExercises.reduce((acc, e) => acc + e.sets.filter(s => s.completed).length, 0);

    if (completedSetsCount === 0) {
      alert('Complete at least one set before saving!');
      return;
    }

    const log: WorkoutLog = {
      id: generateId(),
      templateId: template.id,
      templateName: template.name,
      category,
      templateType,
      date: new Date().toISOString().split('T')[0],
      startedAt,
      durationSeconds: elapsedSeconds(startedAt),
      exercises: currentExercises,
      notes: notes || undefined
    };

    onSave(log);

  };

  // Calculate progress
  const totalSets = currentExercises.reduce((acc, e) => acc + e.sets.length, 0);
  const completedSets = currentExercises.reduce((acc, e) => acc + e.sets.filter(s => s.completed).length, 0);
  const progressPercent = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  // Find corresponding exercise from last workout
  const getLastExercise = (exerciseId: string) => {
    return lastWorkout?.exercises.find(e => e.exerciseId === exerciseId);
  };

  const categoryColor = PPL_CATEGORY_COLORS[category];
  const restRemaining = restTimer ? Math.max(0, Math.ceil((restTimer.endsAt - now) / 1000)) : 0;
  const restingExercise = currentExercises.find(e => e.id === restTimer?.exerciseId);
  const restBanner = restTimer && (
    <div data-testid="rest-banner" className="fixed inset-x-0 top-0 z-[45] border-b border-accent-primary/40 bg-bg-primary/95 backdrop-blur-lg shadow-lg" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="max-w-lg mx-auto px-4 py-3 space-y-1">
        <p className="text-sm font-medium truncate">{restTimer.kind === 'exercise' ? 'Rest before next exercise' : 'Rest between sets'}{restingExercise ? ` · ${restingExercise.name}` : ''}</p>
        <div className="flex items-center justify-between gap-3">
          <p role="timer" aria-label="Rest time remaining" className="text-4xl font-display font-bold tabular-nums text-accent-primary">{formatDuration(restRemaining)}</p>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg bg-bg-tertiary text-text-muted text-sm" onClick={testSound}>Test Sound</button>
            <button className="px-3 py-2 rounded-lg bg-accent-primary/20 text-accent-primary text-sm" onClick={() => setRestTimer(undefined)}>{restRemaining > 0 ? 'Skip Rest' : 'Dismiss'}</button>
          </div>
        </div>
        {restRemaining === 0 && <p role="status" className="text-accent-primary text-sm">Rest complete. Ready for your next set or exercise.</p>}
        {soundNotice && <p role="status" className="text-xs text-text-muted">{soundNotice}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      {restTimer && (document.body ? createPortal(restBanner, document.body) : restBanner)}
      <div className="card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-text-muted flex items-center gap-1"><Clock size={14} />Workout time</p>
          <p className="font-display text-2xl font-bold tabular-nums" role="timer" aria-label="Workout elapsed time">{formatDuration(elapsedSeconds(startedAt, now))}</p>
          <p className="text-xs text-text-muted">Includes rest and time away from this screen.</p>
          {!restTimer && <button className="text-xs text-accent-primary py-1" onClick={testSound}>Test Sound</button>}
          <p className="text-xs text-text-muted">Keep this screen open for sound alerts.</p>
          {!restTimer && soundNotice && <p role="status" className="text-xs text-text-muted">{soundNotice}</p>}
        </div>
        <button className="px-3 py-2 rounded-lg bg-accent-danger/10 text-accent-danger" onClick={() => {
          if (confirm('Cancel this workout? All progress and workout time will be discarded. Nothing will be added to history.')) onCancel();
        }}>Cancel Workout</button>
      </div>
      {/* Header with last workout info */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary">
              {template.name || `${category.charAt(0).toUpperCase() + category.slice(1)} ${templateType}`}
            </h2>
            {lastWorkout ? (
              <p className="text-sm text-text-muted flex items-center gap-1">
                <Clock size={14} />
                Last workout: {formatDate(lastWorkout.date)}
              </p>
            ) : (
              <p className="text-sm text-text-muted">First workout for this routine!</p>
            )}
          </div>
          <button
            onClick={onEditTemplate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
          >
            <Edit3 size={16} />
            <span className="text-sm">Edit Routine</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Progress</span>
            <span className="text-text-primary font-medium">{completedSets}/{totalSets} sets</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: categoryColor
              }}
            />
          </div>
        </div>

        {/* Template notes */}
        {template.notes && (
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-text-muted mb-1">Template Notes</p>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{template.notes}</p>
          </div>
        )}
      </div>

      {/* Last workout accordion */}
      {lastWorkout && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setLastWorkoutExpanded(!lastWorkoutExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
          >
            <div>
              <p className="font-display font-semibold text-text-primary text-left">
                Last Workout
              </p>
              <p className="text-sm text-text-muted">
                {lastWorkout.exercises.length} exercises · {lastWorkout.exercises.reduce((acc, e) => acc + e.sets.filter(s => s.completed).length, 0)} sets
              </p>
            </div>
            {lastWorkoutExpanded ? (
              <ChevronUp size={20} className="text-text-muted" />
            ) : (
              <ChevronDown size={20} className="text-text-muted" />
            )}
          </button>

          {lastWorkoutExpanded && (
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3 animate-slide-up">
              {lastWorkout.exercises.map(exercise => {
                const completedSets = exercise.sets.filter(s => s.completed);
                if (completedSets.length === 0) return null;

                return (
                  <div key={exercise.id} className="bg-bg-tertiary rounded-lg p-3">
                    <p className="font-medium text-text-primary mb-2">{exercise.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {completedSets.map(set => (
                        <span
                          key={set.setNumber}
                          className="px-2 py-1 bg-bg-secondary rounded text-xs text-text-muted"
                        >
                          {set.reps} reps{set.weight ? ` @ ${set.weight}kg` : ''}
                        </span>
                      ))}
                    </div>
                    {exercise.notes && (
                      <p className="text-xs text-text-muted mt-2 italic">{exercise.notes}</p>
                    )}
                  </div>
                );
              })}

              {lastWorkout.notes && (
                <div className="bg-bg-tertiary rounded-lg p-3">
                  <p className="text-xs text-text-muted mb-1">Notes</p>
                  <p className="text-sm text-text-primary">{lastWorkout.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Exercise cards */}
      <div className="space-y-3">
        {currentExercises.map((exercise, index) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            template={getTemplateForExercise(exercise)}
            lastExercise={getLastExercise(exercise.exerciseId)}
            onChange={(updated) => handleExerciseChange(index, updated)}
            onRemove={currentExercises.length > 1 ? () => handleRemoveExercise(index) : undefined}
          />
        ))}

        {/* Add Exercise Button/Form */}
        {showAddExercise ? (
          <div className="card p-4 space-y-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-text-primary">Add Exercise</h3>
              <button
                onClick={() => setShowAddExercise(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Exercise name with autocomplete */}
            <div className="relative">
              <input
                type="text"
                value={newExercise.name}
                onFocus={(e) => {
                  e.currentTarget.select();
                  setShowExerciseSuggestions(true);
                }}
                onChange={(e) => {
                  setNewExercise({ ...newExercise, name: e.target.value });
                  setShowExerciseSuggestions(true);
                }}
                placeholder="Exercise name"
                className="w-full"
                autoFocus
              />

              {/* Suggestions dropdown */}
              {showExerciseSuggestions && historicExercises.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-bg-secondary border border-white/10 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {historicExercises
                    .filter(ex =>
                      newExercise.name === '' ||
                      ex.name.toLowerCase().includes(newExercise.name.toLowerCase())
                    )
                    .slice(0, 8)
                    .map(ex => (
                      <button
                        key={ex.name}
                        type="button"
                        onClick={() => {
                          setNewExercise({
                            ...newExercise,
                            name: ex.name,
                            type: ex.type
                          });
                          setShowExerciseSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-white/5 flex items-center justify-between gap-2 transition-colors"
                      >
                        <span className="text-text-primary">{ex.name}</span>
                        <div className="flex items-center gap-2">
                          {ex.type === 'weighted' ? (
                            <Dumbbell size={14} className="text-accent-primary" />
                          ) : (
                            <User size={14} className="text-accent-info" />
                          )}
                          <span className="text-xs text-text-muted">{ex.count}x</span>
                        </div>
                      </button>
                    ))}
                  {historicExercises.filter(ex =>
                    newExercise.name === '' ||
                    ex.name.toLowerCase().includes(newExercise.name.toLowerCase())
                  ).length === 0 && newExercise.name && (
                    <div className="px-3 py-2 text-text-muted text-sm">
                      New exercise: "{newExercise.name}"
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Click outside to close suggestions */}
            {showExerciseSuggestions && (
              <div
                className="fixed inset-0 z-0"
                onClick={() => setShowExerciseSuggestions(false)}
              />
            )}

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setNewExercise({ ...newExercise, type: 'weighted' })}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                  newExercise.type === 'weighted'
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-bg-tertiary text-text-muted hover:bg-bg-secondary'
                }`}
              >
                <Dumbbell size={16} />
                <span className="text-sm">Weighted</span>
              </button>
              <button
                onClick={() => setNewExercise({ ...newExercise, type: 'bodyweight' })}
                className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                  newExercise.type === 'bodyweight'
                    ? 'bg-accent-info/20 text-accent-info'
                    : 'bg-bg-tertiary text-text-muted hover:bg-bg-secondary'
                }`}
              >
                <User size={16} />
                <span className="text-sm">Bodyweight</span>
              </button>
            </div>

            {/* Sets, Reps, Weight inputs */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">Sets</label>
                <input
                  type="number"
                  value={newExercise.sets}
                  onChange={(e) => setNewExercise({ ...newExercise, sets: parseInt(e.target.value) || 1 })}
                  min="1"
                  className="w-full text-center"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Reps</label>
                <input
                  type="number"
                  value={newExercise.reps}
                  onChange={(e) => setNewExercise({ ...newExercise, reps: parseInt(e.target.value) || 1 })}
                  min="1"
                  className="w-full text-center"
                />
              </div>
              {newExercise.type === 'weighted' && (
                <div>
                  <label className="block text-xs text-text-muted mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={newExercise.weight}
                    onChange={(e) => setNewExercise({ ...newExercise, weight: parseFloat(e.target.value) || 0 })}
                    min="0"
                    step="0.5"
                    className="w-full text-center"
                  />
                </div>
              )}
            </div>

            {/* Add button */}
            <button
              onClick={handleAddCustomExercise}
              disabled={!newExercise.name.trim()}
              className="w-full py-2 rounded-lg bg-accent-primary text-white font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Add Exercise
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddExercise(true)}
            className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 text-text-muted hover:border-white/20 hover:text-text-primary transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={20} />
            <span>Add Exercise</span>
          </button>
        )}
      </div>

      {/* Notes section */}
      <div className="card p-4">
        {showNotes ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">Workout Notes</span>
              <button
                onClick={() => setShowNotes(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did the workout feel? Any PRs or struggles?"
              className="w-full h-24 resize-none"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNotes(true)}
            className="w-full text-left text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            + Add notes
          </button>
        )}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={completedSets === 0}
        className="w-full btn-primary flex items-center justify-center gap-2 py-4 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: categoryColor }}
      >
        <Save size={20} />
        <span className="font-display font-semibold">Finish Workout</span>
      </button>
    </div>
  );
}
