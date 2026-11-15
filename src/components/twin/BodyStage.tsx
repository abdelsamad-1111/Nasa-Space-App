import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { STATUS_COLOR, ZONES, type MetricId, type Status, type ZoneId } from '../../brain/indicators';
import { useApp } from '../../state/AppState';
import { Callout, zoneLead, zoneStatus } from './Callout';
import type { AnatomyModelHandle } from './AnatomyModel';

// three.js + model-viewer are large: load them in their own chunk.
const AnatomyModel = lazy(() => import('./AnatomyModel').then((m) => ({ default: m.AnatomyModel })));

interface Props {
  selected: MetricId;
  /** Zones linked to the active pattern banner (highlighted). */
  highlight: ZoneId[];
  hoverZone: ZoneId | null;
  onHover: (z: ZoneId | null) => void;
  onOpen: (id: MetricId) => void;
}

const QUIET = '#9A9A96';
const LEAD = 12; // short horizontal run out of the organ dot (px)
const SIDES = ['left', 'right'] as const;

/**
 * Leader path (elbow style): organ dot → short horizontal → one 45° segment →
 * horizontal into the card edge. dir = -1 when the card is left of the organ, +1 when right.
 * If the 45° segment would not fit before the card, the bend is moved next to the dot.
 */
export function leaderPath(x0: number, y0: number, xCard: number, yCard: number, dir: -1 | 1): string {
  const dy = Math.abs(yCard - y0);
  const room = dir * (xCard - x0) - 8; // keep at least 8 px of straight line into the card
  const lead = Math.max(0, Math.min(LEAD, room - dy));
  const bend = x0 + dir * lead;
  const diagEnd = bend + dir * Math.min(dy, Math.max(0, room - lead));
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}H${bend.toFixed(1)}L${diagEnd.toFixed(1)} ${yCard.toFixed(1)}H${xCard.toFixed(1)}`;
}

/** Pool-adjacent-violators: least-squares non-decreasing fit of `d`. */
function isotonic(d: number[]): number[] {
  const blocks: { sum: number; n: number }[] = [];
  for (const v of d) {
    blocks.push({ sum: v, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.sum / a.n <= b.sum / b.n) break;
      a.sum += b.sum;
      a.n += b.n;
      blocks.pop();
    }
  }
  return blocks.flatMap((b) => Array(b.n).fill(b.sum / b.n));
}

export function BodyStage({ selected, highlight, hoverZone, onHover, onOpen }: Props) {
  const { view, data } = useApp();
  const stageRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<Partial<Record<'left' | 'right', HTMLDivElement | null>>>({});
  const modelRef = useRef<AnatomyModelHandle>(null);
  const cardRefs = useRef<Partial<Record<ZoneId, HTMLDivElement | null>>>({});
  const pathRefs = useRef<Partial<Record<ZoneId, SVGPathElement | null>>>({});
  const frame = useRef(0);
  const placed = useRef(false);

  const statuses = useMemo(() => {
    const out: Partial<Record<ZoneId, Status | null>> = {};
    for (const z of ZONES) out[z.id] = zoneStatus(z, view.metrics);
    return out;
  }, [view.metrics]);

  const selectedZone = ZONES.find((z) => z.indicators.includes(selected))?.id ?? null;

  /** Organ dot centre relative to the stage, or null before the model is ready. */
  const organPoint = (z: ZoneId, s: DOMRect) => {
    const spot = modelRef.current?.hotspot(z);
    if (!spot) return null;
    const r = spot.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
  };

  /**
   * Place the cards of each column as close as possible to their organs' heights:
   * order kept, at least the column gap between cards, inside the stage
   * (isotonic least squares). Fixed front view: run on load and resize.
   */
  const placeColumns = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const s = stage.getBoundingClientRect();
    let ok = true;
    for (const side of SIDES) {
      const col = colRefs.current[side];
      if (!col) continue;
      const cards = ZONES.filter((z) => z.side === side).map((z) => cardRefs.current[z.id]);
      const ys = ZONES.filter((z) => z.side === side).map((z) => organPoint(z.id, s)?.y);
      if (ys.some((y) => y === undefined) || cards.some((c) => !c)) {
        ok = false;
        continue;
      }
      const gap = parseFloat(getComputedStyle(col).rowGap) || 12;
      const h = cards.map((c) => c!.offsetHeight);
      const natural: number[] = [];
      let acc = 0;
      for (const hh of h) {
        natural.push(acc);
        acc += hh + gap;
      }
      const stackH = acc - gap;
      // Shift u_i = top_i − natural_i must be non-decreasing (keeps order and gaps).
      const desired = (ys as number[]).map((y, i) => y - h[i] / 2 - natural[i]);
      const u = isotonic(desired).map((v) => Math.max(0, Math.min(v, s.height - stackH)));
      col.style.transform = 'none';
      cards.forEach((c, i) => {
        c!.style.transform = `translateY(${u[i].toFixed(1)}px)`;
      });
    }
    placed.current = ok;
  }, []);

  /** Recompute leader geometry in screen space (no React re-render). Static: camera is locked. */
  const updateLines = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      if (!placed.current) placeColumns();
      const s = stage.getBoundingClientRect();
      for (const z of ZONES) {
        const path = pathRefs.current[z.id];
        const card = cardRefs.current[z.id];
        if (!path || !card) continue;
        const o = organPoint(z.id, s);
        if (!o) {
          path.style.opacity = '0';
          continue;
        }
        const c = card.getBoundingClientRect();
        const dir = z.side === 'left' ? -1 : 1;
        const xCard = (dir === -1 ? c.right : c.left) - s.left;
        const yCard = c.top + c.height / 2 - s.top;
        path.setAttribute('d', leaderPath(o.x, o.y, xCard, yCard, dir));
        path.style.opacity = '1';
      }
    });
  }, [placeColumns]);

  /** Model (re)framed: re-place the card columns and redraw. */
  const relayout = useCallback(() => {
    placed.current = false;
    updateLines();
  }, [updateLines]);

  // Re-measure after every render (card content changes with the day).
  useLayoutEffect(() => {
    updateLines();
  });
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const timers: number[] = [];
    const ro = new ResizeObserver(() => {
      placed.current = false;
      updateLines();
      // model-viewer re-projects its hotspots asynchronously after a resize: measure again.
      timers.push(window.setTimeout(() => { placed.current = false; updateLines(); }, 150));
      timers.push(window.setTimeout(() => { placed.current = false; updateLines(); }, 500));
    });
    ro.observe(stage);
    window.addEventListener('scroll', updateLines, { passive: true });
    return () => {
      ro.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('scroll', updateLines);
      cancelAnimationFrame(frame.current);
    };
  }, [updateLines]);

  const handleHover = useCallback((z: string | null) => onHover(z as ZoneId | null), [onHover]);
  const activateZone = useCallback(
    (zid: ZoneId) => onOpen(zoneLead(ZONES.find((z) => z.id === zid)!, view.metrics)),
    [view.metrics, onOpen],
  );

  return (
    <div className="stage" ref={stageRef} data-region="visualize">
      {SIDES.map((side) => (
        <div
          key={side}
          className={`card-col card-col-${side}`}
          ref={(el) => {
            colRefs.current[side] = el;
          }}
        >
          {ZONES.filter((z) => z.side === side).map((z) => (
            <Callout
              key={z.id}
              ref={(el) => {
                cardRefs.current[z.id] = el;
              }}
              zone={z}
              metrics={view.metrics}
              cumulativeDose={view.cumulativeDose}
              limit={data.settings.careerRadiationLimit}
              selected={selectedZone === z.id}
              hovered={hoverZone === z.id || highlight.includes(z.id)}
              onOpen={onOpen}
              onHover={handleHover}
            />
          ))}
        </div>
      ))}
      <div className="body-cell">
        <Suspense fallback={<div className="body3d-msg muted">Loading 3D anatomy…</div>}>
          <AnatomyModel
            ref={modelRef}
            zoneStatus={statuses}
            highlight={highlight}
            hoverZone={hoverZone}
            selectedZone={selectedZone}
            onHover={onHover}
            onActivate={activateZone}
            onReady={relayout}
          />
        </Suspense>
      </div>
      <svg className="leaders" aria-hidden="true">
        {ZONES.map((z) => {
          const st = statuses[z.id];
          const alert = !!st && st !== 'OK';
          const hot = hoverZone === z.id || highlight.includes(z.id);
          return (
            <path
              key={z.id}
              ref={(el) => {
                pathRefs.current[z.id] = el;
              }}
              className="leader"
              pathLength={1}
              fill="none"
              stroke={hot ? '#111111' : alert ? STATUS_COLOR[st!] : QUIET}
              strokeWidth={hot ? 1.5 : 1}
              style={{ opacity: 0 }}
            />
          );
        })}
      </svg>
    </div>
  );
}
