import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware Link / useRouter / usePathname for in-app routes, so the locale prefix is kept.
 * External URLs and root `/` redirects use the bare next/* exports.
 */
export const { Link, usePathname, useRouter } = createNavigation(routing);
