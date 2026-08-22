'use client';

import type { FirstWordsChip } from '@/features/vault-agent';
import { controlClass } from '@/shared/ui';

import { AgentFirstWords } from './AgentFirstWords';

/**
 * **One face for the three states** where conversation is not yet possible —
 * browser (app only), no folder, no key.
 *
 * ## Why the chat shape is shown in advance
 *
 * The old empty state was one title line plus one sentence, with most of the panel
 * below it an empty black area. Two things fail at once: ① the fact that this is
 * **a place you converse in** is not on screen, so there is no telling what
 * entering a key gets you, and ② an empty slab reads as an "unfinished" signal. So
 * the composer's position is drawn in advance at the bottom — a dashed border
 * already means "a slot not yet filled" in this app (the studio's sockets).
 *
 * ## No traps are built
 *
 * An input field that only imitates one becomes a trap that does nothing when
 * pressed. So this position is **a single control**: the whole dashed row is a
 * button (or link), and the pill inside it names the destination. No disabled
 * button is drawn, and every visible control really works. The explanation block
 * carries no button, so the entrance to the same feature is not duplicated — there
 * is one way in, the composer's position.
 *
 * ## Empty space — the mass is not moved but **anchored at both ends**
 *
 * The old layout stood the block **centred** vertically. Measured at 1512×950, the
 * empty space split into 361px above and 361px below, and neither meant anything —
 * a position that is neither top nor bottom explains nothing.
 *
 * Pinning the whole thing to the bottom was not the answer either (measured: one
 * 656px mass above). The total whitespace does not shrink at this width and height —
 * all that can be decided is **where the whitespace is and what it means**.
 *
 * So one mass is split in two and anchored at both ends:
 *
 * - **Top** = this place's value — "here is what you can ask for" plus sentences
 *   drawn from this folder. The value arrives where reading begins.
 * - **Bottom** = what it costs to use that value, plus the door to it. Directly
 *   above where the hand goes (the composer strip).
 * - **The gap between** = where the conversation will appear. After sending, an
 *   answer really does sit there, so this whitespace is not emptiness but
 *   **anticipation**.
 *
 * The order (value → cost) is as before, and now that order is true of **position**
 * as well as of the sentences.
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
  /**
   * The write-consent promise — a sentence needed **at the moment of deciding
   * whether to enter a key**.
   *
   * On the old screen this fact ("files change only after I confirm") was nowhere
   * until a proposal card appeared. That is, at the point a person decides whether
   * to entrust their API key and docs folder to this panel, there was no answer to
   * their biggest concern, "does this edit my files behind my back". A safeguard in
   * the code is not enough; it has to be **read where the decision is made** to be
   * worth anything.
   */
  consent: string;
  examplesTitle: string;
  /** Sentences from the first-words generator — drawn only as a plain list here. */
  chips: readonly FirstWordsChip[];
}) {
  return (
    <div className="flex grow flex-col gap-4">
      {/* Order: **what can I ask for** first, **what do I need** second. Value has to
          be read before cost — the old screen stated only what was needed and never
          said what this place is for.

          The sentences come from the **same generator** as the first-words chips
          shown once a key exists — hardcoded examples produce the first failure,
          "our folder has no such concept". Here they are plain text, though: making
          them pressable adds a control that can be pressed in a keyless state, and
          that is a trap. */}
      <AgentFirstWords chips={chips} title={examplesTitle} />

      {/* Where the conversation will appear — after sending, an answer really does sit
          here. So this whitespace is not a hole to fill but **anticipation** (it
          shrinks to 0 on overflow). */}
      <div aria-hidden="true" className="min-h-0 shrink grow" />

      {/* Why it is locked — it explains what the door in the composer's position
          **directly below** opens. These two lines sitting right above the door is the
          design: the most important sentence in this state is "your key is not being
          given to someone else", and it is worth something only if it is read just
          before pressing. So it is secondary body text, not the old tertiary grey.
          The strip below does not restate the same fact — the locked reason has one
          owner, here, and the strip does only its own job (the composer's position
          plus the door). */}
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
 * The composer's **position** — the same strip as the real composer (panel floor,
 * same divider), same width, same height (56px = a measured 2-row textarea), same
 * radius.
 *
 * Once a key arrives, this position becomes the composer itself. The same box only
 * changes state, so the user reads it as "this opened" rather than "a new screen
 * appeared".
 *
 * ## It uses a **placeholder**, not guidance
 *
 * The old copy restated the locked reason per state ("register a key and you can
 * talk right away"), while the block directly above was already saying the same
 * thing (the same point twice). Now the text in this position is **the placeholder
 * that will actually appear in the composer once a key arrives** — the same
 * sentence stays in the same place, so one string teaches what this strip is going
 * to become (without imitating a disabled input).
 *
 * ## Why no disabled input is drawn (reconfirmed 2026-07-27)
 *
 * That other tools do it is not an argument. What was measured here is that **the
 * only next step in this state** is "register a key / open a folder / get the app".
 * Drawing an unpressable input pushes the control that opens that step to **another
 * position**, and at that moment the screen has two controls (the dead one and the
 * real one). Trading one frustration and one extra entrance for teaching the shape
 * is a loss. So this position is still **a single control**, and the shape is taught
 * by the dashed border plus the placeholder.
 */
export function AgentLockedComposer({
  hint,
  actionLabel,
  onAction,
  actionHref,
  testId,
}: {
  hint: string;
  actionLabel: string;
  onAction?: () => void;
  actionHref?: string;
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
      'min-h-14 w-full gap-2 text-left border-dashed border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] hover:border-[color:var(--color-indigo-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
  });

  return (
    // It uses the **same entry curve** as the real composer strip — this position
    // becomes that composer, so if the two states' strips arrived differently it
    // would read as "something else appeared" rather than "this opened". Zero new
    // durations (the same class is reused).
    <footer className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5">
      {actionHref ? (
        <a
          data-testid={testId}
          href={actionHref}
          aria-label={actionLabel}
          className={shell}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          data-testid={testId}
          onClick={onAction}
          aria-label={actionLabel}
          className={shell}
        >
          {content}
        </button>
      )}
    </footer>
  );
}
