import { featuresFor, forecastDay, FORECAST_LABEL, rowFor, type ForecastKind, type DayRow } from '../brain/forecast';
import { FORECAST_MODEL } from '../brain/forecastModel';
import type { Measurement } from '../brain/evaluate';
import type { Location } from '../brain/indicators';

export interface ForecastPresentation {
  risk: number;
  riskPercent: number;
  level: 'Low' | 'Elevated';
  warn: boolean;
  problem: ForecastKind;
  /** "Possible infection starting" */
  problemLabel: string;
  /** "possible infection starting" (used after "Elevated · ") */
  problemShort: string;
  /** Top 2 drivers in plain words — never raw feature names. */
  drivers: string[];
  /** Up to 3 "Do today" actions for the likely problem (shown only when Elevated). */
  doToday: string[];
  caption: string;
}

/** Ending for every assistant answer that uses the forecast. */
export const FORECAST_ANSWER_END = 'Trained on synthetic data — not a diagnosis.';
export const MARS_FORECAST_NOTE = 'Start these steps now — Earth reply can take ~20 min.';

export const DO_TODAY: Record<ForecastKind, string[]> = {
  infection: ['Drink extra fluids', 'Rest when you can', 'Re-measure temperature tonight'],
  fluid_loss: ['Drink extra fluids', 'Avoid standing up quickly', 'Re-measure BP and heart rate tonight'],
};

export const PROBLEM_LABEL: Record<ForecastKind, string> = {
  infection: 'possible infection starting',
  fluid_loss: 'possible fluid loss starting',
};

/** Short name used in timeline tooltips and alerts: "possible infection". */
export const PROBLEM_NAME: Record<ForecastKind, string> = {
  infection: 'possible infection',
  fluid_loss: 'possible fluid loss',
};

const SIGNAL_NAMES: Record<string, string> = {
  temp: 'temperature',
  hr: 'heart rate',
  bp_sys: 'blood pressure',
  bp_dia: 'diastolic blood pressure',
  spo2: 'oxygen',
  sleep: 'sleep',
  mood: 'mood',
};

/**
 * Plain words for one model driver. Direction comes from the measured feature value, not the
 * sign of a coefficient; missing data is said as missing, never as "stable".
 */
export function describeDriver(feature: string, value: number, rows: Map<number, DayRow>, day: number): string {
  if (feature === 'after_eva') {
    if (rows.get(day)?.hr == null) return 'heart rate context unavailable';
    return value > 0 ? 'heart rate recorded after EVA' : 'heart rate not marked after EVA';
  }
  const suffix = feature.endsWith('_dev') ? '_dev' : '_slope';
  const signal = feature.slice(0, -suffix.length) as keyof Omit<DayRow, 'afterEva'>;
  const name = SIGNAL_NAMES[signal];
  if (!name) return 'recent readings contributed to the warning';
  if (rows.get(day)?.[signal] == null) return `${name} not recorded today`;
  if (suffix === '_slope') {
    if (rows.get(day - FORECAST_MODEL.slopeGap)?.[signal] == null) return `${name} trend unavailable`;
    return value > 0 ? `${name} rising` : value < 0 ? `${name} falling` : `${name} steady over the last 2 days`;
  }
  let historyCount = 0;
  for (let d = day - FORECAST_MODEL.window; d < day; d++) {
    if (rows.get(d)?.[signal] != null) historyCount++;
  }
  if (historyCount < FORECAST_MODEL.minHistory) return `limited recent ${name} history`;
  if (value === 0) return `${name} near your recent usual`;
  if (signal === 'sleep') return value > 0 ? 'more sleep than usual' : 'less sleep than usual';
  if (signal === 'mood') return value > 0 ? 'mood higher than usual' : 'mood lower than usual';
  return `${name} ${value > 0 ? 'above your usual' : 'below your usual'}`;
}

/** Presentation only: uses the supplied model result and leaves its threshold and inputs unchanged. */
export function forecastPresentation(measurements: Measurement[], day: number): ForecastPresentation | null {
  const forecast = forecastDay(measurements, day);
  if (!forecast) return null;
  const rows = new Map<number, DayRow>();
  for (let d = Math.max(1, day - FORECAST_MODEL.window); d <= day; d++) rows.set(d, rowFor(measurements, d));
  const features = featuresFor(rows, day)!;
  const drivers = forecast.drivers.slice(0, 2).map(({ feature }) => {
    const index = FORECAST_MODEL.features.findIndex((name) => name === feature);
    return describeDriver(feature, features[index] ?? 0, rows, day);
  });
  const short = PROBLEM_LABEL[forecast.likely];
  return {
    risk: forecast.risk,
    riskPercent: Math.round(forecast.risk * 100),
    level: forecast.warn ? 'Elevated' : 'Low',
    warn: forecast.warn,
    problem: forecast.likely,
    problemLabel: short.charAt(0).toUpperCase() + short.slice(1),
    problemShort: short,
    drivers,
    doToday: forecast.warn ? DO_TODAY[forecast.likely] : [],
    caption: FORECAST_LABEL,
  };
}

/** "Elevated · possible infection starting" / "Low" */
export function forecastHeadline(f: ForecastPresentation): string {
  return f.warn ? `Elevated · ${f.problemShort}` : 'Low';
}

/** Extra line on Mars when the warning is Elevated (Earth reply can take ~20 min). */
export function forecastLocationNote(f: ForecastPresentation | null, location: Location): string | null {
  return f?.warn && location === 'MARS' ? MARS_FORECAST_NOTE : null;
}

export interface WarningDay {
  day: number;
  problem: ForecastKind;
  riskPercent: number;
}

/** Every mission day (1…maxDay) on which the model warns, with its likely problem and risk. */
export function warningDays(measurements: Measurement[], maxDay: number): WarningDay[] {
  const out: WarningDay[] = [];
  for (let d = 1; d <= maxDay; d++) {
    const f = forecastDay(measurements, d);
    if (f?.warn) out.push({ day: d, problem: f.likely, riskPercent: Math.round(f.risk * 100) });
  }
  return out;
}
