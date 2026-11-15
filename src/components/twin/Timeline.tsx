import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { STATUS_COLOR, type Status } from '../../brain/indicators';
import { MISSION_EVENTS } from '../../data/demo';
import { useApp } from '../../state/AppState';
import { fmtNumber } from '../../lib/format';

interface Props {
  dayStatus: (Status | null)[]; // index 0 = day 1
}

export const Timeline = memo(function Timeline({ dayStatus }: Props) {
  const { day, setDay, maxDay, data } = useApp();
  const events = data.mode === 'demo' ? MISSION_EVENTS.filter((ev) => ev.day <= maxDay) : [];
  const [playing, setPlaying] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dayRef = useRef(day);
  dayRef.current = day;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setDay(Math.min(maxDay, dayRef.current + 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [playing, maxDay, setDay]);

  useEffect(() => {
    if (playing && day >= maxDay) setPlaying(false);
  }, [day, maxDay, playing]);

  const togglePlay = () => {
    if (!playing && day >= maxDay) setDay(1);
    setPlaying((p) => !p);
  };

  const pos = (d: number) => `${((d - 1) / (maxDay - 1)) * 100}%`;

  const dayFromPointer = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(f * (maxDay - 1)) + 1;
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPlaying(false);
    setDay(dayFromPointer(e.clientX));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) setDay(dayFromPointer(e.clientX));
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onKey = (e: KeyboardEvent) => {
    const map: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 7, PageDown: -7 };
    if (e.key in map) {
      e.preventDefault();
      setPlaying(false);
      setDay(day + map[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setDay(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      setDay(maxDay);
    }
  };

  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  return (
    <section className="timeline" aria-label="Mission timeline">
      <div className="tl-controls">
        <button className="btn tl-play" onClick={togglePlay} aria-pressed={playing}>
          <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
            {playing ? (
              <g fill="currentColor"><rect x="0" y="0" width="3.5" height="12" /><rect x="6.5" y="0" width="3.5" height="12" /></g>
            ) : (
              <polygon points="0,0 10,6 0,12" fill="currentColor" />
            )}
          </svg>
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="tl-day">
          <span className="eyebrow">Mission day</span>
          <span className="tl-day-num num">
            {fmtNumber(day)}
            <span className="muted"> / {fmtNumber(maxDay)}</span>
          </span>
        </div>
      </div>

      <div className="tl-body">
        {events.length > 0 && <div className="tl-events" aria-label="Simulated demo scenario events">
          {events.map((ev, i) => (
            <button
              key={ev.day}
              className={`tl-event tl-row-${i % 2}${day === ev.day ? ' is-current' : ''}`}
              style={{ left: pos(ev.day) }}
              onClick={() => {
                setPlaying(false);
                setDay(ev.day);
              }}
            >
              <span className="tl-event-day num">Day {fmtNumber(ev.day)}</span>
              <span className="tl-event-caption">{ev.caption}</span>
            </button>
          ))}
        </div>}

        <div
          ref={trackRef}
          className="tl-track"
          role="slider"
          tabIndex={0}
          aria-label="Mission day"
          aria-valuemin={1}
          aria-valuemax={maxDay}
          aria-valuenow={day}
          aria-valuetext={`Day ${day} of ${maxDay}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKey}
        >
          <div className="tl-line" />
          <div className="tl-fill" style={{ width: pos(day) }} />
          {days.map((d) => {
            const st = dayStatus[d - 1];
            return (
              <div key={d} className={`tl-tick${d === day ? ' is-current' : ''}`} style={{ left: pos(d) }}>
                <span
                  className="tl-mark"
                  style={{ background: st && st !== 'OK' ? STATUS_COLOR[st] : undefined }}
                  data-status={st ?? 'none'}
                />
                <span className="tl-num num">{fmtNumber(d)}</span>
              </div>
            );
          })}
          <div className="tl-thumb" style={{ left: pos(day) }} aria-hidden="true" />
          {events.map((ev) => (
            <span key={ev.day} className="tl-event-pin" style={{ left: pos(ev.day) }} aria-hidden="true" />
          ))}
        </div>
      </div>
    </section>
  );
});
