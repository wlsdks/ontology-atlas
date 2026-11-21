'use client';

import { use, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { useHydrated } from '@/shared/lib/render-timing/use-hydrated';
import type { SampleSource } from '@/shared/lib/vault-folder/sample-source';
import { RouteLoadingFallback, WidgetErrorFallback } from '@/shared/ui';
import { useStaticVaultGate } from '../model/use-static-vault-source';

/**
 * Prevents build-time sample facts from becoming a destination's first DOM: baking the sample view into route HTML would let an installed app paint Storefront before hydration reads its restored local provider, and a shell effect cannot undo parsed pixels.
 * Routes export the neutral loading surface and reveal content after hydration; this component suspends until the sample arrives, so only one loading state shows. Once revealed it stays revealed, so choosing the other sample swaps data in place. A restored app mounts against its local manifest and never loads a sample.
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
