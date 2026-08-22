"use client";

import { useCallback, useState } from "react";
import { ChevronUp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { CompactCopyButton } from "@/shared/ui";
import { copyText } from "@/shared/lib/copy-text";

export interface TopologyIndexAgentHandoffLabels {
  menuLabel: string;
  menuAria: string;
  briefCopy: string;
  briefCopied: string;
  briefCopyAriaLabel: string;
  briefCopiedAriaLabel: string;
  reanalyzeCopy: string;
  reanalyzeCopied: string;
  reanalyzeCopyAriaLabel: string;
  reanalyzeCopiedAriaLabel: string;
  syncCopy: string;
  syncCopied: string;
  syncCopyAriaLabel: string;
  syncCopiedAriaLabel: string;
}

export interface TopologyIndexAgentHandoffProps {
  /** The three already-formatted handoff texts. Assembling the strings (vault
   *  summary / re-analysis instruction / post-change sync gate) is owned by
   *  `views/home/lib/topology-analysis.ts` plus `shared/lib/ontology-tree`; this
   *  widget only copies to the clipboard. */
  briefText: string;
  reanalyzeText: string;
  syncText: string;
  labels: TopologyIndexAgentHandoffLabels;
}

/**
 * The 「인계」 (handoff) menu in the INDEX panel's footer — it groups the three
 * agent-handoff copies (brief / reanalysis / sync) behind one button as a
 * compact disclosure. Three buttons side by side inside the INDEX width
 * (`--topology-index-width`, 300px) truncated every label, so it was compressed
 * to a single entry point with a menu that opens upward.
 */
export function TopologyIndexAgentHandoff({
  briefText,
  reanalyzeText,
  syncText,
  labels,
}: TopologyIndexAgentHandoffProps) {
  const [briefCopied, setBriefCopied] = useState(false);
  const [reanalyzeCopied, setReanalyzeCopied] = useState(false);
  const [syncCopied, setSyncCopied] = useState(false);

  const copyBrief = useCallback(async () => {
    const ok = await copyText(briefText);
    if (!ok) return;
    setBriefCopied(true);
    window.setTimeout(() => setBriefCopied(false), 1600);
  }, [briefText]);

  const copyReanalyze = useCallback(async () => {
    const ok = await copyText(reanalyzeText);
    if (!ok) return;
    setReanalyzeCopied(true);
    window.setTimeout(() => setReanalyzeCopied(false), 1600);
  }, [reanalyzeText]);

  const copySync = useCallback(async () => {
    const ok = await copyText(syncText);
    if (!ok) return;
    setSyncCopied(true);
    window.setTimeout(() => setSyncCopied(false), 1600);
  }, [syncText]);

  return (
    <details className="group relative" data-testid="topology-index-agent-handoff">
      <summary
        aria-label={labels.menuAria}
        data-testid="topology-index-agent-handoff-summary"
        className="inline-flex min-h-[26px] list-none items-center gap-1 rounded-micro border border-[color:var(--topology-v2-panel-border)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
      >
        {labels.menuLabel}
        <ChevronUp
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 rotate-180 transition-transform duration-[var(--motion-base)] group-open:rotate-0 motion-reduce:transition-none"
        />
      </summary>
      <div
        data-testid="topology-index-agent-handoff-menu"
        className="absolute bottom-full right-0 z-10 mb-1.5 hidden w-56 flex-col gap-1 rounded-chip border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-1.5 shadow-[var(--topology-v2-panel-shadow)] group-open:flex"
      >
        <CompactCopyButton
          copied={briefCopied}
          label={labels.briefCopy}
          ariaLabel={briefCopied ? labels.briefCopiedAriaLabel : labels.briefCopyAriaLabel}
          onClick={copyBrief}
          className="justify-start"
          data-testid="topology-index-brief-copy"
        />
        <CompactCopyButton
          copied={reanalyzeCopied}
          label={labels.reanalyzeCopy}
          ariaLabel={
            reanalyzeCopied ? labels.reanalyzeCopiedAriaLabel : labels.reanalyzeCopyAriaLabel
          }
          onClick={copyReanalyze}
          className="justify-start"
          data-testid="topology-index-reanalyze-copy"
        />
        <CompactCopyButton
          copied={syncCopied}
          label={labels.syncCopy}
          ariaLabel={syncCopied ? labels.syncCopiedAriaLabel : labels.syncCopyAriaLabel}
          onClick={copySync}
          className="justify-start"
          data-testid="topology-index-sync-copy"
        />
      </div>
    </details>
  );
}
