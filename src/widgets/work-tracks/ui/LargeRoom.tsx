import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'use-intl';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { MOTION } from '@/shared/motion';
import { CART_CRATES, MERGE_LIGHTS_OUT_MS, cartLoad, roomLook } from '../model/room-look';
import { useRise } from '../model/use-rise';
import { SCREEN_H, SCREEN_ROW_H, type RoomUnit } from '../model/building-layout';
import { listRowsBeside, type RoomLive } from '../model/room-live';
import { ActivityStrip } from './ActivityStrip';
import { RoomComplete } from './RoomComplete';
import { RoomPulse } from './RoomPulse';
import { BranchName } from './BranchName';
import { CommitLog } from './CommitLog';
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
 * The room's state on the wall under its screen, left of the cart, in two lines that never wrap: the
 * state and its time, then how long the session has worked, the last minute's file changes and the
 * load.
 */
function WallFacts({ screen }: { screen: MonitorCopy }) {
  const details = [
    screen.worked ? { key: 'worked', value: screen.worked, className: 'text-[color:var(--color-text-tertiary)]', testId: undefined } : null,
    screen.lastMinute ? { key: 'minute', value: screen.lastMinute, className: 'text-[color:var(--color-text-secondary)]', testId: 'work-room-last-minute' } : null,
    screen.loadFact ? { key: 'load', value: screen.loadFact, className: 'tabular-nums text-[color:var(--color-text-tertiary)]', testId: 'work-room-load-fact' } : null,
  ].filter(part => part !== null);
  return (
    <div className={styles.wallFacts} data-testid="work-room-facts" data-room-part>
      <div className={styles.wallFactsText}>
        <span className={styles.wallLine}>
          {/* The time beside the state gives way first; the state is cut only when it alone is wider than the wall. */}
          <span className={cn(STATE_TONE[screen.state.tone], 'flex max-w-full flex-none text-title leading-title font-[var(--font-weight-strong)]')}><SwapText value={screen.state.lead} /></span>
          {screen.state.rest ? <span className="flex min-w-0 text-body leading-body text-[color:var(--color-text-secondary)]"><SwapText value={screen.state.rest} /></span> : null}
        </span>
        {details.length > 0 ? (
          <span className={cn(styles.wallDetails, 'text-body leading-body')}>
            {details.map((part, index) => (
              <span key={part.key} className={styles.wallDetail}>
                {index > 0 ? <span aria-hidden className="text-[color:var(--color-text-tertiary)]">·</span> : null}
                <span className={part.className} data-testid={part.testId}>{part.value}</span>
              </span>
            ))}
          </span>
        ) : null}
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
 * The wall under the screen says the room's state, the cart of commits rides the rail, and it ends
 * at a stop named `main`; the session is on the screen's bezel.
 */
export function LargeRoom({ room, live, unit, rows, fileColumns, areas, copy, retiring }: {
  room: RoomEntry;
  /** What the session list, the file-change pulse and load say of this room. */
  live: RoomLive;
  unit: RoomUnit;
  /** Commit rows its screen lists (`screenRows`): the screen grows by a row for each. */
  rows: number;
  /** The columns its uncommitted files flow into (`fileColumns`); none on a screen too narrow to list them. */
  fileColumns: number;
  /** Its screen also lists the folders those files are in (`listsAreas`). */
  areas: boolean;
  copy: RoomCopy;
  /** The worktree just merged: once the crate is in, the lights go out. */
  retiring: boolean;
}) {
  const landed = useRise(room.track.ahead);
  const look = roomLook(room.state);
  const sameFolder = room.state.kind === 'working' && room.state.tools.length > 1;
  const wallScreen = copy.monitor(room, live);
  const tone = sameFolder || room.state.kind === 'lockLeft' || room.state.kind === 'waiting' || room.state.kind === 'sessionFailed' ? 'warning' : undefined;
  return (
    <div className={cn(styles.large, 'h-full w-full')}>
      <div
        data-scene
        className={styles.scene}
        style={{ '--u': unit, '--screen-h': `${SCREEN_H + (rows - 3) * SCREEN_ROW_H}px`, '--lights-out': `${MERGE_LIGHTS_OUT_MS}ms` } as CSSProperties}
        data-lit={look.running}
        data-tone={tone}
        data-dark={retiring}
        data-fresh={live.pulse?.changedJustNow ?? false}
      >
        <i aria-hidden data-room-light className={styles.light} />
        <i className={styles.track} />
        {retiring ? <i aria-hidden className={styles.railRun} /> : null}
        <div className={styles.sideWall}>
          <span className={cn(styles.mainPlate, LABEL, 'font-mono font-[var(--font-weight-strong)]')}>main</span>
          <i className={styles.hatch} data-open={room.stage === 'main'} />
        </div>
        <Cart room={room} landing={landed} />
        <WallFacts screen={wallScreen} />
        <Monitor room={room} live={live} copy={copy} rows={rows} fileColumns={sameFolder ? 0 : fileColumns} areas={!sameFolder && areas} />
        <i aria-hidden className={styles.rim} />
        <RoomPulse flash={live.flash} />
        {retiring ? <RoomComplete ring /> : null}
        <i className={styles.dim} />
      </div>
    </div>
  );
}
