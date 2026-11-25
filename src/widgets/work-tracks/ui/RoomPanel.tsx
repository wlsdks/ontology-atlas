'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { useCopyFeedback } from '@/shared/lib/clipboard/use-copy-feedback';
import { cn } from '@/shared/lib/cn';
import { DOZE_AFTER_MS, type RoomEntry, type WorkTracks } from '@/shared/lib/work-status/work-tracks';
import { Button, IconButton, Surface } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { BranchName } from './BranchName';
import { PanelSection as Section, PanelStats } from './panel-parts';
import { LoadSection, PulseSection, SessionsSection } from './RoomLiveSections';
import { roomLiveOf, type BuildingLive } from '../model/room-live';
import type { StatusTone, useRoomCopy } from './use-room-copy';
import styles from './rooms.module.css';

type RoomCopy = ReturnType<typeof useRoomCopy>;

const DOZE_AFTER_MINUTES = DOZE_AFTER_MS / 60_000;

const TONE: Record<StatusTone, string> = {
  ink: styles.inkText,
  warning: 'text-[color:var(--color-status-warning)]',
  success: 'text-[color:var(--color-success-text-a94)]',
  plain: 'text-[color:var(--color-text-secondary)]',
};

/** A folder path as one shell word. */
const shellWord = (path: string) => (/^[\w@%+=:,./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`);

/** The Git command that clears what a room is left with: a record without a folder, or a lock without a session. */
export function cleanupCommand(room: RoomEntry): string | null {
  if (room.state.kind === 'missing') return 'git worktree prune';
  if (room.state.kind === 'lockLeft') return `git worktree unlock ${shellWord(room.track.path)}`;
  return null;
}

/**
 * What one room is doing, in sentences, beside the building: who holds the worktree and what that
 * means, the commits the base branch does not have yet, what is not committed, and the folder. It
 * reads nothing of its own: every line comes from the room's entry, so it moves with the room.
 */
export function RoomPanel({ room, live, tracks, copy, id, onClose, replaced = false }: {
  /** The pressed room, or none: the panel leaves with its last room still drawn. */
  room: RoomEntry | null;
  /** The session list, the file-change pulse and load, for every room. */
  live: BuildingLive;
  /** Every worktree, so a room can name the folder an agent's own load counts in. */
  tracks: WorkTracks;
  /** Another panel takes this one's place: it goes at once, so the building never makes room for two. */
  replaced?: boolean;
  copy: RoomCopy;
  id: string;
  onClose: () => void;
}) {
  const [drawn, setDrawn] = useState(room);
  if (room !== null && room !== drawn) setDrawn(room);
  if (replaced && room === null) return null;
  return (
    <Surface
      open={room !== null}
      as="aside"
      motion="overlay"
      id={id}
      data-testid="work-room-panel"
      className="flex w-[min(25rem,100%)] shrink-0 flex-col overflow-y-auto border-l border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]"
    >
      {drawn ? <PanelBody room={drawn} live={live} tracks={tracks} copy={copy} onClose={onClose} /> : null}
    </Surface>
  );
}

function PanelBody({ room, live: building, tracks, copy, onClose }: { room: RoomEntry; live: BuildingLive; tracks: WorkTracks; copy: RoomCopy; onClose: () => void }) {
  const t = useTranslations('workStatus');
  const titleId = useId();
  const path = useCopyFeedback();
  const command = useCopyFeedback();
  const cleanup = cleanupCommand(room);
  const live = roomLiveOf(room, building);
  const screen = copy.monitor(room, live);
  const { state, track } = room;
  // The sentence speaks of the session whose state the room says: the first line, waiting first.
  const lead = live.lines[0] ? copy.sessionLine(live.lines[0]).main : null;
  const who = lead ?? screen.who ?? t('tool.unknown');
  const now = state.kind === 'working'
    ? t(state.tools.length > 1 ? 'panel.now.twoTools' : 'panel.now.working', { who })
    : state.kind === 'resting' || state.kind === 'waiting' || state.kind === 'sessionFailed' || state.kind === 'replied'
      ? t(`panel.now.${state.kind}`, { who })
      : state.kind === 'dozing'
        ? t('panel.now.dozing', { who, minutes: DOZE_AFTER_MINUTES })
        : state.kind === 'merged'
          ? t('panel.now.merged', { branch: copy.baseBranch })
          : t(`panel.now.${state.kind}`);
  const moreCommits = track.activity?.onBase ? 0 : (track.ahead ?? 0) - screen.commits.length;
  const moreFiles = (track.activity?.uncommitted ?? 0) - screen.files.length;
  // Read and empty: the stats already say zero, so the lists give way to one sentence.
  const quietCommits = track.activity != null && screen.commits.length === 0 && (track.activity.onBase ? false : track.ahead === 0);
  const quietFiles = track.activity != null && track.activity.uncommitted === 0;
  return (
    <div aria-labelledby={titleId} role="group" className="flex min-h-full flex-col">
      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-title leading-title font-mono font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            <BranchName branch={screen.branch} className="block truncate" />
          </h2>
          <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]" data-testid="work-room-panel-state">
            {screen.bezel ? <span className="font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{screen.bezel.main}</span> : null}
            {screen.bezel?.tag ? ` ${screen.bezel.tag}` : null}
            {screen.bezel ? ' · ' : null}
            <span className={cn(TONE[screen.state.tone], 'font-[var(--font-weight-emphasis)]')}>{screen.state.lead}</span>
            {screen.state.rest ? ` · ${screen.state.rest}` : null}
            {screen.worked ? ` · ${screen.worked}` : null}
          </p>
        </div>
        <IconButton label={t('panel.close')} onClick={onClose} data-testid="work-room-panel-close">
          <X size={ICON_SIZE.md} aria-hidden />
        </IconButton>
      </header>
      <p className="px-5 pb-4 text-body leading-prose text-[color:var(--color-text-secondary)]" data-testid="work-room-panel-now">{now}</p>
      {state.kind === 'missing' ? null : (
        <PanelStats
          stats={[
            { label: t('panel.stat.commits', { branch: copy.baseBranch }), value: track.activity?.onBase ? null : track.ahead ?? null },
            { label: t('panel.stat.uncommitted'), value: track.activity?.uncommitted ?? null },
          ]}
        />
      )}
      <SessionsSection live={live} copy={copy} />
      {state.kind === 'missing' || (quietCommits && quietFiles) ? (
        state.kind === 'missing' ? null : <p className="border-t border-[color:var(--color-border-soft)] px-5 py-4 text-body leading-body text-[color:var(--color-text-tertiary)]" data-testid="work-room-panel-quiet">{t('panel.quiet', { branch: copy.baseBranch })}</p>
      ) : (
        <>
          {quietCommits ? null : (
            <Section title={screen.commitsTitle?.text ?? t('panel.commitsTitle')}>
              {screen.commits.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {screen.commits.map(commit => (
                    <li key={commit.key} className="flex items-baseline gap-3 text-body leading-body">
                      <span className="min-w-0 flex-1 text-[color:var(--color-text-primary)]">{commit.subject}</span>
                      {commit.ago ? <span className="shrink-0 text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{commit.ago}</span> : null}
                    </li>
                  ))}
                  {moreCommits > 0 ? <li className="text-label leading-label text-[color:var(--color-text-quaternary)]">{t('panel.commitsMore', { count: moreCommits })}</li> : null}
                </ul>
              ) : (
                <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{screen.note ?? t('panel.reading')}</p>
              )}
            </Section>
          )}
          {quietFiles ? null : (
            <Section title={t('panel.uncommittedTitle')}>
              {screen.filesTitle ? (
                <>
                  <p className="text-body leading-body text-[color:var(--color-text-primary)]">{screen.filesTitle}</p>
                  {screen.files.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1.5" data-testid="work-room-panel-files">
                      {screen.files.map(file => (
                        <li key={file.path} className="flex items-baseline gap-3 text-label leading-label">
                          <span className="min-w-0 flex-1">
                            <span className="break-all font-mono text-[color:var(--color-text-primary)]">{file.name}</span>
                            {file.folder ? <span className="block break-all text-[color:var(--color-text-quaternary)]">{file.folder}</span> : null}
                          </span>
                          {file.ago ? <span className="shrink-0 tabular-nums text-[color:var(--color-text-quaternary)]">{file.ago}</span> : null}
                        </li>
                      ))}
                      {moreFiles > 0 ? <li className="text-label leading-label text-[color:var(--color-text-quaternary)]">{t('panel.filesMore', { count: moreFiles })}</li> : null}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">{t('panel.reading')}</p>
              )}
            </Section>
          )}
        </>
      )}
      {state.kind === 'missing' ? null : (
        <>
          <PulseSection live={live} />
          <LoadSection room={room} live={live} building={building} tracks={tracks} copy={copy} />
        </>
      )}
      {cleanup ? (
        <Section title={t('panel.cleanupTitle')}>
          <code className="block break-all font-mono text-label leading-label text-[color:var(--color-text-primary)]" data-testid="work-room-panel-command">{cleanup}</code>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void command.copy(cleanup)}>
            {command.state === 'copied' ? t('panel.copied') : t('panel.copyCommand')}
          </Button>
        </Section>
      ) : null}
      <footer className="mt-auto border-t border-[color:var(--color-border-soft)] px-5 py-4">
        <h3 className="text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('panel.folderTitle')}</h3>
        <p className="mt-1.5 break-all font-mono text-label leading-label text-[color:var(--color-text-secondary)]" data-testid="work-room-panel-path">{track.path}</p>
        <Button size="sm" variant="outline" className="mt-3" data-testid="work-room-panel-copy" onClick={() => void path.copy(track.path)}>
          {path.state === 'copied' ? t('panel.copied') : t('panel.copyPath')}
        </Button>
      </footer>
    </div>
  );
}
