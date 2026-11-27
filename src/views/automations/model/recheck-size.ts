/** A recheck's text size as the sheet and the run history state it, in decimal kilobytes. */
export function formatRecheckSize(bytes: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: bytes < 10_000 ? 1 : 0 }).format(bytes / 1000);
}
