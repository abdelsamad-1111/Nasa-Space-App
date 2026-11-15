import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { STATUS_COLOR, STATUS_WORD, ZONES, type Status, type ZoneId } from '../../brain/indicators';
import { BODY_LAYERS, SILHOUETTE, type BodyOrgan } from './bodyLayers';

/** Organ layer → app zone (status color source). */
const ORGAN_ZONE: Record<BodyOrgan, ZoneId> = {
  brain: 'head',
  lungs: 'lungs',
  heart: 'heart',
  liver: 'abdomen',
  stomach: 'abdomen',
  legs: 'legs',
};
const ORGANS: BodyOrgan[] = ['lungs', 'liver', 'stomach', 'heart', 'brain', 'legs'];

// Same severity rules as before: OK calm neutral (desaturated, light) with a gray rim,
// WATCH ~40 % amber tint with an amber rim, ACT/CRITICAL solid status color.
const OK_LINE = '#9A9A96';
const HIGHLIGHT_LINE = '#111111';
const SILHOUETTE_FILL = '#F1F1EF';
const DOSIMETER_OK = '#595959';

type Box = { x: number; y: number; width: number; height: number };
type Pt = { x: number; y: number };

export interface BodySvgHandle {
  /** Organ anchor in client (screen) coordinates, or null before layout. */
  anchor: (z: ZoneId) => Pt | null;
}

interface Props {
  zoneStatus: Partial<Record<ZoneId, Status | null>>;
  highlight?: ZoneId[];
  hoverZone?: ZoneId | null;
  selectedZone?: ZoneId | null;
  onHover?: (z: ZoneId | null) => void;
  onActivate?: (z: ZoneId) => void;
  onReady?: () => void;
}

const ring = (st: Status | null | undefined, hl: boolean) =>
  hl ? HIGHLIGHT_LINE : !st || st === 'OK' ? OK_LINE : STATUS_COLOR[st];
const filterId = (st: Status | null | undefined, hl: boolean) => `f-${!st ? 'OK' : st}${hl ? '-hl' : ''}`;

/** One SVG filter per status (+ highlighted variant). */
function OrganFilter({ status, hl }: { status: Status; hl: boolean }) {
  const r = ring(status, hl);
  const level = status === 'CRITICAL' ? 'ACT' : status;
  return (
    // Fixed user-space region (covers the whole drawing): bounding-box regions are unreliable for
    // layers with skew transforms (the stomach), which clipped part of the organ.
    <filter
      id={filterId(status, hl)}
      filterUnits="userSpaceOnUse"
      x={-200}
      y={0}
      width={1800}
      height={2400}
      colorInterpolationFilters="sRGB"
    >
      <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray" />
      {level === 'ACT' ? (
        <>
          {/* solid status color, keeping a faint texture so the organ shape stays readable */}
          <feComponentTransfer in="gray" result="tex">
            <feFuncR type="linear" slope="0.22" intercept="0.8" />
            <feFuncG type="linear" slope="0.22" intercept="0.8" />
            <feFuncB type="linear" slope="0.22" intercept="0.8" />
          </feComponentTransfer>
          <feFlood floodColor={STATUS_COLOR[status]} result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" result="solid" />
          <feBlend in="solid" in2="tex" mode="multiply" result="tinted" />
          <feComposite in="tinted" in2="SourceAlpha" operator="in" result="organ" />
        </>
      ) : (
        <>
          <feComponentTransfer in="gray" result="light">
            <feFuncR type="linear" slope="0.4" intercept="0.56" />
            <feFuncG type="linear" slope="0.4" intercept="0.56" />
            <feFuncB type="linear" slope="0.4" intercept="0.55" />
          </feComponentTransfer>
          {level === 'WATCH' ? (
            <>
              <feFlood floodColor={STATUS_COLOR.WATCH} floodOpacity="0.4" result="c" />
              <feComposite in="c" in2="SourceAlpha" operator="in" result="tint" />
              <feComposite in="tint" in2="light" operator="over" result="organ" />
            </>
          ) : (
            <feComposite in="light" in2="SourceAlpha" operator="in" result="organ" />
          )}
        </>
      )}
      <feMorphology in="SourceAlpha" operator="dilate" radius={hl ? 4 : 2.5} result="dil" />
      <feFlood floodColor={r} result="rc" />
      <feComposite in="rc" in2="dil" operator="in" result="rim" />
      <feMerge>
        <feMergeNode in="rim" />
        <feMergeNode in="organ" />
      </feMerge>
    </filter>
  );
}

const STATUSES: Status[] = ['OK', 'WATCH', 'ACT', 'CRITICAL'];

export const BodySvg = memo(
  forwardRef<BodySvgHandle, Props>(function BodySvg(
    { zoneStatus, highlight = [], hoverZone, selectedZone, onHover, onActivate, onReady },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const silRef = useRef<SVGPathElement>(null);
    const groupRefs = useRef<Partial<Record<BodyOrgan, SVGGElement | null>>>({});
    const [viewBox, setViewBox] = useState('0 0 1363 2312');
    const [anchors, setAnchors] = useState<Partial<Record<ZoneId, Pt>>>({});
    const [dosimeter, setDosimeter] = useState<Pt | null>(null);

    // Layout once (fixed front view): fit the silhouette, then anchors at the visual centre of
    // each organ group (getBBox), so leader lines start at the real organ.
    useLayoutEffect(() => {
      const sil = silRef.current;
      if (!sil) return;
      const t = SILHOUETTE.transform.match(/translate\(([-\d.]+),([-\d.]+)\)/)!;
      const tx = +t[1], ty = +t[2];
      const sb = sil.getBBox();
      const s: Box = { x: sb.x + tx, y: sb.y + ty, width: sb.width, height: sb.height };
      const pad = s.height * 0.015;
      setViewBox(`${(s.x - pad).toFixed(1)} ${(s.y - pad).toFixed(1)} ${(s.width + 2 * pad).toFixed(1)} ${(s.height + 2 * pad).toFixed(1)}`);

      const box = (o: BodyOrgan): Box => groupRefs.current[o]!.getBBox();
      const c = (b: Box, fx = 0.5, fy = 0.5): Pt => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
      const brain = box('brain'), lungs = box('lungs'), heart = box('heart'), liver = box('liver'), legs = box('legs');

      // Whole body: the silhouette edge on the viewer's right (astronaut's left forearm).
      const yBody = heart.y + heart.height * 0.5 + s.height * 0.2;
      let best: Pt = { x: s.x + s.width, y: yBody };
      let bx = -Infinity;
      const len = sil.getTotalLength();
      for (let l = 0; l < len; l += len / 2000) {
        const p = sil.getPointAtLength(l);
        const y = p.y + ty;
        if (Math.abs(y - yBody) < s.height * 0.012 && p.x + tx > bx) {
          bx = p.x + tx;
          best = { x: p.x + tx - 6, y };
        }
      }
      const dos = c(lungs, 0.74, 0.02); // upper left chest, just below the collarbone
      setDosimeter(dos);
      setAnchors({
        head: c(brain),
        lungs: c(lungs, 0.24, 0.5), // visual centre of the right lung (viewer's left)
        abdomen: c(liver, 0.36, 0.72),
        dosimeter: dos,
        heart: c(heart, 0.5, 0.6),
        body: best,
        legs: c(legs, 0.74, 0.42), // left thigh muscles (viewer's right)
      });
    }, []);

    useLayoutEffect(() => {
      if (anchors.head) onReady?.();
    }, [anchors, viewBox, onReady]);

    useImperativeHandle(
      ref,
      () => ({
        anchor: (z) => {
          const svg = svgRef.current;
          const a = anchors[z];
          const m = svg?.getScreenCTM();
          if (!svg || !a || !m) return null;
          const p = new DOMPoint(a.x, a.y).matrixTransform(m);
          return { x: p.x, y: p.y };
        },
      }),
      [anchors],
    );

    const temp = zoneStatus.body;
    const hl = (z: ZoneId) => highlight.includes(z);
    const dosSt = zoneStatus.dosimeter;
    const key = (e: KeyboardEvent, z: ZoneId) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate?.(z);
      }
    };

    return (
      <div className="body2d">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Front view of the human body with the brain, lungs, heart, liver, stomach and leg muscles."
        >
          <defs>
            {STATUSES.map((st) => (
              <OrganFilter key={st} status={st} hl={false} />
            ))}
            {STATUSES.map((st) => (
              <OrganFilter key={`${st}-hl`} status={st} hl />
            ))}
            {/* Organ layers never extend outside the body outline */}
            <clipPath id="body-clip">
              <path d={SILHOUETTE.d} transform={SILHOUETTE.transform} />
            </clipPath>
          </defs>

          {/* Silhouette at the back; its outline shows the whole-body temperature status */}
          <path
            ref={silRef}
            id="silhouette"
            d={SILHOUETTE.d}
            transform={SILHOUETTE.transform}
            fill={SILHOUETTE_FILL}
            stroke={ring(temp, hl('body'))}
            strokeWidth={hl('body') ? 3 : 2}
            vectorEffect="non-scaling-stroke"
          />

          {/* Organs on top, one recolorable group each */}
          <g clipPath="url(#body-clip)">
          {ORGANS.map((o) => {
            const z = ORGAN_ZONE[o];
            const st = zoneStatus[z] ?? 'OK';
            return (
              <g
                key={o}
                id={`organ-${o}`}
                ref={(el) => {
                  groupRefs.current[o] = el;
                }}
                filter={`url(#${filterId(st, hl(z))})`}
                className={st === 'CRITICAL' ? 'pulse' : undefined}
              >
                {BODY_LAYERS.filter((l) => l.organ === o).map((l) => (
                  <image key={l.source} href={l.href} x={l.x} y={l.y} width={l.width} height={l.height} transform={l.transform} />
                ))}
              </g>
            );
          })}
          </g>

          {/* Dosimeter marker on the chest */}
          {dosimeter && (
            <rect
              id="dosimeter"
              x={dosimeter.x - 20}
              y={dosimeter.y - 26}
              width={40}
              height={52}
              rx={4}
              fill={!dosSt || dosSt === 'OK' ? DOSIMETER_OK : STATUS_COLOR[dosSt]}
              stroke={hl('dosimeter') ? HIGHLIGHT_LINE : '#FFFFFF'}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Organ dots = start of each leader line */}
          {ZONES.map((z) => {
            const a = anchors[z.id];
            if (!a) return null;
            const st = zoneStatus[z.id] ?? null;
            const alert = st && st !== 'OK';
            return (
              <g
                key={z.id}
                className={`organ-dot${alert ? ` organ-dot-${st}` : ''}${hoverZone === z.id ? ' is-hover' : ''}${
                  selectedZone === z.id ? ' is-selected' : ''
                }${hl(z.id) ? ' is-linked' : ''}`}
                data-zone={z.id}
                role="button"
                tabIndex={0}
                aria-label={`${z.name}${st ? `: ${STATUS_WORD[st]}` : ''}`}
                transform={`translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`}
                onMouseEnter={() => onHover?.(z.id)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(z.id)}
                onBlur={() => onHover?.(null)}
                onClick={() => onActivate?.(z.id)}
                onKeyDown={(e) => key(e, z.id)}
              >
                <circle className="dot-hit" r={44} />
                <circle className="dot" r={16} />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }),
);
