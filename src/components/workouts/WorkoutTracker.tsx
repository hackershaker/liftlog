import { useState } from 'react';
import { Plus, Play, Edit3, Trash2, ArrowLeft } from 'lucide-react';
import { WorkoutData, WorkoutLog, WorkoutTemplate, StreakData, ActiveWorkoutSession } from '../../types';
import { PPL_CATEGORY_LABELS } from '../../constants';
import WorkoutSession from './WorkoutSession';
import WorkoutHistory from './WorkoutHistory';
import TemplateEditor from './TemplateEditor';
import { restAudio } from '../../utils/restAudio';

interface WorkoutTrackerProps {
  workouts: WorkoutData;
  workoutStreak: StreakData;
  onUpdateWorkouts: (workouts: WorkoutData) => void;
  onUpdateWorkoutStreak: (streak: StreakData) => void;
  activeWorkout?: ActiveWorkoutSession;
  onUpdateActiveWorkout: (activeWorkout: ActiveWorkoutSession | undefined) => void;
}

const routineName = (t: WorkoutTemplate) => t.name || `${PPL_CATEGORY_LABELS[t.category]} ${t.templateType === 'weighted' ? 'Weighted' : 'Bodyweight'}`;
const matchesSession = (session: ActiveWorkoutSession, t: WorkoutTemplate) => session.templateId
  ? session.templateId === t.id
  : t.category !== 'custom' && session.category === t.category && session.templateType === t.templateType;

export default function WorkoutTracker({ workouts, workoutStreak, onUpdateWorkouts, onUpdateWorkoutStreak, activeWorkout, onUpdateActiveWorkout }: WorkoutTrackerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    activeWorkout ? workouts.templates.find(t => matchesSession(activeWorkout, t))?.id || null : null);
  const [view, setView] = useState<'routines' | 'session' | 'history'>(() => activeWorkout ? 'session' : 'routines');
  const [editing, setEditing] = useState<WorkoutTemplate | null>(null);
  const [savedWorkout, setSavedWorkout] = useState(false);
  const selected = workouts.templates.find(t => t.id === selectedId);

  const updateWorkoutStreak = (logDate: string) => {
    // Get existing logged dates or initialize empty array
    const loggedDates = new Set(workoutStreak.loggedDates || []);

    // Don't update if already logged on this date
    if (loggedDates.has(logDate)) {
      return;
    }

    // Add the new date
    loggedDates.add(logDate);
    const datesArray = Array.from(loggedDates);

    // Recalculate streak from all logged dates
    const sortedDates = [...datesArray].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 1;

    // Check if most recent date is today or yesterday for current streak
    const mostRecentDate = sortedDates[0];
    if (mostRecentDate === today || mostRecentDate === yesterday) {
      currentStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prevDate = new Date(sortedDates[i - 1]);
        const currDate = new Date(sortedDates[i]);
        const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / 86400000);
        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    // Calculate longest streak
    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i - 1]);
      const currDate = new Date(sortedDates[i]);
      const diffDays = Math.round((prevDate.getTime() - currDate.getTime()) / 86400000);
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

    onUpdateWorkoutStreak({
      currentStreak,
      longestStreak,
      lastLogDate: mostRecentDate,
      totalDaysLogged: datesArray.length,
      loggedDates: datesArray
    });
  };


  const handleSaveWorkout = (log: WorkoutLog) => {
    onUpdateWorkouts({ ...workouts, logs: [...workouts.logs, log] });
    onUpdateActiveWorkout(undefined);
    updateWorkoutStreak(log.date);
    setSavedWorkout(true);
    setView('routines');
  };

  const saveRoutine = (template: WorkoutTemplate) => {
    const exists = workouts.templates.some(t => t.id === template.id);
    onUpdateWorkouts({ ...workouts, templates: exists
      ? workouts.templates.map(t => t.id === template.id ? template : t)
      : [...workouts.templates, template] });
    setEditing(null);
  };

  const startRoutine = (template: WorkoutTemplate) => {
    if (activeWorkout && !matchesSession(activeWorkout, template)) {
      if (!confirm('Discard the workout in progress and start this routine?')) return;
    }
    void restAudio.unlock();
    if (!activeWorkout || !matchesSession(activeWorkout, template)) {
      onUpdateActiveWorkout({
        templateId: template.id, category: template.category, templateType: template.templateType,
        exercises: template.exercises.map(e => ({
          id: crypto.randomUUID(), exerciseId: e.id, name: e.name, type: e.type,
          restBetweenSetsSeconds: e.restBetweenSetsSeconds ?? 0,
          restAfterExerciseSeconds: e.restAfterExerciseSeconds ?? 0,
          sets: Array.from({ length: e.defaultSets }, (_, i) => ({
            setNumber: i + 1, reps: e.defaultRepsBySet?.[i] ?? e.defaultReps, weight: e.type === 'weighted' ? e.defaultWeight : undefined, completed: false
          }))
        })), notes: '', startedAt: new Date().toISOString()
      });
    }
    setSelectedId(template.id);
    setSavedWorkout(false);
    setView('session');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex gap-2">
        <button onClick={() => setView('routines')} className={`flex-1 py-3 rounded-lg ${view !== 'history' ? 'bg-white/10 text-text-primary' : 'text-text-muted'}`}>Routines</button>
        <button onClick={() => setView('history')} className={`flex-1 py-3 rounded-lg ${view === 'history' ? 'bg-white/10 text-text-primary' : 'text-text-muted'}`}>History</button>
      </div>
      {view === 'history' ? (
        <WorkoutHistory logs={workouts.logs} onDeleteLog={id => onUpdateWorkouts({ ...workouts, logs: workouts.logs.filter(l => l.id !== id) })} />
      ) : view === 'session' && selected ? (
        <>
          <button onClick={() => setView('routines')} className="flex items-center gap-2 text-text-muted"><ArrowLeft size={18} />All routines</button>
          <WorkoutSession key={selected.id + selected.lastModified} category={selected.category} templateType={selected.templateType}
            template={{ ...selected, name: routineName(selected) }} logs={workouts.logs} onSave={handleSaveWorkout}
            onEditTemplate={() => setEditing(selected)}
            onCancel={() => {
              onUpdateActiveWorkout(undefined);
              setSelectedId(null);
              setSavedWorkout(false);
              setView('routines');
            }}
            activeWorkout={activeWorkout && matchesSession(activeWorkout, selected) ? activeWorkout : undefined}
            onUpdateActiveWorkout={onUpdateActiveWorkout} />
        </>
      ) : (
        <>
          {savedWorkout && <p role="status" className="card p-4 text-accent-primary">Workout saved.</p>}
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">My Routines</h2>
            <button className="btn-primary flex items-center gap-2" disabled={workouts.templates.length >= 64} onClick={() => setEditing({
              id: crypto.randomUUID(), name: '', category: 'custom', templateType: 'weighted', exercises: [], lastModified: new Date().toISOString()
            })}><Plus size={18} />New Routine</button>
          </div>
          {workouts.templates.length === 0 && <p className="card p-6 text-text-muted">Create a routine such as Chest 1 or Leg 2, then add your exercises.</p>}
          <div className="space-y-3">
            {workouts.templates.map(template => {
              const inProgress = activeWorkout && matchesSession(activeWorkout, template);
              return (
                <div key={template.id} className="card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="font-display font-semibold break-words">{routineName(template)}</h3>
                      <p className="text-sm text-text-muted">{template.exercises.length} exercises · {template.exercises.reduce((n, e) => n + e.defaultSets, 0)} sets</p></div>
                    <div className="flex gap-1">
                      <button aria-label={`Edit ${routineName(template)}`} className="p-2 text-text-muted" onClick={() => setEditing(template)}><Edit3 size={18} /></button>
                      <button aria-label={`Delete ${routineName(template)}`} className="p-2 text-text-muted" onClick={() => {
                        if (!confirm('Delete this routine? Workout history will be kept.')) return;
                        onUpdateWorkouts({ ...workouts, templates: workouts.templates.filter(t => t.id !== template.id) });
                        if (inProgress) onUpdateActiveWorkout(undefined);
                      }}><Trash2 size={18} /></button>
                    </div>
                  </div>
                  <p className="text-sm text-text-muted break-words">{template.exercises.map(e => e.name).join(' · ')}</p>
                  <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={!template.exercises.length} onClick={() => startRoutine(template)}>
                    <Play size={16} />{inProgress ? 'Resume Workout' : 'Start Workout'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {editing && <TemplateEditor key={editing.id} template={{ ...editing, name: editing.name ?? routineName(editing) }} onSave={saveRoutine} onClose={() => setEditing(null)} />}
    </div>
  );
}
