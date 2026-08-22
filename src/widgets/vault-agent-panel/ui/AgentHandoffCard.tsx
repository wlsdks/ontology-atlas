'use client';

import { useEffect, useState } from 'react';
import { controlClass } from '@/shared/ui';

/**
 * The boundary card — it states honestly 「what cannot be done here」 and hands over
 * to where it can.
 *
 * This panel's agent sees only the docs folder. Questions the code decides (does
 * this concept match the real implementation, does this path still exist) are
 * better answered by the AI **in the user's own terminal** — the session continues,
 * there are tabs, and their own configuration is intact. So what the card gives is
 * the two lines that get you there: the `cd` into the vault, and a sentence that
 * starts the work the moment it is pasted.
 *
 * Even without the app providing a window, half of the return trip already exists —
 * the vault watcher draws whatever was changed outside onto the map.
 *
 * Handing over rather than trying to win a losing fight is this surface's boundary.
 *
 * ## Why the boundary sentence moved here
 *
 * The sentence "work that needs the code too is better in the terminal AI" used to
 * sit permanently below the composer, eating two lines through the whole
 * conversation, while the only moment it is useful is **when handing over**. So it
 * moved down to that position — the reason for handing over and the way to hand
 * over have to be in one place for the sentence to be guidance.
 */
export function AgentHandoffPacket({
  vaultPath,
  focusedSlug,
  labels,
}: {
  vaultPath: string;
  focusedSlug: string | null;
  labels: {
    /** Why hand over — this surface's boundary. */
    boundary: string;
    note: string;
    copy: string;
    copied: string;
  };
}) {
  const [copied, setCopied] = useState(false);
  // The confirmation has to mean it was copied **just now**. Pressing once and
  // leaving "copied" there permanently makes it a lie to whoever looks later — it is
  // true only briefly, right after the press.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // The concept name is exactly what the screen calls it — it has to resolve in the
  // vault the moment it is pasted. (The caller passes the `resolveNodeAgentTarget` result.)
  const packet = [
    `cd ${vaultPath}`,
    '',
    focusedSlug
      ? `Check whether the concept "${focusedSlug}" still matches the code, using the ontology-atlas MCP tools plus the repository source. Report what drifted.`
      : 'Check whether this vault still matches the code, using the ontology-atlas MCP tools plus the repository source. Report what drifted.',
  ].join('\n');

  return (
    <div data-testid="agent-handoff-card">
      <p className="mb-2 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
        {labels.boundary}
      </p>
      <p className="mb-2 text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {labels.note}
      </p>
      <pre
        data-testid="agent-handoff-packet"
        className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] p-2 text-caption leading-caption text-[color:var(--color-text-secondary)]"
      >
        {packet}
      </pre>
      <button
        type="button"
        data-testid="agent-handoff-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(packet);
          setCopied(true);
        }}
        className={controlClass({
          shape: 'chip',
          size: 'md',
          tone: 'secondary',
          className:
            'mt-2 tracking-label border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
        })}
      >
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
