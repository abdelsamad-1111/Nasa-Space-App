import type { AssessmentSummary } from '../brain/evaluate';
import { StatusBadge } from './StatusBadge';
import { fmtNumber } from '../lib/format';

interface Props {
  summary: AssessmentSummary;
  size?: number;
  compact?: boolean;
}

/** A normal observed reading is not an all-clear for unmeasured indicators. */
export function AssessmentStatus({ summary, size = 14, compact = false }: Props) {
  const hasAlert = summary.status !== null && summary.status !== 'OK';
  return (
    <span className={`assessment-status${compact ? ' assessment-compact' : ''}`}>
      {summary.status !== null && (summary.complete || hasAlert)
        ? <StatusBadge status={summary.status} size={size} />
        : <span className="assessment-state">{summary.measured === 0 ? 'No readings' : 'Incomplete assessment'}</span>}
      {hasAlert && !summary.complete && <span className="assessment-state">Incomplete assessment</span>}
      <span className="assessment-coverage">
        {fmtNumber(summary.measured)} of {fmtNumber(summary.total)} measured
        {!compact && summary.missing > 0 && ` · ${fmtNumber(summary.missing)} not measured`}
      </span>
    </span>
  );
}
