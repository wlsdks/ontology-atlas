import { isAppLocale, type AppLocale } from "@/i18n/locales";
import { routing } from "@/i18n/routing";

const HANT_MARKERS = new Set(["hant", "tw", "hk", "mo"]);

function tagToLocale(tag: string): string | null {
  const [primary, ...rest] = tag.toLowerCase().split("-");
  if (primary === "zh") return rest.some((part) => HANT_MARKERS.has(part)) ? null : "zh";
  if (primary === "ko" || primary === "ja" || primary === "en") return primary;
  return null;
}

export function detectLocale(
  languages: readonly string[],
  stored: string | null,
  locales: readonly string[] = routing.locales,
): AppLocale {
  if (isAppLocale(stored, locales)) return stored;
  for (const tag of languages) {
    const locale = tagToLocale(tag);
    if (locale !== null && isAppLocale(locale, locales)) return locale;
  }
  return routing.defaultLocale;
}
