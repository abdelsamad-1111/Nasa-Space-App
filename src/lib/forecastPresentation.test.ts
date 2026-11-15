import { describe, expect, it } from 'vitest';
import { forecastDay, FORECAST_LABEL, rowFor, type DayRow } from '../brain/forecast';
import { demoState } from '../data/storage';
import { describeDriver, forecastPresentation, warningDays } from './forecastPresentation';
import type { Measurement } from '../brain/evaluate';

const measurements = demoState(new Date('2026-11-15T12:00:00Z')).measurements;

describe('Forecast presentation uses the supplied model', () => {
  it.each([5, 17, 18])('preserves model risk and warning on Day %s', (day) => {
    const raw = forecastDay(measurements, day)!;
    const shown = forecastPresentation(measurements, day)!;
    expect(shown.risk).toBe(raw.risk);
    expect(shown.warn).toBe(raw.warn);
    expect(shown.problem).toBe(raw.likely);
    expect(shown.level).toBe(raw.warn ? 'Elevated' : 'Low');
    expect(shown.caption).toBe(FORECAST_LABEL);
  });

  it('turns the actual top two demo drivers into plain directional wording', () => {
    expect(forecastPresentation(measurements, 17)?.drivers).toEqual(['heart rate rising', 'heart rate above your usual']);
    expect(forecastPresentation(measurements, 18)?.drivers).toHaveLength(2);
  });

  it('does not use readings after the selected day', () => {
    const through17 = measurements.filter((reading) => reading.missionDay <= 17);
    expect(forecastPresentation(measurements, 17)).toEqual(forecastPresentation(through17, 17));
  });

  it('does not fabricate a forecast from evening or activity readings', () => {
    const nonMorning = measurements.filter((reading) => ['glucose', 'radiation', 'exercise'].includes(reading.indicatorId));
    expect(forecastPresentation(nonMorning, 18)).toBeNull();
    expect(forecastPresentation([], 18)).toBeNull();
  });

  it('does not call imputed zero features measured stability when history is missing', () => {
    const one: Measurement[] = [{ id: 'one', indicatorId: 'temp', value: 36.6, unit: '°C', missionDay: 1, timestamp: '2026-11-15T07:00:00Z', context: ['Just woke up'] }];
    const shown = forecastPresentation(one, 1)!;
    expect(shown.drivers.join(' ')).not.toMatch(/steady over|near your recent usual|above your usual|below your usual/);
  });

  it('describes the EVA driver as heart-rate context rather than all readings', () => {
    // Tested on the wording directly: which features rank in the top two is the model's decision.
    const noHr = new Map<number, DayRow>([[18, { ...rowFor([], 18), bp_sys: 120 }]]);
    expect(describeDriver('after_eva', 1, noHr, 18)).toBe('heart rate context unavailable');
    const withHr = new Map<number, DayRow>([[18, { ...rowFor([], 18), hr: 70 }]]);
    expect(describeDriver('after_eva', 0, withHr, 18)).toBe('heart rate not marked after EVA');
    expect(describeDriver('after_eva', 1, withHr, 18)).toBe('heart rate recorded after EVA');
  });

  it('uses the plain-word driver map (never raw feature names)', () => {
    const rows = new Map<number, DayRow>();
    for (let d = 1; d <= 18; d++) rows.set(d, { ...rowFor([], d), temp: 36.6, hr: 60, bp_sys: 115, bp_dia: 75, spo2: 98, sleep: 7.5, mood: 4 });
    expect(describeDriver('bp_sys_dev', -2, rows, 18)).toBe('blood pressure below your usual');
    expect(describeDriver('bp_dia_dev', 1, rows, 18)).toBe('diastolic blood pressure above your usual');
    expect(describeDriver('spo2_dev', -1, rows, 18)).toBe('oxygen below your usual');
    expect(describeDriver('sleep_dev', -1, rows, 18)).toBe('less sleep than usual');
    expect(describeDriver('mood_dev', -1, rows, 18)).toBe('mood lower than usual');
    expect(describeDriver('temp_slope', 0.4, rows, 18)).toBe('temperature rising');
    expect(describeDriver('spo2_slope', -1, rows, 18)).toBe('oxygen falling');
  });

  it('gives "Do today" actions and the warning days used by the timeline', () => {
    expect(forecastPresentation(measurements, 17)?.doToday).toEqual(['Drink extra fluids', 'Rest when you can', 'Re-measure temperature tonight']);
    expect(forecastPresentation(measurements, 16)?.doToday).toEqual([]);
    expect(warningDays(measurements, 30).map((w) => w.day)).toContain(17);
    expect(warningDays(measurements, 30).find((w) => w.day === 17)).toMatchObject({ problem: 'infection', riskPercent: 99 });
  });
});
