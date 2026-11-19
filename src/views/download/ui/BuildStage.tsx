'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Folder, FolderOpen, GitCommitHorizontal, MousePointer2, Play, Pointer, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/controls/button';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { agentRelationDrawn, isNamed, linkingRelation, targetConcept, type BuildState } from '../lib/build-play';
import {
  AGENT_RELATION,
  BUILD_CHANGE,
  BUILD_CONCEPTS,
  BUILD_FILES,
  BUILD_RELATIONS,
  BUILD_REPO,
  CODE_NAMED,
  fileNameOf,
  filesOf,
  PERSON_RELATION,
  type BuildConceptId,
  type BuildRelation,
} from '../model/build-cast';
import { TypedLetters } from './TypedLetters';

/** Files of the concept being named stack this far apart, in percent of the stage height. */
const STACK_STEP = 12;
const FOLDER_AT = { x: 50, y: 48 };
/** A press that travels this far is a drag, not a tap. */
const DRAG_START_PX = 6;
/** The wire's free end catches the concept it is drawn to within this distance. */
const SNAP_PX = 44;
const SPARKS = 8;

/** A double click on a control that stays in place would answer twice; only its first press counts. */
export const isFirstPress = (event: MouseEvent<HTMLElement>) => event.detail <= 1;

/** Pixel sparks thrown once from a concept's dot: when it is named, when a line reaches it, and when the map is done. */
export function Burst({ delay }: { delay: string }) {
  return (
    <span aria-hidden className="build-burst absolute inset-0" style={{ '--burst-delay': delay } as CSSProperties}>
      {Array.from({ length: SPARKS }, (_, index) => (
        <i key={index} className="build-spark absolute left-1/2 top-1/2" style={{ '--a': `${(360 / SPARKS) * index}deg` } as CSSProperties} />
      ))}
    </span>
  );
}

const labelPoint = (rel: BuildRelation, point: (id: BuildConceptId) => { x: number; y: number }) => {
  const [a, b] = [point(rel.from), point(rel.to)];
  return { x: a.x + (b.x - a.x) * rel.labelAt, y: a.y + (b.y - a.y) * rel.labelAt };
};

const at = (point: { x: number; y: number }, extra?: CSSProperties) => ({ '--x': point.x, '--y': point.y, ...extra }) as CSSProperties;

/**
 * The sample map: the folder, its files, the concepts they become, the relations the person
 * draws and the commit that lands on one concept. Everything is placed in percent of the stage,
 * and every move is one transition per input.
 */
export function BuildStage({
  state,
  nameOf,
  onTap,
  onStart,
}: {
  state: BuildState;
  nameOf: (concept: BuildConceptId) => string;
  onTap: (concept: BuildConceptId) => void;
  onStart: () => void;
}) {
  const t = useTranslations('download.build');
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { phase, built } = state;
  const opened = phase !== 'closed';
  const grouped = opened && (phase !== 'building' || built >= 1);
  /** The concept the agent is about to write, while it builds. */
  const writing = phase === 'building' ? built - 1 : null;
  const relation = linkingRelation(state);
  const committed = ['impact', 'inspect', 'done'].includes(phase);
  const commitShown = ['commit', 'impact', 'inspect', 'done'].includes(phase);
  const point = (id: BuildConceptId) => BUILD_CONCEPTS.find((concept) => concept.id === id)!.at;
  const px = (p: { x: number; y: number }) => ({ x: (p.x / 100) * size.width, y: (p.y / 100) * size.height });

  const target = targetConcept(state);

  // A relation is drawn with two taps; after the first, a dashed wire follows a mouse, as the map's
  // relation editor previews one. A drag from one concept onto the other is accepted as well.
  // The wire is moved outside React per frame.
  const wire = useRef<SVGGElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [handDrawn, setHandDrawn] = useState<readonly number[]>([]);
  if (state.links === 0 && handDrawn.length > 0) setHandDrawn([]);
  const grabbable = (concept: BuildConceptId) => relation !== null && concept === (state.pick ?? relation.from);

  const local = (event: PointerEvent) => {
    const box = stage.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const hideWire = () => wire.current?.removeAttribute('data-live');
  const aimWire = (end: { x: number; y: number }) => {
    const group = wire.current;
    if (!group || !relation) return;
    const from = px(point(state.pick ?? relation.from));
    const goal = px(point(relation.to));
    const snapped = Math.hypot(end.x - goal.x, end.y - goal.y) < SNAP_PX;
    const tip = snapped ? goal : end;
    const [line, dot] = group.children;
    line.setAttribute('x1', `${from.x}`);
    line.setAttribute('y1', `${from.y}`);
    line.setAttribute('x2', `${tip.x}`);
    line.setAttribute('y2', `${tip.y}`);
    dot.setAttribute('cx', `${tip.x}`);
    dot.setAttribute('cy', `${tip.y}`);
    group.setAttribute('data-live', '');
    group.toggleAttribute('data-snapped', snapped);
  };

  useEffect(() => {
    if (state.pick === null && !drag.current) hideWire();
  }, [state.pick, state.phase]);

  const grab = (concept: BuildConceptId, event: PointerEvent<HTMLButtonElement>) => {
    if (!grabbable(concept) || event.button !== 0) return;
    // A press that may become a drag must not start a text selection across the stage.
    if (event.pointerType === 'mouse') event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, ...local(event), moved: false };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    const end = local(event);
    if (held && held.pointer === event.pointerId) {
      if (!held.moved && Math.hypot(end.x - held.x, end.y - held.y) < DRAG_START_PX) return;
      if (!held.moved && state.pick === null && relation) onTap(relation.from);
      held.moved = true;
      aimWire(end);
    } else if (state.pick !== null && event.pointerType === 'mouse') {
      aimWire(end);
    }
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    if (!held || held.pointer !== event.pointerId) return;
    drag.current = null;
    if (!held.moved) return;
    // The click that follows this release would answer the drag a second time.
    swallowClick.current = true;
    window.setTimeout(() => (swallowClick.current = false), 0);
    const end = local(event);
    const goal = relation ? px(point(relation.to)) : null;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-build-node]');
    const dropped = goal && Math.hypot(end.x - goal.x, end.y - goal.y) < SNAP_PX ? relation!.to : (under?.dataset.buildNode as BuildConceptId | undefined);
    if (dropped && dropped !== (state.pick ?? relation?.from)) {
      if (dropped === relation?.to) setHandDrawn((drawn) => [...drawn, BUILD_RELATIONS.indexOf(relation)]);
      onTap(dropped);
    } else if (event.pointerType !== 'mouse') {
      hideWire();
    }
  };

  return (
    <div
      role="group"
      aria-label={t('stageLabel')}
      data-testid="build-stage"
      data-build-phase={phase}
      className="build-stage flex min-h-0 w-full flex-1 items-start overflow-hidden"
    >
      <div
        ref={stage}
        className="build-map relative w-full"
        data-own-pointer={relation !== null || undefined}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={(event) => {
          if (drag.current?.pointer !== event.pointerId) return;
          drag.current = null;
          hideWire();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse' && !drag.current) hideWire();
        }}
      >
        {/* Relations, measured in pixels so each line draws from one end to the other. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}>
          {BUILD_RELATIONS.map((rel, index) => {
            const a = px(point(rel.from));
            const b = px(point(rel.to));
            const drawn = rel.by === 'agent' ? agentRelationDrawn(state) : state.links > 0;
            const hot = committed && phase !== 'done' && (rel.from === BUILD_CHANGE.concept || rel.to === BUILD_CHANGE.concept);
            return (
              <line
                key={rel.label}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                pathLength={1}
                data-drawn={drawn || undefined}
                data-by-hand={handDrawn.includes(index) || undefined}
                data-hot={hot || undefined}
                className="build-edge"
              />
            );
          })}
          {/* The commit's reach: a light runs out from the changed concept along each of its relations. */}
          {phase === 'impact'
            ? BUILD_RELATIONS.map((rel) => {
                if (rel.from !== BUILD_CHANGE.concept && rel.to !== BUILD_CHANGE.concept) return null;
                const [a, b] = rel.from === BUILD_CHANGE.concept ? [px(point(rel.from)), px(point(rel.to))] : [px(point(rel.to)), px(point(rel.from))];
                return <line key={rel.label} x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} className="build-pulse" />;
              })
            : null}
          <g ref={wire} className="build-wire">
            <line />
            <circle r={4} />
          </g>
        </svg>

        {/* The folder, closed until it is opened, then left behind as its files fly out. */}
        <div className="build-at" data-shown={!opened || undefined} inert={opened} style={at(FOLDER_AT)}>
          <div className="build-center build-folder flex flex-col items-center gap-2 text-center">
            <span className="build-folder-icon relative grid size-16 place-items-center rounded-card">
              {opened ? <FolderOpen size={ICON_SIZE.lg} aria-hidden className="size-8" /> : <Folder size={ICON_SIZE.lg} aria-hidden className="size-8" />}
            </span>
            <span className="font-mono text-body leading-body text-[color:var(--color-text-primary)]">{BUILD_REPO}/</span>
            <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('files', { count: BUILD_FILES.length })}</span>
            {/* The mission card: what winning means, and the one button that starts the run. */}
            <span className="build-mission-chip mt-2 rounded-chip px-2 py-0.5 text-label leading-label">{t('mission.eyebrow')}</span>
            <span className="max-w-[16rem] text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] @min-[40rem]:max-w-[22rem] @min-[40rem]:text-title @min-[40rem]:leading-title">
              {t('mission.title')}
            </span>
            <span aria-hidden className="flex gap-1.5 text-[color:var(--color-text-tertiary)]">
              {[0, 1, 2].map((index) => (
                <Star key={index} size={ICON_SIZE.lg} />
              ))}
            </span>
            <Button data-testid="build-open" variant="outline" className="build-start mt-1 gap-2 px-6" onClick={onStart}>
              <Play size={ICON_SIZE.sm} aria-hidden fill="currentColor" />
              {t('actions.start')}
            </Button>
          </div>
        </div>

        {BUILD_FILES.map((file, order) => {
          const conceptOrder = BUILD_CONCEPTS.findIndex((concept) => concept.id === file.concept);
          const siblings = filesOf(file.concept);
          const slot = siblings.indexOf(file);
          const anchor = point(file.concept);
          const absorbed = isNamed(state, conceptOrder);
          const place = !opened
            ? FOLDER_AT
            : !grouped
              ? file.loose
              : absorbed
                ? anchor
                : { x: anchor.x, y: anchor.y + (slot - (siblings.length - 1) / 2) * STACK_STEP };
          const presence = !opened || absorbed ? 'gone' : grouped && writing !== conceptOrder ? 'waiting' : 'live';
          return (
            <div
              key={file.path}
              className="build-at build-file-at"
              data-file={presence}
              inert={presence === 'gone'}
              style={at(place, { '--delay': `calc(var(--motion-stagger) * ${opened && !grouped ? order : slot})` } as CSSProperties)}
            >
              <span className="build-center build-file inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1 font-mono text-label leading-label @min-[40rem]:px-3 @min-[40rem]:py-1.5 @min-[40rem]:text-body @min-[40rem]:leading-body">
                <span aria-hidden className="build-file-dot size-1.5 shrink-0 rounded-full" />
                {fileNameOf(file.path)}
              </span>
            </div>
          );
        })}

        {/* The changed file, carried from the commit card into the concept that holds it. */}
        <div
          aria-hidden
          className="build-at build-carry-at"
          data-carry={phase === 'commit' ? 'card' : committed ? 'landed' : 'none'}
          style={at(committed ? point(BUILD_CHANGE.concept) : { x: 78, y: 12 })}
        >
          <span className="build-center build-carry inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1 font-mono text-label leading-label">
            {fileNameOf(BUILD_CHANGE.file)}
          </span>
        </div>

        {BUILD_RELATIONS.map((rel) => {
          const shown = rel.by === 'agent' ? agentRelationDrawn(state) : state.links > 0;
          return (
            <div key={rel.label} aria-hidden className="build-at build-edge-label-at" data-shown={shown || undefined} style={at(labelPoint(rel, point))}>
              <span className="build-center build-edge-label whitespace-nowrap rounded-chip px-2 py-0.5 text-label leading-label @min-[40rem]:px-2.5 @min-[40rem]:text-body @min-[40rem]:leading-body">
                {t(`relations.${rel.label}`)}
              </span>
            </div>
          );
        })}

        {BUILD_CONCEPTS.map((concept, order) => {
          const named = isNamed(state, order);
          const changed = committed && concept.id === BUILD_CHANGE.concept;
          const codeNamed = concept.id === CODE_NAMED.concept && state.renamed === null;
          const linkedByPerson = state.links > 0 && concept.id === PERSON_RELATION.to;
          const linkedByAgent = agentRelationDrawn(state) && concept.id === AGENT_RELATION.to;
          const burst = !named
            ? null
            : phase === 'done'
              ? 'done'
              : changed
                ? 'changed'
                : linkedByPerson
                  ? 'linked'
                  : concept.id === CODE_NAMED.concept && !codeNamed
                    ? 'renamed'
                    : linkedByAgent
                      ? 'agent-linked'
                      : 'named';
          const burstDelay =
            burst === 'done'
              ? `calc(var(--motion-stagger) * 4 * ${order})`
              : burst === 'changed'
                ? 'calc(var(--motion-choreography) * 0.8)'
                : burst === 'agent-linked' || (burst === 'linked' && !handDrawn.includes(BUILD_RELATIONS.indexOf(PERSON_RELATION)))
                  ? 'calc(var(--motion-choreography) * 0.85)'
                  : 'var(--motion-base)';
          const pickup =
            burst === 'named'
              ? t('pickup.concept')
              : burst === 'renamed'
                ? t('pickup.renamed')
                : burst === 'changed'
                  ? t('pickup.changed')
                  : burst === 'linked' || burst === 'agent-linked'
                    ? t('pickup.relation')
                    : null;
          const touched = phase === 'impact' && BUILD_RELATIONS.some((rel) => (rel.from === BUILD_CHANGE.concept && rel.to === concept.id) || (rel.to === BUILD_CHANGE.concept && rel.from === concept.id));
          const name = named ? nameOf(concept.id) : '';
          const tappable = named && (relation !== null || phase === 'impact' || phase === 'rename');
          return (
            <div key={concept.id} className="build-at build-node-at" data-shown={named || undefined} inert={!named} style={at(concept.at)}>
              <button
                type="button"
                data-testid={`build-node-${concept.id}`}
                data-build-node={concept.id}
                data-touched={touched || undefined}
                data-grab={(tappable && grabbable(concept.id)) || undefined}
                data-target={(named && target === concept.id) || undefined}
                data-picked={state.pick === concept.id || (phase === 'renaming' && concept.id === CODE_NAMED.concept) || undefined}
                data-changed={changed || undefined}
                data-checked={(phase === 'done' && changed) || undefined}
                disabled={!tappable}
                aria-label={named ? t('nodeLabel', { name, count: filesOf(concept.id).length }) : undefined}
                aria-pressed={relation ? state.pick === concept.id : undefined}
                onPointerDown={(event) => grab(concept.id, event)}
                onClick={(event) => {
                  if (swallowClick.current) return;
                  if (isFirstPress(event)) onTap(concept.id);
                }}
                className="build-node-anchor build-node group relative flex flex-col items-center gap-2 rounded-card px-3 pb-1.5 pt-3 outline-offset-2 disabled:cursor-default"
              >
                <span aria-hidden className="build-node-mark relative grid place-items-center">
                  <span className="build-node-glow absolute rounded-full" />
                  <span className="build-node-ring absolute inset-0 rounded-full" />
                  <span className="build-node-dot relative rounded-full" />
                  {burst ? <Burst key={burst} delay={burstDelay} /> : null}
                </span>
                {pickup ? (
                  <span
                    key={burst}
                    aria-hidden
                    data-tone={burst === 'changed' ? 'changed' : undefined}
                    className="build-pickup absolute left-1/2 top-0 whitespace-nowrap rounded-chip px-2 py-0.5 font-mono text-label leading-label"
                    style={{ '--burst-delay': burstDelay } as CSSProperties}
                  >
                    {pickup}
                  </span>
                ) : null}
                <span
                  data-code-name={(named && codeNamed) || undefined}
                  className={cn(
                    'build-node-name whitespace-nowrap text-body-lg leading-body-lg font-[var(--font-weight-strong)] @min-[40rem]:text-title @min-[40rem]:leading-title',
                    codeNamed && 'font-mono',
                  )}
                >
                  {named ? <TypedLetters key={name} text={name} /> : null}
                </span>
                <span className="whitespace-nowrap text-label leading-label text-[color:var(--color-text-tertiary)]">
                  {t('files', { count: filesOf(concept.id).length })}
                </span>
              </button>
            </div>
          );
        })}

        {/* After a still moment, a hand shows where to press next. */}
        {target !== null ? (
          <div
            key={`${phase}:${state.pick}:${state.misses}`}
            aria-hidden
            className="build-hint-at"
            style={{ '--x': point(target).x, '--y': point(target).y } as CSSProperties}
          >
            <span className="build-hint-ripple absolute rounded-full" />
            <Pointer size={40} strokeWidth={1.5} className="build-hint-hand absolute" />
          </div>
        ) : null}

        {/* The agent at work on its first map: a named pointer that flies to each concept it writes. */}
        <div
          aria-hidden
          className="build-at build-agent-at"
          data-shown={(writing !== null && built >= 1) || undefined}
          style={at(writing === null || built < 1 ? FOLDER_AT : built <= BUILD_CONCEPTS.length ? point(BUILD_CONCEPTS[built - 1].id) : labelPoint(AGENT_RELATION, point))}
        >
          <span className="build-agent absolute left-0 top-0 inline-flex items-start">
            <MousePointer2 size={ICON_SIZE.md} fill="currentColor" className="build-agent-pointer shrink-0" />
            <span className="build-agent-tag ml-0.5 mt-4 whitespace-nowrap rounded-chip px-2 py-0.5 text-label leading-label">Claude Code</span>
          </span>
        </div>

        {/* The agent's commit, pinned to the stage's top edge from the moment it arrives. */}
        <div
          data-testid="build-commit"
          data-shown={commitShown || undefined}
          inert={!commitShown}
          className="build-commit absolute right-3 top-3 flex max-w-[calc(100%-1.5rem)] items-start gap-2.5 rounded-card px-3 py-2.5"
        >
          <GitCommitHorizontal size={ICON_SIZE.md} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--map-recent-change)]" />
          <span className="min-w-0">
            <span className="block truncate font-mono text-label leading-label text-[color:var(--color-text-primary)]">
              {BUILD_CHANGE.sha} · {t('commitMessage')}
            </span>
            <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-tertiary)]">{t('commitAuthor')}</span>
          </span>
        </div>

      </div>
    </div>
  );
}
