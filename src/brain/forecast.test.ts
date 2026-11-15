import { describe, expect, it } from 'vitest';
import type { Measurement } from './evaluate';
import { featuresFor, forecastDay, predictFromFeatures, type DayRow } from './forecast';
import { FIXTURE_PROBS, FIXTURE_ROWS } from './forecast.fixture';
import { FORECAST_MODEL } from './forecastModel';

const rows = new Map<number, DayRow>(FIXTURE_ROWS.map((r) => [r.day, r as DayRow]));

describe('early-warning model (synthetic training)', () => {
  it('reproduces the Python probabilities for every fixture day', () => {
    expect(FIXTURE_PROBS.length).toBeGreaterThan(40);
    for (const f of FIXTURE_PROBS) {
      const x = featuresFor(rows, f.day);
      expect(x).not.toBeNull();
      const { p } = predictFromFeatures(x!);
      p.forEach((v, i) => expect(Math.abs(v - f.p[i])).toBeLessThan(1e-9));
    }
  });

  it('gives no forecast on a day without a morning check-in', () => {
    const empty: DayRow = { temp: null, hr: null, bp_sys: null, bp_dia: null, spo2: null, sleep: null, mood: null, afterEva: false };
    expect(featuresFor(new Map([[30, empty]]), 30)).toBeNull();
  });

  it('works on app measurements and warns on a rising fever with a rising heart rate', () => {
    const ms: Measurement[] = [];
    const add = (day: number, id: Measurement['indicatorId'], value: Measurement['value']) =>
      ms.push({ id: `${day}-${id}`, indicatorId: id, value, unit: '', timestamp: `2026-01-${String(day).padStart(2, '0')}T07:30:00.000Z`, missionDay: day, context: ['Just woke up'] });
    for (let d = 1; d <= 20; d++) {
      const sick = d >= 19;
      add(d, 'temp', sick ? (d === 19 ? 37.0 : 37.6) : 36.2);
      add(d, 'hr', sick ? (d === 19 ? 66 : 74) : 58);
      add(d, 'bp', { sys: 108, dia: 72 });
      add(d, 'spo2', 98);
      add(d, 'sleep', 6.1);
      add(d, 'mood', 3);
    }
    const quiet = forecastDay(ms, 15)!;
    const f = forecastDay(ms, 20)!;
    expect(quiet.warn).toBe(false);
    expect(f.risk).toBeGreaterThan(quiet.risk);
    expect(f.warn).toBe(true);
    expect(f.likely).toBe('infection');
    expect(f.risk).toBeGreaterThanOrEqual(FORECAST_MODEL.threshold);
  });
});
