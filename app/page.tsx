import { LocaleRedirect } from '@/shared/ui/locale-redirect';

/**
 * Root entry — static-export-friendly client-side locale detection.
 *
 * The static export cannot run middleware, so locale negotiation happens
 * in the browser: read `navigator.language` once, redirect to `/ko` if it
 * starts with "ko", otherwise to `/en`. Sticks with localStorage so a
 * returning user goes straight to their preferred locale.
 */
export default function RootPage() {
  return <LocaleRedirect />;
}
