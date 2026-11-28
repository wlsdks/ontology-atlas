import { createFileRoute } from '@tanstack/react-router';
import { redirectRetiredAddress } from '../../../-redirects/redirect-retired-address';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'metadata', key: 'pages.topology' },
  description: { namespace: 'metadata', key: 'descriptions.topology' },
  follow: true,
};

export const Route = createFileRoute('/$locale/_app/ontology/studio')({
  staticData: { head },
  beforeLoad: ({ params, search, location }) =>
    redirectRetiredAddress('ontology-edit', { locale: params.locale, search, hash: location.hash }),
});
