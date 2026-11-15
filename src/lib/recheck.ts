// "Evening re-check" routine item, added only on days the early-warning model warns.
// Separate from evaluate.ts (which must not depend on the forecast) — the forecast stays advisory.
import { forecastDay } from '../brain/forecast';
import { GAMIFICATION, INDICATOR_ORDER, ROUTINE, type IndicatorId } from '../brain/indicators';
import type { Clock, Measurement, RoutineState } from '../brain/evaluate';

/** Evening slot starts at the same hour as the routine's evening checks (18:00). */
export const EVENING_HOUR = ROUTINE.find((g) => g.slot === 'evening')?.dueFromHour ?? 18;

export interface Recheck {
  indicators: IndicatorId[];
  /** "Temperature" / "BP + heart rate" */
  label: string;
  state: RoutineState;
  /** Check-in step to open (first indicator to re-measure). */
  step: number;
}

function eveningReadingOn(ms: Measurement[], id: IndicatorId, day: number, clock: Clock): boolean {
  const limit = clock.now.getTime();
  return ms.some((m) => {
    if (m.indicatorId !== id || m.missionDay !== day) return false;
    const t = new Date(m.timestamp);
    return t.getHours() >= EVENING_HOUR && (day !== clock.today || t.getTime() <= limit);
  });
}

export function eveningRecheck(ms: Measurement[], day: number, clock: Clock): Recheck | null {
  const f = forecastDay(ms, day);
  if (!f?.warn) return null;
  const indicators: IndicatorId[] = f.likely === 'infection' ? ['temp'] : ['bp', 'hr'];
  const done = indicators.every((id) => eveningReadingOn(ms, id, day, clock));
  let state: RoutineState;
  if (done) state = 'done';
  else if (day < clock.today) state = 'missed';
  else if (day > clock.today) state = 'upcoming';
  else state = clock.now.getHours() >= EVENING_HOUR ? 'due' : 'later';
  return {
    indicators,
    label: f.likely === 'infection' ? 'Temperature' : 'BP + heart rate',
    state,
    step: INDICATOR_ORDER.indexOf(indicators[0]),
  };
}

/** +10 points for every completed evening re-check up to `day` (same rate as other checks). */
export function recheckPoints(ms: Measurement[], day: number, clock: Clock): number {
  let n = 0;
  for (let d = 1; d <= day; d++) if (eveningRecheck(ms, d, clock)?.state === 'done') n++;
  return n * GAMIFICATION.pointsPerCheck;
}
