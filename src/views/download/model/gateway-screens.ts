/**
 * Captured once per locale (`public/gateway/<file>.<locale>.png`), or a visitor sees the app in a
 * language it will not speak to them. `scripts/capture-gateway-screens.mjs` shoots both, and the
 * contract `tests/contract/gateway-screen-assets.contract.test.ts` checks they are not one file twice.
 */
export const GATEWAY_SCREEN_LOCALES = ['ko', 'en'] as const;

/** Stems in `public/gateway/`. */
export const GATEWAY_SCREEN_FILES = [
  'harness',
  'library',
  'automations',
  'insights',
  'projects',
  'git',
] as const;
export type GatewayScreenFile = (typeof GATEWAY_SCREEN_FILES)[number];

/** 1336×860 CSS pixels at device scale 2. */
export const GATEWAY_SCREEN_PIXELS = { width: 2672, height: 1720 } as const;

/** A locale with no capture set reads the English one. */
export function gatewayScreenSrc(file: GatewayScreenFile, locale: string): string {
  const shot = (GATEWAY_SCREEN_LOCALES as readonly string[]).includes(locale) ? locale : 'en';
  return `/gateway/${file}.${shot}.png`;
}
