'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';

const INLINE_LINK_CLASS =
  'touch-hit-expand rounded-chip font-[var(--font-weight-emphasis)] text-[color:var(--color-indigo-text-soft)] underline decoration-[color:var(--color-indigo-a40)] underline-offset-4 hover:decoration-[color:var(--color-indigo-accent)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

/**
 * One sentence for the computers the app does not run on: it names the ones that have it and sends
 * everyone else to the sample map or the MCP server run from source. A user agent cannot tell an
 * Apple Silicon Mac from an Intel one, so every visitor reads it.
 */
export function OtherComputers({ className }: { className?: string }) {
  const t = useTranslations('download');
  return (
    <p
      data-testid="gateway-other-computers"
      className={cn('max-w-[40rem] break-keep text-body leading-body text-[color:var(--color-text-tertiary)]', className)}
    >
      {t.rich('otherComputers', {
        sample: (chunks) => (
          <Link href="/sample" data-testid="gateway-other-sample" className={INLINE_LINK_CLASS}>
            {chunks}
          </Link>
        ),
        guide: (chunks) => (
          <Link href="/guide/connect-agent" data-testid="gateway-other-guide" className={INLINE_LINK_CLASS}>
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}
