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
 * The 404, one component for both not-found files.
 *
 * The static export serves the root `app/not-found.tsx` for every unresolved path, including
 * `/ko/…`; `app/[locale]/not-found.tsx` renders the same screen inside the locale layout. Two
 * hand-kept copies had already drifted once, so both files are now one line each.
 *
 * **One primary, chosen by surface.** On the web a lost visitor usually has no folder open, so
 * "find it with project search" meant nothing to them and still took the filled button; home is
 * their way on, and the gateway nav on top carries the guide and changelog. In the installed app a
 * vault is the home, so project search is the primary there and the gateway chrome is not drawn
 * (the app never offers the gateway's own pages as its chrome).
 */
export function NotFoundScreen({
  standaloneMessages,
}: {
  /** Given by the root `not-found.tsx` (a server component), which has no locale layout. */
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

  // With the mobile BottomTabBar visible at the same time, "where to go" splits across two
  // places and the stage's exits lose their clarity (the CSS rule is in globals.css).
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

  // On the web "previous" is the only secondary, so it carries a visible edge beside the
  // primary; in the app it is the third exit and stays ghost behind the outline "home".
  const previous = (
    <Button type="button" variant={desktop ? 'ghost' : 'outline'} onClick={goBack}>
      <ArrowLeft size={ICON_SIZE.md} aria-hidden />
      {t('previous')}
    </Button>
  );

  // Until the URL and the shell are known the prerendered answer is "English, web", which is
  // wrong for a Korean visitor and for the app; the canvas waits one frame instead of lying.
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
            {/* Raw `buttonVariants` leaves both the base `border-transparent` and the variant's
                border, and CSS order lets transparent win — merged through `cn` as `Button` does. */}
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
