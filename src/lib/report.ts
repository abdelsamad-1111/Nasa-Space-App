// Crew Health Report for the flight surgeon (7-day period ending on the report day).
// Pure data model built from app rules and a separate synthetic forecast; rendered by ReportView and
// by reportToText (plain text for "Copy text").
import {
  CARD_LABEL,
  ESCALATION,
  INDICATOR_ORDER,
  INDICATORS,
  LABEL_LOW_BP,
  LABEL_SOLAR,
  LOCATION_LABEL,
  PATTERNS,
  STATUS_WORD,
  THRESHOLDS,
  metricDef,
  type IndicatorId,
  type MetricId,
  type ReadingValue,
  type Status,
} from '../brain/indicators';
import {
  alertsForDay,
  cumulativeDose,
  dailyValue,
  detectPatterns,
  evaluateDay,
  evaluateExerciseOnDay,
  evaluateIndicatorOnDay,
  isBp,
  num,
  rank,
  summarizeAssessment,
  type Evaluation,
} from '../brain/evaluate';
import type { PersistedState } from '../data/storage';
import { crewName } from '../assistant/facts';
import { metStamp } from '../assistant/client';
import { fmtNumber, fmtPct, fmtValue } from './format';
import { APP_NAME } from './brand';
import { forecastPresentation } from './forecastPresentation';

export const REPORT_DAYS = 7;
/** Rows that fit on page 2 (alerts + patterns + actions); anything beyond is counted in a note. */
export const PAGE2_ROW_BUDGET = 31;
const MAX_PATTERN_ROWS = 6;
const MAX_ACTION_ROWS = 8;

// ---------------------------------------------------------------------------
// Numbered sources (footer) and per-row reference ranges
// ---------------------------------------------------------------------------
export const REPORT_SOURCES = [
  { n: 1, label: 'AHA/ACC — blood pressure categories; AHA — resting heart rate', site: 'heart.org' },
  { n: 2, label: 'CDC — definition of fever (38.0 °C)', site: 'cdc.gov' },
  { n: 3, label: 'Cleveland Clinic — fever above 39.4 °C', site: 'clevelandclinic.org' },
  { n: 4, label: 'NHLBI — low blood pressure below 90/60', site: 'nhlbi.nih.gov' },
  { n: 5, label: 'Mayo Clinic — hypothermia below 35 °C', site: 'mayoclinic.org' },
  { n: 6, label: 'WHO — pulse oximetry training manual', site: 'who.int' },
  { n: 7, label: 'ADA — hypoglycemia and glucose tests', site: 'diabetes.org' },
  { n: 8, label: 'AASM/SRS — adult sleep duration consensus', site: 'aasm.org' },
  { n: 9, label: 'NASA HRP — human research risks; NASA-STD-3001', site: 'nasa.gov' },
] as const;

const t = THRESHOLDS;
const REFERENCE: Record<MetricId, { range: string; sources: number[]; appDesigned: boolean }> = {
  bp: { range: `${t.bp.lowSysBelow}–${t.bp.okSysBelow - 1}/${t.bp.lowDiaBelow}–${t.bp.okDiaBelow - 1}`, sources: [1, 4], appDesigned: false },
  hr: { range: `${t.hr.okMin}–${t.hr.okMax}`, sources: [1], appDesigned: false },
  temp: { range: `${fmtNumber(t.temp.okMin, 1)}–${fmtNumber(t.temp.okMax, 1)}`, sources: [2, 3, 5], appDesigned: true },
  spo2: { range: `≥ ${t.spo2.okMin}`, sources: [6], appDesigned: false },
  glucose: { range: `${t.glucose.okMin}–${t.glucose.okMax}`, sources: [7], appDesigned: true },
  sleep: { range: `≥ ${t.sleep.okMin}`, sources: [8], appDesigned: false },
  mood: { range: `${t.mood.okMin}–5`, sources: [9], appDesigned: true },
  radiation: { range: `≤ ${t.radiation.spikeFactor}× 7-day avg`, sources: [9], appDesigned: true },
  exercise: { range: `≥ ${t.exercise.okPct}% of ${t.exercise.targetMin}`, sources: [9], appDesigned: true },
};

const ROWS: MetricId[] = [...INDICATOR_ORDER, 'exercise'];
const UNIT: Partial<Record<MetricId, string>> = { mood: '1–5', exercise: 'min', radiation: 'mSv/day' };

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export type Flag = 'H' | 'L' | null;

export interface VitalCell {
  day: number;
  text: string;
  flag: Flag;
}

export interface VitalRow {
  id: MetricId;
  name: string;
  unit: string;
  cells: VitalCell[];
  reference: string;
  sources: number[];
  appDesigned: boolean;
  /** Numeric series for the sparkline (systolic for blood pressure). */
  spark: (number | null)[];
  status: Status | null;
}

export interface AlertRow {
  day: number;
  indicator: string;
  value: string;
  status: Status;
  reason: string;
  state: 'Open' | 'Resolved';
}

export interface PatternRow {
  day: number;
  pattern: string;
  linked: string;
  escalation: string;
}

export interface ActionRow {
  day: number;
  action: string;
  source: string;
}

export interface ReportModel {
  id: string;
  generatedUtc: string;
  met: string;
  crew: string;
  location: string;
  day: number;
  from: number;
  /** Exactly 7 day columns ending on the report day (days < 1 are shown as "—"). */
  days: number[];
  dataSource: string;
  measured: number;
  total: number;
  summary: {
    status: Status | null;
    lines: string[];
    /** Synthetic forecast for this report day; never contributes to clinical rule status or counts. */
    earlyWarning: string;
  };
  vitals: VitalRow[];
  dose: { cumulative: number; limit: number; pct: number };
  alerts: AlertRow[];
  alertsHidden: number;
  patterns: PatternRow[];
  patternsHidden: number;
  actions: ActionRow[];
  actionsHidden: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function earlyWarningLine(measurements: PersistedState['measurements'], day: number): string {
  const forecast = forecastPresentation(measurements, day);
  if (!forecast) return 'Early warning (next 48 h): No forecast — morning check-in missing.';
  if (!forecast.warn) return `Early warning (next 48 h): Low. ${forecast.caption.trim()}`;
  const drivers = forecast.drivers.length ? ` (${forecast.drivers.slice(0, 2).join(', ')})` : '';
  return `Early warning (next 48 h): Elevated — ${forecast.problemShort}${drivers}. ${forecast.caption.trim()}`;
}

function evalOn(state: PersistedState, id: MetricId, day: number): Evaluation | null {
  if (day < 1) return null;
  return id === 'exercise' ? evaluateExerciseOnDay(state.measurements, day) : evaluateIndicatorOnDay(state.measurements, id, day, state.settings);
}

const cellText = (id: MetricId, v: ReadingValue) => (id === 'exercise' ? fmtNumber(num(v)) : fmtValue(id as IndicatorId, v));
const readingText = (id: MetricId, v: ReadingValue) => `${cellText(id, v)} ${id === 'exercise' ? 'min' : INDICATORS[id as IndicatorId].unit}`;

/** Lab-style H / L flag for a value outside the reference range (range rules only, not personal ones). */
export function flagFor(id: MetricId, e: Evaluation | null): Flag {
  if (!e) return null;
  if (id === 'radiation') return e.labels.includes(LABEL_SOLAR) ? 'H' : null;
  if (e.rangeStatus === 'OK') return null;
  const v = e.value;
  switch (id) {
    case 'bp':
      return isBp(v) && (v.sys >= t.bp.watchSysMin || v.dia >= t.bp.watchDiaMin) ? 'H' : 'L';
    case 'hr':
      return num(v) > t.hr.okMax ? 'H' : 'L';
    case 'temp':
      return num(v) >= t.temp.watchMin ? 'H' : 'L';
    case 'glucose':
      return num(v) > t.glucose.okMax ? 'H' : 'L';
    default:
      return 'L'; // spo2, sleep, mood, exercise: only low values are out of range
  }
}

function reportId(state: PersistedState, day: number): string {
  const tokens = crewName(state.settings).replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const initials = tokens.length > 1 ? `${tokens[0][0]}${tokens[tokens.length - 1].slice(0, 2)}` : (tokens[0] ?? 'crew').slice(0, 3);
  return `VO-${state.settings.location}-${initials.toUpperCase()}-D${day}`;
}

const utcFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });

const joinList = (items: string[]) => (items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const lower = (id: MetricId) => (id === 'spo2' ? 'SpO2' : id === 'exercise' ? 'exercise' : CARD_LABEL[id].toLowerCase());

const REVIEW: Record<MetricId, string> = {
  sleep: 'sleep and workload',
  mood: 'psychological support',
  temp: 'temperature follow-up',
  bp: 'cardiovascular follow-up',
  hr: 'cardiovascular follow-up',
  spo2: 'oxygen saturation check',
  glucose: 'nutrition and glucose',
  radiation: 'dose planning',
  exercise: 'exercise countermeasures',
};

/** Three short lines: persistent issues, acute events (and whether they resolved), suggested review. */
function clinicalSummary(state: PersistedState, period: number[], day: number) {
  const flagged = (id: MetricId) => period.filter((d) => flagFor(id, evalOn(state, id, d)) !== null);
  // Most persistent first; logged exercise (not one of the 8 indicators) last.
  const persistent = ROWS.map((id) => ({ id, days: flagged(id) }))
    .filter((x) => x.days.length >= 3)
    .sort((a, b) => Number(a.id === 'exercise') - Number(b.id === 'exercise') || b.days.length - a.days.length);
  const persistentIds = new Set(persistent.map((p) => p.id));
  const phrase = ({ id, days }: { id: MetricId; days: number[] }) =>
    id === 'sleep' ? `sleep below ${t.sleep.okMin} h for ${days.length} days`
    : id === 'mood' ? `low mood for ${days.length} days`
    : id === 'exercise' ? `exercise below target on ${days.length} days`
    : `${lower(id)} outside the reference range on ${days.length} days`;
  const line1 = persistent.length
    ? `${joinList(persistent.map(phrase)).replace(/^./, (c) => c.toUpperCase())}.`
    : 'No reading was outside its reference range on 3 or more days.';

  const acute: string[] = [];
  const unresolved: MetricId[] = [];
  for (const id of ROWS) {
    if (persistentIds.has(id)) continue;
    const hits = period.map((d) => ({ d, e: evalOn(state, id, d) })).filter((x) => x.e && rank(x.e.rangeStatus) >= rank('ACT'));
    if (!hits.length) continue;
    const worst = hits.reduce((a, b) => (rank(b.e!.rangeStatus) > rank(a.e!.rangeStatus) ? b : a));
    const value = readingText(id, worst.e!.value);
    const what = id === 'temp' && num(worst.e!.value) >= t.temp.actMin ? `Fever on Day ${worst.d} (${value})` : `${CARD_LABEL[id]} ${STATUS_WORD[worst.e!.rangeStatus]} on Day ${worst.d} (${value})`;
    const resolvedOn = period.find((d) => d > worst.d && evalOn(state, id, d)?.rangeStatus === 'OK');
    if (resolvedOn) acute.push(`${what}, resolved by Day ${resolvedOn}`);
    else {
      acute.push(`${what}, still ${STATUS_WORD[evalOn(state, id, day)?.status ?? 'ACT']} on Day ${day}`);
      unresolved.push(id);
    }
  }
  const line2 = acute.length ? `${acute.join('; ')}.` : 'No acute (Act or Critical) readings in this period.';

  const review = [...new Set([...persistent.map((p) => REVIEW[p.id]), ...unresolved.map((id) => REVIEW[id])])];
  const line3 = review.length
    ? `Suggested review: ${joinList(review)}.`
    : 'No follow-up beyond routine monitoring is suggested by the app rules.';
  return [line1, line2, line3];
}

/** One reason per rule that fired (range / personal baseline / trend). */
function reasonsFor(id: IndicatorId, e: Evaluation, types: string[]): string[] {
  const out: string[] = [];
  if (types.includes('range')) {
    const persistence = e.labels.find((l) => /consecutive mission days/.test(l));
    if (persistence && id === 'sleep') out.push(`below ${t.sleep.okMin} h for ${t.sleep.nightsInRow}+ days`);
    else if (persistence && id === 'mood') out.push(`${t.mood.lowMax} or lower for ${t.mood.daysInRow}+ days`);
    else if (e.labels.includes(LABEL_LOW_BP)) out.push('low (fainting risk)');
    else if (e.labels.includes(LABEL_SOLAR)) out.push(`dose spike (> ${t.radiation.spikeFactor}× 7-day average)`);
    else if (id === 'radiation') out.push(`mission dose ≥ ${e.rangeStatus === 'ACT' ? t.radiation.actPct : t.radiation.watchPct}% of limit`);
    else out.push(flagFor(id, e) === 'H' ? 'above reference range' : 'below reference range');
  }
  if (types.includes('baseline')) out.push(e.deltaPct !== null ? `unusual for you (${fmtPct(e.deltaPct)} vs baseline)` : 'unusual for you');
  if (types.includes('trend')) out.push(`worse ${t.rules.trendReadings} readings in a row`);
  return out;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function buildReportModel(state: PersistedState, day: number, now: Date = new Date()): ReportModel {
  const { settings, measurements: ms } = state;
  const days = Array.from({ length: REPORT_DAYS }, (_, i) => day - REPORT_DAYS + 1 + i);
  const period = days.filter((d) => d >= 1);
  const from = period[0] ?? day;
  const evalsToday = evaluateDay(ms, day, settings);
  const summary = summarizeAssessment(evalsToday, detectPatterns(ms, day));
  const today = Math.max(1, Math.floor((now.getTime() - new Date(state.missionStart).getTime()) / 86400000) + 1);

  const vitals: VitalRow[] = ROWS.map((id) => {
    const cells = days.map((d) => {
      const m = d >= 1 ? dailyValue(ms, id, d) : undefined;
      return m ? { day: d, text: cellText(id, m.value), flag: flagFor(id, evalOn(state, id, d)) } : { day: d, text: '—', flag: null };
    });
    const spark = days.map((d) => {
      const m = d >= 1 ? dailyValue(ms, id, d) : undefined;
      return m ? num(m.value) : null;
    });
    const ref = REFERENCE[id];
    return {
      id,
      name: id === 'radiation' ? 'Radiation (daily)' : id === 'exercise' ? 'Exercise' : id === 'spo2' ? 'SpO2' : metricDef(id).name,
      unit: UNIT[id] ?? metricDef(id).unit,
      cells,
      reference: ref.range,
      sources: ref.sources,
      appDesigned: ref.appDesigned,
      spark,
      status: evalOn(state, id, day)?.status ?? null,
    };
  });

  const cumulative = cumulativeDose(ms, day);
  const limit = settings.careerRadiationLimit;

  // Alerts: one row per indicator per day, reasons merged; patterns are listed separately.
  const rows: AlertRow[] = [];
  for (const d of period) {
    const raised = alertsForDay(ms, d, settings).filter((a) => a.type !== 'pattern' && a.indicatorId);
    for (const id of INDICATOR_ORDER) {
      const mine = raised.filter((a) => a.indicatorId === id);
      if (!mine.length) continue;
      const e = evaluateIndicatorOnDay(ms, id, d, settings)!;
      rows.push({
        day: d,
        indicator: INDICATORS[id].name,
        value: readingText(id, e.value),
        status: e.status,
        reason: reasonsFor(id, e, mine.map((a) => a.type)).join('; '),
        state: (evalsToday[id]?.status ?? 'OK') === 'OK' ? 'Resolved' : 'Open',
      });
    }
  }

  const patterns: PatternRow[] = period.flatMap((d) =>
    detectPatterns(ms, d).map((p) => ({
      day: d,
      pattern: p.title,
      linked: PATTERNS[p.id].indicators
        .map((id) => {
          const m = dailyValue(ms, id, d);
          return `${CARD_LABEL[id]} ${m ? readingText(id, m.value) : '—'}`;
        })
        .join(' · '),
      escalation: p.escalate ? ESCALATION[settings.location] : '—',
    })),
  );

  const actions: ActionRow[] = state.actionsTaken
    .filter((a) => a.missionDay >= from && a.missionDay <= day)
    .sort((a, b) => a.missionDay - b.missionDay || a.timestamp.localeCompare(b.timestamp))
    .map((a) => ({
      day: a.missionDay,
      action: a.label,
      source: a.key.startsWith('demo-') ? 'Astronaut follow-up checklist (demo)' : 'Astronaut follow-up checklist',
    }));

  return {
    id: reportId(state, day),
    generatedUtc: `${utcFmt.format(now)} UTC`,
    met: metStamp(today, now),
    crew: crewName(settings),
    location: LOCATION_LABEL[settings.location],
    day,
    from,
    days,
    dataSource: state.mode === 'demo'
      ? 'Crew self-measurements (DEMO, simulated)'
      : ms.some((m) => m.id.startsWith('demo-'))
        ? 'Crew self-measurements (includes retained sample readings)'
        : 'Crew self-measurements',
    measured: summary.measured,
    total: summary.total,
    summary: {
      status: summary.status,
      lines: clinicalSummary(state, period, day),
      earlyWarning: earlyWarningLine(ms, day),
    },
    vitals,
    dose: { cumulative, limit, pct: limit > 0 ? (cumulative / limit) * 100 : 0 },
    ...fitPage2(rows, patterns, actions),
  };
}

/** Keep page 2 to one sheet: cap patterns and actions, give alerts the remaining rows. */
function fitPage2(alerts: AlertRow[], patterns: PatternRow[], actions: ActionRow[]) {
  const p = patterns.slice(0, MAX_PATTERN_ROWS);
  const a = actions.slice(-MAX_ACTION_ROWS); // most recent actions
  // A pattern row (wrapped escalation text) takes about two alert rows.
  const alertRoom = Math.max(10, PAGE2_ROW_BUDGET - 2 * p.length - a.length);
  return {
    alerts: alerts.slice(0, alertRoom),
    alertsHidden: Math.max(0, alerts.length - alertRoom),
    patterns: p,
    patternsHidden: patterns.length - p.length,
    actions: a,
    actionsHidden: actions.length - a.length,
  };
}

export const DISCLAIMER =
  'Decision-support report generated from crew self-measurements. Not a medical diagnosis. Review by a qualified flight surgeon is required.';
export const BUILT_FOR = 'Built for the NASA Space Apps Challenge 2026';

/** Plain-text version of the same report ("Copy text"). */
export function reportToText(r: ReportModel): string {
  const L: string[] = [];
  const word = (s: Status | null) => (s ? STATUS_WORD[s].toUpperCase() : 'NO DATA');
  L.push(`${APP_NAME} — CREW HEALTH REPORT   ${r.id}`);
  L.push(`Generated: ${r.generatedUtc} · ${r.met}`);
  L.push('');
  L.push(`Astronaut: ${r.crew}   Mission: ${r.location}   Mission day: ${r.day}   Period: days ${r.from}–${r.day}`);
  L.push(`Prepared for: Flight Surgeon   Data source: ${r.dataSource}`);
  L.push(`Measurements on Day ${r.day}: ${r.measured} of ${r.total}${r.measured < r.total ? ' (incomplete assessment; missing readings are not normal readings)' : ''}`);
  L.push('');
  L.push(`CLINICAL SUMMARY — overall status ${word(r.summary.status)}`);
  for (const l of r.summary.lines) L.push(`  ${l}`);
  L.push(`  ${r.summary.earlyWarning}`);
  L.push('');
  L.push(`VITAL SIGNS (days ${r.days.map((d) => (d >= 1 ? `D${d}` : '—')).join(' ')})`);
  for (const v of r.vitals) {
    const cells = v.cells.map((c) => `${c.text}${c.flag ? ` ${c.flag}` : ''}`).join(' | ');
    L.push(`- ${v.name} (${v.unit}): ${cells}. Reference ${v.reference}${v.appDesigned ? ' (app-designed)' : ''} [${v.sources.join(',')}]. Status ${word(v.status)}.`);
    if (v.id === 'radiation') L.push(`  Cumulative dose: ${fmtNumber(r.dose.cumulative, 1)} / ${fmtNumber(r.dose.limit)} mSv (${fmtNumber(r.dose.pct, 1)}%).`);
  }
  L.push('');
  L.push('ALERTS IN THIS PERIOD');
  if (!r.alerts.length) L.push('- None');
  for (const a of r.alerts) L.push(`- Day ${a.day} · ${a.indicator} ${a.value} · ${word(a.status)} · ${a.reason} · ${a.state}`);
  if (r.alertsHidden) L.push(`- ${r.alertsHidden} more alerts — see the Alerts screen.`);
  L.push('');
  L.push('PATTERNS');
  if (!r.patterns.length) L.push('- None');
  for (const p of r.patterns) L.push(`- Day ${p.day} · ${p.pattern} · ${p.linked} · Escalation: ${p.escalation}`);
  if (r.patternsHidden) L.push(`- ${r.patternsHidden} more pattern days — see the app.`);
  L.push('');
  L.push('ACTIONS TAKEN');
  if (!r.actions.length) L.push('- None recorded');
  if (r.actionsHidden) L.push(`- ${r.actionsHidden} earlier actions — see the app.`);
  for (const a of r.actions) L.push(`- Day ${a.day} · ${a.action} · ${a.source}`);
  L.push('');
  L.push('SOURCES');
  for (const s of REPORT_SOURCES) L.push(`[${s.n}] ${s.label} (${s.site})`);
  L.push('App-designed thresholds are marked as such.');
  L.push('');
  L.push(DISCLAIMER);
  L.push('Reviewed by: ____________   Date: ________');
  L.push(BUILT_FOR);
  return L.join('\n');
}

/** Backwards-compatible text report. */
export function buildReport(state: PersistedState, day: number, now: Date = new Date()): string {
  return reportToText(buildReportModel(state, day, now));
}
