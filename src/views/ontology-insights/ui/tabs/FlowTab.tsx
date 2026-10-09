"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Disclosure } from "@/shared/ui";
import { CopyAgentTextButton } from "../parts/CopyAgentTextButton";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { flowHeadingChanges, type FlowVersion } from "../../lib/flow-history";

/**
 * The one tab whose answer is written, not measured: it asks the agent what this product is and how it moves.
 * It shows the exact request before sending, so a reader can judge a confident narrative against what was asked,
 * and a browser user can paste the same text into their own terminal. Pressing prefills the conversation and the
 * person sends it: a one-click agent turn would put a write-capable session behind an "explain" label.
 */

export interface FlowTabLabels {
  title: string;
  lead: string;
  action: string;
  actionHint: string;
  checking: string;
  requestLabel: string;
  unavailableTitle: string;
  unavailableBody: string;
  copy: string;
  copied: string;
  noVaultTitle: string;
  noVaultBody: string;
  /** The saved explanation's header: when it was written and by which runtime. */
  writtenAt: (values: { when: string; writer: string }) => string;
  standingCurrent: string;
  standingStale: string;
  standingUnknown: string;
  ungrounded: string;
  changedTitle: string;
  changeAdded: string;
  changeRemoved: string;
  changeRewritten: string;
  noVersionTitle: string;
  noVersionBody: string;
  rewrite: string;
  versionsLabel: (count: number) => string;
}

export interface FlowTabProps {
  labels: FlowTabLabels;
  /** The exact text handed to the agent, scoped to this folder. */
  request: string;
  /** Saved explanations, newest first; the newest is the body a person reads. */
  versions?: readonly FlowVersion[];
  /**
   * Whether there is a graph to explain, the sibling tabs' condition. Not "the person opened their own folder":
   * the sample graph is on screen then, so refusing to draw here would read as broken.
   */
  hasGraph: boolean;
  /** Only the launch depends on it, since an agent needs a folder of its own; the request stays visible either way. */
  hasOwnFolder: boolean;
  /** False in a browser, which cannot start a process; the tab then offers the request for copying. */
  canLaunchAgent: boolean;
  /** The installed app is still checking its local runtime and bundled server. */
  agentChecking?: boolean;
  /** Seats the request in the conversation; absent means the control is not drawn. */
  onPrefill?: (text: string) => void;
}

export function FlowTab({
  labels,
  request,
  versions,
  hasGraph,
  hasOwnFolder,
  canLaunchAgent,
  agentChecking = false,
  onPrefill,
}: FlowTabProps) {
  if (!hasGraph) {
    return (
      <section className="flex flex-col gap-3" data-testid="flow-tab">
        <InsightsSectionTitle level={2}>{labels.noVaultTitle}</InsightsSectionTitle>
        <p className="text-body text-[color:var(--color-text-secondary)]">{labels.noVaultBody}</p>
      </section>
    );
  }

  const pressable = canLaunchAgent && hasOwnFolder && Boolean(onPrefill);

  const latest = versions?.[0] ?? null;
  const previous = versions?.[1] ?? null;
  const changes = latest && previous ? flowHeadingChanges(latest.answer, previous.answer) : [];

  const actionBlock = agentChecking ? (
    <p role="status" className="text-label text-[color:var(--color-text-tertiary)]">
      {labels.checking}
    </p>
  ) : pressable ? (
    <div className="flex flex-wrap items-center gap-3">
      {/* The insights panel action: `Button` sm, the 32px rounded-panel control. */}
      <Button
        variant="primary"
        size="sm"
        className="atlas-touch-floor"
        data-testid="flow-prefill"
        onClick={() => onPrefill?.(request)}
      >
        {latest ? labels.rewrite : labels.action}
      </Button>
      <span className="text-label text-[color:var(--color-text-tertiary)]">{labels.actionHint}</span>
    </div>
  ) : (
    <div className="flex flex-col gap-1.5">
      <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {labels.unavailableTitle}
      </p>
      <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">
        {labels.unavailableBody}
      </p>
    </div>
  );

  // The footer's copy grammar, so one panel copies one way.
  const copyButton = (
    <CopyAgentTextButton
      label={labels.copy}
      copiedLabel={labels.copied}
      text={request}
      compact
      testId="flow-copy"
    />
  );

  const requestFold = (
    <Disclosure summary={labels.requestLabel} summaryTestId="flow-request-open">
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex justify-end">{copyButton}</div>
        <pre role="region" aria-label={labels.requestLabel} tabIndex={0} className="max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3 font-sans text-label leading-prose text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]">
          {request}
        </pre>
      </div>
    </Disclosure>
  );

  return (
    <section className="flex flex-col gap-4" data-testid="flow-tab">
      <div className="flex flex-col gap-2">
        <InsightsSectionTitle level={2}>{labels.title}</InsightsSectionTitle>
        <p className="text-body text-[color:var(--color-text-secondary)]">{labels.lead}</p>
      </div>

      {/* What an agent wrote is the body, with how it changed between writings; the request sits behind a fold. */}
      {latest ? (
        <article className="flex flex-col gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]" data-testid="flow-version">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-body text-[color:var(--color-text-secondary)]">
              {labels.writtenAt({ when: latest.createdAt.slice(0, 16).replace("T", " "), writer: latest.writer })}
            </span>
            <span className="text-label text-[color:var(--color-text-tertiary)]" data-flow-standing={latest.standing}>
              {latest.standing === "current" ? labels.standingCurrent : latest.standing === "stale" ? labels.standingStale : labels.standingUnknown}
            </span>
            {latest.grounded ? null : <span className="text-label text-[color:var(--color-amber-source-a90)]">{labels.ungrounded}</span>}
          </header>
          <div className="max-w-[72ch] whitespace-pre-wrap text-body leading-prose text-[color:var(--color-text-primary)]" data-testid="flow-answer">
            {latest.answer}
          </div>
          {changes.length > 0 ? (
            <section data-testid="flow-changes" className="border-t border-[color:var(--color-divider)] pt-3">
              <h3 className="text-label text-[color:var(--color-text-tertiary)]">{labels.changedTitle}</h3>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label text-[color:var(--color-text-secondary)]">
                {changes.map((change) => (
                  <li key={`${change.heading}-${change.change}`}>
                    {change.heading}
                    <span className="ml-1.5 text-[color:var(--color-text-quaternary)]">
                      {change.change === "added" ? labels.changeAdded : change.change === "removed" ? labels.changeRemoved : labels.changeRewritten}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {versions && versions.length > 1 ? (
            <p className="text-label text-[color:var(--color-text-quaternary)]">{labels.versionsLabel(versions.length)}</p>
          ) : null}
        </article>
      ) : null}

      {latest ? (
        <>
          {actionBlock}
          {requestFold}
        </>
      ) : (
        // Before the first writing the request is the tab's only real object, so the two halves sit side by side: what
        // would appear and how to start it, and the exact text the agent would receive.
        <div className="grid grid-cols-1 gap-[var(--card-gap)] @min-[960px]/insights:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]" data-testid="flow-no-version">
            <div className="flex flex-col gap-1.5">
              <p className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{labels.noVersionTitle}</p>
              <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">{labels.noVersionBody}</p>
            </div>
            <div className="border-t border-[color:var(--color-divider)] pt-4">{actionBlock}</div>
          </div>
          {/* The explanation sets the row's height and the request scrolls inside it, so neither card holds a blank band;
             on one column the request keeps a 16rem floor. */}
          <section data-testid="flow-request" className="flex min-h-0 flex-col gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body text-[color:var(--color-text-secondary)]">{labels.requestLabel}</h3>
              {copyButton}
            </div>
            <RequestScroller request={request} label={labels.requestLabel} />
          </section>
        </div>
      )}
    </section>
  );
}

/**
 * The request as a scroll region: the frame stays still, and an edge with more text fades over `--tabbar-edge-fade`
 * (the library index and tab strips' mask) only while text lies past it. The text face, not monospace, since
 * Hangul in `<pre>`'s monospace falls back glyph by glyph; `pre-wrap` keeps the line breaks as sent.
 */
function RequestScroller({ request, label }: { request: string; label: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLPreElement>(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });
  // The viewport snaps to a whole number of lines under the top padding, so the last line shown is whole and the fade
  // reads as "more below".
  const [viewport, setViewport] = useState<number | null>(null);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdge((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);
  const snap = useCallback(() => {
    const frame = frameRef.current;
    const el = ref.current;
    if (!frame || !el) return;
    const style = getComputedStyle(el);
    const line = Number.parseFloat(style.lineHeight);
    const padTop = Number.parseFloat(style.paddingTop) || 0;
    const available = frame.clientHeight;
    if (!Number.isFinite(line) || line <= 0 || available <= 0) return;
    const lines = Math.max(1, Math.floor((available - padTop * 2) / line));
    const snapped = Math.round(padTop + lines * line);
    setViewport((prev) => (el.scrollHeight <= available ? null : prev === snapped ? prev : snapped));
    measure();
  }, [measure]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    snap();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(snap);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [snap, request]);
  const fade = "var(--tabbar-edge-fade)";
  const mask =
    edge.top && edge.bottom
      ? `linear-gradient(to bottom, transparent 0, black ${fade}, black calc(100% - ${fade}), transparent 100%)`
      : edge.bottom
        ? `linear-gradient(to bottom, black calc(100% - ${fade}), transparent 100%)`
        : edge.top
          ? `linear-gradient(to bottom, transparent 0, black ${fade})`
          : undefined;
  return (
    <div ref={frameRef} className="relative min-h-64 flex-1 overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--color-indigo-focus-ring)] @min-[960px]/insights:min-h-32">
      <pre
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-testid="flow-request-text"
        data-fade-bottom={edge.bottom ? "" : undefined}
        onScroll={measure}
        style={{
          ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : null),
          ...(viewport != null ? { height: viewport, bottom: "auto" } : null),
        }}
        className="atlas-scroll-quiet absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 font-sans text-label leading-prose text-[color:var(--color-text-secondary)] focus-visible:outline-none focus-visible:text-[color:var(--color-text-primary)]"
      >
        {request}
      </pre>
    </div>
  );
}
