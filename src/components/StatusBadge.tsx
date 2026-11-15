import { STATUS_COLOR, STATUS_WORD, type Status } from '../brain/indicators';

/** Status shape: OK circle, WATCH triangle, ACT square, CRITICAL octagon. Never color alone. */
export function StatusIcon({ status, size = 12 }: { status: Status; size?: number }) {
  const c = STATUS_COLOR[status];
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden="true" className={status === 'CRITICAL' ? 'pulse' : undefined}>
      {status === 'OK' && <circle cx="6" cy="6" r="5" fill={c} />}
      {status === 'WATCH' && <polygon points="6,0.8 11.4,11 0.6,11" fill={c} />}
      {status === 'ACT' && <rect x="1" y="1" width="10" height="10" fill={c} />}
      {status === 'CRITICAL' && <polygon points="3.6,0.5 8.4,0.5 11.5,3.6 11.5,8.4 8.4,11.5 3.6,11.5 0.5,8.4 0.5,3.6" fill={c} />}
      {status !== 'OK' && (
        <g fill="#fff">
          <rect x="5.25" y={status === 'WATCH' ? 4.2 : 3} width="1.5" height={status === 'WATCH' ? 3.6 : 4} />
          <rect x="5.25" y={status === 'WATCH' ? 8.6 : 7.8} width="1.5" height="1.4" />
        </g>
      )}
    </svg>
  );
}

export function StatusBadge({ status, size, label }: { status: Status; size?: number; label?: string }) {
  return (
    <span className={`status status-${status}`}>
      <StatusIcon status={status} size={size} />
      <span>{label ?? STATUS_WORD[status]}</span>
    </span>
  );
}

export function StatusLegend() {
  return (
    <p className="legend hint">
      {(['OK', 'WATCH', 'ACT', 'CRITICAL'] as Status[]).map((s) => (
        <span key={s} className="legend-item">
          <StatusIcon status={s} size={10} /> {STATUS_WORD[s]}
        </span>
      ))}
    </p>
  );
}
