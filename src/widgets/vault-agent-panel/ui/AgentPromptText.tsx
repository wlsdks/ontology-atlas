'use client';

/**
 * Read-only view of the instructions sent alongside vault content; the string is the result of the
 * same function as the one actually sent. Draws only content; one row under the composer opens it.
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
