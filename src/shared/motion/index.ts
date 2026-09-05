/**
 * Barrel for `src/shared/motion` — kept thin and import-cycle-free on purpose.
 *
 * `./tokens.ts` carries every value (the CSS ↔ JS mirror documented there in full) and
 * has no import back into this file or into `./use-exit-lockout.ts`. `./use-exit-lockout.ts`
 * imports `EXIT_TRANSITION` from `./tokens` directly, never from this barrel — routing it
 * through here would make `index.ts` and `use-exit-lockout.ts` import each other, which
 * `pnpm knip`'s cycle detector correctly refuses (measured 2026-09-05: "runtime:cycles:
 * src/shared/motion/index.ts:src/shared/motion/index.ts → src/shared/motion/use-exit-lockout.ts").
 * Consumers still import everything, tokens and the hook alike, from `@/shared/motion`.
 */
export * from './tokens';
export { useExitLockout } from './use-exit-lockout';
