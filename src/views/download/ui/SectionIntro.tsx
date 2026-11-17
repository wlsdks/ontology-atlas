import { cn } from '@/shared/lib/cn';

/** Every head starts at the origin; eyebrow words are localized, never an English label first. */
export function SectionIntro({
  eyebrow,
  title,
  sub,
  quiet = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  /** A head set a size down, for a section whose content, not its title, is the point. */
  quiet?: boolean;
}) {
  /* Still: only the stage below it moves, one entrance per section. */
  return (
    <>
      <p className="flex items-center gap-2 font-mono text-label uppercase leading-label tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]">
        {/* Static: there is no state for it to signal. */}
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-indigo-brand)]" />
        {eyebrow}
      </p>
      <h2
        className={cn(
          'max-w-[48rem] [text-wrap:balance] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]',
          quiet ? 'mt-4 text-display leading-display' : 'mt-5 text-hero-lg',
        )}
      >
        {title}
      </h2>
      {sub ? (
        <p className="mt-4 max-w-[42rem] text-title leading-title font-normal text-[color:var(--color-text-tertiary)]">
          {sub}
        </p>
      ) : null}
    </>
  );
}
