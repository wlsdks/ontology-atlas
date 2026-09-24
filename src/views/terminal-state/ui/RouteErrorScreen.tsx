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
 * The render-error screen (the root error boundary).
 *
 * It replaces `app/[locale]/layout.tsx` when a render throws, so it always mounts its own
 * locale provider. Until 2026-09-25 its copy was hard-coded English, so a Korean user who hit a
 * render error got English, and its "Topology home" link went to `/`, not the map. Its two
 * actions were a hand-built pill dialect while the sibling 404 used `Button`; both screens now
 * share `TerminalState` and the standard button.
 *
 * No gateway chrome: the error can come from anywhere, the installed app included, and the chrome
 * itself may be what threw.
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
      body={t('body')}
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
          {/* A plain anchor, not the locale router: the provider above is this screen's own,
              and a full navigation is the honest reset after a render failure. */}
          <a href={withBasePath(`/${locale}/`)} className={cn(buttonVariants({ variant: 'outline' }))}>
            {t('home')}
          </a>
        </>
      }
    />
  );
}
