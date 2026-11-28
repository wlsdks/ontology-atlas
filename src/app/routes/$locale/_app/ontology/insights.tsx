import { createFileRoute } from '@tanstack/react-router';
import { redirectRetiredAddress } from '../../../-redirects/redirect-retired-address';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'metadata', key: 'pages.ontology' },
  follow: true,
};

export const Route = createFileRoute('/$locale/_app/ontology/insights')({
  staticData: { head },
  beforeLoad: ({ params, search, location }) =>
    redirectRetiredAddress('insights', { locale: params.locale, search, hash: location.hash }),
});
