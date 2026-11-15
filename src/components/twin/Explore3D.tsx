import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZONES, type Status, type ZoneId } from '../../brain/indicators';
import { useApp } from '../../state/AppState';
import { zoneStatus } from './Callout';
import { fmtNumber } from '../../lib/format';
import { AssessmentStatus } from '../AssessmentStatus';

const AnatomyModel = lazy(() => import('./AnatomyModel').then((m) => ({ default: m.AnatomyModel })));

interface Props {
  initialZone: ZoneId | null;
  onClose: () => void;
}

/** Separate rotatable 3D view (the main screen stays a fixed front view). */
export function Explore3D({ initialZone, onClose }: Props) {
  const { view } = useApp();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedZone, setSelectedZone] = useState<ZoneId | null>(initialZone);
  const [cameraVersion, setCameraVersion] = useState(0);
  const statuses = useMemo(() => {
    const out: Partial<Record<ZoneId, Status | null>> = {};
    for (const z of ZONES) out[z.id] = zoneStatus(z, view.metrics);
    return out;
  }, [view.metrics]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const selector = 'button:not([disabled]), select:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), model-viewer';
      // The model's keyboard camera is inside its shadow root; include it in tab order.
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])
        .flatMap((el) => el.localName === 'model-viewer'
          ? Array.from(el.shadowRoot?.querySelectorAll<HTMLElement>(selector) ?? [])
          : [el])
        .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      let active = document.activeElement;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      const inside = e.composedPath().includes(dialogRef.current!);
      if (e.shiftKey && (active === first || !inside)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && (active === last || !inside)) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (root) root.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      if (prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div ref={dialogRef} className="explore" role="dialog" aria-modal="true" aria-labelledby="explore-title" aria-describedby="explore-help">
      <div className="explore-top">
        <div>
          <span className="eyebrow">Day {fmtNumber(view.day)}</span>
          <h2 id="explore-title">Explore 3D</h2>
          <p className="hint" id="explore-help">Drag to rotate. Scroll or pinch to zoom. Choose an organ to emphasize it.</p>
        </div>
        <button ref={closeRef} className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="explore-toolbar">
        <div className="explore-focus">
          <label htmlFor="explore-organ">Focus</label>
          <select
            id="explore-organ"
            className="input"
            value={selectedZone ?? 'all'}
            aria-controls="explore-anatomy"
            onChange={(e) => setSelectedZone(e.target.value === 'all' ? null : e.target.value as ZoneId)}
          >
            <option value="all">All organs</option>
            {ZONES.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
          <button className="btn" onClick={() => setCameraVersion((version) => version + 1)}>Reset view</button>
        </div>
        <div className="explore-legend" aria-label="Status markers">
          <span>Overall <AssessmentStatus summary={view.assessment} size={10} compact /></span>
          <span className="eyebrow">Status</span>
          <span><i className="explore-swatch explore-swatch-neutral" aria-hidden="true" />Neutral</span>
          <span><i className="explore-swatch explore-swatch-watch" aria-hidden="true" />Watch</span>
          <span><i className="explore-swatch explore-swatch-act" aria-hidden="true" />Act / Critical</span>
        </div>
      </div>
      <div className="explore-stage" id="explore-anatomy">
        <Suspense fallback={<div className="body3d-msg muted">Loading 3D anatomy…</div>}>
          <AnatomyModel key={cameraVersion} zoneStatus={statuses} selectedZone={selectedZone} interactive />
        </Suspense>
      </div>
      <p className="explore-note hint">Neutral shading means no alert or no reading. Check the Health Twin for values and severity.</p>
    </div>,
    document.body,
  );
}
