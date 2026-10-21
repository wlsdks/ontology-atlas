export type AlignedLine = { no: number; text: string };

export type AlignedRow = {
  kind: 'same' | 'left' | 'right' | 'changed';
  left: AlignedLine | null;
  right: AlignedLine | null;
};

export const ALIGN_CELL_CAP = 1_000_000;
export const ALIGN_ROW_CAP = 6000;

const sameRow = (text: string, leftIndex: number, rightIndex: number): AlignedRow => ({
  kind: 'same',
  left: { no: leftIndex + 1, text },
  right: { no: rightIndex + 1, text },
});

export function alignLinesQuadratic(left: readonly string[], right: readonly string[]): AlignedRow[] | null {
  if (left.length + right.length > ALIGN_ROW_CAP) return null;
  let head = 0;
  while (head < left.length && head < right.length && left[head] === right[head]) head++;
  let tail = 0;
  while (
    tail < left.length - head &&
    tail < right.length - head &&
    left[left.length - 1 - tail] === right[right.length - 1 - tail]
  ) {
    tail++;
  }
  const leftEnd = left.length - tail;
  const rightEnd = right.length - tail;
  const middle = alignRange(left, right, head, leftEnd, head, rightEnd);
  if (!middle) return null;
  const rows: AlignedRow[] = [];
  for (let k = 0; k < head; k++) rows.push(sameRow(left[k]!, k, k));
  rows.push(...middle);
  for (let k = 0; k < tail; k++) rows.push(sameRow(left[leftEnd + k]!, leftEnd + k, rightEnd + k));
  return rows;
}

function alignRange(
  left: readonly string[],
  right: readonly string[],
  i0: number,
  iEnd: number,
  j0: number,
  jEnd: number,
): AlignedRow[] | null {
  const n = iEnd - i0;
  const m = jEnd - j0;
  if (n * m > ALIGN_CELL_CAP) return null;
  const width = m + 1;
  const common = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i * width + j] =
        left[i0 + i] === right[j0 + j]
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
    if (i < n && j < m && left[i0 + i] === right[j0 + j]) {
      flush();
      rows.push(sameRow(left[i0 + i]!, i0 + i, j0 + j));
      i++;
      j++;
    } else if (j >= m || (i < n && common[(i + 1) * width + j]! >= common[i * width + j + 1]!)) {
      lefts.push({ no: i0 + i + 1, text: left[i0 + i]! });
      i++;
    } else {
      rights.push({ no: j0 + j + 1, text: right[j0 + j]! });
      j++;
    }
  }
  flush();
  return rows;
}

const visibleForm = (text: string) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n$/, '');

export function differsOnlyInvisibly(a: string, b: string): boolean {
  return a !== b && visibleForm(a) === visibleForm(b);
}
