'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { planRooms, sessionsIn, type RoomEntry, type RoomPlan, type TrackSession, type WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { layoutBuilding, stageCapacity, type Box, type RoomBox, type RoomSize, type RoomUnit } from '../model/building-layout';
import { clockTime } from '../model/format';
import { retireeOf, roomAlertOf, roomLook, withRetirees, type Retiree } from '../model/room-look';
import { FADE_MS, MOVE_MS } from '../model/room-sequence';
import { FACE_LEFT_EVENT, exitRoom, translate, useRoomMotion } from '../model/use-room-motion';
import { BranchName } from './BranchName';
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
    ? <LargeRoom room={room} unit={face.unit} copy={copy} tint={tintOf(room.session)} guestTint={tintOf(room.guests[0] ?? null)} retiring={retiring} />
    : <MiniRoom room={room} copy={copy} tint={tintOf(room.session)} showOwner={showOwner} />;
}

/** A merged room fades its content to its own wall, then the wall fades, in the last moments of its stay. */
const RETIRE_FADE_MS = FADE_MS;

/**
 * One room's frame. Its element sits at its box by transform. When the building gives it a new size,
 * its old face stays at the old size only while its content fades to the room's wall
 * (`useRoomMotion` plays that); the new face is drawn hidden and fades in once the room has arrived,
 * so a room never shows two faces. When the window itself resizes, the face takes the new size at once.
 */
function Room({ room, box, copy, retiring, showOwner, reduced, windowKey, ghost }: {
  room: RoomEntry;
  box: RoomBox;
  copy: RoomCopy;
  retiring: boolean;
  showOwner: boolean;
  reduced: boolean;
  /** The building's measured size: a change of it is a window resize, not a move. */
  windowKey: string;
  /** A room that left: drawn once more from where it was, fading away. */
  ghost?: { from: Box; onDone: (key: string) => void };
}) {
  const ghostFrom = ghost?.from;
  const onGhostDone = ghost?.onDone;
  const [faces, setFaces] = useState<{ current: FaceSize; leaving: FaceSize | null; windowKey: string }>({
    current: { size: box.size, unit: box.unit, w: box.w, h: box.h },
    leaving: null,
    windowKey,
  });
  const { current } = faces;
  if (current.size !== box.size || current.unit !== box.unit || Math.abs(current.w - box.w) > 1 || Math.abs(current.h - box.h) > 1) {
    const moved = faces.windowKey === windowKey;
    // The face showing now is what fades out; one already leaving faded during the last sequence's fade step.
    setFaces({ current: { size: box.size, unit: box.unit, w: box.w, h: box.h }, leaving: moved ? current : null, windowKey });
  } else if (faces.windowKey !== windowKey) {
    setFaces({ ...faces, leaving: null, windowKey });
  }
  const oldFace = useCallback((element: HTMLDivElement | null) => {
    element?.addEventListener(FACE_LEFT_EVENT, () => setFaces(state => ({ ...state, leaving: null })), { once: true });
  }, []);
  const ghostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ghostFrom && onGhostDone && ghostRef.current) exitRoom(ghostRef.current, ghostFrom, reduced, () => onGhostDone(room.key));
  }, [ghostFrom, onGhostDone, reduced, room.key]);
  const roomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = roomRef.current;
    if (!retiring || !element || reduced) return;
    const fades = [
      ...[...element.querySelectorAll<HTMLElement>(':scope > [data-room-face]')].map(face =>
        face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: RETIRE_FADE_MS, delay: RETIRE_MS - 2 * RETIRE_FADE_MS, fill: 'forwards' })),
      element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: RETIRE_FADE_MS, delay: RETIRE_MS - RETIRE_FADE_MS, fill: 'forwards' }),
    ];
    return () => fades.forEach(fade => fade.cancel());
  }, [retiring, reduced]);

  const look = roomLook(room.state);
  const style = {
    transform: translate(ghost?.from ?? box),
    width: box.w,
    height: box.h,
    ['--ink' as string]: inkOf(room.session),
  } as CSSProperties;
  return (
    <div
      ref={ghost ? ghostRef : roomRef}
      data-room-key={ghost ? undefined : room.key}
      data-ghost-key={ghost ? room.key : undefined}
      data-testid={ghost ? undefined : 'work-room'}
      data-room-size={box.size}
      data-room-state={room.state.kind}
      data-room-running={look.running}
      data-room-retiring={retiring || undefined}
      data-room-alert={ghost ? undefined : roomAlertOf(room.state) ?? undefined}
      data-session={ghost ? undefined : room.session?.key}
      aria-hidden={ghost ? true : undefined}
      inert={ghost ? true : undefined}
      className={cn(styles.room, ghost && 'pointer-events-none')}
      style={style}
    >
      <div data-room-plate className={cn(styles.plate, styles.notched)} />
      <div data-room-edge className={styles.edge} />
      {/* The branch plaque a room carries while it travels as its wall, so it is clear which room moved. */}
      <div data-room-plaque aria-hidden className={cn(styles.sign, styles.notched, styles.plaque, 'text-body leading-body font-mono font-[var(--font-weight-strong)]')}>
        <BranchName branch={room.track.branch ?? room.track.title} />
      </div>
      {faces.leaving ? (
        <div
          key="leaving"
          ref={oldFace}
          data-room-face
          data-face-leaving="true"
          aria-hidden
          inert
          className={cn(styles.face, styles.notched)}
          style={{ width: faces.leaving.w, height: faces.leaving.h }}
        >
          <RoomFace room={room} face={faces.leaving} copy={copy} retiring={retiring} showOwner={showOwner} />
        </div>
      ) : null}
      <div key={current.size} data-room-face className={cn(styles.face, styles.notched, 'h-full w-full')}>
        <RoomFace room={room} face={current} copy={copy} retiring={retiring} showOwner={showOwner} />
      </div>
    </div>
  );
}

function Placed({ box, children, className, testId }: { box: Box; children: ReactNode; className?: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cn('absolute left-0 top-0 transition-transform', className)}
      style={{ transform: translate(box), width: box.w, height: box.h, transitionDuration: `${MOVE_MS}ms`, transitionDelay: `${FADE_MS}ms` }}
    >
      {children}
    </div>
  );
}

function FloorPlate({ session, total, attention, onStage, below, copy, nowMs }: {
  session: TrackSession | null;
  total: number;
  attention: number;
  /** This session's rooms on the front stage, and on this floor. */
  onStage: number;
  below: number;
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
    attention > 0 ? <span key="a" className="text-[color:var(--color-status-warning)]">{t('session.cleanup', { count: attention })}</span> : null,
    onStage > 0 ? <span key="s" className="text-[color:var(--color-text-primary)]">{t('session.onStage', { count: onStage })}</span> : null,
    below > 0 ? <span key="b">{t('session.below', { count: below })}</span> : null,
  ].filter(Boolean);
  return (
    <div className={cn(styles.floorPlate, 'h-full w-full')} data-floor-plate data-session={session?.key} style={{ ['--ink' as string]: inkOf(session) }}>
      <div className={cn(styles.inkText, 'truncate text-body leading-body font-[var(--font-weight-emphasis)]')}>
        <span aria-hidden className={styles.floorMark} />
        {copy.sessionName(session) ?? t('session.none')}
      </div>
      <div className="truncate text-label leading-label text-[color:var(--color-text-quaternary)]">{facts}</div>
      <div className="mt-0.5 truncate text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">
        {summary.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
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
function useRetirees(plan: RoomPlan, stageLimit: number, reduced: boolean) {
  const [state, setState] = useState<{ source: RoomPlan; retirees: Retiree[] }>({ source: plan, retirees: [] });
  let { retirees } = state;
  if (state.source !== plan) {
    const present = new Set(allRooms(plan).map(({ room }) => room.key));
    const merged = new Set(plan.shelf.merged.map(track => track.key));
    const leaving = (key: string) => !present.has(key) && merged.has(key);
    const kept = retirees.filter(retiree => leaving(retiree.entry.key));
    const keptKeys = new Set(kept.map(retiree => retiree.entry.key));
    const fresh = reduced ? [] : allRooms(withRetirees(state.source, retirees, stageLimit))
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
  /** A merged room leaves with its lights already out. */
  retiring: boolean;
  from: Box;
}

/**
 * Pointing at a room or floor of a session steps that session's rooms and floor up and the rest
 * down, straight on the DOM so the building does not render again. A pointer that leaves, or rests
 * on a room nobody holds, clears it.
 */
function emphasise(board: HTMLElement | null, event: ReactPointerEvent<HTMLElement>) {
  if (!board || event.pointerType !== 'mouse') return;
  const target = event.type === 'pointerleave' ? null : (event.target as HTMLElement).closest<HTMLElement>('[data-session]');
  const session = target?.dataset.session ?? '';
  if ((board.dataset.emphasis ?? '') === session) return;
  board.dataset.emphasis = session;
  for (const element of board.querySelectorAll<HTMLElement>('[data-room-key], [data-floor-plate]')) {
    if (!session) delete element.dataset.emphasis;
    else element.dataset.emphasis = element.dataset.session === session ? 'up' : 'down';
  }
}

/**
 * The building of rooms: at most six large rooms on the front stage, the session floors of mini
 * rooms under them and the shelf. Rooms keep their place by transform, so a change glides from
 * where each room was drawn, and nothing reads the DOM to lay them out.
 */
export function WorkBuilding({ tracks, seenRunningAt, baseBranch, nowMs }: {
  tracks: WorkTracks;
  seenRunningAt: ReadonlyMap<string, number>;
  baseBranch: string;
  nowMs: number;
}) {
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

  const stageLimit = stageCapacity(size?.width ?? 0, size?.height ?? 0);
  const plan = useMemo(() => planRooms(tracks, nowMs, seenRunningAt, stageLimit), [tracks, nowMs, seenRunningAt, stageLimit]);
  const retirees = useRetirees(plan, stageLimit, reduced);
  const retiring = useMemo(() => new Set(retirees.map(retiree => retiree.entry.key)), [retirees]);
  const shown = useMemo(() => withRetirees(plan, retirees, stageLimit), [plan, retirees, stageLimit]);
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

  const lastDrawn = useRef(new Map<string, { room: RoomEntry; box: RoomBox; retiring: boolean }>());
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const onRemoved = useCallback((removed: Map<string, Box>) => {
    const left: Ghost[] = [];
    for (const [key, from] of removed) {
      const drawn = lastDrawn.current.get(key);
      // A merged room has already faded where it stood; only a room that left otherwise fades now.
      if (drawn && !drawn.retiring) left.push({ room: drawn.room, box: drawn.box, retiring: drawn.retiring, from });
    }
    if (left.length > 0) setGhosts(current => [...current.filter(ghost => !removed.has(ghost.room.key)), ...left]);
  }, []);
  const forgetGhost = useCallback((key: string) => setGhosts(current => current.filter(ghost => ghost.room.key !== key)), []);
  const windowKey = size ? `${size.width}x${size.height}` : '';
  useRoomMotion(boardRef, layout.rooms, { reduced, sizeKey: windowKey, onRemoved });
  useAmbientMotion(boardRef, layout.rooms, reduced);

  const entries = useMemo(() => allRooms(shown).map(({ room }) => room), [shown]);
  useLayoutEffect(() => {
    lastDrawn.current = new Map(entries.flatMap(room => {
      const box = layout.rooms.get(room.key);
      return box ? [[room.key, { room, box, retiring: retiring.has(room.key) }] as const] : [];
    }));
  }, [entries, layout, retiring]);

  const stageTop = Math.min(...shown.stage.map(room => layout.rooms.get(room.key)?.y ?? Number.POSITIVE_INFINITY), layout.height);
  const building: CSSProperties = { transform: `translateY(${Math.max(0, stageTop - 12)}px)`, height: layout.height };

  const emphasiseSession = useCallback((event: ReactPointerEvent<HTMLElement>) => emphasise(boardRef.current, event), []);

  return (
    <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden" data-testid="work-building-viewport">
      <TintFilters />
      <div
        ref={boardRef}
        data-testid="work-building"
        aria-label={t('stage.label')}
        role="region"
        onPointerOver={emphasiseSession}
        onPointerLeave={emphasiseSession}
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
                  <FloorPlate
                    session={floor.session}
                    total={floor.total}
                    attention={floor.attention}
                    onStage={shown.stage.filter(room => sessionsIn(room).includes(floor.key)).length}
                    below={floor.rooms.length}
                    copy={copy}
                    nowMs={nowMs}
                  />
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
            {ghosts.map(ghost => (
              <Room key={`ghost:${ghost.room.key}`} room={ghost.room} box={ghost.box} copy={copy} retiring={ghost.retiring} showOwner={!layout.banded} reduced={reduced} windowKey={windowKey} ghost={{ from: ghost.from, onDone: forgetGhost }} />
            ))}
            {entries.map(room => {
              const box = layout.rooms.get(room.key);
              return box ? (
                <Room key={room.key} room={room} box={box} copy={copy} retiring={retiring.has(room.key)} showOwner={!layout.banded} reduced={reduced} windowKey={windowKey} />
              ) : null;
            })}
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
