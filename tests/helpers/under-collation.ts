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
