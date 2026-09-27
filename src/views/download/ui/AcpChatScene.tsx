'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { HeroTypewriter } from './HeroTypewriter';

/**
 * A chat message becoming a relation inside the app, from the measured round trip in the
 * record `docs/DECISIONS.md` 2026-08-16 (7). The copy never implies we provide model access and uses only
 * registry names (docs/DECISIONS.md 2026-08-16 (5), `tests/contract/vendor-naming.contract.test.ts`).
 * Steps arrive in causal order (`.claude/rules/design.md`); reduced motion shows all at once.
 */

/** A program record, never translated; the `why` repeats the person's sentence, so it is. */
const TOOL_NAME = 'add_relation';

function quoted(why: string): string {
  return `"${why}"`;
}

/**
 * Arrival times (ms) of the agent's two steps only: the person's sentence is the premise and is
 * on from the first frame, or the box reads as broken. The result lands after the call finishes
 * typing, or the effect precedes its cause.
 */
const STEP_AT = [400, 1800];
/** Ends before the result beat. */
const TOOL_TYPING_BUDGET_MS = 1100;

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
    /** Back to the premise, never an empty box. */
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
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border-soft)] px-6 py-3.5 text-caption leading-caption text-[color:var(--color-text-tertiary)]">
        {t('acpSceneTab')}
      </div>

      {/* Reserved height, so arriving lines do not push the section below. */}
      <div className="grid min-h-[17rem] content-start gap-5 px-6 pb-6 pt-5">
        <div className={cn('gateway-term-line', shown >= 1 && 'is-on', 'flex min-w-0 justify-end')}>
          <div className="min-w-0 max-w-[34rem]">
            <p className="text-right text-caption leading-caption text-[color:var(--color-text-tertiary)]">
              {t('acpUserLabel')}
            </p>
            <p className="mt-1.5 break-keep rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">
              {t('acpUserMsg')}
            </p>
          </div>
        </div>

        <div className={cn('gateway-term-line', shown >= 2 && 'is-on', 'min-w-0')}>
          <p className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">
            {t('acpToolCaption')}
          </p>
          {/* Two fields in a grid, not one typed line, so the payload wraps at every width. */}
          <div className="mt-1.5 min-w-0 rounded-panel border border-[color:var(--color-border-soft)] p-[var(--card-pad)] text-body leading-body">
            <p className="font-mono text-[color:var(--color-text-secondary)]">{TOOL_NAME}</p>
            <p className="mt-1 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <span className="font-mono text-[color:var(--color-text-tertiary)]">why</span>
              <span className="min-w-0 break-keep text-[color:var(--color-text-secondary)]">
                {/* The typewriter is aria-hidden; `aria-label` on a span is prohibited. */}
                <span className="sr-only">{quoted(t('acpToolWhy'))}</span>
                <HeroTypewriter
                  lines={[{ text: quoted(t('acpToolWhy')) }]}
                  start={shown >= 2}
                  budgetMs={TOOL_TYPING_BUDGET_MS}
                />
              </span>
            </p>
          </div>
        </div>

        {/* What remains: one line of vault frontmatter, which git sees. */}
        <p
          className={cn(
            'gateway-term-line',
            shown >= 3 && 'is-on',
            'min-w-0 break-keep text-body leading-body text-[color:var(--color-indigo-accent)]',
          )}
        >
          {t('acpResultLine')}
        </p>
      </div>
    </div>
  );
}
