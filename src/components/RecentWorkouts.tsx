import { useEffect, useState } from 'react';
import { recentWorkoutDays } from '../utils/recentWorkouts';

interface RecentWorkoutsProps {
  workoutDates: string[];
}

export default function RecentWorkouts({ workoutDates }: RecentWorkoutsProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const { days, daysSinceLastWorkout } = recentWorkoutDays(workoutDates, now);

  return (
    <section className="card p-4" aria-label="최근 7일 운동">
      <h2 className="font-display font-semibold text-text-primary mb-4">최근 7일 운동</h2>
      <ol className="grid grid-cols-7 gap-1">
        {days.map(day => (
          <li key={day.date} className="flex flex-col items-center gap-1" aria-label={`${day.date} ${day.weekday}요일, ${day.workedOut ? '운동함' : '운동 기록 없음'}${day.isToday ? ', 오늘' : ''}`} aria-current={day.isToday ? 'date' : undefined}>
            <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${day.workedOut ? 'bg-blue-500 text-white' : 'bg-bg-tertiary text-text-muted'}`}>
              {day.weekday}
            </span>
            <span className="text-xs text-text-muted">{day.dayOfMonth}</span>
            <span className={`text-xs ${day.isToday ? 'text-blue-500' : 'invisible'}`}>오늘</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-text-muted">
        {daysSinceLastWorkout === null ? '아직 운동 기록이 없습니다.' : `마지막 운동으로부터 ${daysSinceLastWorkout}일`}
      </p>
    </section>
  );
}
