import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTEXT_OPTIONS,
  GLUCOSE_NOTE,
  HOW_TO,
  INDICATOR_ORDER,
  INDICATORS,
  LOCATION_LABEL,
  PATTERNS,
  metricDef,
  type IndicatorId,
  type ReadingValue,
} from '../brain/indicators';
import {
  dailyValue,
  detectPatterns,
  escalationText,
  evaluateDay,
  evaluateIndicatorOnDay,
  followUpActions,
  interpretation,
  needsEscalationText,
  summarizeAssessment,
  rank,
  type Evaluation,
  type Measurement,
} from '../brain/evaluate';
import { useApp } from '../state/AppState';
import { StatusBadge } from './StatusBadge';
import { AssessmentStatus } from './AssessmentStatus';
import { Footer } from './Footer';
import { fmtNumber, fmtValue, parseNumberInput } from '../lib/format';
import { readingRevisionTimestamp } from '../lib/readingRevision';
import './checkin.css';

interface Entry {
  context: string[];
  raw: string;
  raw2: string; // diastolic
}

const emptyEntry = (context: string[] = []): Entry => ({ context, raw: '', raw2: '' });

function parseEntry(id: IndicatorId, e: Entry): { value: ReadingValue | null; error: string | null } {
  const ind = INDICATORS[id];
  const range = `from ${fmtNumber(ind.inputMin)} to ${fmtNumber(ind.inputMax)}`;
  if (id === 'bp') {
    const sys = parseNumberInput(e.raw);
    const dia = parseNumberInput(e.raw2);
    if (sys === null || dia === null) return { value: null, error: 'Enter both systolic and diastolic values.' };
    if (sys < ind.inputMin || sys > ind.inputMax || dia < 20 || dia > 180)
      return { value: null, error: 'Check the numbers: systolic 50–260, diastolic 20–180 mmHg.' };
    if (dia >= sys) return { value: null, error: 'Diastolic must be lower than systolic.' };
    return { value: { sys, dia }, error: null };
  }
  const n = parseNumberInput(e.raw);
  if (n === null) return { value: null, error: `Enter a number ${range}.` };
  if (n < ind.inputMin || n > ind.inputMax) return { value: null, error: `Enter a number ${range}.` };
  if (id === 'mood' && !Number.isInteger(n)) return { value: null, error: 'Choose a whole number from 1 to 5.' };
  return { value: n, error: null };
}

export function CheckIn() {
  const { data, dispatch, today, setDay, setScreen, checkInStep } = useApp();
  // 0..7 indicators, 8 = briefing. A routine reminder can open the check-in at a given step.
  const [step, setStep] = useState(() => Math.min(Math.max(0, checkInStep), INDICATOR_ORDER.length - 1));
  const [entries, setEntries] = useState<Partial<Record<IndicatorId, Entry>>>({});
  const [checked, setChecked] = useState<Partial<Record<IndicatorId, boolean>>>({});
  const [committed, setCommitted] = useState(false);
  const startedAt = useRef(new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const id = INDICATOR_ORDER[step] as IndicatorId | undefined;
  const ind = id ? INDICATORS[id] : null;
  const entry = (id && entries[id]) || emptyEntry(step > 0 ? entries[INDICATOR_ORDER[step - 1]]?.context ?? [] : []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // Measurements entered so far in this check-in.
  const newMeasurements = useMemo<Measurement[]>(() => {
    if (committed) return [];
    const out: Measurement[] = [];
    INDICATOR_ORDER.forEach((iid, i) => {
      const e = entries[iid];
      if (!e || !checked[iid]) return;
      const p = parseEntry(iid, e);
      if (p.value === null) return;
      out.push({
        id: `ci-${startedAt.current.getTime()}-${iid}`,
        indicatorId: iid,
        value: p.value,
        unit: INDICATORS[iid].unit,
        // Keep step order, but make manual revisions later than same-day demo readings.
        timestamp: readingRevisionTimestamp(
          new Date(startedAt.current.getTime() - (INDICATOR_ORDER.length - i) * 1000),
          dailyValue(data.measurements, iid, today),
        ),
        missionDay: today,
        context: e.context.length ? e.context : ['None'],
      });
    });
    return out;
  }, [entries, checked, today, data.measurements, committed]);

  const allMs = useMemo(() => [...data.measurements, ...(committed ? [] : newMeasurements)], [data.measurements, newMeasurements, committed]);

  const result: Evaluation | null =
    id && checked[id] ? evaluateIndicatorOnDay(allMs, id, today, data.settings) : null;
  const parsed = id ? parseEntry(id, entry) : null;

  const update = (patch: Partial<Entry>) => {
    if (!id) return;
    setEntries((s) => ({ ...s, [id]: { ...entry, ...patch } }));
    setChecked((c) => ({ ...c, [id]: false }));
  };

  const toggleContext = (c: string) => {
    let next: string[];
    if (c === 'None') next = entry.context.includes('None') ? [] : ['None'];
    else {
      const without = entry.context.filter((x) => x !== 'None');
      next = without.includes(c) ? without.filter((x) => x !== c) : [...without, c];
    }
    update({ context: next });
  };

  const check = () => {
    if (!id || !parsed || parsed.value === null) return;
    setEntries((s) => ({ ...s, [id]: entry }));
    setChecked((c) => ({ ...c, [id]: true }));
  };

  /** Save the checks done so far and show the briefing. */
  const finish = () => {
    dispatch({ type: 'addMeasurements', measurements: newMeasurements });
    setCommitted(true);
    setStep(INDICATOR_ORDER.length);
  };
  const next = () => {
    if (step < INDICATOR_ORDER.length - 1) setStep(step + 1);
    else finish();
  };

  const exit = () => setScreen('twin');
  const backToTwin = () => {
    setDay(today);
    setScreen('twin');
  };

  const done = step >= INDICATOR_ORDER.length;
  const checkedCount = INDICATOR_ORDER.filter((iid) => checked[iid]).length;
  const progress = (checkedCount / INDICATOR_ORDER.length) * 100;

  return (
    <div className="checkin" role="dialog" aria-modal="true" aria-labelledby="ci-title">
      <header className="ci-top">
        <div>
          <span className="eyebrow">Morning check-in · Mission day {fmtNumber(today)} · {LOCATION_LABEL[data.settings.location]}</span>
          <h1 id="ci-title" className="ci-title">{done ? "Today's Health Briefing" : 'Pre-flight style checklist'}</h1>
        </div>
        {!done && (
          <button className="btn" onClick={exit}>
            Exit without saving
          </button>
        )}
      </header>

      <div className="ci-progress" role="progressbar" aria-valuemin={0} aria-valuemax={8} aria-valuenow={checkedCount} aria-label="Check-in progress">
        <div className="ci-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="ci-body">
        <ol className="ci-steps" aria-label="Checklist">
          {INDICATOR_ORDER.map((iid, i) => {
            const st = checked[iid] && i !== step ? evaluateIndicatorOnDay(allMs, iid, today, data.settings)?.status : undefined;
            const state = i === step && !done ? 'current' : checked[iid] ? 'done' : 'todo';
            return (
              <li key={iid} className={`ci-step ci-step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className="ci-step-box" aria-hidden="true">
                  {state === 'done' && (
                    <svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
                  )}
                </span>
                <span className="ci-step-num num">{String(i + 1).padStart(2, '0')}</span>
                <span className="ci-step-name">{INDICATORS[iid].name}</span>
                {st && <StatusBadge status={st} size={9} />}
              </li>
            );
          })}
        </ol>

        {!done && id && ind ? (
          <section className="ci-card" key={id}>
            <span className="eyebrow num">
              Step {step + 1} of {INDICATOR_ORDER.length}
            </span>
            <h2 ref={headingRef} tabIndex={-1} className="ci-ind">{ind.name}</h2>

            <details className="howto" open>
              <summary>How to measure</summary>
              <ol>
                {HOW_TO[id].map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
            </details>

            <fieldset className="ci-field">
              <legend>1. Before measuring: what were you doing? (select all that apply)</legend>
              <div className="chips">
                {CONTEXT_OPTIONS.map((c) => (
                  <button key={c} type="button" className="chip" aria-pressed={entry.context.includes(c)} onClick={() => toggleContext(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>

            <form
              className="ci-field"
              onSubmit={(e) => {
                e.preventDefault();
                if (checked[id]) next();
                else check();
              }}
            >
              <label htmlFor="ci-value" className="legend-like">
                2. Enter your value <span className="hint">— {ind.inputHint}</span>
              </label>
              {id === 'mood' ? (
                <div className="mood-scale" role="radiogroup" aria-label="Mood from 1 very low to 5 very good">
                  {[1, 2, 3, 4, 5].map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={entry.raw === String(m)}
                      className="mood-btn"
                      onClick={() => update({ raw: String(m) })}
                    >
                      <span className="num">{m}</span>
                      <span className="hint">{m === 1 ? 'Very low' : m === 5 ? 'Very good' : m === 3 ? 'OK' : ''}</span>
                    </button>
                  ))}
                </div>
              ) : id === 'bp' ? (
                <div className="bp-inputs">
                  <input
                    id="ci-value"
                    ref={inputRef}
                    className="input ci-input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Systolic"
                    aria-label="Systolic"
                    value={entry.raw}
                    onChange={(e) => update({ raw: e.target.value })}
                  />
                  <span className="bp-slash">/</span>
                  <input
                    className="input ci-input"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Diastolic"
                    aria-label="Diastolic"
                    value={entry.raw2}
                    onChange={(e) => update({ raw2: e.target.value })}
                  />
                  <span className="ci-unit">{ind.unit}</span>
                </div>
              ) : (
                <div className="bp-inputs">
                  <input
                    id="ci-value"
                    ref={inputRef}
                    className="input ci-input"
                    inputMode={ind.decimals ? 'decimal' : 'numeric'}
                    autoComplete="off"
                    value={entry.raw}
                    onChange={(e) => update({ raw: e.target.value })}
                  />
                  <span className="ci-unit">{ind.unit}</span>
                </div>
              )}
              {id === 'glucose' && <p className="hint ci-note">{GLUCOSE_NOTE}</p>}
              {id === 'radiation' && <p className="hint ci-note">Your cumulative mission dose is compared with the career limit of {fmtNumber(data.settings.careerRadiationLimit)} mSv.</p>}
              {(entry.raw || entry.raw2) && parsed?.error && !checked[id] && <p className="field-error">{parsed.error}</p>}

              {!checked[id] ? (
                <button className="btn btn-primary ci-action" type="submit" disabled={!parsed || parsed.value === null}>
                  Check value
                </button>
              ) : null}
            </form>

            {result && (
              <div className={`ci-result ci-result-${result.status}`} aria-live="polite">
                <span className="eyebrow">3. Result</span>
                <div className="ci-result-top">
                  <StatusBadge status={result.status} size={14} />
                  <span className="ci-result-value num">
                    {id === 'radiation' ? `${fmtValue(id, result.value)} mSv today` : `${fmtValue(id, result.value)} ${ind.unit}`}
                  </span>
                  {result.labels.map((l) => (
                    <span key={l} className="tag">{l}</span>
                  ))}
                </div>
                <p className="ci-meaning">{interpretation(result)}</p>
                <p className="ci-do">
                  <strong>Do:</strong> {followUpActions(result)[0]}
                </p>
                <div className="ci-buttons">
                  <button className="btn btn-primary ci-action" onClick={next} autoFocus>
                    {step < INDICATOR_ORDER.length - 1 ? 'Next' : 'Finish check-in'}
                  </button>
                  {step < INDICATOR_ORDER.length - 1 && (
                    <button className="btn ci-action" onClick={finish}>
                      Save and finish
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          <Briefing onBack={backToTwin} />
        )}
      </div>
      <Footer />
    </div>
  );
}

function Briefing({ onBack }: { onBack: () => void }) {
  const { data, today } = useApp();
  const evals = evaluateDay(data.measurements, today, data.settings);
  const patterns = detectPatterns(data.measurements, today);
  const summary = summarizeAssessment(evals, patterns);
  const missing = INDICATOR_ORDER.filter((id) => !evals[id]);
  const attention = Object.values(evals).filter((e) => e && e.status !== 'OK');

  // Max 3 actions: patterns first, then indicators by severity.
  const actions: string[] = [];
  for (const p of patterns) for (const a of PATTERNS[p.id].actions) if (!actions.includes(a)) actions.push(a);
  const sorted = [...attention].sort((a, b) => rank(b!.status) - rank(a!.status));
  for (const e of sorted) {
    const a = `${metricDef(e!.indicatorId).name}: ${followUpActions(e!)[0]}`;
    if (!actions.includes(a)) actions.push(a);
  }
  const top = actions.slice(0, 3);
  const escalate = patterns.some((p) => p.escalate) || Object.values(evals).some((e) => e && (e.escalate || needsEscalationText(e.status)));

  return (
    <section className="ci-card briefing" aria-live="polite">
      <span className="eyebrow">Mission day {fmtNumber(today)}</span>
      <h2 className="ci-ind" tabIndex={-1}>Overall status</h2>
      <div className="briefing-status">
        <AssessmentStatus summary={summary} size={20} />
      </div>
      {missing.length > 0 && (
        <p className="briefing-missing">Still to record: {missing.map((id) => INDICATORS[id].name).join(', ')}.</p>
      )}
      {patterns.map((p) => (
        <p key={p.id} className="briefing-pattern">
          <strong>Pattern detected:</strong> {p.title}
        </p>
      ))}
      <h3 className="eyebrow briefing-h">Actions for today</h3>
      {top.length ? (
        <ol className="briefing-actions">
          {top.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      ) : (
        <p>{summary.complete ? 'No additional actions from today’s readings. Continue your scheduled checks.' : 'Complete the missing checks to finish today’s assessment.'}</p>
      )}
      {escalate && (
        <div className="escalation briefing-esc">
          <span className="eyebrow">Escalation · {LOCATION_LABEL[data.settings.location]}</span>
          {escalationText(data.settings.location)}
        </div>
      )}
      <button className="btn btn-primary ci-action" onClick={onBack} autoFocus>
        Back to Health Twin
      </button>
    </section>
  );
}
