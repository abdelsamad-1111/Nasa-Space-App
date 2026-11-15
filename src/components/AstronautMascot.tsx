import { useEffect, useRef, useState } from 'react';
import '../lib/modelViewerConfig';
import '@google/model-viewer';
import { AstronautMark } from './AstronautMark';

/** Decorative 3D identity; pauses off-tab and respects the system motion preference. */
export function AstronautMascot() {
  const modelRef = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setRotating(!preference.matches && document.visibilityState === 'visible');
    update();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    const onLoad = () => setLoaded(true);
    const onError = () => setFailed(true);
    model.addEventListener('load', onLoad);
    model.addEventListener('error', onError);
    if ((model as HTMLElement & { loaded?: boolean }).loaded) onLoad();
    return () => {
      model.removeEventListener('load', onLoad);
      model.removeEventListener('error', onError);
    };
  }, []);

  return (
    <span className={`brand-mascot${loaded && !failed ? ' is-ready' : ''}`}>
      {(!loaded || failed) && <AstronautMark size={48} onDark className="brand-mascot-fallback" />}
      {!failed && <model-viewer
        ref={modelRef}
        src="/models/astronaut.glb"
        alt=""
        aria-hidden="true"
        tabIndex={-1}
        {...(rotating && loaded && !paused ? { 'auto-rotate': '' } : {})}
        auto-rotate-delay="0"
        rotation-per-second="16deg"
        camera-orbit="20deg 80deg auto"
        field-of-view="30deg"
        environment-image="neutral"
        exposure="1.2"
        shadow-intensity="0"
        interaction-prompt="none"
        disable-tap=""
        disable-pan=""
        disable-zoom=""
        loading="eager"
        reveal="auto"
      />}
      {loaded && !failed && rotating && <button
        className="brand-motion-toggle"
        aria-label={paused ? 'Rotate astronaut' : 'Pause astronaut rotation'}
        title={paused ? 'Rotate astronaut' : 'Pause astronaut rotation'}
        onClick={() => setPaused((value) => !value)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {paused ? <path d="m3 1 8 5-8 5V1Z" /> : <path d="M2 1h3v10H2zM7 1h3v10H7z" />}
        </svg>
      </button>}
    </span>
  );
}
