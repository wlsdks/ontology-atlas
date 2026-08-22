"use client";

import { controlClass } from "@/shared/ui/control-class";

/**
 * **Entry card** — one fork in the road offered by an empty stage.
 *
 * The pattern started as the studio entry's own, then the skills empty state chose
 * the same structure (owner, 2026-08-13, picking among the skills-stage options:
 * *"B로 가자"* — go with B; that option's rationale was that the studio entry
 * differed from the skills stage in only three ways: a 48px icon, two cards, and
 * the amount of prose). Per this repo's rule that a value earns a name the moment
 * a second consumer appears, it moved here — with two copies, drifting is the
 * default.
 *
 * All values are existing ones: `controlClass({shape:"card",size:"lg"})` plus the
 * panel radius plus a 48px (h-12) glyph tile. **The entrance motion comes from the
 * consumer's className**, because the studio's stagger variables and its
 * reduced-motion contract belong to that screen; baking them in here would make
 * every other consumer inherit someone else's contract.
 */
export const EntryChoiceCard = ({
  ref,
  testId,
  onClick,
  title,
  desc,
  footnote,
  className,
  style,
  illustration,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  testId: string;
  onClick: () => void;
  title: string;
  desc: string;
  footnote: string | null;
  className?: string;
  style?: React.CSSProperties;
  illustration: React.ReactNode;
}) => (
  <button
    ref={ref}
    type="button"
    data-testid={testId}
    onClick={onClick}
    style={style}
    /* Design-system seat, 2026-08-04: this card is in-flow content, so it takes the
     * panel radius (12) rather than the sheet step — inherited from the ruling made
     * for the studio entry. */
    className={controlClass({
      shape: "card",
      size: "lg",
      className: `group flex-col items-start gap-3 rounded-panel bg-[color:var(--color-elevated)] px-5 py-6 text-left hover:border-[color:var(--color-indigo-a46)] hover:bg-[color:var(--color-indigo-a06)] ${className ?? ""}`,
    })}
  >
    <span className="grid h-12 w-12 place-items-center rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] transition-colors group-hover:border-[color:var(--color-indigo-a46)] group-hover:text-[color:var(--color-indigo-text-soft)]">
      {illustration}
    </span>
    <span className="flex flex-col gap-1">
      <span className="text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
        {title}
      </span>
      <span className="text-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
        {desc}
      </span>
    </span>
    {footnote ? (
      <span
        data-testid={`${testId}-recommend`}
        className="mt-auto inline-flex max-w-full items-center gap-1.5 truncate rounded-chip bg-[color:var(--color-overlay-1)] px-2 py-1 text-label text-[color:var(--color-text-secondary)]"
      >
        <span aria-hidden className="h-1 w-1 flex-none rounded-full bg-[color:var(--color-indigo-brand)]" />
        <span className="truncate">{footnote}</span>
      </span>
    ) : null}
  </button>
);
