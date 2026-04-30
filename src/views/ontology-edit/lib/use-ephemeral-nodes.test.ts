import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEphemeralNodes } from './use-ephemeral-nodes';

describe('useEphemeralNodes', () => {
  it('initial state — empty nodes', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    expect(result.current.nodes).toEqual([]);
  });

  it('addNode returns new id and appends to nodes', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    let id = '';
    act(() => {
      id = result.current.addNode('domain');
    });
    expect(id).toMatch(/^ephemeral-/);
    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0]).toMatchObject({
      id,
      kind: 'domain',
      kindLabel: '도메인',
      title: '(이름 입력)',
    });
  });

  it('multiple addNode produces unique ids + offset stack', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    act(() => {
      result.current.addNode('project');
    });
    act(() => {
      result.current.addNode('capability');
    });
    act(() => {
      result.current.addNode('element');
    });
    const ids = result.current.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(3); // 모두 unique
    // offset 으로 stack 회피 — y 좌표가 점점 커짐
    const ys = result.current.nodes.map((n) => n.y);
    expect(ys[1]).toBeGreaterThan(ys[0]!);
    expect(ys[2]).toBeGreaterThan(ys[1]!);
  });

  it('kind label mapping covers 4 kinds', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    act(() => {
      result.current.addNode('project');
      result.current.addNode('domain');
      result.current.addNode('capability');
      result.current.addNode('element');
    });
    const labels = result.current.nodes.map((n) => n.kindLabel);
    expect(labels).toEqual(['프로젝트', '도메인', '역량', '요소']);
  });

  it('updateNode partial title — leaves others unchanged', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    let id = '';
    act(() => {
      id = result.current.addNode('domain');
    });
    act(() => {
      result.current.updateNode(id, { title: '인증' });
    });
    expect(result.current.nodes[0]?.title).toBe('인증');
    expect(result.current.nodes[0]?.kind).toBe('domain'); // unchanged
  });

  it('findById returns node when id matches', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    let id = '';
    act(() => {
      id = result.current.addNode('capability');
    });
    expect(result.current.findById(id)?.kind).toBe('capability');
  });

  it('findById returns null for missing or null id', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    expect(result.current.findById(null)).toBeNull();
    expect(result.current.findById('not-exist')).toBeNull();
  });

  it('removeNode filters out node by id', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    let id1 = '';
    let id2 = '';
    act(() => {
      id1 = result.current.addNode('domain');
    });
    act(() => {
      id2 = result.current.addNode('capability');
    });
    act(() => {
      result.current.removeNode(id1);
    });
    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0]?.id).toBe(id2);
  });

  it('clearAll resets nodes + offset', () => {
    const { result } = renderHook(() => useEphemeralNodes());
    act(() => {
      result.current.addNode('domain');
      result.current.addNode('capability');
    });
    expect(result.current.nodes).toHaveLength(2);
    act(() => {
      result.current.clearAll();
    });
    expect(result.current.nodes).toEqual([]);
    // 다시 add 하면 offset reset 되어 첫 노드 시작 좌표
    act(() => {
      result.current.addNode('project');
    });
    // 재 add 후 첫 노드 — offset 0 closure 시점 좌표 (clearAll 직후 재시작)
    expect(result.current.nodes[0]?.y).toBe(160);
  });
});
