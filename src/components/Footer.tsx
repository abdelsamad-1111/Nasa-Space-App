import { FOOTER_TEXT } from '../brain/indicators';
import { APP_NAME } from '../lib/brand';
import { AssistantLauncher } from './assistant/AssistantLauncher';

/**
 * Slim bar pinned to the bottom of the screen. The assistant launcher sits at its right end,
 * so it is always bottom-right but never covers page controls (the bar reserves its own space).
 */
export function Footer() {
  return (
    <footer className="footer">
      <strong>{FOOTER_TEXT}</strong>
      <span className="footer-right">
        <span className="footer-credit">{APP_NAME} · NASA Space Apps Challenge 2026</span>
        <AssistantLauncher />
      </span>
    </footer>
  );
}
