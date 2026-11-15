import { dailyValue, evaluateIndicatorOnDay, type Measurement } from '../brain/evaluate';
import { DEMO_SETTINGS, defaultMissionStart, generateDemoMission } from '../data/demo';
import { readingRevisionTimestamp } from './readingRevision';

describe('Manual check-in revisions', () => {
  it('uses an early-morning manual value instead of a later same-day demo value', () => {
    const source = generateDemoMission(defaultMissionStart(new Date('2026-11-15T12:00:00Z')));
    const previous = dailyValue(source, 'temp', 18)!;
    const earlyMorning = new Date(Date.parse(previous.timestamp) - 2 * 60 * 60 * 1000);
    const manual: Measurement = {
      ...previous,
      id: 'ci-manual-temp',
      value: 36.6,
      timestamp: readingRevisionTimestamp(earlyMorning, previous),
    };
    const result = evaluateIndicatorOnDay([...source, manual], 'temp', 18, DEMO_SETTINGS);
    expect(result?.value).toBe(36.6);
    expect(result?.status).toBe('OK');
    expect(previous.value).toBe(38.3);
  });

  it('retains actual step timestamps when no newer reading needs to be superseded', () => {
    const recordedAt = new Date('2026-11-15T12:00:00Z');
    expect(readingRevisionTimestamp(recordedAt)).toBe(recordedAt.toISOString());
    expect(() => readingRevisionTimestamp(new Date('invalid'))).toThrow();
  });
});
