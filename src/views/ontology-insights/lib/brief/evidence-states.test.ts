import { describe, expect, it } from 'vitest';
import { resolveEvidenceStates } from './evidence-states';

const changes = new Map([
  ['capabilities/pay.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
  ['capabilities/ship.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
  ['capabilities/gone.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
  ['capabilities/old.md', { exists: true, lastChangedAt: null }],
  ['src/pay.ts', { exists: true, lastChangedAt: '2026-09-12T00:00:00Z' }],
  ['src/ship.ts', { exists: true, lastChangedAt: '2026-09-01T00:00:00Z' }],
  ['src/ship-ui.tsx', { exists: true, lastChangedAt: '2026-09-02T00:00:00Z' }],
  ['src/removed.ts', { exists: false, lastChangedAt: '2026-09-01T00:00:00Z' }],
  ['src/widgets/cart', { exists: true, isDir: true, lastChangedAt: '2026-09-15T00:00:00Z' }],
  ['capabilities/cart.md', { exists: true, lastChangedAt: '2026-09-10T00:00:00Z' }],
]);

describe('resolveEvidenceStates', () => {
  it('states each concept from its document time against its evidence times', () => {
    const states = resolveEvidenceStates(
      [
        { id: 'pay', docPath: 'capabilities/pay.md', evidencePaths: ['src/pay.ts'] },
        { id: 'ship', docPath: 'capabilities/ship.md', evidencePaths: ['src/ship.ts', 'src/ship-ui.tsx'] },
        { id: 'gone', docPath: 'capabilities/gone.md', evidencePaths: ['src/removed.ts'] },
        { id: 'old', docPath: 'capabilities/old.md', evidencePaths: ['src/ship.ts'] },
        { id: 'free', docPath: 'capabilities/free.md', evidencePaths: [] },
        { id: 'unwalked', docPath: 'capabilities/ship.md', evidencePaths: ['src/not-asked.ts'] },
        { id: 'cart', docPath: 'capabilities/cart.md', evidencePaths: ['src/widgets/cart'] },
        { id: 'cart-file', docPath: 'capabilities/cart.md', evidencePaths: ['src/widgets/cart', 'src/pay.ts'] },
      ],
      changes,
    );
    expect([...states.stale]).toEqual(['pay', 'cart-file']);
    expect([...states.current]).toEqual(['ship']);
    expect([...states.missing]).toEqual(['gone']);
    expect([...states.unknown].sort()).toEqual(['cart', 'free', 'old', 'unwalked']);
    expect([...states.folderOnly]).toEqual(['cart']);
    // Every non-current concept carries what moved, so a screen can name the file and the date.
    expect(states.rows.find((row) => row.id === 'pay')).toEqual({
      id: 'pay',
      verdict: 'stale',
      reason: null,
      docChangedAt: '2026-09-10T00:00:00Z',
      moved: [{ path: 'src/pay.ts', changedAt: '2026-09-12T00:00:00Z' }],
      gone: [],
      folders: [],
    });
    // The row states its own verdict, so a screen lists exactly the concepts a line counted
    // rather than inferring the verdict back out of the arrays.
    expect(states.rows.find((row) => row.id === 'gone')?.verdict).toBe('missing');
    expect(states.rows.find((row) => row.id === 'cart')?.reason).toBe('folder-only');
    expect(states.rows.find((row) => row.id === 'unwalked')?.verdict).toBe('unknown');
    expect(states.rows.find((row) => row.id === 'gone')?.gone).toEqual(['src/removed.ts']);
    expect(states.rows.find((row) => row.id === 'cart')?.folders).toEqual([
      { path: 'src/widgets/cart', changedAt: '2026-09-15T00:00:00Z' },
    ]);
    expect(states.rows.some((row) => row.id === 'ship')).toBe(false);
  });
});
