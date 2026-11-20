'use client';

import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { BrandWaitingMark } from '@/shared/ui/marks/brand-waiting-mark';

import type { MeaningRunPhase } from '../model/meaning-run';
import type { WorkRunLine, WorkRunPhase } from '../model/work-run';

/** The observed state Moru stands beside: a run's phase and the kind of its current line. */
export interface MoruState {
  phase: WorkRunPhase;
  line: { kind: WorkRunLine['kind'] };
}

type Clip = 'think' | 'read' | 'search' | 'code' | 'compare' | 'success' | 'waiting' | 'pondering';

/** The conversation's work rows for what the turn reported; the result rows the update notice uses. */
function clipsFor(run: MoruState): { intro: Clip | null; loop: Clip } {
  switch (run.phase) {
    case 'running':
    case 'asking':
      switch (run.line.kind) {
        case 'connecting':
          return { intro: null, loop: 'think' };
        case 'reading':
          return { intro: null, loop: 'read' };
        case 'tool':
          return { intro: null, loop: 'search' };
        case 'writing':
          return { intro: null, loop: 'code' };
      }
      break;
    case 'found':
    case 'clean':
      return { intro: 'success', loop: 'waiting' };
    default:
      return { intro: null, loop: 'pondering' };
  }
}

/**
 * Moru at his native 128px beside an observed state. A new kind of work waits for the running
 * loop to come home to the shared neutral pose, so the figure never jumps; an ask holds that pose.
 */
export function WorkRunMoru({ run }: { run: MoruState }) {
  return <MoruBeside {...clipsFor(run)} held={run.phase === 'asking'} />;
}

/**
 * The same rows for preparing a folder for search by meaning: reading while it reads files,
 * thinking while the model downloads, comparing while it is made ready, waiting for its turn.
 */
function meaningClipsFor(phase: MeaningRunPhase): { intro: Clip | null; loop: Clip } {
  switch (phase) {
    case 'preparing':
      return { intro: null, loop: 'read' };
    case 'modelDownloading':
      return { intro: null, loop: 'think' };
    case 'modelConverting':
      return { intro: null, loop: 'compare' };
    case 'waitingTurn':
      return { intro: null, loop: 'waiting' };
    case 'ready':
      return { intro: 'success', loop: 'waiting' };
    default:
      return { intro: null, loop: 'pondering' };
  }
}

export function MeaningRunMoru({ phase }: { phase: MeaningRunPhase }) {
  return <MoruBeside {...meaningClipsFor(phase)} held={false} />;
}

function MoruBeside({ intro, loop, held }: { intro: Clip | null; loop: Clip; held: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [clip, setClip] = useState<Clip>(intro ?? loop);
  if (reducedMotion && intro === null && clip !== loop) setClip(loop);
  const stageRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !intro) return;
    const restAfterIntro = (event: Event) => {
      if ((event.target as HTMLElement).dataset.moruMotion === intro) setClip(loop);
    };
    stage.addEventListener('animationend', restAfterIntro);
    return () => stage.removeEventListener('animationend', restAfterIntro);
  }, [intro, loop]);

  return (
    <span
      ref={stageRef}
      aria-hidden
      data-testid="work-run-moru"
      data-moru-clip={clip}
      className="pointer-events-none absolute bottom-3 left-3 flex size-32 items-end max-sm:size-16"
    >
      <span className="flex max-sm:[zoom:0.5]">
        <BrandWaitingMark
          active
          held={held}
          scale={2}
          motion={clip}
          initialVisibility="visible"
          onLoopEnd={() => {
            if (intro === null && clip !== loop) setClip(loop);
          }}
        />
      </span>
    </span>
  );
}
