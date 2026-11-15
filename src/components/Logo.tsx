import { lazy, Suspense } from 'react';
import { APP_WORDMARK } from '../lib/brand';
import { AstronautMark } from './AstronautMark';

function MascotFallback() {
  return <span className="brand-mascot" aria-hidden="true"><AstronautMark size={48} onDark /></span>;
}

const AstronautMascot = lazy(() => import('./AstronautMascot')
  .then((module) => ({ default: module.AstronautMascot }))
  .catch(() => ({ default: MascotFallback })));

export const LOGO_ORANGE = '#FF4F00';

/** `onDark`: white lines (for the space band); otherwise graphite lines (light pages, print). */
export function LogoMark({ onDark = false, size = 40 }: { onDark?: boolean; size?: number }) {
  return <AstronautMark size={size} onDark={onDark} className="logo-mark" />;
}

export function Logo({ onDark = false, animated = false }: { onDark?: boolean; animated?: boolean }) {
  return (
    <span className={`logo${onDark ? ' logo-on-dark' : ''}`}>
      {animated ? <Suspense fallback={<MascotFallback />}>
        <AstronautMascot />
      </Suspense> : <LogoMark onDark={onDark} />}
      <span className="brand-copy">
        <span className="brand-name">{APP_WORDMARK}{' '}<span className="brand-ai">AI</span></span>
        <span className="brand-sub">Astronaut health companion</span>
      </span>
    </span>
  );
}
