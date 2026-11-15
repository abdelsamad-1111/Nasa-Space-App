import { useState } from 'react';
import { BASELINE_INDICATORS, INDICATORS, LOCATION_LABEL, RADIATION_LIMIT_NOTE, type IndicatorId, type Location } from '../brain/indicators';
import { isBp, type Settings } from '../brain/evaluate';
import { useApp } from '../state/AppState';
import { fmtNumber, parseNumberInput } from '../lib/format';
import { emptyState } from '../data/storage';
import './settings.css';

type Draft = Record<string, string>;

function toDraft(s: Settings): Draft {
  const d: Draft = { name: s.name, limit: String(s.careerRadiationLimit) };
  for (const id of BASELINE_INDICATORS) {
    const v = s.baselines[id];
    if (isBp(v)) {
      d['bp.sys'] = String(v.sys);
      d['bp.dia'] = String(v.dia);
    } else d[id] = v === undefined ? '' : String(v);
  }
  return d;
}

const FIELDS: { key: string; label: string; id: IndicatorId }[] = [
  { key: 'bp.sys', label: 'Blood pressure — systolic (mmHg)', id: 'bp' },
  { key: 'bp.dia', label: 'Blood pressure — diastolic (mmHg)', id: 'bp' },
  ...BASELINE_INDICATORS.filter((i) => i !== 'bp').map((id) => ({
    key: id,
    label: `${INDICATORS[id].name} (${INDICATORS[id].unit})`,
    id,
  })),
];

export function SettingsScreen() {
  const { data, dispatch, loadDemo, resetAll } = useApp();
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.settings));
  const location = data.settings.location;
  const setLocation = (l: Location) => dispatch({ type: 'settings', settings: { ...data.settings, location: l } });
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<null | 'demo' | 'reset'>(null);

  const errors: Record<string, string> = {};
  for (const f of FIELDS) {
    const raw = draft[f.key] ?? '';
    if (raw.trim() === '') continue;
    const n = parseNumberInput(raw);
    const ind = INDICATORS[f.id];
    if (n === null || n < ind.inputMin || n > ind.inputMax)
      errors[f.key] = `Enter a number from ${fmtNumber(ind.inputMin)} to ${fmtNumber(ind.inputMax)}.`;
  }
  const limitN = parseNumberInput(draft.limit ?? '');
  if (limitN === null || limitN <= 0) errors.limit = 'Enter a positive number of mSv.';
  if (!draft.name?.trim()) errors.name = 'Enter a name.';
  const hasErrors = Object.keys(errors).length > 0;

  const update = (k: string, v: string) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const save = () => {
    if (hasErrors) return;
    const baselines: Settings['baselines'] = {};
    const sys = parseNumberInput(draft['bp.sys'] ?? '');
    const dia = parseNumberInput(draft['bp.dia'] ?? '');
    if (sys !== null && dia !== null) baselines.bp = { sys, dia };
    for (const id of BASELINE_INDICATORS) {
      if (id === 'bp') continue;
      const n = parseNumberInput(draft[id] ?? '');
      if (n !== null) baselines[id] = n;
    }
    dispatch({
      type: 'settings',
      settings: { name: draft.name.trim(), location, baselines, careerRadiationLimit: limitN! },
    });
    setSaved(true);
  };

  return (
    <main className="screen settings">
      <div className="screen-title">
        <h1>Settings</h1>
        <span className="muted">Saved on this device only.</span>
      </div>

      <section className="section settings-grid">
        <div className="settings-col">
          <div className="section-head"><h2>Astronaut</h2></div>
          <div className="field">
            <label htmlFor="s-name">Name</label>
            <input id="s-name" className="input" value={draft.name} onChange={(e) => update('name', e.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <span className="label" id="s-loc">Location (applies immediately)</span>
            <div className="segmented" role="group" aria-labelledby="s-loc">
              {(['ISS', 'MOON', 'MARS'] as Location[]).map((l) => (
                <button key={l} aria-pressed={location === l} onClick={() => setLocation(l)}>
                  {LOCATION_LABEL[l]}
                </button>
              ))}
            </div>
          </div>

          <div className="section-head" style={{ marginTop: 32 }}><h2>Radiation</h2></div>
          <div className="field">
            <label htmlFor="s-limit">Career radiation limit (mSv)</label>
            <input id="s-limit" className="input" inputMode="decimal" value={draft.limit} onChange={(e) => update('limit', e.target.value)} aria-invalid={!!errors.limit} aria-describedby="s-limit-note" />
            <span className="hint" id="s-limit-note">Default 600 mSv — {RADIATION_LIMIT_NOTE}.</span>
            {errors.limit && <span className="field-error">{errors.limit}</span>}
          </div>
        </div>

        <div className="settings-col settings-col-wide">
          <div className="section-head">
            <h2>Pre-flight baselines</h2>
            <span className="hint">A reading more than 15% away from your baseline is marked “Unusual for you”.</span>
          </div>
          <div className="baseline-grid">
            {FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label htmlFor={`s-${f.key}`}>{f.label}</label>
                <input
                  id={`s-${f.key}`}
                  className="input"
                  inputMode="decimal"
                  value={draft[f.key] ?? ''}
                  onChange={(e) => update(f.key, e.target.value)}
                  aria-invalid={!!errors[f.key]}
                />
                {errors[f.key] && <span className="field-error">{errors[f.key]}</span>}
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 12 }}>Radiation has no personal baseline: it is compared with your own 7-day average.</p>
        </div>
      </section>

      <div className="section settings-actions">
        <button className="btn btn-primary" onClick={save} disabled={hasErrors}>Save settings</button>
        <span role="status" className="muted">{saved ? 'Settings saved.' : ''}</span>
      </div>

      <section className="section">
        <div className="section-head"><h2>Data</h2></div>
        <div className="data-actions">
          <div>
            <button className="btn" onClick={() => setConfirm('demo')}>Load demo data</button>
            <p className="hint">30-day ISS mission for Astronaut A. Rahman. Replaces all current data.</p>
          </div>
          <div>
            <button className="btn" onClick={() => setConfirm('reset')}>Reset all data</button>
            <p className="hint">Deletes all measurements, alerts and settings on this device.</p>
          </div>
        </div>
        {confirm && (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-text">
            <p id="confirm-text">
              {confirm === 'demo'
                ? 'Load the demo mission? Your current data will be replaced.'
                : 'Reset all data? This cannot be undone.'}
            </p>
            <div className="confirm-buttons">
              <button
                className="btn btn-primary"
                autoFocus
                onClick={() => {
                  if (confirm === 'demo') loadDemo();
                  else {
                    resetAll();
                    setDraft(toDraft(emptyState().settings));
                  }
                  setConfirm(null);
                }}
              >
                {confirm === 'demo' ? 'Load demo data' : 'Reset all data'}
              </button>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
