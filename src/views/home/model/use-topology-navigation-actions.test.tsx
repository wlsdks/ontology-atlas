import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTopologyNavigationActions } from './use-topology-navigation-actions';

describe('agent map navigation during relation review', () => {
  it('clears the inspected relation when a generic node selection opens another node', () => {
    const setSelectedEdge = vi.fn();
    const setRouteState = vi.fn();
    const options = {
      setExpandAllActive: vi.fn(), setRouteState,
      topologyInspectorState: { panelDatasheetModel: null },
      topologyAgentOrchestration: { closeVaultAgent: vi.fn() },
      topologySourceReadiness: { unboundProjectSource: null },
      topologyIndexPresentation: { beginExpandedIndexSelection: vi.fn() },
      topologyGraphProjection: { projectBySlug: new Map() },
      topologyAuthoring: { setHoverEdge: vi.fn(), setMeaningEditorState: vi.fn(), setSelectedEdge },
      topologyPreferences: { structure: false, neural: false },
      topologyCanvasFocus: { interactionSelectedSlugRef: { current: null }, setFullDetailSlug: vi.fn(), setSelectedRelationActive: vi.fn(), setNodePopoverDismissed: vi.fn(), chatNodeIndex: new Map() },
    } as Parameters<typeof useTopologyNavigationActions>[0];
    const { result } = renderHook(() => useTopologyNavigationActions(options));

    act(() => result.current.handleSelect('other', { keepIndexOpen: true }));

    expect(setSelectedEdge).toHaveBeenCalledExactlyOnceWith(null);
    expect(setRouteState).toHaveBeenCalledOnce();
    expect(options.topologyIndexPresentation.beginExpandedIndexSelection).toHaveBeenCalledOnce();
  });

  it('clears the selection when the panel closes in 3D, as in every view', () => {
    const setRouteState = vi.fn();
    const setNodePopoverDismissed = vi.fn();
    const interactionSelectedSlugRef = { current: 'capability:a' as string | null };
    const options = {
      setExpandAllActive: vi.fn(), setRouteState,
      topologyInspectorState: { panelDatasheetModel: null },
      topologyAgentOrchestration: { closeVaultAgent: vi.fn() },
      topologySourceReadiness: { unboundProjectSource: null },
      topologyIndexPresentation: { beginExpandedIndexSelection: vi.fn() },
      topologyGraphProjection: { projectBySlug: new Map() },
      topologyAuthoring: { setHoverEdge: vi.fn(), setMeaningEditorState: vi.fn(), setSelectedEdge: vi.fn() },
      topologyPreferences: { structure: false, neural: false },
      topologyCanvasFocus: { interactionSelectedSlugRef, setFullDetailSlug: vi.fn(), setSelectedRelationActive: vi.fn(), setNodePopoverDismissed, chatNodeIndex: new Map() },
    } as Parameters<typeof useTopologyNavigationActions>[0];
    const { result } = renderHook(() => useTopologyNavigationActions(options));

    act(() => result.current.handleDatasheetClose());

    const update = setRouteState.mock.calls[0]![0] as (route: { selectedSlug: string | null; analysisMode: string }) => { selectedSlug: string | null };
    expect(update({ selectedSlug: 'capability:a', analysisMode: 'focus' }).selectedSlug).toBeNull();
    expect(interactionSelectedSlugRef.current).toBeNull();
    expect(setNodePopoverDismissed).not.toHaveBeenCalled();
  });

  it.each([['source', 'target', true], ['target', 'source', true], ['source', 'other', false]] as const)(
    'keeps the inspected relation only when the read path joins its endpoints: %s to %s', (from, to, retained) => {
      const relation = { sourceId: 'a', targetId: 'b', relationType: 'contains', declaredBySlug: 'source' };
      let selected: typeof relation | null = relation;
      const setRouteState = vi.fn();
      const options = {
        setExpandAllActive: vi.fn(), setRouteState,
        topologyInspectorState: { panelDatasheetModel: null },
        topologyAgentOrchestration: { closeVaultAgent: vi.fn() },
        topologySourceReadiness: { unboundProjectSource: null },
        topologyIndexPresentation: { beginExpandedIndexSelection: vi.fn() },
        topologyGraphProjection: { projectBySlug: new Map() },
        topologyAuthoring: { setHoverEdge: vi.fn(), setMeaningEditorState: vi.fn(), setSelectedEdge: (next: typeof selected | ((current: typeof selected) => typeof selected)) => { selected = typeof next === 'function' ? next(selected) : next; } },
        topologyPreferences: { structure: false, neural: false },
        topologyCanvasFocus: { interactionSelectedSlugRef: { current: null }, setFullDetailSlug: vi.fn(), setSelectedRelationActive: vi.fn(), setNodePopoverDismissed: vi.fn(), chatNodeIndex: new Map([['source', 'a'], ['target', 'b'], ['other', 'c']]) },
      } as Parameters<typeof useTopologyNavigationActions>[0];
      const { result } = renderHook(() => useTopologyNavigationActions(options));
      act(() => result.current.handleAcpMapIntent({ kind: 'path', from, to, toolCallId: 'read-path' }));
      expect(selected).toEqual(retained ? relation : null);
      expect(setRouteState).toHaveBeenCalledOnce();
    },
  );
});
