import { routing } from '../../src/i18n/routing';

const injected = process.env.E2E_FIT_LOCALES?.split(',').filter(Boolean);

export const FIT_LOCALES: readonly string[] = injected?.length ? injected : routing.locales;

export const CJK_LOCALES: readonly string[] = FIT_LOCALES.filter((locale) => locale === 'ja' || locale === 'zh');

export const FIT_VIEWPORTS = [{ width: 1512, height: 949 }] as const;
