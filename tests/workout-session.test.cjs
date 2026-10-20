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
    const [workouts, setWorkouts] = React.useState({ templates: structuredClone([initialTemplate]), logs: [] });
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
    act(() => button(renderer, 'Save Routine').props.onClick());
    assert.equal(saved.exercises[0].restBetweenSetsSeconds, 75);
    assert.equal(saved.exercises[0].restAfterExerciseSeconds, 180);
    assert.equal(saved.exercises[1].restBetweenSetsSeconds, 30);
    assert.equal(template.exercises[0].restBetweenSetsSeconds, 60);
    act(() => renderer.root.findByProps({ id: 'set-rest-bench' }).props.onChange({ target: { value: '-5' } }));
    act(() => renderer.root.findByProps({ id: 'exercise-rest-bench' }).props.onChange({ target: { value: '5000' } }));
    act(() => button(renderer, 'Save Routine').props.onClick());
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
    act(() => button(renderer, 'Save Routine').props.onClick());
    assert.deepEqual(saved.exercises[0].defaultRepsBySet, [12, 10, 8]);
    const threeSets = structuredClone(saved);
    change('set-count-bench', '4');
    assert.equal(renderer.root.findByProps({ id: 'set-reps-bench-3' }).props.value, 8);
    change('set-count-bench', '2');
    act(() => button(renderer, 'Save Routine').props.onClick());
    assert.deepEqual(saved.exercises[0].defaultRepsBySet, [12, 10]);
    act(() => renderer.unmount()); renderer = undefined;
    const app = mountTracker(undefined, threeSets); renderer = app.renderer;
    act(() => button(renderer, 'Start Workout').props.onClick());
    assert.deepEqual(app.data().activeWorkout.exercises[0].sets.map(s => s.reps), [12, 10, 8]);
    const row = renderer.root.findAllByType(SetRow)[0];
    act(() => row.props.onChange({ ...row.props.set, completed: true }));
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
    act(() => button(renderer, 'Save Routine').props.onClick());
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
