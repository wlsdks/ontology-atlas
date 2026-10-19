export function filterAnalysisItems<T>(items: readonly T[], query: string, namesOf: (item: T) => readonly string[]): readonly T[] {
  const terms = query.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter(item => {
    const names = namesOf(item).join(' ').normalize('NFKC').toLowerCase();
    return terms.every(term => names.includes(term));
  });
}
