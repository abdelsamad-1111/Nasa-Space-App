/**
 * Early-warning model (runs in the browser, no server).
 *
 * Question: will an infection or a fluid-loss episode peak in the next 2 days,
 * and which one is more likely?
 *
 * The weights in forecastModel.ts were trained on SYNTHETIC data
 * (research-based, not real astronaut measurements, not clinical validation).
 * Training and evaluation: scripts/synthetic/forecast/ and scripts/synthetic/out/FORECAST.md.
 *
 * Features must match scripts/synthetic/forecast/train_forecast.py exactly:
 *   for temp, hr, bp_sys, bp_dia, spo2, sleep, mood:
 *     dev   = today − median(previous 14 days, ≥ 5 values; else 0)
 *     slope = today − value 2 days ago (else 0)
 *   after_eva = HR/BP measured right after an EVA.
 *   No forecast on a day without any morning reading.
 */
import { dailyValue, isBp, type Measurement } from './evaluate';
import { FORECAST_MODEL as M } from './forecastModel';

export type ForecastKind = 'infection' | 'fluid_loss';

export interface Forecast {
  missionDay: number;
  /** P(infection) + P(fluid loss) within the next 2 days, 0–1. */
  risk: number;
  probabilities: { none: number; infection: number; fluid_loss: number };
  warn: boolean;
  likely: ForecastKind;
  /** Features that pushed the likely class up the most (largest positive contribution). */
  drivers: { feature: string; contribution: number }[];
}

export type DayRow = {
  temp: number | null; hr: number | null; bp_sys: number | null; bp_dia: number | null;
  spo2: number | null; sleep: number | null; mood: number | null; afterEva: boolean;
};

const SIGNALS = ['temp', 'hr', 'bp_sys', 'bp_dia', 'spo2', 'sleep', 'mood'] as const;
type Signal = (typeof SIGNALS)[number];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** One row per mission day from app measurements (latest reading of the day). */
export function rowFor(ms: Measurement[], day: number): DayRow {
  const v = (id: 'temp' | 'hr' | 'spo2' | 'sleep' | 'mood') => {
    const m = dailyValue(ms, id, day);
    return m && typeof m.value === 'number' ? m.value : null;
  };
  const bp = dailyValue(ms, 'bp', day);
  const hr = dailyValue(ms, 'hr', day);
  return {
    temp: v('temp'), hr: v('hr'), spo2: v('spo2'), sleep: v('sleep'), mood: v('mood'),
    bp_sys: bp && isBp(bp.value) ? bp.value.sys : null,
    bp_dia: bp && isBp(bp.value) ? bp.value.dia : null,
    afterEva: !!hr && hr.context.includes('After EVA'),
  };
}

/** Feature vector for `day`, or null when there is no morning reading that day. */
export function featuresFor(rows: Map<number, DayRow>, day: number): number[] | null {
  const today = rows.get(day);
  if (!today || SIGNALS.every((k) => today[k] === null)) return null;
  const dev: number[] = [];
  const slope: number[] = [];
  for (const k of SIGNALS as readonly Signal[]) {
    const t = today[k];
    const prev: number[] = [];
    for (let d = day - M.window; d < day; d++) {
      const x = rows.get(d)?.[k];
      if (x !== null && x !== undefined) prev.push(x);
    }
    dev.push(t === null || prev.length < M.minHistory ? 0 : t - median(prev));
    const back = rows.get(day - M.slopeGap)?.[k];
    slope.push(t === null || back === null || back === undefined ? 0 : t - back);
  }
  return [...dev, ...slope, today.afterEva ? 1 : 0];
}

export function predictFromFeatures(x: number[]) {
  const z = x.map((v, i) => (v - M.mean[i]) / M.std[i]);
  const logits = M.coef.map((row, c) => M.intercept[c] + row.reduce((s, w, i) => s + w * z[i], 0));
  const top = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - top));
  const sum = e.reduce((a, b) => a + b, 0);
  const p = e.map((v) => v / sum);
  return { p, z };
}

/** Forecast for one mission day (null if no morning reading that day). */
export function forecastDay(ms: Measurement[], day: number): Forecast | null {
  const rows = new Map<number, DayRow>();
  for (let d = day - M.window; d <= day; d++) if (d >= 1) rows.set(d, rowFor(ms, d));
  const x = featuresFor(rows, day);
  if (!x) return null;
  const { p } = predictFromFeatures(x);
  const risk = p[1] + p[2];
  const likely: ForecastKind = p[1] >= p[2] ? 'infection' : 'fluid_loss';
  const cls = likely === 'infection' ? 1 : 2;
  // Contribution measured from "no change" (feature = 0: reading equal to the usual value, not after an EVA),
  // so a feature that is simply absent today is never listed as a driver.
  const drivers = M.features
    .map((feature, i) => ({ feature, contribution: ((M.coef[cls][i] - M.coef[0][i]) * x[i]) / M.std[i] }))
    .filter((d) => d.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
  return {
    missionDay: day,
    risk,
    probabilities: { none: p[0], infection: p[1], fluid_loss: p[2] },
    warn: risk >= M.threshold,
    likely,
    drivers,
  };
}

export const FORECAST_LABEL = 'Early warning trained on synthetic data — not a diagnosis.';
