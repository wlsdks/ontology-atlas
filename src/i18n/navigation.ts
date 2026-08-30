import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware Link / useRouter / usePathname.
 *
 * Use these instead of the bare `next/link` / `next/navigation` exports
 * whenever the destination is an in-app route, so locale prefix is
 * preserved automatically. External URLs and root `/` redirects keep
 * using the bare next/* exports.
 */
export const { Link, usePathname, useRouter } = createNavigation(routing);
