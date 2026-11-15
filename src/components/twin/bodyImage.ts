import type { ZoneId } from '../../brain/indicators';

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
