import { useApp } from '../../state/AppState';
import { AstronautMark } from '../AstronautMark';
import { APP_NAME } from '../../lib/brand';

/**
 * Floating launcher, bottom-right on every screen. Hidden during the check-in / exercise flow,
 * the report view and while the assistant panel is open (the panel then covers this corner).
 */
export function AssistantLauncher() {
  const { screen, assistantOpen, openAssistant, reportDay } = useApp();
  if (assistantOpen || reportDay !== null || screen === 'checkin' || screen === 'exercise') return null;
  return (
    <button
      type="button"
      className="assistant-fab"
      aria-label={`Ask ${APP_NAME}`}
      aria-controls="capcom-panel"
      aria-expanded={false}
      onClick={() => openAssistant(true)}
    >
      <AstronautMark size={22} />
      <span className="assistant-fab-text">Ask {APP_NAME}</span>
    </button>
  );
}
