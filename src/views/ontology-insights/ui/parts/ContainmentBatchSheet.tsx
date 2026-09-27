"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import type { ContainmentProposal, ContainmentRowStatus } from "../../lib/containment-batch";

/**
 * The review sheet for the board's one batch repair. It writes several of the person's files, so each change is
 * seen first, like the map's change review and the ACP `allow_once` gate: every write is a row naming the
 * document and what is added, rows can be unticked, and nothing happens until Apply. Rows end as `done`, then
 * the `conflict` case (the `expected_mtime` guard refused a changed file), `skipped` (with its reason) or `failed`;
 * a refusal does not stop the run, since the documents are independent. The status type lives with the plan
 * (`lib/containment-batch`) and is re-exported here.
 */
export type { ContainmentRowStatus };

export interface ContainmentBatchLabels {
  /** The sheet's title, carrying the scale of what is proposed. */
  title: (count: number) => string;
  /** One sentence naming exactly what will be written, before any of it happens. */
  lede: string;
  /** One row: this concept is added to that domain document's list. */
  row: (concept: string, domain: string, key: string) => string;
  /** The same row in the names on disk, so a person can tell which of two same-titled documents is written. */
  rowTarget: (domainPath: string, conceptSlug: string) => string;
  apply: (count: number) => string;
  applying: string;
  cancel: string;
  close: string;
  statusDone: string;
  statusConflict: string;
  statusFailed: (message: string) => string;
  /** The closing line after a run: what landed and what did not. */
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
  /** Proposal id to its status; absent means pending. */
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
      {/* A separate component so the tick state starts fresh on every opening (`Dialog` mounts children only while open);
         carrying a previous selection forward could hide a row someone unticked for a reason. */}
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
  // Everything that did not land counts the same to a person, since the file is as it was: refused, skipped or thrown.
  const failed = [...statuses.values()].filter(
    (status) =>
      status.phase === "conflict" || status.phase === "failed" || status.phase === "skipped",
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
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="min-w-0 break-keep text-body text-[color:var(--color-text-secondary)]">
                      {labels.row(proposal.conceptTitle, proposal.domainTitle, proposal.key)}
                    </span>
                    {/* The names on disk under the sentence, the same string the run addresses the file by. */}
                    <span
                      data-testid="containment-batch-row-target"
                      className="min-w-0 break-all text-label text-[color:var(--color-text-tertiary)]"
                    >
                      {labels.rowTarget(proposal.domainPath, proposal.conceptSlug)}
                    </span>
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
              {status.phase === "skipped" ? (
                <span className="min-w-0 break-keep text-label text-[color:var(--color-status-warning)]">
                  {status.message}
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
