import { featuresFor, forecastDay, FORECAST_LABEL, rowFor, type ForecastKind, type DayRow } from '../brain/forecast';
import { FORECAST_MODEL } from '../brain/forecastModel';
import type { Measurement } from '../brain/evaluate';

export interface ForecastPresentation {
  risk: number;
  riskPercent: number;
  level: 'Low' | 'Elevated';
  warn: boolean;
  problem: ForecastKind;
  problemLabel: string;
  drivers: string[];
  caption: string;
}

const SIGNAL_NAMES: Record<string, string> = {
  temp: 'temperature',
  hr: 'heart rate',
  bp_sys: 'systolic pressure',
  bp_dia: 'diastolic pressure',
  spo2: 'oxygen saturation',
  sleep: 'sleep duration',
  mood: 'mood',
};

/** Direction comes from the measured feature, not the sign of a model coefficient. */
function driverWords(feature: string, value: number, rows: Map<number, DayRow>, day: number): string {
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
    return `${name} ${value > 0 ? 'rising' : value < 0 ? 'falling' : 'steady over the last 2 days'}`;
  }
  let historyCount = 0;
  for (let d = day - FORECAST_MODEL.window; d < day; d++) {
    if (rows.get(d)?.[signal] != null) historyCount++;
  }
  if (historyCount < FORECAST_MODEL.minHistory) return `limited recent ${name} history`;
  return `${name} ${value > 0 ? 'above your usual' : value < 0 ? 'below your usual' : 'near your recent usual'}`;
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
    return driverWords(feature, features[index] ?? 0, rows, day);
  });
  return {
    risk: forecast.risk,
    riskPercent: Math.round(forecast.risk * 100),
    level: forecast.warn ? 'Elevated' : 'Low',
    warn: forecast.warn,
    problem: forecast.likely,
    problemLabel: forecast.likely === 'infection' ? 'Possible infection starting' : 'Possible fluid loss starting',
    drivers,
    caption: FORECAST_LABEL,
  };
}
