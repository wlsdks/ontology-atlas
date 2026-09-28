"use client";

interface Props {
  /** Read out as soon as the value changes. */
  message: string;
  /** "polite" waits for the current utterance; "assertive" interrupts. */
  politeness?: "polite" | "assertive";
}

/**
 * A visually hidden aria-live region for state changes. VoiceOver may ignore a repeated
 * message, so to repeat one remount through `key` or vary the string.
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
