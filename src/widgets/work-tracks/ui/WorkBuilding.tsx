'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { planRooms, sessionsIn, type RoomEntry, type RoomPlan, type TrackSession, type WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { WIDE_ROOM_W, layoutBuilding, pairUnit, stageCapacity, type Box, type RoomBox, type RoomSize, type RoomUnit } from '../model/building-layout';
import { mountWhenFree } from '../model/face-mount-queue';
import { clockTime } from '../model/format';
import { MERGE_LIGHTS_OUT_MS, createMoruClock } from '../model/moru-clock';
import { retireeOf, roomAlertOf, roomLook, withRetirees, type Retiree } from '../model/room-look';
import { FADE_MS, MOVE_MS } from '../model/room-sequence';
import { FACE_KEPT_EVENT, FACE_LEFT_EVENT, exitRoom, translate, useRoomMotion } from '../model/use-room-motion';
import { useStableOrder } from '../model/use-stable-order';
import { useRoomCast } from '../model/use-room-cast';
import type { MoruCharacter } from '../model/room-look';
import { BranchName } from './BranchName';
import { LargeRoom } from './LargeRoom';
import { MiniRoom } from './MiniRoom';
import { RoomShelf } from './RoomShelf';
import { useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

/** From this width a mini room spreads its newest commits and what is not committed into columns. */
const SPREAD_MINI_W = 900;
/** The building's side margin: rooms line up with the page title above them. */
const SIDE_PADDING_PX = 40;
const TINT_ID = 'work-room-tint';
const SESSION_INKS = [1, 2, 3, 4, 5] as const;
/** How long a merged room stays: its crate rides in, Moru cheers, its lights go out and it fades. */
export const RETIRE_MS = MERGE_LIGHTS_OUT_MS + MOTION.slow.duration * 1000 + 2 * FADE_MS;

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

interface FaceState {
  current: FaceSize;
  /** The face on screen while the room's new one waits to show: it keeps its element until it leaves or is kept. */
  leaving: LeavingFace | null;
  /** The entry the current face was last drawn from: what it goes on showing if it starts to leave. */
  room: RoomEntry;
  windowKey: string;
  next: number;
  /** Whether the current face draws its content; a hidden new face draws it a few frames later. */
  ready: boolean;
}

interface FaceSize {
  size: RoomSize;
  unit: RoomUnit;
  w: number;
  h: number;
  /** A large face of a room new to the building or newly on the stage. */
  entered: boolean;
  /** Which drawn face this is: a face keeps its element, and what it is playing, while it changes role. */
  id: number;
}

/** A leaving face fades out the room it showed, not the room's new state: its Moru, tag and monitor stay as they were. */
type LeavingFace = FaceSize & { room: RoomEntry };

function RoomFace({ room, face, copy, retiring, showOwner, character }: { room: RoomEntry; face: FaceSize; copy: RoomCopy; retiring: boolean; showOwner: boolean; character: MoruCharacter }) {
  return face.size === 'large'
    ? <LargeRoom room={room} unit={face.unit} pairScale={pairUnit(face.w, face.unit) / face.unit} copy={copy} tint={tintOf(room.session)} guestTint={tintOf(room.guests[0] ?? null)} retiring={retiring} entered={face.entered} faceId={face.id} character={character} />
    : <MiniRoom room={room} copy={copy} tint={tintOf(room.session)} showOwner={showOwner} character={character} />;
}

/** A merged room fades its content to its own wall, then the wall fades, in the last moments of its stay. */
const RETIRE_FADE_MS = FADE_MS;

interface RoomProps {
  room: RoomEntry;
  box: RoomBox;
  copy: RoomCopy;
  retiring: boolean;
  showOwner: boolean;
  reduced: boolean;
  /** The building's measured size: a change of it is a window resize, not a move. */
  windowKey: string;
  /** A room new to the building since it was first drawn. */
  entered: boolean;
  /** A room that left: drawn once more from where it was, fading away. */
  ghost?: { from: Box; onDone: (key: string) => void };
  /** The room's Moru, cast across the whole building. */
  character: MoruCharacter;
}

const sameBox = (a: RoomBox, b: RoomBox) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.size === b.size && a.unit === b.unit;

/**
 * A plan builds every entry afresh, so a room compares what it draws from: its entry is plain data,
 * and an update that leaves it and its box alone does not draw the room again.
 */
function sameRoomProps(a: RoomProps, b: RoomProps) {
  return a.copy === b.copy && a.retiring === b.retiring && a.showOwner === b.showOwner && a.reduced === b.reduced && a.entered === b.entered
    && a.windowKey === b.windowKey && a.ghost === b.ghost && a.character === b.character && sameBox(a.box, b.box)
    && (a.room === b.room || JSON.stringify(a.room) === JSON.stringify(b.room));
}

const Room = memo(DrawnRoom, sameRoomProps);

/**
 * One room's frame. Its element sits at its box by transform. When the building gives it a new size,
 * its old face stays at the old size, showing what it showed, only while its content fades to the room's wall
 * (`useRoomMotion` plays that); the new face is drawn hidden and fades in once the room has arrived,
 * so a room never shows two faces. When the window itself resizes, the face takes the new size at once.
 */
function DrawnRoom({ room, box, copy, retiring, showOwner, reduced, windowKey, entered, ghost, character }: RoomProps) {
  const ghostFrom = ghost?.from;
  const onGhostDone = ghost?.onDone;
  const [faces, setFaces] = useState<FaceState>({
    current: { size: box.size, unit: box.unit, w: box.w, h: box.h, id: 0, entered: entered && box.size === 'large' },
    leaving: null,
    room,
    windowKey,
    next: 1,
    ready: true,
  });
  const { current } = faces;
  if (current.size !== box.size || current.unit !== box.unit || Math.abs(current.w - box.w) > 1 || Math.abs(current.h - box.h) > 1) {
    const sized = { size: box.size, unit: box.unit, w: box.w, h: box.h };
    if (faces.windowKey !== windowKey) {
      // A window resize takes the new size at once.
      setFaces({ current: { ...sized, id: current.size === box.size ? current.id : faces.next, entered: current.entered && box.size === current.size }, leaving: null, room, windowKey, next: faces.next + 1, ready: true });
    } else {
      const shown = faces.leaving ?? { ...current, room: faces.room };
      // The face on screen keeps its element and how far it has faded, and becomes the one that may
      // leave; the new face is drawn hidden, its content a few frames later. A move that keeps the
      // room's content hands the face back (`FACE_KEPT_EVENT`) before anything paints.
      setFaces({ current: { ...sized, id: faces.next, entered: box.size === 'large' && shown.size !== 'large' }, leaving: shown, room, windowKey, next: faces.next + 1, ready: false });
    }
  } else if (faces.windowKey !== windowKey) {
    setFaces({ ...faces, leaving: null, room, windowKey, ready: true });
  } else if (faces.room !== room) {
    setFaces({ ...faces, room });
  }
  const oldFace = useCallback((element: HTMLDivElement) => {
    const left = () => setFaces(state => ({ ...state, leaving: null, ready: true }));
    const kept = () => setFaces(state => (state.leaving && state.leaving.size === state.current.size
      ? { ...state, current: { ...state.current, id: state.leaving.id, entered: state.leaving.entered }, leaving: null, ready: true }
      : { ...state, leaving: null, ready: true }));
    element.addEventListener(FACE_LEFT_EVENT, left);
    element.addEventListener(FACE_KEPT_EVENT, kept);
    return () => {
      element.removeEventListener(FACE_LEFT_EVENT, left);
      element.removeEventListener(FACE_KEPT_EVENT, kept);
    };
  }, []);
  useEffect(() => (faces.ready ? undefined : mountWhenFree(() => setFaces(state => ({ ...state, ready: true })))), [faces.ready]);
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
      id={ghost ? undefined : roomDomId(room.key)}
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
          key={`face-${faces.leaving.id}`}
          ref={oldFace}
          data-room-face
          data-face-leaving="true"
          data-wide={faces.leaving.w >= WIDE_ROOM_W}
          data-spread={faces.leaving.size === 'mini' && faces.leaving.w >= SPREAD_MINI_W}
          data-unit={faces.leaving.unit}
          // Hidden from assistive technology only: rooms hold nothing to press or focus, and `inert`
          // would restyle the whole face the moment it starts to leave.
          aria-hidden
          className={cn(styles.face, styles.notched)}
          style={{ width: faces.leaving.w, height: faces.leaving.h }}
        >
          <RoomFace room={faces.leaving.room} face={faces.leaving} copy={copy} retiring={retiring} showOwner={showOwner} character={character} />
        </div>
      ) : null}
      <div key={`face-${current.id}`} data-room-face data-wide={current.w >= WIDE_ROOM_W} data-spread={current.size === 'mini' && current.w >= SPREAD_MINI_W} data-unit={current.unit} className={cn(styles.face, styles.notched, 'h-full w-full')}>
        {faces.ready ? <RoomFace room={room} face={current} copy={copy} retiring={retiring} showOwner={showOwner} character={character} /> : null}
      </div>
    </div>
  );
}

function Placed({ box, children, className, testId, id }: { box: Box; children: ReactNode; className?: string; testId?: string; id?: string }) {
  return (
    <div
      id={id}
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

/**
 * The lower floor's heading: what the floors below hold, with how many of their rooms are working.
 * A plate beside a single row of rooms, or a line above them.
 */
function FloorHeading({ kind, working, total }: { kind: 'plate' | 'line'; working: number; total: number }) {
  const t = useTranslations('workStatus');
  const sum = (
    <span className="truncate">
      {working > 0 ? <><strong className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t('floor.working', { count: working })}</strong> · </> : null}
      {t('floor.worktrees', { count: total })}
    </span>
  );
  return (
    <div className={cn(styles.floorHeading, 'h-full w-full')} data-kind={kind} data-testid="work-floor-heading">
      <div className={cn(styles.floorHeadingName, 'text-body leading-body font-[var(--font-weight-emphasis)]')}>
        <i aria-hidden className={styles.stairs} />
        {t('floor.below')}
      </div>
      {kind === 'plate' ? <div className="mt-0.5 text-label leading-label">{sum}</div> : <span className="text-body leading-body">{sum}</span>}
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

/**
 * Sets which rooms may move: a running room's light only while it is on screen in a visible window,
 * never under reduced motion. Every room on screen is `seen`, and the board's one clock steps the Moru
 * of seen rooms; the clock lives as long as the board, so it remembers what each Moru has played.
 */
function useAmbientMotion(boardRef: React.RefObject<HTMLElement | null>, layoutKey: unknown, reduced: boolean) {
  const [clock, setClock] = useState<ReturnType<typeof createMoruClock> | null>(null);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const created = createMoruClock(board);
    setClock(created);
    return () => created.stop();
  }, [boardRef]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !clock || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const update = (element: HTMLElement) => {
      const seen = !reduced && !document.hidden && visible.has(element);
      element.dataset.roomSeen = String(seen);
      element.dataset.roomMotion = seen && element.dataset.roomRunning === 'true' ? 'running' : 'paused';
    };
    const rooms = () => board.querySelectorAll<HTMLElement>('[data-room-key]');
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
        update(entry.target as HTMLElement);
      }
      clock.sync(!reduced);
    });
    rooms().forEach(element => observer.observe(element));
    const updateAll = () => {
      rooms().forEach(update);
      clock.sync(!reduced);
    };
    document.addEventListener('visibilitychange', updateAll);
    const mutations = new MutationObserver(updateAll);
    mutations.observe(board, { subtree: true, attributes: true, attributeFilter: ['data-room-running', 'data-moru-clip', 'data-moru-once', 'data-moru-travel'] });
    clock.sync(!reduced);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      document.removeEventListener('visibilitychange', updateAll);
    };
  }, [boardRef, layoutKey, reduced, clock]);
}

const roomKeyOf = (room: RoomEntry) => room.key;
const floorKeyOf = (floor: { key: string }) => floor.key;
/** A worktree key has no whitespace, so it can name an element the region reads in order. */
const roomDomId = (key: string) => `work-room-${key}`;
const SHELF_DOM_ID = 'work-room-shelf';

interface Ghost {
  room: RoomEntry;
  box: RoomBox;
  /** The Moru it had, kept while it fades. */
  character: MoruCharacter;
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
  }), [size, shown, hasShelf]);

  const lastDrawn = useRef(new Map<string, { room: RoomEntry; box: RoomBox; retiring: boolean; character: MoruCharacter }>());
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const onRemoved = useCallback((removed: Map<string, Box>) => {
    const left: Ghost[] = [];
    for (const [key, from] of removed) {
      const drawn = lastDrawn.current.get(key);
      // A merged room has already faded where it stood; only a room that left otherwise fades now.
      if (drawn && !drawn.retiring) left.push({ room: drawn.room, box: drawn.box, retiring: drawn.retiring, character: drawn.character, from });
    }
    if (left.length > 0) setGhosts(current => [...current.filter(ghost => !removed.has(ghost.room.key)), ...left]);
  }, []);
  const forgetGhost = useCallback((key: string) => setGhosts(current => current.filter(ghost => ghost.room.key !== key)), []);
  const windowKey = size ? `${size.width}x${size.height}` : '';
  useRoomMotion(boardRef, layout.rooms, { reduced, sizeKey: windowKey, onRemoved });
  useAmbientMotion(boardRef, layout.rooms, reduced);

  const entries = useMemo(() => allRooms(shown).map(({ room }) => room), [shown]);
  const characterOf = useRoomCast(entries);
  useLayoutEffect(() => {
    lastDrawn.current = new Map(entries.flatMap(room => {
      const box = layout.rooms.get(room.key);
      return box ? [[room.key, { room, box, retiring: retiring.has(room.key), character: characterOf(room) }] as const] : [];
    }));
  }, [entries, layout, retiring, characterOf]);

  // Elements keep their first order; the region reads them in the plan's order.
  const drawnRooms = useStableOrder(entries, roomKeyOf);
  const drawnFloors = useStableOrder(shown.floors, floorKeyOf);
  // The rooms of the building's first drawing are not new; any room after them settles in.
  const [firstDrawn, setFirstDrawn] = useState<ReadonlySet<string> | null>(null);
  if (firstDrawn === null && size && drawnRooms.length > 0) setFirstDrawn(new Set(drawnRooms.map(roomKeyOf)));
  const readingOrder = [...entries.filter(room => layout.rooms.has(room.key)).map(room => roomDomId(room.key)), ...(layout.shelf ? [SHELF_DOM_ID] : [])].join(' ');

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
        aria-owns={readingOrder || undefined}
        role="region"
        onPointerOver={emphasiseSession}
        onPointerLeave={emphasiseSession}
        className="relative mx-10 overflow-clip"
        style={{ height: size ? layout.height : '100%' }}
      >
        {size ? (
          <>
            {shown.stage.length + shown.floors.length > 0 ? <i aria-hidden className={cn(styles.building, styles.notched)} style={building} /> : null}
            {drawnFloors.map(floor => {
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
            {layout.heading ? (
              <Placed box={layout.heading}>
                <FloorHeading
                  kind={layout.heading.kind}
                  working={shown.floors.reduce((sum, floor) => sum + floor.rooms.filter(room => room.tier === 'working').length, 0)}
                  total={shown.floors.reduce((sum, floor) => sum + floor.rooms.length, 0)}
                />
              </Placed>
            ) : null}
            {ghosts.map(ghost => (
              <Room key={`ghost:${ghost.room.key}`} room={ghost.room} box={ghost.box} copy={copy} retiring={ghost.retiring} showOwner={!layout.banded} reduced={reduced} windowKey={windowKey} entered={false} ghost={{ from: ghost.from, onDone: forgetGhost }} character={ghost.character} />
            ))}
            {drawnRooms.map(room => {
              const box = layout.rooms.get(room.key);
              return box ? (
                <Room key={room.key} room={room} box={box} copy={copy} retiring={retiring.has(room.key)} showOwner={!layout.banded} reduced={reduced} windowKey={windowKey} entered={firstDrawn !== null && !firstDrawn.has(room.key)} character={characterOf(room)} />
              ) : null;
            })}
            {layout.shelf ? (
              <Placed box={layout.shelf} id={SHELF_DOM_ID}>
                <RoomShelf merged={shelfMerged} untouched={plan.shelf.untouched} baseBranch={baseBranch} nowMs={nowMs} />
              </Placed>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
