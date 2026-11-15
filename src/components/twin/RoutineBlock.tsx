import { memo, useMemo } from 'react';
import { INDICATOR_ORDER, ROUTINE, ROUTINE_LABEL, type IndicatorId } from '../../brain/indicators';
import { pointsOn, routineFor, streakOn, type RoutineState } from '../../brain/evaluate';
import { useApp } from '../../state/AppState';
import { fmtNumber } from '../../lib/format';

const pad = (n: number) => String(n).padStart(2, '0');

function Check() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
      <polyline points="1,4 4,7 9,1" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/** Today's routine: what is done / due, with streak and points (calm, no confetti). */
export const RoutineBlock = memo(function RoutineBlock() {
  const { data, view, today, now, startCheckIn } = useApp();
  const clock = useMemo(() => ({ today, now }), [today, now]);
  const groups = useMemo(() => routineFor(data.measurements, view.day, clock), [data.measurements, view.day, clock]);
  const streak = useMemo(() => streakOn(data.measurements, view.day, clock), [data.measurements, view.day, clock]);
  const points = useMemo(() => pointsOn(data.measurements, view.day, clock), [data.measurements, view.day, clock]);
  const isToday = view.day === today;

  const tag = (id: IndicatorId, state: RoutineState, dueFromHour: number) => {
    const open = () => startCheckIn(INDICATOR_ORDER.indexOf(id));
    switch (state) {
      case 'done':
        return (
          <span className="rt-state rt-done">
            <Check /> Done
          </span>
        );
      case 'due':
        return (
          <button className="rt-due" onClick={open} aria-label={`${ROUTINE_LABEL[id]} is due now. Open the check-in at this step.`}>
            Due now
          </button>
        );
      case 'later':
        return (
          <button className="rt-later" onClick={open} aria-label={`${ROUTINE_LABEL[id]} is due from ${pad(dueFromHour)}:00. Open the check-in at this step.`}>
            Due {pad(dueFromHour)}:00
          </button>
        );
      case 'missed':
        return <span className="rt-state rt-missed">Missed</span>;
      default:
        return <span className="rt-state muted">—</span>;
    }
  };

  return (
    <section className="routine" aria-label="Today's routine">
      <div className="rt-head">
        <span className="eyebrow">{isToday ? "Today's routine" : `Routine · Day ${fmtNumber(view.day)}`}</span>
      </div>
      <p className="rt-score num">
        Streak: {fmtNumber(streak)} day{streak === 1 ? '' : 's'} · Points: {fmtNumber(points)}
      </p>
      {groups.map((g) => {
        const def = ROUTINE.find((r) => r.slot === g.slot)!;
        return (
          <div key={g.slot} className="rt-group">
            <span className="rt-slot">{def.label}</span>
            <ul className="rt-items">
              {g.items.map((it) => (
                <li key={it.indicatorId} className={`rt-item rt-item-${it.state}`}>
                  <span className="rt-name">{ROUTINE_LABEL[it.indicatorId]}</span>
                  {tag(it.indicatorId, it.state, def.dueFromHour)}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="hint rt-note">+10 points per check. A day with all morning and evening checks adds 1 to the streak.</p>
    </section>
  );
});
