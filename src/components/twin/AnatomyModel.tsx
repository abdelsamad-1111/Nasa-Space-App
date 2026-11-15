import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import '../../lib/modelViewerConfig';
import '@google/model-viewer';
import { STATUS_WORD, ZONES, type Status, type ZoneId } from '../../brain/indicators';
import { ANATOMY_ANCHORS } from './anatomyAnchors';
import { materialAppearance } from './anatomyAppearance';

/** Main screen camera distance relative to model-viewer's auto framing (< 1 = larger body). */
const BODY_ZOOM = 0.92;
// model-viewer caches failed URLs too. Reuse the recovered URL across resets and dialogs.
let modelRevision = 0;

interface MVMaterial {
  name: string;
  pbrMetallicRoughness: {
    setBaseColorFactor: (rgba: [number, number, number, number]) => void;
    setRoughnessFactor: (value: number) => void;
  };
  setAlphaMode: (mode: 'OPAQUE' | 'BLEND') => void;
  getAlphaMode: () => 'OPAQUE' | 'BLEND' | 'MASK';
}
interface MVElement extends HTMLElement {
  model?: { materials: MVMaterial[] };
  getCameraOrbit?: () => { radius: number };
}

export interface AnatomyModelHandle {
  hotspot: (z: ZoneId) => HTMLElement | null;
}

interface Props {
  zoneStatus: Partial<Record<ZoneId, Status | null>>;
  /** Zones emphasized by the pattern banner alongside selection and hover. */
  highlight?: ZoneId[];
  /** Separate "Explore 3D" view: camera controls on, no organ dots. Main screen: fixed front view. */
  interactive?: boolean;
  hoverZone?: ZoneId | null;
  selectedZone?: ZoneId | null;
  onHover?: (z: ZoneId | null) => void;
  onActivate?: (z: ZoneId) => void;
  onReady?: () => void;
}

export const AnatomyModel = memo(
  forwardRef<AnatomyModelHandle, Props>(function AnatomyModel(
    { zoneStatus, highlight = [], interactive = false, hoverZone, selectedZone, onHover, onActivate, onReady },
    ref,
  ) {
    const mvRef = useRef<MVElement>(null);
    const spotRefs = useRef<Partial<Record<ZoneId, HTMLButtonElement | null>>>({});
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(() => modelRevision);
    const framedElement = useRef<MVElement | null>(null);

    useImperativeHandle(ref, () => ({ hotspot: (z) => spotRefs.current[z] ?? null }));

    const highlightKey = highlight.join(',');
    const paint = useCallback(() => {
      const materials = mvRef.current?.model?.materials;
      if (!materials) return;
      const focusedZones = new Set<ZoneId>(highlightKey ? highlightKey.split(',') as ZoneId[] : []);
      if (selectedZone) focusedZones.add(selectedZone);
      if (hoverZone) focusedZones.add(hoverZone);
      for (const m of materials) {
        const style = materialAppearance(m.name, { zoneStatus, focusedZones, interactive });
        if (!style) continue;
        const alphaMode = style.color[3] < 1 ? 'BLEND' : 'OPAQUE';
        if (m.getAlphaMode() !== alphaMode) m.setAlphaMode(alphaMode);
        m.pbrMetallicRoughness.setBaseColorFactor(style.color);
        m.pbrMetallicRoughness.setRoughnessFactor(style.roughness);
      }
    }, [zoneStatus, highlightKey, selectedZone, hoverZone, interactive]);

    useEffect(() => {
      if (loaded) paint();
    }, [loaded, paint]);

    useEffect(() => {
      const mv = mvRef.current;
      if (!mv) return;
      const onLoad = () => {
        if (!interactive && framedElement.current !== mv && mv.getCameraOrbit) {
          // Pin the auto-framed distance too: angles, distance and field of view are all fixed.
          // Slightly closer than the auto framing so the body is the visual centre of the stage.
          const r = mv.getCameraOrbit().radius * BODY_ZOOM;
          if (r > 0) {
            const v = `0deg 90deg ${r.toFixed(4)}m`;
            mv.setAttribute('camera-orbit', v);
            mv.setAttribute('min-camera-orbit', v);
            mv.setAttribute('max-camera-orbit', v);
            framedElement.current = mv;
          }
        }
        setLoaded(true);
        setFailed(false);
        onReady?.();
      };
      const onError = () => setFailed(true);
      // Fires when model-viewer re-frames (e.g. after a resize): hotspots have moved on screen.
      const onView = () => onReady?.();
      mv.addEventListener('load', onLoad);
      mv.addEventListener('error', onError);
      mv.addEventListener('camera-change', onView);
      if (mv.model) onLoad();
      return () => {
        mv.removeEventListener('load', onLoad);
        mv.removeEventListener('error', onError);
        mv.removeEventListener('camera-change', onView);
      };
    }, [onReady, interactive, attempt]);

    const cameraProps = interactive
      ? {
          'camera-controls': '',
          'disable-pan': '',
          'min-field-of-view': '12deg',
          'max-field-of-view': '32deg',
          'field-of-view': '30deg',
        }
      : {
          // Main screen: fully locked front view — no rotation (horizontal or vertical), no zoom, no pan.
          'disable-tap': '',
          'disable-zoom': '',
          'disable-pan': '',
          'min-camera-orbit': '0deg 90deg auto',
          'max-camera-orbit': '0deg 90deg auto',
          'field-of-view': '30deg',
          'min-field-of-view': '30deg',
          'max-field-of-view': '30deg',
        };

    return (
      <div className={`body3d${loaded ? ' is-loaded' : ' is-loading'}${interactive ? ' is-interactive' : ' is-locked'}`}>
        <model-viewer
          key={attempt}
          ref={mvRef}
          src={`/models/anatomy.glb?v=organs-2&attempt=${attempt}`}
          alt="3D human anatomy model: transparent skin with brain, lungs, heart, liver, stomach, leg bones and leg muscles inside."
          {...cameraProps}
          interaction-prompt="none"
          camera-orbit="0deg 90deg auto"
          shadow-intensity="0"
          exposure="0.95"
          environment-image="legacy"
          style={{ width: '100%', height: '100%', background: 'transparent' }}
        >
          {!interactive &&
            ZONES.map((z) => {
              const st = zoneStatus[z.id] ?? null;
              const alert = st && st !== 'OK';
              return (
                <button
                  key={z.id}
                  ref={(el) => {
                    spotRefs.current[z.id] = el;
                  }}
                  slot={`hotspot-${z.id}`}
                  data-position={ANATOMY_ANCHORS[z.id]}
                  className={`organ-dot${alert ? ` organ-dot-${st}` : ''}${hoverZone === z.id ? ' is-hover' : ''}${
                    selectedZone === z.id ? ' is-selected' : ''
                  }${highlight.includes(z.id) ? ' is-linked' : ''}`}
                  aria-label={`${z.name}${st ? `: ${STATUS_WORD[st]}` : ''}`}
                  onMouseEnter={() => onHover?.(z.id)}
                  onMouseLeave={() => onHover?.(null)}
                  onFocus={() => onHover?.(z.id)}
                  onBlur={() => onHover?.(null)}
                  onClick={() => onActivate?.(z.id)}
                >
                  <span className={st === 'CRITICAL' ? 'pulse' : undefined} />
                </button>
              );
            })}
        </model-viewer>
        {!loaded && !failed && <div className="body3d-msg muted" role="status">Loading 3D anatomy…</div>}
        {failed && (
          <div className="body3d-error" role="alert">
            <p>The 3D anatomy could not be loaded. Your readings are still available in the panels.</p>
            <button className="btn" onClick={() => {
              modelRevision += 1;
              setLoaded(false);
              setFailed(false);
              setAttempt(modelRevision);
            }}>Retry 3D model</button>
          </div>
        )}
      </div>
    );
  }),
);
