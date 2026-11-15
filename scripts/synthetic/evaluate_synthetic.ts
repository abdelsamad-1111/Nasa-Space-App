/**
 * Validation step 2: run the app's own engine (src/brain/evaluate.ts) on the
 * synthetic dataset in scripts/synthetic/out.
 *
 * SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.
 *
 * Run from the repo root:  npx vite-node scripts/synthetic/evaluate_synthetic.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectPatterns,
  evaluateDay,
  evaluateExerciseOnDay,
  type Evaluation,
  type Measurement,
  type Settings,
} from '../../src/brain/evaluate';
import {
  INDICATOR_ORDER,
  LABEL_LOW_BP,
  THRESHOLDS,
  metricDef,
  type Baselines,
  type IndicatorId,
  type MetricId,
} from '../../src/brain/indicators';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const LABEL = 'SYNTHETIC DATA, research-based. Not real astronaut measurements. Not clinical validation.';
const WARMUP_DAYS = 7; // false alarms are counted after the first week

// ---------------------------------------------------------------------------
// CSV reading (quoted fields, "" escapes)
// ---------------------------------------------------------------------------
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const toNum = (s: string): number | null => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : null;
};

// ---------------------------------------------------------------------------
// Mapping synthetic rows → app Measurement[] (same timing as src/data/demo.ts)
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);
const MORNING_CONTEXT = ['Just woke up']; // demo.ts uses this for every morning reading
const MAPPING = [
  ['bp_sys + bp_dia', 'bp {sys, dia}', '07:30', 'context.bp "After EVA" → ["After EVA"], otherwise ["Just woke up"]'],
  ['hr', 'hr', '07:31', 'context.hr "After EVA" → ["After EVA"], otherwise ["Just woke up"]'],
  ['temp', 'temp', '07:32', '["Just woke up"]'],
  ['spo2', 'spo2', '07:33', '["Just woke up"]'],
  ['glucose', 'glucose', '07:34', '["Just woke up"]; "not_measured" → no measurement'],
  ['sleep', 'sleep', '07:35', '["Just woke up"]'],
  ['mood', 'mood', '07:36', '["Just woke up"]'],
  ['radiation', 'radiation (daily dose)', '19:00', '["None"]; "missed_dosimeter" → no measurement'],
  ['exercise', 'exercise (minutes)', '07:38', '["None"]'],
  ['"missed_checkin" in any morning cell', 'no measurement for that indicator', '', ''],
  ['synthetic-meta.json candidate_settings_baselines', 'Settings.baselines (BASELINE_INDICATORS + bp), rounded to app input precision', '', 'location ISS, careerRadiationLimit 600'],
];

function buildMeasurements(rows: Record<string, string>[]): Measurement[] {
  const out: Measurement[] = [];
  for (const r of rows) {
    const day = Number(r.mission_day);
    const ctx = JSON.parse(r.context || '{}') as Record<string, string>;
    const base = START + (day - 1) * DAY_MS + 7.5 * 60 * 60 * 1000;
    const add = (id: MetricId, value: Measurement['value'], minute: number, context: string[]) =>
      out.push({
        id: `${r.astronaut_id}-${day}-${id}`,
        indicatorId: id,
        value,
        unit: metricDef(id).unit,
        timestamp: new Date(base + minute * 60 * 1000).toISOString(),
        missionDay: day,
        context,
      });
    const exertion = (key: string) => (ctx[key] === 'After EVA' ? ['After EVA'] : MORNING_CONTEXT);
    const sys = toNum(r.bp_sys);
    const dia = toNum(r.bp_dia);
    if (sys !== null && dia !== null) add('bp', { sys, dia }, 0, exertion('bp'));
    const pairs: [IndicatorId | 'exercise', string, number][] = [
      ['hr', r.hr, 1], ['temp', r.temp, 2], ['spo2', r.spo2, 3], ['glucose', r.glucose, 4],
      ['sleep', r.sleep, 5], ['mood', r.mood, 6], ['exercise', r.exercise, 8],
    ];
    for (const [id, raw, minute] of pairs) {
      const v = toNum(raw);
      if (v === null) continue;
      add(id, v, minute, id === 'hr' ? exertion('hr') : id === 'exercise' ? ['None'] : MORNING_CONTEXT);
    }
    const rad = toNum(r.radiation);
    if (rad !== null) add('radiation', rad, 11.5 * 60, ['None']);
  }
  return out;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
function settingsFor(raw: Record<string, number | { sys: number; dia: number }>): Settings {
  const b: Baselines = {};
  const bp = raw.bp as { sys: number; dia: number };
  b.bp = { sys: Math.round(bp.sys), dia: Math.round(bp.dia) };
  b.hr = Math.round(raw.hr as number);
  b.temp = r1(raw.temp as number);
  b.spo2 = Math.round(raw.spo2 as number);
  b.glucose = Math.round(raw.glucose as number);
  b.sleep = r1(raw.sleep as number);
  b.mood = Math.round(raw.mood as number);
  return { name: 'synthetic', location: 'ISS', baselines: b, careerRadiationLimit: THRESHOLDS.radiation.careerLimitDefault };
}

// ---------------------------------------------------------------------------
// Ground truth
// ---------------------------------------------------------------------------
interface Episode { episode_id: string; astronaut_id: string; kind: string; start_day: number; peak_day: number; end_day: number; amplitudes: Record<string, Record<string, number>>; }
const events = JSON.parse(readFileSync(join(OUT, 'synthetic-events.json'), 'utf8')) as { episodes: Episode[] };
const dayLabels = parseCsv(readFileSync(join(OUT, 'synthetic-day-labels.csv'), 'utf8'));
const labelKey = (a: string, d: number) => `${a}|${d}`;
const labelMap = new Map(dayLabels.map((l) => [labelKey(l.astronaut_id, Number(l.mission_day)), l]));
const meta = JSON.parse(readFileSync(join(OUT, 'synthetic-meta.json'), 'utf8'));

function eventFree(a: string, d: number): boolean {
  const l = labelMap.get(labelKey(a, d));
  return !!l && l.active_events === 'none' && l.previous_day_sleep_event === 'none' && d > WARMUP_DAYS;
}
function activeKinds(a: string, d: number): string[] {
  const l = labelMap.get(labelKey(a, d));
  if (!l || l.active_events === 'none') return [];
  return l.active_events.split(/[;|]/).map((t) => t.split(':')[0].trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Evaluation of one scenario
// ---------------------------------------------------------------------------
type DayResult = {
  a: string; d: number;
  evals: Partial<Record<IndicatorId, Evaluation>>;
  exercise: Evaluation | null;
  patterns: string[];
  vals: Partial<Record<IndicatorId, number | { sys: number; dia: number }>>;
  baselines: Baselines;
};

function runScenario(file: string): DayResult[] {
  const rows = parseCsv(readFileSync(join(OUT, file), 'utf8'));
  const byAst = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    if (!byAst.has(r.astronaut_id)) byAst.set(r.astronaut_id, []);
    byAst.get(r.astronaut_id)!.push(r);
  }
  const results: DayResult[] = [];
  for (const [a, list] of byAst) {
    list.sort((x, y) => Number(x.mission_day) - Number(y.mission_day));
    const ms = buildMeasurements(list);
    const settings = settingsFor(meta.candidate_settings_baselines[a]);
    for (const r of list) {
      const d = Number(r.mission_day);
      const evals = evaluateDay(ms, d, settings);
      const vals: DayResult['vals'] = {};
      for (const id of INDICATOR_ORDER) if (evals[id]) vals[id] = evals[id]!.value as number;
      results.push({
        a, d, evals, vals,
        exercise: evaluateExerciseOnDay(ms, d),
        patterns: detectPatterns(ms, d).map((p) => p.id),
        baselines: settings.baselines,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function falseAlarms(res: DayResult[]) {
  const free = res.filter((r) => eventFree(r.a, r.d));
  const per: Record<string, { days: number; nonOk: number; act: number; range: number; baseline: number; trend: number; adaptation: number; better: number }> = {};
  for (const id of [...INDICATOR_ORDER, 'exercise'] as const) per[id] = { days: 0, nonOk: 0, act: 0, range: 0, baseline: 0, trend: 0, adaptation: 0, better: 0 };
  let anyNonOk = 0; let anyAct = 0; let measuredDays = 0; let patternDays = 0; let hypothermia = 0; let tempDays = 0;
  for (const r of free) {
    const list = INDICATOR_ORDER.map((id) => r.evals[id]).filter(Boolean) as Evaluation[];
    if (!list.length) continue;
    measuredDays++;
    if (list.some((e) => e.status !== 'OK')) anyNonOk++;
    if (list.some((e) => e.status === 'ACT' || e.status === 'CRITICAL')) anyAct++;
    if (r.patterns.length) patternDays++;
    for (const e of list) {
      const p = per[e.indicatorId];
      p.days++;
      if (e.status === 'OK') continue;
      p.nonOk++;
      if (e.status === 'ACT' || e.status === 'CRITICAL') p.act++;
      if (e.reasons.includes('range')) p.range++;
      if (e.reasons.includes('baseline')) p.baseline++;
      if (e.reasons.includes('trend')) p.trend++;
      // Adaptation proxy: BP alerts in the same direction as the published in-flight systolic drop
      // (reading below the pre-flight baseline, or the low-BP "Fainting risk" label).
      // "Unusual for you" raised because the reading is BETTER than usual (more sleep, better mood, higher SpO2).
      if ((e.indicatorId === 'sleep' || e.indicatorId === 'mood' || e.indicatorId === 'spo2') &&
        e.reasons.length === 1 && e.reasons[0] === 'baseline' &&
        (e.value as number) > (r.baselines[e.indicatorId] as number)) p.better++;
      if (e.indicatorId === 'bp') {
        const v = e.value as { sys: number; dia: number };
        const b = r.baselines.bp as { sys: number; dia: number };
        const lowBp = e.labels.includes(LABEL_LOW_BP);
        const downOnly = e.reasons.every((x) => x === 'baseline') && v.sys < b.sys;
        if (lowBp || downOnly) p.adaptation++;
      }
    }
    if (r.evals.temp) { tempDays++; if ((r.evals.temp.value as number) < THRESHOLDS.temp.actBelow) hypothermia++; }
    if (r.exercise) {
      const p = per.exercise;
      p.days++;
      if (r.exercise.status !== 'OK') { p.nonOk++; p.range++; if (r.exercise.status === 'ACT') p.act++; }
    }
  }
  const table = Object.fromEntries(Object.entries(per).map(([k, p]) => [k, {
    days: p.days, nonOkPct: pct(p.nonOk, p.days), actPct: pct(p.act, p.days),
    rangePct: pct(p.range, p.days), baselinePct: pct(p.baseline, p.days), trendPct: pct(p.trend, p.days),
    adaptationPct: k === 'bp' ? pct(p.adaptation, p.days) : null,
    betterThanUsualPct: ['sleep', 'mood', 'spo2'].includes(k) ? pct(p.better, p.days) : null,
  }]));
  return {
    eventFreeDays: measuredDays,
    anyNonOkPct: pct(anyNonOk, measuredDays),
    anyActPct: pct(anyAct, measuredDays),
    patternDayPct: pct(patternDays, measuredDays),
    hypothermiaReadings: hypothermia,
    hypothermiaPct: pct(hypothermia, tempDays),
    perIndicator: table,
  };
}

type Detector = (r: DayResult) => boolean;
const DETECTORS: Record<string, { kind: string; rule: string; fire: Detector }> = {
  infection: {
    kind: 'infection',
    rule: 'temperature ≥ 37.5 °C or pattern P1',
    fire: (r) => (r.vals.temp !== undefined && (r.vals.temp as number) >= THRESHOLDS.temp.watchMin) || r.patterns.includes('P1'),
  },
  fluid_loss: {
    kind: 'fluid_loss',
    rule: 'BP "Fainting risk" label, heart rate > 100 at rest, or pattern P3',
    fire: (r) => {
      const bp = r.evals.bp;
      const hrRest = r.evals.hr && !(r.evals.hr.note) && (r.vals.hr as number) > THRESHOLDS.hr.okMax;
      return (!!bp && bp.labels.includes(LABEL_LOW_BP)) || !!hrRest || r.patterns.includes('P3');
    },
  },
  // Lenient versions: any non-OK status on the related indicators (what the screen would show).
  infection_any_alert: {
    kind: 'infection',
    rule: 'any non-OK temperature status (range, baseline or trend) or pattern P1',
    fire: (r) => (!!r.evals.temp && r.evals.temp.status !== 'OK') || r.patterns.includes('P1'),
  },
  fluid_loss_any_alert: {
    kind: 'fluid_loss',
    rule: 'any non-OK blood pressure or heart rate status, or pattern P3',
    fire: (r) => (!!r.evals.bp && r.evals.bp.status !== 'OK') || (!!r.evals.hr && r.evals.hr.status !== 'OK') || r.patterns.includes('P3'),
  },
};

function detection(res: DayResult[]) {
  const byDay = new Map(res.map((r) => [labelKey(r.a, r.d), r]));
  const out: Record<string, unknown> = {};
  for (const [name, det] of Object.entries(DETECTORS)) {
    const eps = events.episodes.filter((e) => e.kind === det.kind);
    let caught = 0; let beforePeak = 0; const leads: number[] = []; const misses: unknown[] = [];
    const perEpisode: { episode: string; peakDay: number; firstAlertDay: number | null }[] = [];
    for (const ep of eps) {
      let first: number | null = null;
      for (let d = ep.start_day; d <= ep.end_day; d++) {
        const r = byDay.get(labelKey(ep.astronaut_id, d));
        if (r && det.fire(r)) { first = d; break; }
      }
      perEpisode.push({ episode: ep.episode_id, peakDay: ep.peak_day, firstAlertDay: first });
      if (first !== null) {
        caught++;
        if (first < ep.peak_day) beforePeak++;
        leads.push(ep.peak_day - first);
      } else {
        const days: unknown[] = [];
        for (let d = ep.start_day; d <= ep.end_day; d++) {
          const r = byDay.get(labelKey(ep.astronaut_id, d));
          days.push({ day: d, measured: !!r && Object.keys(r.vals).length > 0, temp: r?.vals.temp ?? null, bp: r?.vals.bp ?? null, hr: r?.vals.hr ?? null, sleep: r?.vals.sleep ?? null, mood: r?.vals.mood ?? null });
        }
        misses.push({ episode: ep.episode_id, peak_day: ep.peak_day, days });
      }
    }
    // Alert-day precision: all days after warm-up where the detector fires.
    let fired = 0; let inside = 0;
    for (const r of res) {
      if (r.d <= WARMUP_DAYS || !det.fire(r)) continue;
      fired++;
      if (activeKinds(r.a, r.d).includes(det.kind)) inside++;
    }
    out[name] = {
      rule: det.rule,
      episodes: eps.length,
      caught,
      sensitivityPct: pct(caught, eps.length),
      caughtBeforePeak: beforePeak,
      medianLeadDays: median(leads),
      alertDays: fired,
      alertDaysInsideEvent: inside,
      alertDayPrecisionPct: pct(inside, fired),
      misses,
      perEpisode,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Run all scenarios
// ---------------------------------------------------------------------------
const SCENARIOS = [
  { id: 'A', file: 'synthetic-astronauts.csv', title: 'Main: default events, no temperature rise' },
  { id: 'B', file: 'synthetic-astronauts-tempshift.csv', title: 'Assumed +1.0 °C oral temperature rise in flight' },
  { id: 'C', file: 'synthetic-astronauts-small.csv', title: 'Small events' },
  { id: 'D', file: 'synthetic-astronauts-large.csv', title: 'Large events' },
];

const report: Record<string, unknown> = {
  label: LABEL,
  engine: 'src/brain/evaluate.ts (evaluateDay, detectPatterns, evaluateExerciseOnDay)',
  forecast: 'Evaluated separately: see FORECAST.md (src/brain/forecast.ts, early-warning model trained on a separate synthetic crew).',
  nextDayLowBp: 'Not evaluated as a separate task: the early-warning model covers fluid loss (see FORECAST.md).',
  warmupDays: WARMUP_DAYS,
  eventFreeDefinition: 'active_events = none, previous_day_sleep_event = none, mission day > 7; days with no morning readings are not counted.',
  mapping: MAPPING,
  scenarios: {} as Record<string, unknown>,
};

for (const s of SCENARIOS) {
  const t0 = Date.now();
  const res = runScenario(s.file);
  (report.scenarios as Record<string, unknown>)[s.id] = {
    title: s.title,
    file: s.file,
    falseAlarms: falseAlarms(res),
    detection: detection(res),
  };
  console.log(`Scenario ${s.id} done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

writeFileSync(join(OUT, 'app-evaluation.json'), JSON.stringify(report, null, 2));
console.log('Wrote', join(OUT, 'app-evaluation.json'));

// ---------------------------------------------------------------------------
// Markdown report, generated from the same numbers as app-evaluation.json
// ---------------------------------------------------------------------------
type FA = ReturnType<typeof falseAlarms>;
type Det = { rule: string; episodes: number; caught: number; sensitivityPct: number; caughtBeforePeak: number; medianLeadDays: number | null; alertDays: number; alertDaysInsideEvent: number; alertDayPrecisionPct: number; misses: { days: { temp: number | null }[] }[] };
const S = report.scenarios as Record<string, { title: string; file: string; falseAlarms: FA; detection: Record<string, Det> }>;
const A = S.A; const B = S.B;
const fa = A.falseAlarms; const pi = fa.perIndicator as Record<string, Record<string, number | null>>;
const inf = A.detection.infection; const fl = A.detection.fluid_loss; const infB = B.detection.infection;
const missPeaks = inf.misses.map((m) => Math.max(...m.days.map((d) => d.temp ?? -Infinity))).filter((x) => Number.isFinite(x));

const md: string[] = [];
md.push('# VITALS-ORBIT — app engine on the synthetic crew', '', `**${LABEL}**`, '');
md.push('## Plain-language summary', '');
md.push(`- On normal days (no illness or staged event), the app showed at least one non-green indicator on ${fa.anyNonOkPct}% of days. Most of these come from sleep (${pi.sleep.nonOkPct}% of days), exercise (${pi.exercise.nonOkPct}%) and blood pressure (${pi.bp.nonOkPct}%).`);
md.push(`- Many blood-pressure flags are the normal space adaptation: in flight the top number drops compared with the Earth (pre-flight) baseline, and the app marks it "Unusual for you" (about ${pi.bp.adaptationPct}% of normal days).`);
md.push(`- The "Unusual for you" rule also fires when things get better: sleeping more than usual (${pi.sleep.betterThanUsualPct}% of normal days) or a better mood than usual (${pi.mood.betterThanUsualPct}%).`);
md.push(`- Staged infections: the temperature rule caught ${inf.caught} of ${inf.episodes}. When it fired, it was inside a real infection on ${inf.alertDaysInsideEvent} of ${inf.alertDays} days. The missed ones never reached 37.5 °C (highest readings ${Math.min(...missPeaks)}–${Math.max(...missPeaks)} °C). Staged fluid loss: ${fl.caught} of ${fl.episodes} caught, but its low-BP signal also fires on many normal days (only ${fl.alertDaysInsideEvent} of ${fl.alertDays} alert days were inside a real fluid-loss event).`);
md.push(`- If body temperature really rises about 1 °C in flight (scenario B, an assumption), the temperature card turns non-green on ${B.falseAlarms.perIndicator.temp.nonOkPct}% of normal days, and only ${infB.alertDaysInsideEvent} of ${infB.alertDays} temperature alert days are real infections.`);
md.push('', 'These results describe how the app\'s rules behave on simulated data with staged events of an assumed size. They are not real-world accuracy and not clinical validation.', '');

md.push('## Recommendations for the team (NOT applied — thresholds were not changed)', '');
md.push('1. Make "Unusual for you" one-directional for sleep, mood and SpO2: flag only changes in the worse direction.');
md.push('2. Use an in-flight baseline (for example the median of mission days 8–21) for blood pressure and temperature, so the normal space adaptation is not flagged every day.');
md.push(`3. Sleep: ${pi.sleep.nonOkPct}% of normal days are non-green because the published ISS average is about 6 h. Consider judging sleep against the astronaut's own in-flight usual, and keep ACT for clearly short or persistent sleep loss.`);
md.push('4. Exercise target: the app uses 150 min/day; the astronauts in the 2019 Circulation BP study trained up to about 2 h/day. Consider 120 min.');
md.push(`5. Very low temperature: ${fa.hypothermiaReadings} healthy-day readings were below 35.0 °C and triggered a hypothermia ACT. They follow the published healthy day-to-day temperature spread (0.40 °C), so one low oral reading is not rare. Consider "re-measure first" before a hypothermia alert from a single oral reading.`);
md.push(`6. Heart rate: readings below 50 bpm are always WATCH, and 50–59 bpm are WATCH when the baseline is 60 or more. Fit astronauts often sit in this range, so heart rate is non-green on ${pi.hr.nonOkPct}% of normal days (range rule ${pi.hr.rangePct}%). Consider judging low heart rate against the personal baseline only.`);
md.push('');

md.push('## How the data was fed to the app', '', '| Synthetic field | App field | Time | Context / notes |', '| --- | --- | --- | --- |');
for (const m of MAPPING) md.push(`| ${m.join(' | ')} |`);
md.push('', `Normal ("event-free") day: ${report.eventFreeDefinition as string}`, '');

md.push('## False alarms on normal days', '', '| Scenario | Normal days | Any non-green | Any ACT | Pattern cards | Readings < 35.0 °C |', '| --- | --- | --- | --- | --- | --- |');
for (const [id, s] of Object.entries(S)) {
  const f = s.falseAlarms;
  md.push(`| ${id} — ${s.title} | ${f.eventFreeDays} | ${f.anyNonOkPct}% | ${f.anyActPct}% | ${f.patternDayPct}% | ${f.hypothermiaReadings} |`);
}
md.push('', '### Per indicator, scenario A (share of normal days)', '', '| Indicator | Days | Non-green | ACT | Range rule | "Unusual for you" | "Trending worse" | Space adaptation (BP) | Better than usual |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [k, v] of Object.entries(pi)) {
  md.push(`| ${k} | ${v.days} | ${v.nonOkPct}% | ${v.actPct}% | ${v.rangePct}% | ${v.baselinePct}% | ${v.trendPct}% | ${v.adaptationPct === null ? '—' : v.adaptationPct + '%'} | ${v.betterThanUsualPct === null ? '—' : v.betterThanUsualPct + '%'} |`);
}
md.push('', 'A reading can be raised by more than one rule, so the rule columns can add up to more than "Non-green". "Space adaptation (BP)" counts BP alerts that are either the low-BP "Fainting risk" label or only "Unusual for you" with the top number below the pre-flight baseline. "Better than usual" counts "Unusual for you" alerts where the reading is higher (better) than the baseline.', '');
md.push('Scenario B changes only temperature: its temperature row is ' + `${B.falseAlarms.perIndicator.temp.nonOkPct}% non-green (A: ${pi.temp.nonOkPct}%).`, '');

md.push('## Staged events — detection', '');
md.push('Strict detectors (what a crew member would act on) and lenient detectors (any non-green card on the related indicators).', '');
md.push('| Scenario | Detector | Caught | Before peak | Median days before peak | Alert days | Inside a real event |', '| --- | --- | --- | --- | --- | --- | --- |');
for (const [id, s] of Object.entries(S)) for (const [name, d] of Object.entries(s.detection)) {
  md.push(`| ${id} | ${name}: ${d.rule} | ${d.caught} of ${d.episodes} | ${d.caughtBeforePeak} | ${d.medianLeadDays ?? '—'} | ${d.alertDays} | ${d.alertDaysInsideEvent} (${d.alertDayPrecisionPct}%) |`);
}
md.push('', 'Event sizes are assumptions (C = small, D = large). Read results as "detects events of this size", never as real-world accuracy. Missed episodes with their daily readings are listed in app-evaluation.json.', '');
md.push('## Other checks', '', `- ${report.forecast as string}`, `- ${report.nextDayLowBp as string}`, '');
md.push('## Data changes in this version', '', '- `exercise_mean` changed from 100 to 120 min/day (still an ASSUMPTION; see the parameter note). All other columns are byte-identical to the delivered dataset; regenerated with seed 42 and `verify_outputs.py` passes.', '- Temperature data were NOT changed: the readings below 35.0 °C follow the published healthy within-person spread (0.40 °C) and are reported as an app finding.', '');
md.push('## Reproduce', '', '```bash', 'cd scripts/synthetic && python generate.py && python verify_outputs.py', 'cd ../.. && npx vite-node scripts/synthetic/evaluate_synthetic.ts', '```', '', `**${LABEL}**`, '');
writeFileSync(join(OUT, 'APP-EVALUATION.md'), md.join('\n'));
console.log('Wrote', join(OUT, 'APP-EVALUATION.md'));
