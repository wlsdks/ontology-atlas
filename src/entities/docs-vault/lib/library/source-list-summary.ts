import type { VaultSourceFile } from '../../model/vault-manifest';

/** `1536` → `1.5 KB`; locale-independent. */
export function formatSourceBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Formats by file count; extensionless files count under `''` so totals match. */
export function countSourceFormats(
  sources: readonly VaultSourceFile[],
): Array<{ format: string; count: number }> {
  const totals = new Map<string, number>();
  for (const source of sources) {
    const key = source.format.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return [...totals.entries()]
    .map(([format, count]) => ({ format, count }))
    .sort((a, b) => (b.count - a.count) || a.format.localeCompare(b.format));
}
