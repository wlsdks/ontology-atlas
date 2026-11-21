import { useId } from 'react';

/**
 * A wikilink whose target is not in the folder: the written path in danger ink, focusable, and
 * described as missing to a pointer, the keyboard and a screen reader alike.
 */
export function MissingWikilink({ text, description }: { text: React.ReactNode; description: string }) {
  const descriptionId = useId();
  /*
   * The description is said once: by `aria-describedby` to a screen reader, and by the hint a
   * pointer or the keyboard raises, which is hidden from assistive technology so it is not
   * read twice.
   */
  return (
    <span className="group/missing relative">
      <span
        tabIndex={0}
        data-link-missing="true"
        aria-describedby={descriptionId}
        className="border-b border-dashed border-[color:var(--color-danger-a50)] text-[color:var(--color-danger-text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--color-indigo-focus-ring)]"
      >
        {text}
      </span>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
      <span
        aria-hidden
        data-link-missing-hint="true"
        className="pointer-events-none absolute bottom-full left-0 z-[var(--z-tooltip)] mb-1.5 w-max max-w-64 rounded-chip border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-2 py-1 text-label leading-label not-italic text-[color:var(--color-text-primary)] opacity-0 shadow-[var(--shadow-elevation-1)] transition-opacity group-hover/missing:opacity-100 group-focus-within/missing:opacity-100"
      >
        {description}
      </span>
    </span>
  );
}
