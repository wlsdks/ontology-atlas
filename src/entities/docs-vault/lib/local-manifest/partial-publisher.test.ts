import { describe, expect, it } from 'vitest';
import { readTier, readUnits } from './partial-publisher';
import { NATIVE_READ_BATCH } from './read-vault-files';
import type { WalkEntry } from './walk-vault';

const handle = {} as FileSystemFileHandle;
const file = (relativePath: string, kind: WalkEntry['kind'] = 'md'): WalkEntry => ({ relativePath, kind, handle });

describe('readTier', () => {
  it('reads the root Markdown first, then the node folders in their order, then other folders, then non-Markdown', () => {
    expect(readTier(file('README.md'))).toBe(0);
    expect(readTier(file('projects/p.md'))).toBe(1);
    expect(readTier(file('domains/d.md'))).toBe(2);
    expect(readTier(file('capabilities/c.md'))).toBe(3);
    expect(readTier(file('elements/e.md'))).toBe(4);
    expect(readTier(file('notes/n.md'))).toBe(5);
    expect(readTier(file('capabilities/diagram.png', 'image'))).toBe(6);
    expect(readTier(file('sources/spec.pdf', 'source'))).toBe(6);
  });
});

describe('readUnits', () => {
  const files = [
    file('notes/n.md'),
    file('domains/a.md'),
    file('capabilities/diagram.png', 'image'),
    file('domains/b.md'),
    file('README.md'),
  ];
  const tiers = files.map(readTier);

  it('reads one file per unit, in tier order and then walk order, when reads are not batched', () => {
    expect(readUnits(files, tiers, false)).toEqual([[4], [1], [3], [0], [2]]);
  });

  it('groups Markdown of one tier into a unit and reads a non-Markdown file alone', () => {
    expect(readUnits(files, tiers, true)).toEqual([[4], [1, 3], [0], [2]]);
  });

  it('closes a unit at the native batch size', () => {
    const many = Array.from({ length: NATIVE_READ_BATCH + 1 }, (_, i) => file(`domains/d${i}.md`));
    const units = readUnits(many, many.map(readTier), true);
    expect(units.map((unit) => unit.length)).toEqual([NATIVE_READ_BATCH, 1]);
  });
});
