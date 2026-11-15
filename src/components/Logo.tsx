/** VITALS-ORBIT mark: one heartbeat spike inside a thin orbit ellipse (our own design, no agency insignia). */
export const LOGO_ORANGE = '#FF4F00';

/** `onDark`: white lines (for the space band); otherwise graphite lines (light pages, print). */
export function LogoMark({ onDark = false, size = 40 }: { onDark?: boolean; size?: number }) {
  const line = onDark ? '#FFFFFF' : '#111111';
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 50 30" aria-hidden="true" className="logo-mark">
      <ellipse cx="25" cy="15" rx="23" ry="9.5" transform="rotate(-12 25 15)" fill="none" stroke={line} strokeWidth="1.2" opacity="0.9" />
      <path d="M3 15.5H17" fill="none" stroke={line} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 15.5l2.6-5 3.2 11.5 3.4-18 2.8 11.5" fill="none" stroke={LOGO_ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 15.5H47" fill="none" stroke={line} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="logo">
      <LogoMark onDark={onDark} />
      <span className="brand-name">VITALS-ORBIT</span>
    </span>
  );
}
