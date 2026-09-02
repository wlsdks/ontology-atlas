/**
 * A remounted engine inherits the headline's progress (council finding, 2026-09-02).
 *
 * With `echo` on, the engine lights a dot only when `setTyping` earns it. The `[typed, total]`
 * effect fires on change alone, so an engine mounted after the last character — a remount on
 * `graph`, HMR — used to wait forever and the ground stayed blank. This mounts the object with a
 * finished headline and asserts the engine was told at once.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const setTyping = vi.fn();
vi.mock('../lib/hero-object-engine', () => ({
  mountHeroObject: vi.fn(() => ({
    dispose: vi.fn(),
    setTyping,
    litCount: () => 0,
    nodesOnScreen: () => [],
  })),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { HeroObject } from './HeroObject';

describe('HeroObject — a remounted engine hears the headline', () => {
  it('calls setTyping on mount when the headline already has progress', () => {
    const graph = {
      nodes: [{ id: 'a', kind: 'project' as const, label: 'a' }],
      edges: [],
    } as unknown as Parameters<typeof HeroObject>[0]['graph'];
    render(<HeroObject graph={graph} typed={52} total={52} />);
    expect(setTyping).toHaveBeenCalledWith(52, 52);
  });
});
