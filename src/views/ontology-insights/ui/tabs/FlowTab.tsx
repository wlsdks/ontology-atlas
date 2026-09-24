"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { controlClass } from "@/shared/ui/control-class";
import { Disclosure } from "@/shared/ui";
import { InsightsSectionTitle } from "../parts/InsightsSectionTitle";
import { flowHeadingChanges, type FlowVersion } from "../../lib/flow-history";

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
  checking: string;
  requestLabel: string;
  unavailableTitle: string;
  unavailableBody: string;
  copy: string;
  copied: string;
  noVaultTitle: string;
  noVaultBody: string;
  /** The saved explanation's own header: when it was written and by which runtime. */
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
  /** The exact text handed to the agent, already scoped to this folder. */
  request: string;
  /** Saved explanations of this product, newest first. The newest is the body a person reads. */
  versions?: readonly FlowVersion[];
  /**
   * Whether there is a graph to explain at all. This is the same condition the
   * five sibling tabs draw on, and it is deliberately **not** "the person has
   * opened their own folder": the screen behind this tab is already full of a
   * sample graph in that case, so refusing to draw here reads as broken.
   */
  hasGraph: boolean;
  /**
   * Whether the graph is the person's own folder rather than the built-in sample.
   * Only the launch depends on it — an agent needs a folder of its own to read —
   * while the request stays visible either way, because reading it is how someone
   * decides whether to open a folder in the first place.
   */
  hasOwnFolder: boolean;
  /**
   * Whether an agent can actually be launched here. False in a browser, which
   * cannot start a process; the tab then offers the request for copying rather
   * than drawing a button that cannot finish.
   */
  canLaunchAgent: boolean;
  /** The installed app is still checking its local runtime and bundled server. */
  agentChecking?: boolean;
  /** Seats the request in the conversation. Absent means the control is not drawn. */
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
  const [copied, setCopied] = useState(false);

  if (!hasGraph) {
    return (
      <section className="flex flex-col gap-3" data-testid="flow-tab">
        <InsightsSectionTitle level={2}>{labels.noVaultTitle}</InsightsSectionTitle>
        <p className="text-body text-[color:var(--color-text-secondary)]">{labels.noVaultBody}</p>
      </section>
    );
  }

  const pressable = canLaunchAgent && hasOwnFolder && Boolean(onPrefill);

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

  const latest = versions?.[0] ?? null;
  const previous = versions?.[1] ?? null;
  const changes = latest && previous ? flowHeadingChanges(latest.answer, previous.answer) : [];

  const actionBlock = agentChecking ? (
    <p role="status" className="text-label text-[color:var(--color-text-tertiary)]">
      {labels.checking}
    </p>
  ) : pressable ? (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className={controlClass({ shape: "chip", tone: "accent" })}
        data-testid="flow-prefill"
        onClick={() => onPrefill?.(request)}
      >
        {latest ? labels.rewrite : labels.action}
      </button>
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

  const copyButton = (
    <button
      type="button"
      className={controlClass({ shape: "chip", size: "sm" })}
      data-testid="flow-copy"
      onClick={copyRequest}
    >
      {copied ? labels.copied : labels.copy}
    </button>
  );

  const requestFold = (
    <Disclosure summary={labels.requestLabel} summaryTestId="flow-request-open">
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex justify-end">{copyButton}</div>
        <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-3 font-sans text-label leading-prose text-[color:var(--color-text-secondary)]">
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

      {/*
        * **The written explanation is the body; the request is not.** This tab showed the tool
        * rules that go to the agent and nothing else, so a reader could not tell what it was for
        * (owner, 2026-09-19). What is worth reading is what an agent wrote, what is worth keeping
        * is how it changed between writings, and the request belongs behind a fold.
        */}
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
        /*
         * ⚠️ **Before the first writing, the request is the tab's only real object.** Three
         * 62ch paragraphs stacked down a 1368px column left two thirds of the band empty
         * (1512x949, 2026-09-25), with the one thing worth checking folded away at the foot.
         * With nothing written yet, the two halves of the decision sit side by side: what
         * would appear here and how to start it, and the exact text the agent would receive.
         */
        <div className="grid grid-cols-1 gap-[var(--card-gap)] @min-[960px]/insights:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]" data-testid="flow-no-version">
            <div className="flex flex-col gap-1.5">
              <p className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{labels.noVersionTitle}</p>
              <p className="text-body leading-prose text-[color:var(--color-text-secondary)]">{labels.noVersionBody}</p>
            </div>
            <div className="border-t border-[color:var(--color-divider)] pt-4">{actionBlock}</div>
          </div>
          {/*
            * ⚠️ **The explanation sets the row's height; the request scrolls inside it.** With the
            * 256px request sizing the row, the explanation card stretched to it and carried ~160px
            * of empty middle at 1512 (review, 2026-09-25). The request text now fills whatever
            * height the explanation takes, out of flow, so neither card holds a blank band; on a
            * single column it keeps a 16rem floor.
            */}
          <section aria-label={labels.requestLabel} data-testid="flow-request" className="flex min-h-0 flex-col gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body text-[color:var(--color-text-secondary)]">{labels.requestLabel}</h3>
              {copyButton}
            </div>
            <RequestScroller request={request} />
          </section>
        </div>
      )}
    </section>
  );
}

/**
 * The request text as a designed scroll region beside the explanation.
 *
 * ⚠️ **A clipped line reads as a bug** (review, 2026-09-25). The box ended wherever the row did,
 * so its last visible line was cut through the middle of its glyphs with nothing saying the text
 * went on. The frame (border and surface) now stays still while the text scrolls inside it, and
 * the edge that has more text fades out over `--tabbar-edge-fade`, the same width and the same
 * four-state mask the library index and the tab strips use. The fade appears only while there is
 * text past that edge, so a request that fits keeps its last line whole.
 *
 * ⚠️ **The text face, not the monospace one** (review, 2026-09-25, round 5). `<pre>` defaults to
 * monospace, and Hangul in it fell back glyph by glyph with word-wide gaps. What is copied is
 * the string, never the face it is drawn in, so the preview reads as the sentences it is while
 * `pre-wrap` still keeps its line breaks and numbered list exactly as sent.
 */
function RequestScroller({ request }: { request: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLPreElement>(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });
  /*
   * ⚠️ **The viewport ends between two lines, not through one** (review, 2026-09-25, round 4).
   * With the text filling the frame, the last visible line was cut through its glyphs and a 22px
   * fade over a 19px line could not hide it. The scroll viewport is now snapped to a whole number
   * of lines under the top padding, so at rest the last line shown is whole and the fade dims it
   * as "more below"; the frame keeps its full height and the remainder reads as its padding.
   */
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
    <div ref={frameRef} className="relative min-h-64 flex-1 overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] @min-[960px]/insights:min-h-32">
      <pre
        ref={ref}
        data-testid="flow-request-text"
        data-fade-bottom={edge.bottom ? "" : undefined}
        onScroll={measure}
        style={{
          ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : null),
          ...(viewport != null ? { height: viewport, bottom: "auto" } : null),
        }}
        className="atlas-scroll-quiet absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 font-sans text-label leading-prose text-[color:var(--color-text-secondary)]"
      >
        {request}
      </pre>
    </div>
  );
}
