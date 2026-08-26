"use client";

import { useState } from "react";
import { controlClass } from "@/shared/ui/control-class";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";

/**
 * **The one tab whose answer is written rather than measured.**
 *
 * Every other tab computes something from the graph: a count, a ranking, a heat
 * strip. This one asks the agent for prose, because its question — *what is this
 * product and how does it move* — is read once on first contact and is not a
 * number.
 *
 * ## Why the request is shown before it is sent
 *
 * The tab renders the exact sentence the agent will receive. That is not a
 * courtesy: it is the only way the reader can tell a good narrative from a
 * confident one. The 2026-08-26 field trial had an agent state a project
 * exclusion nothing supported, and a reader with no view of the request has no
 * purchase on why it said that. Showing the text also makes the browser case
 * useful instead of merely blocked — the same sentence pasted into the terminal
 * the person already uses produces the same answer.
 *
 * ## Why it prefills instead of sending
 *
 * Pressing seats the request in the conversation; the person sends it. Handing a
 * screen the power to start an agent turn on one click would put a write-capable
 * session behind a button whose label says "explain", and this product's standing
 * rule is that the human keeps the send. It is also why there is no result
 * pane here: the answer belongs in the conversation that produced it, where its
 * permission trail and its follow-up questions already live.
 */

export interface FlowTabLabels {
  title: string;
  lead: string;
  action: string;
  actionHint: string;
  requestLabel: string;
  unavailableTitle: string;
  unavailableBody: string;
  copy: string;
  copied: string;
  noVaultTitle: string;
  noVaultBody: string;
}

export interface FlowTabProps {
  labels: FlowTabLabels;
  /** The exact text handed to the agent, already scoped to this folder. */
  request: string;
  /**
   * Whether a folder is actually open. The insights route knows a vault is loaded
   * but not where it sits on disk, so the request is written without a path
   * rather than inventing one — a wrong path in a prompt is worse than no path.
   */
  hasVault: boolean;
  /**
   * Whether an agent can actually be launched here. False in a browser, which
   * cannot start a process; the tab then offers the request for copying rather
   * than drawing a button that cannot finish.
   */
  canLaunchAgent: boolean;
  /** Seats the request in the conversation. Absent means the control is not drawn. */
  onPrefill?: (text: string) => void;
}

export function FlowTab({
  labels,
  request,
  hasVault,
  canLaunchAgent,
  onPrefill,
}: FlowTabProps) {
  const [copied, setCopied] = useState(false);

  if (!hasVault) {
    return (
      <section className="flex flex-col gap-3" data-testid="flow-tab">
        <InsightsSectionTitle level={2}>{labels.noVaultTitle}</InsightsSectionTitle>
        <p className="text-body text-[color:var(--color-text-secondary)]">{labels.noVaultBody}</p>
      </section>
    );
  }

  const pressable = canLaunchAgent && Boolean(onPrefill);

  async function copyRequest() {
    try {
      await navigator.clipboard.writeText(request);
      setCopied(true);
    } catch {
      // A denied clipboard is not an error worth a banner; the text is on screen
      // and selectable, which is the fallback the person already has.
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-col gap-4" data-testid="flow-tab">
      <div className="flex flex-col gap-2">
        <InsightsSectionTitle level={2}>{labels.title}</InsightsSectionTitle>
        <p className="max-w-[62ch] text-body text-[color:var(--color-text-secondary)]">{labels.lead}</p>
      </div>

      {pressable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={controlClass({ shape: "chip", tone: "accent" })}
            data-testid="flow-prefill"
            onClick={() => onPrefill?.(request)}
          >
            {labels.action}
          </button>
          <span className="text-label text-[color:var(--color-text-tertiary)]">{labels.actionHint}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {labels.unavailableTitle}
          </p>
          <p className="max-w-[62ch] text-body text-[color:var(--color-text-secondary)]">
            {labels.unavailableBody}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-caption uppercase tracking-wide text-[color:var(--color-text-tertiary)]">
            {labels.requestLabel}
          </span>
          <button
            type="button"
            className={controlClass({ shape: "chip", size: "sm" })}
            data-testid="flow-copy"
            onClick={copyRequest}
          >
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
        <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3 text-label leading-prose text-[color:var(--color-text-secondary)]">
          {request}
        </pre>
      </div>
    </section>
  );
}
