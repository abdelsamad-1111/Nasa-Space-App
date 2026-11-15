import type { ZoneId } from '../../brain/indicators';

export const BODY_APPEARANCES = ['male', 'female'] as const;
export type BodyAppearance = (typeof BODY_APPEARANCES)[number];

/** Main-screen body illustration (transparent PNG, front view). */
export const BODY_IMAGE = { src: '/assets/body.png', width: 800, height: 1200 } as const;

/**
 * Status halo / leader-line origin per zone, in % of the image box
 * (x, y = centre; w = % of image width, h = % of image height).
 * Calibrated once against a 5 % grid on body.png. Within each card column the
 * points run top-to-bottom in card order, so leader lines cannot cross.
 */
export interface ZoneSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ZONE_SPOTS: Record<ZoneId, ZoneSpot> = {
  // Left column: head → lungs → abdomen
  head: { x: 50, y: 3.8, w: 18, h: 9 },
  lungs: { x: 43, y: 25, w: 20, h: 12 },
  abdomen: { x: 48, y: 37, w: 24, h: 11 },
  // Right column: dosimeter → heart → whole body → legs
  dosimeter: { x: 58, y: 19.5, w: 9, h: 5 },
  heart: { x: 53.5, y: 25.5, w: 14, h: 9 },
  body: { x: 62, y: 44, w: 0, h: 0 }, // whole body: outline glow; this is only the line origin on the waist outline
  legs: { x: 58, y: 58, w: 16, h: 18 },
};

/** Each illustration has its own organ coordinates and whole-body forecast bounds. */
export const BODY_IMAGES = {
  male: {
    ...BODY_IMAGE,
    label: 'Male',
    spots: ZONE_SPOTS,
    outline: { x: 18, y: 0.3, w: 64, h: 99.4 },
  },
  female: {
    src: '/assets/body-female.png', width: 1024, height: 1536,
    label: 'Female',
    // Calibrated against the generated female illustration, in the same 2:3 image box.
    spots: {
      head: { x: 50, y: 4.6, w: 17, h: 9 },
      lungs: { x: 43.2, y: 24.8, w: 20, h: 13 },
      abdomen: { x: 49, y: 38.5, w: 25, h: 13 },
      dosimeter: { x: 58, y: 19.4, w: 9, h: 5 },
      heart: { x: 53.5, y: 26.4, w: 14, h: 10 },
      body: { x: 64, y: 44, w: 0, h: 0 },
      legs: { x: 59.5, y: 58, w: 17, h: 19 },
    } satisfies Record<ZoneId, ZoneSpot>,
    outline: { x: 19, y: 0.7, w: 62, h: 98.4 },
  },
} as const;

export const FEMALE_BODY_CREDIT = {
  title: 'Female body illustration (main screen)',
  file: 'public/assets/body-female.png',
  creator: 'Generated with OpenAI Image Generation for this project, using the supplied male illustration as a style reference',
  license: 'AI-generated project asset; no third-party stock license recorded',
  changes: 'Generated with alpha transparency at 1024 × 1536 px. Image-specific status halos, forecast outlines and leader lines are drawn by the app.',
} as const;
