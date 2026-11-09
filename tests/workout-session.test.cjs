const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile TS/TSX for Node tests while keeping the production bundler unchanged.
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, file) => {
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020,
  }}).outputText, file);
};
const React = require('react');
const { create, act } = require('react-test-renderer');
const Tracker = require('../src/components/workouts/WorkoutTracker.tsx').default;
const Editor = require('../src/components/workouts/TemplateEditor.tsx').default;
const SetRow = require('../src/components/workouts/SetRow.tsx').default;
const { elapsedSeconds, formatDuration, nextRestTimer } = require('../src/utils/workoutTiming.ts');
const { AppDataSchema } = require('../src/types/schema.ts');
const { INITIAL_WORKOUT_DATA } = require('../src/constants/index.ts');
const { createRestAudio, restAudio } = require('../src/utils/restAudio.ts');
const { recentWorkoutDays } = require('../src/utils/recentWorkouts.ts');
const RecentWorkouts = require('../src/components/RecentWorkouts.tsx').default;
const { DndContext } = require('@dnd-kit/core');
const SortableExercise = require('../src/components/workouts/SortableExercise.tsx').default;
const { updateRoutineFromWorkout } = require('../src/utils/updateRoutine.ts');
const StreakCalendar = require('../src/components/StreakCalendar.tsx').default;
const { formatDateISO } = require('../src/hooks/useLocalStorage.ts');

const template = {
  id: 'chest-1', name: 'Chest 1', category: 'custom', templateType: 'weighted', lastModified: '2026-10-18',
  exercises: [
    { id: 'bench', name: 'Bench Press', type: 'weighted', defaultSets: 2, defaultReps: 10, defaultWeight: 40, order: 1, restBetweenSetsSeconds: 60, restAfterExerciseSeconds: 120 },
    { id: 'fly', name: 'Fly', type: 'weighted', defaultSets: 1, defaultReps: 12, defaultWeight: 10, order: 2, restBetweenSetsSeconds: 30, restAfterExerciseSeconds: 90 },
  ],
};
const streak = { currentStreak: 0, longestStreak: 0, totalDaysLogged: 0 };
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node?.children?.map(text).join('') || '';
}
function button(renderer, label) {
  const match = renderer.root.findAll(n => n.type === 'button' && text(n) === label)[0];
  assert.ok(match, `Button: ${label}`);
  return match;
}
function environment() {
  const realNow = Date.now;
  let now = realNow(), serial = 0;
  const intervals = new Map();
  const original = { window: global.window, document: global.document, confirm: global.confirm, alert: global.alert };
  global.window = {
    setInterval: cb => { intervals.set(++serial, cb); return serial; },
    clearInterval: id => intervals.delete(id), addEventListener() {}, removeEventListener() {},
  };
  global.document = { addEventListener() {}, removeEventListener() {} };
  global.confirm = () => true;
  global.alert = message => { throw new Error(message); };
  Date.now = () => now;
  return {
    tick(value) { now = value; act(() => { for (const cb of intervals.values()) cb(); }); },
    restore() { Date.now = realNow; Object.assign(global, original); },
    intervals,
  };
}
function mountTracker(initialActive, initialTemplate = template) {
  let latest;
  function App() {
    const [workouts, setWorkouts] = React.useState({ templates: structuredClone(Array.isArray(initialTemplate) ? initialTemplate : [initialTemplate]), logs: [] });
    const [activeWorkout, setActiveWorkout] = React.useState(initialActive);
    const [workoutStreak, setStreak] = React.useState(streak);
    latest = { workouts, activeWorkout, workoutStreak };
    return React.createElement(Tracker, { workouts, workoutStreak, activeWorkout,
      onUpdateWorkouts: setWorkouts, onUpdateActiveWorkout: setActiveWorkout, onUpdateWorkoutStreak: setStreak });
  }
  let renderer;
  act(() => { renderer = create(React.createElement(App)); });
  return { renderer, data: () => latest };
}

test('cancel discards all progress without history or streak, restart is fresh, timer is cleaned up', () => {
  const env = environment(); let renderer;
  try {
    const app = mountTracker(); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    const start = Date.parse(app.data().activeWorkout.startedAt);
    act(() => renderer.root.findAllByType(SetRow)[0].props.onChange({ ...renderer.root.findAllByType(SetRow)[0].props.set, completed: true }));
    env.tick(start + 65000);
    assert.equal(text(renderer.root.findByProps({ 'aria-label': 'Workout elapsed time' })), '01:05');
    assert.ok(app.data().activeWorkout.restTimer);
    global.confirm = () => false;
    act(() => button(renderer, 'Cancel Workout').props.onClick());
    assert.ok(app.data().activeWorkout);
    global.confirm = () => true;
    act(() => button(renderer, 'Cancel Workout').props.onClick());
    assert.equal(app.data().activeWorkout, undefined);
    assert.deepEqual(app.data().workouts.logs, []);
    assert.deepEqual(app.data().workoutStreak, streak);
    assert.deepEqual(app.data().workouts.templates, [template]);
    assert.equal(env.intervals.size, 0);
    act(() => button(renderer, 'Start Workout').props.onClick());
    assert.ok(app.data().activeWorkout.exercises.every(e => e.sets.every(s => !s.completed)));
    assert.equal(app.data().activeWorkout.restTimer, undefined);
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('set rest, exercise rest, skip, final set, live elapsed time and saved duration', () => {
  const env = environment(); let renderer;
  try {
    const app = mountTracker(); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    const start = Date.parse(app.data().activeWorkout.startedAt);
    function complete(i) { const row = renderer.root.findAllByType(SetRow)[i]; act(() => row.props.onChange({ ...row.props.set, completed: true })); }
    complete(0);
    assert.equal(app.data().activeWorkout.restTimer.kind, 'set');
    const endsAt = app.data().activeWorkout.restTimer.endsAt;
    env.tick(endsAt - 10000);
    assert.equal(text(renderer.root.findByProps({ 'aria-label': 'Rest time remaining' })), '00:10');
    act(() => button(renderer, 'Skip Rest').props.onClick());
    assert.equal(app.data().activeWorkout.restTimer, undefined);
    complete(1);
    assert.equal(app.data().activeWorkout.restTimer.kind, 'exercise');
    assert.equal(app.data().activeWorkout.restTimer.endsAt, endsAt - 10000 + 120000);
    env.tick(app.data().activeWorkout.restTimer.endsAt + 1000);
    assert.equal(text(renderer.root.findByProps({ 'aria-label': 'Rest time remaining' })), '00:00');
    assert.ok(renderer.root.findAllByProps({ role: 'status' }).some(n => text(n).includes('Rest complete')));
    complete(2);
    assert.equal(app.data().activeWorkout.restTimer, undefined);
    env.tick(start + 185000);
    act(() => button(renderer, 'Finish Workout').props.onClick());
    assert.equal(app.data().activeWorkout, undefined);
    assert.equal(app.data().workouts.logs[0].durationSeconds, 185);
    assert.equal(app.data().workouts.logs[0].startedAt, new Date(start).toISOString());
    act(() => button(renderer, 'History').props.onClick());
    assert.ok(text(renderer.root).includes('Duration: 03:05'));
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('resume restores start time and active rest across unmount/remount; numeric edits do not restart rest', () => {
  const env = environment(); let renderer;
  try {
    let app = mountTracker(); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    const row = renderer.root.findAllByType(SetRow)[0];
    act(() => row.props.onChange({ ...row.props.set, completed: true }));
    const active = structuredClone(app.data().activeWorkout);
    act(() => renderer.unmount()); renderer = undefined;
    env.tick(Date.parse(active.startedAt) + 30000);
    app = mountTracker(active); renderer = app.renderer;
    assert.equal(text(renderer.root.findByProps({ 'aria-label': 'Workout elapsed time' })), '00:30');
    assert.equal(app.data().activeWorkout.restTimer.endsAt, active.restTimer.endsAt);
    const editedRow = renderer.root.findAllByType(SetRow)[0];
    act(() => editedRow.props.onChange({ ...editedRow.props.set, weight: 50 }));
    assert.equal(app.data().activeWorkout.restTimer.endsAt, active.restTimer.endsAt);
    act(() => button(renderer, 'All routines').props.onClick());
    assert.equal(env.intervals.size, 0);
    act(() => button(renderer, 'Resume Workout').props.onClick());
    assert.equal(app.data().activeWorkout.startedAt, active.startedAt);
    assert.equal(app.data().activeWorkout.exercises[0].sets[0].weight, 50);
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('editor saves separate rest settings per exercise and rejects negative or excessive seconds', () => {
  let saved, renderer;
  act(() => { renderer = create(React.createElement(Editor, { template, onSave: value => saved = value, onClose() {} })); });
  try {
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press'))[0].props.onClick());
    act(() => renderer.root.findByProps({ id: 'set-rest-bench' }).props.onChange({ target: { value: '75' } }));
    act(() => renderer.root.findByProps({ id: 'exercise-rest-bench' }).props.onChange({ target: { value: '180' } }));
    assert.equal(saved.exercises[0].restBetweenSetsSeconds, 75);
    assert.equal(saved.exercises[0].restAfterExerciseSeconds, 180);
    assert.equal(saved.exercises[1].restBetweenSetsSeconds, 30);
    assert.equal(template.exercises[0].restBetweenSetsSeconds, 60);
    act(() => renderer.root.findByProps({ id: 'set-rest-bench' }).props.onChange({ target: { value: '-5' } }));
    act(() => renderer.root.findByProps({ id: 'exercise-rest-bench' }).props.onChange({ target: { value: '5000' } }));
    assert.equal(saved.exercises[0].restBetweenSetsSeconds, 0);
    assert.equal(saved.exercises[0].restAfterExerciseSeconds, 3600);
  } finally { act(() => renderer.unmount()); }
});

test('per-set reps follow set count, survive saving and backup, and initialize the workout independently', () => {
  const env = environment(); let renderer, saved;
  try {
    act(() => { renderer = create(React.createElement(Editor, { template, onSave: value => saved = value, onClose() {} })); });
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press'))[0].props.onClick());
    const change = (id, value) => act(() => renderer.root.findByProps({ id }).props.onChange({ target: { value } }));
    change('set-count-bench', '3');
    assert.equal(renderer.root.findAll(n => n.type === 'input' && String(n.props.id).startsWith('set-reps-bench-')).length, 3);
    for (const [i, value] of ['12', '10', '8'].entries()) change(`set-reps-bench-${i}`, value);
    assert.deepEqual(saved.exercises[0].defaultRepsBySet, [12, 10, 8]);
    const threeSets = structuredClone(saved);
    change('set-count-bench', '4');
    assert.equal(renderer.root.findByProps({ id: 'set-reps-bench-3' }).props.value, 8);
    change('set-count-bench', '2');
    assert.deepEqual(saved.exercises[0].defaultRepsBySet, [12, 10]);
    act(() => renderer.unmount()); renderer = undefined;
    const app = mountTracker(undefined, threeSets); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    assert.deepEqual(app.data().activeWorkout.exercises[0].sets.map(s => s.reps), [12, 10, 8]);
    for (let i = 0; i < 3; i++) {
      const row = renderer.root.findAllByType(SetRow)[i];
      act(() => row.props.onChange({ ...row.props.set, completed: true }));
    }
    act(() => button(renderer, 'Finish Workout').props.onClick());
    assert.deepEqual(app.data().workouts.logs[0].exercises[0].sets.map(s => s.reps), [12, 10, 8]);
    const backup = { weights: [], measurements: [], strengthPRs: [], skills: [], streak,
      profile: { name: 'Test', startingWeight: 80, height: 175 }, workouts: app.data().workouts };
    const parsed = AppDataSchema.parse(JSON.parse(JSON.stringify(backup)));
    assert.deepEqual(parsed.workouts.templates[0].exercises[0].defaultRepsBySet, [12, 10, 8]);
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('sets and reps can be cleared and retyped without forced defaults or accidental concatenation', () => {
  let renderer, saved;
  act(() => { renderer = create(React.createElement(Editor, { template, onSave: value => saved = value, onClose() {} })); });
  try {
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press'))[0].props.onClick());
    const input = id => renderer.root.findByProps({ id });
    const change = (id, value) => act(() => input(id).props.onChange({ target: { value } }));
    change('set-count-bench', '1');
    change('set-count-bench', '');
    assert.equal(input('set-count-bench').props.value, '');
    change('set-count-bench', '2');
    assert.equal(input('set-count-bench').props.value, '2');
    assert.equal(renderer.root.findAll(n => n.type === 'input' && String(n.props.id).startsWith('set-reps-bench-')).length, 2);
    change('set-reps-bench-0', '');
    assert.equal(input('set-reps-bench-0').props.value, '');
    change('set-reps-bench-0', '1');
    change('set-reps-bench-0', '12');
    assert.equal(saved.exercises[0].defaultSets, 2);
    assert.equal(saved.exercises[0].defaultRepsBySet[0], 12);
    change('set-reps-bench-0', '');
    act(() => input('set-reps-bench-0').props.onBlur());
    assert.equal(input('set-reps-bench-0').props.value, 12);
    change('set-count-bench', '');
    act(() => input('set-count-bench').props.onBlur());
    assert.equal(input('set-count-bench').props.value, 2);
    change('set-count-bench', '12');
    act(() => input('set-count-bench').props.onBlur());
    assert.equal(input('set-count-bench').props.value, 10);
  } finally { act(() => renderer.unmount()); }
});

test('rest completion sounds once, remains fixed at the top, and skip/cancel never sound', () => {
  const env = environment(); let renderer, plays = 0;
  const originalPlay = restAudio.play;
  restAudio.play = () => { plays++; return true; };
  try {
    const app = mountTracker(); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    const complete = i => { const row = renderer.root.findAllByType(SetRow)[i]; act(() => row.props.onChange({ ...row.props.set, completed: true })); };
    complete(0);
    const banner = renderer.root.findByProps({ 'data-testid': 'rest-banner' });
    assert.ok(banner.props.className.includes('fixed inset-x-0 top-0'));
    const endsAt = app.data().activeWorkout.restTimer.endsAt;
    env.tick(endsAt - 1);
    assert.equal(plays, 0);
    env.tick(endsAt);
    assert.equal(plays, 1);
    assert.equal(app.data().activeWorkout.restTimer.notified, true);
    env.tick(endsAt + 10000);
    assert.equal(plays, 1);
    act(() => button(renderer, 'All routines').props.onClick());
    act(() => button(renderer, 'Resume Workout').props.onClick());
    assert.equal(plays, 1);
    complete(1);
    act(() => button(renderer, 'Skip Rest').props.onClick());
    env.tick(endsAt + 300000);
    assert.equal(plays, 1);
    act(() => button(renderer, 'Cancel Workout').props.onClick());
    env.tick(endsAt + 600000);
    assert.equal(plays, 1);
  } finally {
    if (renderer) act(() => renderer.unmount()); restAudio.play = originalPlay; env.restore();
  }
});

test('audio is unlocked on a gesture, generates three short tones, and fails gracefully without support', async () => {
  const env = environment();
  try {
    assert.equal(await createRestAudio().unlock(), false);
    let resumed = 0, started = 0, stopped = 0, disconnected = 0;
    class Audio {
      state = 'suspended'; currentTime = 1; destination = {};
      async resume() { resumed++; this.state = 'running'; }
      createOscillator() { return {
        frequency: { setValueAtTime() {} }, connect() {}, disconnect() { disconnected++; },
        start() { started++; }, stop() { stopped++; this.onended(); },
      }; }
      createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { disconnected++; } }; }
    }
    global.window.AudioContext = Audio;
    const sound = createRestAudio();
    assert.equal(sound.play(), false);
    assert.equal(await sound.unlock(), true);
    assert.equal(sound.play(), true);
    assert.equal(resumed, 1);
    assert.equal(started, 3);
    assert.equal(stopped, 3);
    assert.equal(disconnected, 6);
  } finally { env.restore(); }
});

test('recent workouts includes today and six preceding local dates with last workout calendar-day gap', () => {
  const now = new Date(2026, 9, 23, 0, 5);
  const result = recentWorkoutDays(['2026-10-17', '2026-10-21', '2026-10-21', '2026-10-25', 'bad-date', '2026-02-30'], now);
  assert.deepEqual(result.days.map(d => d.date), ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
  assert.deepEqual(result.days.filter(d => d.workedOut).map(d => d.date), ['2026-10-17', '2026-10-21']);
  assert.equal(result.days[6].weekday, '금');
  assert.equal(result.days[6].isToday, true);
  assert.equal(result.daysSinceLastWorkout, 2);
  assert.equal(recentWorkoutDays(['2026-10-23'], now).daysSinceLastWorkout, 0);
  assert.equal(recentWorkoutDays(['2026-10-01'], now).daysSinceLastWorkout, 22);
  assert.equal(recentWorkoutDays([], now).daysSinceLastWorkout, null);
  const newYear = recentWorkoutDays(['2025-12-31'], new Date(2026, 0, 2, 0, 1));
  assert.equal(newYear.days[0].date, '2025-12-27');
  assert.equal(newYear.daysSinceLastWorkout, 2);
});

test('recent workout card renders seven weekdays, a blue circle for completed days, and empty state', () => {
  const env = environment(); let renderer;
  try {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    act(() => { renderer = create(React.createElement(RecentWorkouts, { workoutDates: [today] })); });
    assert.equal(renderer.root.findAllByType('li').length, 7);
    assert.equal(renderer.root.findAll(n => n.type === 'span' && n.props.className.includes('bg-blue-500')).length, 1);
    assert.ok(text(renderer.root).includes('마지막 운동으로부터 0일'));
    act(() => renderer.update(React.createElement(RecentWorkouts, { workoutDates: [] })));
    assert.ok(text(renderer.root).includes('아직 운동 기록이 없습니다.'));
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('long-press sorting moves exercises in both directions, saves order and keeps exercise settings', () => {
  let renderer, saved;
  const initial = { ...template, exercises: [...structuredClone(template.exercises), { ...template.exercises[1], id: 'squat', name: 'Squat', order: 3 }] };
  act(() => { renderer = create(React.createElement(Editor, { template: initial, onSave: value => saved = value, onClose() {} })); });
  try {
    const context = () => renderer.root.findByType(DndContext.type || DndContext);
    const start = id => act(() => context().props.onDragStart({ active: { id } }));
    const drop = (id, target) => act(() => context().props.onDragEnd({ active: { id }, over: target ? { id: target } : null }));
    const ids = () => renderer.root.findAllByType(SortableExercise).map(n => n.props.id);
    const sensors = context().props.sensors;
    assert.equal(sensors[0].options.activationConstraint.delay, 350);
    assert.equal(sensors[1].options.activationConstraint.tolerance, 8);
    start('bench');
    drop('bench', 'squat');
    assert.deepEqual(ids(), ['fly', 'squat', 'bench']);
    assert.deepEqual(saved.exercises.map(e => e.order), [1, 2, 3]);
    assert.equal(saved.exercises[2].restBetweenSetsSeconds, 60);
    assert.equal(saved.exercises[2].defaultWeight, 40);
    start('bench'); drop('bench', 'fly');
    assert.deepEqual(ids(), ['bench', 'fly', 'squat']);
    start('bench');
    let prevented = false;
    const list = renderer.root.find(n => n.type === 'div' && typeof n.props.onClickCapture === 'function');
    list.props.onClickCapture({ preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, true);
    act(() => context().props.onDragCancel());
    assert.deepEqual(ids(), ['bench', 'fly', 'squat']);
    drop('bench', null);
    assert.deepEqual(ids(), ['bench', 'fly', 'squat']);
    assert.deepEqual(initial.exercises.map(e => e.id), ['bench', 'fly', 'squat']);
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press'))[0].props.onClick());
    assert.ok(renderer.root.findAllByType(SortableExercise).every(n => n.props.disabled));
  } finally { act(() => renderer.unmount()); }
});

test('per-set weights survive resizing, editing, workout start, completion, restart and backup', () => {
  const env = environment(); let renderer, saved;
  try {
    act(() => { renderer = create(React.createElement(Editor, { template, onSave: value => saved = value, onClose() {} })); });
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press'))[0].props.onClick());
    const change = (id, value) => act(() => renderer.root.findByProps({ id }).props.onChange({ target: { value } }));
    change('set-weight-bench-0', '');
    assert.equal(renderer.root.findByProps({ id: 'set-weight-bench-0' }).props.value, '');
    change('set-weight-bench-0', '0');
    change('set-weight-bench-1', '42.5');
    change('set-count-bench', '3');
    assert.equal(renderer.root.findByProps({ id: 'set-weight-bench-2' }).props.value, 42.5);
    change('set-count-bench', '2');
    assert.deepEqual(saved.exercises[0].defaultWeightsBySet, [0, 42.5]);
    act(() => renderer.unmount()); renderer = undefined;
    const app = mountTracker(undefined, saved); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    assert.deepEqual(app.data().activeWorkout.exercises[0].sets.map(s => s.weight), [0, 42.5]);
    for (let i = 0; i < 2; i++) {
      const row = renderer.root.findAllByType(SetRow)[i];
      act(() => row.props.onChange({ ...row.props.set, reps: 11 - i, weight: i === 0 ? 2.5 : 45, completed: true }));
    }
    act(() => button(renderer, 'Finish Workout').props.onClick());
    const updated = app.data().workouts.templates[0].exercises[0];
    assert.deepEqual(updated.defaultRepsBySet, [11, 10]);
    assert.deepEqual(updated.defaultWeightsBySet, [2.5, 45]);
    assert.equal(updated.defaultSets, 2);
    assert.equal(updated.restBetweenSetsSeconds, 60);
    assert.deepEqual(app.data().workouts.templates[0].exercises[1], template.exercises[1]);
    const backup = { weights: [], measurements: [], strengthPRs: [], skills: [], streak,
      profile: { name: 'Test', startingWeight: 80, height: 175 }, workouts: app.data().workouts };
    const parsed = AppDataSchema.parse(JSON.parse(JSON.stringify(backup)));
    assert.deepEqual(parsed.workouts.templates[0].exercises[0].defaultWeightsBySet, [2.5, 45]);
    act(() => button(renderer, 'Start Workout').props.onClick());
    assert.deepEqual(app.data().activeWorkout.exercises[0].sets.map(s => [s.reps, s.weight]), [[11, 2.5], [10, 45]]);
    const row = renderer.root.findAllByType(SetRow)[0];
    act(() => row.props.onChange({ ...row.props.set, reps: 20, weight: 100, completed: true }));
    act(() => button(renderer, 'Cancel Workout').props.onClick());
    assert.deepEqual(app.data().workouts.templates[0].exercises[0], updated);
    assert.equal(app.data().workouts.logs.length, 1);
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('routine updates apply only to the completed routine and completed sets, keeping legacy compatibility', () => {
  const log = { templateId: template.id, exercises: [{ exerciseId: 'bench', sets: [
    { reps: 11, weight: 50, completed: true }, { reps: 99, weight: 100, completed: false },
  ] }] };
  const result = updateRoutineFromWorkout(template, log);
  assert.equal(result.exercises[0].defaultSets, 1);
  assert.deepEqual(result.exercises[0].defaultRepsBySet, [11]);
  assert.deepEqual(result.exercises[0].defaultWeightsBySet, [50]);
  assert.equal(updateRoutineFromWorkout({ ...template, id: 'different' }, log).exercises, template.exercises);
  assert.equal(template.exercises[0].defaultReps, 10);
  const legacy = { ...template, category: 'push' };
  assert.deepEqual(updateRoutineFromWorkout(legacy, { ...log, templateId: undefined, category: 'push', templateType: 'weighted' }).exercises[0].defaultRepsBySet, [11]);
});

test('workout streak calendar maps November 6 to November 6 in Korea and edits the displayed date', () => {
  const RealDate = global.Date, originalTZ = process.env.TZ;
  process.env.TZ = 'Asia/Seoul';
  const fixed = RealDate.parse('2026-11-06T00:05:00+09:00');
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };
  const env = environment();
  let renderer, updated;
  try {
    assert.equal(new Date().getTimezoneOffset(), -540);
    act(() => { renderer = create(React.createElement(StreakCalendar, {
      isOpen: true, onClose() {}, loggingStreak: streak,
      workoutStreak: { ...streak, loggedDates: ['2026-11-06'] },
      onUpdateLoggingStreak() {}, onUpdateWorkoutStreak: value => updated = value,
    })); });
    const cell = day => renderer.root.findAll(n => n.type === 'button' && n.props['data-date'] && n.children.some(child => child.type === 'span' && text(child) === String(day)))[0];
    assert.equal(cell(6).props['data-date'], '2026-11-06');
    assert.equal(cell(6).props['data-workout'], true);
    assert.equal(cell(7).props['data-workout'], false);
    assert.ok(cell(6).props.className.includes('ring-2'));
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Workout'))[0].props.onClick());
    assert.equal(cell(6).props.disabled, false);
    assert.equal(cell(7).props.disabled, true);
    act(() => cell(5).props.onClick());
    assert.ok(updated.loggedDates.includes('2026-11-05'));
    assert.ok(updated.loggedDates.includes('2026-11-06'));
    assert.ok(!updated.loggedDates.includes('2026-11-04'));
    assert.equal(renderer.root.findAll(n => n.type === 'button' && n.props['data-date']).length, 42);
    act(() => renderer.root.findByProps({ 'aria-label': 'Next month' }).props.onClick());
    const decemberCells = renderer.root.findAll(n => n.type === 'button' && n.props['data-date']);
    assert.equal(decemberCells[0].props['data-date'], '2026-11-29');
    assert.ok(decemberCells.every(n => n.props.disabled));
    act(() => renderer.root.findByProps({ 'aria-label': 'Previous month' }).props.onClick());
    assert.equal(cell(6).props['data-workout'], true);
    act(() => renderer.unmount()); renderer = undefined;
    const app = mountTracker(); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    const row = renderer.root.findAllByType(SetRow)[0];
    act(() => row.props.onChange({ ...row.props.set, completed: true }));
    act(() => button(renderer, 'Finish Workout').props.onClick());
    assert.equal(app.data().workouts.logs[0].date, '2026-11-06');
    assert.deepEqual(app.data().workoutStreak.loggedDates, ['2026-11-06']);
  } finally {
    if (renderer) act(() => renderer.unmount()); env.restore(); global.Date = RealDate;
    if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ;
  }
});

test('date-only storage uses local dates at Korean midnight, month and year boundaries', () => {
  const originalTZ = process.env.TZ;
  process.env.TZ = 'Asia/Seoul';
  try {
    assert.equal(formatDateISO(new Date('2026-11-06T00:01:00+09:00')), '2026-11-06');
    assert.equal(formatDateISO(new Date('2026-11-01T00:00:00+09:00')), '2026-11-01');
    assert.equal(formatDateISO(new Date('2027-01-01T00:00:00+09:00')), '2027-01-01');
    assert.equal(formatDateISO(new Date('2026-11-06T23:59:00+09:00')), '2026-11-06');
  } finally { if (originalTZ === undefined) delete process.env.TZ; else process.env.TZ = originalTZ; }
});

test('routine edits autosave without closing and moving exercises preserves settings without duplicates', () => {
  const env = environment(); let renderer;
  try {
    const source = { ...template, exercises: template.exercises.map(e => ({ ...e, defaultRepsBySet: [11, 9], defaultWeightsBySet: [40, 45] })) };
    const target = { ...template, id: 'target', name: 'Target', exercises: [] };
    const app = mountTracker(undefined, [source, target]); renderer = app.renderer;
    act(() => renderer.root.findByProps({ 'aria-label': 'Edit Chest 1' }).props.onClick());
    assert.equal(renderer.root.findAll(n => n.type === 'button' && text(n) === 'Save Routine').length, 0);
    act(() => renderer.root.findByProps({ id: 'routine-name' }).props.onChange({ target: { value: 'Chest A' } }));
    assert.equal(app.data().workouts.templates[0].name, 'Chest A');
    assert.equal(renderer.root.findAllByType(Editor).length, 1);
    act(() => renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press'))[0].props.onClick());
    act(() => renderer.root.findByProps({ id: 'set-reps-bench-0' }).props.onChange({ target: { value: '15' } }));
    assert.equal(app.data().workouts.templates[0].exercises[0].defaultRepsBySet[0], 15);
    const expected = structuredClone(app.data().workouts.templates[0].exercises[0]);
    act(() => renderer.root.findByProps({ id: 'move-bench' }).props.onChange({ target: { value: 'target' } }));
    assert.deepEqual(app.data().workouts.templates[0].exercises.map(e => e.id), ['fly']);
    assert.deepEqual(app.data().workouts.templates[1].exercises[0], { ...expected, order: 1 });
    assert.equal(renderer.root.findAllByType(Editor).length, 1);
    act(() => renderer.root.findByProps({ id: 'move-fly' }).props.onChange({ target: { value: 'target' } }));
    assert.equal(app.data().workouts.templates[0].exercises.length, 0);
    assert.deepEqual(app.data().workouts.templates[1].exercises.map(e => e.id), ['bench', 'fly']);
    assert.deepEqual(app.data().workouts.templates[1].exercises.map(e => e.order), [1, 2]);
    assert.equal(app.data().workouts.logs.length, 0);
    act(() => renderer.root.findByType(Editor).props.onClose());
    act(() => renderer.root.findByProps({ 'aria-label': 'Edit Target' }).props.onClick());
    assert.ok(renderer.root.findAll(n => n.type === 'button' && text(n).startsWith('Bench Press')).length);
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('new named routines and added exercises persist without Save Routine; blank names preserve last valid data', () => {
  const env = environment(); let renderer;
  try {
    const app = mountTracker(); renderer = app.renderer;
    act(() => button(renderer, 'New Routine').props.onClick());
    act(() => renderer.root.findByProps({ id: 'routine-name' }).props.onChange({ target: { value: 'New B' } }));
    assert.equal(app.data().workouts.templates.length, 2);
    act(() => button(renderer, 'Add Exercise').props.onClick());
    assert.equal(app.data().workouts.templates[1].exercises.length, 1);
    act(() => renderer.root.findByProps({ id: 'routine-name' }).props.onChange({ target: { value: '' } }));
    assert.equal(app.data().workouts.templates[1].name, 'New B');
    act(() => renderer.root.findByType(Editor).props.onClose());
    assert.equal(app.data().workouts.templates[1].exercises.length, 1);
  } finally { if (renderer) act(() => renderer.unmount()); env.restore(); }
});

test('time formatting and rest edge cases; new and legacy backups remain compatible', () => {
  assert.equal(formatDuration(3661), '1:01:01');
  assert.equal(formatDuration(-10), '00:00');
  assert.equal(elapsedSeconds('invalid'), 0);
  assert.equal(elapsedSeconds('2026-10-18T00:00:00Z', Date.parse('2026-10-17T00:00:00Z')), 0);
  const previous = { id: 'ex', sets: [{ completed: false }], restBetweenSetsSeconds: 0, restAfterExerciseSeconds: 0 };
  assert.equal(nextRestTimer(previous, { ...previous, sets: [{ completed: true }] }, [{ sets: [{ completed: false }] }]), undefined);
  const backup = { weights: [], measurements: [], strengthPRs: [], skills: [], streak,
    profile: { name: 'Test', startingWeight: 80, height: 175 }, workouts: INITIAL_WORKOUT_DATA };
  assert.ok(AppDataSchema.safeParse(backup).success);
  const log = { id: 'log', category: 'custom', templateType: 'weighted', date: '2026-10-18', durationSeconds: 3661, exercises: [] };
  const updated = { ...backup, workouts: { templates: [template], logs: [log] } };
  const parsed = AppDataSchema.parse(JSON.parse(JSON.stringify(updated)));
  assert.equal(parsed.workouts.logs[0].durationSeconds, 3661);
  assert.equal(parsed.workouts.templates[0].exercises[0].restAfterExerciseSeconds, 120);
  assert.equal(AppDataSchema.safeParse({ ...updated, workouts: { templates: [template], logs: [{ ...log, durationSeconds: -1 }] } }).success, false);
});
