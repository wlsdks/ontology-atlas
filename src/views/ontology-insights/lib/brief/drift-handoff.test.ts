import { describe, expect, it } from 'vitest';
import { buildDriftHandoff } from './drift-handoff';

const rows = [
  { name: 'Payments', path: 'src/pay.ts', at: '2026-09-12T00:00:00Z', docAt: '2026-09-10T00:00:00Z', href: '/topology/?p=pay' },
  { name: 'Shipping', path: 'src/ship.ts', at: '2026-09-11T00:00:00Z', docAt: null, href: '/topology/?p=ship' },
];

describe('buildDriftHandoff', () => {
  it('names each concept with its file and both dates, and asks for judgement, not a write', () => {
    const request = buildDriftHandoff({ rows, locale: 'ko' })!;
    expect(request).toContain('Payments');
    expect(request).toContain('src/pay.ts');
    expect(request).toContain('2026-09-10T00:00:00Z');
    expect(request).toContain('기록 없음');
    expect(request).toContain('볼트를 직접 바꾸지 말고');
    expect(request).not.toMatch(/add_concept|patch_concept|add_relation/);
  });

  it('names how many it left out rather than sending an unbounded list', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ ...rows[0]!, name: `C${index}` }));
    const request = buildDriftHandoff({ rows: many, locale: 'en', limit: 3 })!;
    expect(request.match(/^- C\d/gm)).toHaveLength(3);
    expect(request).toContain('6 more concepts');
  });

  it('has nothing to ask when nothing drifted', () => {
    expect(buildDriftHandoff({ rows: [], locale: 'en' })).toBeNull();
  });
});
