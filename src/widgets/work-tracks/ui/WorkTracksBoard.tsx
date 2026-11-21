'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Track, TrackSession, WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { clockTime } from '../model/format';
import { MAIN, RULER, SEAM_LEFT, TRUNK, trackLeft } from '../model/stations';
import { exitRow, useTrackMotion, type RemovedElement } from '../model/use-track-motion';
import { BoardHead } from './BoardHead';
import { isStationDrawn } from './StationRuler';
import { SwapText } from './SwapText';
import { TrackRow, type TrackTone } from './TrackRow';

const UNHELD_INK = 'var(--work-unheld)';
/** Slice 1 reads nothing from a host, so the server ground stays its narrow strip. */
const SERVER_CONNECTED = false;
const TOOL_SLOT = '\u0000';
const sessionInk = (session: TrackSession) => `var(--work-session-${session.ink + 1})`;

interface WorkTracksBoardProps {
  tracks: WorkTracks;
  folder: string;
  host: string | null;
  baseBranch: string;
  nowMs: number;
  /** The first read is still running: the grounds and ruler draw at once, rows follow. */
  reading: boolean;
}

interface Ghost {
  track: Track;
  tone: TrackTone;
  ink: string;
  top: number;
}

/** What a row was drawn as last, so a row that leaves can be drawn once more while it goes. */
interface DrawnRow { track: Track; tone: TrackTone; ink: string }

function layoutSignature(tracks: WorkTracks): string {
  const part = (track: Track) => `${track.key}/${track.station}/${track.holder.kind}`;
  return [
    tracks.stuck.map(part).join(','),
    tracks.sessions.map(session => `${session.key}[${session.tracks.map(part).join(',')}]`).join(';'),
    tracks.unheld.map(part).join(','),
    tracks.merged.map(part).join(','),
  ].join('|');
}

function GroupLabel({ id, children, tone }: { id: string; children: string; tone?: 'stuck' }) {
  return (
    <div
      data-flip={`group:${id}`}
      data-flip-kind="move"
      data-enter="fade"
      className={cn(
        'flex h-9 items-end pb-1.5 pl-6 text-label leading-label font-[var(--font-weight-strong)] uppercase tracking-[var(--tracking-caps-10)]',
        tone === 'stuck' ? 'text-[color:var(--color-danger-text)]' : 'text-[color:var(--color-text-tertiary)]',
      )}
    >
      <SwapText value={children} />
    </div>
  );
}

function SessionHeader({ session, order }: { session: TrackSession; order: number }) {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  const tool = t(session.tool === 'acp' ? 'tool.acp' : session.tool === 'claudeCode' ? 'tool.claudeCode' : 'tool.unknown');
  // The tool's name wears the session's ink wherever the locale puts it in the sentence.
  const [headerBefore = '', headerAfter = ''] = t('session.header', { tool: TOOL_SLOT, number: session.ordinal }).split(TOOL_SLOT);
  const facts = [
    session.startedAt ? t('session.started', { time: clockTime(session.startedAt * 1000, locale) }) : null,
    t('session.subagents', { count: session.tracks.length }),
  ].filter(Boolean).join(' · ');
  return (
    <div
      data-flip={`session:${session.key}`}
      data-flip-kind="move"
      data-arrival-order={order}
      className="relative h-[var(--work-session-h)]"
    >
      <div
        data-flip={`session-label:${session.key}`}
        data-flip-kind="move-x"
        data-enter="fade"
        className="absolute inset-y-0 left-0 flex w-[var(--work-label-w)] min-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap pl-6 pr-4 pt-2.5 text-body leading-body text-[color:var(--color-text-secondary)]"
      >
        {headerBefore.trim() ? <span className="shrink-0">{headerBefore.trim()}</span> : null}
        <span className="shrink-0 text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--work-held-ink)]">{tool}</span>
        {headerAfter.trim() ? <span className="min-w-0 truncate">{headerAfter.trim()}</span> : null}
      </div>
      <span
        aria-hidden
        data-flip={`session-dot:${session.key}`}
        data-flip-kind="move-x"
        data-enter="place"
        className="absolute top-1/2 size-[0.875rem] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[color:var(--work-held-ink)] bg-[color:var(--work-ground-mac)]"
        style={{ left: trackLeft(TRUNK) }}
      />
      <span
        data-flip={`session-facts:${session.key}`}
        data-flip-kind="move-x"
        data-enter="fade"
        className="absolute top-1/2 flex min-w-0 -translate-y-1/2 text-label leading-label text-[color:var(--color-text-tertiary)]"
        style={{ left: `calc(${trackLeft(TRUNK)} + 1.125rem)`, maxWidth: `calc(${SEAM_LEFT} - ${trackLeft(TRUNK)} - 2.125rem)` }}
      >
        <SwapText value={facts} />
      </span>
    </div>
  );
}

/**
 * The route map: a shared ruler of stations across two grounds, On this Mac and On the server,
 * and one line per worktree from its session's trunk to the station its head has reached.
 */
export function WorkTracksBoard({ tracks, folder, host, baseBranch, nowMs, reading }: WorkTracksBoardProps) {
  const t = useTranslations('workStatus');
  const boardRef = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const drawnRows = useRef(new Map<string, DrawnRow>());

  const rowsInOrder = useMemo(() => {
    const rows: DrawnRow[] = [];
    for (const track of tracks.stuck) rows.push({ track, tone: 'stuck', ink: UNHELD_INK });
    for (const session of tracks.sessions) for (const track of session.tracks) rows.push({ track, tone: 'session', ink: sessionInk(session) });
    for (const track of tracks.unheld) rows.push({ track, tone: 'unheld', ink: UNHELD_INK });
    for (const track of tracks.merged) rows.push({ track, tone: 'merged', ink: UNHELD_INK });
    return rows;
  }, [tracks]);
  const order = new Map(rowsInOrder.map((row, index) => [row.track.key, index]));

  const onRemoved = useCallback((removed: RemovedElement[]) => {
    const left = removed.flatMap(({ id, box }) => {
      const key = id.startsWith('row:') ? id.slice('row:'.length) : null;
      const drawn = key ? drawnRows.current.get(key) : undefined;
      return drawn ? [{ ...drawn, top: box.y }] : [];
    });
    if (left.length > 0) setGhosts(current => [...current.filter(ghost => !left.some(next => next.track.key === ghost.track.key)), ...left]);
  }, []);
  useTrackMotion(boardRef, layoutSignature(tracks), reduced, onRemoved);

  useLayoutEffect(() => {
    drawnRows.current = new Map(rowsInOrder.map(row => [row.track.key, row]));
  }, [rowsInOrder]);

  const forgetGhost = useCallback((key: string) => setGhosts(current => current.filter(ghost => ghost.track.key !== key)), []);

  const row = (track: Track, tone: TrackTone, ink: string, branchesFromTrunk: boolean) => (
    <TrackRow
      key={track.key}
      track={track}
      tone={tone}
      ink={ink}
      branchesFromTrunk={branchesFromTrunk}
      arrivalOrder={order.get(track.key) ?? 0}
      baseBranch={baseBranch}
      nowMs={nowMs}
    />
  );

  return (
    <section
      ref={boardRef}
      data-testid="work-tracks"
      data-work-board
      aria-label={t('title')}
      className="@container relative isolate overflow-clip rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--work-ground-mac)] pb-6"
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 bg-[color:var(--work-ground-server)]" style={{ left: SEAM_LEFT }} />
      {RULER.filter(station => station.id !== 'main' && isStationDrawn(station, SERVER_CONNECTED)).map(station => (
        <div
          key={station.id}
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-[calc(var(--work-header-h)+var(--work-ruler-line-y))] -z-10 w-px -translate-x-1/2 bg-[color:var(--work-rail-faint)]"
          style={{ left: trackLeft(station) }}
        />
      ))}
      <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 -z-10 w-px -translate-x-1/2 bg-[color:var(--work-seam)]" style={{ left: SEAM_LEFT }} />
      <div
        aria-hidden
        data-work-main-rail
        className="pointer-events-none absolute bottom-6 top-[calc(var(--work-header-h)+var(--work-ruler-line-y))] w-[var(--work-line)] -translate-x-1/2 rounded-full bg-[color:var(--color-text-secondary)]"
        style={{ left: trackLeft(MAIN) }}
      />

      <BoardHead
        folder={folder}
        serverNotice={reading ? null : host ? t('connect.notConnected', { host }) : t('noRemote')}
        connected={SERVER_CONNECTED}
      />

      <div className="relative">
        {tracks.stuck.length > 0 ? (
          <div className="relative">
            <div
              aria-hidden
              data-flip="stuck-ground"
              data-flip-kind="scale-y"
              data-enter="fade"
              className="absolute inset-y-0 left-0 -z-10 origin-top bg-[color:var(--work-ground-stuck)]"
              style={{ right: SERVER_CONNECTED ? 0 : 'var(--work-server-w)' }}
            />
            <GroupLabel id="stuck" tone="stuck">{t('group.stuck')}</GroupLabel>
            {tracks.stuck.map(track => row(track, 'stuck', UNHELD_INK, false))}
            <div aria-hidden className="h-2" />
          </div>
        ) : null}

        {tracks.sessions.map((session, index) => (
          <div key={session.key} className="relative" style={{ ['--work-held-ink' as string]: sessionInk(session) }}>
            <SessionHeader session={session} order={order.get(session.tracks[0]?.key ?? '') ?? index} />
            <span
              aria-hidden
              data-flip={`trunk:${session.key}`}
              data-flip-kind="scale-y"
              data-enter="draw-y"
              className="absolute w-[var(--work-line)] origin-top bg-[color:var(--work-held-ink)]"
              style={{
                left: `calc(${trackLeft(TRUNK)} - var(--work-line) / 2)`,
                top: 'calc(var(--work-session-h) / 2)',
                bottom: 'calc(var(--work-row-h) / 2 + var(--work-elbow) - var(--work-line))',
              }}
            />
            {session.tracks.map(track => row(track, 'session', sessionInk(session), true))}
          </div>
        ))}

        {tracks.unheld.length > 0 ? (
          <div>
            <GroupLabel id="unheld">{t('group.unheld')}</GroupLabel>
            {tracks.unheld.map(track => row(track, 'unheld', UNHELD_INK, false))}
          </div>
        ) : null}

        {tracks.merged.length > 0 ? (
          <div>
            <GroupLabel id="merged">{t('group.merged', { count: tracks.merged.length })}</GroupLabel>
            {tracks.merged.map(track => row(track, 'merged', UNHELD_INK, false))}
          </div>
        ) : null}
      </div>

      {ghosts.map(ghost => (
        <GhostRow key={ghost.track.key} ghost={ghost} reduced={reduced} baseBranch={baseBranch} nowMs={nowMs} onDone={forgetGhost} />
      ))}
    </section>
  );
}

function GhostRow({ ghost, reduced, baseBranch, nowMs, onDone }: { ghost: Ghost; reduced: boolean; baseBranch: string; nowMs: number; onDone: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element) exitRow(element, reduced, () => onDone(ghost.track.key));
  }, [ghost, reduced, onDone]);
  return (
    <div ref={ref} aria-hidden inert className="pointer-events-none absolute inset-x-0" style={{ top: ghost.top, ['--work-held-ink' as string]: ghost.ink }}>
      <TrackRow track={ghost.track} tone={ghost.tone} ink={ghost.ink} branchesFromTrunk={ghost.tone === 'session'} arrivalOrder={0} baseBranch={baseBranch} nowMs={nowMs} ghost />
    </div>
  );
}
