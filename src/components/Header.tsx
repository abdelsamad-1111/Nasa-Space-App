import { LOCATION_LABEL, type Location } from '../brain/indicators';
import { useApp, type Screen } from '../state/AppState';
import { fmtDate, fmtNumber } from '../lib/format';
import { Logo } from './Logo';

const NAV: { id: Screen; label: string }[] = [
  { id: 'twin', label: 'Health Twin' },
  { id: 'alerts', label: 'Alerts & Report' },
  { id: 'settings', label: 'Settings' },
  { id: 'sources', label: 'Sources' },
];

const LOCATIONS: Location[] = ['ISS', 'MOON', 'MARS'];

/** Dark space band (Earth image) = top bar + mission-day bar. Everything below stays light. */
export function Header() {
  const { screen, setScreen, startCheckIn, openAlerts, data, dispatch, view, maxDay, assistantOpen, openAssistant, closeAssistant } = useApp();
  const setLocation = (location: Location) => dispatch({ type: 'settings', settings: { ...data.settings, location } });
  const dayDate = new Date(new Date(data.missionStart).getTime() + (view.day - 1) * 86400000);

  return (
    <div className="band">
      <header className="header">
        <div className="brand">
          <Logo onDark />
          <span className="brand-sub">Astronaut Health Twin</span>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <button key={n.id} aria-current={screen === n.id ? 'page' : undefined} onClick={() => setScreen(n.id)}>
              {n.label}
              {n.id === 'alerts' && (
                <span className="badge" aria-label={`${openAlerts.length} open alerts`}>
                  {openAlerts.length.toLocaleString('en-US')}
                </span>
              )}
            </button>
          ))}
          <button
            aria-expanded={assistantOpen}
            aria-controls="capcom-panel"
            onClick={() => (assistantOpen ? closeAssistant() : openAssistant())}
          >
            Assistant
          </button>
        </nav>
        <div className="header-right">
          <div className="segmented" role="group" aria-label="Location">
            {LOCATIONS.map((l) => (
              <button key={l} aria-pressed={data.settings.location === l} onClick={() => setLocation(l)}>
                {LOCATION_LABEL[l]}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" data-region="measure" onClick={() => startCheckIn(0)}>
            Start check-in
          </button>
        </div>
      </header>
      <div className="mission-bar">
        <span className="mission-day">
          Mission day <span className="num">{fmtNumber(view.day)}</span>
          <span className="mission-of num"> of {fmtNumber(maxDay)}</span>
        </span>
        <span className="mission-sep" aria-hidden="true" />
        <span className="mission-date num">{fmtDate(dayDate)}</span>
        <span className="mission-sep" aria-hidden="true" />
        <span className="mission-loc">{LOCATION_LABEL[data.settings.location]}</span>
        <span className="mission-pill">{data.mode === 'demo' ? 'Demo mission · sample data' : 'Personal mission'}</span>
      </div>
    </div>
  );
}
