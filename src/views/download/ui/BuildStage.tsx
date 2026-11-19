'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Folder, GitCommitHorizontal, MousePointer2, Sparkles, Pointer, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/controls/button';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import {
  isLinked,
  isMeasured,
  isRelationDrawn,
  isWritten,
  linkEnds,
  relationsLeft,
  targetConcepts,
  type BuildState,
} from '../lib/build-play';
import {
  BUILD_CHANGE,
  BUILD_CONCEPTS,
  BUILD_FILE_COUNT,
  BUILD_RELATIONS,
  BUILD_REPO,
  CODE_NAMED,
  conceptOf,
  fileNameOf,
  LONE_CONCEPTS,
  PERSON_RELATIONS,
  dependsOnChange,
  type BuildConceptId,
  type BuildRelation,
} from '../model/build-cast';
import { TypedLetters } from './TypedLetters';

const CENTER = { x: 50, y: 50 };
/** A press that travels this far is a drag, not a tap. */
const DRAG_START_PX = 6;
/** The wire's free end catches the concept it is drawn to within this distance. */
const SNAP_PX = 44;
const SPARKS = 8;
/** At or below this width-to-height ratio the stage uses the tall layout, as the CSS container query does. */
const TALL_RATIO = 6 / 5;

/** A double click on a control that stays in place would answer twice; only its first press counts. */
export const isFirstPress = (event: MouseEvent<HTMLElement>) => event.detail <= 1;

/** Pixel sparks thrown once from a concept's dot: when it is written, fixed, changed, and when the map is done. */
export function Burst({ delay }: { delay: string }) {
  return (
    <span aria-hidden className="build-burst absolute inset-0" style={{ '--burst-delay': delay } as CSSProperties}>
      {Array.from({ length: SPARKS }, (_, index) => (
        <i key={index} className="build-spark absolute left-1/2 top-1/2" style={{ '--a': `${(360 / SPARKS) * index}deg` } as CSSProperties} />
      ))}
    </span>
  );
}

type Point = { x: number; y: number };
const at = (point: Point, extra?: CSSProperties) => ({ '--x': point.x, '--y': point.y, ...extra }) as CSSProperties;
/** Both layouts' places; CSS picks one by the stage's shape, so nothing moves once the stage is measured. */
const placed = (where: (tall: boolean) => Point, extra?: CSSProperties) =>
  at(where(false), { '--tx': where(true).x, '--ty': where(true).y, ...extra } as CSSProperties);
const pointIn = (id: BuildConceptId, tall: boolean) => (tall ? conceptOf(id).atTall : conceptOf(id).at);
const labelIn = (rel: BuildRelation, tall: boolean) => {
  const [a, b] = [pointIn(rel.from, tall), pointIn(rel.to, tall)];
  return { x: a.x + (b.x - a.x) * rel.labelAt, y: a.y + (b.y - a.y) * rel.labelAt };
};

/** Where the agent's pointer is on each beat of its first map. */
const AGENT_AT: Record<number, BuildConceptId | 'center' | 'relations'> = { 1: 'center', 2: 'shop', 3: 'shopping', 4: 'orders', 5: 'members', 6: 'refund', 7: 'relations' };

/**
 * The sample map: the mission card, the clusters the agent writes, the relations it and the person
 * draw and the commit that lands on one concept. Everything is placed in percent of the stage, and
 * every move is one transition per input.
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
    // Unrounded, so the layout agrees with the container query at its 6/5 boundary.
    const measure = () => {
      const box = node.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { phase, built } = state;
  const opened = phase !== 'closed';
  const measured = isMeasured(state);
  const linking = phase === 'linking';
  const committed = ['impact', 'inspect', 'done'].includes(phase);
  const commitShown = ['commit', 'impact', 'inspect', 'done'].includes(phase);
  const tall = size.width > 0 && size.width / size.height <= TALL_RATIO;
  const point = (id: BuildConceptId) => pointIn(id, tall);
  const px = (p: { x: number; y: number }) => ({ x: (p.x / 100) * size.width, y: (p.y / 100) * size.height });
  const targets = targetConcepts(state);
  const ends = linkEnds(state);

  // A relation is drawn with two taps; after the first, a dashed wire follows a mouse, as the map's
  // relation editor previews one. A drag from one end onto the other is accepted as well.
  // The wire is moved outside React per frame.
  const wire = useRef<SVGGElement>(null);
  const drag = useRef<{ pointer: number; concept: BuildConceptId; x: number; y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [handDrawn, setHandDrawn] = useState<readonly BuildRelation[]>([]);
  if (state.links.length === 0 && handDrawn.length > 0) setHandDrawn([]);
  const grabbable = (concept: BuildConceptId) => linking && (state.pick === null ? ends.includes(concept) : concept === state.pick);
  const relationOf = (concept: BuildConceptId) => relationsLeft(state).find((rel) => rel.from === concept || rel.to === concept) ?? null;
  const otherEnd = (rel: BuildRelation, concept: BuildConceptId) => (rel.from === concept ? rel.to : rel.from);

  const local = (event: PointerEvent) => {
    const box = stage.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const hideWire = () => wire.current?.removeAttribute('data-live');
  const aimWire = (from: BuildConceptId, end: { x: number; y: number }) => {
    const group = wire.current;
    const rel = relationOf(from);
    if (!group || !rel) return;
    const start = px(point(from));
    const goal = px(point(otherEnd(rel, from)));
    const snapped = Math.hypot(end.x - goal.x, end.y - goal.y) < SNAP_PX;
    const tip = snapped ? goal : end;
    const [line, dot] = group.children;
    line.setAttribute('x1', `${start.x}`);
    line.setAttribute('y1', `${start.y}`);
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
    drag.current = { pointer: event.pointerId, concept, ...local(event), moved: false };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const held = drag.current;
    const end = local(event);
    if (held && held.pointer === event.pointerId) {
      if (!held.moved && Math.hypot(end.x - held.x, end.y - held.y) < DRAG_START_PX) return;
      if (!held.moved && state.pick === null) onTap(held.concept);
      held.moved = true;
      aimWire(held.concept, end);
    } else if (state.pick !== null && event.pointerType === 'mouse') {
      aimWire(state.pick, end);
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
    const rel = relationOf(held.concept);
    const goal = rel ? otherEnd(rel, held.concept) : null;
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-build-node]');
    const near = goal && Math.hypot(end.x - px(point(goal)).x, end.y - px(point(goal)).y) < SNAP_PX;
    const dropped = near ? goal : (under?.dataset.buildNode as BuildConceptId | undefined);
    if (dropped && dropped !== held.concept) {
      if (rel && dropped === goal) setHandDrawn((drawn) => [...drawn, rel]);
      onTap(dropped);
    } else if (event.pointerType !== 'mouse') {
      hideWire();
    }
  };

  const agentSpot = phase === 'building' ? AGENT_AT[built] : undefined;
  const agentPoint = (layout: boolean) =>
    agentSpot === undefined || agentSpot === 'center' ? CENTER : agentSpot === 'relations' ? labelIn(BUILD_RELATIONS[1], layout) : pointIn(agentSpot, layout);

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
        data-own-pointer={linking || undefined}
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
        {/* Each cluster's light pool, lit as the agent writes it. */}
        {BUILD_CONCEPTS.filter((concept) => concept.kind === 'domain').map((concept) => (
          <div key={concept.id} aria-hidden className="build-at build-pool-at" data-shown={isWritten(state, concept) || undefined} style={placed((layout) => pointIn(concept.id, layout))}>
            <span className="build-pool absolute rounded-full" />
          </div>
        ))}

        {/* The agent reading the repository: one band of light sweeps the stage. */}
        <span aria-hidden className="build-scan absolute inset-y-0 left-0" data-shown={(phase === 'building' && built === 1) || undefined} />

        {/* Lines, measured in pixels so each draws from one end to the other. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}>
          {BUILD_CONCEPTS.map((concept) => {
            if (!concept.parent) return null;
            const a = px(point(concept.parent));
            const b = px(point(concept.id));
            return <line key={concept.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} data-drawn={isWritten(state, concept) || undefined} className="build-tree" />;
          })}
          {BUILD_RELATIONS.map((rel) => {
            const a = px(point(rel.from));
            const b = px(point(rel.to));
            const hot = committed && phase !== 'done' && dependsOnChange(rel);
            return (
              <line
                key={rel.label}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                pathLength={1}
                data-drawn={isRelationDrawn(state, rel) || undefined}
                data-by-person={rel.by === 'person' || undefined}
                data-by-hand={handDrawn.includes(rel) || undefined}
                data-hot={hot || undefined}
                className="build-edge"
              />
            );
          })}
          {/* The commit's reach: a light runs out from the changed concept along each of its relations. */}
          {phase === 'impact'
            ? BUILD_RELATIONS.filter(dependsOnChange).map((rel) => {
                const [a, b] = rel.from === BUILD_CHANGE.concept ? [px(point(rel.from)), px(point(rel.to))] : [px(point(rel.to)), px(point(rel.from))];
                return <line key={rel.label} x1={a.x} y1={a.y} x2={b.x} y2={b.y} pathLength={1} className="build-pulse" />;
              })
            : null}
          <g ref={wire} className="build-wire">
            <line />
            <circle r={4} />
          </g>
        </svg>

        {/* The mission card: the repository, what winning means, and the button that asks for the first map. */}
        <div className="build-at build-mission-at" data-shown={!opened || undefined} inert={opened} style={at(CENTER)}>
          <div className="build-center build-zoom build-folder flex flex-col items-center gap-2 text-center">
            <span className="build-folder-icon relative grid size-16 place-items-center rounded-card">
              <Folder size={ICON_SIZE.lg} aria-hidden className="size-8" />
            </span>
            <span className="font-mono text-body leading-body text-[color:var(--color-text-primary)]">{BUILD_REPO}/</span>
            <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('files', { count: BUILD_FILE_COUNT })}</span>
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
              <Sparkles size={ICON_SIZE.sm} aria-hidden />
              {t('actions.start')}
            </Button>
          </div>
        </div>

        {/* The changed file, carried from the commit card into the concept that holds it. */}
        <div
          aria-hidden
          className="build-at build-carry-at"
          data-carry={phase === 'commit' ? 'card' : committed ? 'landed' : 'none'}
          style={placed((layout) => (committed ? pointIn(BUILD_CHANGE.concept, layout) : { x: 80, y: 12 }))}
        >
          <span className="build-center build-zoom build-carry inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1 font-mono text-label leading-label">
            {fileNameOf(BUILD_CHANGE.file)}
          </span>
        </div>

        {BUILD_RELATIONS.map((rel) => (
          <div key={rel.label} aria-hidden className="build-at build-edge-label-at" data-shown={isRelationDrawn(state, rel) || undefined} style={placed((layout) => labelIn(rel, layout))}>
            <span className="build-center build-zoom build-edge-label whitespace-nowrap rounded-chip px-2 py-0.5 text-label leading-label">{t(`relations.${rel.label}`)}</span>
          </div>
        ))}

        {BUILD_CONCEPTS.map((concept) => {
          const id = concept.id;
          const written = isWritten(state, concept);
          const changed = committed && id === BUILD_CHANGE.concept;
          const codeName = CODE_NAMED.find((entry) => entry.concept === id);
          const stillCode = codeName !== undefined && state.renamed[codeName.concept] === undefined;
          const lone = LONE_CONCEPTS.includes(id) && !PERSON_RELATIONS.some((rel) => (rel.from === id || rel.to === id) && isLinked(state, rel));
          const linkedHere = PERSON_RELATIONS.some((rel) => (rel.to === id || rel.from === id) && isLinked(state, rel));
          const burst = !written
            ? null
            : phase === 'done'
              ? 'done'
              : changed
                ? 'changed'
                : linkedHere
                  ? 'linked'
                  : codeName && !stillCode
                    ? 'renamed'
                    : 'written';
          const order = BUILD_CONCEPTS.filter((other) => other.beat === concept.beat).indexOf(concept);
          const burstDelay =
            burst === 'done'
              ? `calc(var(--motion-stagger) * 2 * ${BUILD_CONCEPTS.indexOf(concept)})`
              : burst === 'changed'
                ? 'calc(var(--motion-choreography) * 0.8)'
                : burst === 'written'
                  ? `calc(var(--motion-base) + var(--motion-stagger) * 3 * ${order})`
                  : 'var(--motion-base)';
          const pickup =
            burst === 'written' && concept.kind !== 'project'
              ? t('pickup.concept')
              : burst === 'renamed'
                ? t('pickup.renamed')
                : burst === 'changed'
                  ? t('pickup.changed')
                  : burst === 'linked' && LONE_CONCEPTS.includes(id)
                    ? t('pickup.relation')
                    : null;
          const touched = phase === 'impact' && BUILD_RELATIONS.some((rel) => dependsOnChange(rel) && rel.from === id);
          const name = written ? nameOf(id) : '';
          const tappable = written && (linking || phase === 'impact' || phase === 'rename');
          return (
            <div
              key={id}
              className="build-at build-node-at"
              data-shown={written || undefined}
              inert={!written}
              style={placed((layout) => pointIn(id, layout), { '--order': burst === 'written' ? order : 0 } as CSSProperties)}
            >
              <button
                type="button"
                data-testid={`build-node-${id}`}
                data-build-node={id}
                data-kind={concept.kind}
                data-touched={touched || undefined}
                data-grab={(tappable && grabbable(id)) || undefined}
                data-target={(written && targets.includes(id)) || undefined}
                data-picked={state.pick === id || state.renaming === id || undefined}
                data-lone={(measured && lone) || undefined}
                data-changed={changed || undefined}
                data-checked={(phase === 'done' && changed) || undefined}
                disabled={!tappable}
                aria-label={written ? t('nodeLabel', { name, count: concept.files }) : undefined}
                aria-pressed={linking ? state.pick === id : undefined}
                onPointerDown={(event) => grab(id, event)}
                onClick={(event) => {
                  if (swallowClick.current) return;
                  if (isFirstPress(event)) onTap(id);
                }}
                className="build-node-anchor build-zoom build-node group relative flex flex-col items-center gap-1.5 rounded-card px-2.5 pb-1 pt-3 outline-offset-2 disabled:cursor-default"
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
                  data-code-name={(written && stillCode && measured) || undefined}
                  className={cn(
                    'build-node-name whitespace-nowrap font-[var(--font-weight-strong)]',
                    concept.kind === 'capability' ? 'text-body leading-body' : 'text-body-lg leading-body-lg',
                    stillCode && 'font-mono',
                  )}
                >
                  {written ? <TypedLetters key={name} text={name} /> : null}
                </span>
              </button>
            </div>
          );
        })}

        {/* After a still moment, a hand shows where to press next. */}
        {targets.length > 0 ? (
          <div key={`${phase}:${state.pick}:${state.misses}:${targets[0]}`} aria-hidden className="build-hint-at" style={placed((layout) => pointIn(targets[0], layout))}>
            <span className="build-zoom absolute left-0 top-0">
              <span className="build-hint-ripple absolute rounded-full" />
              <Pointer size={40} strokeWidth={1.5} className="build-hint-hand absolute" />
            </span>
          </div>
        ) : null}

        {/* The agent at work on its first map: a named pointer that flies to each cluster it writes. */}
        <div aria-hidden className="build-at build-agent-at" data-shown={agentSpot !== undefined || undefined} style={placed(agentPoint)}>
          <span className="build-agent build-zoom absolute left-0 top-0 inline-flex items-start">
            <MousePointer2 size={ICON_SIZE.md} fill="currentColor" className="build-agent-pointer shrink-0" />
            <span className="build-agent-tag ml-0.5 mt-4 whitespace-nowrap rounded-chip px-2 py-0.5 text-label leading-label">Claude Code</span>
          </span>
        </div>

        {/* Atlas's count, the moment the first map is done: what it found to fix. */}
        <div
          aria-hidden
          data-shown={(phase === 'building' && measured) || undefined}
          className="build-found absolute left-1/2 top-3 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-chip px-3 py-1.5 text-label leading-label"
        >
          <span className="build-found-dot size-1.5 rounded-full" />
          {t('found', { names: CODE_NAMED.length, lone: LONE_CONCEPTS.length })}
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

