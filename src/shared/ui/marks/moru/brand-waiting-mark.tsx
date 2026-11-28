import { useEffect, useRef, type Ref } from 'react';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';

import { ASK_ROW_FRAMES, CELEBRATION_MOTIONS, PLAY_ROW_FRAMES, ROOM_ROW_FRAMES, WORK_ROW_FRAMES, type AskMotion, type CelebrationMotion, type PlayMotion, type RoomMotion, type WorkMotion } from './moru-rows';

/** Company for pending work, one finite welcome, or a curious look beside a dead end; parents own status and Stop. */
export function BrandWaitingMark({
  active,
  initialVisibility = 'observed',
  scale = 1,
  motion = 'waiting',
  held = false,
  onLoopEnd,
}: {
  active: boolean;
  /** Called each time a running loop returns to its first cell; a still or paused mark never calls it. */
  onLoopEnd?: () => void;
  /** Only full-screen pending fallbacks can know they are visible before hydration. */
  initialVisibility?: 'observed' | 'visible';
  /** The still pose with no hook or observer, for a screen reporting that the runtime itself failed. */
  held?: boolean;
} & (
  | { scale?: 1 | 2; motion?: Exclude<WaitingMotion, NativeOnlyMotion> }
  /** The curious tilt, the acted work, play, ask and room clips and the finishing gestures exist only as native 128px cells. */
  | { scale: 2; motion: NativeOnlyMotion }
)) {
  if (!active) return null;
  return held ? <WaitingMarkCell state="still" scale={scale} motion={motion} /> : <ActiveWaitingMark initialVisibility={initialVisibility} scale={scale} motion={motion} onLoopEnd={onLoopEnd} />;
}

type NativeOnlyMotion = 'curious' | WorkMotion | PlayMotion | AskMotion | RoomMotion | CelebrationMotion;
type WaitingMotion = 'waiting' | 'connect' | 'compile' | 'greeting' | NativeOnlyMotion;
const CELEBRATIONS: ReadonlySet<WaitingMotion> = new Set<WaitingMotion>(CELEBRATION_MOTIONS);
/** A gesture that plays once and rests, unlike a loop that lasts as long as the work. */
const finite = (motion: WaitingMotion) => motion === 'greeting' || CELEBRATIONS.has(motion);
/** Work loops run end to end without the waiting blink's long hold; play runs at the slower catalogue pace. */
const SLOW_ROW_FRAMES: Record<string, number> = { ...PLAY_ROW_FRAMES, ...ASK_ROW_FRAMES, ...ROOM_ROW_FRAMES };
const paceOf = (motion: WaitingMotion) => (motion in WORK_ROW_FRAMES ? 'work' : motion in SLOW_ROW_FRAMES ? 'play' : undefined);
const framesOf = (motion: WaitingMotion): number => (WORK_ROW_FRAMES as Record<string, number>)[motion] ?? SLOW_ROW_FRAMES[motion] ?? 24;

function ActiveWaitingMark({ initialVisibility, scale, motion, onLoopEnd }: { initialVisibility: 'observed' | 'visible'; scale: 1 | 2; motion: WaitingMotion; onLoopEnd?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const greetingFinished = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  const onLoopEndRef = useRef(onLoopEnd);
  useEffect(() => {
    onLoopEndRef.current = onLoopEnd;
  }, [onLoopEnd]);

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
    const loopEnded = () => onLoopEndRef.current?.();
    update();
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting === true;
      update();
    });
    observer.observe(mark);
    document.addEventListener('visibilitychange', update);
    mark.addEventListener('animationend', finish);
    mark.addEventListener('animationiteration', loopEnded);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      mark.removeEventListener('animationend', finish);
      mark.removeEventListener('animationiteration', loopEnded);
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
      data-moru-pace={paceOf(motion)}
      data-moru-frames={framesOf(motion) === 24 ? undefined : framesOf(motion)}
      className={`${finite(motion) ? 'atlas-moru-greeting atlas-mascot-sprite' : 'atlas-waiting-mark'} pointer-events-none inline-block size-16 shrink-0`}
      style={{ backgroundImage: `url(${withBasePath(`/brand/mascot-${motion}-row${scale === 2 ? '-128' : ''}.png`)})` }}
    />
  );
  return scale === 2 ? <span className="atlas-waiting-mark-2x inline-flex shrink-0">{mark}</span> : mark;
}
