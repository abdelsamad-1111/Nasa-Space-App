import { describe, expect, it } from 'vitest';
import { buildReport } from './report';
import { demoState, emptyState } from '../data/storage';
import { exerciseMeasurement } from './exerciseLog';

describe('Report coverage and provenance', () => {
  it('discloses missing observations and distinguishes simulated data', () => {
    const empty = buildReport(emptyState(), 1, []);
    expect(empty).toContain('0 of 8 indicators measured');
    expect(empty).toContain('assessment is incomplete');
    expect(empty).not.toContain('DEMO SCENARIO');
    expect(buildReport(demoState(), 18, [])).toContain('DEMO SCENARIO');
  });

  it('reports the revised exercise daily total rather than adding old totals', () => {
    const state = emptyState();
    const previous = exerciseMeasurement({ minutes: 60, missionDay: 1, savedAt: new Date('2026-11-15T08:00:00Z') });
    const current = exerciseMeasurement({ minutes: 90, missionDay: 1, previous, savedAt: new Date('2026-11-15T09:00:00Z') });
    const report = buildReport({ ...state, measurements: [previous, current] }, 1, []);
    expect(report).toContain('Daily exercise totals: Day 1: 1 h 30 min');
    expect(report).not.toContain('Day 1: 2 h 30 min');
  });
});
