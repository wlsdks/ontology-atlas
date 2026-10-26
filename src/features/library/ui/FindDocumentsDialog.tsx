"use client";

import { ActionFeedbackGlyph, type ActionFeedbackState } from '@/shared/motion/action-feedback-glyph';
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2, SearchX } from "lucide-react";

import { candidateKey, formatSourceBytes, type SourceCandidate } from "@/entities/docs-vault";
import { Button, Checkbox, Chip, CloseButton, Dialog, EmptyState, controlClass } from "@/shared/ui";
import { Input } from '@/shared/ui/fields/input';
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Link } from "@/i18n/navigation";

import type { DiscoveryOutcome } from "../lib/sources/discover-sources";

/**
 * Candidates a person approves before anything is copied: blocking, every box unticked. Rows show
 * only what discovery learned without opening a file; refusals are remembered per browser,
 * and their count is shown with a way to clear them.
 */

export interface FindDocumentsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null while the walk is still running. */
  outcome: DiscoveryOutcome | null;
  /** Candidates already refused on this machine, and hidden from the list. */
  declinedCount: number;
  onForgetDeclined: () => void;
  /** Copies all ticked candidates; only visible unticked ones are remembered as refused. */
  onAdd: (selected: SourceCandidate[], declined: SourceCandidate[]) => void;
  busy: boolean;
  /** Pick files by hand when the walk proposes nothing; closes this dialog first. */
  onAddFiles?: () => void;
  /** The visible label of that door — the index chip's own word, so the two read as one. */
  addFilesLabel?: string;
  addFilesFeedback?: ActionFeedbackState;
}

export function FindDocumentsDialog({
  open,
  onClose,
  outcome,
  declinedCount,
  onForgetDeclined,
  onAdd,
  busy,
  onAddFiles,
  addFilesLabel,
  addFilesFeedback = 'idle',
}: FindDocumentsDialogProps) {
  const t = useTranslations("library.find");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const queryRef = useRef<HTMLInputElement>(null);
  /** Every run starts unticked, reset by key during render, or a click lands on an unseen file. */
  const runKey = `${open}:${outcome?.candidates.length ?? -1}:${outcome?.candidates[0]?.relativePath ?? ""}`;
  const [tickedRunKey, setTickedRunKey] = useState(runKey);
  if (tickedRunKey !== runKey) {
    setTickedRunKey(runKey);
    setTicked(new Set());
    setQuery('');
  }

  const candidates = useMemo(() => outcome?.candidates ?? [], [outcome]);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => candidates.filter((candidate) =>
    `${candidate.name}\n${candidate.relativePath}`.toLowerCase().includes(needle),
  ), [candidates, needle]);
  const byRoot = useMemo(() => {
    const groups = new Map<string, SourceCandidate[]>();
    for (const candidate of visible) {
      const list = groups.get(candidate.rootLabel);
      if (list) list.push(candidate);
      else groups.set(candidate.rootLabel, [candidate]);
    }
    return [...groups];
  }, [visible]);

  /* Nothing to pick is a finished answer: an EmptyState, and the footer stands down. */
  const nothingToPick = outcome !== null && candidates.length === 0;
  const selected = candidates.filter((candidate) => ticked.has(candidateKey(candidate)));
  const declined = visible.filter((candidate) => !ticked.has(candidateKey(candidate)));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="find-documents-title"
      size="md"
      // The list scrolls, never the dialog; `dvh` follows mobile browser chrome where `vh` does not.
      className="flex max-h-[calc(100dvh-4rem)] flex-col"
    >
      {/* The corner close, as on the import dialog, with Escape and the scrim doing the same. */}
      <div className="flex items-start justify-between gap-3">
        <h2
          id="find-documents-title"
          className="min-w-0 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t("title")}
        </h2>
        <CloseButton
          label={t("close")}
          data-testid="find-documents-close"
          className="atlas-touch-floor atlas-touch-floor-wide -mr-2 -mt-1 shrink-0"
          onClick={onClose}
        />
      </div>
      <p className="mt-2 text-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {t("preamble")}
      </p>
      {outcome && !outcome.projectRootsReachable ? (
        // Degradation grammar from `.claude/rules/surfaces.md`: the open folder is still walked below.
        <p
          data-testid="find-documents-web-limit"
          className="mt-2 text-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("webLimit")}{" "}
          <Link
            href="/download"
            data-testid="find-documents-web-get-app"
            // `cn` merging is required on `<Link>`, or the base border-transparent wins by source order.
            className={controlClass({
              shape: "link",
              tone: "accent",
              hoverInk: "strong",
              className: "atlas-touch-floor atlas-touch-floor-wide rounded-chip px-1.5 py-0.5",
            })}
          >
            {t("webGetApp")}
          </Link>
        </p>
      ) : null}
      {outcome && outcome.walkedRoots.length > 0 ? (
        <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">
          {t("walkedRoots", { roots: outcome.walkedRoots.join(", ") })}
        </p>
      ) : null}

      {candidates.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          <Input
            ref={queryRef}
            type="search"
            label={t('searchLabel')}
            hint={t('searchHint')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={busy}
            className="w-full"
          />
          <p role="status" className="text-label text-[color:var(--color-text-tertiary)]">
            {t('searchCount', { visible: visible.length, total: candidates.length, selected: selected.length })}
          </p>
        </div>
      ) : null}

      <div
        data-testid="find-documents-list"
        className="mt-4 flex min-h-0 flex-1 max-h-[46dvh] flex-col gap-3 overflow-auto pb-3"
      >
        {outcome === null ? (
          <p className="text-body text-[color:var(--color-text-tertiary)]">{t("walking")}</p>
        ) : candidates.length === 0 ? (
          // "Nothing matches" and "everything is hidden by your refusals" are different, undoable states.
          <div data-testid="find-documents-empty">
            <EmptyState
              size="compact"
              tone="solid"
              icon={<SearchX />}
              title={declinedCount > 0 ? t("emptyAllDeclined", { count: declinedCount }) : t("empty")}
              action={
                onAddFiles && addFilesLabel ? (
                  <Chip
                    data-testid="find-documents-add-files"
                    aria-busy={open && addFilesFeedback === 'working' || undefined}
                    tone="strong"
                    hoverSurface="lift"
                    hoverBorder="strong"
                    className="atlas-touch-floor gap-1.5 self-start"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                      onAddFiles();
                    }}
                  >
                    <ActionFeedbackGlyph state={open ? addFilesFeedback : 'idle'} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} />
                    {addFilesLabel}
                  </Chip>
                ) : undefined
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            size="compact"
            tone="solid"
            icon={<SearchX />}
            title={t('noMatches')}
            action={<Chip
              data-testid="find-documents-clear-search"
              className="atlas-touch-floor"
              onClick={() => { setQuery(''); queryRef.current?.focus(); }}
            >{t('clearSearch')}</Chip>}
          />
        ) : (
          byRoot.map(([rootLabel, rows]) => (
            <section key={rootLabel} className="flex flex-col gap-1">
              <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]">
                {t("rootHeader", { root: rootLabel, count: rows.length })}
              </h3>
              {rows.map((candidate) => {
                const key = candidateKey(candidate);
                return (
                  /* Keep both names readable: equal basenames can belong to different folders. */
                  <Checkbox
                    key={key}
                    data-testid={`find-documents-candidate-${candidate.relativePath}`}
                    checked={ticked.has(key)}
                    onChange={(event) =>
                      setTicked((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(key);
                        else next.delete(key);
                        return next;
                      })
                    }
                    className="min-h-[var(--control-h-lg)] w-full gap-3 rounded-chip px-2 py-2 hover:bg-[color:var(--color-overlay-1)]"
                    label={
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="[overflow-wrap:anywhere]">{candidate.name}</span>
                        <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 font-mono text-caption text-[color:var(--color-text-tertiary)]">
                          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{candidate.relativePath}</span>
                          <span className="shrink-0 tabular-nums">{candidate.extension.toUpperCase()} · {formatSourceBytes(candidate.size)}</span>
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </section>
          ))
        )}
      </div>

      {outcome?.truncated ? (
        <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">{t("truncated")}</p>
      ) : null}
      {outcome && outcome.unreadableRoots.length > 0 ? (
        <p className="mt-2 text-label text-[color:var(--color-text-tertiary)]">
          {t("unreadable", { roots: outcome.unreadableRoots.join(", ") })}
        </p>
      ) : null}
      {declinedCount > 0 ? (
        <p
          data-testid="find-documents-declined"
          className="mt-2 flex items-center gap-2 text-label text-[color:var(--color-text-tertiary)]"
        >
          <span className="min-w-0 flex-1">{t("declined", { count: declinedCount })}</span>
          <Button variant="ghost" size="sm" className="atlas-touch-floor" onClick={onForgetDeclined}>
            {t("forgetDeclined")}
          </Button>
        </p>
      ) : null}

      {nothingToPick ? null : (
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" className="atlas-touch-floor" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            data-testid="find-documents-add"
            variant="primary"
            className="atlas-touch-floor"
            disabled={busy || selected.length === 0}
            onClick={() => onAdd(selected, declined)}
          >
            {t("add", { count: selected.length })}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
