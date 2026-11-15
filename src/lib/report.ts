// One-page plain-text report for the flight surgeon (last 7 days).
import { FOOTER_TEXT, INDICATOR_ORDER, INDICATORS, LOCATION_LABEL, STATUS_WORD, fmtMinutes } from '../brain/indicators';
import {
  cumulativeDose,
  dailySeries,
  detectPatterns,
  evaluateIndicatorOnDay,
  evaluateDay,
  summarizeAssessment,
  type Alert,
} from '../brain/evaluate';
import type { PersistedState } from '../data/storage';
import { fmtDate, fmtNumber, fmtValue } from './format';

const TYPE_LABEL: Record<Alert['type'], string> = {
  range: 'Out of range',
  baseline: 'Unusual for you',
  trend: 'Trend',
  pattern: 'Pattern',
};

export function buildReport(state: PersistedState, day: number, openAlerts: Alert[]): string {
  const { settings, measurements: ms } = state;
  const from = Math.max(1, day - 6);
  const date = new Date(new Date(state.missionStart).getTime() + (day - 1) * 86400000);
  const L: string[] = [];
  const rule = '-'.repeat(64);

  L.push('VITALS-ORBIT — HEALTH REPORT FOR FLIGHT SURGEON');
  L.push(rule);
  L.push(`Astronaut: ${settings.name}`);
  L.push(`Location: ${LOCATION_LABEL[settings.location]}   Mission day: ${fmtNumber(day)}   Date: ${fmtDate(date)}`);
  L.push(`Period: mission days ${fmtNumber(from)}–${fmtNumber(day)} (last 7 days)`);
  L.push(state.mode === 'demo'
    ? 'Data: DEMO SCENARIO — includes simulated readings.'
    : ms.some((m) => m.id.startsWith('demo-')) ? 'Data: personal mission — includes retained sample readings.' : 'Data: personal mission entries.');
  const summary = summarizeAssessment(evaluateDay(ms, day, settings), detectPatterns(ms, day));
  L.push(`Assessment coverage on Day ${fmtNumber(day)}: ${summary.measured} of ${summary.total} indicators measured.`);
  if (!summary.complete) L.push(`${summary.missing} indicators not measured. This assessment is incomplete; missing readings are not normal readings.`);
  L.push('');

  L.push('1. LAST 7 DAYS');
  for (const id of INDICATOR_ORDER) {
    const ind = INDICATORS[id];
    const series = dailySeries(ms, id, day).filter((m) => m.missionDay >= from);
    if (!series.length) {
      L.push(`- ${ind.name}: no readings`);
      continue;
    }
    const values = series.map((m) => fmtValue(id, m.value)).join(', ');
    const latest = evaluateIndicatorOnDay(ms, id, series[series.length - 1].missionDay, settings);
    const status = latest ? `${STATUS_WORD[latest.status]}${latest.labels.length ? ` (${latest.labels.join(', ')})` : ''}` : '—';
    L.push(`- ${ind.name} (${ind.unit}): ${values}. Latest: ${status}.`);
    if (id === 'radiation')
      L.push(`  Cumulative mission dose: ${fmtNumber(cumulativeDose(ms, day), 1)} / ${fmtNumber(settings.careerRadiationLimit)} mSv.`);
  }
  const exercise = dailySeries(ms, 'exercise', day).filter((m) => m.missionDay >= from);
  L.push(exercise.length
    ? `- Daily exercise totals: ${exercise.map((m) => `Day ${m.missionDay}: ${fmtMinutes(m.value as number)}`).join('; ')}. Activity is tracked separately from the eight-indicator assessment.`
    : '- Daily exercise: no totals recorded.');
  L.push('');

  L.push(`2. OPEN ALERTS (${fmtNumber(openAlerts.length)})`);
  if (!openAlerts.length) L.push('- None');
  for (const a of openAlerts) L.push(`- Day ${fmtNumber(a.missionDay)} · ${STATUS_WORD[a.status]} · ${TYPE_LABEL[a.type]} · ${a.message}`);
  L.push('');

  L.push('3. PATTERNS DETECTED');
  let any = false;
  for (let d = from; d <= day; d++) {
    for (const p of detectPatterns(ms, d)) {
      any = true;
      L.push(`- Day ${fmtNumber(d)}: ${p.title}`);
    }
  }
  if (!any) L.push('- None');
  L.push('');

  L.push('4. ACTIONS TAKEN');
  const actions = state.actionsTaken.filter((a) => a.missionDay >= from && a.missionDay <= day).sort((a, b) => a.missionDay - b.missionDay);
  if (!actions.length) L.push('- None recorded');
  for (const a of actions) L.push(`- Day ${fmtNumber(a.missionDay)}: ${a.label}`);
  L.push('');
  L.push(rule);
  L.push(FOOTER_TEXT);
  return L.join('\n');
}
