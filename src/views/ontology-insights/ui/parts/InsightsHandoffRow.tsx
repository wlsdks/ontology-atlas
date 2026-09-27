import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * The row closing a tab: a `query_ontology`/CLI chain worth running next, copied to hand to an agent. The payload
 * is never shown, only copied; an "for an AI agent" caption states the audience, in quiet ink so it never wins a
 * human eye.
 */
export function InsightsHandoffRow({
  label,
  caption,
  payload,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  /** The "for an AI agent" caption naming the audience. */
  caption: string;
  /** The copied payload (the code chain), never shown on the surface. */
  payload: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <section
      aria-label={label}
      data-insights-handoff="tab-query"
      data-testid="insights-handoff-row"
      className="mt-[var(--section-gap)] flex items-center gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-2.5"
    >
      {/* Plain text face: Hangul in uppercase monospace falls back glyph by glyph; mono belongs to the copied payload only. */}
      <span className="flex-none text-label text-[color:var(--color-text-quaternary)]">
        {caption}
      </span>
      <span className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-tertiary)]">
        {label}
      </span>
      <CopyAgentTextButton label={copyLabel} copiedLabel={copiedLabel} text={payload} compact />
    </section>
  );
}
