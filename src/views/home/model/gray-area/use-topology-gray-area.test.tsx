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

describe('map analysis entry without a selection',()=>{
  function unselected(documents=docs){
    const choose=vi.fn();const empty=vi.fn();const onOpen=vi.fn();const onPrepare=vi.fn();
    const hook=renderHook(()=>useTopologyGrayArea({docs:documents,nodes:[],selectedSlug:null,memberSlugs:null,
      vaultPath:'/fixture/vault',locale:'en',routeState:parseHomeRouteState(new URLSearchParams()),
      setRouteState:()=>{},onOpen,onPrepare,onChooseScope:choose,onEmptyVault:empty}));
    return {...hook,choose,empty,onOpen,onPrepare};
  }
  it('names one recorded project and waits for a deliberate press',()=>{
    const hook=unselected();
    expect(hook.result.current.continuationAction.subject).toBe('project');
    expect(hook.result.current.open).toBe(false);expect(hook.onOpen).not.toHaveBeenCalled();
    act(()=>hook.result.current.continuationAction.onOpen());
    expect((hook.result.current.inspector as Inspector).props.selection.uids).toEqual(['project']);
    expect(hook.result.current.open).toBe(true);expect(hook.onPrepare).not.toHaveBeenCalled();
  });
  it('requires scope choice when projects are ambiguous instead of analyzing them together',()=>{
    const hook=unselected([...docs,document('another-project',{kind:'project',uid:'another'})]);
    act(()=>hook.result.current.continuationAction.onOpen());
    expect(hook.choose).toHaveBeenCalledOnce();expect(hook.result.current.open).toBe(false);
    expect(hook.onOpen).not.toHaveBeenCalled();expect(hook.onPrepare).not.toHaveBeenCalled();
  });
  it('offers the existing first construction for an empty map without sending',()=>{
    const hook=unselected([]);act(()=>hook.result.current.continuationAction.onOpen());
    expect(hook.empty).toHaveBeenCalledOnce();expect(hook.choose).not.toHaveBeenCalled();
    expect(hook.onPrepare).not.toHaveBeenCalled();expect(hook.result.current.open).toBe(false);
  });
});

it('offers folder connection for a visible sample without calling it an empty map',()=>{
 const connect=vi.fn();const onPrepare=vi.fn();
 const hook=renderHook(()=>useTopologyGrayArea({docs:[],nodes:[],selectedSlug:null,memberSlugs:null,
   vaultPath:null,vaultLoaded:false,locale:'en',routeState:parseHomeRouteState(new URLSearchParams()),
   setRouteState:()=>{},onOpen:()=>{},onPrepare,onConnectVault:connect}));
 expect(hook.result.current.continuationAction.subject).toBe('continuation.localFolderAction');
 expect(connect).not.toHaveBeenCalled();expect(onPrepare).not.toHaveBeenCalled();
 act(()=>hook.result.current.continuationAction.onOpen());
 expect(connect).toHaveBeenCalledOnce();expect(onPrepare).not.toHaveBeenCalled();
});

it('prepares an improvement without adding the investigation-only lead or automatically sending',()=>{
 const prepare=vi.fn();
 const hook=renderHook(()=>useTopologyGrayArea({docs,nodes:[],selectedSlug:'capabilities/a',memberSlugs:null,vaultPath:'/fixture/vault',locale:'en',routeState:parseHomeRouteState(new URLSearchParams()),setRouteState:()=>{},onOpen:()=>{},onPrepare:prepare}));
 act(()=>hook.result.current.action?.onOpen());
 const inspector=hook.result.current.inspector as ReactElement<{onPrepareImprovement:(text:string,candidate:GrayAreaCandidate,snapshot:unknown,sourceRoot:string)=>void}>;
 const snapshot={snapshotId:'current-evidence'};
 act(()=>inspector.props.onPrepareImprovement('Prepare the reviewable change.',{slug:'capabilities/a',relatedSlug:null} as GrayAreaCandidate,snapshot,'/fixture/source'));
 expect(prepare).toHaveBeenCalledOnce();expect(prepare.mock.calls[0][0]).toBe('Prepare the reviewable change.');
 expect(prepare.mock.calls[0][2]).toEqual({snapshot,projectUid:'project',sourceRoot:'/fixture/source'});
 expect(hook.result.current.open).toBe(false);
});
