'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Compass, Search } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { GatewayNav, GatewayReadingLinks } from '@/widgets/gateway-chrome';
import { Button, buttonVariants } from '@/shared/ui/button';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { cn } from '@/shared/lib/cn';
import { TerminalState, TerminalStatePending } from './TerminalState';
import {
  StandaloneLocaleProvider,
  useClientAnswered,
  useIsDesktopShell,
} from './standalone-locale';
import type { StandaloneMessages } from '@/i18n/standalone-messages';

/**
 * The one 404 for both not-found files. The primary depends on the surface: home on the web, where
 * a lost visitor has no folder to search, and project search in the app, which draws no gateway chrome.
 */
export function NotFoundScreen({
  standaloneMessages,
}: {
  /** From the root `not-found.tsx`, which has no locale layout. */
  standaloneMessages?: StandaloneMessages;
}) {
  return standaloneMessages ? (
    <StandaloneLocaleProvider messages={standaloneMessages}>
      <NotFoundBody />
    </StandaloneLocaleProvider>
  ) : (
    <NotFoundBody />
  );
}

function NotFoundBody() {
  const router = useRouter();
  const t = useTranslations('notFound');
  const desktop = useIsDesktopShell();
  const answered = useClientAnswered();

  // Hides the mobile tab bar, or "where to go" splits across two places (rule in `app/styles/shell.css`).
  useEffect(() => {
    document.body.setAttribute('data-no-tabbar', 'true');
    return () => {
      document.body.removeAttribute('data-no-tabbar');
    };
  }, []);

  const openSearchOnHome = () => {
    try {
      window.sessionStorage.setItem('demo:open-search', '1');
    } catch {
      /* private mode */
    }
    router.push('/');
  };

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/');
  };

  // Outlined on the web, where it is the only secondary; ghost in the app behind "home".
  const previous = (
    <Button type="button" variant={desktop ? 'ghost' : 'outline'} onClick={goBack}>
      <ArrowLeft size={ICON_SIZE.md} aria-hidden />
      {t('previous')}
    </Button>
  );

  // The prerendered answer is "English, web", so the canvas waits a frame instead.
  if (!answered) return <TerminalStatePending testId="not-found-pending" />;

  return (
    <TerminalState
      testId="not-found-stage"
      tone="neutral"
      icon={<Compass size={ICON_SIZE.lg} />}
      eyebrow={t('label')}
      title={t('title')}
      body={t('body')}
      chrome={desktop ? null : <GatewayNav />}
      actions={
        desktop ? (
          <>
            <Button type="button" variant="primary" onClick={openSearchOnHome}>
              <Search size={ICON_SIZE.md} aria-hidden />
              {t('findByProject')}
            </Button>
            {/* Through `cn`, or the base transparent border wins over the variant's by CSS order. */}
            <Link href="/" className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('home')}
            </Link>
            {previous}
          </>
        ) : (
          <>
            <Link href="/" className={cn(buttonVariants({ variant: 'primary' }))}>
              {t('home')}
            </Link>
            {previous}
          </>
        )
      }
      footer={desktop ? null : <GatewayReadingLinks className="justify-center" />}
    />
  );
}
