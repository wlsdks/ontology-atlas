import { LocaleRedirect } from '@/shared/ui/locale-redirect';

/**
 * Root entry — static-export-friendly client-side locale detection.
 *
 * The static export cannot run middleware, so locale negotiation happens
 * in the browser: a stored choice wins, else the first entry of
 * `navigator.languages` that maps to a routed locale (`detectLocale`), else
 * `/en`.
 */
export default function RootPage() {
  return <LocaleRedirect />;
}
