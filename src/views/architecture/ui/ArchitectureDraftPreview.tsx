'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileText, Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { EXIT_TRANSITION, MOTION_EASE } from '@/shared/motion';
import { SPRING, springEasing } from '@/shared/motion/spring';
import { IconButton } from '@/shared/ui/controls';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  buildDraftPreviewGeometry,
  DRAFT_PREVIEW_CLOCK,
  DRAFT_PREVIEW_FILE,
  DRAFT_PREVIEW_ROLES,
  DRAFT_PREVIEW_VIOLATION,
  draftPreviewIterations,
  draftPreviewTracks,
  EXAMPLE_SOURCE,
  foldFolderRows,
  LIGHT_DASH,
  SENTENCE_W,
  type DraftPreviewSource,
} from '../model/draft-preview';
import { EDGE_STROKE, VIOLATED_STROKE, VIOLATION_HALO_BLUR, VIOLATION_HALO_WIDTH } from './ArchitectureSketch';

const cubicBezier = (points: readonly number[]) => `cubic-bezier(${points.join(', ')})`;

function sameSource(a: DraftPreviewSource | null, b: DraftPreviewSource | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && a.folders.join('\u0000') === b.folders.join('\u0000');
}

function readLight(element: Element) {
  const style = getComputedStyle(element);
  const read = (name: string) => Number.parseFloat(style.getPropertyValue(name));
  return {
    haloRest: read('--architecture-plane-climb-halo'),
    haloRaised: read('--architecture-plane-climb-halo-raised'),
    intensity: read('--map-light-intensity'),
    bloomTauMs: read('--map-light-bloom-tau') * 1000,
  };
}

export function ArchitectureDraftPreview({ source, still = false }: { source: DraftPreviewSource | null; still?: boolean }) {
  const t = useTranslations('architecture');
  const ids = useId();
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(source);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(0);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [generation, setGeneration] = useState(0);
  const figureRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const animationsRef = useRef<Animation[]>([]);

  const data = shown ?? EXAMPLE_SOURCE;
  const example = shown === null;
  const folded = foldFolderRows(data.folders);
  const rowLabels = folded.hidden > 0
    ? [...folded.shown, t('draftPreview.moreFolders', { count: folded.hidden })]
    : folded.shown;
  const geometry = useMemo(
    () => buildDraftPreviewGeometry(available, rowLabels.length),
    [available, rowLabels.length],
  );
  const canAnimate =
    !still && !reduced && available > 0 && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  const running = canAnimate && !finished && !userPaused && inView && pageVisible;
  const runningRef = useRef(running);

  useLayoutEffect(() => {
    if (!host) return;
    const read = () => setAvailable(Math.floor(host.clientWidth));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);

  useEffect(() => {
    const figure = figureRef.current;
    const syncPage = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', syncPage);
    let observer: IntersectionObserver | null = null;
    if (figure && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true));
      observer.observe(figure);
    }
    return () => {
      document.removeEventListener('visibilitychange', syncPage);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (sameSource(source, shown)) return undefined;
    const lead = animationsRef.current[0];
    const at = runningRef.current && lead ? Number(lead.currentTime ?? 0) % DRAFT_PREVIEW_CLOCK.loop : 0;
    const wait = at > 0 ? DRAFT_PREVIEW_CLOCK.loop - at : 0;
    const timer = window.setTimeout(() => setShown(source), wait);
    return () => window.clearTimeout(timer);
  }, [source, shown]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !canAnimate || finished) return undefined;
    const tracks = draftPreviewTracks(
      geometry,
      { ease: cubicBezier(MOTION_EASE), exit: cubicBezier(EXIT_TRANSITION.ease), spring: springEasing(SPRING.surface) },
      readLight(scene),
    );
    const timing: KeyframeAnimationOptions = {
      duration: DRAFT_PREVIEW_CLOCK.loop,
      iterations: draftPreviewIterations(),
      fill: 'both',
    };
    const created: Animation[] = [];
    for (const element of scene.querySelectorAll<HTMLElement | SVGElement>('[data-draft-part]')) {
      for (const frames of tracks[element.dataset.draftPart ?? ''] ?? []) {
        const animation = element.animate(frames, timing);
        if (!runningRef.current) animation.pause();
        created.push(animation);
      }
    }
    animationsRef.current = created;
    let live = true;
    void Promise.all(created.map((animation) => animation.finished)).then(
      () => {
        if (live) setFinished(true);
      },
      () => undefined,
    );
    return () => {
      live = false;
      for (const animation of created) animation.cancel();
      animationsRef.current = [];
    };
  }, [canAnimate, finished, geometry, generation, data]);

  useLayoutEffect(() => {
    runningRef.current = running;
    for (const animation of animationsRef.current) {
      if (running) animation.play();
      else animation.pause();
    }
  }, [running]);

  const roleLabel = (role: string) => t(`roleLabels.${role}`);
  const folderList = data.folders.join(', ');
  const story = {
    name: data.name,
    folders: folderList,
    layers: DRAFT_PREVIEW_ROLES.length,
    top: roleLabel(DRAFT_PREVIEW_ROLES[0]),
    bottom: roleLabel(DRAFT_PREVIEW_ROLES[DRAFT_PREVIEW_ROLES.length - 1]!),
    from: roleLabel(DRAFT_PREVIEW_VIOLATION.from),
    to: roleLabel(DRAFT_PREVIEW_VIOLATION.to),
    file: DRAFT_PREVIEW_FILE,
  };
  const description = example
    ? t('draftPreview.descriptionExample', story)
    : t('draftPreview.descriptionSource', story);
  const control = finished
    ? { label: t('draftPreview.replay'), icon: <RotateCcw size={ICON_SIZE.sm} aria-hidden /> }
    : userPaused
      ? { label: t('draftPreview.resume'), icon: <Play size={ICON_SIZE.sm} aria-hidden /> }
      : { label: t('draftPreview.pause'), icon: <Pause size={ICON_SIZE.sm} aria-hidden /> };
  const blurId = `${ids}-blur`;
  const revealId = `${ids}-reveal`;

  return (
    <figure
      ref={figureRef}
      data-testid="architecture-draft-preview"
      data-preview-source={example ? 'example' : 'connected'}
      data-preview-state={!canAnimate ? 'still' : finished ? 'finished' : running ? 'running' : 'paused'}
      className="architecture-canvas-ground m-0 flex min-w-0 flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] px-5 pb-6 pt-3"
    >
      <div className="flex min-h-[var(--chrome-tile-size)] items-center justify-between gap-3">
        <p className="min-w-0 truncate text-label text-[color:var(--color-text-tertiary)]" data-testid="architecture-draft-preview-label">
          {example ? t('draftPreview.exampleLabel') : t('draftPreview.sourceLabel', { name: data.name })}
        </p>
        {canAnimate ? (
          <IconButton
            size="sm"
            label={control.label}
            data-testid="architecture-draft-preview-control"
            onClick={() => {
              if (finished) {
                setUserPaused(false);
                setFinished(false);
                setGeneration((value) => value + 1);
                return;
              }
              setUserPaused((value) => !value);
            }}
          >
            {control.icon}
          </IconButton>
        ) : null}
      </div>
      <div ref={setHost} className="mt-3 flex min-w-0 justify-center">
        <div
          ref={sceneRef}
          aria-hidden
          className="relative shrink-0"
          style={{ width: geometry.width, height: geometry.height }}
        >
          <svg
            width={geometry.width}
            height={geometry.height}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="absolute inset-0 block overflow-visible"
            fill="none"
          >
            <defs>
              <filter id={blurId} filterUnits="userSpaceOnUse" x={0} y={0} width={geometry.width} height={geometry.height}>
                <feGaussianBlur stdDeviation={VIOLATION_HALO_BLUR} />
              </filter>
              <mask id={revealId} maskUnits="userSpaceOnUse" x={0} y={0} width={geometry.width} height={geometry.height}>
                <path
                  d={geometry.violation.d}
                  stroke="white"
                  strokeWidth={VIOLATION_HALO_WIDTH * 4}
                  pathLength={1}
                  strokeDasharray="1 2"
                  data-draft-part="violation-reveal"
                />
              </mask>
            </defs>

            {geometry.planes.map((plane) => (
              <g key={plane.role} data-draft-part={`plane:${plane.role}`}>
                <path d={plane.d} fill="var(--architecture-plane-fill)" />
                <line
                  x1={plane.edge.x1}
                  x2={plane.edge.x2}
                  y1={plane.edge.y}
                  y2={plane.edge.y}
                  stroke="var(--architecture-plane-edge)"
                  strokeWidth={1}
                />
              </g>
            ))}

            <g data-draft-part="folders">
              <path d={geometry.lightPath} stroke="var(--color-border-strong)" strokeWidth={1} />
            </g>
            {geometry.branches.map((branch, index) => (
              <path key={branch} d={branch} stroke="var(--color-border-strong)" strokeWidth={1} data-draft-part={`row:${index}`} />
            ))}
            {geometry.branches.map((branch, index) => (
              <path
                key={`lit-${branch}`}
                d={branch}
                stroke="var(--color-indigo-accent)"
                strokeWidth={1.5}
                opacity={0}
                data-draft-part={`branch:${index}`}
              />
            ))}
            <circle
              cx={geometry.linkPort.x}
              cy={geometry.linkPort.y}
              r={VIOLATION_HALO_WIDTH}
              fill="var(--color-indigo-accent)"
              filter={`url(#${blurId})`}
              opacity={0}
              data-draft-part="bloom"
            />
            <path
              d={geometry.lightPath}
              stroke="var(--color-indigo-accent)"
              style={{ strokeWidth: 'var(--map-light-halo-px)' }}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${LIGHT_DASH} 2`}
              filter={`url(#${blurId})`}
              opacity={0}
              data-draft-part="light"
            />
            <path
              d={geometry.lightPath}
              stroke="var(--color-indigo-text-soft)"
              style={{ strokeWidth: 'var(--map-light-core-px)' }}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${LIGHT_DASH} 2`}
              opacity={0}
              data-draft-part="light"
            />
          </svg>

          <p
            className="absolute block truncate text-right font-mono text-label leading-label text-[color:var(--color-text-secondary)]"
            style={{ right: geometry.width - geometry.labelRight, top: geometry.rootY - 8, maxWidth: geometry.labelRight }}
            data-draft-part="folders"
          >
            {`${data.name}/`}
          </p>
          {rowLabels.map((label, index) => (
            <p
              key={`${index}:${label}`}
              className={cn(
                'absolute block truncate text-right text-label leading-label',
                index === folded.shown.length
                  ? 'text-[color:var(--color-text-quaternary)]'
                  : 'font-mono text-[color:var(--color-text-tertiary)]',
              )}
              style={{ right: geometry.width - geometry.labelRight, top: geometry.rows[index]!.y - 8, maxWidth: geometry.labelRight }}
              data-draft-part={`row:${index}`}
            >
              {label}
            </p>
          ))}

          <p
            className="absolute block truncate text-label leading-label text-[color:var(--color-text-quaternary)]"
            style={{ left: geometry.faceX, top: geometry.rootY - 8, maxWidth: geometry.faceW }}
            data-draft-part={`plane:${geometry.faces[0]!.role}`}
          >
            {t('contractTrackLabel')}
          </p>
          {geometry.faces.map((face, index) => (
            <div
              key={face.role}
              className="architecture-canvas-node absolute grid grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center rounded-chip border border-[color:var(--color-architecture-sketch-ink)] bg-[color:var(--color-panel)] px-2"
              style={{ left: geometry.faceX, top: face.y, width: geometry.faceW, height: geometry.faceH }}
              data-draft-part={`face:${face.role}`}
            >
              <span className="font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="truncate text-center text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">
                {roleLabel(face.role)}
              </span>
            </div>
          ))}

          {geometry.sentence ? (
            <p
              className="absolute -translate-y-1/2 text-balance text-caption leading-caption text-[color:var(--color-danger-text)]"
              style={{ left: geometry.violation.sentence.x, top: geometry.violation.sentence.y, width: SENTENCE_W }}
              data-draft-part="violation-mark"
            >
              {`⊘ ${t('trafficEdge', {
                from: roleLabel(DRAFT_PREVIEW_VIOLATION.from),
                to: roleLabel(DRAFT_PREVIEW_VIOLATION.to),
                count: 1,
              })}`}
            </p>
          ) : null}

          <div
            className="absolute flex items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-2"
            style={{ left: geometry.chip.x, top: geometry.chip.y, height: geometry.chip.h }}
            data-draft-part="chip"
          >
            <FileText size={ICON_SIZE.sm} aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]" />
            <span className="font-mono text-caption text-[color:var(--color-text-secondary)]">{DRAFT_PREVIEW_FILE}</span>
            <svg width={ICON_SIZE.sm} height={ICON_SIZE.sm} viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path
                d="M20 6 9 17l-5-5"
                stroke="var(--color-indigo-text-soft)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1 2"
                strokeDashoffset={0}
                data-draft-part="check"
              />
            </svg>
          </div>
          <svg
            width={geometry.width}
            height={geometry.height}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            className="pointer-events-none absolute inset-0 block overflow-visible"
            fill="none"
          >
            <circle
              cx={geometry.linkPort.x}
              cy={geometry.linkPort.y}
              r={2}
              fill="var(--color-canvas)"
              stroke={EDGE_STROKE}
              strokeWidth={1.25}
              data-draft-part={`plane:${geometry.faces[geometry.faces.length - 1]!.role}`}
            />
            {geometry.arrows.map((arrow, index) => (
              <g key={arrow.from}>
                <path
                  d={`M ${arrow.x} ${arrow.y1} V ${arrow.y2}`}
                  stroke={EDGE_STROKE}
                  strokeWidth={1.25}
                  pathLength={1}
                  strokeDasharray="1 2"
                  strokeDashoffset={0}
                  data-draft-part={`arrow:${index}`}
                />
                <circle
                  cx={arrow.x}
                  cy={arrow.y1}
                  r={2}
                  fill="var(--color-canvas)"
                  stroke={EDGE_STROKE}
                  strokeWidth={1.25}
                  data-draft-part={`port:${index}`}
                />
                <path d={arrow.head} stroke={EDGE_STROKE} strokeWidth={1.25} data-draft-part={`head:${index}`} />
              </g>
            ))}

            <g data-draft-part="violation" data-testid="architecture-draft-preview-violation">
              <g mask={`url(#${revealId})`}>
                <path
                  d={geometry.violation.d}
                  stroke={VIOLATED_STROKE}
                  strokeWidth={VIOLATION_HALO_WIDTH}
                  filter={`url(#${blurId})`}
                  className="architecture-violation-halo"
                  data-draft-part="violation-halo"
                />
                <path d={geometry.violation.d} stroke={VIOLATED_STROKE} strokeWidth={1.25} strokeDasharray="5 3" />
              </g>
              <path d={geometry.violation.head} stroke={VIOLATED_STROKE} strokeWidth={1.25} data-draft-part="violation-mark" />
            </g>
          </svg>
        </div>
      </div>
      <figcaption className="sr-only" data-testid="architecture-draft-preview-description">
        {description}
      </figcaption>
    </figure>
  );
}
