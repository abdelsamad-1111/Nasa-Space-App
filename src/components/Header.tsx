import { LOCATION_LABEL, type Location } from '../brain/indicators';
import { useApp, type Screen } from '../state/AppState';

const NAV: { id: Screen; label: string }[] = [
  { id: 'twin', label: 'Health Twin' },
  { id: 'alerts', label: 'Alerts & Report' },
  { id: 'settings', label: 'Settings' },
  { id: 'sources', label: 'Sources' },
];

const LOCATIONS: Location[] = ['ISS', 'MOON', 'MARS'];

export function Header() {
  const { screen, setScreen, startCheckIn, openAlerts, data, dispatch, assistantOpen, openAssistant, closeAssistant } = useApp();
  const setLocation = (location: Location) => dispatch({ type: 'settings', settings: { ...data.settings, location } });

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-name">VITALS-ORBIT</span>
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
  );
}
