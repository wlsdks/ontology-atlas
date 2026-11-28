import type { FirstWordsChip } from '@/features/vault-agent';
import { controlClass } from '@/shared/ui';

/**
 * An empty conversation's first words: up to 3 sentences from this folder's real state, built by
 * `buildFirstWords`. A pressable chip with a key; a plain list without a key or folder, since a
 * button that cannot complete is a trap. A chip reserves two lines so sentence length never makes the row ragged.
 */
export function AgentFirstWords({
  chips,
  title,
  hint,
  onPrefill,
}: {
  chips: readonly FirstWordsChip[];
  title: string;
  hint?: string;
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
                  className: 'w-full min-h-11 text-left border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                })}
              >
                <span className="line-clamp-2 [word-break:keep-all]">{chip.text}</span>
              </button>
            ) : (
              <p
                data-testid="agent-first-words-line"
                data-first-words-slot={chip.slot}
                data-first-words-intent={chip.intent.kind}
                // Body weight: the one thing a person needs here is "what can I ask for".
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
