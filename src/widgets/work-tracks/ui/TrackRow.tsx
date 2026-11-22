'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { AgentTool, LockTool } from '@/shared/lib/work-status/tauri-work-status';
import { folderName, type Track } from '@/shared/lib/work-status/work-tracks';
import { cn } from '@/shared/lib/cn';
import { clockTime, shortAgentId, timeAgo } from '../model/format';
import { SwapText } from './SwapText';
import { SEAM_LEFT, TRUNK, headPoint, trackLeft, trackSpan, type RulerPoint } from '../model/stations';

export type TrackTone = 'session' | 'unheld' | 'stuck' | 'merged';

interface TrackRowProps {
  track: Track;
  tone: TrackTone;
  /** The session's ink; kept after the row leaves its session so the ink can fade out. */
  ink: string;
  /** Session rows turn out of their trunk; the rest begin at an open ring. */
  branchesFromTrunk: boolean;
  arrivalOrder: number;
  baseBranch: string;
  nowMs: number;
  /** A ghost is a row that has left: drawn where it was, never measured or focused. */
  ghost?: boolean;
}

type Translate = ReturnType<typeof useTranslations<'workStatus'>>;

function toolName(tool: LockTool | AgentTool, t: Translate): string {
  return t(tool === 'claudeCode' ? 'tool.claudeCode' : tool === 'codex' ? 'tool.codex' : 'tool.unknown');
}

function useHolderLine(track: Track, nowMs: number): string {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  const holder = track.holder;
  switch (holder.kind) {
    case 'subagent':
      return t('holder.locked', {
        tool: toolName(holder.tool, t),
        id: holder.agentId ? shortAgentId(holder.agentId) : '',
        time: holder.lockedAt ? clockTime(holder.lockedAt, nowMs, locale) : '',
      });
    case 'acp':
      return t('tool.acp');
    case 'process':
      return t('holder.process', { tool: toolName(holder.tool, t) });
    case 'locked':
      return holder.lockedAt ? t('holder.lockedUnnamed', { time: clockTime(holder.lockedAt, nowMs, locale) }) : t('holder.noLockQuiet');
    case 'ended':
      return t('holder.staleLock', { tool: toolName(holder.tool, t) });
    case 'none':
      return holder.lastCommitAt && holder.author
        ? t('holder.noLock', { ago: timeAgo(holder.lastCommitAt, nowMs, locale), author: holder.author })
        : t('holder.noLockQuiet');
  }
}

/** The holder in a few words beside the branch; the full sentence is the line's title. */
function useHolderShort(track: Track, nowMs: number, holderLine: string): string {
  const t = useTranslations('workStatus');
  const locale = useLocale();
  const holder = track.holder;
  if (holder.kind === 'subagent' && holder.agentId) return t('holder.subagent', { id: shortAgentId(holder.agentId) });
  if (holder.kind === 'ended') return t('holder.ended');
  if (holder.kind === 'none') {
    return holder.lastCommitAt && holder.author
      ? t('holder.lastCommit', { ago: timeAgo(holder.lastCommitAt, nowMs, locale), author: holder.author })
      : t('holder.noLockQuiet');
  }
  return holderLine;
}

/** Why a row is stuck, which its chip names and its note explains; `null` for a row that is not. */
type StuckReason = 'missing' | 'lockLeft';

function stuckReasonOf(track: Track): StuckReason | null {
  if (track.missing) return 'missing';
  return track.holder.kind === 'ended' ? 'lockLeft' : null;
}

/** The words under a row's head: what a stuck row is stuck on, else how far past the base branch it is. */
function useStationCaption(track: Track, stuck: StuckReason | null, branch: string): string | null {
  const t = useTranslations('workStatus');
  if (stuck === 'missing') return t('row.missing', { folder: folderName(track.path) });
  if (stuck === 'lockLeft' && track.holder.kind === 'ended') {
    return t('row.lockLeft', { tool: toolName(track.holder.tool, t), count: track.ahead ?? 0, branch });
  }
  if (track.station === 'main' || track.standing === 'base') return null;
  if (track.standing === 'unknown') return t('row.unknown', { branch });
  if (track.station === 'working' && track.ahead !== null) return t('row.commits', { count: track.ahead, branch });
  return t('row.noCommits', { branch });
}

/** The resting fill under the ink layers, so the chip's own surface is the ink its text sits on. */
const TONE_SURFACE: Record<TrackTone, string> = {
  session: 'bg-[color:var(--work-held-ink)]',
  stuck: 'bg-[color:var(--color-status-danger)]',
  unheld: 'bg-[color:var(--work-unheld)]',
  merged: 'bg-[color:var(--work-unheld)]',
};

/** A label on the row's head. Both kinds of head stay drawn, so a row reaching main cross-fades its chip. */
function HeadChip({ shown, tone, className, children }: { shown: boolean; tone: TrackTone; className: string; children: string }) {
  return (
    <span
      aria-hidden={!shown}
      className={cn(
        'absolute top-0 inline-flex h-6 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-label leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-on-accent)] transition-opacity duration-[var(--motion-slow)]',
        TONE_SURFACE[tone],
        !shown && 'opacity-0',
        className,
      )}
    >
      <InkLayers tone={tone} className="rounded-full" />
      <span aria-hidden className="relative size-1.5 rounded-full bg-[color:var(--color-text-on-accent)]" />
      <span className="relative">{children}</span>
    </span>
  );
}

/**
 * The row's three inks stacked: the neutral rail, its session's ink and the stuck red. A change of
 * holder or of group fades one layer over the others, so no colour is ever interpolated.
 */
function InkLayers({ tone, className }: { tone: TrackTone; className: string }) {
  const layer = 'absolute inset-0 transition-opacity duration-[var(--motion-slow)]';
  return (
    <>
      <span aria-hidden className={cn(layer, className, 'bg-[color:var(--work-unheld)]')} />
      <span aria-hidden className={cn(layer, className, 'bg-[color:var(--work-held-ink)]', tone !== 'session' && 'opacity-0')} />
      <span aria-hidden className={cn(layer, className, 'bg-[color:var(--color-status-danger)]', tone !== 'stuck' && 'opacity-0')} />
    </>
  );
}

/**
 * One worktree: its title and branch in the label column, then its line from the trunk to the
 * station its head has reached. Layered inks cross-fade when the holder changes, so a colour
 * change is an opacity change.
 */
export function TrackRow({ track, tone, ink, branchesFromTrunk, arrivalOrder, baseBranch, nowMs, ghost = false }: TrackRowProps) {
  const t = useTranslations('workStatus');
  const holderLine = useHolderLine(track, nowMs);
  const holderShort = useHolderShort(track, nowMs, holderLine);
  const head = headPoint(track.station);
  const flip = (part: string) => (ghost ? undefined : `${part}:${track.key}`);
  const anchoredEnd = track.station === 'main';
  // A branch leaves the trunk through its rounded elbow, so its straight part starts where the curve ends.
  const lineInset = branchesFromTrunk ? 'var(--work-elbow) - var(--work-line)' : '0px';
  const stuck = stuckReasonOf(track);
  const caption = useStationCaption(track, stuck, baseBranch);
  // A caption that goes away fades with its last words rather than emptying first.
  const [lastCaption, setLastCaption] = useState(caption ?? '');
  if (caption && caption !== lastCaption) setLastCaption(caption);
  // A chip says a session is at work, or names what a stuck row is stuck on; a worktree nobody holds is a bare dot.
  const atWork = track.station === 'working' && tone === 'session';
  const chipped = atWork || stuck !== null;
  const chipLabel = stuck ? t(`chip.${stuck}`) : t('ruler.working');
  const [heldInk, setHeldInk] = useState(ink);
  if (tone === 'session' && ink !== heldInk) setHeldInk(ink);

  return (
    <div
      data-testid={ghost ? undefined : 'work-track-row'}
      data-track={track.key}
      data-track-tone={tone}
      data-flip={flip('row')}
      data-flip-kind="move"
      data-arrival-order={arrivalOrder}
      className={cn('relative h-[var(--work-row-h)]', stuck && 'mb-[var(--work-stuck-note-h)]')}
      style={{ ['--work-held-ink' as string]: heldInk }}
    >
      <div
        data-flip={flip('label')}
        data-flip-kind="move-x"
        data-enter="fade"
        className="absolute inset-y-0 left-0 flex w-[var(--work-label-w)] min-w-0 flex-col justify-center pl-9 pr-4"
      >
        <span
          className={cn(
            'truncate text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] transition-opacity duration-[var(--motion-slow)]',
            tone === 'merged' && 'opacity-70',
          )}
          title={track.title}
        >
          {track.title}
        </span>
        <span className="flex min-w-0 flex-col text-label leading-label text-[color:var(--color-text-tertiary)] @7xl:flex-row @7xl:items-baseline @7xl:gap-1.5">
          <span className="flex min-w-0 @7xl:shrink-0" title={holderLine}>
            <SwapText value={holderShort} className="whitespace-nowrap" />
          </span>
          {track.branch ? (
            <>
              <span aria-hidden className="hidden @7xl:inline">·</span>
              <span className="min-w-0 truncate font-mono text-[color:var(--color-text-secondary)]" title={track.branch}>{track.branch}</span>
            </>
          ) : null}
        </span>
      </div>

      <svg
        aria-hidden
        viewBox="0 0 14 14"
        fill="none"
        className={cn('absolute size-[var(--work-elbow)] overflow-visible transition-opacity duration-[var(--motion-slow)]', !branchesFromTrunk && 'opacity-0')}
        style={{ left: `calc(${trackLeft(TRUNK)} - var(--work-line) / 2)`, bottom: 'calc(50% - var(--work-line) / 2)' }}
      >
        <path d="M1.5 0A12.5 12.5 0 0 0 14 12.5" stroke="var(--work-held-ink)" strokeWidth={3} />
      </svg>
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--work-unheld)] bg-[color:var(--work-ground-mac)] transition-opacity duration-[var(--motion-slow)]',
          branchesFromTrunk && 'opacity-0',
        )}
        style={{ left: trackLeft(TRUNK) }}
      />

      <span
        aria-hidden
        data-exit-line
        data-flip={flip('line')}
        data-flip-kind="scale-x"
        data-enter="draw-x"
        className="absolute top-1/2 h-[var(--work-line)] origin-left -translate-y-1/2"
        style={{ left: `calc(${trackLeft(TRUNK)} + ${lineInset})`, width: `calc(${trackSpan(TRUNK, head)} - ${lineInset})` }}
      >
        <InkLayers tone={tone} className="rounded-full" />
      </span>

      <span
        data-flip={flip('head')}
        data-flip-kind="move-x"
        data-enter="place"
        className="absolute top-1/2 size-0"
        style={{ left: trackLeft(head) }}
      >
        <HeadChip shown={chipped} tone={tone} className="left-0 -translate-x-[0.375rem]">{chipLabel}</HeadChip>
        <HeadChip shown={anchoredEnd} tone={tone} className="right-0">{t('station.mergedInto', { branch: baseBranch })}</HeadChip>
        <span
          aria-hidden
          className={cn(
            'absolute left-0 top-0 size-[var(--work-dot)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--work-ground-mac)] transition-opacity duration-[var(--motion-slow)]',
            (chipped || anchoredEnd) && 'opacity-0',
          )}
        >
          <InkLayers tone={tone} className="rounded-full [mask:radial-gradient(circle,transparent_2px,black_2.5px)]" />
        </span>
      </span>

      <span
        data-flip={flip('caption')}
        data-flip-kind="move"
        data-enter="fade"
        title={track.missing ? track.path : undefined}
        className={cn(
          'absolute flex text-label leading-label transition-opacity duration-[var(--motion-slow)]',
          chipped ? 'top-[calc(50%+0.875rem)]' : 'top-1/2 -translate-y-1/2',
          !caption && 'opacity-0',
        )}
        style={captionBox(stuck !== null, chipped, head)}
      >
        <SwapText value={caption ?? lastCaption} wrap={stuck !== null} ink={stuck ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-tertiary)]'} />
      </span>
    </div>
  );
}

const CHIP_LEAD = '0.375rem';
const CAPTION_GAP = '1rem';

/**
 * Where a row's caption sits: a stuck row's note spans this Mac's track under its line, a chip's
 * caption starts under the chip, and a bare dot's caption follows the dot. None crosses the seam.
 */
function captionBox(stuck: boolean, chipped: boolean, head: RulerPoint): { left: string; maxWidth: string } {
  const seamRoom = (from: string) => `calc(${SEAM_LEFT} - ${from} - ${CAPTION_GAP})`;
  if (stuck) {
    const left = `calc(${trackLeft(TRUNK)} - ${CHIP_LEAD})`;
    return { left, maxWidth: seamRoom(left) };
  }
  const left = chipped ? `calc(${trackLeft(head)} - ${CHIP_LEAD})` : `calc(${trackLeft(head)} + ${CAPTION_GAP})`;
  return { left, maxWidth: head.side === 'mac' ? seamRoom(left) : 'none' };
}
