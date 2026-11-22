'use client';

import { useTranslations } from 'next-intl';
import type { RoomEntry } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { KNOWN_UNTIL, STAGE_AT, UNREAD_STATIONS, roomLook } from '../model/room-look';
import { pairUnit, type RoomUnit } from '../model/building-layout';
import { RoomMoru } from './RoomMoru';
import { SwapText } from './SwapText';
import type { useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

/** Rows of a terminal, as widths of its three runs; drawn twice so the scroll wraps unseen. */
const TERMINAL_LINES = [[18, 34], [8, 22, 30], [30, 12], [12, 40, 14], [22, 18], [8, 30, 26], [36, 10], [14, 24, 18]];

const LABEL = 'text-label leading-label';
const BODY = 'text-body leading-body';

function Monitor({ room, copy }: { room: RoomEntry; copy: RoomCopy }) {
  const look = roomLook(room.state);
  const screen = copy.monitor(room);
  return (
    <div className={cn(styles.monitor, styles.notched)} data-off={look.monitorOff}>
      <i className={cn(styles.monitorShadow, styles.notched)} />
      <i className={cn(styles.monitorFrame, styles.notched)} />
      <i className={cn(styles.monitorBezel, styles.notched)} />
      <div className={styles.screen} data-testid="work-room-monitor">
        <div className={cn(styles.screenRow, LABEL)}>
          <span data-ink={screen.labelInk} className={screen.labelInk ? 'font-[var(--font-weight-emphasis)]' : undefined}>
            <SwapText value={screen.label} />
          </span>
          {screen.aside ? <span className="tabular-nums"><SwapText value={screen.aside} /></span> : null}
        </div>
        {screen.figure ? (
          <div className={cn(styles.screenFigure, 'text-display leading-display font-[var(--font-weight-strong)] tracking-[var(--tracking-display)]')} data-tone={screen.figureTone}>
            <SwapText value={screen.figure} />
          </div>
        ) : null}
        {screen.terminal ? (
          <div className={styles.terminal} aria-hidden>
            <div className={styles.screenLines}>
              {[...TERMINAL_LINES, ...TERMINAL_LINES].map((line, index) => (
                <div key={index}>{line.map((width, part) => <i key={part} style={{ width: `${width}%` }} />)}</div>
              ))}
            </div>
          </div>
        ) : null}
        {screen.note ? <div className={cn(styles.screenNote, LABEL)}><SwapText value={screen.note} /></div> : null}
      </div>
      <i className={styles.monitorBadge} />
      <i className={styles.monitorLed} />
    </div>
  );
}

function Belt({ room }: { room: RoomEntry }) {
  const t = useTranslations('workStatus');
  const at = STAGE_AT[room.stage];
  const look = roomLook(room.state);
  const arrived = room.stage === 'main';
  return (
    <div className={styles.belt}>
      <div className={styles.track} data-arrived={arrived}>
        <div className={styles.rail}>
          <i
            className={styles.railUnknown}
            role={arrived ? undefined : 'img'}
            aria-label={arrived ? undefined : t('belt.notRead')}
            style={{ left: `${KNOWN_UNTIL * 100}%`, opacity: arrived ? 0 : 1 }}
          />
          <i className={styles.railPast} style={{ transform: `scaleX(${at})` }} />
          {look.running ? (
            <span className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - at) * 100}% 0 0)` }}>
              <i className={styles.beltLive} />
            </span>
          ) : null}
        </div>
        <span className={cn(styles.station, LABEL)} data-done={at >= STAGE_AT.commits} data-now={room.stage === 'commits'} style={{ left: `${STAGE_AT.commits * 100}%` }}>
          {t('belt.commits')}
        </span>
        {UNREAD_STATIONS.map(station => (
          <span key={station.id} className={cn(styles.station, LABEL)} data-done={arrived} data-unknown={!arrived} style={{ left: `${station.at * 100}%` }}>
            {t(station.id === 'push' ? 'band.seam' : `ruler.${station.id}`)}
          </span>
        ))}
        <span className={cn(styles.station, styles.stationMain, LABEL, 'font-mono font-[var(--font-weight-strong)]')} style={{ left: '100%' }}>
          {t('ruler.main')}
        </span>
        <i className={styles.hatch}>
          <i className={styles.hatchOpen} />
          <i className={styles.hatchLight} />
        </i>
        <div className={styles.carriage} style={{ transform: `translateX(${at * 100}%)` }}>
          <i className={styles.crate} data-kind={look.crate} />
        </div>
      </div>
    </div>
  );
}

/**
 * One worktree on the front stage: its branch on the wall sign, the monitor with what is known,
 * Moru with the session's name tag beside a floor lamp lit only while something runs, and the belt
 * that carries the work's crate toward the `main` hatch.
 */
export function LargeRoom({ room, unit, width, copy, tint, retiring }: {
  room: RoomEntry;
  unit: RoomUnit;
  /** The room's width in CSS pixels, to fit two Moru when two tools share the folder. */
  width: number;
  copy: RoomCopy;
  tint: string | null;
  /** The worktree just merged: once the crate is in, the lights go out. */
  retiring: boolean;
}) {
  const look = roomLook(room.state);
  const session = copy.sessionName(room.session);
  const tools = room.state.kind === 'working' ? room.state.tools : [];
  const second = tools[1];
  const pair = look.cast === 'two' && second !== undefined;
  const sceneUnit = pair ? pairUnit(width, unit) : unit;
  return (
    <div className={cn(styles.large, 'h-full w-full')}>
      <div className={styles.scene} style={{ ['--u' as string]: sceneUnit }} data-lit={look.running} data-dark={retiring} data-cast={pair ? 'two' : look.cast}>
        <i className={styles.glow}><i className={styles.glowLight} /></i>
        <i className={styles.wainscot} />
        <i className={styles.floor} />
        <div className={cn(styles.sign, styles.notched, BODY, 'font-mono font-[var(--font-weight-strong)]')} title={room.track.branch ?? room.track.path}>
          {room.track.branch ?? room.track.title}
        </div>
        <Monitor room={room} copy={copy} />
        <i className={styles.lamp}>
          <i className={styles.lampShade} />
          <i className={styles.lampLight}><i className={styles.lampFlicker} /></i>
        </i>
        {pair && second ? (
          <>
            <i className={cn(styles.shadow, styles.actorBack)} />
            <span className={cn(styles.actor, styles.actorBack)}><RoomMoru clip="read" still={false} zoom={sceneUnit} tint={tint} /></span>
            <span className={cn(styles.tag, styles.tagBack, LABEL, 'font-[var(--font-weight-emphasis)]')}>
              <span className="truncate">{session ?? copy.toolName(tools[0])}</span>
            </span>
            <i className={cn(styles.shadow, styles.actorFront)} />
            <span className={cn(styles.actor, styles.actorFront)}><RoomMoru clip="code" still={false} zoom={sceneUnit} tint={null} /></span>
            <span className={cn(styles.tag, styles.tagFront, LABEL, 'font-[var(--font-weight-emphasis)]')} style={{ ['--ink' as string]: 'var(--work-unheld)' }}>
              <span className="truncate">{copy.toolName(second)}</span>
            </span>
          </>
        ) : look.cast === 'one' ? (
          <>
            <i className={styles.shadow} />
            <span className={styles.actor}>
              <RoomMoru key={`${look.clip}:${look.still}`} clip={look.clip} still={look.still} zoom={unit} tint={tint} dozing={look.dozing} />
            </span>
            {session ? <span className={cn(styles.tag, LABEL, 'font-[var(--font-weight-emphasis)]')}>{session}</span> : null}
          </>
        ) : null}
        <i className={styles.dim} />
      </div>
      <Belt room={room} />
    </div>
  );
}
