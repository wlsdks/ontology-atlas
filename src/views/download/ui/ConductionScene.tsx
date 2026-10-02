'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SquareTerminal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GITHUB_REPO_URL } from '@/shared/config/social-links';
import { cn } from '@/shared/lib/cn';
import { EXIT_TRANSITION, MOTION_EASE } from '@/shared/motion';
import { SPRING, springEasing } from '@/shared/motion/spring';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { OntologyMapKindGlyph } from '@/shared/ui/map-kind-glyph';

import {
  buildConductionGeometry,
  conductionSets,
  conductionStill,
  conductionTiming,
  conductionTracks,
  LIGHT_LAYERS,
  relationKey,
  type ConductionEasing,
  type ConductionLight,
  type SceneGeometry,
  type ScenePath,
} from '../lib/conduction-scene';
import {
  answeredNeighbours,
  CONDUCTION_ANSWER,
  CONDUCTION_PROPOSAL,
  CONDUCTION_QUERY,
} from '../model/conduction-cast';

const PART = 'data-conduction-part';
const REST_ALPHA = 'var(--map-ego-rest-alpha)';
const REPOSITORY = `${GITHUB_REPO_URL.slice(GITHUB_REPO_URL.lastIndexOf('/') + 1)}/`;

type Bucket = 'answer' | 'held' | 'dim';
interface Running {
  part: string;
  lane: number;
  animation: Animation;
}

const cubicBezier = (points: readonly number[]) => `cubic-bezier(${points.join(', ')})`;

function conductionEasing(): ConductionEasing {
  const linear =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('transition-timing-function', 'linear(0, 1)');
  const ease = cubicBezier(MOTION_EASE);
  return {
    ease,
    exit: cubicBezier(EXIT_TRANSITION.ease),
    canvas: linear ? springEasing(SPRING.canvas) : ease,
    surface: linear ? springEasing(SPRING.surface) : ease,
    control: linear ? springEasing(SPRING.control) : ease,
  };
}

function readLight(element: Element): ConductionLight {
  const style = getComputedStyle(element);
  const read = (name: string) => Number.parseFloat(style.getPropertyValue(name));
  return {
    speed: read('--map-light-speed'),
    hopMinMs: read('--map-light-hop-min-ms'),
    hopMaxMs: read('--map-light-hop-max-ms'),
    tail: read('--map-light-tail'),
    intensity: read('--map-light-intensity'),
    bloomTauMs: read('--map-light-bloom-tau') * 1000,
    restAlpha: read('--map-ego-rest-alpha'),
  };
}

function part(key: string, extra?: CSSProperties) {
  return { [PART]: key, style: { ...(conductionStill(key, REST_ALPHA) as CSSProperties), ...extra } };
}

const maskId = (ids: string, path: ScenePath) => `${ids}-reveal-${path.key.replace(/[^a-z0-9]/gi, '-')}`;

export interface ConductionSceneProps {
  available: number;
  labelOf: (id: string) => string;
  focusDomain: string;
  animate: boolean;
  running: boolean;
  generation: number;
  onFinished: () => void;
  onRefused: () => void;
}

export default function ConductionScene({
  available,
  labelOf,
  focusDomain,
  animate,
  running,
  generation,
  onFinished,
  onRefused,
}: ConductionSceneProps) {
  const tKinds = useTranslations('kinds');
  const sceneRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef<Running[]>([]);
  const lightRef = useRef<ConductionLight | null>(null);
  const playingRef = useRef(running);
  const callbacks = useRef({ onFinished, onRefused });
  const geometry = useMemo(() => buildConductionGeometry(available), [available]);
  const geometryRef = useRef(geometry);
  const [agentBlock, setAgentBlock] = useState<HTMLDivElement | null>(null);
  const [agentHeight, setAgentHeight] = useState(0);

  useLayoutEffect(() => {
    callbacks.current = { onFinished, onRefused };
  });

  useLayoutEffect(() => {
    if (!agentBlock) return;
    const read = () => setAgentHeight(Math.ceil(agentBlock.offsetHeight));
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(agentBlock);
    return () => observer.disconnect();
  }, [agentBlock]);

  useLayoutEffect(() => {
    geometryRef.current = geometry;
    const light = lightRef.current;
    if (!light || runningRef.current.length === 0) return;
    const tracks = conductionTracks(geometry, conductionEasing(), light);
    for (const { part: key, lane, animation } of runningRef.current) {
      const frames = tracks[key]?.[lane];
      if (frames && typeof KeyframeEffect !== 'undefined' && animation.effect instanceof KeyframeEffect) {
        animation.effect.setKeyframes(frames);
      }
    }
  }, [geometry]);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !animate) return undefined;
    const light = (lightRef.current ??= readLight(scene));
    const tracks = conductionTracks(geometryRef.current, conductionEasing(), light);
    const options = conductionTiming(generation === 0 && !playingRef.current);
    const created: Running[] = [];
    try {
      for (const element of scene.querySelectorAll<HTMLElement | SVGElement>(`[${PART}]`)) {
        const key = element.getAttribute(PART) ?? '';
        (tracks[key] ?? []).forEach((frames, lane) => {
          const animation = element.animate(frames, options);
          if (!playingRef.current) animation.pause();
          created.push({ part: key, lane, animation });
        });
      }
    } catch {
      for (const { animation } of created) animation.cancel();
      let live = true;
      void Promise.resolve().then(() => {
        if (live) callbacks.current.onRefused();
      });
      return () => {
        live = false;
      };
    }
    runningRef.current = created;
    let live = true;
    void Promise.all(created.map(({ animation }) => animation.finished)).then(
      () => {
        if (live) callbacks.current.onFinished();
      },
      () => undefined,
    );
    return () => {
      live = false;
      for (const { animation } of created) animation.cancel();
      runningRef.current = [];
    };
  }, [animate, generation, geometry.layout]);

  useLayoutEffect(() => {
    playingRef.current = running;
    for (const { animation } of runningRef.current) {
      if (running) animation.play();
      else animation.pause();
    }
  }, [running]);

  const height = Math.max(geometry.height, geometry.agent.y + agentHeight + 20);
  const sets = conductionSets();
  const bucketOf = (id: string): Bucket => (sets.answer.has(id) ? 'answer' : sets.held.has(id) ? 'held' : 'dim');

  return (
    <div
      ref={sceneRef}
      aria-hidden
      data-testid="download-conduction-scene"
      data-conduction-layout={geometry.layout}
      className="relative"
      style={{ width: geometry.width, height }}
    >
      <ConductionStrata geometry={geometry} height={height} bucketOf={bucketOf} />

      {geometry.tierLabelX !== null ? (
        <div {...part('plane')}>
          {geometry.tiers.map((tier) => (
            <p
              key={tier.kind}
              className={cn(
                'absolute -translate-y-1/2 bg-[color:var(--map-canvas-bg-near)] pr-2 text-label leading-label text-[color:var(--color-text-quaternary)]',
                tier.kind === 'code' && 'font-mono',
              )}
              style={{ left: geometry.tierLabelX ?? 0, top: tier.y }}
            >
              {tier.kind === 'code' ? REPOSITORY : tKinds(tier.kind)}
            </p>
          ))}
        </div>
      ) : null}

      {(['dim', 'held', 'answer'] as const).map((bucket) => (
        <div key={bucket} {...(bucket === 'answer' ? {} : part(`${bucket}:labels`))}>
          {geometry.labels
            .filter((label) => bucketOf(label.id) === bucket)
            .map((label) => (
              <p
                key={label.id}
                {...part(`label:${label.id}`, { left: label.x, top: label.y, maxWidth: label.maxWidth })}
                className={cn(
                  'absolute bg-[color:var(--map-canvas-bg-near)] px-1',
                  label.align === 'center'
                    ? '-translate-x-1/2 text-center text-caption leading-caption'
                    : '-translate-y-1/2 text-label leading-label',
                  label.id.startsWith('project:')
                    ? 'text-[color:var(--map-label-project)]'
                    : 'text-[color:var(--map-label-domain)]',
                )}
              >
                {labelOf(label.id)}
              </p>
            ))}
        </div>
      ))}

      <p
        className="absolute -translate-x-1/2 -translate-y-1/2 bg-[color:var(--map-canvas-bg-near)] px-1 font-mono text-caption leading-caption text-[color:var(--color-indigo-text-soft)]"
        {...part('mcp-label', { left: geometry.mcpLabel.x, top: geometry.mcpLabel.y })}
      >
        MCP
      </p>

      <div
        ref={setAgentBlock}
        className="@container absolute"
        style={{ left: geometry.agent.x, top: geometry.agent.y, width: geometry.agent.width }}
      >
        <ConductionAgent labelOf={labelOf} focusDomain={focusDomain} />
      </div>
    </div>
  );
}

function ConductionStrata({
  geometry,
  height,
  bucketOf,
}: {
  geometry: SceneGeometry;
  height: number;
  bucketOf: (id: string) => Bucket;
}) {
  const ids = useId();
  const markById = new Map(geometry.marks.map((mark) => [mark.id, mark]));
  const focus = markById.get(CONDUCTION_QUERY.concept)!;
  const pathByKey = new Map([...geometry.contains, ...geometry.depends].map((path) => [path.key, path]));
  const egoPaths = CONDUCTION_ANSWER.map((relation) => pathByKey.get(relationKey(relation))!);

  const layer = (name: 'edges' | 'files' | 'marks', render: (bucket: Bucket) => ReactNode) => (
    <>
      <g {...part(`dim:${name}`)}>{render('dim')}</g>
      <g {...part(`held:${name}`)}>{render('held')}</g>
      <g>{render('answer')}</g>
    </>
  );

  const light = (key: string, path: ScenePath) =>
    LIGHT_LAYERS.map((layerName) => (
      <path
        key={`${key}/${layerName}`}
        d={path.d}
        pathLength={1}
        stroke="var(--map-indigo-bright)"
        strokeLinecap="round"
        {...part(`${key}/${layerName}`, {
          strokeWidth: layerName === 'halo' ? 'var(--map-light-halo-px)' : 'var(--map-light-core-px)',
        })}
      />
    ));

  const bloom = (key: string, id: string) => {
    const mark = markById.get(id)!;
    return <circle key={key} cx={mark.x} cy={mark.y} r={mark.size * 1.75} fill={`url(#${ids}-bloom)`} {...part(key)} />;
  };

  return (
    <svg
      width={geometry.width}
      height={height}
      viewBox={`0 0 ${geometry.width} ${height}`}
      className="absolute inset-0 block overflow-visible"
      fill="none"
    >
      <defs>
        <radialGradient id={`${ids}-bloom`}>
          <stop offset="0" style={{ stopColor: 'var(--map-indigo-bright)', stopOpacity: 0.9 }} />
          <stop offset="0.35" style={{ stopColor: 'var(--map-indigo-bright)', stopOpacity: 0.28 }} />
          <stop offset="1" style={{ stopColor: 'var(--map-indigo-bright)', stopOpacity: 0 }} />
        </radialGradient>
        {[...geometry.depends, geometry.proposal].map((path) => (
          <mask key={path.key} id={maskId(ids, path)} maskUnits="userSpaceOnUse" x={0} y={0} width={geometry.width} height={height}>
            <path
              d={path.d}
              stroke="white"
              strokeWidth={6}
              pathLength={1}
              strokeDasharray="1 2"
              {...part(path === geometry.proposal ? 'proposal-reveal' : `edge:${path.key}`)}
            />
          </mask>
        ))}
      </defs>

      <g {...part('plane')}>
        {geometry.tiers.map((tier) => (
          <line
            key={tier.kind}
            x1={geometry.tierLabelX ?? geometry.planeX0}
            x2={geometry.planeX1}
            y1={tier.y}
            y2={tier.y}
            stroke="var(--color-border-soft)"
            strokeWidth={1}
          />
        ))}
      </g>

      {layer('edges', (bucket) => (
        <>
          {geometry.links
            .filter((link) => bucketOf(link.key) === bucket)
            .map((link) => (
              <path
                key={link.key}
                d={link.d}
                pathLength={1}
                strokeDasharray="1 2"
                stroke="var(--color-border-strong)"
                strokeWidth={1}
                {...part(link.key)}
              />
            ))}
          {geometry.contains
            .filter((path) => bucketOf(path.key) === bucket)
            .map((path) => (
              <path
                key={path.key}
                d={path.d}
                pathLength={1}
                strokeDasharray="1 2"
                stroke="var(--map-edge-contains-mark)"
                strokeWidth={1}
                {...part(`edge:${path.key}`)}
              />
            ))}
          {geometry.depends
            .filter((path) => bucketOf(path.key) === bucket)
            .map((path) => (
              <path
                key={path.key}
                d={path.d}
                stroke="var(--map-edge-depends-mark)"
                strokeWidth={1}
                strokeDasharray="3 3"
                mask={`url(#${maskId(ids, path)})`}
              />
            ))}
        </>
      ))}

      {CONDUCTION_ANSWER.map((relation, index) => {
        const path = egoPaths[index]!;
        return (
          <path
            key={`lit:${path.key}`}
            d={path.d}
            stroke="var(--map-edge-selected)"
            strokeWidth={1}
            strokeDasharray={relation.relation === 'depends' ? '3 3' : undefined}
            mask={relation.relation === 'depends' ? `url(#${maskId(ids, path)})` : undefined}
            {...part(`lit:${index}`)}
          />
        );
      })}

      <g mask={`url(#${maskId(ids, geometry.proposal)})`}>
        <path
          d={geometry.proposal.d}
          stroke="var(--color-indigo-accent)"
          strokeWidth={1.25}
          strokeDasharray="4 3"
          {...part('proposal-pending')}
        />
        <path
          d={geometry.proposal.d}
          stroke="var(--map-edge-selected)"
          strokeWidth={1}
          strokeDasharray="3 3"
          {...part('proposal-written')}
        />
      </g>

      <path
        d={geometry.query.d}
        pathLength={1}
        strokeDasharray="1 2"
        stroke="var(--color-indigo-line-a40)"
        strokeWidth={1}
        {...part('query-line')}
      />
      <circle
        cx={geometry.port.x}
        cy={geometry.port.y}
        r={2}
        fill="var(--map-canvas-bg-near)"
        stroke="var(--color-indigo-line-a40)"
        strokeWidth={1}
        {...part('ask')}
      />

      {light('light:query', geometry.query)}
      {egoPaths.map((path, index) => light(`light:ego:${index}`, path))}
      {light('light:reply', geometry.reply)}
      {light('light:write', geometry.proposal)}

      {bloom('bloom:query', CONDUCTION_QUERY.concept)}
      {CONDUCTION_ANSWER.map((relation, index) => bloom(`bloom:ego:${index}`, relation.to))}
      {bloom('bloom:write', CONDUCTION_PROPOSAL.to)}

      {layer('files', (bucket) =>
        geometry.files
          .filter((file) => bucketOf(`link:${file.owner}`) === bucket)
          .map((file) => (
            <rect
              key={file.owner}
              x={file.x - 3.5}
              y={file.y - 5}
              width={7}
              height={9}
              rx={1}
              fill="var(--map-node-fill-element)"
              stroke="var(--color-text-quaternary)"
              strokeWidth={1}
              {...part(`file:${file.owner}`)}
            />
          )),
      )}

      {layer('marks', (bucket) =>
        geometry.marks
          .filter((mark) => bucketOf(mark.id) === bucket)
          .map((mark) => (
            <g key={mark.id} transform={`translate(${mark.x} ${mark.y})`}>
              <g {...part(`rise:${mark.id}`)}>
                <g transform={`translate(${-mark.size / 2} ${-mark.size / 2})`}>
                  <OntologyMapKindGlyph kind={mark.kind} size={mark.size} />
                </g>
              </g>
            </g>
          )),
      )}

      <circle
        cx={focus.x}
        cy={focus.y}
        r={focus.size / 2 + 3.5}
        stroke="var(--map-selection-ring-indigo)"
        strokeWidth={1.25}
        {...part('ring')}
      />
    </svg>
  );
}

function ConductionAgent({ labelOf, focusDomain }: { labelOf: (id: string) => string; focusDomain: string }) {
  const t = useTranslations('downloadConduction');
  const tDownload = useTranslations('download');
  const tPermission = useTranslations('acpChat.permission');
  const tHeadline = useTranslations('ontologyChangeReview.headline');
  const neighbours = answeredNeighbours();

  return (
    <div className="grid min-w-0 @min-[34rem]:grid-cols-2 @min-[34rem]:gap-x-10">
      <div className="min-w-0">
        <div {...part('ask')}>
          <p className="flex min-w-0 items-center gap-2 text-label leading-label text-[color:var(--color-text-tertiary)]">
            <SquareTerminal size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
            <span className="min-w-0 truncate">{t('agent')}</span>
          </p>
          <p className="truncate pl-5 font-mono text-label leading-label text-[color:var(--color-text-primary)]">
            {CONDUCTION_QUERY.tool}
          </p>
          <p className="truncate pl-5 font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
            {CONDUCTION_QUERY.slug}
          </p>
        </div>

        <div className="mt-4 pl-5">
          <p className="flex min-w-0 items-center gap-1.5 text-label leading-label" {...part('answer:0')}>
            <OntologyMapKindGlyph kind="capability" size={11} />
            <span className="min-w-0 truncate text-[color:var(--color-text-primary)]">
              {labelOf(CONDUCTION_QUERY.concept)}
            </span>
            <span className="shrink-0 text-[color:var(--color-text-quaternary)]">· {labelOf(focusDomain)}</span>
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {neighbours.map((id, index) => (
              <li
                key={id}
                className="flex min-w-0 items-center gap-1.5 text-label leading-label text-[color:var(--color-text-secondary)]"
                {...part(`answer:${index + 1}`)}
              >
                <OntologyMapKindGlyph kind={id.slice(0, id.indexOf(':'))} size={9} />
                <span className="truncate">{labelOf(id)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="mt-4 min-w-0 border-t border-[color:var(--color-border-soft)] pl-5 pt-3 @min-[34rem]:mt-0 @min-[34rem]:border-l @min-[34rem]:border-t-0 @min-[34rem]:pt-0"
        {...part('proposal')}
      >
        <p className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">{t('proposal')}</p>
        <p className="mt-1 text-label leading-label text-[color:var(--color-text-secondary)]">
          {tHeadline('relate', { from: labelOf(CONDUCTION_PROPOSAL.from), to: labelOf(CONDUCTION_PROPOSAL.to) })}
        </p>
        <p className="mt-2 flex min-w-0 items-center gap-2">
          <span className="text-caption leading-caption text-[color:var(--color-text-quaternary)]">
            {tDownload('acpUserLabel')}
          </span>
          <span
            className={badgeClass({
              shape: 'tag',
              className: 'relative h-6 gap-1.5 border border-[color:var(--color-indigo-line-a40)] text-[color:var(--color-text-primary)]',
            })}
            {...part('press')}
          >
            <span aria-hidden className="absolute inset-0 rounded-chip bg-[color:var(--color-indigo-a16)]" {...part('allowed')} />
            <svg width={ICON_SIZE.sm} height={ICON_SIZE.sm} viewBox="0 0 24 24" fill="none" className="relative shrink-0">
              <path
                d="M20 6 9 17l-5-5"
                stroke="var(--color-indigo-text-soft)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1 2"
                {...part('check')}
              />
            </svg>
            <span className="relative">{tPermission('allowOnce')}</span>
          </span>
        </p>
      </div>
    </div>
  );
}
