import { createFileRoute } from '@tanstack/react-router';
import { redirectRetiredAddress } from '../../-redirects/redirect-retired-address';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'mcp', key: 'title' },
  follow: true,
};

export const Route = createFileRoute('/$locale/_app/mcp')({
  staticData: { head },
  beforeLoad: ({ params, search, location }) =>
    redirectRetiredAddress('mcp', { locale: params.locale, search, hash: location.hash }),
});
