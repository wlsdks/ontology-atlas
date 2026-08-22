'use client';

import type { FirstWordsChip } from '@/features/vault-agent';
import { controlClass } from '@/shared/ui';

/**
 * An empty conversation's **first words** — up to 3 sentences drawn from this
 * folder's real state.
 *
 * ## Two faces, one sentence
 *
 * With a key it is a pressable chip; without a key or a folder it is a **plain
 * list**. Drawing a button in a moment that cannot be completed produces someone
 * who presses it, and that is a trap (`AgentLockedState` reduced its controls to
 * one for the same reason), so the same sentence is drawn only two ways. The
 * sentences themselves are built in one place, `buildFirstWords`.
 *
 * ## Dimension regularity
 *
 * A chip's height is **not decided by character count** — it reserves two lines and
 * clips the overflow. Letting sentence length decide row height makes the three
 * chips ragged, breaking the way the list reads as "one set". The chip **count**,
 * on the other hand, follows the folder's state honestly: reserving an empty box
 * when there is no concept to point at makes an empty slot look like a control.
 *
 * ## Motion
 *
 * A chip does not disappear when pressed (a stateless control — pressing again
 * prefills again), so there is no transition here. Its appearance is already
 * carried in one frame by the panel's state swap (`.agent-panel-stage-swap`).
 */
export function AgentFirstWords({
  chips,
  title,
  hint,
  onPrefill,
}: {
  chips: readonly FirstWordsChip[];
  title: string;
  /** What happens when a chip is pressed — given only while it is pressable. */
  hint?: string;
  /** Absent means a plain list; present means chip buttons. */
  onPrefill?: (text: string) => void;
}) {
  if (chips.length === 0) return null;

  const interactive = typeof onPrefill === 'function';

  return (
    <section
      aria-label={title}
      data-testid="agent-first-words"
      data-interactive={interactive ? 'true' : 'false'}
      className="flex flex-col gap-1.5"
    >
      <p className="text-label tracking-label text-[color:var(--color-text-quaternary)]">
        {title}
      </p>
      <ul
        className={
          interactive ? 'flex list-none flex-col gap-1.5' : 'flex list-none flex-col gap-2'
        }
      >
        {chips.map((chip) => (
          <li key={chip.id} className="min-w-0">
            {interactive ? (
              <button
                type="button"
                data-testid="agent-first-words-chip"
                data-first-words-slot={chip.slot}
                data-first-words-intent={chip.intent.kind}
                onClick={() => onPrefill?.(chip.text)}
                className={controlClass({ hoverInk: 'strong',
                  shape: 'card',
                  size: 'sm',
                  tone: 'secondary',
                  /* `min-h-11` is the WCAG 2.5.8 touch target — the value layer still
                     has that axis only on `link`, so it is carried per site here. */
                  className: 'w-full min-h-11 text-left border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                })}
              >
                {/* Up to two lines. An overflowing sentence does not decide the chip's height. */}
                <span className="line-clamp-2 [word-break:keep-all]">{chip.text}</span>
              </button>
            ) : (
              <p
                data-testid="agent-first-words-line"
                data-first-words-slot={chip.slot}
                data-first-words-intent={chip.intent.kind}
                // A state you cannot press yet does not make the information **less
                // important**. The one thing a person needs here is "what can I ask
                // for", and the old screen drew that sentence as a tertiary-grey
                // caption, making it the quietest thing in the panel (a Tufte ink
                // inversion). It is raised to body weight.
                className="line-clamp-2 text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
              >
                {chip.text}
              </p>
            )}
          </li>
        ))}
      </ul>
      {interactive && hint ? (
        <p className="text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
          {hint}
        </p>
      ) : null}
    </section>
  );
}
