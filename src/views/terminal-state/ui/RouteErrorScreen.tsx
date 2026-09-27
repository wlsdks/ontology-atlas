'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/shared/ui/button';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/base-path';
import { TerminalState } from './TerminalState';
import { StandaloneLocaleProvider, useStandaloneLocale } from './standalone-locale';

/**
 * The root error boundary, which replaces the locale layout, so it mounts its own locale
 * provider fed by the root layout (`ROUTE_ERROR_PICK`), never a JSON import that would ship the
 * message files to every page. No gateway chrome: it may be what threw.
 */
export function RouteErrorScreen({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  return (
    <StandaloneLocaleProvider>
      <RouteErrorBody digest={digest} onRetry={onRetry} />
    </StandaloneLocaleProvider>
  );
}

function RouteErrorBody({ digest, onRetry }: { digest?: string; onRetry: () => void }) {
  const t = useTranslations('routeError');
  const locale = useStandaloneLocale();
  return (
    <TerminalState
      testId="route-error-stage"
      tone="warning"
      icon={<AlertTriangle size={ICON_SIZE.lg} />}
      eyebrow={t('label')}
      title={t('title')}
      // A static export's client errors usually have no digest to report.
      body={digest ? t('bodyWithId') : t('body')}
      detail={
        digest ? (
          <p className="font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('errorId')}: <span className="tabular-nums">{digest}</span>
          </p>
        ) : null
      }
      actions={
        <>
          <Button type="button" variant="primary" onClick={onRetry}>
            <RefreshCw size={ICON_SIZE.md} aria-hidden />
            {t('retry')}
          </Button>
          {/* A full navigation, the honest reset after a render failure. */}
          <a href={withBasePath(`/${locale}/`)} className={cn(buttonVariants({ variant: 'outline' }))}>
            {t('home')}
          </a>
        </>
      }
    />
  );
}
