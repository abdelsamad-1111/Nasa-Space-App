// Astro Health AI — pure evaluation functions (no ML, no side effects).
import {
  BASELINE_INDICATORS,
  FACTOR_NAMES,
  FACTOR_TEXT,
  ESCALATION,
  EXERTION_CONTEXTS,
  EXERTION_NOTE,
  EXERTION_RECHECK,
  INDICATOR_ORDER,
  INDICATORS,
  INTERPRET_TEXT,
  metricDef,
  LABEL_LOW_BP,
  LABEL_SOLAR,
  LABEL_TRENDING,
  LABEL_UNUSUAL,
  PATTERNS,
  ROUTINE,
  GAMIFICATION,
  STATUS_ORDER,
  THRESHOLDS,
  type Baselines,
  type FactorId,
  type FactorLevel,
  type BpValue,
  type IndicatorId,
  type MetricId,
  type Location,
  type PatternId,
  type ReadingValue,
  type Status,
} from './indicators';

// ---------------------------------------------------------------------------
// Data model (section 8)
// ---------------------------------------------------------------------------
export interface Measurement {
  id: string;
  indicatorId: MetricId;
  value: number | BpValue;
  unit: string;
  timestamp: string;
  missionDay: number;
  context: string[];
}

export type CrewSex = 'female' | 'male';

export interface Settings {
  name: string;
  /** Crew profile: default for the Male / Female body switch (optional for older saved data). */
  sex?: CrewSex;
  /** Optional profile photo path (e.g. /assets/crew-photo.png); initials are shown when missing. */
  photo?: string;
  location: Location;
  baselines: Baselines;
  careerRadiationLimit: number;
}

export type AlertType = 'range' | 'baseline' | 'trend' | 'pattern';

export interface Alert {
  id: string;
  indicatorId: IndicatorId | null;
  missionDay: number;
  type: AlertType;
  status: Status;
  message: string;
  open: boolean;
}

export interface Evaluation {
  indicatorId: MetricId;
  value: ReadingValue;
  status: Status;
  rangeStatus: Status;
  /** Reasons that raised the status, used for alerts. */
  reasons: AlertType[];
  labels: string[];
  note?: string;
  deltaPct: number | null;
  escalate: boolean;
}

export interface PatternHit {
  id: PatternId;
  missionDay: number;
  title: string;
  escalate: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export const rank = (s: Status): number => STATUS_ORDER.indexOf(s);
export const worst = (...list: Status[]): Status =>
  list.reduce<Status>((a, b) => (rank(b) > rank(a) ? b : a), 'OK');
export const atLeast = (s: Status, min: Status): Status => (rank(s) < rank(min) ? min : s);

export const isBp = (v: ReadingValue | undefined): v is BpValue =>
  typeof v === 'object' && v !== null && 'sys' in v;

export const num = (v: ReadingValue): number => (isBp(v) ? v.sys : v);

const round1 = (x: number) => Math.round(x * 10) / 10;
const SLEEP_PERSISTENCE_LABEL = `Sleep below ${THRESHOLDS.sleep.okMin} h for ${THRESHOLDS.sleep.nightsInRow} consecutive mission days`;
const MOOD_PERSISTENCE_LABEL = `Mood ${THRESHOLDS.mood.lowMax} or lower for ${THRESHOLDS.mood.daysInRow} consecutive mission days`;

/** Percent difference vs baseline. For BP the systolic value is used for display. */
export function deltaVsBaseline(value: ReadingValue, baseline: ReadingValue | undefined): number | null {
  if (baseline === undefined) return null;
  const b = num(baseline);
  if (!b) return null;
  return round1(((num(value) - b) / b) * 100);
}

/** Largest absolute % deviation (BP: max of systolic and diastolic). */
function maxDeviationPct(value: ReadingValue, baseline: ReadingValue): number {
  if (isBp(value) && isBp(baseline)) {
    return Math.max(
      Math.abs((value.sys - baseline.sys) / baseline.sys) * 100,
      Math.abs((value.dia - baseline.dia) / baseline.dia) * 100,
    );
  }
  const b = num(baseline);
  return b ? Math.abs((num(value) - b) / b) * 100 : 0;
}

// ---------------------------------------------------------------------------
// Range status per indicator (section 3)
// ---------------------------------------------------------------------------
export interface RangeResult {
  status: Status;
  labels: string[];
}

export function bpRange(v: BpValue): RangeResult {
  const t = THRESHOLDS.bp;
  if (v.sys > t.critSysAbove || v.dia > t.critDiaAbove) return { status: 'CRITICAL', labels: [] };
  if (v.sys >= t.actSysMin || v.dia >= t.actDiaMin) return { status: 'ACT', labels: [] };
  if (v.sys >= t.watchSysMin || v.dia >= t.watchDiaMin) return { status: 'WATCH', labels: [] };
  if (v.sys < t.lowSysBelow || v.dia < t.lowDiaBelow) return { status: 'WATCH', labels: [LABEL_LOW_BP] };
  return { status: 'OK', labels: [] };
}

/**
 * Heart rate. OK 60–100 (also 50–59 if baseline < 60); ACT > 120 or < 40;
 * every other value (101–120, or a low value not covered by OK) is WATCH.
 */
export function hrRange(v: number, baseline?: number): RangeResult {
  const t = THRESHOLDS.hr;
  if (v > t.actAbove || v < t.actBelow) return { status: 'ACT', labels: [] };
  if (v >= t.okMin && v <= t.okMax) return { status: 'OK', labels: [] };
  const lowBaseline = baseline !== undefined && baseline < t.lowBaselineCut;
  if (v >= t.okLowMin && v < t.okMin && lowBaseline) return { status: 'OK', labels: [] };
  return { status: 'WATCH', labels: [] };
}

export function tempRange(v: number): RangeResult {
  const t = THRESHOLDS.temp;
  if (v >= t.critMin) return { status: 'CRITICAL', labels: [] };
  if (v >= t.actMin || v < t.actBelow) return { status: 'ACT', labels: [] };
  if (v >= t.watchMin) return { status: 'WATCH', labels: [] };
  return { status: 'OK', labels: [] }; // 35.0–37.4; a low value for this astronaut is left to R2/R3
}

export function spo2Range(v: number): RangeResult {
  const t = THRESHOLDS.spo2;
  if (v >= t.okMin) return { status: 'OK', labels: [] };
  if (v >= t.watchMin) return { status: 'WATCH', labels: [] };
  return { status: 'CRITICAL', labels: [] };
}

export function glucoseRange(v: number): RangeResult {
  const t = THRESHOLDS.glucose;
  if (v > t.critAbove) return { status: 'CRITICAL', labels: [] };
  if (v < t.watchLowMin || v > t.watchHighMax) return { status: 'ACT', labels: [] };
  if (v < t.okMin || v > t.okMax) return { status: 'WATCH', labels: [] };
  return { status: 'OK', labels: [] };
}

export function sleepRange(v: number): RangeResult {
  const t = THRESHOLDS.sleep;
  if (v >= t.okMin) return { status: 'OK', labels: [] };
  if (v >= t.watchMin) return { status: 'WATCH', labels: [] };
  return { status: 'ACT', labels: [] };
}

export function moodRange(v: number): RangeResult {
  return v >= THRESHOLDS.mood.okMin ? { status: 'OK', labels: [] } : { status: 'WATCH', labels: [] };
}

export interface RadiationInput {
  daily: number;
  cumulative: number;
  limit: number;
  /** Average daily dose over the previous 7 days (null if no history). */
  avg7: number | null;
}

export function radiationRange(r: RadiationInput): RangeResult {
  const t = THRESHOLDS.radiation;
  const pct = r.limit > 0 ? (r.cumulative / r.limit) * 100 : 0;
  const spike = r.avg7 !== null && r.avg7 > 0 && r.daily > t.spikeFactor * r.avg7;
  if (spike) return { status: 'ACT', labels: [LABEL_SOLAR] };
  if (pct >= t.actPct) return { status: 'ACT', labels: [] };
  if (pct >= t.watchPct) return { status: 'WATCH', labels: [] };
  return { status: 'OK', labels: [] };
}

// ---------------------------------------------------------------------------
// Trend (R3)
// ---------------------------------------------------------------------------
/** "Badness" of a reading: larger is worse. */
export function badness(id: IndicatorId, value: ReadingValue, baseline?: ReadingValue): number {
  const v = num(value);
  const b = baseline !== undefined ? num(baseline) : undefined;
  switch (id) {
    case 'spo2':
    case 'sleep':
    case 'mood':
      return -v;
    case 'temp':
      return Math.abs(v - (b ?? 36.6));
    case 'bp':
    case 'hr':
    case 'glucose':
      return b !== undefined ? Math.abs(v - b) : v;
    default:
      return v;
  }
}

/**
 * R3: worse in 3 consecutive readings — each of the last 3 readings is
 * worse than the one before it (needs 4 readings).
 */
export function isTrendingWorse(id: IndicatorId, series: ReadingValue[], baseline?: ReadingValue): boolean {
  if (id === 'radiation') return false;
  const n = THRESHOLDS.rules.trendReadings;
  if (series.length < n + 1) return false;
  const tail = series.slice(-(n + 1)).map((v) => badness(id, v, baseline));
  for (let i = 1; i < tail.length; i++) if (!(tail[i] > tail[i - 1])) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Single reading evaluation
// ---------------------------------------------------------------------------
export interface ReadingInput {
  indicatorId: IndicatorId;
  value: ReadingValue;
  baseline?: ReadingValue;
  context?: string[];
  /** Required for rules that depend on consecutive mission days. */
  missionDay?: number;
  /** Previous daily values, normalized by dailySeries, oldest first. */
  history?: { missionDay: number; value: ReadingValue }[];
  /** Radiation only. */
  radiation?: { cumulative: number; limit: number; avg7: number | null };
  /** Temperature only: was the previous day already ACT or worse? (>24 h) */
  previousDayStatus?: Status;
}

function hasConsecutiveDailyValues(input: ReadingInput, count: number, test: (value: number) => boolean): boolean {
  if (input.missionDay === undefined) return false;
  const values = new Map((input.history ?? []).map((reading) => [reading.missionDay, reading.value]));
  values.set(input.missionDay, input.value);
  for (let day = input.missionDay; day > input.missionDay - count; day--) {
    const value = values.get(day);
    if (value === undefined || !test(num(value))) return false;
  }
  return true;
}

export function rangeFor(input: ReadingInput): RangeResult {
  const { indicatorId: id, value } = input;
  switch (id) {
    case 'bp':
      return bpRange(value as BpValue);
    case 'hr':
      return hrRange(num(value), input.baseline !== undefined ? num(input.baseline) : undefined);
    case 'temp':
      return tempRange(num(value));
    case 'spo2':
      return spo2Range(num(value));
    case 'glucose':
      return glucoseRange(num(value));
    case 'sleep':
      return sleepRange(num(value));
    case 'mood':
      return moodRange(num(value));
    case 'radiation': {
      const r = input.radiation ?? { cumulative: num(value), limit: THRESHOLDS.radiation.careerLimitDefault, avg7: null };
      return radiationRange({ daily: num(value), ...r });
    }
  }
}

export function evaluateReading(input: ReadingInput): Evaluation {
  const { indicatorId: id, value, baseline } = input;
  const history = (input.history ?? []).map((reading) => reading.value);
  const range = rangeFor(input);
  let status = range.status;
  const labels = [...range.labels];
  const reasons: AlertType[] = [];
  if (range.status !== 'OK') reasons.push('range');

  const sustainedSleepLoss = id === 'sleep' &&
    hasConsecutiveDailyValues(input, THRESHOLDS.sleep.nightsInRow, (hours) => hours < THRESHOLDS.sleep.okMin);
  const sustainedLowMood = id === 'mood' &&
    hasConsecutiveDailyValues(input, THRESHOLDS.mood.daysInRow, (mood) => mood <= THRESHOLDS.mood.lowMax);
  if (sustainedSleepLoss || sustainedLowMood) {
    status = atLeast(status, 'ACT');
    if (!reasons.includes('range')) reasons.push('range');
    labels.push(sustainedSleepLoss ? SLEEP_PERSISTENCE_LABEL : MOOD_PERSISTENCE_LABEL);
  }

  // R2 baseline.
  const deltaPct = id === 'radiation' ? null : deltaVsBaseline(value, baseline);
  if (baseline !== undefined && BASELINE_INDICATORS.includes(id)) {
    if (maxDeviationPct(value, baseline) > THRESHOLDS.rules.baselinePct) {
      status = atLeast(status, 'WATCH');
      labels.push(LABEL_UNUSUAL);
      reasons.push('baseline');
    }
  }

  // R3 trend.
  if (isTrendingWorse(id, [...history, value], baseline)) {
    status = atLeast(status, 'WATCH');
    labels.push(LABEL_TRENDING);
    reasons.push('trend');
  }

  // Context informs remeasurement; it cannot rule out an abnormal reading.
  let note: string | undefined;
  const ctx = input.context ?? [];
  if (
    (id === 'hr' || id === 'bp') &&
    ctx.some((c) => (EXERTION_CONTEXTS as string[]).includes(c)) &&
    status !== 'OK'
  ) {
    note = EXERTION_NOTE;
  }

  // Escalation.
  let escalate = status === 'CRITICAL' || (id === 'temp' && num(value) < THRESHOLDS.temp.actBelow);
  if (id === 'temp' && rank(status) >= rank('ACT') && input.previousDayStatus && rank(input.previousDayStatus) >= rank('ACT')) {
    escalate = true; // ACT for more than 24 h
  }

  return { indicatorId: id, value, status, rangeStatus: range.status, reasons, labels, note, deltaPct, escalate };
}

// ---------------------------------------------------------------------------
// Mission-level helpers (operate on Measurement[])
// ---------------------------------------------------------------------------

/** Latest measurement per indicator per mission day. */
export function dailyValue(ms: Measurement[], id: MetricId, day: number): Measurement | undefined {
  let found: Measurement | undefined;
  for (const m of ms) {
    if (m.indicatorId !== id || m.missionDay !== day) continue;
    if (!found || m.timestamp >= found.timestamp) found = m;
  }
  return found;
}

/** Daily series (one value per day that has data) up to and including `day`. */
export function dailySeries(ms: Measurement[], id: MetricId, upToDay: number): Measurement[] {
  const days = new Map<number, Measurement>();
  for (const m of ms) {
    if (m.indicatorId !== id || m.missionDay > upToDay) continue;
    const prev = days.get(m.missionDay);
    if (!prev || m.timestamp >= prev.timestamp) days.set(m.missionDay, m);
  }
  return [...days.values()].sort((a, b) => a.missionDay - b.missionDay);
}

/** Sum of all radiation measurements (daily doses) up to and including `day`. */
export function cumulativeDose(ms: Measurement[], upToDay: number): number {
  return Math.round(dailySeries(ms, 'radiation', upToDay).reduce((s, m) => s + num(m.value), 0) * 100) / 100;
}

export function radiationContext(ms: Measurement[], day: number, limit: number) {
  const series = dailySeries(ms, 'radiation', day);
  const prev = series.filter((m) => m.missionDay < day).slice(-THRESHOLDS.radiation.avgWindowDays);
  const avg7 = prev.length ? prev.reduce((s, m) => s + num(m.value), 0) / prev.length : null;
  return { cumulative: cumulativeDose(ms, day), limit, avg7 };
}

/** Evaluate one indicator on one mission day, using the full history. */
export function evaluateIndicatorOnDay(
  ms: Measurement[],
  id: IndicatorId,
  day: number,
  settings: Settings,
  depth = 0,
): Evaluation | null {
  const current = dailyValue(ms, id, day);
  if (!current) return null;
  const series = dailySeries(ms, id, day);
  const history = series.filter((m) => m.missionDay < day);
  let previousDayStatus: Status | undefined;
  if (id === 'temp' && depth === 0) {
    const prev = evaluateIndicatorOnDay(ms, id, day - 1, settings, 1);
    previousDayStatus = prev?.status;
  }
  return evaluateReading({
    indicatorId: id,
    value: current.value,
    baseline: settings.baselines[id],
    context: current.context,
    missionDay: day,
    history,
    radiation: id === 'radiation' ? radiationContext(ms, day, settings.careerRadiationLimit) : undefined,
    previousDayStatus,
  });
}

export function evaluateDay(ms: Measurement[], day: number, settings: Settings): Partial<Record<IndicatorId, Evaluation>> {
  const out: Partial<Record<IndicatorId, Evaluation>> = {};
  for (const id of INDICATOR_ORDER) {
    const e = evaluateIndicatorOnDay(ms, id, day, settings);
    if (e) out[id] = e;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Patterns (R4)
// ---------------------------------------------------------------------------
function valOn(ms: Measurement[], id: MetricId, day: number): number | undefined {
  const m = dailyValue(ms, id, day);
  return m ? num(m.value) : undefined;
}

/** True if `test` holds for the value on `day` or `day - 1`. */
function sameOrPrevious(ms: Measurement[], id: IndicatorId, day: number, test: (v: number) => boolean): boolean {
  return [day, day - 1].some((d) => {
    const v = valOn(ms, id, d);
    return v !== undefined && test(v);
  });
}

export function detectPatterns(ms: Measurement[], day: number): PatternHit[] {
  const hits: PatternHit[] = [];
  const add = (id: PatternId) =>
    hits.push({ id, missionDay: day, title: PATTERNS[id].title, escalate: PATTERNS[id].escalate });

  // P1: temp ≥37.5 + sleep <6 h + mood ≤2, each on the same day or the previous day.
  // At least one of the three must hold on `day` itself (new evidence today).
  const p1Tests: [IndicatorId, (v: number) => boolean][] = [
    ['temp', (v) => v >= THRESHOLDS.temp.watchMin],
    ['sleep', (v) => v < THRESHOLDS.sleep.watchMin],
    ['mood', (v) => v <= THRESHOLDS.mood.lowMax],
  ];
  const p1All = p1Tests.every(([id, test]) => sameOrPrevious(ms, id, day, test));
  const p1Today = p1Tests.some(([id, test]) => {
    const v = valOn(ms, id, day);
    return v !== undefined && test(v);
  });
  if (p1All && p1Today) add('P1');

  const hr = valOn(ms, 'hr', day);
  const spo2 = valOn(ms, 'spo2', day);
  const bp = dailyValue(ms, 'bp', day)?.value;
  // P2: HR >100 + SpO2 <95.
  if (hr !== undefined && spo2 !== undefined && hr > THRESHOLDS.hr.okMax && spo2 < THRESHOLDS.spo2.okMin) add('P2');
  // P3: BP sys <90 + HR >100.
  if (hr !== undefined && isBp(bp) && bp.sys < THRESHOLDS.bp.lowSysBelow && hr > THRESHOLDS.hr.okMax) add('P3');
  return hits;
}

// ---------------------------------------------------------------------------
// Escalation (R5)
// ---------------------------------------------------------------------------
export function escalationText(location: Location): string {
  return ESCALATION[location];
}

/** Escalation applies when status is ACT/CRITICAL (panel rule). */
export function needsEscalationText(status: Status): boolean {
  return rank(status) >= rank('ACT');
}

// ---------------------------------------------------------------------------
// Overall status + alerts
// ---------------------------------------------------------------------------
export function overallStatus(evals: Partial<Record<IndicatorId, Evaluation>>, patterns: PatternHit[]): Status | null {
  const statuses = INDICATOR_ORDER.flatMap((id) => evals[id] ? [evals[id]!.status] : []);
  if (!statuses.length && !patterns.length) return null;
  let s = worst(...statuses);
  if (patterns.some((p) => p.escalate)) s = atLeast(s, 'ACT');
  else if (patterns.length) s = atLeast(s, 'WATCH');
  return s;
}

/** Indicator with the worst status (default selection when none is chosen). */
export function worstIndicator(evals: Partial<Record<IndicatorId, Evaluation>>): IndicatorId {
  let best: IndicatorId = 'bp';
  let r = -1;
  for (const id of INDICATOR_ORDER) {
    const e = evals[id];
    if (e && rank(e.status) > r) {
      r = rank(e.status);
      best = id;
    }
  }
  return best;
}

export function attentionCount(evals: Partial<Record<IndicatorId, Evaluation>>): number {
  return Object.values(evals).filter((e) => e && e.status !== 'OK').length;
}

export interface AssessmentSummary {
  measured: number;
  total: number;
  missing: number;
  attention: number;
  complete: boolean;
  status: Status | null;
}

export function summarizeAssessment(evals: Partial<Record<IndicatorId, Evaluation>>, patterns: PatternHit[]): AssessmentSummary {
  const measured = INDICATOR_ORDER.filter((id) => evals[id] !== undefined).length;
  const total = INDICATOR_ORDER.length;
  return {
    measured,
    total,
    missing: total - measured,
    attention: attentionCount(evals),
    complete: measured === total,
    status: overallStatus(evals, patterns),
  };
}

const TYPE_TEXT: Record<Exclude<AlertType, 'pattern'>, string> = {
  range: 'Out of range',
  baseline: LABEL_UNUSUAL,
  trend: LABEL_TRENDING,
};

export function formatValue(id: MetricId, v: ReadingValue): string {
  const ind = metricDef(id);
  if (isBp(v)) return `${Math.round(v.sys)}/${Math.round(v.dia)}`;
  return v.toLocaleString('en-US', { minimumFractionDigits: ind.decimals, maximumFractionDigits: ind.decimals });
}

/** Alerts raised on one day (deterministic ids). */
export function alertsForDay(ms: Measurement[], day: number, settings: Settings): Omit<Alert, 'open'>[] {
  const out: Omit<Alert, 'open'>[] = [];
  const evals = evaluateDay(ms, day, settings);
  for (const id of INDICATOR_ORDER) {
    const e = evals[id];
    if (!e || e.status === 'OK') continue;
    for (const type of e.reasons) {
      if (type === 'pattern') continue;
      out.push({
        id: `${id}-${day}-${type}`,
        indicatorId: id,
        missionDay: day,
        type,
        status: e.status,
        message: (() => {
          const extra = e.labels.filter((l) => l !== TYPE_TEXT[type] && l !== LABEL_UNUSUAL && l !== LABEL_TRENDING);
          return `${INDICATORS[id].name} ${formatValue(id, e.value)} ${INDICATORS[id].unit} — ${TYPE_TEXT[type]}${
            extra.length ? ` (${extra.join(', ')})` : ''
          }`;
        })(),
      });
    }
  }
  for (const p of detectPatterns(ms, day)) {
    out.push({
      id: `${p.id}-${day}-pattern`,
      indicatorId: null,
      missionDay: day,
      type: 'pattern',
      status: p.escalate ? 'ACT' : 'WATCH',
      message: `Pattern detected: ${p.title}`,
    });
  }
  return out;
}

/** Latest mission day ≤ upToDay that has any measurement. */
export function latestDataDay(ms: Measurement[], upToDay: number): number {
  let d = 0;
  for (const m of ms) if (m.missionDay <= upToDay && m.missionDay > d) d = m.missionDay;
  return d;
}

/**
 * All alerts from day 1 up to `upToDay` (history). Alerts raised on the latest
 * day with data are open unless the user acknowledged them; earlier alerts are
 * history (the condition either cleared or was raised again later).
 */
export function buildAlerts(ms: Measurement[], upToDay: number, settings: Settings, acknowledged: string[]): Alert[] {
  const ack = new Set(acknowledged);
  const current = latestDataDay(ms, upToDay);
  const all: Alert[] = [];
  for (let d = 1; d <= upToDay; d++) {
    for (const a of alertsForDay(ms, d, settings)) all.push({ ...a, open: d === current && !ack.has(a.id) });
  }
  return all;
}

// ---------------------------------------------------------------------------
// Context Explorer — contributing factors for a reading
// ---------------------------------------------------------------------------
export interface Factor {
  id: FactorId;
  name: string;
  level: FactorLevel;
  reason: string;
}

function contextOn(ms: Measurement[], day: number, ctx: string): boolean {
  return ms.some((m) => m.missionDay === day && m.context.includes(ctx));
}

export function contributingFactors(
  ms: Measurement[],
  day: number,
  settings: Settings,
  indicatorId: MetricId,
): Factor[] {
  const reading = dailyValue(ms, indicatorId, day);
  const ctx = reading?.context ?? [];
  const f = (id: FactorId, level: FactorLevel, reason: string): Factor => ({ id, name: FACTOR_NAMES[id], level, reason });
  const out: Factor[] = [];

  // Workload / exercise
  const exertedNow = ctx.some((c) => (EXERTION_CONTEXTS as string[]).includes(c));
  const exertedRecently = [day, day - 1].some((d) => EXERTION_CONTEXTS.some((c) => contextOn(ms, d, c)));
  out.push(
    exertedNow
      ? f('workload', 'High', FACTOR_TEXT.workloadHigh)
      : exertedRecently
        ? f('workload', 'Medium', FACTOR_TEXT.workloadMedium)
        : f('workload', 'Low', FACTOR_TEXT.workloadLow),
  );

  // Sleep loss
  const sleep = dailyValue(ms, 'sleep', day);
  if (!sleep) out.push(f('sleep', 'Low', FACTOR_TEXT.sleepNoData));
  else {
    const h = num(sleep.value);
    let nights = 0;
    for (let d = day; d >= 1; d--) {
      const v = dailyValue(ms, 'sleep', d);
      if (v && num(v.value) < THRESHOLDS.sleep.okMin) nights++;
      else break;
    }
    const hours = FACTOR_TEXT.sleepHours(h.toLocaleString('en-US', { maximumFractionDigits: 1 }));
    if (h < THRESHOLDS.sleep.watchMin || nights >= THRESHOLDS.sleep.nightsInRow)
      out.push(f('sleep', 'High', nights >= THRESHOLDS.sleep.nightsInRow ? `${hours} ${FACTOR_TEXT.sleepDebt(nights)}` : hours));
    else if (h < THRESHOLDS.sleep.okMin) out.push(f('sleep', 'Medium', hours));
    else out.push(f('sleep', 'Low', hours));
  }

  // EVA
  if (ctx.includes('After EVA')) out.push(f('eva', 'High', FACTOR_TEXT.evaHigh));
  else if ([day, day - 1, day - 2].some((d) => contextOn(ms, d, 'After EVA'))) out.push(f('eva', 'Medium', FACTOR_TEXT.evaMedium));
  else out.push(f('eva', 'Low', FACTOR_TEXT.evaLow));

  // Hydration (estimated)
  const bp = dailyValue(ms, 'bp', day)?.value;
  const hr = valOn(ms, 'hr', day);
  const temp = valOn(ms, 'temp', day);
  if ((isBp(bp) && bp.sys < THRESHOLDS.bp.lowSysBelow) || (hr !== undefined && hr > THRESHOLDS.hr.okMax && !exertedNow))
    out.push(f('hydration', 'High', FACTOR_TEXT.hydrationHigh));
  else if (temp !== undefined && temp >= THRESHOLDS.temp.watchMin) out.push(f('hydration', 'Medium', FACTOR_TEXT.hydrationMedium));
  else out.push(f('hydration', 'Low', FACTOR_TEXT.hydrationLow));

  // Mission day
  if (day <= 7) out.push(f('missionDay', 'Medium', `Day ${day}. ${FACTOR_TEXT.missionEarly}`));
  else if (day >= 21) out.push(f('missionDay', 'Medium', `Day ${day}. ${FACTOR_TEXT.missionLate}`));
  else out.push(f('missionDay', 'Low', `Day ${day}. ${FACTOR_TEXT.missionMid}`));

  // Location
  const locLevel: Record<Location, FactorLevel> = { ISS: 'Low', MOON: 'Medium', MARS: 'High' };
  out.push(f('location', locLevel[settings.location], FACTOR_TEXT.location[settings.location]));
  return out;
}

// ---------------------------------------------------------------------------
// Plain-language interpretation and follow-up actions
// ---------------------------------------------------------------------------
export function interpretation(e: Evaluation): string {
  const ind = metricDef(e.indicatorId);
  if (e.indicatorId === 'exercise')
    return `${ind.meaning[e.status]} ${INTERPRET_TEXT.exercise(Math.round(num(e.value)), THRESHOLDS.exercise.targetMin)}`;
  if (e.indicatorId === 'temp' && num(e.value) < THRESHOLDS.temp.actBelow)
    return 'Your temperature is very low. Get urgent medical help now.';
  const parts = [ind.meaning[e.rangeStatus]];
  if (e.labels.includes(LABEL_SOLAR)) parts.push(INTERPRET_TEXT.solar);
  else if (e.labels.includes(LABEL_LOW_BP)) parts.push(INTERPRET_TEXT.lowBp);
  else if (e.labels.includes(LABEL_UNUSUAL) && e.deltaPct !== null)
    parts.push(INTERPRET_TEXT.unusual(`${Math.abs(Math.round(e.deltaPct))}%`, e.deltaPct >= 0 ? 'above' : 'below'));
  else if (e.labels.includes(LABEL_TRENDING)) parts.push(INTERPRET_TEXT.trending);
  const persistence = e.labels.find((label) => label === SLEEP_PERSISTENCE_LABEL || label === MOOD_PERSISTENCE_LABEL);
  return [...parts.slice(0, 2), ...(persistence ? [`${persistence}.`] : []), ...(e.note ? [e.note] : [])].join(' ');
}

/** Max 3 follow-up actions for a reading. */
export function followUpActions(e: Evaluation): string[] {
  if (e.indicatorId === 'temp' && num(e.value) < THRESHOLDS.temp.actBelow)
    return [
      'Get urgent help from the crew medical officer now.',
      'Handle gently, remove wet clothing, and use dry blankets for gentle warming while help is arranged.',
    ];
  if (e.rangeStatus === 'OK' && e.status === 'WATCH')
    return [
      'Confirm the entered value and measurement conditions.',
      'Re-measure and compare with your usual baseline and recent readings.',
      'Contact the crew medical officer if the change persists; seek urgent help for concerning symptoms.',
    ];
  const ind = metricDef(e.indicatorId);
  const actions = e.indicatorId === 'bp' && e.labels.includes(LABEL_LOW_BP)
    ? ['Drink fluids, especially before landing or a gravity change.', 'Use lower-body compression garments.', 'Re-measure at rest.']
    : ind.guidance[e.status];
  return [...new Set([...actions, ...(e.note ? [EXERTION_RECHECK] : [])])].slice(0, 3);
}

// ---------------------------------------------------------------------------
// Leg exercise (Legs zone) — % of the daily target
// ---------------------------------------------------------------------------
export function exerciseStatus(minutes: number, target: number = THRESHOLDS.exercise.targetMin): Status {
  const pct = target > 0 ? (minutes / target) * 100 : 100;
  if (pct >= THRESHOLDS.exercise.okPct) return 'OK';
  if (pct >= THRESHOLDS.exercise.watchPct) return 'WATCH';
  return 'ACT';
}

export function exercisePct(minutes: number, target: number = THRESHOLDS.exercise.targetMin): number {
  return target > 0 ? Math.round((minutes / target) * 100) : 100;
}

export function evaluateExerciseOnDay(ms: Measurement[], day: number): Evaluation | null {
  const m = dailyValue(ms, 'exercise', day);
  if (!m) return null;
  const minutes = num(m.value);
  const status = exerciseStatus(minutes);
  return {
    indicatorId: 'exercise',
    value: minutes,
    status,
    rangeStatus: status,
    reasons: status === 'OK' ? [] : ['range'],
    labels: [],
    deltaPct: exercisePct(minutes) - 100,
    escalate: false,
  };
}

/** Any metric (8 indicators or exercise) on one day. */
export function evaluateMetricOnDay(ms: Measurement[], id: MetricId, day: number, settings: Settings): Evaluation | null {
  return id === 'exercise' ? evaluateExerciseOnDay(ms, day) : evaluateIndicatorOnDay(ms, id, day, settings);
}

// ---------------------------------------------------------------------------
// Daily routine, reminders, streak and points (derived from the measurements)
// ---------------------------------------------------------------------------
export type RoutineState = 'done' | 'due' | 'later' | 'missed' | 'upcoming';
export interface RoutineItem {
  indicatorId: IndicatorId;
  state: RoutineState;
}
export interface Clock {
  /** Mission day that is "today" on the real clock. */
  today: number;
  now: Date;
}

/** A check counts as done on `day`; on today only readings already taken (timestamp ≤ now) count. */
function measuredOn(ms: Measurement[], id: IndicatorId, day: number, clock: Clock): boolean {
  const limit = clock.now.getTime();
  return ms.some(
    (m) => m.indicatorId === id && m.missionDay === day && (day !== clock.today || new Date(m.timestamp).getTime() <= limit),
  );
}

export function routineFor(ms: Measurement[], day: number, clock: Clock): { slot: string; items: RoutineItem[] }[] {
  return ROUTINE.map((g) => ({
    slot: g.slot,
    items: g.indicators.map((id) => {
      const done = g.daily
        ? measuredOn(ms, id, day, clock)
        : Array.from({ length: GAMIFICATION.weeklyWindowDays }, (_, k) => day - k).some((d) => d >= 1 && measuredOn(ms, id, d, clock));
      let state: RoutineState;
      if (done) state = 'done';
      else if (day < clock.today) state = 'missed';
      else if (day > clock.today) state = 'upcoming';
      else state = clock.now.getHours() >= g.dueFromHour ? 'due' : 'later';
      return { indicatorId: id, state };
    }),
  }));
}

/** All daily checks (morning + evening) done on `day`. */
export function dayComplete(ms: Measurement[], day: number, clock: Clock): boolean {
  return ROUTINE.filter((g) => g.daily).every((g) => g.indicators.every((id) => measuredOn(ms, id, day, clock)));
}

/** Consecutive complete days ending at `day` (today still in progress does not break it). */
export function streakOn(ms: Measurement[], day: number, clock: Clock): number {
  let d = day;
  if (d === clock.today && !dayComplete(ms, d, clock)) d -= 1;
  let n = 0;
  for (; d >= 1 && dayComplete(ms, d, clock); d--) n++;
  return n;
}

/** +10 points per completed check (one per indicator per day) up to `day`. */
export function pointsOn(ms: Measurement[], day: number, clock: Clock): number {
  const seen = new Set<string>();
  for (const m of ms) {
    if (m.indicatorId === 'exercise' || m.missionDay > day) continue;
    if (!measuredOn(ms, m.indicatorId, m.missionDay, clock)) continue;
    seen.add(`${m.missionDay}:${m.indicatorId}`);
  }
  return seen.size * GAMIFICATION.pointsPerCheck;
}
