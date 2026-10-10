/** A bounded reading set always includes the selected fact when it belongs to this scope. */
export function visibleAnalysisItems<T>(items: readonly T[], limit: number, selectedId: string | null, idOf: (item: T) => string): T[] {
  const count = Math.max(0, Math.floor(limit));
  const first = items.slice(0, count);
  const selected = selectedId === null ? undefined : items.find(item => idOf(item) === selectedId);
  if (!count || !selected || first.some(item => idOf(item) === selectedId)) return first;
  return [selected, ...first.slice(0, count - 1)];
}

export function filterAnalysisItems<T>(items: readonly T[], query: string, namesOf: (item: T) => readonly string[]): readonly T[] {
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter(item => {
    const names = namesOf(item).join(' ').normalize('NFKC').toLowerCase();
    return terms.every(term => names.includes(term));
  });
}
