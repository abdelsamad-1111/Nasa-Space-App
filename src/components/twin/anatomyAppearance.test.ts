import { describe, expect, it } from 'vitest';
import { materialAppearance } from './anatomyAppearance';
import type { Status, ZoneId } from '../../brain/indicators';

const view = (zoneStatus: Partial<Record<ZoneId, Status | null>> = {}, focus: ZoneId[] = [], interactive = false) => ({
  zoneStatus, focusedZones: new Set(focus), interactive,
});

describe('Anatomy health and focus rendering', () => {
  it('keeps a critical organ fully visible and the same red when another organ is selected', () => {
    const normal = materialAppearance('heart', view({ heart: 'CRITICAL' }));
    const focusedElsewhere = materialAppearance('heart', view({ heart: 'CRITICAL' }, ['lungs']));
    expect(focusedElsewhere?.color).toEqual(normal?.color);
    expect(focusedElsewhere?.color[3]).toBe(1);
    expect(focusedElsewhere!.color[0]).toBeGreaterThan(focusedElsewhere!.color[1]);
  });

  it('keeps Watch alerts visible outside both selection and pattern focus', () => {
    const normal = materialAppearance('lungs', view({ lungs: 'WATCH' }));
    expect(materialAppearance('lungs', view({ lungs: 'WATCH' }, ['heart', 'head']))?.color).toEqual(normal?.color);
  });

  it('emphasizes the actual organ and restores its appearance when focus is cleared', () => {
    const normal = materialAppearance('lungs', view({ lungs: 'OK' }));
    const selected = materialAppearance('lungs', view({ lungs: 'OK' }, ['lungs']));
    const other = materialAppearance('lungs', view({ lungs: 'OK' }, ['heart']));
    expect(selected?.color).not.toEqual(normal?.color);
    expect(other?.color).not.toEqual(selected?.color);
    expect(materialAppearance('lungs', view({ lungs: 'OK' }))?.color).toEqual(normal?.color);
    expect(materialAppearance('lungs', view({ lungs: 'OK' }, ['body']))?.color).toEqual(normal?.color);
  });

  it('separates liver and stomach at rest but gives both the abdomen alert', () => {
    expect(materialAppearance('liver', view())?.color).not.toEqual(materialAppearance('stomach', view())?.color);
    expect(materialAppearance('liver', view({ abdomen: 'ACT' }))?.color)
      .toEqual(materialAppearance('stomach', view({ abdomen: 'ACT' }))?.color);
  });

  it('removes projected outlines from the rotatable view without obscuring organ surfaces', () => {
    expect(materialAppearance('skin_outline', view({}, [], true))?.color[3]).toBe(0);
    expect(materialAppearance('lungs', view({}, [], true))?.color[3]).toBe(1);
    expect(materialAppearance('skin_outline', view({ body: 'CRITICAL' }))?.color[3]).toBe(1);
    expect(materialAppearance('skin', view())!.color[3]).toBeLessThan(0.05);
  });

  it('keeps a whole-body temperature alert visible when projected outlines are hidden', () => {
    const normal = materialAppearance('skin', view({}, [], true));
    const alert = materialAppearance('skin', view({ body: 'CRITICAL' }, ['lungs'], true));
    expect(alert!.color[0]).toBeGreaterThan(alert!.color[1]);
    expect(alert!.color[3]).toBeGreaterThan(normal!.color[3]);
    expect(alert!.color[3]).toBeLessThan(0.12);
  });
});
