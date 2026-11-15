import { describe, expect, it } from 'vitest';
import { ESCALATION } from '../brain/indicators';
import { buildReport, buildReportModel, reportToText } from './report';
import { demoState, emptyState } from '../data/storage';
import { exerciseMeasurement } from './exerciseLog';
import { detectPatterns, evaluateDay, summarizeAssessment } from '../brain/evaluate';
import { FORECAST_LABEL } from '../brain/forecast';
import { forecastPresentation } from './forecastPresentation';

const NOW = new Date(Date.UTC(2026, 10, 15, 14, 32));
const demo = () => demoState(new Date(2026, 10, 15, 9));

describe('Report coverage and provenance', () => {
  it('discloses missing observations and distinguishes simulated data', () => {
    const empty = buildReportModel(emptyState(), 1, NOW);
    expect(empty.measured).toBe(0);
    expect(reportToText(empty)).toContain('0 of 8 (incomplete assessment');
    expect(empty.dataSource).not.toContain('DEMO');
    expect(buildReportModel(demo(), 18, NOW).dataSource).toBe('Crew self-measurements (DEMO, simulated)');
  });

  it('reports the revised exercise daily total rather than adding old totals', () => {
    const state = emptyState();
    const previous = exerciseMeasurement({ minutes: 60, missionDay: 1, savedAt: new Date('2026-11-15T08:00:00Z') });
    const current = exerciseMeasurement({ minutes: 90, missionDay: 1, previous, savedAt: new Date('2026-11-15T09:00:00Z') });
    const r = buildReportModel({ ...state, measurements: [previous, current] }, 1, NOW);
    const exercise = r.vitals.find((v) => v.id === 'exercise')!;
    expect(exercise.cells[6].text).toBe('90');
  });
});

describe('Report-day synthetic early warning', () => {
  it.each([17, 18])('uses Day %i observations, preserves rule status and includes the forecast in copied text', (day) => {
    const state = demo();
    const expected = forecastPresentation(state.measurements, day)!;
    expect(expected).not.toBeNull();
    const report = buildReportModel(state, day, NOW);
    const observed = summarizeAssessment(evaluateDay(state.measurements, day, state.settings), detectPatterns(state.measurements, day));

    expect(report.summary.earlyWarning).toContain(`Early warning (next 48 h): ${expected.level}`);
    expect(report.summary.earlyWarning).not.toMatch(/\d+%/);
    expect(report.summary.earlyWarning).toContain(FORECAST_LABEL);
    if (expected.warn) {
      expect(report.summary.earlyWarning).toContain(`Elevated — ${expected.problemShort} (`);
      for (const driver of expected.drivers.slice(0, 2)) expect(report.summary.earlyWarning).toContain(driver);
    }
    expect(report.summary.status).toBe(observed.status);
    expect([report.measured, report.total]).toEqual([observed.measured, observed.total]);
    expect(reportToText(report)).toContain(report.summary.earlyWarning);

    const withoutFuture = { ...state, measurements: state.measurements.filter((m) => m.missionDay <= day) };
    expect(buildReportModel(withoutFuture, day, NOW).summary.earlyWarning).toBe(report.summary.earlyWarning);
  });

  it('labels Low risk without presenting a possible illness or warning drivers', () => {
    const report = buildReportModel(demo(), 1, NOW);
    expect(report.summary.earlyWarning).toMatch(/^Early warning \(next 48 h\): Low\./);
    expect(report.summary.earlyWarning).not.toMatch(/possible/i);
    expect(report.summary.earlyWarning).not.toContain('drivers:');
    expect(report.summary.earlyWarning).toContain(FORECAST_LABEL);
  });

  it('reports a missing forecast instead of inventing Low risk when the check-in is absent', () => {
    const report = buildReportModel(emptyState(), 18, NOW);
    expect(report.summary.earlyWarning).toBe('Early warning (next 48 h): No forecast — morning check-in missing.');
    expect(report.summary.earlyWarning).not.toContain('Low');
    expect(report.summary.status).toBeNull();
    expect(report.measured).toBe(0);
    expect(report.alerts).toHaveLength(0);
    expect(reportToText(report)).toContain(report.summary.earlyWarning);
  });
});

describe('Crew Health Report, demo Day 20', () => {
  const r = buildReportModel(demo(), 20, NOW);

  it('header and info grid', () => {
    expect(r.id).toBe('VO-ISS-ARA-D20');
    expect(r.generatedUtc).toBe('15 Nov 2026, 14:32 UTC');
    expect(r.crew).toBe('A. Rahman');
    expect([r.from, r.day, r.measured, r.total]).toEqual([14, 20, 8, 8]);
  });

  it('clinical summary: persistent issues, fever resolved, suggested review', () => {
    expect(r.summary.status).toBe('ACT');
    expect(r.summary.lines[0]).toMatch(/^Sleep below 7 h for 7 days, low mood for 6 days/);
    expect(r.summary.lines[1]).toBe('Fever on Day 18 (38.3 °C), resolved by Day 20.');
    expect(r.summary.lines[2]).toMatch(/^Suggested review: sleep and workload, psychological support/);
  });

  it('vital signs: exactly 7 day columns, H / L flags, missing values as —', () => {
    expect(r.days).toEqual([14, 15, 16, 17, 18, 19, 20]);
    const row = (id: string) => r.vitals.find((v) => v.id === id)!;
    expect(r.vitals.every((v) => v.cells.length === 7)).toBe(true);
    expect(row('temp').cells[4]).toMatchObject({ text: '38.3', flag: 'H' });
    expect(row('temp').cells[6]).toMatchObject({ text: '37.3', flag: null });
    expect(row('sleep').cells.every((c) => c.flag === 'L')).toBe(true);
    expect(row('radiation').cells[1].text).toBe('—'); // evening dosimeter check missed on day 15
    expect(row('bp').reference).toBe('90–119/60–79');
    expect(row('exercise').status).toBe('ACT'); // 85 min = 57 % of 150
    expect(r.dose.cumulative).toBeCloseTo(8.5, 1);
  });

  it('alerts: one row per indicator per day, each rule with its own reason', () => {
    const keys = r.alerts.map((a) => `${a.day}-${a.indicator}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(r.alerts.every((a) => a.day >= 14 && a.day <= 20)).toBe(true);
    const sleep14 = r.alerts.find((a) => a.day === 14 && a.indicator === 'Sleep')!;
    expect(sleep14.reason).toBe('below 7 h for 3+ days; unusual for you (−29% vs baseline)');
    expect(sleep14.state).toBe('Open');
    const temp18 = r.alerts.find((a) => a.day === 18 && a.indicator === 'Body temperature')!;
    expect(temp18.reason).toBe('above reference range; worse 3 readings in a row');
    expect(temp18.state).toBe('Resolved');
  });

  it('patterns and actions', () => {
    expect(r.patterns.map((p) => p.day)).toEqual([18, 19]);
    expect(r.patterns[0].escalation).toBe(ESCALATION.ISS);
    expect(r.actions.map((a) => `${a.day} ${a.action}`)).toEqual([
      '18 Body temperature: Drank extra fluids',
      '18 Body temperature: Re-measured temperature after 4 h',
      '19 Body temperature: Rested 2 h',
      '19 Body temperature: Drank extra fluids',
    ]);
  });

  it('early days still show 7 columns', () => {
    const early = buildReportModel(demo(), 3, NOW);
    expect(early.days).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    expect(early.vitals[0].cells[0].text).toBe('—');
    expect(early.from).toBe(1);
  });

  it('text version for "Copy text"', () => {
    const text = buildReport(demo(), 20, NOW);
    expect(text).toContain('VO-ISS-ARA-D20');
    expect(text).toContain('Reviewed by: ____________');
    expect(text).toContain('Not a medical diagnosis.');
  });
});
