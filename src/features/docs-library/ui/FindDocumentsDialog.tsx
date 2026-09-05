"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { candidateKey, formatSourceBytes, type SourceCandidate } from "@/entities/docs-vault";
import { Button, Checkbox, Dialog, controlClass } from "@/shared/ui";
import { Link } from "@/i18n/navigation";

import type { DiscoveryOutcome } from "../lib/discover-sources";

/**
 * The candidate list a person approves before anything is copied.
 *
 * **Blocking, and every box starts unticked.** Both are the same decision: this dialog
 * proposes taking copies of a person's files into their vault, and a proposal that
 * defaults to yes is not a proposal. `Dialog` supplies the scrim, focus trap, Escape and
 * scroll lock, so the surface cannot be dismissed by accident while it is asking.
 *
 * **What the rows are allowed to say.** Name, format, size, when it changed, and which
 * granted folder proposed it. That is the whole of what discovery learned, because it
 * never opened a file — and showing more would mean it had.
 *
 * **A refusal is remembered, on this machine only.** Boxes left unticked are recorded in
 * `localStorage` so the same files are not proposed again; the memory is per-browser and
 * deliberately loseable (`declined-candidates.ts` says why). The count of remembered
 * refusals is shown with a way to clear it, because a filter a person cannot see is a
 * filter they cannot correct.
 */

export interface FindDocumentsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null while the walk is still running. */
  outcome: DiscoveryOutcome | null;
  /** Candidates already refused on this machine, and hidden from the list. */
  declinedCount: number;
  onForgetDeclined: () => void;
  /** Copies the ticked candidates; the unticked ones are remembered as refused. */
  onAdd: (selected: SourceCandidate[], declined: SourceCandidate[]) => void;
  busy: boolean;
}

export function FindDocumentsDialog({
  open,
  onClose,
  outcome,
  declinedCount,
  onForgetDeclined,
  onAdd,
  busy,
}: FindDocumentsDialogProps) {
  const t = useTranslations("docsLibrary.find");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  /**
   * **Every run starts from nothing ticked**, and the reset is keyed rather than done in
   * an effect. Carrying a previous run's selection into a new list would let one click
   * land on a file the person never saw; resetting during render on a changed key does
   * that without a cascading render.
   */
  const runKey = `${open}:${outcome?.candidates.length ?? -1}:${outcome?.candidates[0]?.relativePath ?? ""}`;
  const [tickedRunKey, setTickedRunKey] = useState(runKey);
  if (tickedRunKey !== runKey) {
    setTickedRunKey(runKey);
    setTicked(new Set());
  }

  const candidates = useMemo(() => outcome?.candidates ?? [], [outcome]);
  const byRoot = useMemo(() => {
    const groups = new Map<string, SourceCandidate[]>();
    for (const candidate of candidates) {
      const list = groups.get(candidate.rootLabel);
      if (list) list.push(candidate);
      else groups.set(candidate.rootLabel, [candidate]);
    }
    return [...groups];
  }, [candidates]);

  const selected = candidates.filter((candidate) => ticked.has(candidateKey(candidate)));
  const declined = candidates.filter((candidate) => !ticked.has(candidateKey(candidate)));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="find-documents-title"
      size="md"
      // A column bounded by the viewport: at 390 and 834 the candidate list is what
      // scrolls, never the dialog past the bottom of the screen. `dvh` rather than `vh`
      // because a mobile browser's chrome moves and `vh` does not notice.
      className="flex max-h-[calc(100dvh-4rem)] flex-col"
    >
      <h2
        id="find-documents-title"
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t("title")}
      </h2>
      {/* The sentence a person needs before reading a list of their own files: what was
          walked, and that nothing has been read. */}
      <p className="mt-2 text-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {t("preamble")}
      </p>
      {outcome && !outcome.projectRootsReachable ? (
        // The degradation grammar in `.claude/rules/surfaces.md`: why it is unavailable,
        // where it works, and what still works here. The last part is the list below —
        // the open folder is walked either way, so this is a narrower answer, not none.
        <p
          data-testid="find-documents-web-limit"
          className="mt-2 text-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("webLimit")}{" "}
          <Link
            href="/download"
            data-testid="find-documents-web-get-app"
            // The value layer owns the shape; `cn` merging is required on `<Link>`, or
            // the base border-transparent wins by source order.
            // `hoverInk: 'strong'` is the axis for exactly this; writing the class by
            // hand is what the hover-axis ratchet counts.
            className={controlClass({
              shape: "link",
              hoverInk: "strong",
              className: "rounded-chip px-1.5 py-0.5",
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

      <div
        data-testid="find-documents-list"
        className="mt-4 flex min-h-0 flex-1 max-h-[46dvh] flex-col gap-3 overflow-auto"
      >
        {outcome === null ? (
          <p className="text-body text-[color:var(--color-text-tertiary)]">{t("walking")}</p>
        ) : candidates.length === 0 ? (
          // Two different empty lists. "Nothing here matches" and "everything here is
          // already hidden because you passed on it" send a person to different places,
          // and the second one is a state they can undo — measured on the north-star
          // walkthrough, where the generic sentence guessed while the count below it knew.
          <p
            data-testid="find-documents-empty"
            className="text-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {declinedCount > 0 ? t("emptyAllDeclined", { count: declinedCount }) : t("empty")}
          </p>
        ) : (
          byRoot.map(([rootLabel, rows]) => (
            <section key={rootLabel} className="flex flex-col gap-1">
              <h3 className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                {t("rootHeader", { root: rootLabel, count: rows.length })}
              </h3>
              {rows.map((candidate) => {
                const key = candidateKey(candidate);
                return (
                  /*
                   * **The whole row is the label**, not just the box and the name. The
                   * primitive's `label` takes a node, so the path and the size go inside
                   * it — a person aiming at the row's empty middle hits the control, and
                   * no second `<label>` is nested to get there.
                   *
                   * Equal height whatever the path length: a long path truncates rather
                   * than wrapping, or one row grows taller than its neighbours.
                   */
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
                    className="min-h-[var(--control-h-lg)] w-full gap-3 rounded-chip px-2 hover:bg-[color:var(--color-overlay-1)]"
                    label={
                      <>
                        <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                        <span className="min-w-0 truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                          {candidate.relativePath}
                        </span>
                        <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                          {candidate.extension.toUpperCase()} · {formatSourceBytes(candidate.size)}
                        </span>
                      </>
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
          <Button variant="ghost" size="sm" onClick={onForgetDeclined}>
            {t("forgetDeclined")}
          </Button>
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t("cancel")}
        </Button>
        <Button
          data-testid="find-documents-add"
          variant="primary"
          disabled={busy || selected.length === 0}
          onClick={() => onAdd(selected, declined)}
        >
          {t("add", { count: selected.length })}
        </Button>
      </div>
    </Dialog>
  );
}
