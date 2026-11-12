'use client';

import { useEffect, useRef } from 'react';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';

/** Company for pending work or one finite welcome; parents own status and Stop. */
export function BrandWaitingMark({
  active,
  initialVisibility = 'observed',
  scale = 1,
  motion = 'waiting',
}: {
  active: boolean;
  /** Only full-screen pending fallbacks can know they are visible before hydration. */
  initialVisibility?: 'observed' | 'visible';
  scale?: 1 | 2;
  motion?: 'waiting' | 'connect' | 'compile' | 'greeting';
}) {
  return active ? <ActiveWaitingMark initialVisibility={initialVisibility} scale={scale} motion={motion} /> : null;
}

function ActiveWaitingMark({ initialVisibility, scale, motion }: { initialVisibility: 'observed' | 'visible'; scale: 1 | 2; motion: 'waiting' | 'connect' | 'compile' | 'greeting' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const greetingFinished = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const mark = ref.current;
    if (!mark) return;
    if (reducedMotion) { if (motion === 'greeting') greetingFinished.current = true; return; }
    // Without a visibility observer it stays still rather than run a dance it cannot stop off
    // screen.
    if (typeof IntersectionObserver === 'undefined') {
      mark.dataset.waitingMotion = 'still';
      return;
    }

    let intersecting = initialVisibility === 'visible';
    const update = () => {
      mark.dataset.waitingMotion = motion === 'greeting' && greetingFinished.current ? 'still' : !document.hidden && intersecting ? 'running' : 'paused';
    };
    const finish = () => { if (motion === 'greeting') { greetingFinished.current = true; update(); } };
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

  const mark = (
    <span
      ref={ref}
      aria-hidden="true"
      data-testid="brand-waiting-mark"
      data-waiting-motion={reducedMotion ? 'still' : initialVisibility === 'visible' ? 'running' : 'paused'}
      data-moru-motion={motion}
      className={`${motion === 'greeting' ? 'atlas-moru-greeting atlas-mascot-sprite' : 'atlas-waiting-mark'} pointer-events-none inline-block size-16 shrink-0`}
      style={{ backgroundImage: `url(${withBasePath(`/brand/mascot-${motion}-row.png`)})` }}
    />
  );
  return scale === 2 ? <span className="atlas-waiting-mark-2x inline-block shrink-0">{mark}</span> : mark;
}
