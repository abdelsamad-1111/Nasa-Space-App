import { useMemo, useRef, useState } from 'react';
import { INDICATORS, STATUS_WORD, type Status } from '../brain/indicators';
import type { Alert, AlertType } from '../brain/evaluate';
import { useApp } from '../state/AppState';
import { StatusBadge } from './StatusBadge';
import { buildReport } from '../lib/report';
import { fmtNumber } from '../lib/format';
import './alerts.css';

const TYPES: { id: AlertType | 'all'; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'range', label: 'Out of range' },
  { id: 'baseline', label: 'Unusual for you' },
  { id: 'trend', label: 'Trend' },
  { id: 'pattern', label: 'Pattern' },
];
const STATUSES: (Status | 'all')[] = ['all', 'WATCH', 'ACT', 'CRITICAL'];
const TYPE_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label])) as Record<AlertType, string>;

export function AlertsScreen() {
  const { alerts, openAlerts, data, dispatch, day } = useApp();
  const [type, setType] = useState<AlertType | 'all'>('all');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const reportRef = useRef<HTMLTextAreaElement>(null);

  const match = (a: Alert) => (type === 'all' || a.type === type) && (status === 'all' || a.status === status);
  const openList = openAlerts.filter(match);
  const history = useMemo(() => alerts.filter((a) => !a.open).sort((a, b) => b.missionDay - a.missionDay), [alerts]).filter(match);

  const generate = () => {
    setReport(buildReport(data, day, openAlerts));
    setCopied('idle');
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied('ok');
    } catch {
      try {
        reportRef.current?.select();
        setCopied(document.execCommand('copy') ? 'ok' : 'fail');
      } catch {
        setCopied('fail');
      }
    }
  };

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
          <select id="f-type" className="input" value={type} onChange={(e) => setType(e.target.value as AlertType | 'all')}>
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
          <button className="btn btn-primary" onClick={generate}>Generate report for flight surgeon</button>
        </div>
      </div>

      {report && (
        <section className="section report" aria-label="Report for flight surgeon">
          <div className="section-head">
            <h2>Report for flight surgeon</h2>
            <div className="report-actions">
              <span role="status" className="muted">
                {copied === 'ok' ? 'Copied to clipboard.' : copied === 'fail' ? 'Copy failed — select the text and copy it.' : ''}
              </span>
              <button className="btn" onClick={copy}>Copy</button>
              <button className="btn btn-ghost" onClick={() => setReport(null)}>Close</button>
            </div>
          </div>
          <textarea ref={reportRef} className="report-text" readOnly value={report} rows={report.split('\n').length + 1} />
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
