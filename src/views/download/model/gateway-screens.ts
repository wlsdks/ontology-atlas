/**
 * The app screens the gateway's screens stage shows, as captured files (2026-09-24).
 *
 * Each screen is captured **once per locale** — `public/gateway/<file>.<locale>.png` — because a
 * Korean visitor shown an English app would be told the app speaks a language it is not about to
 * speak to them. `scripts/capture-gateway-screens.mjs` shoots both sets in one run, and
 * `tests/contract/gateway-screen-assets.contract.test.ts` holds that every file exists, is the
 * capture size, and that the two locales are not one file under two names (the same accident
 * `demo-clip-assets.contract` guards for the demo video).
 */
export const GATEWAY_SCREEN_LOCALES = ['ko', 'en'] as const;
export type GatewayScreenLocale = (typeof GATEWAY_SCREEN_LOCALES)[number];

/** File stems in `public/gateway/`, one per captured destination. */
export const GATEWAY_SCREEN_FILES = [
  'harness',
  'library',
  'automations',
  'insights',
  'projects',
  'git',
] as const;
export type GatewayScreenFile = (typeof GATEWAY_SCREEN_FILES)[number];

/** Captures are 2672×1720 PNGs (1336×860 CSS pixels at device scale 2). */
export const GATEWAY_SCREEN_PIXELS = { width: 2672, height: 1720 } as const;

/** The capture for this page's locale; a locale with no capture set reads the English one. */
export function gatewayScreenSrc(file: GatewayScreenFile, locale: string): string {
  const shot = (GATEWAY_SCREEN_LOCALES as readonly string[]).includes(locale) ? locale : 'en';
  return `/gateway/${file}.${shot}.png`;
}
