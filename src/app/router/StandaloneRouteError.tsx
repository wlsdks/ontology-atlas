import { useEffect } from 'react';

import { reportWebviewError } from '@/shared/lib/failures/report-webview-error';
import { ROUTE_ERROR_MESSAGES } from '@/i18n/route-error-messages';
import { RouteErrorScreen, StandaloneMessagesProvider } from '@/views/terminal-state';

import { BootPictureRemover } from './BootPictureRemover';

/** A screen that threw, or a tab that asked for a file a deploy removed; reloading recovers. */
export default function StandaloneRouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[route-error]', error);
    // The installed app has no console anyone reads; the same error goes to the app log.
    reportWebviewError('render', error);
  }, [error]);
  return (
    <StandaloneMessagesProvider messages={ROUTE_ERROR_MESSAGES}>
      <BootPictureRemover />
      <RouteErrorScreen onRetry={reset} />
    </StandaloneMessagesProvider>
  );
}
