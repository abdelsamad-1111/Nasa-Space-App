import type { Measurement } from '../brain/evaluate';

/** Preserve measurement order when an existing demo reading is later than the real clock. */
export function readingRevisionTimestamp(recordedAt: Date, previous?: Measurement): string {
  const time = recordedAt.getTime();
  if (!Number.isFinite(time)) throw new Error('Invalid measurement time.');
  const previousTime = previous ? Date.parse(previous.timestamp) : NaN;
  return new Date(Number.isFinite(previousTime) ? Math.max(time, previousTime + 1) : time).toISOString();
}
