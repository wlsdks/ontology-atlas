'use client';

import { useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  type RecheckConcept,
  type RecheckRecord,
  type RoundPassEntry,
  recheckUndonePaths,
} from '@/entities/library-round';
import { buildTopologyReturnHref } from '@/entities/knowledge-graph';
import { useLocalVault } from '@/entities/vault-session';
import type { RecheckUndoOutcome, RoundsRunnerValue } from '@/features/library-rounds';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { badgeClass } from '@/shared/ui/badge-class';
import { Button, Chip, CloseButton, Dialog, DialogBody, DialogFooter, RowButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { formatRecheckSize } from '../model/recheck-size';
import { automationDate } from './automation-date';

const WARNING = 'text-[color:var(--color-amber-source-a90)]';

/** The run's own line: what it found, or why it held or failed. `warning` when it asks for action. */
export function useRecheckLead(): (entry: RoundPassEntry, recheck: RecheckRecord) => { text: string; warning: boolean } {
  const t = useTranslations('automations.recheck');
  return (entry, recheck) => {
    if (recheck.error === 'commit-held') {
      const hold = recheck.hold;
      if (hold?.reason === 'branch') return { text: t('commitHeldBranch', { branch: hold.detail }), warning: true };
      return { text: t('commitHeldGit', { detail: hold?.detail ?? '' }), warning: true };
    }
    if (recheck.error === 'commit-rewritten') {
      return { text: t('commitRewritten', { files: (recheck.rewritten ?? []).join(', ') }), warning: true };
    }
    if (recheck.hold) {
      const detail = recheck.hold.detail;
      if (recheck.hold.reason === 'branch') return { text: t('heldBranch', { branch: detail }), warning: true };
      if (recheck.hold.reason === 'refused') return { text: t('heldRefused', { detail }), warning: true };
      return { text: t('heldGit', { detail }), warning: true };
    }
    if (recheck.error === 'reply-unreadable') return { text: t('replyUnreadable'), warning: true };
    if (recheck.error === 'head-moved') return { text: t('headMoved'), warning: true };
    if (recheck.error === 'commit-refused') {
      return { text: t('commitRefused', { detail: recheck.detail ?? '', count: recheck.restored ?? 0, copy: recheck.copy ?? '' }), warning: true };
    }
    if (recheck.error === 'interrupted') return { text: t('interrupted', { count: recheck.restored ?? 0 }), warning: true };
    if (entry.note === 'stopped') return { text: t('stopped'), warning: false };
    if (entry.note === 'no-agent') return { text: t('noAgent'), warning: true };
    if (entry.outcome === 'failed' && entry.summary) return { text: entry.summary, warning: true };
    if (recheck.concepts.length === 0) return { text: t('none'), warning: false };
    const count = (outcome: RecheckConcept['outcome']) => recheck.concepts.filter((concept) => concept.outcome === outcome).length;
    return {
      text: t('summary', { checked: recheck.concepts.length, accurate: count('accurate'), outdated: count('outdated'), left: count('left') }),
      warning: false,
    };
  };
}

/** What the run sent, what waits, and what it passed over. */
export function RecheckRunLines({ recheck }: { recheck: RecheckRecord }) {
  const t = useTranslations('automations.recheck');
  const locale = useLocale();
  const lines = [
    recheck.sentBytes > 0 ? t('sent', { size: formatRecheckSize(recheck.sentBytes, locale) }) : null,
    recheck.waiting > 0 ? t('waiting', { count: recheck.waiting }) : null,
    recheck.skippedUncommitted > 0 ? t('skippedUncommitted', { count: recheck.skippedUncommitted }) : null,
    recheck.ignored > 0 ? t('ignored', { count: recheck.ignored }) : null,
  ].filter((line): line is string => line !== null);
  if (lines.length === 0) return null;
  return <div data-testid="recheck-run-lines" className="mt-2 space-y-1">
    {lines.map((line) => <p key={line} className="break-words text-body text-[color:var(--color-text-tertiary)]">{line}</p>)}
  </div>;
}

type Group = 'accurate' | 'outdated' | 'left' | 'undone';
const GROUPS: readonly Group[] = ['accurate', 'outdated', 'left', 'undone'];

const GROUP_BADGE: Record<Group, string> = {
  accurate: 'border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] text-[color:var(--color-indigo-text-soft)]',
  outdated: 'border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]',
  left: 'border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]',
  undone: 'border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]',
};

/** **View results** and its dialog: each concept by outcome, its reason, and the two undo presses. */
export function RecheckResults({ entry, recheck, ledger, onUndo }: {
  entry: RoundPassEntry;
  recheck: RecheckRecord;
  ledger: readonly RoundPassEntry[];
  onUndo: RoundsRunnerValue['undoRecheck'];
}) {
  const t = useTranslations('automations.recheck');
  const close = useTranslations('automations');
  const locale = useLocale();
  const vault = useLocalVault();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(recheck.concepts[0]?.path ?? null);
  const [pending, setPending] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string; warning: boolean } | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const undone = recheckUndonePaths(ledger, entry.id);
  const groupOf = (concept: RecheckConcept): Group => (concept.outcome === 'accurate' && undone.has(concept.path) ? 'undone' : concept.outcome);
  const undoable = recheck.commit ? recheck.concepts.filter((concept) => groupOf(concept) === 'accurate') : [];
  const titles = new Map((vault.manifest?.docs ?? []).map((doc) => [doc.slug, doc.title]));
  const titleOf = (concept: RecheckConcept) => titles.get(concept.slug) || concept.slug;
  const selected = recheck.concepts.find((concept) => concept.path === chosen) ?? recheck.concepts[0] ?? null;

  if (recheck.concepts.length === 0) return null;

  const undo = async (paths: readonly string[] | undefined, key: string, returnTo: string | null) => {
    setPending(key);
    setAnswer(null);
    const result = await onUndo(entry.id, paths).catch((): RecheckUndoOutcome => ({ outcome: 'refused', undone: [], skipped: [], detail: null }));
    setPending(null);
    setAnswer(undoAnswer(result));
    if (returnTo) requestAnimationFrame(() => rows.current.get(returnTo)?.focus());
  };

  const undoAnswer = (result: RecheckUndoOutcome | null): { text: string; warning: boolean } | null => {
    if (!result || result.outcome === 'nothing') return null;
    const skipped = result.skipped.map((path) => t('undo.skipped', { document: path })).join(' ');
    if (result.outcome === 'gone') return { text: t('undo.gone'), warning: true };
    if (result.outcome === 'refused') return { text: [t('undo.failed', { detail: result.detail ?? '' }), skipped].filter(Boolean).join(' '), warning: true };
    return { text: [t('undo.done', { count: result.undone.length }), skipped].filter(Boolean).join(' '), warning: result.skipped.length > 0 };
  };

  const reasonOf = (concept: RecheckConcept): string | null => {
    if (concept.leftReason === 'no-answer') return t('reason.noAnswer');
    if (concept.leftReason === 'changed-meanwhile') return t('reason.changedMeanwhile');
    if (concept.leftReason === 'refused-path') return t('reason.refusedPath', { path: concept.leftPath ?? '' });
    if (concept.leftReason === 'cut-unread') return t('reason.cutUnread', { path: concept.leftPath ?? '' });
    if (concept.leftReason === 'too-large') return t('reason.tooLarge');
    return concept.reason ? t('dialog.agentReason', { reason: concept.reason }) : null;
  };

  return <div className="mt-2">
    <Chip size="md" hoverInk="strong" hoverSurface="lift" onClick={() => setOpen(true)} data-testid="recheck-view-results" className="atlas-touch-floor">
      {t('viewResults')}
    </Chip>
    <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} size="lg" testId="recheck-results-dialog"
      className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t('dialog.title')}</h2>
          <p className="mt-1 break-words text-body text-[color:var(--color-text-tertiary)]">
            {`${entry.roundName ? `${entry.roundName} · ` : ''}${automationDate(locale, entry.endedAt)}`}
          </p>
        </div>
        <CloseButton label={close('close')} onClick={() => setOpen(false)} className="-mr-1 -mt-1 flex-none" />
      </div>
      <DialogBody className="grid min-h-0 gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <nav aria-label={t('dialog.listLabel')} className="flex min-w-0 flex-col gap-4">
          {GROUPS.map((group) => {
            const members = recheck.concepts.filter((concept) => groupOf(concept) === group);
            if (members.length === 0) return null;
            return <section key={group} className="flex flex-col gap-1">
              <h3 className="text-label text-[color:var(--color-text-tertiary)]">{t(`dialog.${group}`)} · {members.length}</h3>
              <ul className="flex flex-col gap-0.5">
                {members.map((concept) => <li key={concept.path}>
                  <RowButton ref={(element) => {
                    if (element) rows.current.set(concept.path, element);
                    else rows.current.delete(concept.path);
                  }} active={selected?.path === concept.path} aria-current={selected?.path === concept.path ? 'true' : undefined}
                    tone={selected?.path === concept.path ? 'strong' : 'secondary'} hoverInk="strong" hoverSurface="lift" onClick={() => setChosen(concept.path)} data-testid="recheck-result-concept" data-concept={concept.slug}
                    className="w-full text-left">
                    <span className="min-w-0 truncate">{titleOf(concept)}</span>
                  </RowButton>
                </li>)}
              </ul>
            </section>;
          })}
        </nav>
        {selected ? <section aria-live="polite" data-testid="recheck-result-detail" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="min-w-0 break-words text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{titleOf(selected)}</h3>
            <span className={badgeClass({ shape: 'micro', className: cn('border', GROUP_BADGE[groupOf(selected)]) })}>{t(`dialog.${groupOf(selected)}`)}</span>
          </div>
          <p className="break-all font-mono text-label text-[color:var(--color-text-tertiary)]">{selected.path}</p>
          <p className="break-words text-body text-[color:var(--color-text-secondary)]">
            {selected.outcome === 'accurate' ? t('dialog.accurateLine', { files: selected.files.join(', ') })
              : selected.outcome === 'outdated' ? t('dialog.outdatedLine', { files: selected.files.join(', ') })
              : t('dialog.leftLine')}
          </p>
          {reasonOf(selected) ? <p className="break-words text-body text-[color:var(--color-text-primary)]">{reasonOf(selected)}</p> : null}
          {selected.passage ? <blockquote className="break-words border-l-2 border-[color:var(--color-amber-source-a35)] pl-3 text-body text-[color:var(--color-text-secondary)]">
            {selected.passage}
          </blockquote> : null}
          {selected.files.length > 0 && selected.outcome !== 'accurate' ? (
            <p className="break-words text-body text-[color:var(--color-text-tertiary)]">{t('dialog.filesSent', { files: selected.files.join(', ') })}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Link href={buildTopologyReturnHref(selected.slug)} data-testid="recheck-open-concept"
              className={cn(controlClass({ shape: 'link', size: 'lg', tone: 'accent' }), 'atlas-touch-floor')}>{t('dialog.openConcept')}</Link>
            {groupOf(selected) === 'accurate' && recheck.commit ? (
              <Button variant="outline" size="sm" disabled={pending !== null} data-testid="recheck-undo-concept" className="atlas-touch-floor"
                onClick={() => void undo([selected.path], selected.path, selected.path)}>
                {pending === selected.path ? t('dialog.undoing') : t('dialog.undoOne')}
              </Button>
            ) : null}
          </div>
        </section> : null}
      </DialogBody>
      {answer || undoable.length > 0 ? <DialogFooter>
        {answer ? <p role="status" data-testid="recheck-undo-answer" className={cn('mr-auto min-w-0 break-words text-body', answer.warning ? WARNING : 'text-[color:var(--color-text-secondary)]')}>{answer.text}</p> : null}
        {undoable.length > 0 ? (
          <Button variant="outline" disabled={pending !== null} data-testid="recheck-undo-run" className="atlas-touch-floor atlas-touch-floor-wide"
            onClick={() => void undo(undefined, 'run', selected?.path ?? null)}>
            {pending === 'run' ? t('dialog.undoing') : t('dialog.undoAll')}
          </Button>
        ) : null}
      </DialogFooter> : null}
    </Dialog>
  </div>;
}
