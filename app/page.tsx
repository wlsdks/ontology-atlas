import type { Metadata } from 'next';
import { absoluteUrl } from '@/shared/config';
import { routing } from '@/i18n/routing';
import { LocaleRedirect } from '@/shared/ui/routing/locale-redirect';

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl(`/${routing.defaultLocale}/download/`) },
};

/** The static export cannot run middleware, so locale negotiation happens in the browser. */
export default function RootPage() {
  return <LocaleRedirect />;
}
