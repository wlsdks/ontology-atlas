"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import type { ContainmentProposal } from "../../lib/containment-batch";

/**
 * **The review sheet for the one batch repair on this board.**
 *
 * ## Why a blocking sheet and not a button that just runs
 *
 * This is the first control on the insights board that writes to more than one of the person's
 * files. The local-first promise is that the answer lives on their disk in ordinary Markdown, and
 * the rule that keeps it true is that a person sees each change before it happens — the same shape
 * as the map's change review and the ACP write gate, which wait for an explicit `allow_once`.
 *
 * So: every proposed write is a row, every row states **which document changes and what is added
 * to it**, every row can be unticked, and nothing happens until Apply. Ticked-by-default is the
 * one convenience taken, and it is honest because the sheet shows the complete list on screen
 * before the button is reachable.
 *
 * ## What a row can end as
 *
 * `done` · `conflict` (the file changed since the sheet was opened — its `expected_mtime` refused
 * the write, which is the guard working, not a failure to hide) · `failed` with the message the
 * write threw. A run does not stop at the first refusal: the remaining documents are independent
 * files, and abandoning them would leave the vault in a state nobody chose.
 */
export type ContainmentRowStatus =
  | { phase: "pending" }
  | { phase: "running" }
  | { phase: "done" }
  | { phase: "conflict" }
  | { phase: "failed"; message: string };

export interface ContainmentBatchLabels {
  /** The sheet's own title, carrying the scale of what is proposed. */
  title: (count: number) => string;
  /** One sentence naming exactly what will be written, before any of it happens. */
  lede: string;
  /** One row: this concept is added to that domain document's list. */
  row: (concept: string, domain: string, key: string) => string;
  apply: (count: number) => string;
  applying: string;
  cancel: string;
  close: string;
  statusDone: string;
  statusConflict: string;
  statusFailed: (message: string) => string;
  /** The closing line after a run — what landed and what did not. */
  outcome: (done: number, failed: number) => string;
}

export function ContainmentBatchSheet({
  open,
  proposals,
  statuses,
  running,
  finished,
  onApply,
  onClose,
  labels,
}: {
  open: boolean;
  proposals: readonly ContainmentProposal[];
  /** Proposal id → what happened to it. Absent means pending. */
  statuses: ReadonlyMap<string, ContainmentRowStatus>;
  running: boolean;
  /** True once a run has completed, so the sheet stops offering to run it again. */
  finished: boolean;
  onApply: (accepted: ReadonlySet<string>) => void;
  onClose: () => void;
  labels: ContainmentBatchLabels;
}) {
  return (
    <Dialog
      open={open}
      onClose={running ? () => {} : onClose}
      size="md"
      labelledBy="containment-batch-title"
      testId="containment-batch-sheet"
    >
      {/*
       * The body is its own component because **the tick state must not outlive the sheet.**
       * `Dialog` mounts its children only while open, so a fresh `useState` here starts every
       * opening from "everything ticked" — carrying a previous run's selection forward would hide
       * a row a person unticked for a reason they have since forgotten. Resetting it from an
       * effect instead would be state written during render's shadow, which this repository's
       * lint refuses on principle.
       */}
      <ContainmentBatchBody
        proposals={proposals}
        statuses={statuses}
        running={running}
        finished={finished}
        onApply={onApply}
        onClose={onClose}
        labels={labels}
      />
    </Dialog>
  );
}

function ContainmentBatchBody({
  proposals,
  statuses,
  running,
  finished,
  onApply,
  onClose,
  labels,
}: {
  proposals: readonly ContainmentProposal[];
  statuses: ReadonlyMap<string, ContainmentRowStatus>;
  running: boolean;
  finished: boolean;
  onApply: (accepted: ReadonlySet<string>) => void;
  onClose: () => void;
  labels: ContainmentBatchLabels;
}) {
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(
    () => new Set(proposals.map((proposal) => proposal.id)),
  );

  const toggle = (id: string) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const done = [...statuses.values()].filter((status) => status.phase === "done").length;
  const failed = [...statuses.values()].filter(
    (status) => status.phase === "conflict" || status.phase === "failed",
  ).length;

  return (
    <>
      <h2
        id="containment-batch-title"
        className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {labels.title(proposals.length)}
      </h2>
      <p className="mt-2 break-keep text-body leading-prose text-[color:var(--color-text-tertiary)]">
        {labels.lede}
      </p>

      <div
        data-testid="containment-batch-rows"
        className="mt-4 flex max-h-80 flex-col gap-1 overflow-y-auto"
      >
        {proposals.map((proposal) => {
          const status = statuses.get(proposal.id) ?? { phase: "pending" };
          return (
            <div
              key={proposal.id}
              data-testid="containment-batch-row"
              data-row-status={status.phase}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--color-divider)] py-1.5 last:border-b-0"
            >
              <Checkbox
                className="min-w-0 flex-1"
                checked={accepted.has(proposal.id)}
                disabled={running || finished}
                onChange={() => toggle(proposal.id)}
                label={
                  <span className="min-w-0 break-keep text-body text-[color:var(--color-text-secondary)]">
                    {labels.row(proposal.conceptTitle, proposal.domainTitle, proposal.key)}
                  </span>
                }
              />
              {status.phase === "done" ? (
                <span className="shrink-0 text-label text-[color:var(--color-status-success)]">
                  {labels.statusDone}
                </span>
              ) : null}
              {status.phase === "conflict" ? (
                <span className="shrink-0 text-label text-[color:var(--color-status-warning)]">
                  {labels.statusConflict}
                </span>
              ) : null}
              {status.phase === "failed" ? (
                <span className="min-w-0 break-keep text-label text-[color:var(--color-status-danger)]">
                  {labels.statusFailed(status.message)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {finished ? (
        <p
          data-testid="containment-batch-outcome"
          role="status"
          aria-live="polite"
          className="mt-3 break-keep text-body text-[color:var(--color-text-tertiary)]"
        >
          {labels.outcome(done, failed)}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        {finished ? (
          <Button variant="primary" onClick={onClose} data-testid="containment-batch-close">
            {labels.close}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={running}>
              {labels.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => onApply(accepted)}
              disabled={running || accepted.size === 0}
              data-testid="containment-batch-apply"
            >
              {running ? labels.applying : labels.apply(accepted.size)}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
