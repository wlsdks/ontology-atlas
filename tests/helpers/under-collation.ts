import { vi } from "vitest";

export function underCollation<T>(locale: string, run: () => T): T {
  const collator = new Intl.Collator(locale);
  const localeCompare = vi
    .spyOn(String.prototype, "localeCompare")
    .mockImplementation(function (this: string, that: string) {
      return collator.compare(this, that);
    });
  try {
    return run();
  } finally {
    localeCompare.mockRestore();
  }
}

/**
 * Plants a launching locale: a `localeCompare` call without a locale collates in `defaultLocale`,
 * one that names a locale collates in it, as the real function does. `underCollation` forces its
 * locale on every call, so it cannot tell a pinned call from an unpinned one.
 */
export async function underDefaultLocale<T>(defaultLocale: string, run: () => Promise<T>): Promise<T> {
  const localeCompare = vi
    .spyOn(String.prototype, "localeCompare")
    .mockImplementation(function (this: string, that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions) {
      return new Intl.Collator(locales ?? defaultLocale, options).compare(this, that);
    });
  try {
    return await run();
  } finally {
    localeCompare.mockRestore();
  }
}
