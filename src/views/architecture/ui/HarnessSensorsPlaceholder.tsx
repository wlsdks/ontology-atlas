'use client';

import { useTranslations } from 'next-intl';

/**
 * **The sensors view is not built, and says so.**
 *
 * The tempting alternative is to fill this with what we could compute today: a lint glob here, a
 * test path there, a count of hooks. That would produce a screen that looks like coverage, and
 * coverage is exactly the claim no static read of a repository can make. The field's own open
 * problem is that a sensor which never fires cannot be told apart from a domain nobody watches, and
 * a plausible-looking table would launder that ambiguity into reassurance.
 *
 * So the placeholder names what the view will hold, says it does not hold it yet, and carries the
 * ambiguity caption the finished view will also carry. No numbers, no rows, no sample data.
 */
export function HarnessSensorsPlaceholder() {
  const t = useTranslations('harness');
  return (
    <section
      data-testid="harness-sensors-placeholder"
      className="rounded-panel border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
    >
      <h2 className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {t('sensorsTitle')}
      </h2>
      <p className="mt-2 text-body-lg text-[color:var(--color-text-secondary)]">
        {t('sensorsNotBuilt')}
      </p>
      <p className="mt-3 max-w-prose text-body text-[color:var(--color-text-tertiary)]">
        {t('sensorsWillShow')}
      </p>
      <p className="mt-2 max-w-prose text-body text-[color:var(--color-text-tertiary)]">
        {t('sensorsWhyEmpty')}
      </p>
      <p className="mt-4 max-w-prose text-caption text-[color:var(--color-text-quaternary)]">
        {t('sensorsAmbiguity')}
      </p>
    </section>
  );
}
