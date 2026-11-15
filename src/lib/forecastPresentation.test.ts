import { describe, expect, it } from 'vitest';
import { forecastDay, FORECAST_LABEL } from '../brain/forecast';
import { demoState } from '../data/storage';
import { forecastPresentation } from './forecastPresentation';
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
    const readings: Measurement[] = Array.from({ length: 18 }, (_, index) => ({
      id: `temp-${index + 1}`, indicatorId: 'temp', value: [16, 18].includes(index + 1) ? 38.9 : 36.5,
      unit: '°C', missionDay: index + 1, timestamp: '2026-11-15T07:00:00Z', context: ['Just woke up'],
    }));
    readings.push({ id: 'bp-eva', indicatorId: 'bp', value: { sys: 120, dia: 80 }, unit: 'mmHg', missionDay: 18, timestamp: '2026-11-15T07:00:00Z', context: ['After EVA'] });
    expect(forecastPresentation(readings, 18)?.drivers).toContain('heart rate context unavailable');
    readings.push({ id: 'hr', indicatorId: 'hr', value: 70, unit: 'bpm', missionDay: 18, timestamp: '2026-11-15T07:00:00Z', context: ['At rest'] });
    expect(forecastPresentation(readings, 18)?.drivers).toContain('heart rate not marked after EVA');
  });
});
