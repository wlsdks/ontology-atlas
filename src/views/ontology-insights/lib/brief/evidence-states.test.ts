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
      ],
      changes,
    );
    expect([...states.stale]).toEqual(['pay']);
    expect([...states.current]).toEqual(['ship']);
    expect([...states.missing]).toEqual(['gone']);
    expect([...states.unknown].sort()).toEqual(['free', 'old', 'unwalked']);
  });
});
