import { parseNumberInput } from './format';
import { readingRevisionTimestamp } from './readingRevision';
import type { Measurement } from '../brain/evaluate';

export const EXERCISE_INPUT_ERROR = 'Enter total minutes from 0 to 1,440.';

export function parseExerciseMinutes(raw: string): number | null {
  const minutes = parseNumberInput(raw);
  return minutes !== null && Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : null;
}

/** A revision is a replacement daily total; dailyValue selects it instead of adding sessions. */
export function exerciseMeasurement(input: {
  minutes: number;
  missionDay: number;
  previous?: Measurement;
  savedAt: Date;
}): Measurement {
  const { minutes, missionDay, previous, savedAt } = input;
  const now = savedAt.getTime();
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440 || !Number.isInteger(missionDay) || missionDay < 1 || !Number.isFinite(now)) {
    throw new Error('Invalid exercise log.');
  }
  const matchingPrevious = previous?.indicatorId === 'exercise' && previous.missionDay === missionDay ? previous : undefined;
  const timestamp = readingRevisionTimestamp(savedAt, matchingPrevious);
  return {
    id: `exercise-${missionDay}-${Date.parse(timestamp)}`,
    indicatorId: 'exercise',
    value: minutes,
    unit: 'min',
    timestamp,
    missionDay,
    context: ['None'],
  };
}
