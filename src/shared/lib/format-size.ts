const BYTES_PER_MEGABYTE = 1_000_000;
const BYTES_PER_GIGABYTE = 1_000_000_000;
const WHOLE_MEGABYTES_FROM = 10;

/** Decimal units as the model's host lists them: GB with one decimal from 1 GB, MB below. */
export function formatSize(bytes: number, locale: string): string {
  if (bytes >= BYTES_PER_GIGABYTE) {
    return new Intl.NumberFormat(locale, {
      style: 'unit', unit: 'gigabyte', minimumFractionDigits: 1, maximumFractionDigits: 1,
    }).format(bytes / BYTES_PER_GIGABYTE);
  }
  const megabytes = bytes / BYTES_PER_MEGABYTE;
  return new Intl.NumberFormat(locale, {
    style: 'unit', unit: 'megabyte', maximumFractionDigits: megabytes < WHOLE_MEGABYTES_FROM ? 1 : 0,
  }).format(megabytes);
}
