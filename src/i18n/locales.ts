import { routing } from "@/i18n/routing";

export type AppLocale = (typeof routing.locales)[number];

type LocaleScript = "latin" | "hangul" | "han-kana";

export interface LocaleMeta {
  readonly htmlLang: string;
  readonly hreflang: string;
  readonly ogLocale: string;
  readonly intlTag: string;
  readonly script: LocaleScript;
}

export const LOCALE_META = {
  en: {
    htmlLang: "en",
    hreflang: "en",
    ogLocale: "en_US",
    intlTag: "en-US",
    script: "latin",
  },
  ko: {
    htmlLang: "ko",
    hreflang: "ko",
    ogLocale: "ko_KR",
    intlTag: "ko-KR",
    script: "hangul",
  },
} as const satisfies Record<AppLocale, LocaleMeta>;

export const LOCALE_NAME_KEY = {
  en: "english",
  ko: "korean",
} as const satisfies Record<AppLocale, string>;

export function isAppLocale(
  value: unknown,
  locales: readonly string[] = routing.locales,
): value is AppLocale {
  return typeof value === "string" && locales.includes(value);
}

export function htmlLangOf(
  locale: string,
  meta: Readonly<Record<string, LocaleMeta>> = LOCALE_META,
): string {
  return meta[locale]?.htmlLang ?? locale;
}
