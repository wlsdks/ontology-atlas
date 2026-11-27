import { useEffect } from 'react';

import { reportWebviewError } from '@/shared/lib/failures/report-webview-error';
import { ROUTE_ERROR_PICK, pickStandaloneMessages } from '@/i18n/standalone-messages';
import { RouteErrorScreen, StandaloneMessagesProvider } from '@/views/terminal-state';

const messages = pickStandaloneMessages(ROUTE_ERROR_PICK);

/** A screen that threw, or a tab that asked for a file a deploy removed; reloading recovers. */
export default function StandaloneRouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[route-error]', error);
    // The installed app has no console anyone reads; the same error goes to the app log.
    reportWebviewError('render', error);
  }, [error]);
  return (
    <StandaloneMessagesProvider messages={messages}>
      <RouteErrorScreen onRetry={reset} />
    </StandaloneMessagesProvider>
  );
}
