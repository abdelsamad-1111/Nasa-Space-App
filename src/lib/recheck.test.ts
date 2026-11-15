import { describe, expect, it } from 'vitest';
import { pointsOn, type Measurement } from '../brain/evaluate';
import { demoState } from '../data/storage';
import { eveningRecheck, recheckPoints } from './recheck';

const state = demoState(new Date(2026, 10, 15, 9));
const at = (day: number, hour: number) => new Date(new Date(state.missionStart).getTime() + (day - 1) * 86400000 + hour * 3600000);

describe('Evening re-check (added only on early-warning days)', () => {
  it('Day 16 has none; Day 17 (infection warning) asks for an evening temperature', () => {
    const clock = { today: 17, now: at(17, 10) };
    expect(eveningRecheck(state.measurements, 16, clock)).toBeNull();
    expect(eveningRecheck(state.measurements, 17, clock)).toMatchObject({ indicators: ['temp'], label: 'Temperature', state: 'later' });
    expect(eveningRecheck(state.measurements, 17, { today: 17, now: at(17, 19) })?.state).toBe('due');
    expect(eveningRecheck(state.measurements, 17, { today: 18, now: at(18, 9) })?.state).toBe('missed');
  });

  it('an evening reading completes it and earns +10 like other checks', () => {
    const clock = { today: 17, now: at(17, 21) };
    const evening: Measurement = { id: 'temp-17-eve', indicatorId: 'temp', value: 37.3, unit: '°C', missionDay: 17, timestamp: at(17, 20).toISOString(), context: ['None'] };
    const before = pointsOn(state.measurements, 17, clock) + recheckPoints(state.measurements, 17, clock);
    const ms = [...state.measurements, evening];
    expect(eveningRecheck(ms, 17, clock)?.state).toBe('done');
    expect(pointsOn(ms, 17, clock) + recheckPoints(ms, 17, clock)).toBe(before + 10);
  });
});
