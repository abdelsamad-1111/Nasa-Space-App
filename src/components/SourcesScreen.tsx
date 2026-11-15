import {
  APP_DESIGNED_NOTE,
  EXERCISE,
  GLUCOSE_NOTE,
  INDICATOR_ORDER,
  INDICATORS,
  MODEL_CREDIT,
  RADIATION_LIMIT_NOTE,
  SOURCES,
  THRESHOLDS,
} from '../brain/indicators';
import { fmtNumber } from '../lib/format';
import { METRIC_EVIDENCE, SOURCE_REVIEWED_ON, sourcesForMetric } from '../data/healthSources';

export function SourcesScreen() {
  return (
    <main className="screen sources">
      <div className="screen-title">
        <h1>Sources</h1>
        <span className="muted">{APP_DESIGNED_NOTE}</span>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Primary references</h2>
          <span className="hint">Links checked {SOURCE_REVIEWED_ON}</span>
        </div>
        <p className="hint">These sources support the reference facts described below. They do not validate this app’s alert colors, multi-indicator patterns or mission-specific medical decisions.</p>
        <ul className="src-list">
          {SOURCES.map((s) => (
            <li key={s.id} id={`source-${s.id}`}>
              <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
              <div className="hint">{s.scope}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Thresholds used by the app</h2>
          <span className="hint">* = includes app-designed alert rules</span>
        </div>
        <div role="region" aria-label="Thresholds and source applicability" tabIndex={0} style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>Indicator</th>
              <th>OK</th>
              <th>Watch</th>
              <th>Act</th>
              <th>Critical</th>
              <th>Reference and applicability</th>
              <th>NASA context</th>
            </tr>
          </thead>
          <tbody>
            {[...INDICATOR_ORDER.map((id) => INDICATORS[id]), EXERCISE].map((ind) => {
              const id = ind.id;
              const evidence = METRIC_EVIDENCE[id];
              return (
                <tr key={id}>
                  <td><strong>{ind.name}{ind.appDesigned ? ' *' : ''}</strong>{ind.appDesigned && <div className="hint">{ind.appDesigned}</div>}</td>
                  <td>{ind.thresholds.OK}</td>
                  <td>{ind.thresholds.WATCH}</td>
                  <td>{ind.thresholds.ACT}</td>
                  <td>{ind.thresholds.CRITICAL}</td>
                  <td>
                    {sourcesForMetric(id).map((source) => (
                      <div key={source.id}>
                        <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
                      </div>
                    ))}
                    <details>
                      <summary>Reference scope and app rules</summary>
                      <p className="hint"><strong>Reference:</strong> {evidence.reference}</p>
                      <p className="hint"><strong>App rules:</strong> {evidence.appRules}</p>
                      <p className="hint"><strong>Limits:</strong> {evidence.limitation}</p>
                    </details>
                  </td>
                  <td><a href={ind.nasaRiskUrl} target="_blank" rel="noreferrer" aria-label={`NASA spaceflight risk context for ${ind.name}`}>Risk context</a></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <ul className="src-notes hint">
          <li>* Rule “Unusual for you”: more than {fmtNumber(THRESHOLDS.rules.baselinePct)}% away from your pre-flight baseline → at least Watch.</li>
          <li>* Rule “Trending worse”: worse in {fmtNumber(THRESHOLDS.rules.trendReadings)} consecutive readings → at least Watch.</li>
          <li>* Exercise / EVA context adds a rest-and-recheck note to an abnormal heart rate or blood pressure reading. It does not lower the alert, remove escalation guidance or establish that the reading is safe.</li>
          <li>* Multi-indicator patterns P1–P3 are app-designed prompts for review, not validated diagnostic tests.</li>
          <li>{GLUCOSE_NOTE}</li>
          <li>Default radiation reference: {fmtNumber(THRESHOLDS.radiation.careerLimitDefault)} mSv. {RADIATION_LIMIT_NOTE} Editing Settings does not change the NASA requirement.</li>
        </ul>
      </section>

      <section className="section">
        <div className="section-head"><h2>3D model credit</h2></div>
        <p>
          <strong>{MODEL_CREDIT.attribution}.</strong>{' '}
          <a href={MODEL_CREDIT.licenseUrl} target="_blank" rel="noreferrer">License</a> ·{' '}
          <a href={MODEL_CREDIT.url} target="_blank" rel="noreferrer">Download page</a>
        </p>
        <p className="hint">
          {MODEL_CREDIT.title}. {MODEL_CREDIT.changes} {MODEL_CREDIT.note}
        </p>
      </section>
    </main>
  );
}
