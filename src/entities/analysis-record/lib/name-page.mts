// O(n log k) work and O(k) storage for a validated page limit k.
export function createNamePage(limit: number, cursor: string | null = null) {
  const heap: string[] = [];
  let totalFiles = 0;
  let candidates = 0;
  const swap = (a: number, b: number) => {
    const held = heap[a];
    heap[a] = heap[b];
    heap[b] = held;
  };
  const add = (name: string) => {
    totalFiles += 1;
    if (cursor !== null && name >= cursor) return;
    candidates += 1;
    if (heap.length < limit) {
      heap.push(name);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (heap[parent] <= heap[index]) break;
        swap(parent, index);
        index = parent;
      }
      return;
    }
    if (name <= heap[0]) return;
    heap[0] = name;
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      const child = right < heap.length && heap[right] < heap[left] ? right : left;
      if (heap[index] <= heap[child]) break;
      swap(index, child);
      index = child;
    }
  };
  const page = () => {
    const names = [...heap].sort().reverse();
    return { names, totalFiles, nextCursor: candidates > names.length ? names.at(-1) ?? null : null };
  };
  return { add, page };
}
