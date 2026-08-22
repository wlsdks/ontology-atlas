"use client";

interface Props {
  /** Text announced to screen readers; read out as soon as the value changes. */
  message: string;
  /** "polite" waits for the current utterance to finish; "assertive" interrupts immediately. */
  politeness?: "polite" | "assertive";
}

/**
 * A visually hidden aria-live region, used to tell screen-reader users about
 * state changes such as a drawer opening or a tour step advancing.
 *
 * Assistive tech — iOS VoiceOver especially — may dedupe and ignore the same
 * message twice in a row. A caller that needs to force the same announcement
 * again should remount via the `key` prop or make the string explicitly
 * different with a prefix or suffix.
 */
export function LiveAnnouncer({ message, politeness = "polite" }: Props) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      suppressHydrationWarning
      className="sr-only"
    >
      {message}
    </div>
  );
}
