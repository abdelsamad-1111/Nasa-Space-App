// VITALS-ORBIT — demo mission generator (section 7).
// 30-day ISS mission for "Astronaut A. Rahman". Hand-tuned daily values so the
// story (adaptation → sleep debt → infection pattern → solar event → recovery)
// is deterministic.
import { metricDef, type MetricId } from '../brain/indicators';
import type { Measurement, Settings } from '../brain/evaluate';

export const MISSION_LENGTH = 30;
export const DEMO_FIRST_DAY = 18;

export const DEMO_SETTINGS: Settings = {
  name: 'Astronaut A. Rahman',
  location: 'ISS',
  baselines: {
    bp: { sys: 116, dia: 74 },
    hr: 58,
    temp: 36.6,
    spo2: 98,
    glucose: 92,
    sleep: 7.8,
    mood: 4,
  },
  careerRadiationLimit: 600,
};

export interface MissionEvent {
  day: number;
  caption: string;
}

export const MISSION_EVENTS: MissionEvent[] = [
  { day: 12, caption: 'Sleep debt building' },
  { day: 18, caption: 'Pattern detected: possible infection' },
  { day: 22, caption: 'Solar event: radiation spike' },
  { day: 26, caption: 'Recovery' },
];

// day: [sys, dia, hr, temp, spo2, glucose, sleep, mood, radiation, context]
type Row = [number, number, number, number, number, number, number, number, number, string[]?];

/** Days on which the evening dosimeter check was missed (streak break). */
export const EVENING_MISSED = [15, 16, 17];

// Daily leg exercise in minutes (target 150 = 2 h 30 min), days 1–30.
const EXERCISE_MIN = [
  150, 145, 155, 150, 160, 150, 155, // 1–7 adaptation
  150, 140, 125, 120, 115, 110, 120, // 8–14 sleep debt: less exercise
  115, 110, 100, 130, 60, 85, 120, // 15–21 infection (day 18: 2 h 10 min)
  95, 140, 145, 150, 155, 150, 150, 160, 150, // 22 solar event (sheltering), 23–30 recovery
];

const ROWS: Row[] = [
  /* 1 */ [118, 76, 62, 36.6, 98, 94, 7.2, 4, 0.48],
  /* 2 */ [121, 77, 64, 36.7, 97, 98, 7.0, 4, 0.52],
  /* 3 */ [119, 76, 61, 36.6, 98, 90, 7.4, 4, 0.5],
  /* 4 */ [117, 75, 60, 36.5, 98, 88, 7.6, 4, 0.47],
  /* 5 */ [116, 74, 59, 36.6, 98, 93, 7.8, 4, 0.51],
  /* 6 */ [115, 73, 58, 36.6, 99, 91, 7.9, 4, 0.49],
  /* 7 */ [116, 74, 57, 36.7, 98, 95, 7.7, 4, 0.5],
  /* 8 */ [117, 75, 59, 36.6, 98, 92, 7.6, 4, 0.52],
  /* 9 */ [128, 80, 104, 36.6, 98, 94, 7.3, 4, 0.48, ['After EVA']],
  /* 10 */ [118, 76, 60, 36.7, 98, 96, 6.8, 4, 0.5],
  /* 11 */ [119, 76, 62, 36.6, 97, 93, 6.2, 3, 0.51],
  /* 12 */ [120, 77, 61, 36.7, 97, 95, 5.6, 2, 0.49],
  /* 13 */ [119, 77, 64, 36.6, 97, 92, 5.8, 2, 0.5],
  /* 14 */ [120, 78, 63, 36.7, 97, 94, 5.5, 2, 0.52],
  /* 15 */ [118, 77, 62, 36.6, 97, 96, 5.9, 2, 0.48],
  /* 16 */ [119, 77, 64, 36.8, 97, 93, 6.0, 2, 0.5],
  /* 17 */ [120, 78, 68, 37.2, 97, 98, 5.8, 2, 0.51],
  /* 18 */ [122, 79, 78, 38.3, 96, 101, 5.4, 2, 0.49],
  /* 19 */ [120, 78, 72, 37.8, 97, 96, 5.9, 2, 0.5],
  /* 20 */ [118, 76, 66, 37.3, 97, 94, 6.6, 3, 0.52],
  /* 21 */ [117, 75, 62, 36.9, 98, 92, 7.0, 3, 0.49],
  /* 22 */ [118, 76, 64, 36.8, 98, 95, 7.2, 3, 2.5],
  /* 23 */ [117, 75, 61, 36.7, 98, 93, 7.4, 4, 0.9],
  /* 24 */ [116, 74, 60, 36.6, 98, 92, 7.6, 4, 0.52],
  /* 25 */ [117, 75, 59, 36.6, 98, 94, 7.7, 4, 0.5],
  /* 26 */ [116, 74, 58, 36.6, 98, 91, 7.9, 4, 0.48],
  /* 27 */ [115, 74, 58, 36.5, 98, 93, 7.8, 4, 0.51],
  /* 28 */ [116, 73, 57, 36.6, 99, 90, 7.8, 4, 0.49],
  /* 29 */ [117, 75, 58, 36.6, 98, 92, 8.0, 4, 0.5],
  /* 30 */ [116, 74, 58, 36.6, 98, 94, 7.8, 4, 0.5],
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mission start so that `today` is mission day DEMO_FIRST_DAY. */
export function defaultMissionStart(today = new Date()): string {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() - (DEMO_FIRST_DAY - 1) * DAY_MS).toISOString();
}

export function missionDayFor(startIso: string, at = new Date()): number {
  const start = new Date(startIso).getTime();
  return Math.floor((at.getTime() - start) / DAY_MS) + 1;
}

export function generateDemoMission(startIso: string): Measurement[] {
  const start = new Date(startIso).getTime();
  const out: Measurement[] = [];
  ROWS.forEach((r, i) => {
    const day = i + 1;
    const [sys, dia, hr, temp, spo2, glucose, sleep, mood, rad, ctx] = r;
    const context = ctx ?? (['Just woke up'] as string[]);
    const base = start + i * DAY_MS + 7 * 60 * 60 * 1000 + 30 * 60 * 1000; // 07:30
    const add = (indicatorId: MetricId, value: Measurement['value'], minute: number, c: string[]) =>
      out.push({
        id: `demo-${day}-${indicatorId}`,
        indicatorId,
        value,
        unit: metricDef(indicatorId).unit,
        timestamp: new Date(base + minute * 60 * 1000).toISOString(),
        missionDay: day,
        context: c,
      });
    add('bp', { sys, dia }, 0, context);
    add('hr', hr, 1, context);
    add('temp', temp, 2, ['Just woke up']);
    add('spo2', spo2, 3, ['Just woke up']);
    add('glucose', glucose, 4, ['Just woke up']);
    add('sleep', sleep, 5, ['Just woke up']);
    add('mood', mood, 6, ['Just woke up']);
    // Evening dosimeter check (19:00). Missed on days 15–17 (sick): the streak breaks, then recovers.
    if (!EVENING_MISSED.includes(day)) add('radiation', rad, 11.5 * 60, ['None']);
    add('exercise', EXERCISE_MIN[i], 8, ['None']);
  });
  return out;
}
