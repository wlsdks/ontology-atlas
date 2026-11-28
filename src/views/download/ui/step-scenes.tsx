import { useEffect, useRef, type ReactNode } from 'react';
import { FileText, Folder, FolderOpen } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { useMotionPaused } from '@/shared/motion/motion-pause';
import { EXIT_TRANSITION, MOTION, MOTION_EASE } from '@/shared/motion/tokens';
import { OntologyMapKindGlyph } from '@/shared/ui/ontology-node/map-kind-glyph';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { InViewMotion } from '../lib/page-motion/use-in-view-motion';
import { kindOf, START_DRAFT, START_FOLDER, START_PATH } from '../model/start-cast';

export const STEP_CYCLE_MS = 7800;
const STEP_TURN_MS = 2200;
const LAST_LIT_UNTIL_MS = 7200;
const ENTER_MS = MOTION.settle.duration * 1000;
const EXIT_MS = EXIT_TRANSITION.duration * 1000;
const DIM_MS = MOTION.base.duration * 1000;
const ENTER_EASE = `cubic-bezier(${MOTION_EASE.join(', ')})`;
const EXIT_EASE = `cubic-bezier(${EXIT_TRANSITION.ease.join(', ')})`;
const RESTING = 0.6;
const STAGGER_MS = 40;
const DRAFT_STAGGER_MS = 160;

type Frame = Record<string, string | number>;

/**
 * What a part of a scene does in its beat, from where it starts to its resting style, which is the
 * markup's own: the page without a script, under reduced motion or paused shows the final frame.
 * `unseen` starts are invisible, so a part leaves its final frame by fading before it resets.
 */
const BEATS = {
  drop: { from: { opacity: 0, transform: 'translateY(-6px)' }, to: { opacity: 1, transform: 'none' }, unseen: true },
  show: { from: { opacity: 0 }, to: { opacity: 1 }, unseen: true },
  hide: { from: { opacity: 1 }, to: { opacity: 0 }, unseen: false },
  draw: { from: { opacity: 1, transform: 'scaleX(0)' }, to: { opacity: 1, transform: 'scaleX(1)' }, unseen: true },
  knob: { from: { opacity: 1, transform: 'translateX(-0.875rem)' }, to: { opacity: 1, transform: 'none' }, unseen: false },
} satisfies Record<string, { from: Frame; to: Frame; unseen: boolean }>;

type Beat = keyof typeof BEATS | 'flash';

function beat(kind: Beat, at: number, ms = ENTER_MS, steps?: number) {
  return {
    'data-beat': kind,
    'data-beat-at': at,
    'data-beat-ms': ms,
    ...(steps ? { 'data-beat-steps': steps } : {}),
  };
}

const offset = (ms: number) => Math.min(1, ms / STEP_CYCLE_MS);

function turnFrames(start: number, end: number): Keyframe[] {
  const lit: Keyframe[] = [
    { offset: offset(start), opacity: RESTING, easing: ENTER_EASE },
    { offset: offset(start + ENTER_MS), opacity: 1 },
    { offset: offset(end), opacity: 1, easing: EXIT_EASE },
    { offset: offset(end + DIM_MS), opacity: RESTING },
    { offset: 1, opacity: RESTING },
  ];
  return start === 0 ? lit : [{ offset: 0, opacity: RESTING }, ...lit];
}

function partFrames(part: HTMLElement, start: number): Keyframe[] {
  const kind = part.dataset.beat as Beat;
  const at = start + Number(part.dataset.beatAt);
  const ms = Number(part.dataset.beatMs);
  if (kind === 'flash') {
    return [
      { offset: 0, opacity: 0 },
      { offset: offset(at), opacity: 0, easing: ENTER_EASE },
      { offset: offset(at + EXIT_MS), opacity: 1 },
      { offset: offset(at + ms), opacity: 1, easing: ENTER_EASE },
      { offset: offset(at + ms + ENTER_MS), opacity: 0 },
      { offset: 1, opacity: 0 },
    ];
  }
  const { from, to, unseen } = BEATS[kind];
  const steps = part.dataset.beatSteps;
  const enter = steps ? `steps(${steps}, end)` : ENTER_EASE;
  const frames: Keyframe[] = [{ offset: 0, ...to }];
  if (start > 0) frames.push({ offset: offset(start), ...to });
  frames[frames.length - 1].easing = EXIT_EASE;
  if (unseen) {
    frames.push({ offset: offset(start + EXIT_MS), ...to, opacity: 0 });
    frames.push({ offset: offset(start + EXIT_MS) + 1e-5, ...from });
  } else {
    frames.push({ offset: offset(start + EXIT_MS), ...from });
  }
  frames.push({ offset: offset(at), ...from, easing: enter });
  frames.push({ offset: offset(at + ms), ...to });
  frames.push({ offset: 1, ...to });
  return frames;
}

function buildScenes(root: HTMLElement): Animation[] {
  const timing: KeyframeAnimationOptions = { duration: STEP_CYCLE_MS, iterations: Infinity, fill: 'both' };
  return [...root.querySelectorAll<HTMLElement>('[data-step-scene]')].flatMap((scene) => {
    const step = Number(scene.dataset.stepScene);
    const start = step * STEP_TURN_MS;
    const end = step === 2 ? LAST_LIT_UNTIL_MS : start + STEP_TURN_MS;
    return [
      scene.animate(turnFrames(start, end), timing),
      ...[...scene.querySelectorAll<HTMLElement>('[data-beat]')].map((part) =>
        part.animate(partFrames(part, start), timing),
      ),
    ];
  });
}

/**
 * Plays the three scenes on the rail's own clock: the CSS fill under step one is the clock, so a
 * scene's beat lands as its node fills, through pauses and returns. Nothing is built without a
 * script, under reduced motion (`motion` stays undefined) or while the page's motion is paused;
 * the markup's final frames then stand, all three at full light.
 */
export function useStepScenes(root: HTMLElement | null, motion: InViewMotion) {
  const stopped = useMotionPaused();
  const scenes = useRef<Animation[] | null>(null);

  useEffect(() => {
    if (!root || motion === undefined || stopped || typeof root.animate !== 'function') return;
    scenes.current ??= buildScenes(root);
    let live = true;
    const sync = () => {
      const spark = root.querySelector('.gateway-step-spark');
      const clock = typeof spark?.getAnimations === 'function' ? spark.getAnimations()[0] : undefined;
      if (!clock || !scenes.current) return;
      if (motion === 'paused') {
        for (const scene of scenes.current) {
          scene.pause();
          scene.currentTime = clock.currentTime;
        }
        return;
      }
      void clock.ready.then(() => {
        if (!live || !scenes.current) return;
        for (const scene of scenes.current) scene.startTime = clock.startTime;
      });
    };
    const frame = requestAnimationFrame(sync);
    // A new rail animation (the layout turned at 52rem) restarts the clock.
    const restart = (event: AnimationEvent) => {
      if ((event.target as Element).classList.contains('gateway-step-spark')) sync();
    };
    root.addEventListener('animationstart', restart);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      root.removeEventListener('animationstart', restart);
      for (const scene of scenes.current ?? []) scene.pause();
    };
  }, [root, motion, stopped]);

  useEffect(() => {
    if (motion !== undefined && !stopped) return;
    for (const scene of scenes.current ?? []) scene.cancel();
    scenes.current = null;
  }, [motion, stopped]);

  useEffect(
    () => () => {
      for (const scene of scenes.current ?? []) scene.cancel();
      scenes.current = null;
    },
    [root],
  );
}

const ROW = 'flex min-w-0 items-center gap-2 text-body-lg leading-body-lg';
const QUIET = 'text-[color:var(--color-text-tertiary)]';

export function SceneFrame({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div
      aria-hidden
      data-step-scene={step}
      data-testid={`gateway-step-scene-${step}`}
      className="gateway-step-drawing flex min-w-0 @min-[52rem]:min-h-[17rem] flex-col justify-center rounded-panel border border-[color:var(--color-border-soft)] p-5"
    >
      {children}
    </div>
  );
}

function Press({ accent = false, children }: { accent?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'gateway-step-press relative inline-flex min-h-8 min-w-0 items-center self-start rounded-chip px-3.5 text-body-lg leading-body-lg',
        accent
          ? 'bg-[color:var(--color-indigo-accent)] text-[color:var(--color-text-on-accent)]'
          : 'border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]',
      )}
    >
      <span className="gateway-step-lit absolute -inset-[3px] rounded-[inherit] border border-[color:var(--color-text-primary)]" />
      <span className="relative min-w-0">{children}</span>
    </span>
  );
}

export function OpenFolderScene({ open }: { open: string }) {
  return (
    <SceneFrame step={0}>
      <Press>{open}</Press>
      <ul className="mt-4 min-w-0 font-mono">
        {START_FOLDER.map((row, index) => {
          const picked = row.name === START_PATH.slice(START_PATH.lastIndexOf('/') + 1) + '/';
          const Icon = row.folder ? (picked ? FolderOpen : Folder) : FileText;
          return (
            <li
              key={row.name}
              {...beat('drop', 320 + index * STAGGER_MS)}
              className={cn(ROW, 'relative h-7 rounded-chip px-2', row.depth ? 'ml-5' : '')}
            >
              {picked ? (
                <span
                  {...beat('show', 1080)}
                  className="absolute inset-0 rounded-[inherit] bg-[color:var(--color-indigo-accent-a12)]"
                />
              ) : null}
              <Icon size={ICON_SIZE.sm} className={cn('relative shrink-0', picked ? 'text-[color:var(--color-indigo-accent)]' : QUIET)} />
              <span className={cn('relative min-w-0 truncate', picked ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>
                {row.name}
              </span>
            </li>
          );
        })}
      </ul>
    </SceneFrame>
  );
}

const DRAFT_BRANCH = ['', '-top-1.5 h-[1.375rem]', '-top-[1.375rem] h-[2.375rem]'] as const;

export function DraftScene({ ask, labelOf }: { ask: string; labelOf: (id: string) => string }) {
  return (
    <SceneFrame step={1}>
      <Press accent>{ask}</Press>
      <ul className="mt-4 flex min-w-0 flex-col gap-1.5">
        {START_DRAFT.map((id, index) => (
          <li key={id} {...beat('drop', 360 + index * DRAFT_STAGGER_MS)} className={cn('relative flex min-w-0', index && 'ml-6')}>
            {index ? (
              <span
                aria-hidden
                className={cn('absolute -left-[0.5625rem] w-[0.5625rem] border-b border-l border-[color:var(--color-border-strong)]', DRAFT_BRANCH[index])}
              />
            ) : null}
            <span className="flex h-8 min-w-0 items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2.5 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
              <OntologyMapKindGlyph kind={kindOf(id)} size={10} />
              <span className="min-w-0 truncate">{labelOf(id)}</span>
            </span>
          </li>
        ))}
      </ul>
    </SceneFrame>
  );
}

function Switch({ on, flips = false }: { on: boolean; flips?: boolean }) {
  return (
    <span
      className={cn('relative inline-flex h-[1.125rem] w-8 shrink-0 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)]', flips && 'gateway-step-press')}
    >
      {on ? (
        <span {...(flips ? beat('show', 240) : {})} className="absolute -inset-px rounded-full bg-[color:var(--color-indigo-accent)]" />
      ) : null}
      {/* The knob is grey off and dark on, so it always contrasts with its track; while it slides
          across, the grey face fades off it. */}
      <span
        {...(flips ? beat('knob', 240) : {})}
        className={cn(
          'absolute top-[1px] size-3.5 rounded-full',
          on ? 'right-[1px] bg-[color:var(--color-text-on-accent)]' : 'left-[1px] bg-[color:var(--color-text-tertiary)]',
        )}
      >
        {on && flips ? (
          <span
            {...beat('hide', 240)}
            className="absolute inset-0 rounded-full bg-[color:var(--color-text-tertiary)] opacity-0"
          />
        ) : null}
      </span>
    </span>
  );
}

function AgentRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">{name}</span>
      <span className="relative block text-body-lg leading-body-lg">{children}</span>
    </span>
  );
}

const AGENT_CARD =
  'flex min-w-0 items-center gap-3 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-3 py-2';

export function ConnectScene({ place, connected, connect }: { place: string; connected: string; connect: string }) {
  return (
    <SceneFrame step={2}>
      <p className={cn('text-body-lg leading-body-lg', QUIET)}>{place}</p>
      <div className="mt-3 flex min-w-0 flex-col gap-1.5">
        <div className={AGENT_CARD}>
          <AgentRow name="Claude Code">
            <span {...beat('hide', 300)} className={cn('absolute inset-0 opacity-0', QUIET)}>
              {connect}
            </span>
            <span {...beat('show', 300)} className="block truncate text-[color:var(--color-indigo-accent)]">
              {connected}
            </span>
          </AgentRow>
          <Switch on flips />
          <span className="flex min-w-10 flex-1 items-center">
            <span
              {...beat('draw', 560, MOTION.slow.duration * 1000)}
              className="h-px min-w-0 flex-1 origin-left bg-[color:var(--color-indigo-accent)]"
            />
            <MapGlyph />
          </span>
        </div>
        <div className={AGENT_CARD}>
          <AgentRow name="Codex">
            <span className={cn('block truncate', QUIET)}>{connect}</span>
          </AgentRow>
          <Switch on={false} />
          <span className="min-w-10 flex-1" />
        </div>
      </div>
    </SceneFrame>
  );
}

function MapGlyph() {
  const shape = (
    <>
      <path d="M5 17 L22 6 L39 24" fill="none" strokeWidth="1.25" />
      <circle cx="5" cy="17" r="3.5" />
      <circle cx="22" cy="6" r="3.5" />
      <circle cx="39" cy="24" r="3.5" />
    </>
  );
  return (
    <span className="relative block h-[34px] w-11 shrink-0">
      <svg viewBox="0 0 44 34" className="absolute inset-0 fill-[color:var(--color-text-tertiary)] stroke-[color:var(--color-text-tertiary)]">
        {shape}
      </svg>
      <svg
        {...beat('show', 920)}
        viewBox="0 0 44 34"
        className="absolute inset-0 fill-[color:var(--color-indigo-accent)] stroke-[color:var(--color-indigo-accent)]"
      >
        {shape}
      </svg>
    </span>
  );
}
