'use client';

/**
 * Re-exported, not defined here. The implementation moved to
 * `@/shared/lib/use-dismissible-menu` on 2026-09-13, when the rail's vault switcher became
 * the second consumer and met the condition the original note set for promotion (a feature
 * cannot import a view). Keeping the name reachable from this module leaves this view's
 * call sites untouched while the definition stays single - the same pattern
 * `scheduleStateSync` uses in `./persistence`.
 */
export { useDismissibleMenu as useAdvancedMenu } from '@/shared/lib/use-dismissible-menu';
