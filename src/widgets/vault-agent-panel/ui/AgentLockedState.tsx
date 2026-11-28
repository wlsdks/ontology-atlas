import type { FirstWordsChip } from '@/features/vault-agent';
import { controlClass } from '@/shared/ui';

import { AgentFirstWords } from './AgentFirstWords';

/**
 * One face for the states where conversation is not yet possible (browser, no folder, no key).
 * The composer's position is drawn in advance as one working control, never a disabled input.
 * Value anchors the top, cost and the door the bottom; the gap between is where the conversation appears.
 */
export function AgentLockedState({
  title,
  body,
  consent,
  examplesTitle,
  chips,
}: {
  title: string;
  body: string;
  /** The write-consent promise, read where a person decides whether to enter a key: files change only after confirmation. */
  consent: string;
  examplesTitle: string;
  chips: readonly FirstWordsChip[];
}) {
  return (
    <div className="flex grow flex-col gap-4">
      {/* Value before cost. The sentences come from the generator the first-words chips use, so they
          never name a concept the folder lacks; here they are plain text, as a pressable one would be a trap. */}
      <AgentFirstWords chips={chips} title={examplesTitle} />

      {/* Where the conversation will appear; the gap shrinks to 0 on overflow. */}
      <div aria-hidden="true" className="min-h-0 shrink grow" />

      {/* Why it is locked sits directly above the door in the composer's position, so it is read just
         before pressing; the strip below does not restate it. */}
      <div data-testid="vault-agent-notice" className="flex flex-col gap-1.5">
        <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {title}
        </p>
        <p className="text-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {body}
        </p>
        <p
          data-testid="vault-agent-consent-promise"
          className="text-body leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {consent}
        </p>
      </div>
    </div>
  );
}

/**
 * The composer's position: same strip, width, height (56px, a 2-row textarea) and radius as the real
 * composer, showing its future placeholder. It is a single control; no disabled input is drawn.
 */
export function AgentLockedComposer({
  hint,
  actionLabel,
  onAction,
  testId,
}: {
  hint: string;
  actionLabel: string;
  onAction?: () => void;
  testId: string;
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1 text-body leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {hint}
      </span>
      <span className="shrink-0 rounded-chip bg-[color:var(--color-indigo-brand)] px-3 py-1.5 text-label font-[var(--font-weight-emphasis)] tracking-label text-[color:var(--color-text-on-accent)]">
        {actionLabel}
      </span>
    </>
  );
  // Dashed = a slot not yet filled. Drawn with a solid border it reads as an input
  // you can type in, and then someone presses it and tries to type.
  const shell = controlClass({
    shape: 'card',
    size: 'sm',
    className:
      'min-h-14 w-full gap-2 text-left border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
  });

  return (
    // Same entry curve as the real composer strip, which this position becomes, so the swap reads as
    // "this opened".
    <footer className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5">
      <button
        type="button"
        data-testid={testId}
        onClick={onAction}
        aria-label={actionLabel}
        className={shell}
      >
        {content}
      </button>
    </footer>
  );
}
