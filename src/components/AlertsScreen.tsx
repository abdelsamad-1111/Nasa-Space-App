import { useMemo, useState } from 'react';
import { INDICATORS, STATUS_WORD, type Status } from '../brain/indicators';
import type { Alert, AlertType } from '../brain/evaluate';
import { useApp } from '../state/AppState';
import { StatusBadge } from './StatusBadge';
import { fmtNumber } from '../lib/format';
import { FORECAST_LABEL } from '../brain/forecast';
import { PROBLEM_NAME } from '../lib/forecastPresentation';
import './alerts.css';

type TypeFilter = AlertType | 'early' | 'all';
const TYPES: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'range', label: 'Out of range' },
  { id: 'baseline', label: 'Unusual for you' },
  { id: 'trend', label: 'Trend' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'early', label: 'Early warning' },
];
const STATUSES: (Status | 'all')[] = ['all', 'WATCH', 'ACT', 'CRITICAL'];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label])) as Record<AlertType, string>;

export function AlertsScreen() {
  const { alerts, openAlerts, earlyWarnings, earlyWarningCount, data, dispatch, day, openReport } = useApp();
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<Status | 'all'>('all');

  const match = (a: Alert) => type !== 'early' && (type === 'all' || a.type === type) && (status === 'all' || a.status === status);
  const openList = openAlerts.filter(match);
  const history = useMemo(() => alerts.filter((a) => !a.open).sort((a, b) => b.missionDay - a.missionDay), [alerts]).filter(match);

  const row = (a: Alert, showAck: boolean) => (
    <tr key={a.id}>
      <td className="num">Day {fmtNumber(a.missionDay)}</td>
      <td><StatusBadge status={a.status} size={10} /></td>
      <td>{TYPE_LABEL[a.type]}</td>
      <td>{a.indicatorId ? INDICATORS[a.indicatorId].name : 'Several indicators'}</td>
      <td>{a.message}</td>
      <td className="td-action">
        {showAck ? (
          <button className="btn" onClick={() => dispatch({ type: 'ackAlert', id: a.id })}>
            Acknowledge
          </button>
        ) : (
          <span className="muted">{data.acknowledgedAlerts.includes(a.id) ? 'Acknowledged' : 'Closed'}</span>
        )}
      </td>
    </tr>
  );

  const head = (
    <thead>
      <tr>
        <th>Day</th>
        <th>Status</th>
        <th>Type</th>
        <th>Indicator</th>
        <th>Message</th>
        <th />
      </tr>
    </thead>
  );

  return (
    <main className="screen alerts">
      <div className="screen-title">
        <h1>Alerts &amp; Report</h1>
        <span className="muted">Up to mission day {fmtNumber(day)}</span>
      </div>

      <div className="section filters" role="group" aria-label="Filters">
        <div className="field">
          <label htmlFor="f-type">Type</label>
          <select id="f-type" className="input" value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
            {TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s === 'all' ? 'All statuses' : STATUS_WORD[s]}</option>
            ))}
          </select>
        </div>
        <div className="report-btn">
          <button className="btn btn-primary" onClick={() => openReport(day)}>
            Generate report for flight surgeon (Day {fmtNumber(day)})
          </button>
        </div>
      </div>

      {(type === 'all' || type === 'early') && status === 'all' && (
        <section className="section early-alerts" aria-labelledby="early-alerts-title">
          <div className="section-head">
            <h2 id="early-alerts-title">
              Early warnings · next 48 h <span className="badge badge-early-light">{fmtNumber(earlyWarningCount)}</span>
            </h2>
            <span className="hint">Forecast only — not counted in the alerts badge and never changes a status.</span>
          </div>
          {earlyWarnings.length ? (
            <table className="data">
              <thead>
                <tr><th>Day</th><th>Type</th><th>Likely problem</th><th>Risk</th><th>Window</th></tr>
              </thead>
              <tbody>
                {[...earlyWarnings].reverse().map((w) => (
                  <tr key={w.day}>
                    <td className="num">Day {fmtNumber(w.day)}</td>
                    <td>Early warning</td>
                    <td>{PROBLEM_NAME[w.problem].replace(/^./, (c) => c.toUpperCase())}</td>
                    <td className="num">{fmtNumber(w.riskPercent)}%</td>
                    <td className="muted">{w.day >= day - 1 ? `Active · days ${fmtNumber(w.day + 1)}–${fmtNumber(w.day + 2)}` : 'Past'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No early warnings up to Day {fmtNumber(day)}.</p>
          )}
          <p className="hint">{FORECAST_LABEL}</p>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>
            Open alerts <span className="badge">{fmtNumber(openList.length)}</span>
          </h2>
          {openList.length !== openAlerts.length && (
            <span className="hint">{fmtNumber(openAlerts.length)} open in total (filters applied)</span>
          )}
        </div>
        {openList.length ? (
          <table className="data">{head}<tbody>{openList.map((a) => row(a, true))}</tbody></table>
        ) : (
          <p className="muted">No open alerts.</p>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>History</h2>
          <span className="hint">Earlier alerts and acknowledged alerts</span>
        </div>
        {history.length ? (
          <table className="data">{head}<tbody>{history.map((a) => row(a, false))}</tbody></table>
        ) : (
          <p className="muted">No history yet.</p>
        )}
      </section>
    </main>
  );
}
