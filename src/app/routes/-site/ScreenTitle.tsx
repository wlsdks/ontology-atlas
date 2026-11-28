import { PageTitle } from '@/app-providers/router/PageTitle';

import type { ScreenHead } from './screen-metadata';

/** The screen's `document.title` from the head its route declares, so the title and the prerendered head are one fact. */
export function ScreenTitle({ head }: { head: ScreenHead }) {
  return <PageTitle namespace={head.title.namespace} messageKey={head.title.key} absolute={head.kind === 'page' && head.absoluteTitle === true} />;
}
