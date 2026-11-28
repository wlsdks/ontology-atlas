import type { CSSProperties } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from '@/shared/lib/cn';
import { sessionLoadOf } from '@/shared/lib/work-status/signals/load';
import type { SessionBoard as Board } from '@/shared/lib/work-status/signals/session-board';
import type { LoadRead } from '@/shared/lib/work-status/tauri-work-status';
import type { TrackSession } from '@/shared/lib/work-status/work-tracks';
import { BranchName } from './BranchName';
import type { SessionBlockCopy, useRoomCopy } from './use-room-copy';
import rooms from './rooms.module.css';
import styles from './session-board.module.css';

/** The id prefix the header's By folder / By session switch and its two panels share. */
export const ARRANGE_TABS_ID = 'work-arrange';

const inkOf = (ink: number | null) => (ink === null ? 'var(--work-unheld)' : `var(--work-session-${ink + 1})`);

/**
 * The Workshop by session: one block per agent session, with its own state and the folders it
 * works in. A folder row opens that folder's room panel, where a shared folder's changes are shown
 * once; a block never shows a folder's figures as a session's when another session shares it.
 */
export function SessionBoard({ board, sessions, load, copy, repo, pressedKey, onPressFolder, onShowFolders }: {
  board: Board;
  sessions: readonly TrackSession[];
  /** The last good load sample, `null` while load is off, pending or failed. */
  load: LoadRead | null;
  copy: ReturnType<typeof useRoomCopy>;
  repo: string;
  /** The folder whose room panel is open. */
  pressedKey: string | null;
  onPressFolder: (key: string, opener: HTMLElement) => void;
  /** Goes to By folder, outlining these rooms. */
  onShowFolders: (roomKeys: readonly string[]) => void;
}) {
  const t = useTranslations('workStatus');
  const byKey = new Map(sessions.map(session => [session.key, session]));
  if (board.blocks.length === 0) {
    return (
      <div className="py-10" data-testid="work-session-none">
        <p className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('bySession.none.title', { repo })}</p>
        <p className="mt-2 max-w-[60ch] text-body leading-body text-[color:var(--color-text-tertiary)]">{t('bySession.none.body')}</p>
        <WithoutSession count={board.withoutSession} onShow={() => onShowFolders([])} />
      </div>
    );
  }
  return (
    <div className="pb-2">
      <ul role="list" aria-label={t('bySession.label')} className={styles.grid} data-testid="work-session-board">
        {board.blocks.map(block => {
          const session = byKey.get(block.key) ?? null;
          const view = copy.sessionBlock(block, session, sessionLoadOf(load, session?.pid ?? null));
          return (
            <li key={block.key} className="flex min-w-0">
              <Block view={view} pressedKey={pressedKey} roomKeys={block.folders.map(folder => folder.room.key)} onPressFolder={onPressFolder} onShowFolders={onShowFolders} />
            </li>
          );
        })}
      </ul>
      <WithoutSession count={board.withoutSession} onShow={() => onShowFolders([])} />
    </div>
  );
}

function Block({ view, pressedKey, roomKeys, onPressFolder, onShowFolders }: {
  view: SessionBlockCopy;
  pressedKey: string | null;
  roomKeys: readonly string[];
  onPressFolder: (key: string, opener: HTMLElement) => void;
  onShowFolders: (roomKeys: readonly string[]) => void;
}) {
  const t = useTranslations('workStatus');
  return (
    <article
      className={cn(styles.block, rooms.notched, 'w-full')}
      style={{ '--ink': inkOf(view.ink) } as CSSProperties}
      data-testid="work-session-block"
      data-session-key={view.key}
      data-waiting={view.waiting}
      data-running={view.running}
      data-room-alert={view.waiting ? 'waiting' : undefined}
      aria-label={view.main}
    >
      <header className={styles.head}>
        <i aria-hidden className={styles.mark} />
        <h3 className={cn(styles.name, 'text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]')} data-testid="work-session-block-name">
          {view.main}
        </h3>
        {view.tag ? <span className={cn(styles.tag, 'text-label leading-label text-[color:var(--color-text-tertiary)]')}>{view.tag}</span> : null}
      </header>
      <div className={styles.facts}>
        <p className={cn(styles.status, 'text-body leading-body')} data-testid="work-session-block-state">
          <span className={cn(styles.state, 'flex-none font-[var(--font-weight-emphasis)]')} data-tone={view.state.tone}>{view.state.text}</span>
          {view.time ? <span className={cn(styles.time, 'text-[color:var(--color-text-tertiary)]')}>{view.time}</span> : null}
        </p>
        {view.load ? (
          <p className={cn(styles.load, 'text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]')} data-testid="work-session-block-load">
            <span className="text-[color:var(--color-text-secondary)]">{view.load.memory}</span>
            <span className="text-[color:var(--color-text-secondary)]">{view.load.cpu}</span>
            {view.load.tools ? <span className={styles.tools}>{view.load.tools}</span> : null}
          </p>
        ) : null}
      </div>
      <ul className={styles.screen} role="list">
        {view.folders.map(folder => (
          <li key={folder.key}>
            <button
              type="button"
              className={styles.folder}
              data-testid="work-session-folder"
              data-room-key={folder.key}
              data-shared={folder.shared}
              aria-expanded={pressedKey === folder.key}
              title={t('panel.open', { branch: folder.branch })}
              onClick={event => onPressFolder(folder.key, event.currentTarget)}
            >
              <BranchName branch={folder.branch} className="text-body leading-body text-[color:var(--color-text-primary)]" />
              <span className="self-center whitespace-nowrap text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">{folder.ago}</span>
              <span className={cn(styles.folderFacts, 'text-label leading-label text-[color:var(--color-text-tertiary)]')} data-testid="work-session-folder-facts">
                {folder.facts.map(fact => (
                  <span key={fact.text} className={styles.fact} data-tone={fact.tone}>{fact.text}</span>
                ))}
              </span>
              {folder.commits.length > 0 ? (
                <span className={styles.commits} data-testid="work-session-folder-commits">
                  {folder.commits.map(commit => (
                    <span key={commit.key} className={styles.commit}>
                      <span className={cn(styles.subject, 'text-label leading-label text-[color:var(--color-text-secondary)]')}>{commit.subject}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {view.more ? (
          <li>
            <button
              type="button"
              className={cn(styles.more, 'text-label leading-label text-[color:var(--color-text-tertiary)]')}
              data-testid="work-session-more-folders"
              title={t('bySession.showInFolders')}
              onClick={() => onShowFolders(roomKeys)}
            >
              {view.more}
            </button>
          </li>
        ) : null}
      </ul>
    </article>
  );
}

function WithoutSession({ count, onShow }: { count: number; onShow: () => void }) {
  const t = useTranslations('workStatus');
  if (count === 0) return null;
  return (
    <p className="mt-4 text-body leading-body text-[color:var(--color-text-tertiary)]">
      <button
        type="button"
        data-testid="work-session-without"
        title={t('bySession.showByFolder')}
        onClick={onShow}
        className="underline-offset-4 hover:text-[color:var(--color-text-primary)] hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
      >
        {t('bySession.withoutSession', { count })}
      </button>
    </p>
  );
}
