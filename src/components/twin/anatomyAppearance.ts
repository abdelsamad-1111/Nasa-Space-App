import { STATUS_COLOR, type Status, type ZoneId } from '../../brain/indicators';

type Rgb = [number, number, number];

// Restrained neutral shades separate adjacent organs without encoding health status.
const ORGANS: Record<string, { zone: ZoneId; color: string }> = {
  brain: { zone: 'head', color: '#BDBEC2' },
  heart: { zone: 'heart', color: '#B7ADAB' },
  lungs: { zone: 'lungs', color: '#B2C0C8' },
  lung_airways: { zone: 'lungs', color: '#808D95' },
  liver: { zone: 'abdomen', color: '#A6A098' },
  stomach: { zone: 'abdomen', color: '#CEC3B6' },
  abdomen: { zone: 'abdomen', color: '#BBB4AA' },
  legs_muscle: { zone: 'legs', color: '#B7BCB4' },
  dosimeter: { zone: 'dosimeter', color: '#535C60' },
};

const OUTLINES: Record<string, ZoneId> = {
  brain_outline: 'head',
  heart_outline: 'heart',
  lungs_outline: 'lungs',
  abdomen_outline: 'abdomen',
  liver_outline: 'abdomen',
  stomach_outline: 'abdomen',
  legs_muscle_outline: 'legs',
  skin_outline: 'body',
};

interface AppearanceInput {
  zoneStatus: Partial<Record<ZoneId, Status | null>>;
  focusedZones: ReadonlySet<ZoneId>;
  interactive: boolean;
}

export interface MaterialAppearance {
  color: [number, number, number, number];
  roughness: number;
}

const rgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};

const mix = (a: Rgb, b: Rgb, amount: number): Rgb =>
  a.map((v, i) => v * (1 - amount) + b[i] * amount) as Rgb;

// glTF and model-viewer material arrays use linear RGB; UI tokens use sRGB.
const linear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const appearance = (color: Rgb, alpha = 1, roughness = 0.72): MaterialAppearance => ({
  color: [...color.map(linear), alpha] as MaterialAppearance['color'],
  roughness,
});

export function materialAppearance(name: string, input: AppearanceInput): MaterialAppearance | null {
  const { zoneStatus, focusedZones, interactive } = input;
  if (name === 'skin') {
    const bodyStatus = zoneStatus.body;
    const bodyAlert = interactive && bodyStatus && bodyStatus !== 'OK';
    return appearance(rgb(bodyAlert ? STATUS_COLOR[bodyStatus] : '#B5C0C5'), bodyAlert ? 0.09 : interactive ? 0.035 : 0.025, 0.9);
  }
  if (name === 'legs_bone') return appearance(rgb('#D3D0C6'), 1, 0.85);

  const outlineZone = OUTLINES[name];
  if (outlineZone) {
    const status = zoneStatus[outlineZone];
    const color = status && status !== 'OK' ? STATUS_COLOR[status] : '#78838A';
    const focused = focusedZones.has(outlineZone);
    // These ribbons are front projections, not anatomical surfaces. Hide them when rotating.
    return appearance(rgb(focused && (!status || status === 'OK') ? '#27343D' : color), interactive ? 0 : 1);
  }

  const organ = ORGANS[name];
  if (!organ) return null;
  const status = zoneStatus[organ.zone];
  const focused = focusedZones.has(organ.zone);
  const hasFocus = focusedZones.size > 0 && !focusedZones.has('body');
  let color = rgb(organ.color);
  if (status && status !== 'OK') {
    // Preserve every alert, including alerts outside the selected organ.
    color = status === 'WATCH' && name !== 'heart' && name !== 'dosimeter'
      ? mix(color, rgb(STATUS_COLOR.WATCH), 0.6)
      : rgb(STATUS_COLOR[status]);
  } else if (focused) {
    color = mix(color, rgb('#536572'), 0.18);
  } else if (hasFocus) {
    color = mix(color, rgb('#F4F4F2'), 0.3);
  }
  return appearance(color, 1, focused ? 0.5 : 0.72);
}
