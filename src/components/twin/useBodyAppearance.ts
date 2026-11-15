import { useCallback, useState } from 'react';
import type { BodyAppearance } from './bodyImage';

const STORAGE_KEY = 'astro-health-ai.body-appearance';
const isBodyAppearance = (value: unknown): value is BodyAppearance => value === 'male' || value === 'female';

function initialAppearance(settings: object): BodyAppearance {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isBodyAppearance(saved)) return saved;
  } catch {
    // The display preference still works when browser storage is unavailable.
  }
  return 'sex' in settings && isBodyAppearance(settings.sex) ? settings.sex : 'male';
}

/** A display preference only; never updates crew settings or health data. */
export function useBodyAppearance(settings: object) {
  const [appearance, setAppearance] = useState<BodyAppearance>(() => initialAppearance(settings));
  const chooseAppearance = useCallback((next: BodyAppearance) => {
    setAppearance(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Keep the selected body visible even if the preference cannot be saved.
    }
  }, []);
  return [appearance, chooseAppearance] as const;
}
