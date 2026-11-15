import { fmtNumber } from '../../lib/format';

/** Cumulative mission dose vs career limit, e.g. "15.2 / 600 mSv". */
export function radiationValue(cumulative: number, limit: number): string {
  return `${fmtNumber(cumulative, 1)} / ${fmtNumber(limit)} mSv`;
}

export function radiationPct(cumulative: number, limit: number): number {
  return limit > 0 ? Math.min(100, (cumulative / limit) * 100) : 0;
}
