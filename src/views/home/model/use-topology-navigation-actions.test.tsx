import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTopologyNavigationActions } from './use-topology-navigation-actions';

describe('agent map navigation during relation review', () => {
  it('clears the inspected relation when a generic node selection opens another node', () => {
    const setSelectedEdge = vi.fn();
    const setRouteState = vi.fn();
    const options = {
      setExpandAllActive: vi.fn(), setRouteState, replayPastWalk: vi.fn(),
      topologyInspectorState: { panelDatasheetModel: null },
      topologyAgentOrchestration: { closeVaultAgent: vi.fn() },
      topologySourceReadiness: { unboundProjectSource: null },
      topologyIndexPresentation: { beginExpandedIndexSelection: vi.fn() },
      topologyGraphProjection: { projectBySlug: new Map() },
      topologyAuthoring: { setHoverEdge: vi.fn(), setMeaningEditorState: vi.fn(), setSelectedEdge },
      topologyPreferences: { structure: false, view3d: false },
      topologyCanvasFocus: { interactionSelectedSlugRef: { current: null }, setFullDetailSlug: vi.fn(), setSelectedRelationActive: vi.fn(), setNodePopoverDismissed: vi.fn(), chatNodeIndex: new Map() },
    } as Parameters<typeof useTopologyNavigationActions>[0];
    const { result } = renderHook(() => useTopologyNavigationActions(options));

    act(() => result.current.handleSelect('other', { keepIndexOpen: true }));

    expect(setSelectedEdge).toHaveBeenCalledExactlyOnceWith(null);
    expect(setRouteState).toHaveBeenCalledOnce();
    expect(options.topologyIndexPresentation.beginExpandedIndexSelection).toHaveBeenCalledOnce();
  });

  it.each([['source', 'target', true], ['target', 'source', true], ['source', 'other', false]] as const)(
    'keeps the inspected relation only when the read path joins its endpoints: %s to %s', (from, to, retained) => {
      const relation = { sourceId: 'a', targetId: 'b', relationType: 'contains', declaredBySlug: 'source' };
      let selected: typeof relation | null = relation;
      const setRouteState = vi.fn();
      const options = {
        setExpandAllActive: vi.fn(), setRouteState, replayPastWalk: vi.fn(),
        topologyInspectorState: { panelDatasheetModel: null },
        topologyAgentOrchestration: { closeVaultAgent: vi.fn() },
        topologySourceReadiness: { unboundProjectSource: null },
        topologyIndexPresentation: { beginExpandedIndexSelection: vi.fn() },
        topologyGraphProjection: { projectBySlug: new Map() },
        topologyAuthoring: { setHoverEdge: vi.fn(), setMeaningEditorState: vi.fn(), setSelectedEdge: (next: typeof selected | ((current: typeof selected) => typeof selected)) => { selected = typeof next === 'function' ? next(selected) : next; } },
        topologyPreferences: { structure: false, view3d: false },
        topologyCanvasFocus: { interactionSelectedSlugRef: { current: null }, setFullDetailSlug: vi.fn(), setSelectedRelationActive: vi.fn(), setNodePopoverDismissed: vi.fn(), chatNodeIndex: new Map([['source', 'a'], ['target', 'b'], ['other', 'c']]) },
      } as Parameters<typeof useTopologyNavigationActions>[0];
      const { result } = renderHook(() => useTopologyNavigationActions(options));
      act(() => result.current.handleAcpMapIntent({ kind: 'path', from, to, toolCallId: 'read-path' }));
      expect(selected).toEqual(retained ? relation : null);
      expect(setRouteState).toHaveBeenCalledOnce();
    },
  );
});
