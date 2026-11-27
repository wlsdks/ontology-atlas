'use client';

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { planRooms, sessionsIn, type RoomEntry, type RoomPlan, type TrackSession, type WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import type { WorkshopArrangement } from '@/shared/lib/preferences/work-status-preferences';
import { sessionBoardOf } from '@/shared/lib/work-status/signals/session-board';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { changedAreas } from '../model/changed-areas';
import { fileColumns, layoutBuilding, listsAreas, screenRows, stageCapacity, type Box, type RoomBox, type RoomSize, type RoomUnit, type ScreenLists } from '../model/building-layout';
import { mountWhenFree } from '../model/face-mount-queue';
import { clockTime } from '../model/format';
import { MERGE_LIGHTS_OUT_MS, retireeOf, roomAlertOf, roomLook, withRetirees, type Retiree } from '../model/room-look';
import { roomLiveOf, type BuildingLive, type RoomLive } from '../model/room-live';
import { FADE_MS, MOVE_MS } from '../model/room-sequence';
import { FACE_KEPT_EVENT, FACE_LEFT_EVENT, exitRoom, translate, useRoomMotion } from '../model/use-room-motion';
import { useStableOrder } from '../model/use-stable-order';
import { BranchName } from './BranchName';
import { LargeRoom } from './LargeRoom';
import { MiniRoom } from './MiniRoom';
import { ARRANGE_TABS_ID, SessionBoard } from './SessionBoard';
import { pointToRoomKeys } from './point-to-rooms';
import { RoomPanel } from './RoomPanel';
import { RoomShelf } from './RoomShelf';
import { BASE_SCREEN_COMMITS, useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

/** From this width a mini room spreads its newest commits and what is not committed into columns. */
const SPREAD_MINI_W = 900;
/** The building's side margin: rooms line up with the page title above them. */
const SIDE_PADDING_PX = 40;
/** How long a merged room stays: its crate rides in, the stop turns green, its lights go out and it fades. */
export const RETIRE_MS = MERGE_LIGHTS_OUT_MS + MOTION.slow.duration * 1000 + 2 * FADE_MS;

type RoomCopy = ReturnType<typeof useRoomCopy>;

const inkOf = (session: TrackSession | null) => (session ? `var(--work-session-${session.ink + 1})` : 'var(--work-unheld)');

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
  /** Which drawn face this is: a face keeps its element, and what it is playing, while it changes role. */
  id: number;
}

/** A leaving face fades out the room it showed, not the room's new state: its tag and monitor stay as they were. */
type LeavingFace = FaceSize & { room: RoomEntry };

/** What a stage room's screen has to list: its commits (a room on the base branch lists few of that branch's own), its files and the folders they are in. */
function screenLists(room: RoomEntry): ScreenLists {
  const activity = room.track.activity;
  const commits = activity?.commits?.length ?? 0;
  return { commits: activity?.onBase ? Math.min(commits, BASE_SCREEN_COMMITS) : commits, files: activity?.files.length ?? 0, areas: changedAreas(activity?.files ?? []).length };
}

function RoomFace({ room, live, face, copy, retiring, showOwner, alone }: { room: RoomEntry; live: RoomLive; face: FaceSize; copy: RoomCopy; retiring: boolean; showOwner: boolean; alone: boolean }) {
  if (face.size !== 'large') return <MiniRoom room={room} live={live} copy={copy} showOwner={showOwner} retiring={retiring} />;
  const lists = screenLists(room);
  const areas = listsAreas(face.w, lists, alone);
  return <LargeRoom room={room} live={live} unit={face.unit} rows={screenRows(face)} fileColumns={fileColumns(face.w, lists.commits > 0, areas)} areas={areas} copy={copy} retiring={retiring} />;
}

/** A merged room fades its content to its own wall, then the wall fades, in the last moments of its stay. */
const RETIRE_FADE_MS = FADE_MS;

interface RoomProps {
  room: RoomEntry;
  /** What the session list, the file-change pulse and load say of the room. */
  live: RoomLive;
  box: RoomBox;
  copy: RoomCopy;
  retiring: boolean;
  showOwner: boolean;
  /** The only room on the stage: its screen also lists the folders its files are in. */
  alone: boolean;
  reduced: boolean;
  /** The building's measured size: a change of it is a window resize, not a move. */
  windowKey: string;
  /** A room that left: drawn once more from where it was, fading away. */
  ghost?: { from: Box; onDone: (key: string) => void };
  /** The room panel shows this room. */
  pressed?: boolean;
  /** Opens the room panel on this room, or closes it when it already shows it. */
  onPress?: (key: string) => void;
  panelId?: string;
}

const sameBox = (a: RoomBox, b: RoomBox) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.size === b.size && a.unit === b.unit;

/**
 * A plan builds every entry afresh, so a room compares what it draws from: its entry is plain data,
 * and an update that leaves it and its box alone does not draw the room again.
 */
function sameRoomProps(a: RoomProps, b: RoomProps) {
  return a.copy === b.copy && a.retiring === b.retiring && a.showOwner === b.showOwner && a.alone === b.alone && a.reduced === b.reduced
    && a.windowKey === b.windowKey && a.ghost === b.ghost && a.pressed === b.pressed && a.onPress === b.onPress && sameBox(a.box, b.box)
    && (a.room === b.room || JSON.stringify(a.room) === JSON.stringify(b.room))
    && (a.live === b.live || JSON.stringify(a.live) === JSON.stringify(b.live));
}

const Room = memo(DrawnRoom, sameRoomProps);

/**
 * One room's frame. Its element sits at its box by transform. When the building gives it a new size,
 * its old face stays at the old size, showing what it showed, only while its content fades to the room's wall
 * (`useRoomMotion` plays that); the new face is drawn hidden and fades in once the room has arrived,
 * so a room never shows two faces. When the window itself resizes, the face takes the new size at once.
 */
function DrawnRoom({ room, live, box, copy, retiring, showOwner, alone, reduced, windowKey, ghost, pressed = false, onPress, panelId }: RoomProps) {
  const t = useTranslations('workStatus');
  const ghostFrom = ghost?.from;
  const onGhostDone = ghost?.onDone;
  const [faces, setFaces] = useState<FaceState>({
    current: { size: box.size, unit: box.unit, w: box.w, h: box.h, id: 0 },
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
      setFaces({ current: { ...sized, id: current.size === box.size ? current.id : faces.next }, leaving: null, room, windowKey, next: faces.next + 1, ready: true });
    } else {
      const shown = faces.leaving ?? { ...current, room: faces.room };
      // The face on screen keeps its element and how far it has faded, and becomes the one that may
      // leave; the new face is drawn hidden, its content a few frames later. A move that keeps the
      // room's content hands the face back (`FACE_KEPT_EVENT`) before anything paints.
      setFaces({ current: { ...sized, id: faces.next }, leaving: shown, room, windowKey, next: faces.next + 1, ready: false });
    }
  } else if (faces.windowKey !== windowKey) {
    setFaces({ ...faces, leaving: null, room, windowKey, ready: true });
  } else if (faces.room !== room) {
    setFaces({ ...faces, room });
  }
  const oldFace = useCallback((element: HTMLDivElement) => {
    const left = () => setFaces(state => ({ ...state, leaving: null, ready: true }));
    const kept = () => setFaces(state => (state.leaving && state.leaving.size === state.current.size
      ? { ...state, current: { ...state.current, id: state.leaving.id }, leaving: null, ready: true }
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
      data-room-pressed={pressed || undefined}
      data-session={ghost ? undefined : room.session?.key}
      data-room-flashes={ghost ? undefined : live.flash}
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
          data-spread={faces.leaving.size === 'mini' && faces.leaving.w >= SPREAD_MINI_W}
          data-unit={faces.leaving.unit}
          // Hidden from assistive technology only: a face holds nothing to press or focus, and `inert`
          // would restyle the whole face the moment it starts to leave.
          aria-hidden
          className={cn(styles.face, styles.notched)}
          style={{ width: faces.leaving.w, height: faces.leaving.h }}
        >
          <RoomFace room={faces.leaving.room} live={live} face={faces.leaving} copy={copy} retiring={retiring} showOwner={showOwner} alone={alone} />
        </div>
      ) : null}
      <div key={`face-${current.id}`} data-room-face data-spread={current.size === 'mini' && current.w >= SPREAD_MINI_W} data-unit={current.unit} className={cn(styles.face, styles.notched, 'h-full w-full')}>
        {faces.ready ? <RoomFace room={room} live={live} face={current} copy={copy} retiring={retiring} showOwner={showOwner} alone={alone} /> : null}
      </div>
      {onPress && !ghost ? (
        <button
          type="button"
          data-room-press
          aria-label={t('panel.open', { branch: room.track.branch ?? room.track.title })}
          aria-expanded={pressed}
          aria-controls={pressed ? panelId : undefined}
          className={styles.press}
          onClick={() => onPress(room.key)}
        />
      ) : null}
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

function FloorPlate({ session, name, total, waiting, attention, onStage, below, copy, nowMs }: {
  session: TrackSession | null;
  /** The name the session's tool gives it, drawn before its tool and number. */
  name: string | null;
  total: number;
  waiting: number;
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
    waiting > 0 ? <span key="w" className="text-[color:var(--color-status-warning)]">{t('session.waiting', { count: waiting })}</span> : null,
    attention > 0 ? <span key="a" className="text-[color:var(--color-status-warning)]">{t('session.cleanup', { count: attention })}</span> : null,
    onStage > 0 ? <span key="s" className="text-[color:var(--color-text-primary)]">{t('session.onStage', { count: onStage })}</span> : null,
    below > 0 ? <span key="b">{t('session.below', { count: below })}</span> : null,
  ].filter(Boolean);
  return (
    <div className={cn(styles.floorPlate, 'h-full w-full')} data-floor-plate data-session={session?.key} style={{ ['--ink' as string]: inkOf(session) }}>
      <div className={cn(styles.inkText, 'truncate text-body leading-body font-[var(--font-weight-emphasis)]')}>
        <span aria-hidden className={styles.floorMark} />
        {name ? (
          <>
            {name}
            <span className="font-normal text-[color:var(--color-text-tertiary)]">{` ${copy.sessionName(session)}`}</span>
          </>
        ) : copy.sessionName(session) ?? t('session.none')}
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

const roomKeyOf = (room: RoomEntry) => room.key;
const floorKeyOf = (floor: { key: string }) => floor.key;
/** A worktree key has no whitespace, so it can name an element the region reads in order. */
const roomDomId = (key: string) => `work-room-${key}`;
const SHELF_DOM_ID = 'work-room-shelf';
const focusRoom = (key: string) => document.getElementById(roomDomId(key))?.querySelector<HTMLElement>('[data-room-press]')?.focus();

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
 * where each room was drawn, and nothing reads the DOM to lay them out. Pressing a room opens the
 * room panel beside the building.
 */
export function WorkBuilding({ tracks, live, seenRunningAt, baseBranch, nowMs, arrange = 'folder', onArrange, repo = '' }: {
  tracks: WorkTracks;
  /** What the session list, the file-change pulse and load say beside Git. */
  live: BuildingLive;
  seenRunningAt: ReadonlyMap<string, number>;
  baseBranch: string;
  nowMs: number;
  /** By folder draws the building; by session, one block per session over the same rooms, the building kept underneath. */
  arrange?: WorkshopArrangement;
  onArrange?: (arrange: WorkshopArrangement) => void;
  /** The repository's name, for the board with no session. */
  repo?: string;
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
  // A one-row stage is as tall as the longest list its rooms have to show.
  const stageLists = useMemo(() => shown.stage.map(screenLists), [shown]);
  const alone = shown.stage.length === 1;
  const layout = useMemo(() => layoutBuilding({
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    stage: shown.stage.map(room => room.key),
    floors: shown.floors.map(floor => ({ key: floor.key, rooms: floor.rooms.map(room => room.key) })),
    hasShelf,
    stageLists,
  }), [size, shown, hasShelf, stageLists]);
  const firstStageBox = shown.stage.length > 0 ? layout.rooms.get(shown.stage[0].key) : undefined;
  const stageRows = firstStageBox ? screenRows(firstStageBox) : 0;

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
  // A stage that grows by a row takes its new size at once, as a window resize does.
  const windowKey = size ? `${size.width}x${size.height}:${stageRows}` : '';
  useRoomMotion(boardRef, layout.rooms, { reduced, sizeKey: windowKey, onRemoved });

  const entries = useMemo(() => allRooms(shown).map(({ room }) => room), [shown]);
  const lives = useMemo(() => new Map(entries.map(room => [room.key, roomLiveOf(room, live)])), [entries, live]);
  const liveOf = (room: RoomEntry) => lives.get(room.key) ?? roomLiveOf(room, live);
  useLayoutEffect(() => {
    lastDrawn.current = new Map(entries.flatMap(room => {
      const box = layout.rooms.get(room.key);
      return box ? [[room.key, { room, box, retiring: retiring.has(room.key) }] as const] : [];
    }));
  }, [entries, layout, retiring]);

  // Elements keep their first order; the region reads them in the plan's order.
  const drawnRooms = useStableOrder(entries, roomKeyOf);
  const drawnFloors = useStableOrder(shown.floors, floorKeyOf);
  const readingOrder = [...entries.filter(room => layout.rooms.has(room.key)).map(room => roomDomId(room.key)), ...(layout.shelf ? [SHELF_DOM_ID] : [])].join(' ');


  const emphasiseSession = useCallback((event: ReactPointerEvent<HTMLElement>) => emphasise(boardRef.current, event), []);

  const panelId = useId();
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const pressRoom = useCallback((key: string) => setPressedKey(current => (current === key ? null : key)), []);
  // A room that leaves the building takes its panel with it.
  const pressedRoom = entries.find(room => room.key === pressedKey && layout.rooms.has(room.key)) ?? null;
  // A folder row on the by-session board opens the same panel; closing it returns focus to that row.
  const opener = useRef<HTMLElement | null>(null);
  const closePanel = useCallback(() => {
    setPressedKey(current => {
      if (opener.current?.isConnected) opener.current.focus();
      else if (current) focusRoom(current);
      opener.current = null;
      return null;
    });
  }, []);
  const pressFolder = useCallback((key: string, from: HTMLElement) => {
    setPressedKey(current => {
      opener.current = current === key ? null : from;
      return current === key ? null : key;
    });
  }, []);
  const bySession = arrange === 'session';
  const board = useMemo(
    () => (bySession ? sessionBoardOf([...plan.stage, ...plan.floors.flatMap(floor => floor.rooms)], tracks.sessions, live.sessions) : null),
    [bySession, plan, tracks.sessions, live.sessions],
  );
  const showFolders = useCallback((keys: readonly string[]) => {
    onArrange?.('folder');
    // The building shows on the next frame; the rooms are outlined once it has.
    if (keys.length > 0) requestAnimationFrame(() => requestAnimationFrame(() => pointToRoomKeys(keys, reduced)));
  }, [onArrange, reduced]);
  const closeOnEscape = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || pressedRoom === null) return;
    event.preventDefault();
    closePanel();
  };

  return (
    <div className="flex min-h-0 flex-1" onKeyDown={closeOnEscape}>
    <div ref={viewportRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="work-building-viewport">
      {/* The building keeps its height; only a window too short for it scrolls it, never the page. */}
      <div className="min-h-0 flex-[0_1_auto] overflow-y-auto overflow-x-hidden" role="tabpanel" id={`${ARRANGE_TABS_ID}-tabpanel-folder`} aria-labelledby={`${ARRANGE_TABS_ID}-tab-folder`} hidden={bySession}>
      <div
        ref={boardRef}
        data-testid="work-building"
        aria-label={t('stage.label')}
        aria-owns={readingOrder || undefined}
        role="region"
        onPointerOver={emphasiseSession}
        onPointerLeave={emphasiseSession}
        className={cn(styles.board, 'relative mx-10 overflow-clip')}
        style={{ height: size ? layout.height : '100%' }}
      >
        {size ? (
          <>
            {drawnFloors.map(floor => {
              const plate = layout.floors.get(floor.key);
              return plate ? (
                <Placed key={`floor:${floor.key}`} box={plate} testId="work-floor">
                  <FloorPlate
                    session={floor.session}
                    name={floor.session?.pid != null ? live.namesByPid.get(floor.session.pid) ?? null : null}
                    total={floor.total}
                    waiting={floor.waiting}
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
              <Room key={`ghost:${ghost.room.key}`} room={ghost.room} live={liveOf(ghost.room)} box={ghost.box} copy={copy} retiring={ghost.retiring} showOwner={!layout.banded} alone={false} reduced={reduced} windowKey={windowKey} ghost={{ from: ghost.from, onDone: forgetGhost }} />
            ))}
            {drawnRooms.map(room => {
              const box = layout.rooms.get(room.key);
              return box ? (
                <Room key={room.key} room={room} live={liveOf(room)} box={box} copy={copy} retiring={retiring.has(room.key)} showOwner={!layout.banded} alone={alone} reduced={reduced} windowKey={windowKey} pressed={pressedRoom?.key === room.key} onPress={pressRoom} panelId={panelId} />
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
      {board ? (
        <div className="min-h-0 flex-[0_1_auto] overflow-y-auto overflow-x-hidden px-10 pt-6" role="tabpanel" id={`${ARRANGE_TABS_ID}-tabpanel-session`} aria-labelledby={`${ARRANGE_TABS_ID}-tab-session`}>
          <SessionBoard board={board} sessions={tracks.sessions} load={live.load.status === 'read' ? live.load.sample : null} copy={copy} repo={repo} pressedKey={pressedRoom?.key ?? null} onPressFolder={pressFolder} onShowFolders={showFolders} />
        </div>
      ) : null}
    </div>
    <RoomPanel room={pressedRoom} live={live} tracks={tracks} copy={copy} id={panelId} onClose={closePanel} />
    </div>
  );
}
