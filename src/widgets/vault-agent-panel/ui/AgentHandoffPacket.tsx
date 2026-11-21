'use client';

import { useEffect, useState } from 'react';
import { controlClass } from '@/shared/ui';
import { COPY_FEEDBACK_RESET_MS } from '@/shared/lib/clipboard/use-copy-feedback';

/**
 * Boundary card: this panel's agent sees only the docs folder, so code-dependent questions are
 * handed to the user's terminal AI with two lines: the `cd` into the vault and a sentence to paste.
 */
export function AgentHandoffPacket({
  vaultPath,
  focusedSlug,
  labels,
}: {
  vaultPath: string;
  focusedSlug: string | null;
  labels: {
    boundary: string;
    note: string;
    copy: string;
    copied: string;
  };
}) {
  const [copied, setCopied] = useState(false);
  // The confirmation must mean "copied just now"; a permanent "copied" would be a lie to whoever
  // looks later.
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);
  // The concept name is exactly what the screen calls it, so it resolves in the vault when pasted.
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
            'mt-2 tracking-label border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
        })}
      >
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
