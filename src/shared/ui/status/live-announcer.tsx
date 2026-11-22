"use client";

interface Props {
  message: string;
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
