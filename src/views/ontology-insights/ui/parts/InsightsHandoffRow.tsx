import { CopyAgentTextButton } from "./CopyAgentTextButton";

/**
 * The one row pinned at the bottom of the page — per tab, a `query_ontology`/CLI chain worth
 * running next, in a form that only needs copying **to hand to an agent**.
 *
 * It used to expose the `query_ontology({...})` code string on the surface, leaving a person
 * wondering "am I supposed to read this?". The code string is now removed from the surface (the
 * copied packet is unchanged — the button still copies it) and an "for an AI agent" caption states
 * the audience. The caption and label are demoted to mono and quaternary so they never become the
 * attention winner for a human eye.
 */
export function InsightsHandoffRow({
  label,
  caption,
  payload,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  /** "For an AI agent" — states that this row is for an agent rather than a person. */
  caption: string;
  /** The real payload (the code chain) that gets copied — never exposed on the surface; the button only copies it. */
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
      <span className="flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
        {caption}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
        {label}
      </span>
      <CopyAgentTextButton label={copyLabel} copiedLabel={copiedLabel} text={payload} compact />
    </section>
  );
}
