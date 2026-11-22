'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { MOTION } from '@/shared/motion';
import { AFTER_CRATE, CART_CRATES, ROOM_TALKS, cartLoad, moruPhase, roomIdentity, roomLook, roomOnce, workLoops, type MoruCharacter } from '../model/room-look';
import { MERGE_LIGHTS_OUT_MS } from '../model/moru-clock';
import { useRise } from '../model/use-rise';
import { SCREEN_H, SCREEN_ROW_H, type RoomUnit } from '../model/building-layout';
import { BranchName } from './BranchName';
import { CommitLog } from './CommitLog';
import { RoomMoru } from './RoomMoru';
import { SwapText } from './SwapText';
import type { MonitorCopy, StatusTone, useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

const LABEL = 'text-label leading-label';

/** How long a screen that says something else takes to hand over: the old text fades as the new comes up. */
const SCREEN_SWAP_MS = MOTION.slow.duration * 1000;
const SCREEN_EASE = `cubic-bezier(${MOTION.slow.ease.join(', ')})`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/** What the screen says: the branch, the newest commits with their times, then what is not committed and the count. */
function ScreenText({ screen, rows }: { screen: MonitorCopy; rows: number }) {
  return (
    <>
      <div className={styles.screenHead}>
        <BranchName branch={screen.branch} className={cn(styles.screenBranch, 'font-mono font-[var(--font-weight-strong)]')} />
        {/* A room that needs a person says so at the top of its screen, in amber, not only on the bezel. */}
        {screen.state.tone === 'warning' ? <span className={cn(styles.screenAlert, 'text-body leading-body font-[var(--font-weight-strong)]')}>{screen.state.lead}</span> : null}
      </div>
      {screen.commits.length > 0 ? (
        <CommitLog commits={screen.commits.slice(0, rows)} rows={rows} className={styles.screenLog} />
      ) : screen.note ? (
        <div className={cn(styles.screenNote, 'text-body leading-body')}><SwapText value={screen.note} wrap /></div>
      ) : null}
      {screen.lastLine || screen.count ? (
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
      ) : null}
    </>
  );
}

/** The screen standing on its console: the room's light and the only place in it with words. */
function Monitor({ room, copy, rows }: { room: RoomEntry; copy: RoomCopy; rows: number }) {
  const look = roomLook(room.state);
  const screen = copy.monitor(room);
  const { leaving, serial } = useScreenSwap(room.state.kind, screen);
  return (
    <div className={styles.monitor} data-off={look.monitorOff}>
      <i className={styles.neck} />
      <i className={cn(styles.screenFrame, styles.notched)} />
      <div className={styles.screen} data-testid="work-room-monitor" data-room-part>
        <div key={`now:${serial}`} ref={serial > 0 ? enterScreen : undefined} className={styles.screenText}>
          <ScreenText screen={screen} rows={rows} />
        </div>
        {leaving ? (
          <div key={`was:${serial}`} ref={leaveScreen} aria-hidden className={cn(styles.screenText, 'pointer-events-none')}>
            <ScreenText screen={leaving} rows={rows} />
          </div>
        ) : null}
      </div>
      {/* The bezel names who works here: a name tag fixed to the screen, kept while the room travels. */}
      <div data-room-tag className={cn(styles.bezel, LABEL, 'font-[var(--font-weight-emphasis)]')} data-held={screen.who !== null}>
        {screen.who ? <span className={cn(styles.bezelWho, 'truncate')}>{screen.who}</span> : null}
        <span className={styles.bezelState}>
          {/* How long gives way before what the state is. */}
          <span className="flex-none"><SwapText value={screen.state.lead} ink={STATE_TONE[screen.state.tone]} /></span>
          {screen.state.rest ? <span className="flex min-w-0 font-normal">&nbsp;·&nbsp;<SwapText value={screen.state.rest} /></span> : null}
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
 * One worktree on the front stage, as one scene: Moru on the floor facing a screen on a console. The
 * screen is the room's only light and its only words; the session is on its bezel, `main` on the
 * hatch in the side wall, and the belt is a track in the floor that leaves through it. Two tools in
 * one folder: the second Moru stands behind the first on his tail side, both facing the screen.
 */
export function LargeRoom({ room, unit, rows, pairScale, pairTools, copy, tint, guestTint, retiring, entered, faceId, character }: {
  room: RoomEntry;
  /** The room's Moru, cast across the building. */
  character: MoruCharacter;
  unit: RoomUnit;
  /** Commit rows its screen lists (`screenRows`): the screen grows by a row for each. */
  rows: number;
  /** The share of `unit` two Moru take when two tools share the folder (`pairUnit`). */
  pairScale: number;
  /** The one in front of a pair has room past his face for his tools (`pairTools`). */
  pairTools: boolean;
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
  const loops = room.state.kind === 'working' && (!pair || pairTools) ? workLoops(room.key) : null;
  const identity = roomIdentity(room.track.branch ?? room.key);
  const tone = pair || room.state.kind === 'lockLeft' ? 'warning' : undefined;
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
        <i className={styles.halo} />
        <i className={styles.shade} />
        <i className={styles.skirting} />
        <i className={styles.floor}><i className={styles.pool} /></i>
        <div className={styles.sideWall}>
          <i className={styles.mainLight} />
          <span className={cn(styles.mainPlate, LABEL, 'font-mono font-[var(--font-weight-strong)]')}>main</span>
          <i className={styles.hatch} data-open={room.stage === 'main'} />
        </div>
        <i className={styles.track} />
        <Cart room={room} landing={commit.serial} />
        <i className={styles.console} />
        <i className={styles.prop} data-prop={identity.prop} />
        {pair ? (
          <>
            <i className={cn(styles.contact, styles.actorBack)} />
            <span className={cn(styles.actor, styles.actorBack)}><RoomMoru live slot="back" character={character} clip={look.backClip} still={look.still} zoom={zoom} tint={guestTint} phase={(moruPhase(room.key) + 0.5) % 1} once={backOnce} talks={look.running ? ROOM_TALKS : null} /></span>
          </>
        ) : null}
        {look.cast !== 'none' ? (
          <>
            <i className={styles.contact} />
            <span className={styles.actor}>
              <RoomMoru live character={character} clip={look.clip} still={look.still} zoom={zoom} tint={tint} phase={moruPhase(room.key)} once={frontOnce} loops={loops} />
            </span>
          </>
        ) : null}
        <Monitor room={room} copy={copy} rows={rows} />
        <i className={styles.dim} />
      </div>
    </div>
  );
}
