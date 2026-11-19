'use client';

import { use, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { useHydrated } from '@/shared/lib/render-timing/use-hydrated';
import type { SampleSource } from '@/shared/lib/vault-folder/sample-source';
import { RouteLoadingFallback, WidgetErrorFallback } from '@/shared/ui';
import { useStaticVaultGate } from '../model/use-static-vault-source';

/**
 * Prevents build-time sample facts from becoming a destination's first DOM.
 *
 * Vault-backed routes are statically exported with a complete web sample. That is useful only
 * after the browser has established that no local vault owns the screen. Baking the sample view
 * itself into route HTML lets an installed app parse and paint Storefront before hydration can
 * read its restored local provider. A shell effect cannot undo pixels already parsed.
 *
 * These routes therefore export the existing neutral loading surface and reveal their content
 * after hydration. A vault-less web visitor receives the sample as soon as its chunk arrives: until
 * then this component suspends, so the page's own fallback (the exported HTML) stays on screen and
 * only one loading state ever shows. Once revealed it stays revealed, so choosing the other sample
 * swaps data in place instead of remounting the screen. A restored app mounts the component against
 * its local manifest and never waits for, or loads, a sample. `sample` pins one sample, for a
 * screen whose address names it. A sample that cannot be downloaded says so with a retry.
 */
export function VaultSourceHydrationBoundary({
  children,
  sample,
}: {
  children: ReactNode;
  sample?: SampleSource;
}) {
  const hydrated = useHydrated();
  const gate = useStaticVaultGate(sample);
  const [revealed, setRevealed] = useState(false);
  const open = hydrated && gate.status !== 'loading' && gate.status !== 'failed';
  if (open && !revealed) setRevealed(true);

  if (revealed || open) return children;
  if (!hydrated) return <RouteLoadingFallback />;
  if (gate.status === 'failed') return <SampleLoadFailed onRetry={gate.retry} />;
  use(gate.wait());
  return <RouteLoadingFallback />;
}

function SampleLoadFailed({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('routeError');
  const [error] = useState(() => new Error('The bundled sample could not be downloaded'));
  return (
    <main
      id="main"
      tabIndex={-1}
      data-testid="sample-load-failed"
      className="flex h-full min-h-full flex-1 items-center justify-center bg-[color:var(--color-canvas)] px-6"
    >
      <WidgetErrorFallback
        error={error}
        onReset={onRetry}
        title={t('title')}
        body={t('body')}
        retryLabel={t('retry')}
        className="max-w-md"
      />
    </main>
  );
}
