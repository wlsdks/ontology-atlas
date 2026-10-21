export type AlignedLine = { no: number; text: string };

export type AlignedRow = {
  kind: 'same' | 'left' | 'right' | 'changed';
  left: AlignedLine | null;
  right: AlignedLine | null;
};

export const ALIGN_CELL_CAP = 1_000_000;

/** Longest-common-subsequence alignment: O(n·m) time and memory, so it gives up above the cap. */
export function alignLines(left: readonly string[], right: readonly string[]): AlignedRow[] | null {
  const n = left.length;
  const m = right.length;
  if (n * m > ALIGN_CELL_CAP) return null;
  const width = m + 1;
  const common = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i * width + j] =
        left[i] === right[j]
          ? common[(i + 1) * width + j + 1]! + 1
          : Math.max(common[(i + 1) * width + j]!, common[i * width + j + 1]!);
    }
  }

  const rows: AlignedRow[] = [];
  let lefts: AlignedLine[] = [];
  let rights: AlignedLine[] = [];
  const flush = () => {
    const paired = Math.min(lefts.length, rights.length);
    for (let k = 0; k < paired; k++) rows.push({ kind: 'changed', left: lefts[k]!, right: rights[k]! });
    for (const line of lefts.slice(paired)) rows.push({ kind: 'left', left: line, right: null });
    for (const line of rights.slice(paired)) rows.push({ kind: 'right', left: null, right: line });
    lefts = [];
    rights = [];
  };

  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && left[i] === right[j]) {
      flush();
      rows.push({ kind: 'same', left: { no: i + 1, text: left[i]! }, right: { no: j + 1, text: right[j]! } });
      i++;
      j++;
    } else if (j >= m || (i < n && common[(i + 1) * width + j]! >= common[i * width + j + 1]!)) {
      lefts.push({ no: i + 1, text: left[i]! });
      i++;
    } else {
      rights.push({ no: j + 1, text: right[j]! });
      j++;
    }
  }
  flush();
  return rows;
}
