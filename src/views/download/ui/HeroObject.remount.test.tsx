/** An engine mounted after the headline finished must hear its progress at once, not wait forever. */
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
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }));

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
