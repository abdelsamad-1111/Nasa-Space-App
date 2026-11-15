import { describe, expect, it } from 'vitest';
import {
  buildAlerts,
  detectPatterns,
  evaluateDay,
  evaluateReading,
  escalationText,
  cumulativeDose,
  exerciseStatus,
  evaluateExerciseOnDay,
  routineFor,
  streakOn,
  pointsOn,
  followUpActions,
  interpretation,
  overallStatus,
  summarizeAssessment,
  type Measurement,
  type ReadingInput,
} from './evaluate';
import { EXERTION_NOTE, INDICATORS, LABEL_LOW_BP, LABEL_SOLAR, LABEL_TRENDING, LABEL_UNUSUAL, PATTERNS, type IndicatorId, type ReadingValue } from './indicators';
import { DEMO_SETTINGS, generateDemoMission } from '../data/demo';

const B = DEMO_SETTINGS.baselines;
const ev = (indicatorId: IndicatorId, value: ReadingValue, extra: Partial<Omit<ReadingInput, 'indicatorId' | 'value'>> = {}) =>
  evaluateReading({ indicatorId, value, baseline: B[indicatorId], ...extra });

const reading = (indicatorId: IndicatorId, missionDay: number, value: ReadingValue, hour = 7): Measurement => ({
  id: `${indicatorId}-${missionDay}-${hour}`,
  indicatorId,
  value,
  unit: INDICATORS[indicatorId].unit,
  timestamp: new Date(Date.UTC(2026, 0, missionDay, hour)).toISOString(),
  missionDay,
  context: [],
});

describe('Blood pressure', () => {
  it('121/79 → WATCH', () => expect(ev('bp', { sys: 121, dia: 79 }).status).toBe('WATCH'));
  it('145/85 → ACT', () => expect(ev('bp', { sys: 145, dia: 85 }).status).toBe('ACT'));
  it('185/100 → CRITICAL', () => expect(ev('bp', { sys: 185, dia: 100 }).status).toBe('CRITICAL'));
  it('85/55 → WATCH (low)', () => {
    const e = ev('bp', { sys: 85, dia: 55 });
    expect(e.status).toBe('WATCH');
    expect(e.labels).toContain(LABEL_LOW_BP);
  });
});

describe('Heart rate', () => {
  it('59 with baseline 58 → OK', () =>
    expect(evaluateReading({ indicatorId: 'hr', value: 59, baseline: 58 }).status).toBe('OK'));
  it('59 with baseline 70 → WATCH (baseline rule)', () => {
    const e = evaluateReading({ indicatorId: 'hr', value: 59, baseline: 70 });
    expect(e.status).toBe('WATCH');
    expect(e.labels).toContain(LABEL_UNUSUAL);
  });
  it('125 → ACT', () => expect(ev('hr', 125).status).toBe('ACT'));
  it('115 after exercise retains Watch and adds context for remeasurement', () => {
    const e = ev('hr', 115, { context: ['Just exercised'] });
    expect(e.status).toBe('WATCH');
    expect(e.note).toBe(EXERTION_NOTE);
  });
});

describe('Temperature', () => {
  it('37.6 → WATCH', () => expect(ev('temp', 37.6).status).toBe('WATCH'));
  it('38.0 → ACT', () => expect(ev('temp', 38.0).status).toBe('ACT'));
  it('39.5 → CRITICAL', () => expect(ev('temp', 39.5).status).toBe('CRITICAL'));
  it('below 35 keeps Act severity but calls for medical help immediately', () => {
    const e = ev('temp', 34.9);
    expect(e.status).toBe('ACT');
    expect(e.escalate).toBe(true);
    expect(interpretation(e)).toMatch(/medical help now/i);
    const actions = followUpActions(e);
    expect(actions[0]).toMatch(/medical.*now/i);
    expect(actions.join(' ')).toMatch(/warm/i);
    expect(actions.join(' ')).not.toMatch(/4 hours|24 h/i);
  });
  it('35.0 is the lower OK boundary: no alert and no emergency guidance', () => {
    const e = ev('temp', 35);
    expect(e.status).toBe('OK');
    expect(e.escalate).toBe(false);
    expect(followUpActions(e).join(' ')).not.toMatch(/gentle warming/i);
  });
  it('35.5 → OK (no alert between 35.0 and 36.1)', () => {
    const e = ev('temp', 35.5);
    expect(e.status).toBe('OK');
    expect(e.escalate).toBe(false);
  });
  it('34.8 → ACT (hypothermia)', () => {
    const e = ev('temp', 34.8);
    expect(e.status).toBe('ACT');
    expect(e.escalate).toBe(true);
  });
});

describe('Interpretation separates range facts from personal-change alerts', () => {
  it.each([
    { id: 'mood', value: 5 },
    { id: 'sleep', value: 9 },
    { id: 'glucose', value: 110 },
  ] as const)('keeps the normal $id range fact when only the baseline is unusual', ({ id, value }) => {
    const e = ev(id, value);
    expect(e.status).toBe('WATCH');
    expect(e.rangeStatus).toBe('OK');
    expect(interpretation(e)).toContain(INDICATORS[id].meaning.OK);
    expect(interpretation(e)).not.toContain(INDICATORS[id].meaning.WATCH);
    expect(interpretation(e)).toContain('baseline');
    const actions = followUpActions(e);
    expect(actions[0]).toMatch(/confirm.*value/i);
    expect(actions[1]).toMatch(/re-measure.*baseline/i);
    expect(actions[2]).toMatch(/medical officer/i);
    expect(actions.join(' ')).not.toMatch(/carbs|sleep window|contact your family/i);
  });

  it('gives comparison guidance for an in-range worsening trend without a baseline', () => {
    const e = ev('glucose', 110, {
      baseline: undefined,
      missionDay: 4,
      history: [80, 90, 100].map((value, index) => ({ missionDay: index + 1, value })),
    });
    expect(e.rangeStatus).toBe('OK');
    expect(e.reasons).toEqual(['trend']);
    expect(interpretation(e)).toContain(INDICATORS.glucose.meaning.OK);
    expect(interpretation(e)).toContain('got worse');
    expect(followUpActions(e)[1]).toMatch(/recent readings/i);
  });

  it('still explains the dated persistence rule when it raises mood severity', () => {
    const e = ev('mood', 2, {
      missionDay: 3,
      history: [{ missionDay: 1, value: 2 }, { missionDay: 2, value: 2 }],
    });
    expect(e.status).toBe('ACT');
    expect(interpretation(e)).toContain('3 consecutive mission days');
    expect(followUpActions(e)).toEqual(INDICATORS.mood.guidance.ACT.slice(0, 3));
  });
});

describe('SpO2', () => {
  it('96 → OK', () => expect(ev('spo2', 96).status).toBe('OK'));
  it('92 → WATCH', () => expect(ev('spo2', 92).status).toBe('WATCH'));
  it('88 → CRITICAL', () => expect(ev('spo2', 88).status).toBe('CRITICAL'));
});

describe('Glucose', () => {
  it('65 → WATCH', () => expect(ev('glucose', 65).status).toBe('WATCH'));
  it('50 → ACT', () => expect(ev('glucose', 50).status).toBe('ACT'));
  it('260 → CRITICAL', () => expect(ev('glucose', 260).status).toBe('CRITICAL'));
});

describe('Sleep', () => {
  it('6.5 → WATCH', () => expect(ev('sleep', 6.5).status).toBe('WATCH'));
  it('5.5 → ACT', () => expect(ev('sleep', 5.5).status).toBe('ACT'));
  it('three nights 6.8, 6.9, 6.5 → ACT', () =>
    expect(ev('sleep', 6.5, { missionDay: 3, history: [{ missionDay: 1, value: 6.8 }, { missionDay: 2, value: 6.9 }] }).status).toBe('ACT'));
});

describe('Mood', () => {
  it('2, 2, 2 on three consecutive days → ACT', () =>
    expect(ev('mood', 2, { missionDay: 3, history: [{ missionDay: 1, value: 2 }, { missionDay: 2, value: 2 }] }).status).toBe('ACT'));
  it('2 once → WATCH', () =>
    expect(ev('mood', 2, { missionDay: 3, history: [{ missionDay: 1, value: 4 }, { missionDay: 2, value: 4 }] }).status).toBe('WATCH'));
});

describe('Consecutive mission-day rules', () => {
  it.each([{ id: 'sleep', value: 6.5 }, { id: 'mood', value: 2 }] as const)(
    '$id does not treat sparse days 1, 4 and 8 as consecutive',
    ({ id, value }) => {
      const ms = [reading(id, 1, value), reading(id, 4, value), reading(id, 8, value)];
      expect(evaluateDay(ms, 8, DEMO_SETTINGS)[id]?.status).toBe('WATCH');
    },
  );

  it.each([{ id: 'sleep', value: 6.5, recovered: 8 }, { id: 'mood', value: 2, recovered: 4 }] as const)(
    '$id uses the latest value per day regardless of input order or duplicate measurements',
    ({ id, value, recovered }) => {
      const ms = [reading(id, 3, value), reading(id, 2, recovered, 6), reading(id, 1, value), reading(id, 2, value, 8)];
      expect(evaluateDay(ms, 3, DEMO_SETTINGS)[id]?.status).toBe('ACT');
      expect(evaluateDay([reading(id, 2, recovered, 10), ...ms], 3, DEMO_SETTINGS)[id]?.status).toBe('WATCH');
    },
  );

  it('requires a dated current reading before applying a consecutive-days rule', () => {
    expect(ev('mood', 2, { history: [{ missionDay: 1, value: 2 }, { missionDay: 2, value: 2 }] }).status).toBe('WATCH');
  });
});

describe('Radiation', () => {
  it('daily 2.5 with 7-day avg 0.5 → ACT (spike)', () => {
    const e = evaluateReading({
      indicatorId: 'radiation',
      value: 2.5,
      radiation: { cumulative: 13, limit: 600, avg7: 0.5 },
    });
    expect(e.status).toBe('ACT');
    expect(e.labels).toContain(LABEL_SOLAR);
  });
});

describe('Demo mission', () => {
  const ms = generateDemoMission('2026-10-28T00:00:00.000Z');
  it('Pattern P1 triggers on demo Day 18', () => {
    expect(detectPatterns(ms, 18).map((p) => p.id)).toContain('P1');
  });
  it('Pattern P1 escalates (escalation text shown for the current location)', () => {
    expect(PATTERNS.P1.escalate).toBe(true);
    expect(detectPatterns(ms, 18).find((p) => p.id === 'P1')?.escalate).toBe(true);
  });
  it('P1 does not trigger on a calm day (Day 5)', () => {
    expect(detectPatterns(ms, 5)).toHaveLength(0);
  });
  it('Day 22 radiation is a solar event (ACT)', () => {
    expect(evaluateDay(ms, 22, DEMO_SETTINGS).radiation?.status).toBe('ACT');
  });
  it('Cumulative dose stays well under the career limit', () => {
    expect(cumulativeDose(ms, 30)).toBeLessThan(300);
  });
  it('Day 18 has open alerts including the pattern', () => {
    const open = buildAlerts(ms, 18, DEMO_SETTINGS, []).filter((a) => a.open);
    expect(open.some((a) => a.type === 'pattern')).toBe(true);
  });
});

describe('Escalation by location', () => {
  it('text differs for ISS / MOON / MARS', () => {
    const t = new Set([escalationText('ISS'), escalationText('MOON'), escalationText('MARS')]);
    expect(t.size).toBe(3);
  });
});

describe('Context rule R1', () => {
  it.each([
    { id: 'hr', value: 35, expected: 'ACT' },
    { id: 'hr', value: 125, expected: 'ACT' },
    { id: 'bp', value: { sys: 85, dia: 55 }, expected: 'WATCH' },
    { id: 'bp', value: { sys: 145, dia: 55 }, expected: 'ACT' },
    { id: 'bp', value: { sys: 185, dia: 100 }, expected: 'CRITICAL' },
  ] as const)('preserves $id $expected severity after EVA', ({ id, value, expected }) => {
    const original = ev(id, value);
    const exerted = ev(id, value, { context: ['After EVA'] });
    expect(exerted.status).toBe(expected);
    expect(exerted.labels).toEqual(original.labels);
    expect(exerted.reasons).toEqual(original.reasons);
    expect(exerted.escalate).toBe(original.escalate);
    expect(exerted.note).toBe(EXERTION_NOTE);
  });

  it('retains independent baseline and trend alerts even when the range is normal', () => {
    const e = ev('hr', 90, {
      context: ['After EVA'],
      missionDay: 4,
      history: [60, 70, 80].map((value, i) => ({ missionDay: i + 1, value })),
    });
    expect(e.rangeStatus).toBe('OK');
    expect(e.status).toBe('WATCH');
    expect(e.labels).toContain(LABEL_UNUSUAL);
    expect(e.labels).toContain(LABEL_TRENDING);
    expect(e.reasons).toContain('baseline');
    expect(e.reasons).toContain('trend');
  });

  it('keeps critical interpretation and urgent follow-up visible alongside context', () => {
    const e = ev('bp', { sys: 185, dia: 100 }, { context: ['Just exercised'] });
    expect(interpretation(e)).toContain(INDICATORS.bp.meaning.CRITICAL);
    expect(interpretation(e)).toContain(EXERTION_NOTE);
    expect(followUpActions(e)).toContain(INDICATORS.bp.guidance.CRITICAL[0]);
    expect(e.escalate).toBe(true);
  });

  it('continues raising alerts for abnormal readings taken after exercise', () => {
    const ms = [{ ...reading('hr', 1, 35), context: ['Just exercised'] }];
    const alerts = buildAlerts(ms, 1, DEMO_SETTINGS, []);
    expect(alerts.some((alert) => alert.open && alert.indicatorId === 'hr' && alert.status === 'ACT')).toBe(true);
  });
});

describe('Assessment completeness', () => {
  it('does not assign a health status without observations or patterns', () => {
    expect(overallStatus({}, [])).toBeNull();
    expect(summarizeAssessment({}, [])).toEqual({ measured: 0, total: 8, missing: 8, attention: 0, complete: false, status: null });
  });

  it('marks a single normal reading as incomplete without discarding the observed status', () => {
    expect(summarizeAssessment({ hr: ev('hr', 60) }, [])).toEqual({ measured: 1, total: 8, missing: 7, attention: 0, complete: false, status: 'OK' });
  });

  it('retains the worst available status even when most readings are missing', () => {
    const summary = summarizeAssessment({ hr: ev('hr', 60), spo2: ev('spo2', 88) }, []);
    expect(summary).toEqual({ measured: 2, total: 8, missing: 6, attention: 1, complete: false, status: 'CRITICAL' });
  });

  it('recognizes a full assessment and excludes the separate exercise metric', () => {
    const ms = generateDemoMission('2026-10-28T00:00:00.000Z');
    expect(summarizeAssessment(evaluateDay(ms, 5, DEMO_SETTINGS), [])).toEqual({ measured: 8, total: 8, missing: 0, attention: 0, complete: true, status: 'OK' });
  });

  it('retains a detected pattern even if no single-indicator evaluation is supplied', () => {
    const pattern = { id: 'P1', missionDay: 1, title: PATTERNS.P1.title, escalate: true } as const;
    expect(summarizeAssessment({}, [pattern]).status).toBe('ACT');
  });
});

describe('Legs: exercise % of target (2 h 30 min)', () => {
  it('≥90% → OK, 60–89% → WATCH, <60% → ACT', () => {
    expect(exerciseStatus(135)).toBe('OK');
    expect(exerciseStatus(134)).toBe('WATCH');
    expect(exerciseStatus(90)).toBe('WATCH');
    expect(exerciseStatus(89)).toBe('ACT');
  });
  it('demo Day 18 is 2 h 10 min → WATCH', () => {
    const ms = generateDemoMission('2026-10-28T00:00:00.000Z');
    const e = evaluateExerciseOnDay(ms, 18);
    expect(e?.value).toBe(130);
    expect(e?.status).toBe('WATCH');
  });
  it('exercise does not change the 8-indicator overall evaluation', () => {
    const ms = generateDemoMission('2026-10-28T00:00:00.000Z');
    expect(Object.keys(evaluateDay(ms, 18, DEMO_SETTINGS))).not.toContain('exercise');
  });
});

describe('Daily routine, streak and points', () => {
  const ms = generateDemoMission('2026-10-28T00:00:00.000Z');
  const past = { today: 99, now: new Date('2027-01-01T12:00:00Z') };
  it('+10 points per completed check', () => {
    // Day 1: 8 indicators measured → 80 points
    expect(pointsOn(ms, 1, past)).toBe(80);
  });
  it('streak counts complete days, breaks on days 15–17 and recovers', () => {
    expect(streakOn(ms, 14, past)).toBe(14);
    expect(streakOn(ms, 15, past)).toBe(0);
    expect(streakOn(ms, 17, past)).toBe(0);
    expect(streakOn(ms, 18, past)).toBe(1);
    expect(streakOn(ms, 21, past)).toBe(4);
  });
  it('a missed evening dosimeter check shows as missed on a past day', () => {
    const r = routineFor(ms, 16, past).find((g) => g.slot === 'evening')!;
    expect(r.items[0].state).toBe('missed');
  });
  it('today: a check not yet taken is due once its time has come', () => {
    const empty = ms.filter((m) => !(m.missionDay === 18 && m.indicatorId === 'radiation'));
    const evening = { today: 18, now: new Date(2026, 10, 14, 20, 0) };
    const morning = { today: 18, now: new Date(2026, 10, 14, 9, 0) };
    expect(routineFor(empty, 18, evening).find((g) => g.slot === 'evening')!.items[0].state).toBe('due');
    expect(routineFor(empty, 18, morning).find((g) => g.slot === 'evening')!.items[0].state).toBe('later');
  });
});
