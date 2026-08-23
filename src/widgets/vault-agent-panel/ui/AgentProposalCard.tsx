'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { AgentProposal, ProposalChange } from '@/features/vault-agent';
import { summarizeChangeVolume } from '@/features/vault-agent/model/proposal-applier';
import { Checkbox, controlClass } from '@/shared/ui';

/**
 * The proposal card — a generalisation of #688's consent grammar.
 *
 * It reveals every file path that will change, asks once, and **cancelling changes
 * 0 files**.
 *
 * Three things stop a collapsed diff being rubber-stamped:
 * ① the header states the totals ("3 files · +42 −3 lines")
 * ② row summaries are specific down to the field level
 * ③ **the session's first apply starts with the diff expanded**
 *
 * And a proposal editing a file not read in this turn carries a warning row — it
 * narrows the path by which an instruction planted in vault prose gets laundered
 * into a "plausible proposal". (This is not complete protection. Injection is an
 * unsolved industry problem.)
 */

export interface AgentProposalLabels {
  title: (count: number) => string;
  volume: (args: { files: number; added: number; removed: number }) => string;
  apply: (count: number) => string;
  /** The label while a write is running — the screen states "what is happening right now". */
  applying: string;
  cancel: string;
  copy: string;
  copied: string;
  snapshot: string;
  snapshotUnavailable: string;
  applied: (sha: string) => string;
  appliedNoSnapshot: string;
  cancelled: string;
  conflict: string;
  unreadWarning: string;
  showOnMap: string;
  expandHint: string;
  readOnlyTitle: string;
}

export function AgentProposalCard({
  proposal,
  labels,
  canWrite,
  vaultIsGit,
  expandedByDefault,
  onApply,
  onCancel,
  onCopy,
  onToggleChange,
  onToggleSnapshot,
  onFocusNode,
}: {
  proposal: AgentProposal;
  labels: AgentProposalLabels;
  canWrite: boolean;
  vaultIsGit: boolean;
  expandedByDefault: boolean;
  onApply: () => void;
  onCancel: () => void;
  onCopy: () => void;
  onToggleChange: (changeId: string, selected: boolean) => void;
  onToggleSnapshot: (requested: boolean) => void;
  onFocusNode: (slug: string) => void;
}) {
  const selected = proposal.changes.filter((change) => change.selected);
  const volume = useMemo(() => summarizeChangeVolume(selected), [selected]);
  const [copied, setCopied] = useState(false);

  const unread = proposal.changes.filter((change) =>
    change.files.some(
      (file) =>
        file.kind === 'modify' &&
        !proposal.readNodesThisTurn.some((slug) => file.path === `${slug}.md`),
    ),
  );

  /**
   * The write is **in flight** — not finished. Putting this state in `settled` in the
   * draft made it fall through to the terminal-copy branch's fallback, and the screen
   * said **"cancelled"**. Saying it was cancelled mid-write is worse than not locking.
   *
   * So the two are separated: the action row stays (the position of what the user
   * pressed is preserved) while both buttons lock together and only the label changes
   * to "applying…" — the same grammar as the finishing dialog's `busy`.
   */
  const busy = proposal.status === 'applying';
  const settled = proposal.status !== 'pending' && !busy;

  return (
    <section
      data-testid="agent-proposal-card"
      data-proposal-status={proposal.status}
      className="mb-3 flex flex-col gap-2.5 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-3"
    >
      <header className="flex flex-col gap-1">
        <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {canWrite ? labels.title(proposal.changes.length) : labels.readOnlyTitle}
        </p>
        <p
          data-testid="agent-proposal-volume"
          className="text-label tracking-label text-[color:var(--color-text-tertiary)]"
        >
          {labels.volume(volume)}
        </p>
      </header>

      {unread.length > 0 ? (
        <p
          data-testid="agent-proposal-unread-warning"
          className="rounded-chip border border-[color:var(--color-amber-signal-a60)] bg-[color:var(--color-amber-signal-a16)] px-2 py-1 text-label tracking-label text-[color:var(--color-text-secondary)] [word-break:keep-all]"
        >
          {labels.unreadWarning}
        </p>
      ) : null}

      <ul className="flex list-none flex-col gap-1">
        {proposal.changes.map((change) => (
          <ChangeRow
            key={change.id}
            change={change}
            disabled={settled || busy}
            expandedByDefault={expandedByDefault}
            expandHint={labels.expandHint}
            onToggle={(next) => onToggleChange(change.id, next)}
          />
        ))}
      </ul>

      {canWrite && !settled ? (
        <Checkbox
          className="tracking-label"
          data-testid="agent-proposal-snapshot"
          checked={proposal.snapshotRequested}
          disabled={!vaultIsGit}
          onChange={(event) => onToggleSnapshot(event.target.checked)}
          label={<span>{vaultIsGit ? labels.snapshot : labels.snapshotUnavailable}</span>}
        />
      ) : null}

      {settled ? (
        <p
          data-testid="agent-proposal-outcome"
          className="text-label tracking-label text-[color:var(--color-text-tertiary)]"
        >
          {proposal.status === 'applied'
            ? proposal.appliedSnapshotSha
              ? labels.applied(proposal.appliedSnapshotSha)
              : labels.appliedNoSnapshot
            : proposal.status === 'conflict'
              ? labels.conflict
              : labels.cancelled}
          {proposal.status === 'applied' ? (
            <>
              {' '}
              <button
                type="button"
                data-testid="agent-proposal-show-on-map"
                onClick={() =>
                  onFocusNode(proposal.changes[0]?.files[0]?.path.replace(/\.md$/, '') ?? '')
                }
                className={controlClass({ hoverInk: 'strong', shape: "link", className: "underline decoration-dotted underline-offset-2" })}
              >
                {labels.showOnMap}
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="agent-proposal-cancel"
            disabled={busy}
            onClick={onCancel}
            className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong',
              shape: 'chip',
              size: 'md',
              tone: 'secondary',
              className: 'tracking-label border-[color:var(--color-border-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
            })}
          >
            {labels.cancel}
          </button>
          {canWrite ? (
            <button
              type="button"
              data-testid="agent-proposal-apply"
              disabled={busy || selected.length === 0}
              onClick={onApply}
              className={controlClass({
                tone: 'onAccent',
                className:
                  'tracking-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {proposal.status === 'applying' ? labels.applying : labels.apply(selected.length)}
            </button>
          ) : (
            <button
              type="button"
              data-testid="agent-proposal-copy"
              onClick={() => {
                onCopy();
                setCopied(true);
              }}
              className={controlClass({
                shape: 'chip',
                size: 'md',
                tone: 'strong',
                className:
                  'font-[var(--font-weight-emphasis)] tracking-label border-[color:var(--color-indigo-accent)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {copied ? labels.copied : labels.copy}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ChangeRow({
  change,
  disabled,
  expandedByDefault,
  expandHint,
  onToggle,
}: {
  change: ProposalChange;
  disabled: boolean;
  expandedByDefault: boolean;
  expandHint: string;
  onToggle: (selected: boolean) => void;
}) {
  const [open, setOpen] = useState(expandedByDefault);
  return (
    <li className="rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/*
         * This checkbox **had no label**, so there were two defects — with no
         * accessible name (a screen reader reads only "checkbox") there is no telling
         * what is being selected, and at a 14px target it fell short of WCAG 2.5.8 (AA,
         * 24px). Wrapping the file name as the label **solves both at once** — the
         * label becomes the accessible name, and the whole label becomes one target
         * (the native behaviour where clicking a label toggles).
         *
         * The expand button stays **outside** the label — inside it, every press of
         * "Details" would flip the selection.
         */}
        <Checkbox
          className="min-w-0 flex-1"
          data-testid={`agent-proposal-change-${change.id}`}
          checked={change.selected}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          label={
            <>
              <FileText
                aria-hidden="true"
                size={ICON_SIZE.sm}
                className="shrink-0 text-[color:var(--color-text-quaternary)]"
              />
              <span
                className="min-w-0 flex-1 truncate text-label tracking-label text-[color:var(--color-text-secondary)]"
                title={change.summary}
              >
                {change.summary}
              </span>
            </>
          }
        />
        <button
          type="button"
          data-testid="agent-proposal-change-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={controlClass({ hoverInk: 'strong', shape: "link", tone: "muted", className: "shrink-0 tracking-label" })}
        >
          {expandHint}
        </button>
      </div>
      {open ? (
        <div className="border-t border-[color:var(--color-divider)] px-2 py-1.5">
          {change.files.map((file) => (
            <div key={file.path} className="mb-1 last:mb-0">
              <p
                data-testid="agent-proposal-path"
                title={file.path}
                className="truncate text-caption text-[color:var(--color-text-quaternary)]"
              >
                {file.path}
              </p>
              <pre
                data-testid="agent-proposal-diff"
                className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-caption leading-caption"
              >
                {renderDiff(file.before, file.after)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Line-level diff. +/- is **data, not a signal tone** — no new colour system is
 * created; they are distinguished by the existing text hierarchy alone.
 */
function renderDiff(before: string | null, after: string) {
  const beforeLines = before === null ? [] : before.split('\n');
  const afterLines = after.split('\n');
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const rows: React.ReactNode[] = [];
  let key = 0;
  for (const line of beforeLines) {
    if (afterSet.has(line)) continue;
    rows.push(
      <span key={`d-${key++}`} className="block text-[color:var(--color-text-quaternary)]">
        − {line}
      </span>,
    );
  }
  for (const line of afterLines) {
    if (beforeSet.has(line)) continue;
    rows.push(
      <span key={`a-${key++}`} className="block text-[color:var(--color-text-primary)]">
        + {line}
      </span>,
    );
  }
  return rows;
}
