import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { STATUS_WORD, type Status } from '../../brain/indicators';
import { useApp } from '../../state/AppState';
import { StatusIcon } from '../StatusBadge';
import { LogoMark } from '../Logo';
import { fmtNumber } from '../../lib/format';
import { APP_NAME } from '../../lib/brand';
import {
  BUILT_FOR,
  DISCLAIMER,
  REPORT_SOURCES,
  buildReportModel,
  reportToText,
  type ReportModel,
  type VitalRow,
} from '../../lib/report';
import './report.css';

const PAGES = 2;

function Chip({ status }: { status: Status | null }) {
  if (!status) return <span className="rpt-chip rpt-chip-none">NO DATA</span>;
  return (
    <span className={`rpt-chip rpt-chip-${status}`}>
      <StatusIcon status={status} size={8} />
      {STATUS_WORD[status].toUpperCase()}
    </span>
  );
}

/** 30 px trend line (systolic for blood pressure); gaps where a day has no reading. */
function Sparkline({ values }: { values: (number | null)[] }) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="rpt-muted">—</span>;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const W = 30;
  const H = 12;
  const x = (i: number) => (i / (values.length - 1)) * (W - 2) + 1;
  const y = (v: number) => (max === min ? H / 2 : H - 1.5 - ((v - min) / (max - min)) * (H - 3));
  const segments: string[] = [];
  let cur = '';
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segments.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const lastIdx = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop()!;
  return (
    <svg className="rpt-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {segments.map((d) => (
        <path key={d} d={d} fill="none" stroke="#333" strokeWidth="1" strokeLinejoin="round" />
      ))}
      <circle cx={x(lastIdx)} cy={y(values[lastIdx]!)} r="1.6" fill="#111" />
    </svg>
  );
}

function PageHeader({ r, page }: { r: ReportModel; page: number }) {
  return (
    <header className="rpt-head">
      <div className="rpt-brand">
        <LogoMark size={46} />
        <div>
          <div className="rpt-wordmark">{APP_NAME}</div>
          <div className="rpt-title">Crew Health Report</div>
        </div>
      </div>
      <dl className="rpt-meta">
        <div><dt>Report ID</dt><dd className="mono">{r.id}</dd></div>
        <div><dt>Generated</dt><dd><span className="mono">{r.generatedUtc}</span> · <span className="mono">{r.met}</span></dd></div>
        <div><dt>Page</dt><dd>{page} of {PAGES}</dd></div>
      </dl>
    </header>
  );
}

function PageFooter({ r, page }: { r: ReportModel; page: number }) {
  return (
    <footer className="rpt-foot">
      <ol className="rpt-sources">
        {REPORT_SOURCES.map((s) => (
          <li key={s.n}>
            <sup>{s.n}</sup> {s.label} <span className="rpt-muted">({s.site})</span>
          </li>
        ))}
      </ol>
      <p className="rpt-legend">† App-designed threshold. H / L = above / below the reference range. Status uses the app rules, including personal baseline and trend.</p>
      <p className="rpt-disclaimer">{DISCLAIMER}</p>
      <div className="rpt-sign">
        <span>Reviewed by: <span className="rpt-line rpt-line-long" /></span>
        <span>Date: <span className="rpt-line" /></span>
      </div>
      <div className="rpt-foot-bottom">
        <span>{BUILT_FOR}</span>
        <span>{r.id} · Page {page} of {PAGES}</span>
      </div>
    </footer>
  );
}

function Section({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="rpt-section">
      <h2>{title}</h2>
      {children}
      {note && <p className="rpt-note">{note}</p>}
    </section>
  );
}

function VitalRowView({ v }: { v: VitalRow }) {
  return (
    <tr className={`rpt-row-${v.id}`}>
      <th scope="row">{v.name}</th>
      <td className="rpt-unit">{v.unit}</td>
      {v.cells.map((c, i) => (
        <td key={i} className={`num${c.flag ? ' is-flag' : ''}${c.text === '—' ? ' is-empty' : ''}`}>
          <span className="mono">{c.text}</span>
          {c.flag && <span className="rpt-flag">{c.flag}</span>}
        </td>
      ))}
      <td className="rpt-ref">
        <span className="mono">{v.reference}</span>
        <sup>{v.sources.join(',')}</sup>
        {v.appDesigned && <sup>†</sup>}
      </td>
      <td className="rpt-trend"><Sparkline values={v.spark} /></td>
      <td><Chip status={v.status} /></td>
    </tr>
  );
}

function ReportDocument({ r }: { r: ReportModel }) {
  const statusColor = r.summary.status ? `var(--rpt-${r.summary.status})` : '#999';
  return (
    <div className="rpt-pages">
      {/* ---------------- Page 1 ---------------- */}
      <section className="rpt-sheet" aria-label="Report page 1">
        <PageHeader r={r} page={1} />
        <dl className="rpt-info">
          <div><dt>Astronaut</dt><dd>{r.crew}</dd></div>
          <div><dt>Mission</dt><dd>{r.location}</dd></div>
          <div><dt>Mission day</dt><dd className="mono">{r.day}</dd></div>
          <div><dt>Period</dt><dd>days <span className="mono">{r.from}–{r.day}</span></dd></div>
          <div><dt>Prepared for</dt><dd>Flight Surgeon</dd></div>
          <div><dt>Data source</dt><dd>{r.dataSource}</dd></div>
          <div>
            <dt>Measurements on Day {r.day}</dt>
            <dd>
              <span className="mono">{r.measured}</span> of <span className="mono">{r.total}</span>
              {r.measured < r.total && <span className="rpt-warn"> — incomplete; missing readings are not normal readings</span>}
            </dd>
          </div>
        </dl>

        <section className="rpt-summary" style={{ borderLeftColor: statusColor }}>
          <div className="rpt-summary-head">
            <h2>Clinical summary</h2>
            <span className="rpt-muted">Overall status on Day {r.day}</span>
            <Chip status={r.summary.status} />
          </div>
          {r.summary.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="rpt-early-warning">{r.summary.earlyWarning}</p>
        </section>

        <Section title="Vital signs">
          <table className="rpt-table rpt-vitals">
            <colgroup>
              <col className="c-name" />
              <col className="c-unit" />
              {r.days.map((d) => <col key={d} className="c-day" />)}
              <col className="c-ref" />
              <col className="c-trend" />
              <col className="c-status" />
            </colgroup>
            <thead>
              <tr>
                <th>Indicator</th>
                <th>Unit</th>
                {r.days.map((d) => (
                  <th key={d} className={`num${d === r.day ? ' is-today' : ''}`}>{d >= 1 ? `D${d}` : '—'}</th>
                ))}
                <th>Reference range</th>
                <th className="c-trend-h">Trend</th>
                <th className="c-status-h">Status</th>
              </tr>
            </thead>
            <tbody>
              {r.vitals.map((v) => (
                <Fragment key={v.id}>
                  <VitalRowView v={v} />
                  {v.id === 'radiation' && (
                    <tr className="rpt-dose-row">
                      <td colSpan={r.days.length + 5}>
                        <div className="rpt-dose">
                          <span>Cumulative dose: <strong className="mono">{fmtNumber(r.dose.cumulative, 1)} / {fmtNumber(r.dose.limit)} mSv</strong></span>
                          <span className="rpt-bar" aria-hidden="true"><span style={{ width: `${Math.max(0.5, Math.min(100, r.dose.pct))}%` }} /></span>
                          <span className="rpt-muted"><span className="mono">{fmtNumber(r.dose.pct, 1)}%</span> of career limit (mission entries only)<sup>9</sup></span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Section>
        <PageFooter r={r} page={1} />
      </section>

      {/* ---------------- Page 2 ---------------- */}
      <section className="rpt-sheet rpt-sheet-2" aria-label="Report page 2">
        <PageHeader r={r} page={2} />
        <Section
          title={`Alerts in this period (days ${r.from}–${r.day})`}
          note={`One row per indicator per day, reasons merged. Open = not OK on Day ${r.day}. Pattern alerts: see Patterns.${r.alertsHidden ? ` ${r.alertsHidden} more alerts are listed in the app.` : ''}`}
        >
          {r.alerts.length ? (
            <table className="rpt-table rpt-alerts rpt-compact">
              <thead>
                <tr><th>Day</th><th>Indicator</th><th>Value</th><th>Status</th><th>Reason</th><th>State</th></tr>
              </thead>
              <tbody>
                {r.alerts.map((a) => (
                  <tr key={`${a.day}-${a.indicator}`}>
                    <td className="mono">{a.day}</td>
                    <td>{a.indicator}</td>
                    <td className="mono">{a.value}</td>
                    <td><Chip status={a.status} /></td>
                    <td className="rpt-wrap">{a.reason}</td>
                    <td className={a.state === 'Open' ? 'rpt-open' : 'rpt-muted'}>{a.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rpt-muted">No alerts in this period.</p>
          )}
        </Section>

        <Section title="Patterns" note={r.patternsHidden ? `${r.patternsHidden} more pattern days are listed in the app.` : undefined}>
          {r.patterns.length ? (
            <table className="rpt-table rpt-compact rpt-patterns">
              <colgroup><col style={{ width: '8mm' }} /><col style={{ width: '34mm' }} /><col style={{ width: '50mm' }} /><col /></colgroup>
              <thead>
                <tr><th>Day</th><th>Pattern</th><th>Linked readings</th><th>Escalation ({r.location})</th></tr>
              </thead>
              <tbody>
                {r.patterns.map((p) => (
                  <tr key={`${p.day}-${p.pattern}`}>
                    <td className="mono">{p.day}</td>
                    <td>{p.pattern}</td>
                    <td className="rpt-wrap">{p.linked}</td>
                    <td className="rpt-wrap">{p.escalation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rpt-muted">No multi-indicator patterns in this period.</p>
          )}
        </Section>

        <Section
          title="Actions taken"
          note={r.actionsHidden ? `Showing the ${r.actions.length} most recent; ${r.actionsHidden} earlier actions are in the app.` : undefined}
        >
          {r.actions.length ? (
            <table className="rpt-table rpt-compact">
              <thead>
                <tr><th>Day</th><th>Action</th><th>Source</th></tr>
              </thead>
              <tbody>
                {r.actions.map((a, i) => (
                  <tr key={i}>
                    <td className="mono">{a.day}</td>
                    <td className="rpt-wrap">{a.action}</td>
                    <td>{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rpt-muted">No actions recorded in this period.</p>
          )}
        </Section>
        <PageFooter r={r} page={2} />
      </section>
    </div>
  );
}

/** Full-screen report: A4 sheets on a gray desk, toolbar for printing and copying. */
export function ReportView() {
  const { reportDay, closeReport, data } = useApp();
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    if (reportDay !== null) {
      setOpenedAt(new Date());
      setCopied('idle');
    }
  }, [reportDay]);

  const model = useMemo(() => (reportDay === null ? null : buildReportModel(data, reportDay, openedAt)), [data, reportDay, openedAt]);

  // Report ID as the document title gives "Save as PDF" a sensible file name.
  useEffect(() => {
    if (!model) return;
    const prevTitle = document.title;
    const prevOverflow = document.body.style.overflow;
    document.title = `${APP_NAME} — ${model.id} — Crew Health Report`;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeReport();
    window.addEventListener('keydown', onKey);
    return () => {
      document.title = prevTitle;
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [model, closeReport]);

  if (!model) return null;

  const copy = async () => {
    const text = reportToText(model);
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        setCopied(ok ? 'ok' : 'fail');
      } catch {
        setCopied('fail');
      }
    }
  };

  return (
    <div className="rpt-overlay" role="dialog" aria-modal="true" aria-label={`Crew Health Report, mission day ${model.day}`}>
      <div className="rpt-toolbar">
        <button className="btn btn-ghost" onClick={closeReport}>← Back to app</button>
        <span className="rpt-toolbar-title">Crew Health Report · Day {model.day} · {model.id}</span>
        <span role="status" className="rpt-toolbar-msg">
          {copied === 'ok' ? 'Copied to clipboard.' : copied === 'fail' ? 'Copy failed — please try again.' : ''}
        </span>
        <button className="btn" onClick={copy}>Copy text</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      <ReportDocument r={model} />
    </div>
  );
}
