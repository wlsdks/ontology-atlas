'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { MOTION } from '@/shared/motion';
import { AFTER_CRATE, CART_CRATES, ROOM_TALKS, cartLoad, moruPhase, roomLook, roomOnce, workLoops, type MoruCharacter } from '../model/room-look';
import { MERGE_LIGHTS_OUT_MS } from '../model/moru-clock';
import { useRise } from '../model/use-rise';
import { SCREEN_H, SCREEN_ROW_H, type RoomUnit } from '../model/building-layout';
import { listRowsBeside, type RoomLive } from '../model/room-live';
import { ActivityStrip } from './ActivityStrip';
import { BranchName } from './BranchName';
import { CommitLog } from './CommitLog';
import { RoomMoru } from './RoomMoru';
import { SessionLineRow } from './SessionLineRow';
import { SwapText } from './SwapText';
import type { MonitorCopy, ScreenArea, ScreenFile, StatusTone, useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

const LABEL = 'text-label leading-label';

/** How long a screen that says something else takes to hand over: the old text fades as the new comes up. */
const SCREEN_SWAP_MS = MOTION.slow.duration * 1000;
const SCREEN_EASE = `cubic-bezier(${MOTION.slow.ease.join(', ')})`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** How long a row stays lit after its file is written again. */
const WRITE_MARK_MS = MOTION.choreography.duration * 2000;

/**
 * The screen of the state the room is in. A change of state hands the whole screen over at once, so
 * no frame shows an old branch over a new footer; a change within a state moves only what changed:
 * a new commit slides the list (`CommitLog`), a count or a line cross-fades (`SwapText`).
 */
function useScreenSwap(kind: string, screen: MonitorCopy) {
  const [swap, setSwap] = useState<{ kind: string; screen: MonitorCopy; leaving: MonitorCopy | null; serial: number }>({ kind, screen, leaving: null, serial: 0 });
  if (swap.kind !== kind) setSwap({ kind, screen, leaving: swap.screen, serial: swap.serial + 1 });
  else if (JSON.stringify(swap.screen) !== JSON.stringify(screen)) setSwap({ ...swap, screen });
  useEffect(() => {
    if (swap.leaving === null) return;
    const timer = window.setTimeout(() => setSwap(state => (state.serial === swap.serial ? { ...state, leaving: null } : state)), SCREEN_SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [swap.leaving, swap.serial]);
  return swap;
}

const enterScreen = (element: HTMLElement | null) => {
  if (element && !reducedMotion()) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SCREEN_SWAP_MS, easing: SCREEN_EASE });
};
const leaveScreen = (element: HTMLElement | null) => {
  if (!element) return;
  if (reducedMotion()) element.style.opacity = '0';
  else element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SCREEN_SWAP_MS, easing: 'linear', fill: 'forwards' });
};

const STATE_TONE: Record<StatusTone, string> = {
  ink: styles.stateInk,
  warning: styles.stateWarning,
  success: styles.stateSuccess,
  plain: styles.statePlain,
};

/**
 * The uncommitted files, last changed first, flowing down one column and into the next: each one's
 * name, the folder it is in, then when it changed. A row keeps its element, drawn in path order and
 * placed by `transform`, so a file that was just changed slides to the top and one new to the list
 * fades in; with reduced motion they swap in place.
 */
function FileList({ files, rows, columns }: { files: readonly ScreenFile[]; rows: number; columns: number }) {
  const shown = files.slice(0, rows * columns);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  const enter = useCallback((element: HTMLLIElement | null) => {
    if (element && mounted.current && !reducedMotion()) element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SCREEN_SWAP_MS, easing: SCREEN_EASE });
  }, []);
  // A file written again since the last read lights its row once, so the write is seen as it lands.
  const list = useRef<HTMLUListElement>(null);
  const written = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const before = written.current;
    written.current = new Map(shown.flatMap(file => (file.changedAt === null ? [] : [[file.path, file.changedAt] as const])));
    if (before === null || reducedMotion()) return;
    for (const [path, at] of written.current) {
      if (at <= (before.get(path) ?? Number.POSITIVE_INFINITY)) continue;
      list.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(path)}"] [data-file-mark]`)?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: WRITE_MARK_MS, easing: SCREEN_EASE });
    }
  });
  return (
    <ul ref={list} className={styles.fileList} style={{ '--rows': rows, '--columns': columns } as CSSProperties} data-testid="work-room-files">
      {shown.map((file, place) => ({ file, place })).sort((a, b) => (a.file.path < b.file.path ? -1 : 1)).map(({ file, place }) => (
        // A row that moves to another column is drawn anew there and fades in, so it never crosses the rows between.
        <li key={`${file.path}@${Math.floor(place / rows)}`} ref={enter} className={cn(styles.fileRow, LABEL)} style={{ '--row': place % rows, '--column': Math.floor(place / rows) } as CSSProperties} data-place={place} data-fresh={file.fresh} data-file={file.path}>
          <i aria-hidden data-file-mark className={styles.fileMark} />
          <span className={cn(styles.fileName, 'font-mono')}>{file.name}</span>
          <span className={styles.fileFolder}>{file.folder}</span>
          {file.ago ? <span className={styles.commitAgo}><SwapText value={file.ago} /></span> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The folders the uncommitted files are in, the one written last first: its path, its share of the
 * listed files as a bar, how many files and when one was last written. A row keeps its element and
 * moves to its place, as a file's does; folders past the screen's rows are counted on its last one.
 */
function AreaList({ areas, rows }: { areas: readonly ScreenArea[]; rows: number }) {
  const t = useTranslations('workStatus');
  const shown = areas.length > rows ? areas.slice(0, rows - 1) : areas;
  const most = Math.max(1, ...areas.map(area => area.files));
  return (
    <ul className={styles.fileList} style={{ '--rows': rows, '--columns': 1 } as CSSProperties} data-testid="work-room-areas">
      {shown.map((area, place) => ({ area, place })).sort((a, b) => (a.area.path < b.area.path ? -1 : 1)).map(({ area, place }) => (
        <li key={area.path} className={cn(styles.fileRow, styles.areaRow, LABEL)} style={{ '--row': place, '--column': 0 } as CSSProperties} data-fresh={area.fresh}>
          <span className={cn(styles.areaName, 'font-mono')}>{area.name}</span>
          <i aria-hidden className={styles.areaBar}><i style={{ '--share': area.files / most } as CSSProperties} /></i>
          <span className={cn(styles.areaCount, 'tabular-nums')}><SwapText value={area.count} /></span>
          <span className={styles.commitAgo}>{area.ago ? <SwapText value={area.ago} /> : null}</span>
        </li>
      ))}
      {areas.length > rows ? (
        <li className={cn(styles.fileRow, LABEL)} style={{ '--row': rows - 1, '--column': 0 } as CSSProperties}>{t('monitor.areasMore', { count: areas.length - shown.length })}</li>
      ) : null}
    </ul>
  );
}

/**
 * What the screen says: the branch, the newest commits with their times, then what is not committed and the count.
 * With `fileColumns`, on a screen wide enough: the commits and the uncommitted files stand side by side, each
 * under a line saying what it lists, and a room with no commits gives the files the commits' share and says so
 * on their line. With `areas`, the folders those files are in stand in a last column.
 */
function ScreenText({ screen, rows: screenRows, fileColumns, areas }: { screen: MonitorCopy; rows: number; fileColumns: number; areas: boolean }) {
  const sessionRows = screen.sessionLines.length + (screen.moreSessions ? 1 : 0);
  // The session lines say who waits; the lists below give them their height, and the panel keeps the rest.
  const rows = listRowsBeside(screenRows, sessionRows);
  const head = (
    <>
      <div className={styles.screenHead}>
        <BranchName branch={screen.branch} className={cn(styles.screenBranch, 'font-mono font-[var(--font-weight-strong)]')} />
        {/* A room that needs a person says so at the top of its screen, in amber, not only on the bezel. */}
        {screen.state.tone === 'warning' && sessionRows === 0 ? <span className={cn(styles.screenAlert, 'text-body leading-body font-[var(--font-weight-strong)]')}>{screen.state.lead}</span> : null}
      </div>
      {sessionRows > 0 ? (
        <ul className={cn(styles.sessionLines, LABEL)} data-testid="work-room-sessions">
          {screen.sessionLines.map(line => <SessionLineRow key={line.key} line={line} place="screen" />)}
          {screen.moreSessions ? <li className={styles.sessionLine} data-testid="work-room-sessions-more">{screen.moreSessions}</li> : null}
        </ul>
      ) : null}
    </>
  );
  if (rows === 0) {
    return (
      <>
        {head}
        {screen.lastLine || screen.count ? <ScreenFoot screen={screen} /> : null}
      </>
    );
  }
  if (fileColumns > 0) {
    const listsCommits = screen.commits.length > 0;
    return (
      <>
        {head}
        <div className={styles.screenColumns} data-commits={listsCommits} data-areas={areas}>
          {listsCommits ? (
            <div className={styles.screenColumn}>
              {screen.commitsTitle ? (
                <div className={cn(styles.screenCaption, LABEL)} data-tone={screen.commitsTitle.tone}><SwapText value={screen.commitsTitle.text} /></div>
              ) : null}
              <CommitLog commits={screen.commits.slice(0, rows)} rows={rows} className={styles.screenLog} />
            </div>
          ) : null}
          <div className={styles.screenColumn}>
            <div className={cn(styles.screenCaption, LABEL)}>
              {screen.filesTitle ? <SwapText value={screen.filesTitle} /> : null}
              {!listsCommits && screen.note ? <span className={styles.screenCaptionNote}><SwapText value={screen.note} /></span> : null}
            </div>
            <FileList files={screen.files} rows={rows} columns={fileColumns} />
          </div>
          {areas ? (
            <div className={styles.screenColumn}>
              <div className={cn(styles.screenCaption, LABEL)}><SwapText value={screen.areasTitle} /></div>
              <AreaList areas={screen.areas} rows={rows} />
            </div>
          ) : null}
        </div>
      </>
    );
  }
  return (
    <>
      {head}
      {screen.commits.length > 0 ? (
        <CommitLog commits={screen.commits.slice(0, rows)} rows={rows} className={styles.screenLog} />
      ) : screen.note ? (
        <div className={cn(styles.screenNote, 'text-body leading-body')}><SwapText value={screen.note} wrap /></div>
      ) : null}
      {screen.lastLine || screen.count ? <ScreenFoot screen={screen} /> : null}
    </>
  );
}

/** The screen's last line: what is not committed and how many commits the base branch lacks. */
function ScreenFoot({ screen }: { screen: MonitorCopy }) {
  return (
    <div className={cn(styles.screenFoot, LABEL)} data-tone={screen.lastLine?.tone}>
      <span className="flex min-w-0 items-baseline">
        {screen.lastLine ? <SwapText value={screen.lastLine.text} /> : null}
        {screen.lastLine?.file ? (
          <span className="flex min-w-0 items-baseline">
            <span className="flex-none">&nbsp;·&nbsp;</span>
            <SwapText value={screen.lastLine.file} className={cn(styles.screenFile, 'font-mono')} />
          </span>
        ) : null}
      </span>
      {screen.count ? <span className="flex-none tabular-nums"><SwapText value={screen.count} /></span> : null}
    </div>
  );
}

/**
 * The room's state on the wall left of Moru, at a size read across the stage: the state, the fact beside it and how long the session has worked.
 * It stays drawn while the room is too narrow for it or holds a pair, and fades when that changes: a room that moves keeps its face,
 * so mounting it there would cut it in or out in one frame.
 */
function WallFacts({ screen, shown }: { screen: MonitorCopy; shown: boolean }) {
  return (
    <div className={styles.wallFacts} data-testid="work-room-facts" data-room-part>
      <div className={styles.wallFactsText} data-shown={shown} data-room-fade>
        <span className={cn(STATE_TONE[screen.state.tone], 'text-title leading-title font-[var(--font-weight-strong)]')}><SwapText value={screen.state.lead} wrap /></span>
        {screen.state.rest ? <span className="text-body leading-body text-[color:var(--color-text-secondary)]"><SwapText value={screen.state.rest} wrap /></span> : null}
        {screen.worked ? <span className="text-body leading-body text-[color:var(--color-text-tertiary)]"><SwapText value={screen.worked} wrap /></span> : null}
        {screen.lastMinute ? <span className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="work-room-last-minute"><SwapText value={screen.lastMinute} wrap /></span> : null}
        {screen.loadFact ? <span className="text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]" data-testid="work-room-load-fact"><SwapText value={screen.loadFact} wrap /></span> : null}
      </div>
    </div>
  );
}

/** The room's screen: the words of what the worktree holds, over the name tag that says who works here. */
function Monitor({ room, live, copy, rows, fileColumns, areas }: { room: RoomEntry; live: RoomLive; copy: RoomCopy; rows: number; fileColumns: number; areas: boolean }) {
  const look = roomLook(room.state);
  const screen = copy.monitor(room, live);
  const { leaving, serial } = useScreenSwap(room.state.kind, screen);
  return (
    <div className={styles.monitor} data-off={look.monitorOff}>
      <i className={cn(styles.screenFrame, styles.notched)} />
      <div className={styles.screen} data-testid="work-room-monitor" data-room-part>
        <div key={`now:${serial}`} ref={serial > 0 ? enterScreen : undefined} className={styles.screenText}>
          <ScreenText screen={screen} rows={rows} fileColumns={fileColumns} areas={areas} />
        </div>
        {leaving ? (
          <div key={`was:${serial}`} ref={leaveScreen} aria-hidden className={cn(styles.screenText, 'pointer-events-none')}>
            <ScreenText screen={leaving} rows={rows} fileColumns={fileColumns} areas={areas} />
          </div>
        ) : null}
      </div>
      {/* The bezel names who works here: a name tag fixed to the screen, kept while the room travels. */}
      <div data-room-tag className={cn(styles.bezel, LABEL, 'font-[var(--font-weight-emphasis)]')} data-held={screen.bezel !== null}>
        {screen.bezel?.tag ? (
          <span className={styles.bezelNamed} data-testid="work-room-who">
            <span className={styles.bezelName}>{screen.bezel.main}</span>
            <span className={styles.bezelTag}>{screen.bezel.tag}</span>
          </span>
        ) : screen.bezel ? (
          <span className={cn(styles.bezelWho, 'truncate')} data-testid="work-room-who">{screen.bezel.main}</span>
        ) : null}
        {fileColumns > 0 && room.state.kind !== 'missing' ? <ActivityStrip beats={screen.beats} ticks={screen.ticks} label={screen.hourLabel} /> : null}
        <span className={styles.bezelState}>
          <span className="flex-none"><SwapText value={screen.state.lead} ink={STATE_TONE[screen.state.tone]} /></span>
          {screen.state.rest ? <span className="flex flex-none font-normal">&nbsp;·&nbsp;<SwapText value={screen.state.rest} /></span> : null}
        </span>
        <i className={styles.bezelLed} />
      </div>
    </div>
  );
}

/**
 * A value that follows `value` two frames after it changes. A transition it starts then begins in a
 * frame of its own, not in the frame the whole update commits in, which would hold it and then skip
 * it ahead to where its clock already is.
 */
function useFrameAfter<T>(value: T): T {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (Object.is(shown, value)) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(value));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [value, shown]);
  return shown;
}

/** The cart on the floor's track: one crate per commit, at most six, riding through the side wall's hatch into `main`. */
function Cart({ room, landing }: { room: RoomEntry; landing: number }) {
  // The ride to `main` starts once the merge's own update has drawn.
  const arrived = useFrameAfter(room.stage) === 'main';
  const look = roomLook(room.state);
  const load = room.track.missing ? { crates: 1, more: 0 } : cartLoad(room.track.ahead, arrived);
  const drawn = Math.min(load.crates, CART_CRATES);
  return (
    <div className={styles.way} data-room-part>
      <div className={styles.carriage} data-arrived={arrived}>
      <span className={styles.cart} data-testid="work-room-cart" data-crates={load.crates + load.more}>
        {Array.from({ length: drawn }, (_, index) => {
          // The newest crate drops onto the cart each time a commit lands.
          const newest = landing > 0 && index === drawn - 1;
          return <i key={newest ? `landed-${landing}` : index} className={styles.crate} data-kind={look.crate} data-landing={newest || undefined} />;
        })}
      </span>
      </div>
    </div>
  );
}

/**
 * One worktree on the front stage: a screen that says what the worktree is doing, over one rail.
 * Moru stands on the rail facing the screen, the cart of commits rides it, and it ends at a stop
 * named `main`; the session is on the screen's bezel. Two tools in one folder: the second Moru
 * stands behind the first on his tail side, both facing the screen.
 */
export function LargeRoom({ room, live, unit, rows, pairScale, fileColumns, areas, wallFacts, copy, tint, guestTint, retiring, entered, faceId, character }: {
  room: RoomEntry;
  /** What the session list, the file-change pulse and load say of this room. */
  live: RoomLive;
  /** The room's Moru, cast across the building. */
  character: MoruCharacter;
  unit: RoomUnit;
  /** Commit rows its screen lists (`screenRows`): the screen grows by a row for each. */
  rows: number;
  /** The share of `unit` two Moru take when two tools share the folder (`pairUnit`). */
  pairScale: number;
  /** The columns its uncommitted files flow into (`fileColumns`); none on a screen too narrow to list them. */
  fileColumns: number;
  /** Its screen also lists the folders those files are in (`listsAreas`). */
  areas: boolean;
  /** The room is wide enough to say its state on the wall left of Moru (`showsWallFacts`). */
  wallFacts: boolean;
  /** The room is new to the building, or newly on the stage: Moru settles in once. */
  entered: boolean;
  /** Which drawn face this is, so each new entry settles in once. */
  faceId: number;
  copy: RoomCopy;
  tint: string | null;
  /** The tint of the second tool's session, when two tools share the folder. */
  guestTint: string | null;
  /** The worktree just merged: once the crate is in, the lights go out. */
  retiring: boolean;
}) {
  const commit = useRise(room.track.ahead, MOTION.choreography.duration * 1000);
  const look = roomLook(room.state);
  const once = roomOnce(room.state, { merged: retiring, landed: commit.fresh, entered });
  // A new token plays the row again: each landed commit, and each time the room is newly entered.
  const request = once === null ? null : `${once}@${once === 'crate-send' ? commit.serial : once === 'settle-in' ? `face${faceId}` : 'merge'}`;
  const pair = look.cast === 'two';
  // A sent crate is followed by pride in front and joy behind; a working Moru walks his tools; a working pair talks now and then.
  const after = once === 'crate-send' ? `@${commit.serial}` : null;
  const frontOnce = request && after ? `${request} ${AFTER_CRATE.front}${after}` : request;
  const backOnce = after ? `${AFTER_CRATE.back}${after}` : null;
  // A pair types and talks; tools would reach past the floor, onto the cart or into the screen.
  const loops = room.state.kind === 'working' && !pair ? workLoops(room.key) : null;
  const tone = pair || room.state.kind === 'lockLeft' || room.state.kind === 'waiting' || room.state.kind === 'sessionFailed' ? 'warning' : undefined;
  // Two Moru share a smaller scale, as a share of the room's unit so it eases with the room.
  const zoom = pair ? 'calc(var(--u) * var(--pair))' : 'var(--u)';
  return (
    <div className={cn(styles.large, 'h-full w-full')}>
      <div
        data-scene
        className={styles.scene}
        style={{ '--u': unit, '--pair': pairScale, '--screen-h': `${SCREEN_H + (rows - 3) * SCREEN_ROW_H}px`, '--lights-out': `${MERGE_LIGHTS_OUT_MS}ms` } as CSSProperties}
        data-lit={look.running}
        data-tone={tone}
        data-dark={retiring}
        data-cast={look.cast}
      >
        <i className={styles.track} />
        <div className={styles.sideWall}>
          <span className={cn(styles.mainPlate, LABEL, 'font-mono font-[var(--font-weight-strong)]')}>main</span>
          <i className={styles.hatch} data-open={room.stage === 'main'} />
        </div>
        <Cart room={room} landing={commit.serial} />
        {pair ? (
          <>
            <span className={cn(styles.actor, styles.actorBack)}><RoomMoru live slot="back" character={character} clip={look.backClip} still={look.still} zoom={zoom} tint={guestTint} phase={(moruPhase(room.key) + 0.5) % 1} once={backOnce} talks={look.running ? ROOM_TALKS : null} /></span>
          </>
        ) : null}
        {look.cast !== 'none' ? (
          <>
            <span className={styles.actor}>
              <RoomMoru live character={character} clip={look.clip} still={look.still} zoom={zoom} tint={tint} phase={moruPhase(room.key)} once={frontOnce} loops={loops} />
            </span>
          </>
        ) : null}
        <WallFacts screen={copy.monitor(room, live)} shown={wallFacts && !pair} />
        <Monitor room={room} live={live} copy={copy} rows={rows} fileColumns={pair ? 0 : fileColumns} areas={!pair && areas} />
        <i className={styles.dim} />
      </div>
    </div>
  );
}
