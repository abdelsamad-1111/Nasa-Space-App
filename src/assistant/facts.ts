// Astro Health AI — facts, built-in answers and answer rules.
// Every fact (status, values, trend, guidance, escalation, sources) comes from evaluate.ts and
// indicators.ts. The model only words the reply; the app decides the status chip, whether
// actions / contact / source are shown, the escalation text, and which numbers and status
// words a reply may contain. `fallback` is the built-in answer used when the link is offline,
// slow (8 s), rate-limited or returns something unusable.
import {
  CARD_LABEL,
  ESCALATION,
  EXERCISE,
  HOW_TO,
  INDICATOR_ORDER,
  INDICATORS,
  LOCATION_LABEL,
  PATTERNS,
  STATUS_WORD,
  THRESHOLDS,
  fmtMinutes,
  metricDef,
  type IndicatorId,
  type Location,
  type MetricId,
  type ReadingValue,
  type Status,
} from '../brain/indicators';
import {
  badness,
  dailySeries,
  dailyValue,
  evaluateExerciseOnDay,
  evaluateIndicatorOnDay,
  followUpActions,
  interpretation,
  needsEscalationText,
  num,
  rank,
  type Alert,
  type Evaluation,
  type Measurement,
  type PatternHit,
  type Settings,
} from '../brain/evaluate';
import { HEALTH_SOURCES, SOURCES, sourcesForMetric } from '../data/healthSources';
import { fmtNumber, fmtPct, fmtValue } from '../lib/format';
import { FORECAST_LABEL } from '../brain/forecast';
import { FORECAST_ANSWER_END, forecastLocationNote, forecastPresentation, type ForecastPresentation } from '../lib/forecastPresentation';

export type QuickActionId = 'status' | 'reading' | 'todo' | 'contact' | 'pattern' | 'measure' | 'risk';
export type AskKind = QuickActionId | 'question';

export const QUICK_ACTIONS: { id: QuickActionId; label: string }[] = [
  { id: 'status', label: 'Explain my status today' },
  { id: 'reading', label: 'Explain this reading' },
  { id: 'todo', label: 'What should I do now?' },
  { id: 'contact', label: 'Do I need to contact Earth?' },
  { id: 'pattern', label: 'Explain the pattern' },
  { id: 'measure', label: 'How do I measure this?' },
  { id: 'risk', label: 'Why am I at risk?' },
];

/** What an assistant message contains (model JSON, after the app's rules). */
export interface ChatAnswer {
  reply: string;
  actions: string[];
  contact: string;
  source: string;
  followups: string[];
}

/** What the assistant needs from the app state (no React). */
export interface AssistantInput {
  measurements: Measurement[];
  settings: Settings;
  day: number;
  selected: MetricId;
  evals: Partial<Record<IndicatorId, Evaluation>>;
  metrics: Partial<Record<MetricId, Evaluation>>;
  patterns: PatternHit[];
  overall: Status | null;
  openAlerts: Alert[];
}

export interface ChatTurn {
  from: 'CREW' | 'CAPCOM';
  text: string;
}

export interface FactPack {
  kind: AskKind;
  /** Best guess without the model (keywords); quick actions are always in scope. */
  inScope: boolean;
  /** Status chip, copied from evaluate.ts (null = no chip). */
  status: Status | null;
  statusLabel: string;
  escalationRequired: boolean;
  escalationText: string;
  showActions: boolean;
  showContact: boolean;
  showSource: boolean;
  /** Allowed sources; the first is the default. */
  sourceUrls: string[];
  /** App guidance every shown action must be based on. */
  allowedActions: string[];
  /** Sent to the model as APP_FACTS. */
  facts: Record<string, unknown>;
  /** Built-in answer for an in-scope question. */
  fallback: ChatAnswer;
  /** For "is it getting better?" questions: the app's own answer with the real readings. */
  lead?: string;
  forecast: ForecastPresentation | null;
  /** Forecast replies remain app-authored so a model cannot turn a warning into a diagnosis. */
  forecastRequested: boolean;
}

export const NO_ESCALATION = 'The app rules do not require contacting the ground now.';
const OK_GUIDANCE = INDICATORS.temp.guidance.OK[0]; // "No action needed. Measure again tomorrow."
const PATTERN_SOURCE = HEALTH_SOURCES['nasa-hrp-risks'].url;

export const OUT_OF_SCOPE_ANSWER: ChatAnswer = {
  reply:
    'That one is outside what I can check — I only cover your 8 health readings, logged exercise and the app’s alerts. Please talk to your crew medical officer, or the flight surgeon on the ground, about it.',
  actions: [],
  contact: '',
  source: '',
  followups: ['Explain my status today', 'Do I need to contact Earth?'],
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const statusWord = (s: Status | null | undefined): string => (s ? STATUS_WORD[s] : 'No data');
const isIndicator = (id: MetricId): id is IndicatorId => id !== 'exercise';
const ALL_METRICS: MetricId[] = [...INDICATOR_ORDER, 'exercise'];

/** "A. Rahman" from "Astronaut A. Rahman". */
export function crewName(settings: Settings): string {
  return settings.name.replace(/^astronaut\s+/i, '').trim() || 'crew';
}

/** Short lower-case name for sentences: "temperature", "SpO2", "mission dose". */
export function shortName(id: MetricId): string {
  if (id === 'exercise') return 'exercise';
  const label = CARD_LABEL[id];
  return label === 'SpO2' ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

const LOCATION_PHRASE: Record<Location, string> = { ISS: 'the ISS', MOON: 'the Moon', MARS: 'Mars' };

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Chat wording for an app guidance line: drop long "such as …" symptom lists. */
export function tidyAction(action: string): string {
  const t = action.replace(/,?\s+such as [^.]*/i, '').trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function fmtReading(id: MetricId, v: ReadingValue): string {
  if (!isIndicator(id)) return fmtMinutes(num(v));
  return `${fmtValue(id, v)} ${INDICATORS[id].unit}`;
}

/** First `max` sentences of a text. */
export function firstSentences(text: string, max = 2): string {
  const parts = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, max).join(' ');
}

function sourceUrlsFor(id: MetricId): string[] {
  return [...new Set([...sourcesForMetric(id).map((s) => s.url), metricDef(id).nasaRiskUrl])];
}

/** Every URL the assistant may cite (indicators.ts re-exports SOURCES). */
export const ALLOWED_SOURCE_URLS: string[] = [
  ...new Set([...SOURCES.map((s) => s.url), ...INDICATOR_ORDER.map((id) => INDICATORS[id].nasaRiskUrl), EXERCISE.nasaRiskUrl]),
];

export function sourceLabel(url: string): string {
  const src = SOURCES.find((s) => s.url === url);
  if (src) return src.label;
  const ind = [...INDICATOR_ORDER.map((id) => INDICATORS[id]), EXERCISE].find((i) => i.nasaRiskUrl === url);
  return ind ? `NASA spaceflight risk — ${ind.name}` : url;
}

/** Evaluation of one metric on any day (the selected day comes from the app view). */
function evalOn(input: AssistantInput, id: MetricId, day: number): Evaluation | null {
  if (day === input.day) return input.metrics[id] ?? null;
  if (day < 1) return null;
  return isIndicator(id) ? evaluateIndicatorOnDay(input.measurements, id, day, input.settings) : evaluateExerciseOnDay(input.measurements, day);
}

/** Change from the previous day's reading, judged with evaluate.ts `badness` (exercise: more is better). */
export function dayChange(input: AssistantInput, id: MetricId, day: number) {
  const cur = dailyValue(input.measurements, id, day);
  const prev = dailyValue(input.measurements, id, day - 1);
  if (!cur || !prev) return { direction: null, previous: prev ? fmtReading(id, prev.value) : null, current: cur ? fmtReading(id, cur.value) : null };
  const bad = (v: ReadingValue) => (isIndicator(id) ? badness(id, v, input.settings.baselines[id]) : -num(v));
  const diff = bad(cur.value) - bad(prev.value);
  const direction: 'worse' | 'better' | 'same' = Math.abs(diff) < 1e-9 ? 'same' : diff > 0 ? 'worse' : 'better';
  return { direction, previous: fmtReading(id, prev.value), current: fmtReading(id, cur.value) };
}

/** Items that are not OK on the selected day, worst first. */
function attentionItems(input: AssistantInput): { id: MetricId; e: Evaluation }[] {
  return ALL_METRICS
    .flatMap((id) => {
      const e = input.metrics[id];
      return e && e.status !== 'OK' ? [{ id, e }] : [];
    })
    .sort((a, b) => rank(b.e.status) - rank(a.e.status));
}

/** Day-level escalation: Act or worse, a reading that escalates by itself, or an escalating pattern. */
export function dayNeedsEscalation(input: AssistantInput): boolean {
  return (
    (input.overall !== null && needsEscalationText(input.overall)) ||
    Object.values(input.evals).some((e) => e?.escalate) ||
    input.patterns.some((p) => p.escalate)
  );
}

const readingNeedsEscalation = (e: Evaluation | null) => Boolean(e && (needsEscalationText(e.status) || e.escalate));
const isActOrWorse = (s: Status | null) => s !== null && rank(s) >= rank('ACT');

/** Every follow-up action for the day, labelled, patterns first then worst readings first. */
function allDayActions(input: AssistantInput): string[] {
  const patterns = input.patterns.flatMap((p) => PATTERNS[p.id].actions.map((a) => `${p.title}: ${a}`));
  const items = attentionItems(input).flatMap(({ id, e }) => followUpActions(e).map((a) => `${metricDef(id).name}: ${a}`));
  const all = [...patterns, ...items];
  return all.length ? all : [OK_GUIDANCE];
}

function todoActions(input: AssistantInput): string[] {
  const items = attentionItems(input).map(({ id, e }) => `${metricDef(id).name}: ${followUpActions(e)[0]}`);
  const patterns = input.patterns.map((p) => `${p.title}: ${PATTERNS[p.id].actions[0]}`);
  const all = [...patterns, ...items];
  return all.length ? all.slice(0, 3) : [OK_GUIDANCE];
}

function readingFacts(input: AssistantInput, id: MetricId, day: number) {
  const e = evalOn(input, id, day);
  const def = metricDef(id);
  if (!e) return { indicator: def.name, day, reading: 'No reading on this day' };
  const baseline = isIndicator(id) ? input.settings.baselines[id] : undefined;
  const prev = evalOn(input, id, day - 1);
  const change = dayChange(input, id, day);
  return {
    indicator: def.name,
    day,
    value: fmtReading(id, e.value),
    status: STATUS_WORD[e.status],
    baseline: baseline !== undefined ? fmtReading(id, baseline) : id === 'exercise' ? `${fmtMinutes(THRESHOLDS.exercise.targetMin)} planning target` : 'not set',
    differenceVsBaseline: e.deltaPct !== null ? fmtPct(e.deltaPct) : 'not available',
    labels: e.labels,
    previousDay: prev ? { day: day - 1, value: fmtReading(id, prev.value), status: STATUS_WORD[prev.status] } : 'no reading',
    changeVsPreviousDay: change.direction ?? 'not available',
    lastReadings: dailySeries(input.measurements, id, day).slice(-4).map((m) => `Day ${m.missionDay}: ${fmtReading(id, m.value)}`),
    thresholds: def.thresholds,
    appInterpretation: interpretation(e),
    guidance: followUpActions(e),
    ...(id === 'radiation'
      ? { missionDose: `${fmtNumber(cumulative(input, day), 1)} mSv`, careerLimit: `${fmtNumber(input.settings.careerRadiationLimit)} mSv` }
      : {}),
  };
}

function cumulative(input: AssistantInput, day: number): number {
  return dailySeries(input.measurements, 'radiation', day).reduce((s, m) => s + num(m.value), 0);
}

function dayOverview(input: AssistantInput, day: number) {
  return Object.fromEntries(
    ALL_METRICS.map((id) => {
      const e = evalOn(input, id, day);
      return [metricDef(id).name, e ? `${fmtReading(id, e.value)} (${STATUS_WORD[e.status]})` : 'not measured'];
    }),
  );
}

/** Trend sentence used by the built-in answers. */
function changeSentence(input: AssistantInput, id: MetricId, day: number, lead: boolean): string {
  const c = dayChange(input, id, day);
  if (!c.direction) return '';
  const name = shortName(id);
  if (lead) {
    if (c.direction === 'worse') return `Not yet — your ${name} is worse than the day before: ${c.previous} → ${c.current}.`;
    if (c.direction === 'better') return `Yes — your ${name} is improving: ${c.previous} → ${c.current}.`;
    return `It's about the same as the day before: ${c.previous} → ${c.current}.`;
  }
  if (c.direction === 'same') return `That's the same as the day before (${c.previous}).`;
  return `That's ${c.direction} than the day before (${c.previous}).`;
}

// ---------------------------------------------------------------------------
// Welcome message (built from app data, no model call)
// ---------------------------------------------------------------------------
export function welcomeMessage(input: AssistantInput, now: Date = new Date()): ChatAnswer {
  const h = now.getHours();
  const greeting = h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : h >= 18 ? 'Good evening' : 'Hello';
  const items = attentionItems(input);
  const act = items.filter(({ e }) => isActOrWorse(e.status)).map(({ id }) => shortName(id));
  const watch = items.filter(({ e }) => e.status === 'WATCH').map(({ id }) => shortName(id));
  let summary: string;
  if (input.overall === null) summary = 'There are no readings for this day yet.';
  else if (!act.length && !watch.length) summary = 'Everything is within range today.';
  else if (act.length && watch.length) summary = `Your ${joinList(act)} need${act.length === 1 ? 's' : ''} attention today, and ${joinList(watch)} ${watch.length === 1 ? 'is' : 'are'} on Watch.`;
  else if (act.length) summary = `Your ${joinList(act)} need${act.length === 1 ? 's' : ''} attention today, everything else is stable.`;
  else summary = `Your ${joinList(watch)} ${watch.length === 1 ? 'is' : 'are'} on Watch today, everything else is stable.`;
  const worst = items[0]?.id;
  return {
    reply: `${greeting}, ${crewName(input.settings)}. Day ${fmtNumber(input.day)} on ${LOCATION_PHRASE[input.settings.location]}. ${summary} What would you like to check?`,
    actions: [],
    contact: '',
    source: '',
    followups: worst ? [`Why is my ${shortName(worst)} flagged?`, 'What should I do now?'] : ['Explain my status today', 'How do I measure this?'],
  };
}

// ---------------------------------------------------------------------------
// Free-question helpers (keyword guesses; the model decides scope when online)
// ---------------------------------------------------------------------------
const KEYWORDS: [MetricId, RegExp][] = [
  ['bp', /blood pressure|\bbp\b|systolic|diastolic/i],
  ['hr', /heart ?rate|pulse|\bhr\b|heartbeat/i],
  ['temp', /temperature|\btemp\b|fever|hypotherm/i],
  ['spo2', /oxygen|spo2|saturation|\bo2\b/i],
  ['glucose', /glucose|blood sugar|\bsugar\b/i],
  ['sleep', /sleep|slept/i],
  ['mood', /\bmood\b/i],
  ['radiation', /radiation|\bdose\b|dosimeter|\bmsv\b|solar/i],
  ['exercise', /exercise|workout|treadmill|muscle|bone/i],
];
const APP_TOPICS = /status|today|yesterday|alert|pattern|infection|reading|trend|baseline|measure|earth|contact|ground|flight surgeon|health|vital|indicator|better|worse|flagged|what should i do/i;
const ASKS_WHAT_TO_DO = /what (should|do|can) i|what now|what to do|should i|how (do|can|should) i (fix|treat|help|lower|raise|improve)|next step|help me/i;
const ASKS_CONTACT = /contact|call|earth|ground|flight surgeon|escalat|houston/i;
const ASKS_TREND = /better|worse|improv|trend|getting|rising|falling|going (up|down)|chang/i;
const ASKS_FORECAST = /\bforecast\b|\bpredict(?:ion)?\b|\boutlook\b|what should i watch|\b(?:next|coming)\s+(?:(?:two|2|few|couple of)\s+)?days?\b/i;

function asksForecast(question: string, history: ChatTurn[]): boolean {
  return ASKS_FORECAST.test(question) || (/\b(?:tomorrow|after that)\b/i.test(question) &&
    history.some((turn) => turn.from === 'CREW' && ASKS_FORECAST.test(turn.text)));
}

function mentioned(text: string): MetricId[] {
  return KEYWORDS.filter(([, re]) => re.test(text)).map(([id]) => id);
}

export function guessInScope(question: string, history: ChatTurn[]): boolean {
  if (asksForecast(question, history)) return true;
  if (mentioned(question).length || APP_TOPICS.test(question)) return true;
  // Short follow-ups ("and yesterday?") continue an in-scope conversation.
  return question.trim().split(/\s+/).length <= 5 && history.some((t) => t.from === 'CREW' && mentioned(t.text).length > 0);
}

// ---------------------------------------------------------------------------
// The six quick actions + free questions
// ---------------------------------------------------------------------------
type Draft = Omit<FactPack, 'allowedActions' | 'facts' | 'forecast' | 'forecastRequested'> & { facts: Record<string, unknown> };

function draft(
  input: AssistantInput,
  kind: AskKind,
  opts: { status: Status | null; label: string; required: boolean; showActions: boolean; showContact: boolean; showSource: boolean; sourceUrls: string[] },
  facts: Record<string, unknown>,
  fallback: Omit<ChatAnswer, 'contact' | 'source'>,
): Draft {
  const escalationText = ESCALATION[input.settings.location];
  const contact = opts.showContact ? (opts.required ? escalationText : NO_ESCALATION) : '';
  return {
    kind,
    inScope: true,
    status: opts.status,
    statusLabel: opts.label,
    escalationRequired: opts.required,
    escalationText,
    showActions: opts.showActions,
    showContact: opts.showContact,
    showSource: opts.showSource,
    sourceUrls: opts.sourceUrls,
    facts: {
      crewName: crewName(input.settings),
      missionDay: input.day,
      location: LOCATION_LABEL[input.settings.location],
      status: statusWord(opts.status),
      showActions: opts.showActions,
      showContact: opts.showContact,
      escalationText: opts.showContact ? contact : '',
      sourceUrls: opts.showSource ? opts.sourceUrls : [],
      ...facts,
    },
    fallback: {
      ...fallback,
      actions: opts.showActions ? fallback.actions.slice(0, 3).map(tidyAction) : [],
      contact,
      source: opts.showSource ? opts.sourceUrls[0] : '',
    },
  };
}

function explainStatus(input: AssistantInput): Draft {
  const required = dayNeedsEscalation(input);
  const items = attentionItems(input);
  const byWord = (s: Status) => items.filter(({ e }) => e.status === s).map(({ id }) => shortName(id));
  const groups = (['CRITICAL', 'ACT', 'WATCH'] as Status[])
    .map((s) => ({ s, names: byWord(s) }))
    .filter((g) => g.names.length)
    .map((g) => `${joinList(g.names)} ${g.names.length === 1 ? 'is' : 'are'} ${STATUS_WORD[g.s]}`);
  const measured = INDICATOR_ORDER.filter((id) => input.evals[id]).length;
  const sentences = input.overall === null
    ? [`There are no readings for Day ${fmtNumber(input.day)} yet.`]
    : [
        `Your overall status for Day ${fmtNumber(input.day)} is ${statusWord(input.overall)}.`,
        groups.length ? `${cap(groups.join('; '))}.` : 'Every measured reading is OK.',
        ...(input.patterns.length ? [`The app also sees a pattern: ${input.patterns[0].title}.`] : []),
        ...(measured < INDICATOR_ORDER.length ? [`${INDICATOR_ORDER.length - measured} of ${INDICATOR_ORDER.length} indicators are not measured yet.`] : []),
      ];
  const worst = items[0]?.id;
  return draft(
    input,
    'status',
    { status: input.overall, label: `Day ${fmtNumber(input.day)} overall`, required, showActions: isActOrWorse(input.overall), showContact: required, showSource: false, sourceUrls: [] },
    {
      today: dayOverview(input, input.day),
      openAlerts: input.openAlerts.map((a) => `${STATUS_WORD[a.status]}: ${a.message}`),
      activePatterns: input.patterns.map((p) => p.title),
    },
    {
      reply: sentences.slice(0, 4).join(' '),
      actions: todoActions(input),
      followups: worst ? ['What should I do now?', `Why is my ${shortName(worst)} flagged?`] : ['How do I measure this?', 'Explain this reading'],
    },
  );
}

function explainReading(input: AssistantInput): Draft {
  const id = input.selected;
  const e = evalOn(input, id, input.day);
  const required = readingNeedsEscalation(e);
  const name = shortName(id);
  const reply = e
    ? [`Your ${name} is ${fmtReading(id, e.value)} today, status ${STATUS_WORD[e.status]}.`, changeSentence(input, id, input.day, false), firstSentences(interpretation(e), 1)]
    : [`There's no ${name} reading for Day ${fmtNumber(input.day)} yet.`, 'Start a check-in to record it.'];
  return draft(
    input,
    'reading',
    { status: e?.status ?? null, label: `${metricDef(id).name} · Day ${fmtNumber(input.day)}`, required, showActions: isActOrWorse(e?.status ?? null), showContact: required, showSource: true, sourceUrls: sourceUrlsFor(id) },
    { indicator: readingFacts(input, id, input.day) },
    { reply: reply.filter(Boolean).join(' '), actions: e ? followUpActions(e) : [], followups: ['Is it getting better?', 'What should I do now?'] },
  );
}

function whatToDo(input: AssistantInput): Draft {
  const required = dayNeedsEscalation(input);
  const items = attentionItems(input);
  const top = [...input.patterns.map((p) => p.title.toLowerCase()), ...items.map(({ id }) => shortName(id))].slice(0, 3);
  return draft(
    input,
    'todo',
    { status: input.overall, label: `Day ${fmtNumber(input.day)} overall`, required, showActions: true, showContact: required, showSource: false, sourceUrls: [] },
    {
      itemsNeedingAction: items.map(({ id, e }) => ({ indicator: metricDef(id).name, value: fmtReading(id, e.value), status: STATUS_WORD[e.status], guidance: followUpActions(e) })),
      patterns: input.patterns.map((p) => ({ pattern: p.title, guidance: PATTERNS[p.id].actions })),
    },
    {
      reply: top.length
        ? `Start with ${joinList(top)} — those are the most urgent items today. Here are the first steps.`
        : 'Nothing needs action today. Keep your routine and measure again tomorrow.',
      actions: todoActions(input),
      followups: ['Do I need to contact Earth?', input.patterns.length ? 'Explain the pattern' : 'Explain my status today'],
    },
  );
}

function contactEarth(input: AssistantInput): Draft {
  const required = dayNeedsEscalation(input);
  const drivers = [
    ...attentionItems(input).filter(({ e }) => readingNeedsEscalation(e)).map(({ id }) => shortName(id)),
    ...input.patterns.filter((p) => p.escalate).map((p) => `the pattern “${p.title}”`),
  ];
  const location = input.settings.location;
  return draft(
    input,
    'contact',
    { status: input.overall, label: `Day ${fmtNumber(input.day)} overall`, required, showActions: required, showContact: true, showSource: false, sourceUrls: [] },
    { reasonsForEscalation: drivers, locationGuidance: ESCALATION[location] },
    {
      reply: required
        ? `Yes — your ${joinList(drivers)} reach the app's escalation level today. Here is the contact step for ${LOCATION_PHRASE[location]}.`
        : `No — nothing on Day ${fmtNumber(input.day)} reaches the app's escalation level. Keep your routine checks going.`,
      actions: required ? ESCALATION[location].split(/(?<=[.!?])\s+/) : [],
      followups: ['What should I do now?', 'Explain my status today'],
    },
  );
}

function explainPattern(input: AssistantInput): Draft {
  const hits = input.patterns;
  const status: Status | null = hits.length ? (hits.some((p) => p.escalate) ? 'ACT' : 'WATCH') : null;
  const required = hits.some((p) => p.escalate);
  const first = hits[0];
  const linked = (ids: IndicatorId[]) =>
    ids.map((id) => ({ indicator: INDICATORS[id].name, today: input.evals[id] ? fmtReading(id, input.evals[id]!.value) : 'not measured', previousDay: dayChange(input, id, input.day).previous ?? 'not measured' }));
  const todayLine = first
    ? `Today: ${joinList(PATTERNS[first.id].indicators.filter((id) => input.evals[id]).map((id) => `${shortName(id)} ${fmtReading(id, input.evals[id]!.value)}`))}.`
    : '';
  return draft(
    input,
    'pattern',
    { status, label: 'Pattern', required, showActions: hits.length > 0, showContact: required, showSource: hits.length > 0, sourceUrls: [PATTERN_SOURCE] },
    {
      activePatterns: hits.map((p) => ({
        pattern: p.title,
        rule: PATTERNS[p.id].rule,
        linkedReadings: linked(PATTERNS[p.id].indicators),
        guidance: PATTERNS[p.id].actions,
        note: 'Patterns are app-designed prompts for review, not validated diagnostic tests.',
      })),
    },
    {
      reply: first
        ? `Yes — the app sees a pattern: ${first.title}. It is flagged when: ${PATTERNS[first.id].rule} ${todayLine} It is a prompt for review, not a diagnosis.`
        : `No — there's no multi-indicator pattern on Day ${fmtNumber(input.day)}.`,
      actions: first ? PATTERNS[first.id].actions : [],
      followups: first ? ['What should I do now?', 'Do I need to contact Earth?'] : ['Explain my status today', 'Explain this reading'],
    },
  );
}

function howToMeasure(input: AssistantInput): Draft {
  const id = input.selected;
  const e = evalOn(input, id, input.day);
  const required = readingNeedsEscalation(e);
  const def = metricDef(id);
  const steps = isIndicator(id) ? [...HOW_TO[id]] : [`Log the daily total: ${EXERCISE.inputHint.toLowerCase()}.`];
  return draft(
    input,
    'measure',
    { status: e?.status ?? null, label: `${def.name} · Day ${fmtNumber(input.day)}`, required, showActions: true, showContact: required, showSource: true, sourceUrls: sourceUrlsFor(id) },
    { indicator: def.name, howToMeasure: steps, inputHint: def.inputHint },
    { reply: `Here's how to measure your ${shortName(id)}: ${def.inputHint.toLowerCase()}. Follow these steps.`, actions: steps, followups: ['Explain this reading', 'Is it getting better?'] },
  );
}

function forecastReply(day: number, forecast: ForecastPresentation | null, location: Location = 'ISS'): string {
  if (!forecast) {
    return `No forecast is available for Day ${fmtNumber(day)}; a morning check-in reading is missing. Start a check-in to provide the missing readings. ${FORECAST_ANSWER_END}`;
  }
  if (!forecast.warn) {
    return `For the next 2 days after Day ${fmtNumber(day)}, the synthetic model's early-warning level is Low. It does not cross this model's warning threshold; that does not rule out a health problem. ${FORECAST_ANSWER_END}`;
  }
  const drivers = forecast.drivers.slice(0, 2);
  const note = forecastLocationNote(forecast, location);
  return [
    `For the next 2 days after Day ${fmtNumber(day)}, the synthetic model's early-warning level is Elevated: ${forecast.problemLabel}.`,
    drivers.length ? `Leading model signals: ${joinList(drivers)}.` : 'No positive model driver is available to explain this estimate.',
    ...(note ? [note] : []),
    FORECAST_ANSWER_END,
  ].join(' ');
}

function explainForecast(input: AssistantInput, forecast: ForecastPresentation | null): Draft {
  const required = dayNeedsEscalation(input);
  return draft(
    input,
    'question',
    {
      status: null,
      label: `Next 2 days · Day ${fmtNumber(input.day)} forecast`,
      required,
      showActions: required || Boolean(forecast?.warn),
      showContact: required,
      showSource: false,
      sourceUrls: [],
    },
    {
      forecastDoesNotChangeCurrentStatus: true,
      forecastRisk: forecast ? `${forecast.riskPercent}% (${forecast.level})` : 'no forecast',
      forecastLikelyProblem: forecast?.warn ? forecast.problemShort : 'none above the warning threshold',
      forecastDrivers: forecast?.warn ? forecast.drivers : [],
      forecastDoToday: forecast?.doToday ?? [],
      forecastLocationNote: forecastLocationNote(forecast, input.settings.location) ?? '',
    },
    {
      reply: forecastReply(input.day, forecast, input.settings.location),
      actions: forecast?.warn ? forecast.doToday : required ? todoActions(input) : [],
      followups: ['Explain my status today', forecast ? 'What should I do now?' : 'How do I measure this?'],
    },
  );
}

function freeQuestion(input: AssistantInput, question: string, history: ChatTurn[]): Draft & { inScope: boolean } {
  const fromHistory = [...history].reverse().filter((t) => t.from === 'CREW').flatMap((t) => mentioned(t.text));
  const named = mentioned(question);
  const focus = named[0] ?? fromHistory[0] ?? input.selected;
  const focusDay = /\byesterday\b/i.test(question) ? input.day - 1 : input.day;
  const e = evalOn(input, focus, focusDay);
  const required = readingNeedsEscalation(e);
  const name = shortName(focus);
  const reply = e
    ? ASKS_TREND.test(question)
      ? [changeSentence(input, focus, focusDay, true) || `Your ${name} is ${fmtReading(focus, e.value)}.`, `The app status is ${STATUS_WORD[e.status]}.`, firstSentences(interpretation(e), 1)]
      : [`Your ${name} on Day ${fmtNumber(focusDay)} ${focusDay === input.day ? 'is' : 'was'} ${fmtReading(focus, e.value)}, status ${STATUS_WORD[e.status]}.`, changeSentence(input, focus, focusDay, false), firstSentences(interpretation(e), 1)]
    : [`There's no ${name} reading for Day ${fmtNumber(focusDay)}.`];
  const others = [...new Set(named.slice(1))];
  const d = draft(
    input,
    'question',
    {
      status: e?.status ?? null,
      label: `${metricDef(focus).name} · Day ${fmtNumber(focusDay)}`,
      required,
      showActions: ASKS_WHAT_TO_DO.test(question) || isActOrWorse(e?.status ?? null),
      showContact: ASKS_CONTACT.test(question) || required,
      showSource: true,
      sourceUrls: [...new Set([...sourceUrlsFor(focus), ...others.flatMap(sourceUrlsFor)])],
    },
    {
      focusIndicator: readingFacts(input, focus, focusDay),
      ...(focusDay !== input.day ? { focusIndicatorToday: readingFacts(input, focus, input.day) } : {}),
      otherIndicatorsAsked: others.map((id) => readingFacts(input, id, input.day)),
      today: dayOverview(input, input.day),
      yesterday: dayOverview(input, input.day - 1),
      openAlerts: input.openAlerts.map((a) => `${STATUS_WORD[a.status]}: ${a.message}`),
      activePatterns: input.patterns.map((p) => p.title),
    },
    {
      reply: reply.filter(Boolean).slice(0, 4).join(' '),
      actions: e ? followUpActions(e) : [],
      followups: ['What should I do now?', focusDay === input.day ? 'And what about yesterday?' : 'How is it today?'],
    },
  );
  const lead = e && ASKS_TREND.test(question) ? changeSentence(input, focus, focusDay, true) : '';
  return { ...d, inScope: guessInScope(question, history), ...(lead ? { lead } : {}) };
}

function allowedFor(kind: AskKind, input: AssistantInput, pack: Draft): string[] {
  const e = input.metrics[input.selected];
  switch (kind) {
    case 'status':
    case 'todo':
      return allDayActions(input);
    case 'contact':
      return [...(pack.escalationRequired ? ESCALATION[input.settings.location].split(/(?<=[.!?])\s+/) : []), ...allDayActions(input)];
    case 'pattern':
      return input.patterns.flatMap((p) => PATTERNS[p.id].actions);
    case 'reading':
      return e ? followUpActions(e) : [];
    case 'question':
    case 'measure':
    case 'risk':
      return pack.fallback.actions;
  }
}

/** Location code from the facts (the model context carries the label, the input the code). */
function locationFromFacts(pack: FactPack): Location {
  const label = String(pack.facts.location ?? '');
  return label === 'Mars' ? 'MARS' : label === 'Moon' ? 'MOON' : 'ISS';
}

export function buildFactPack(kind: AskKind, input: AssistantInput, question = '', history: ChatTurn[] = []): FactPack {
  const forecast = forecastPresentation(input.measurements, input.day);
  const forecastRequested = kind === 'risk' || (kind === 'question' && asksForecast(question, history));
  const pack: Draft =
    forecastRequested ? explainForecast(input, forecast)
    : kind === 'status' ? explainStatus(input)
    : kind === 'reading' ? explainReading(input)
    : kind === 'todo' ? whatToDo(input)
    : kind === 'contact' ? contactEarth(input)
    : kind === 'pattern' ? explainPattern(input)
    : kind === 'measure' ? howToMeasure(input)
    : freeQuestion(input, question, history);
  const allowedActions = [...new Set([...pack.fallback.actions, ...allowedFor(kind, input, pack)])];
  return {
    ...pack,
    allowedActions,
    forecast,
    forecastRequested,
    facts: {
      ...pack.facts,
      forecast,
      forecastRequested,
      forecastHorizonDays: 2,
      forecastAvailability: forecast ? 'Available from selected-day readings.' : 'No forecast: a morning check-in reading is missing.',
      forecastDisclaimer: FORECAST_LABEL,
      allowedActions: pack.showActions ? allowedActions : [],
    },
  };
}

// ---------------------------------------------------------------------------
// APP_DATA sent with every request (compact extract of indicators.ts + recent data, no RAG)
// ---------------------------------------------------------------------------
export function buildModelContext(input: AssistantInput) {
  const from = Math.max(1, input.day - 6);
  // Compact table: one header row of indicator names, then one row per day ("—" = not measured).
  const rows: (string | number)[][] = [];
  for (let d = from; d <= input.day; d++) {
    rows.push([d, ...ALL_METRICS.map((id) => {
      const m = dailyValue(input.measurements, id, d);
      return m ? fmtReading(id, m.value) : '—';
    })]);
  }
  return {
    missionDay: input.day,
    location: LOCATION_LABEL[input.settings.location],
    selectedIndicator: metricDef(input.selected).name,
    // Threshold texts from indicators.ts (they already carry their source / "app-designed" labels).
    thresholds: Object.fromEntries(
      ALL_METRICS.map((id) => {
        const t = metricDef(id).thresholds;
        return [metricDef(id).name, { ok: t.OK, watch: t.WATCH, act: t.ACT, critical: t.CRITICAL }];
      }),
    ),
    personalRules: [
      `Unusual for you: more than ${THRESHOLDS.rules.baselinePct}% away from the pre-flight baseline raises the status to at least Watch.`,
      `Trending worse: worse in ${THRESHOLDS.rules.trendReadings} consecutive readings raises the status to at least Watch.`,
    ],
    patternRules: Object.fromEntries(Object.values(PATTERNS).map((p) => [p.title, p.rule])),
    escalation: ESCALATION[input.settings.location],
    last7Days: { columns: ['day', ...ALL_METRICS.map((id) => metricDef(id).name)], rows },
    currentStatuses: Object.fromEntries(ALL_METRICS.map((id) => [metricDef(id).name, statusWord(input.metrics[id]?.status)])),
    overallStatus: statusWord(input.overall),
    forecast: forecastPresentation(input.measurements, input.day),
    forecastHorizonDays: 2,
    forecastDisclaimer: FORECAST_LABEL,
  };
}

// ---------------------------------------------------------------------------
// Answer rules (applied to every model answer)
// ---------------------------------------------------------------------------
const NUMBER = /(?<![A-Za-z\d.])\d+(?:[.,]\d+)*/g;
const numbersIn = (text: string): string[] => (text.match(NUMBER) ?? []).map((n) => n.replace(/,/g, ''));
const STATUS_WORDS = /\b(OK|Watch|Act|Critical)\b/g;
const HAS_STATUS_WORD = /\b(OK|Watch|Act|Critical)\b/;
/** Follow-ups are questions the astronaut taps: about readings, not diagnoses, not the assistant asking back. */
const OFF_TOPIC_FOLLOWUP = /symptom|\bsigns?\b|disease|diagnos|infection|medicine|medication|\bdrug|^(would|do) you (like|want)/i;
const EARTH_ONLY = /\b(911|999|112|ambulance|hospital|emergency room|urgent care|ER|GP|pharmacy)\b/;
const FORECAST_DISCUSSION = /\bforecast\b|early[- ]warning|synthetic|\b(?:model|predict(?:ion)?)\b|\b(?:next|coming)\s+(?:(?:two|2|few|couple of)\s+)?days?\b|\b(?:will|going to|definitely|certain|confirm(?:ed|s)?|diagnos(?:ed|is))\b.{0,80}\b(?:infection|fluid[ -]loss)\b|\byou (?:have|are developing|are experiencing)\b.{0,40}\b(?:infection|fluid[ -]loss)\b|\b(?:infection|fluid[ -]loss)\b.{0,80}\b(?:tomorrow|will|certain|confirmed|starting)\b/i;
const FORECAST_PERCENTAGE = /\b(?:risk|chance|probability|likelihood)\b[^.!?\n]{0,60}\d[\d.,]*\s*%|\b\d[\d.,]*\s*%[^.!?\n]{0,60}\b(?:risk|chance|probability|likelihood)\b/i;
const discussesForecast = (text: string) => FORECAST_DISCUSSION.test(text) || FORECAST_PERCENTAGE.test(text);
const STOP = new Set(['your', 'with', 'this', 'that', 'from', 'have', 'when', 'then', 'them', 'they', 'will', 'into', 'about', 'after', 'before', 'again', 'there', 'their', 'what', 'more', 'than', 'only', 'just', 'some', 'such', 'other', 'also', 'still', 'today', 'tomorrow']);
const stems = (text: string) =>
  new Set(text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));

/** True if `text` only uses numbers that appear in the app's facts. */
export function usesOnlyKnownNumbers(text: string, known: Set<string>): boolean {
  return numbersIn(text).every((n) => known.has(n) || known.has(String(Number(n))));
}

/** Status words in `text` must be ones the app actually reports in the facts. */
export function usesOnlyAppStatuses(text: string, allowed: Set<string>): boolean {
  return (text.match(STATUS_WORDS) ?? []).every((w) => allowed.has(w));
}

/** An action may be reworded for a spacecraft, but it must stay tied to app guidance. */
export function isGroundedAction(action: string, allowed: string[], known: Set<string>): boolean {
  if (!action || action.length > 160 || EARTH_ONLY.test(action) || !usesOnlyKnownNumbers(action, known)) return false;
  const words = stems(action);
  return allowed.some((a) => [...stems(a)].some((s) => words.has(s)));
}

export interface FinalAnswer {
  answer: ChatAnswer;
  inScope: boolean;
}

/**
 * Apply the app's rules to a model answer. `extra` is any other text the model may quote
 * numbers from (APP_DATA, the question and recent chat).
 */
export function finalizeAnswer(pack: FactPack, model: (Partial<ChatAnswer> & { inScope?: boolean }) | null | undefined, extra: unknown = {}): FinalAnswer {
  const factsText = JSON.stringify(pack.facts);
  const known = new Set(numbersIn(factsText + JSON.stringify(extra ?? {}) + JSON.stringify(pack.fallback)));
  const statuses = new Set((factsText + JSON.stringify(extra ?? {})).match(/\b(OK|Watch|Act|Critical)\b/g) ?? []);
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const okText = (t: string) => Boolean(t) && usesOnlyKnownNumbers(t, known) && !EARTH_ONLY.test(t);
  const followupsFrom = (fallback: string[]) => {
    const picked = Array.isArray(model?.followups)
      ? model!.followups.map(str).filter((f) => okText(f) && f.length <= 90 && !HAS_STATUS_WORD.test(f) && !OFF_TOPIC_FOLLOWUP.test(f)).slice(0, 2)
      : [];
    return [...new Set([...picked, ...fallback])].slice(0, 2);
  };

  const inScope = pack.forecastRequested || pack.kind !== 'question' ? true : model?.inScope !== false;
  if (!inScope) {
    let reply = firstSentences(str(model?.reply), 4);
    if (!okText(reply) || HAS_STATUS_WORD.test(reply) || discussesForecast(reply)) reply = OUT_OF_SCOPE_ANSWER.reply;
    return { inScope, answer: { ...OUT_OF_SCOPE_ANSWER, reply, followups: followupsFrom(OUT_OF_SCOPE_ANSWER.followups) } };
  }

  const fb = pack.fallback;
  // Actions belong in the list, not repeated in the reply; long symptom lists are trimmed.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const actionTexts = new Set(pack.allowedActions.flatMap((a) => [norm(a), norm(tidyAction(a))]));
  const sentencesOf = (t: string) =>
    t.split(/(?<=[.!?])\s+/).filter(Boolean).map((s) => s.replace(/,?\s+such as [^.]*/i, '').trim()).filter((s) => s && !actionTexts.has(norm(s)));
  let parts = sentencesOf(str(model?.reply));
  // A trend question must be answered first, with the app's real readings.
  if (pack.lead && parts.length && !/^(yes|no|not yet|not really|about the same|it'?s about the same)\b/i.test(parts[0])) parts = [pack.lead, ...parts];
  let reply = parts.slice(0, 4).join(' ');
  if (!okText(reply) || !usesOnlyAppStatuses(reply, statuses)) reply = fb.reply;
  if (pack.forecastRequested) {
    // Keep the risk, uncertainty and synthetic-training caveat together, regardless of model wording.
    reply = fb.reply;
  } else if (discussesForecast(reply)) {
    reply = `${firstSentences(fb.reply, 1)} ${forecastReply(Number(pack.facts.missionDay), pack.forecast, locationFromFacts(pack))}`;
  }

  let actions: string[] = [];
  if (pack.showActions) {
    actions = (Array.isArray(model?.actions) ? model!.actions.map(str) : [])
      .filter((a) => !discussesForecast(a) && isGroundedAction(a, pack.allowedActions, known))
      .map(tidyAction)
      .slice(0, 3);
    if (!actions.length) actions = fb.actions.slice(0, 3);
  }

  const modelSource = str(model?.source);
  const source = pack.showSource ? (pack.sourceUrls.includes(modelSource) ? modelSource : pack.sourceUrls[0] ?? '') : '';

  return { inScope, answer: { reply, actions, contact: fb.contact, source, followups: followupsFrom(fb.followups) } };
}

/** Built-in answer for a pack (used offline / on errors). */
export function fallbackAnswer(pack: FactPack): FinalAnswer {
  return pack.inScope ? { inScope: true, answer: pack.fallback } : { inScope: false, answer: OUT_OF_SCOPE_ANSWER };
}
