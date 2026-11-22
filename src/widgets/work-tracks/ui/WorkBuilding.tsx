'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { STAGE_ROOM_LIMIT, type RoomEntry, type RoomPlan, type TrackSession } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { layoutBuilding, type Box, type RoomBox, type RoomSize, type RoomUnit } from '../model/building-layout';
import { clockTime } from '../model/format';
import { retireeOf, roomLook, withRetirees, type Retiree } from '../model/room-look';
import { exitRoom, fadeFace, translate, useRoomMotion } from '../model/use-room-motion';
import { LargeRoom } from './LargeRoom';
import { MiniRoom } from './MiniRoom';
import { RoomShelf } from './RoomShelf';
import { useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

/** The building's side margin: rooms line up with the page title above them. */
const SIDE_PADDING_PX = 40;
const TINT_ID = 'work-room-tint';
const SESSION_INKS = [1, 2, 3, 4, 5] as const;
/** How long a merged room stays to show its crate riding in and its lights going out. */
export const RETIRE_MS = MOTION.choreography.duration * 2000;

type RoomCopy = ReturnType<typeof useRoomCopy>;

const inkOf = (session: TrackSession | null) => (session ? `var(--work-session-${session.ink + 1})` : 'var(--work-unheld)');
const tintOf = (session: TrackSession | null) => (session ? `${TINT_ID}-${session.ink + 1}` : null);

/**
 * One filter per session ink. It keeps every pixel of Moru and adds the ink over the saturated
 * indigo only (flippers, tail, laptop), scaled by that pixel's own lightness so the shading stays.
 */
function TintFilters() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        {SESSION_INKS.map(ink => (
          <filter key={ink} id={`${TINT_ID}-${ink}`} colorInterpolationFilters="sRGB" x="0" y="0" width="1" height="1">
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -7 0 7 0 -1.1" result="indigo" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0.3 0.5 0.2 0 0  0.3 0.5 0.2 0 0  0.3 0.5 0.2 0 0  0 0 0 1 0" result="lightness" />
            <feFlood style={{ floodColor: `var(--work-session-${ink})` }} result="ink" />
            <feComposite in="lightness" in2="ink" operator="arithmetic" k1="2.1" k2="0" k3="0" k4="0" result="inked" />
            <feComposite in="inked" in2="indigo" operator="in" result="accent" />
            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="accent" />
            </feMerge>
          </filter>
        ))}
      </defs>
    </svg>
  );
}

interface FaceSize {
  size: RoomSize;
  unit: RoomUnit;
  w: number;
  h: number;
}

function RoomFace({ room, face, copy, retiring, showOwner }: { room: RoomEntry; face: FaceSize; copy: RoomCopy; retiring: boolean; showOwner: boolean }) {
  return face.size === 'large'
    ? <LargeRoom room={room} unit={face.unit} copy={copy} tint={tintOf(room.session)} retiring={retiring} />
    : <MiniRoom room={room} copy={copy} tint={tintOf(room.session)} showOwner={showOwner} />;
}

/**
 * One room's frame. Its element sits at its box by transform; when the room changes size, its old
 * face stays at the old size and fades while the plate grows or shrinks, and the new face fades in
 * once the room has nearly arrived.
 */
function Room({ room, box, copy, retiring, showOwner, reduced, ghost }: {
  room: RoomEntry;
  box: RoomBox;
  copy: RoomCopy;
  retiring: boolean;
  showOwner: boolean;
  reduced: boolean;
  /** A room that left: drawn once more from where it was, fading away. */
  ghost?: { from: Box; onDone: (key: string) => void };
}) {
  const ghostFrom = ghost?.from;
  const onGhostDone = ghost?.onDone;
  const [faces, setFaces] = useState<{ current: FaceSize; leaving: FaceSize | null }>({
    current: { size: box.size, unit: box.unit, w: box.w, h: box.h },
    leaving: null,
  });
  const { current } = faces;
  if (current.size !== box.size || current.unit !== box.unit || current.w !== box.w || current.h !== box.h) {
    const resized = current.size !== box.size;
    setFaces({ current: { size: box.size, unit: box.unit, w: box.w, h: box.h }, leaving: resized ? current : faces.leaving });
  }
  const enterFace = useCallback((element: HTMLDivElement | null) => {
    if (element?.dataset.faceChange === 'true') fadeFace(element, 'in', reduced);
  }, [reduced]);
  const leaveFace = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    fadeFace(element, 'out', reduced).addEventListener('finish', () => setFaces(state => ({ ...state, leaving: null })));
  }, [reduced]);
  const ghostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ghostFrom && onGhostDone && ghostRef.current) exitRoom(ghostRef.current, ghostFrom, reduced, () => onGhostDone(room.key));
  }, [ghostFrom, onGhostDone, reduced, room.key]);

  const look = roomLook(room.state);
  const style = {
    transform: translate(ghost?.from ?? box),
    width: box.w,
    height: box.h,
    ['--ink' as string]: inkOf(room.session),
  } as CSSProperties;
  return (
    <div
      ref={ghost ? ghostRef : undefined}
      data-room-key={ghost ? undefined : room.key}
      data-testid={ghost ? undefined : 'work-room'}
      data-room-size={box.size}
      data-room-state={room.state.kind}
      data-room-running={look.running}
      aria-hidden={ghost ? true : undefined}
      inert={ghost ? true : undefined}
      className={cn(styles.room, ghost && 'pointer-events-none')}
      style={style}
    >
      <div data-room-plate className={cn(styles.plate, styles.notched)} />
      {faces.leaving ? (
        <div ref={leaveFace} aria-hidden inert className={cn(styles.face, styles.notched)} style={{ width: faces.leaving.w, height: faces.leaving.h }}>
          <RoomFace room={room} face={faces.leaving} copy={copy} retiring={retiring} showOwner={showOwner} />
        </div>
      ) : null}
      <div key={current.size} ref={enterFace} data-face-change={faces.leaving !== null} className={cn(styles.face, styles.notched, 'h-full w-full')}>
        <RoomFace room={room} face={current} copy={copy} retiring={retiring} showOwner={showOwner} />
      </div>
    </div>
  );
}

function Placed({ box, children, className, testId }: { box: Box; children: ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn('absolute left-0 top-0 transition-transform duration-[calc(var(--motion-slow)*2)]', className)}
      style={{ transform: translate(box), width: box.w, height: box.h }}
    >
      {children}
    </div>
  );
}

function FloorPlate({ session, total, working, attention, copy, nowMs }: {
  session: TrackSession | null;
  total: number;
  working: number;
  attention: number;
  copy: RoomCopy;
  nowMs: number;
}) {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  const facts = [
    session?.startedAt ? t('session.started', { time: clockTime(session.startedAt * 1000, nowMs, locale) }) : null,
    t('session.worktrees', { count: total }),
  ].filter(Boolean).join(' · ');
  const summary = [
    attention > 0 ? <span key="a" className="text-[color:var(--color-danger-text)]">{t('session.cleanup', { count: attention })}</span> : null,
    working > 0 ? <span key="w" className="text-[color:var(--color-text-primary)]">{t('session.working', { count: working })}</span> : null,
  ].filter(Boolean);
  return (
    <div className={cn(styles.floorPlate, 'h-full w-full')} style={{ ['--ink' as string]: inkOf(session) }}>
      <div className={cn(styles.inkText, 'truncate text-body leading-body font-[var(--font-weight-emphasis)]')}>
        <span aria-hidden className={styles.floorMark} />
        {copy.sessionName(session) ?? t('session.none')}
      </div>
      <div className="truncate text-label leading-label text-[color:var(--color-text-quaternary)]">{facts}</div>
      <div className="mt-0.5 truncate text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">
        {summary.length > 0 ? summary.flatMap((part, index) => (index === 0 ? [part] : [' · ', part])) : t('session.quiet')}
      </div>
    </div>
  );
}

function allRooms(plan: RoomPlan): { room: RoomEntry; floor: string | null; index: number }[] {
  return [
    ...plan.stage.map((room, index) => ({ room, floor: null, index })),
    ...plan.floors.flatMap(floor => floor.rooms.map((room, index) => ({ room, floor: floor.key, index }))),
  ];
}

/**
 * Keeps a room whose worktree just merged where it stood until its merge has played: the crate
 * rides into main and the lights go out, then the room folds away and its crate lands on the shelf.
 */
function useRetirees(plan: RoomPlan, reduced: boolean) {
  const [state, setState] = useState<{ source: RoomPlan; retirees: Retiree[] }>({ source: plan, retirees: [] });
  let { retirees } = state;
  if (state.source !== plan) {
    const present = new Set(allRooms(plan).map(({ room }) => room.key));
    const merged = new Set(plan.shelf.merged.map(track => track.key));
    const leaving = (key: string) => !present.has(key) && merged.has(key);
    const kept = retirees.filter(retiree => leaving(retiree.entry.key));
    const keptKeys = new Set(kept.map(retiree => retiree.entry.key));
    const fresh = reduced ? [] : allRooms(withRetirees(state.source, retirees, STAGE_ROOM_LIMIT))
      .filter(({ room }) => leaving(room.key) && !keptKeys.has(room.key))
      .map(({ room, floor, index }) => retireeOf(room, floor, index));
    retirees = [...kept, ...fresh];
    setState({ source: plan, retirees });
  }
  const keys = retirees.map(retiree => retiree.entry.key).join('\u0000');
  useEffect(() => {
    if (!keys) return;
    const timer = window.setTimeout(() => {
      setState(current => ({ ...current, retirees: current.retirees.filter(retiree => !keys.split('\u0000').includes(retiree.entry.key)) }));
    }, RETIRE_MS);
    return () => window.clearTimeout(timer);
  }, [keys]);
  return retirees;
}

/** Sets which rooms may move: only a running room on screen in a visible window, never under reduced motion. */
function useAmbientMotion(boardRef: React.RefObject<HTMLElement | null>, layoutKey: unknown, reduced: boolean) {
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const update = (element: HTMLElement) => {
      const moving = !reduced && !document.hidden && visible.has(element) && element.dataset.roomRunning === 'true';
      element.dataset.roomMotion = moving ? 'running' : 'paused';
    };
    const rooms = () => board.querySelectorAll<HTMLElement>('[data-room-key]');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
        update(entry.target as HTMLElement);
      }
    });
    rooms().forEach(element => observer.observe(element));
    const onVisibility = () => rooms().forEach(update);
    document.addEventListener('visibilitychange', onVisibility);
    const mutations = new MutationObserver(() => rooms().forEach(update));
    mutations.observe(board, { subtree: true, attributes: true, attributeFilter: ['data-room-running'] });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [boardRef, layoutKey, reduced]);
}

interface Ghost {
  room: RoomEntry;
  box: RoomBox;
  from: Box;
}

/**
 * The building of rooms: at most six large rooms on the front stage, the session floors of mini
 * rooms under them and the shelf. Rooms keep their place by transform, so a change glides from
 * where each room was drawn, and nothing reads the DOM to lay them out.
 */
export function WorkBuilding({ plan, baseBranch, nowMs }: { plan: RoomPlan; baseBranch: string; nowMs: number }) {
  const t = useTranslations('workStatus');
  const reduced = usePrefersReducedMotion();
  const copy = useRoomCopy(baseBranch, nowMs);
  const viewportRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      const next = { width: Math.max(0, viewport.clientWidth - SIDE_PADDING_PX * 2), height: viewport.clientHeight };
      setSize(current => (current && current.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const retirees = useRetirees(plan, reduced);
  const retiring = useMemo(() => new Set(retirees.map(retiree => retiree.entry.key)), [retirees]);
  const shown = useMemo(() => withRetirees(plan, retirees, STAGE_ROOM_LIMIT), [plan, retirees]);
  const shelfMerged = useMemo(() => plan.shelf.merged.filter(track => !retiring.has(track.key)), [plan, retiring]);
  const hasShelf = shelfMerged.length > 0 || plan.shelf.untouched.length > 0;
  const layout = useMemo(() => layoutBuilding({
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    stage: shown.stage.map(room => room.key),
    floors: shown.floors.map(floor => ({ key: floor.key, rooms: floor.rooms.map(room => room.key) })),
    hasShelf,
    workingBelow: shown.workingBelow,
  }), [size, shown, hasShelf]);

  const lastDrawn = useRef(new Map<string, { room: RoomEntry; box: RoomBox }>());
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const onRemoved = useCallback((removed: Map<string, Box>) => {
    const left: Ghost[] = [];
    for (const [key, from] of removed) {
      const drawn = lastDrawn.current.get(key);
      if (drawn) left.push({ room: drawn.room, box: drawn.box, from });
    }
    if (left.length > 0) setGhosts(current => [...current.filter(ghost => !removed.has(ghost.room.key)), ...left]);
  }, []);
  const forgetGhost = useCallback((key: string) => setGhosts(current => current.filter(ghost => ghost.room.key !== key)), []);
  useRoomMotion(boardRef, layout.rooms, { reduced, sizeKey: size ? `${size.width}x${size.height}` : '', onRemoved });
  useAmbientMotion(boardRef, layout.rooms, reduced);

  const entries = useMemo(() => allRooms(shown).map(({ room }) => room), [shown]);
  useLayoutEffect(() => {
    lastDrawn.current = new Map(entries.flatMap(room => {
      const box = layout.rooms.get(room.key);
      return box ? [[room.key, { room, box }] as const] : [];
    }));
  }, [entries, layout]);

  const stageTop = Math.min(...shown.stage.map(room => layout.rooms.get(room.key)?.y ?? Number.POSITIVE_INFINITY), layout.height);
  const building: CSSProperties = { transform: `translateY(${Math.max(0, stageTop - 12)}px)`, height: layout.height };

  return (
    <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden" data-testid="work-building-viewport">
      <TintFilters />
      <div
        ref={boardRef}
        data-testid="work-building"
        aria-label={t('stage.label')}
        role="region"
        className="relative mx-10 overflow-clip"
        style={{ height: size ? layout.height : '100%' }}
      >
        {size ? (
          <>
            {shown.stage.length + shown.floors.length > 0 ? <i aria-hidden className={cn(styles.building, styles.notched)} style={building} /> : null}
            {shown.floors.map(floor => {
              const plate = layout.floors.get(floor.key);
              return plate ? (
                <Placed key={`floor:${floor.key}`} box={plate} testId="work-floor">
                  <FloorPlate session={floor.session} total={floor.total} working={floor.working} attention={floor.attention} copy={copy} nowMs={nowMs} />
                </Placed>
              ) : null;
            })}
            {layout.moreTop !== null ? (
              <Placed box={{ x: 0, y: layout.moreTop, w: size.width, h: 28 }} className="flex items-center justify-end">
                <span data-testid="work-more-below" className="text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {t.rich('stage.moreBelow', {
                    count: shown.workingBelow,
                    lead: chunks => <strong className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{chunks}</strong>,
                  })}
                </span>
              </Placed>
            ) : null}
            {entries.map(room => {
              const box = layout.rooms.get(room.key);
              return box ? (
                <Room key={room.key} room={room} box={box} copy={copy} retiring={retiring.has(room.key)} showOwner={!layout.banded} reduced={reduced} />
              ) : null;
            })}
            {ghosts.map(ghost => (
              <Room key={`ghost:${ghost.room.key}`} room={ghost.room} box={ghost.box} copy={copy} retiring={false} showOwner={!layout.banded} reduced={reduced} ghost={{ from: ghost.from, onDone: forgetGhost }} />
            ))}
            {layout.shelf ? (
              <Placed box={layout.shelf}>
                <RoomShelf merged={shelfMerged} untouched={plan.shelf.untouched} baseBranch={baseBranch} nowMs={nowMs} inline={layout.shelf.inline} />
              </Placed>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
