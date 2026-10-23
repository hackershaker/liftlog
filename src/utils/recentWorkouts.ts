const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const dayMs = 86400000;

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Compare calendar dates rather than elapsed hours, including across DST changes.
function ordinal(key: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== key) return null;
  return date.getTime() / dayMs;
}

export function recentWorkoutDays(workoutDates: string[], now = new Date()) {
  const today = ordinal(dateKey(now))!;
  const validDates = workoutDates.filter(date => {
    const value = ordinal(date);
    return value !== null && value <= today;
  });
  const completed = new Set(validDates);
  const lastDate = validDates.length ? [...completed].sort().slice(-1)[0] : null;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + index);
    const key = dateKey(date);
    return { date: key, weekday: weekdays[date.getDay()], dayOfMonth: date.getDate(), isToday: index === 6, workedOut: completed.has(key) };
  });
  return { days, daysSinceLastWorkout: lastDate ? today - ordinal(lastDate)! : null };
}
