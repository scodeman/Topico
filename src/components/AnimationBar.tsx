import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChainAnimation } from '../engine/animation';
import { useStore } from '../model/store';

const STEP_MS = 1600;

/** Player for a chain's sequence: shown on the canvas while a chain is animated. */
export function AnimationBar({ anim }: { anim: ChainAnimation }) {
  const animation = useStore((s) => s.ui.animation);
  const setUi = useStore((s) => s.setUi);
  const playing = !!animation?.playing;
  const go = (step: number, keepPlaying = playing) =>
    setUi({ animation: { chainId: anim.chainId, step: ((step - 1 + anim.count) % anim.count) + 1, playing: keepPlaying } });

  // Auto-advance while playing, looping back to step 1.
  useEffect(() => {
    if (!playing || anim.count < 1) return;
    const t = setTimeout(() => go(anim.current + 1, true), STEP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, anim.current, anim.count]);

  return (
    <div className="anim-bar" style={{ borderColor: anim.color }}>
      <div className="anim-head">
        <span className="dot" style={{ background: anim.color }} />
        <strong>{anim.chainName}</strong>
        <span className="anim-step-no" title={`Step ${anim.current} of ${anim.count}`}>
          {anim.count ? (
            <>
              Step <b>{anim.current}</b> / {anim.count}
            </>
          ) : (
            'No sequence'
          )}
        </span>
        <span className="anim-controls">
          <button onClick={() => go(1, false)} title="First step" disabled={!anim.count}>⏮</button>
          <button onClick={() => go(anim.current - 1, false)} title="Previous step" disabled={!anim.count}>◀</button>
          <button className="anim-play" onClick={() => go(anim.current, !playing)} title={playing ? 'Pause' : 'Play'} disabled={!anim.count}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button onClick={() => go(anim.current + 1, false)} title="Next step" disabled={!anim.count}>▶▶</button>
          <button onClick={() => setUi({ animation: null })} title="Stop animating">×</button>
        </span>
      </div>
      {anim.count > 0 && <Ticker text={anim.stepLabels[anim.current - 1].join('   ·   ')} />}
    </div>
  );
}

/**
 * One line of text in a fixed-width strip: it never resizes the bar.
 * Text longer than the strip scrolls slowly back and forth so all of it can be read.
 */
function Ticker({ text }: { text: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const box = boxRef.current;
    const t = textRef.current;
    if (!box || !t) return;
    setShift(Math.max(0, t.scrollWidth - box.clientWidth));
  }, [text]);
  // About 40 px per second, plus pauses at both ends (see the keyframes).
  const seconds = Math.max(4, (shift / 40) * 2 + 3);
  return (
    <div className="anim-ticker" ref={boxRef} title={text}>
      <span
        key={text}
        ref={textRef}
        className={shift ? 'scrolling' : undefined}
        style={shift ? ({ '--shift': `-${shift}px`, animationDuration: `${seconds}s` } as React.CSSProperties) : undefined}
      >
        {text}
      </span>
    </div>
  );
}
