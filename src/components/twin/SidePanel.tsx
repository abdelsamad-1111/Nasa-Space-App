import { Suspense, lazy, memo, useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { Explore3D } from './Explore3D';
import {
  BONE_TEXT,
  GLUCOSE_NOTE,
  HOW_TO,
  LEGS_TEXT,
  LOCATION_LABEL,
  THRESHOLDS,
  WHY_HEADER,
  ZONES,
  fmtMinutes,
  metricDef,
  type MetricId,
} from '../../brain/indicators';
import {
  contributingFactors,
  escalationText,
  exercisePct,
  followUpActions,
  interpretation,
  isBp,
  needsEscalationText,
} from '../../brain/evaluate';
import { useApp } from '../../state/AppState';
import { StatusBadge } from '../StatusBadge';
import { fmtNumber, fmtPct, fmtValue } from '../../lib/format';
import { radiationPct } from './values';
import { METRIC_EVIDENCE, sourcesForMetric } from '../../data/healthSources';
const TrendChart = lazy(() => import('./TrendChart').then((m) => ({ default: m.TrendChart })));

export type PanelTab = 'overview' | 'trend' | 'why';
const TABS: { id: PanelTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'trend', label: 'Trend' },
  { id: 'why', label: 'Why' },
];

interface Props {
  selected: MetricId;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
}

export const SidePanel = memo(function SidePanel({ selected, tab, onTab }: Props) {
  const ind = metricDef(selected);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [explore, setExplore] = useState(false);
  const closeExplore = useCallback(() => setExplore(false), []);
  const selectedZone = ZONES.find((zone) => zone.indicators.includes(selected))?.id ?? null;
  const { setSelectedMetric, openAssistant } = useApp();
  const askAboutThis = () => {
    setSelectedMetric(selected);
    openAssistant(true);
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    onTab(TABS[n].id);
    tabRefs.current[n]?.focus();
  };

  return (
    <aside className="panel" aria-label={`${ind.name} details`} id="side-panel" tabIndex={-1}>
      <div className="panel-head">
        <div>
          <span className="eyebrow">Selected indicator</span>
          <h2 className="panel-title">{ind.name}</h2>
        </div>
        <div className="panel-head-actions">
          <button className="btn explore-btn" onClick={askAboutThis} aria-controls="capcom-panel">
            Ask about this
          </button>
          <button className="btn explore-btn" onClick={() => setExplore(true)}>
            Explore 3D
          </button>
        </div>
      </div>
      {explore && <Explore3D initialZone={selectedZone} onClose={closeExplore} />}
      <div className="tabs" role="tablist" aria-label="Detail views" data-region="compare interpret">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && <Overview id={selected} />}
        {tab === 'trend' && (
          <Suspense fallback={<p className="muted panel-empty">Loading chart…</p>}>
            <TrendChart id={selected} />
          </Suspense>
        )}
        {tab === 'why' && <Why id={selected} />}
      </div>
    </aside>
  );
});

function Overview({ id }: { id: MetricId }) {
  const { view, data, dispatch } = useApp();
  const e = view.metrics[id];
  const ind = metricDef(id);
  if (id === 'exercise') return <ExerciseOverview />;
  if (!e) return <p className="muted panel-empty">No reading for Day {fmtNumber(view.day)}.</p>;
  const baseline = data.settings.baselines[id];
  const isRad = id === 'radiation';
  const limit = data.settings.careerRadiationLimit;
  const actions = followUpActions(e);
  const showEscalation = needsEscalationText(e.status) || e.escalate;

  return (
    <div className="overview">
      <div className="ov-value">
        {isRad ? (
          <>
            <span className="big num">{fmtNumber(view.cumulativeDose, 1)}</span>
            <span className="unit"> / {fmtNumber(limit)} mSv</span>
          </>
        ) : (
          <>
            <span className="big num">{fmtValue(id, e.value)}</span>
            <span className="unit"> {ind.unit}</span>
          </>
        )}
      </div>
      {isRad && (
        <div className="rad-detail">
          <span className="rad-bar rad-bar-lg" aria-hidden="true">
            <span style={{ width: `${radiationPct(view.cumulativeDose, limit)}%` }} />
          </span>
          <span className="hint num">
            Cumulative mission dose · {fmtNumber(radiationPct(view.cumulativeDose, limit), 1)}% of career limit · Today{' '}
            {fmtValue(id, e.value)} mSv
          </span>
        </div>
      )}
      <div className="ov-status">
        <StatusBadge status={e.status} size={14} />
        {e.labels.map((l) => (
          <span key={l} className="tag">{l}</span>
        ))}
      </div>

      {!isRad && (
        <dl className="ov-compare" data-region="compare">
          <div>
            <dt>Current</dt>
            <dd className="num">{fmtValue(id, e.value)}</dd>
          </div>
          <div>
            <dt>Your baseline</dt>
            <dd className="num">{baseline !== undefined ? fmtValue(id, baseline) : '—'}</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd className="num">
              {e.deltaPct !== null ? `${fmtPct(e.deltaPct)} vs baseline` : '—'}
              {isBp(e.value) && isBp(baseline) && <span className="hint"> (systolic)</span>}
            </dd>
          </div>
        </dl>
      )}

      <section className="ov-block" data-region="interpret">
        <h3 className="eyebrow">Interpretation</h3>
        <p>{interpretation(e)}</p>
        {id === 'glucose' && <p className="note">{GLUCOSE_NOTE}</p>}
      </section>

      <section className="ov-block" data-region="followup">
        <h3 className="eyebrow">Follow-up</h3>
        <ul className="checklist">
          {actions.map((a, i) => {
            const key = `${id}-${view.day}-${i}`;
            const checked = data.actionsTaken.some((x) => x.key === key);
            return (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => dispatch({ type: 'toggleAction', key, missionDay: view.day, label: `${ind.name}: ${a}` })}
                  />
                  <span>{a}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <details className="howto howto-panel">
        <summary>How to measure</summary>
        <ol>
          {HOW_TO[id].map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      </details>

      {showEscalation && (
        <section className="escalation" aria-label="Escalation">
          <span className="eyebrow">Escalation · {LOCATION_LABEL[data.settings.location]}</span>
          {escalationText(data.settings.location)}
        </section>
      )}
    </div>
  );
}

const LEVELS = ['Low', 'Medium', 'High'] as const;

function Why({ id }: { id: MetricId }) {
  const { data, view } = useApp();
  const ind = metricDef(id);
  const factors = contributingFactors(data.measurements, view.day, data.settings, id);
  const evidence = METRIC_EVIDENCE[id];
  return (
    <div className="why">
      <p className="why-header">{WHY_HEADER}</p>
      <p className="hint">
        <a href={ind.nasaRiskUrl} target="_blank" rel="noreferrer">
          NASA risk: {ind.name}
        </a>
      </p>
      <ul className="panel-sources">
        {sourcesForMetric(id).map((source) => (
          <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>
        ))}
      </ul>
      <p className="note"><strong>Reference context:</strong> {evidence.reference}</p>
      <details className="howto howto-panel">
        <summary>How the app uses this evidence</summary>
        <p className="hint">{evidence.appRules}</p>
        <p className="hint">{evidence.limitation}</p>
      </details>
      <ul className="factors">
        {factors.map((f) => (
          <li key={f.id}>
            <div className="factor-top">
              <span className="factor-name">{f.name}</span>
              <span className="factor-level">
                <span className="level-bars" aria-hidden="true">
                  {LEVELS.map((l, i) => (
                    <span key={l} className={i <= LEVELS.indexOf(f.level) ? 'on' : ''} />
                  ))}
                </span>
                {f.level}
              </span>
            </div>
            <p className="hint">{f.reason}</p>
          </li>
        ))}
      </ul>
      <h3 className="eyebrow why-space">How space affects this</h3>
      <ul className="bullets">
        {ind.spaceFactors.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}


/** Legs zone: daily exercise vs target (not one of the 8 health indicators). */
function ExerciseOverview() {
  const { view, data, dispatch, today, startExerciseLog } = useApp();
  const e = view.metrics.exercise;
  const ind = metricDef('exercise');
  if (!e) return (
    <div className="overview">
      <p className="muted panel-empty">No exercise total recorded for Day {fmtNumber(view.day)}.</p>
      <p className="note">Record your daily total in minutes, including zero if no exercise was completed.</p>
      <button className="btn exercise-log-button" onClick={startExerciseLog}>Log today’s exercise</button>
    </div>
  );
  const minutes = e.value as number;
  const target = THRESHOLDS.exercise.targetMin;
  const actions = followUpActions(e);
  return (
    <div className="overview">
      <button className="btn exercise-log-button" onClick={startExerciseLog}>
        {view.day === today ? 'Update today’s exercise total' : 'Log today’s exercise'}
      </button>
      <div className="ov-value">
        <span className="big num">{fmtMinutes(minutes)}</span>
        <span className="unit"> / planning target {fmtMinutes(target)}</span>
      </div>
      <div className="ov-status">
        <StatusBadge status={e.status} size={14} />
      </div>
      <dl className="ov-compare" data-region="compare">
        <div>
          <dt>Exercise today</dt>
          <dd className="num">{fmtMinutes(minutes)}</dd>
        </div>
        <div>
          <dt>App planning target</dt>
          <dd className="num">{fmtMinutes(target)}</dd>
        </div>
        <div>
          <dt>Of target</dt>
          <dd className="num">{fmtNumber(exercisePct(minutes))}%</dd>
        </div>
      </dl>
      <section className="ov-block" data-region="interpret">
        <h3 className="eyebrow">Interpretation</h3>
        <p>{interpretation(e)}</p>
        <p className="note">
          {LEGS_TEXT}{' '}
          <a href={ind.nasaRiskUrl} target="_blank" rel="noreferrer">
            NASA — Risk of spaceflight-induced bone changes
          </a>
        </p>
        <p className="note">{BONE_TEXT}</p>
        <p className="note">Status: OK at 90% of target or more, Watch at 60–89%, Act below 60%.</p>
      </section>
      <section className="ov-block" data-region="followup">
        <h3 className="eyebrow">Follow-up</h3>
        <ul className="checklist">
          {actions.map((a, i) => {
            const key = `exercise-${view.day}-${i}`;
            const checked = data.actionsTaken.some((x) => x.key === key);
            return (
              <li key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => dispatch({ type: 'toggleAction', key, missionDay: view.day, label: `${ind.name}: ${a}` })}
                  />
                  <span>{a}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
