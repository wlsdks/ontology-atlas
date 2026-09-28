import { act, renderHook } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import type { GrayAreaCandidate, GrayAreaSelection } from '@/features/gray-area';
import { parseHomeRouteState, type HomeRouteState } from '../url-state';
import { useTopologyGrayArea } from './use-topology-gray-area';

const { translate } = vi.hoisted(() => ({ translate: (key: string) => key }));
vi.mock('next-intl', () => ({ useTranslations: () => translate }));

function document(slug: string, frontmatter: VaultDoc['frontmatter']): VaultDoc {
  return { slug, path: `${slug}.md`, title: slug, frontmatter, tags: [], headings: [], excerpt: '', wordCount: 1, updatedAt: '2026-09-28', linksOut: [] };
}
const docs = [
  document('project', { kind: 'project', uid: 'project', domains: ['domain'] }),
  document('capabilities/a', { kind: 'capability', uid: 'a', domain: 'domain' }),
  document('capabilities/b', { kind: 'capability', uid: 'b', domain: 'domain' }),
];
type Context = { setId: string | null; members: ReadonlySet<string> | null; route?: HomeRouteState };
type Inspector = ReactElement<{ selection: GrayAreaSelection; onFocus: (candidate: GrayAreaCandidate) => void }>;
function setup(initial: Context) {
  let nextRoute: HomeRouteState | null = null;
  const hook = renderHook(({ setId, members, route }: Context) => useTopologyGrayArea({
    docs, nodes: [], selectedSlug: route?.selectedSlug ?? null, memberSlugs: members,
    vaultPath: '/fixture/vault', locale: 'en', routeState: route ?? { ...parseHomeRouteState(new URLSearchParams()), constellationIntent: setId },
    setRouteState: updater => {
      const current = { ...parseHomeRouteState(new URLSearchParams()), constellationIntent: setId };
      nextRoute = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
    },
    onOpen: () => {}, onPrepare: () => {},
  }), { initialProps: initial });
  act(() => hook.result.current.action?.onOpen());
  expect(hook.result.current.open).toBe(true);
  return { ...hook, nextRoute: () => nextRoute! };
}

describe('Gray Area inspection scope lifetime', () => {
  it.each(['switch', 'clear'] as const)('invalidates the previous Concept set on %s', change => {
    const hook = setup({ setId: 'set-a', members: new Set(['capabilities/a']) });
    expect((hook.result.current.inspector as Inspector).props.selection.uids).toEqual(['a']);
    hook.rerender(change === 'switch' ? { setId: 'set-b', members: new Set(['capabilities/b']) } : { setId: null, members: null });
    expect(hook.result.current.open).toBe(false);
  });
  it('invalidates changed membership even when the Concept set identity stays the same', () => {
    const hook = setup({ setId: 'set-a', members: new Set(['capabilities/a']) });
    hook.rerender({ setId: 'set-a', members: new Set(['capabilities/a', 'capabilities/b']) });
    expect(hook.result.current.open).toBe(false);
  });
  it('keeps an equivalent membership order and its own map comparison open', () => {
    const hook = setup({ setId: 'set-a', members: new Set(['capabilities/a', 'capabilities/b']) });
    hook.rerender({ setId: 'set-a', members: new Set(['capabilities/b', 'capabilities/a']) });
    expect(hook.result.current.open).toBe(true);
    const candidate = { kind: 'missing-link', slug: 'capabilities/a', relatedSlug: 'capabilities/b', path: ['capabilities/a'] } as GrayAreaCandidate;
    act(() => (hook.result.current.inspector as Inspector).props.onFocus(candidate));
    hook.rerender({ setId: 'set-a', members: new Set(['capabilities/a', 'capabilities/b']), route: hook.nextRoute() });
    expect(hook.result.current.open).toBe(true);
    hook.rerender({ setId: 'set-b', members: new Set(['capabilities/a', 'capabilities/b']) });
    expect(hook.result.current.open).toBe(false);
  });
});
