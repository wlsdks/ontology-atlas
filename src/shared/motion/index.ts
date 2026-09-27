/**
 * Barrel for `src/shared/motion`; consumers import tokens and the hook from here. The
 * hook file imports `./tokens` directly, never this barrel, or `pnpm knip` refuses the
 * import cycle.
 */
export * from './tokens';
export { useExitLockout } from './use-exit-lockout';
