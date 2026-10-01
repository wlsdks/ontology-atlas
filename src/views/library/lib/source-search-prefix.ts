export function sourceSearchPrefix<T extends { path: string }>(sources: readonly T[], limit: number): T[] {
  if (limit <= 0) return [];
  const heap: Array<{ source: T; index: number }> = [];
  const compare = (a: typeof heap[number], b: typeof heap[number]) =>
    a.source.path.localeCompare(b.source.path) || a.index - b.index;
  let reverse = sources.length > 1 && sources[0].path.localeCompare(sources[sources.length - 1].path) > 0;
  if (reverse) {
    const samples = Math.min(32, sources.length - 1);
    let tied = 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const index = Math.floor(sample * (sources.length - 1) / samples);
      if (sources[index].path.localeCompare(sources[index + 1].path) === 0) tied += 1;
    }
    if (tied > samples * 0.75) reverse = false;
  }
  for (let offset = 0; offset < sources.length; offset += 1) {
    const index = reverse ? sources.length - 1 - offset : offset;
    const source = sources[index];
    if (heap.length === limit &&
      (source.path.localeCompare(heap[0].source.path) || index - heap[0].index) >= 0) continue;
    const entry = { source, index };
    if (heap.length < limit) {
      heap.push(entry);
      let child = heap.length - 1;
      while (child > 0) {
        const parent = Math.floor((child - 1) / 2);
        if (compare(heap[parent], heap[child]) >= 0) break;
        [heap[parent], heap[child]] = [heap[child], heap[parent]];
        child = parent;
      }
    } else {
      heap[0] = entry;
      let parent = 0;
      while (parent * 2 + 1 < heap.length) {
        let child = parent * 2 + 1;
        if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) > 0) child += 1;
        if (compare(heap[parent], heap[child]) >= 0) break;
        [heap[parent], heap[child]] = [heap[child], heap[parent]];
        parent = child;
      }
    }
  }
  return heap.sort(compare).map(entry => entry.source);
}
