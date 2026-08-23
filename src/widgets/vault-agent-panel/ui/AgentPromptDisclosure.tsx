'use client';

/**
 * Viewing the "Instructions" (instructions) — not editable, but **one click to read**.
 *
 * A hidden prompt is trust debt. The user has to know what instructions go out
 * alongside their own vault content. The string drawn here is **the result of the
 * same function** as the string actually sent — otherwise this view is decoration,
 * not transparency.
 *
 * ## Why content only, not a card
 *
 * This view and "Continue in the terminal" (continue in the terminal) are both side
 * branches opened **when leaving or when in doubt**, yet each used to sit
 * permanently as a bordered strip, stacking at the floor at the same weight as the
 * composer (measured 1512×950: 4 strips at the floor). Now one row under the
 * composer owns opening and closing them, and **only one** area opens at a time —
 * this file draws only the content that goes into that area.
 */
export function AgentPromptText({
  systemPrompt,
  note,
}: {
  systemPrompt: string;
  note: string;
}) {
  return (
    <div data-testid="agent-prompt-disclosure">
      <p className="mb-2 text-label tracking-label text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
        {note}
      </p>
      <pre
        data-testid="agent-prompt-text"
        className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-caption leading-caption text-[color:var(--color-text-tertiary)]"
      >
        {systemPrompt}
      </pre>
    </div>
  );
}
