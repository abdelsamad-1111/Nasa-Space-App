import { dailyValue } from '../brain/evaluate';
import { exerciseMeasurement, parseExerciseMinutes } from './exerciseLog';

describe('Exercise log input', () => {
  it('accepts zero, a full day and Arabic digits with decimal separators', () => {
    expect(parseExerciseMinutes('0')).toBe(0);
    expect(parseExerciseMinutes('1440')).toBe(1440);
    expect(parseExerciseMinutes('١٢٠٫٥')).toBe(120.5);
    expect(parseExerciseMinutes('۱۵۰')).toBe(150);
  });

  it('rejects missing, negative, excessive and non-finite totals', () => {
    for (const raw of ['', ' ', '-1', '1440.1', 'NaN', 'Infinity', '1e3', '9'.repeat(400)]) {
      expect(parseExerciseMinutes(raw)).toBeNull();
    }
  });
});

describe('Daily exercise total revisions', () => {
  const at = new Date('2026-11-15T05:00:00.000Z');

  it('supersedes a later demo reading without adding totals or changing the previous reading', () => {
    const previous = exerciseMeasurement({ minutes: 130, missionDay: 18, savedAt: new Date('2026-11-15T07:00:00.000Z') });
    const revision = exerciseMeasurement({ minutes: 150, missionDay: 18, previous, savedAt: at });
    expect(dailyValue([previous, revision], 'exercise', 18)?.value).toBe(150);
    expect(previous.value).toBe(130);
    expect(revision.timestamp).toBe('2026-11-15T07:00:00.001Z');
    expect(revision.id).not.toBe(previous.id);
  });

  it('does not use another day’s timestamp and rejects invalid programmatic values', () => {
    const previous = exerciseMeasurement({ minutes: 120, missionDay: 19, savedAt: new Date('2026-11-16T07:00:00.000Z') });
    expect(exerciseMeasurement({ minutes: 0, missionDay: 18, previous, savedAt: at }).timestamp).toBe(at.toISOString());
    expect(() => exerciseMeasurement({ minutes: Infinity, missionDay: 18, savedAt: at })).toThrow();
    expect(() => exerciseMeasurement({ minutes: 20, missionDay: 0, savedAt: at })).toThrow();
  });
});
