'use client';

import { useEffect, useRef, type Ref } from 'react';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';

/** Company for pending work, one finite welcome, or a curious look beside a dead end; parents own status and Stop. */
export function BrandWaitingMark({
  active,
  initialVisibility = 'observed',
  scale = 1,
  motion = 'waiting',
  held = false,
}: {
  active: boolean;
  /** Only full-screen pending fallbacks can know they are visible before hydration. */
  initialVisibility?: 'observed' | 'visible';
  /** The still pose with no hook or observer, for a screen reporting that the runtime itself failed. */
  held?: boolean;
} & (
  | { scale?: 1 | 2; motion?: Exclude<WaitingMotion, 'curious' | WorkMotion | 'success'> }
  /** The curious tilt, the acted work clips and the finishing dance exist only as native 128px cells. */
  | { scale: 2; motion: 'curious' | WorkMotion | 'success' }
)) {
  if (!active) return null;
  return held ? <WaitingMarkCell state="still" scale={scale} motion={motion} /> : <ActiveWaitingMark initialVisibility={initialVisibility} scale={scale} motion={motion} />;
}

/** Clips Moru acts beside one observed kind of work; they loop without the waiting blink's long hold. */
export type WorkMotion = 'think' | 'read' | 'search' | 'write' | 'code';
type WaitingMotion = 'waiting' | 'connect' | 'compile' | 'greeting' | 'curious' | 'success' | WorkMotion;
const WORK_MOTIONS: ReadonlySet<WaitingMotion> = new Set<WaitingMotion>(['think', 'read', 'search', 'write', 'code']);
/** A gesture that plays once and rests, unlike a loop that lasts as long as the work. */
const finite = (motion: WaitingMotion) => motion === 'greeting' || motion === 'success';

function ActiveWaitingMark({ initialVisibility, scale, motion }: { initialVisibility: 'observed' | 'visible'; scale: 1 | 2; motion: WaitingMotion }) {
  const ref = useRef<HTMLSpanElement>(null);
  const greetingFinished = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const mark = ref.current;
    if (!mark) return;
    if (reducedMotion) { if (finite(motion)) greetingFinished.current = true; return; }
    // Without a visibility observer it stays still rather than run a dance it cannot stop off
    // screen.
    if (typeof IntersectionObserver === 'undefined') {
      mark.dataset.waitingMotion = 'still';
      return;
    }

    let intersecting = initialVisibility === 'visible';
    const update = () => {
      mark.dataset.waitingMotion = finite(motion) && greetingFinished.current ? 'still' : !document.hidden && intersecting ? 'running' : 'paused';
    };
    const finish = () => { if (finite(motion)) { greetingFinished.current = true; update(); } };
    update();
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting === true;
      update();
    });
    observer.observe(mark);
    document.addEventListener('visibilitychange', update);
    mark.addEventListener('animationend', finish);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      mark.removeEventListener('animationend', finish);
    };
  }, [initialVisibility, reducedMotion, motion]);

  return <WaitingMarkCell ref={ref} state={reducedMotion ? 'still' : initialVisibility === 'visible' ? 'running' : 'paused'} scale={scale} motion={motion} />;
}

function WaitingMarkCell({ ref, state, scale, motion }: { ref?: Ref<HTMLSpanElement>; state: 'still' | 'running' | 'paused'; scale: 1 | 2; motion: WaitingMotion }) {
  const mark = (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="brand-waiting-mark"
      data-waiting-motion={state}
      data-moru-motion={motion}
      data-moru-pace={WORK_MOTIONS.has(motion) ? 'work' : undefined}
      className={`${finite(motion) ? 'atlas-moru-greeting atlas-mascot-sprite' : 'atlas-waiting-mark'} pointer-events-none inline-block size-16 shrink-0`}
      style={{ backgroundImage: `url(${withBasePath(`/brand/mascot-${motion}-row${scale === 2 ? '-128' : ''}.png`)})` }}
    />
  );
  return scale === 2 ? <span className="atlas-waiting-mark-2x inline-flex shrink-0">{mark}</span> : mark;
}
