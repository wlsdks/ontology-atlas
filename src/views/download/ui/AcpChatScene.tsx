'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { HeroTypewriter } from './HeroTypewriter';

/**
 * A re-enactment of the in-app conversation — **one measured round trip where a chat message
 * becomes a relation**.
 *
 * ## What this section was selling was wrong (owner, 2026-08-18)
 *
 * The previous version was an `mcp-verify` terminal — a developer verifying configuration. Owner:
 *[I have no idea what this means; what I want to emphasize is that ACP is inside the service — that an agent is connected and ontology analysis is possible through chat alone]*. The scene that sells is not verification but **conversation inside the app**: a person explains in their own language, the agent calls vault tools, and the result remains as one line of markdown.
 *
 * ## The conversation evidence is measured; the permission labels are current
 *
 * The user's sentence and `add_relation`'s `why` payload come from the measured round trip in
 * `docs/DECISIONS.md` 2026-08-16 (7). The surrounding caption and result describe the current
 * reviewed-write policy, so the tab names this as the current Atlas write flow instead of claiming
 * a verbatim dated replay. The tool call name remains a program record and is not translated.
 *
 * ## Brand and terms boundaries (docs/DECISIONS.md 2026-08-16 (5))
 *
 * This section's copy stands only on "connect the agent you already use" — sentences implying we provide Claude access are forbidden, and where our runner list is described the display name is only the registry's permitted name (Claude Agent), the rule `tests/contract/vendor-naming.contract.test.ts` locks.
 *
 * ## Motion
 *
 * When the section enters the viewport, the user bubble → the tool call → the result arrive in causal order (staggering is allowed only when the cause moves first and shows the causality — `.claude/rules/design.md`). Under reduced-motion every line is visible immediately with no timers. Leaving rewinds it and re-entering starts over — one cycle completes the argument (the same playback contract `AgentTerminal` used).
 */

/**
 * The tool call of the measured round trip — `docs/DECISIONS.md` 2026-08-16 (7).
 *
 * **The call name is a program record and is not translated; the `why` payload is** (corrected
 * 2026-08-18). At first the whole line sat outside i18n, but that payload is not a string a
 * program invented — it is **the person's sentence from the bubble directly above**. So on the
 * English screen the bubble was English while the call beneath repeated the same thing in Korean,
 * and the `locale-purity` e2e caught it. As long as two places show the same sentence their
 * language must match — the discipline meant to avoid adaptation was instead making one screen say
 * one sentence in two languages.
 */
function toolCallLine(why: string): string {
  return `add_relation | "${why}"`;
}

/**
 * Arrival times (ms) — **only the agent's two steps** (tool call → result) arrive.
 *
 * ## The person's sentence does not appear — it is the premise (2026-08-22)
 *
 * The old score was `[250, 1050, 1750]`, the first value belonging to the bubble. So after the
 * section entered the viewport there was **a 17rem empty box** standing for at least 250ms, and
 * for 1,750ms until all three lines filled. Measured (1512, screenshot right after the scroll
 * arrival): 250px sat entirely empty beneath a single heading line, and the three lines filled only
 * after five seconds. A box with nothing but a border does not read as "waiting for the
 * choreography" — it reads as **broken, or loading**.
 *
 * Two fixes were possible. ① Make everything faster — the empty-box time shrinks but does not
 * disappear. ② **Take the first line out of the choreography** — this one was chosen. This scene's
 * argument is "a person speaks and the agent fixes the vault", and what must move there is **the
 * agent's response**. The person's sentence is the **premise** that response answers, not a
 * result — and a message already sent sitting on screen with the agent reacting to it is also how
 * a conversation actually looks.
 *
 * So the box is **not empty from the first frame**. What was lost is one decorative bubble rise;
 * what was gained is that "what this section shows" reads the instant it arrives. The
 * "informational motion only" rule in `.claude/rules/design.md` asks for exactly this trade.
 *
 * The remaining gap between the two steps (650ms) is shorter than the old bubble→call gap (800ms) —
 * with one step gone, the total length is pulled back by that much to keep the rhythm.
 */
/*
 * [Revised 2026-08-23] The tool call **types** instead of fading in — the owner-picked
 * "live data card" from the reference survey (Resend's pattern: the motion is the data
 * arriving). The content is unchanged and still the measured session verbatim; only the way the
 * line arrives changed. Typing runs ~1.1s from 400ms, so the result's beat moved from 1050 to
 * 1800 — it must land **after** the call has finished writing, or the effect precedes its cause.
 */
const STEP_AT = [400, 1800];
/** The tool-call line's typing budget (ms) — ends before the result beat above. */
const TOOL_TYPING_BUDGET_MS = 1100;

/** The first line (the person's sentence) is always on — which is why the choreography starts at 1. */
const PREMISE_SHOWN = 1;

export function AcpChatScene() {
  const t = useTranslations('download');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(PREMISE_SHOWN);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timers: number[] = [];
    /** Rewinding goes back **only to the premise** — never to an empty box. */
    const clear = (): void => {
      for (const id of timers) window.clearTimeout(id);
      timers = [];
      setShown(PREMISE_SHOWN);
    };
    const play = (): void => {
      clear();
      if (reduced) {
        setShown(PREMISE_SHOWN + STEP_AT.length);
        return;
      }
      STEP_AT.forEach((at, i) => {
        timers.push(window.setTimeout(() => setShown(PREMISE_SHOWN + i + 1), at));
      });
    };

    if (typeof IntersectionObserver === 'undefined') {
      play();
      return clear;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) play();
        else clear();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-testid="gateway-agent-chat"
      className="min-w-0 overflow-hidden rounded-panel border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] text-left"
    >
      <div className="border-b border-[color:var(--color-border-soft)] px-6 py-3.5 font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
        {t('acpSceneTab')}
      </div>

      {/* Reserve the height so arriving lines do not push the section below (the terminal-era contract). */}
      <div className="grid min-h-[17rem] content-start gap-5 px-6 pb-6 pt-5">
        {/* ① The person's sentence — the user input of the measured session, verbatim. */}
        <div className={cn('gateway-term-line', shown >= 1 && 'is-on', 'flex min-w-0 justify-end')}>
          <div className="min-w-0 max-w-[34rem]">
            <p className="text-right font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
              {t('acpUserLabel')}
            </p>
            <p className="mt-1.5 break-keep rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
              {t('acpUserMsg')}
            </p>
          </div>
        </div>

        {/* ② The agent's tool call — the name verbatim, the `why` in the screen's language. */}
        <div className={cn('gateway-term-line', shown >= 2 && 'is-on', 'min-w-0')}>
          <p className="break-keep font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]">
            {t('acpToolCaption')}
          </p>
          {/*
           * The typewriter's characters are aria-hidden (its own contract), so the record's
           * accessible text is a visually-hidden plain copy beside it. Not `aria-label` on the
           * `<pre>` — a generic element may not carry a name (the a11y ratchet rejected exactly
           * that in CI, `aria-prohibited-attr`, 2026-08-23).
           */}
          <pre className="mt-1.5 overflow-x-auto rounded-panel border border-[color:var(--color-border-soft)] px-4 py-3 font-mono text-body leading-body text-[color:var(--color-text-tertiary)]">
            <span className="sr-only">{toolCallLine(t('acpToolWhy'))}</span>
            <HeroTypewriter
              lines={[{ text: toolCallLine(t('acpToolWhy')) }]}
              start={shown >= 2}
              budgetMs={TOOL_TYPING_BUDGET_MS}
            />
          </pre>
        </div>

        {/* ③ What remains — one line of vault frontmatter, which git sees. */}
        <p
          className={cn(
            'gateway-term-line',
            shown >= 3 && 'is-on',
            'min-w-0 break-keep font-mono text-body leading-body text-[color:var(--color-indigo-accent)]',
          )}
        >
          {t('acpResultLine')}
        </p>
      </div>
    </div>
  );
}
