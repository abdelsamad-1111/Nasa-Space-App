import { FOOTER_TEXT } from '../brain/indicators';
import { APP_NAME } from '../lib/brand';

export function Footer() {
  return (
    <footer className="footer">
      <strong>{FOOTER_TEXT}</strong>
      <span>{APP_NAME} · NASA Space Apps Challenge 2026</span>
    </footer>
  );
}
