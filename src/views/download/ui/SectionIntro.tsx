/** Every head starts at the origin; eyebrow words are localized, never an English label first. */
export function SectionIntro({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  /* Still: only the stage below it moves, one entrance per section. */
  return (
    <>
      <p className="flex items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
        {/* Static: there is no state for it to signal. */}
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {eyebrow}
      </p>
      <h2 className="mt-4 text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
        {title}
      </h2>
      {sub ? (
        <p className="mt-3 max-w-[40rem] text-body-lg leading-body-lg text-[color:var(--color-text-tertiary)]">
          {sub}
        </p>
      ) : null}
    </>
  );
}
