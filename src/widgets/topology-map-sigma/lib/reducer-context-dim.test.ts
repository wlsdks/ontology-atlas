import { describe, expect, it } from 'vitest';
import {
  CONTEXT_DIM_COLOR,
  CONTEXT_HIGHLIGHT_BORDER_HOVER,
  CONTEXT_HIGHLIGHT_BORDER_STRONG,
  CONTEXT_HIGHLIGHT_COLOR,
  CONTEXT_HOVER_DIM_COLOR,
  applyContextDimOverlay,
  type ContextDimContext,
} from './reducer-context-dim';
import type { SigmaNodeAttrs } from './graph-build';

function attrs(overrides: Partial<SigmaNodeAttrs> = {}): SigmaNodeAttrs {
  return {
    x: 0,
    y: 0,
    size: 5,
    label: 'L',
    color: 'orig',
    borderColor: 'orig',
    outerBorderColor: 'transparent',
    projectSlug: 'p',
    categoryId: 'c',
    isHub: false,
    ownerKey: 'unassigned',
    ...overrides,
  };
}

function ctx(overrides: Partial<ContextDimContext> = {}): ContextDimContext {
  return {
    searchPassed: true,
    categoryPassed: true,
    depthPassed: true,
    hoveredEdgePair: null,
    pathNodes: new Set(),
    impactNodes: new Set(),
    ...overrides,
  };
}

describe('applyContextDimOverlay — null when no overlay active', () => {
  it('all filters passed + no hover + no path → null', () => {
    expect(applyContextDimOverlay('n', attrs(), ctx())).toBeNull();
  });
});

describe('applyContextDimOverlay — filter dim', () => {
  it('search miss → deep dim', () => {
    const out = applyContextDimOverlay('n', attrs(), ctx({ searchPassed: false }));
    expect(out).not.toBeNull();
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
    expect(out!.label).toBeUndefined();
  });

  it('category miss → deep dim', () => {
    const out = applyContextDimOverlay('n', attrs(), ctx({ categoryPassed: false }));
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
  });

  it('depth miss → deep dim', () => {
    const out = applyContextDimOverlay('n', attrs(), ctx({ depthPassed: false }));
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
  });

  it('미통과가 우선 — hoveredEdge / path 활성도 무시', () => {
    const out = applyContextDimOverlay(
      'src',
      attrs(),
      ctx({
        searchPassed: false,
        hoveredEdgePair: { source: 'src', target: 'tgt' },
        pathNodes: new Set(['src']),
      }),
    );
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
  });
});

describe('applyContextDimOverlay — hoveredEdge', () => {
  it('source 노드는 인디고 highlight', () => {
    const out = applyContextDimOverlay(
      'src',
      attrs(),
      ctx({ hoveredEdgePair: { source: 'src', target: 'tgt' } }),
    );
    expect(out!.color).toBe(CONTEXT_HIGHLIGHT_COLOR);
    expect(out!.borderColor).toBe(CONTEXT_HIGHLIGHT_BORDER_HOVER);
    expect(out!.zIndex).toBe(10);
    expect(out!.label).toBe('L');
  });

  it('target 노드도 동일 highlight', () => {
    const out = applyContextDimOverlay(
      'tgt',
      attrs(),
      ctx({ hoveredEdgePair: { source: 'src', target: 'tgt' } }),
    );
    expect(out!.color).toBe(CONTEXT_HIGHLIGHT_COLOR);
  });

  it('그 외 노드는 약 dim (CONTEXT_HOVER_DIM_COLOR)', () => {
    const out = applyContextDimOverlay(
      'other',
      attrs(),
      ctx({ hoveredEdgePair: { source: 'src', target: 'tgt' } }),
    );
    expect(out!.color).toBe(CONTEXT_HOVER_DIM_COLOR);
    expect(out!.label).toBeUndefined();
  });
});

describe('applyContextDimOverlay — pathNodes', () => {
  it('경로 안 노드는 size 1.25x + 인디고 + forceLabel true', () => {
    const out = applyContextDimOverlay(
      'p1',
      attrs(),
      ctx({ pathNodes: new Set(['p1', 'p2']) }),
    );
    expect(out!.color).toBe(CONTEXT_HIGHLIGHT_COLOR);
    expect(out!.borderColor).toBe(CONTEXT_HIGHLIGHT_BORDER_STRONG);
    expect(out!.size).toBeCloseTo(5 * 1.25);
    expect(out!.zIndex).toBe(10);
    expect(out!.forceLabel).toBe(true);
  });

  it('경로 밖 노드는 deep dim', () => {
    const out = applyContextDimOverlay(
      'outside',
      attrs(),
      ctx({ pathNodes: new Set(['p1']) }),
    );
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
  });
});

describe('applyContextDimOverlay — impactNodes (blast radius)', () => {
  it('impact set 안 노드는 인디고 highlight (size 변동 없음)', () => {
    const out = applyContextDimOverlay(
      'affected',
      attrs(),
      ctx({ impactNodes: new Set(['affected', 'other-affected']) }),
    );
    expect(out!.color).toBe(CONTEXT_HIGHLIGHT_COLOR);
    expect(out!.borderColor).toBe(CONTEXT_HIGHLIGHT_BORDER_STRONG);
    expect(out!.zIndex).toBe(10);
    expect(out!.label).toBe('L');
    expect(out!.size).toBe(5); // set 이 클 수 있어 size 안 키움
  });

  it('impact set 밖 노드는 deep dim', () => {
    const out = applyContextDimOverlay(
      'unaffected',
      attrs(),
      ctx({ impactNodes: new Set(['affected']) }),
    );
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
    expect(out!.label).toBeUndefined();
  });

  it('impact 가 hoveredEdge / path 보다 우선', () => {
    const out = applyContextDimOverlay(
      'affected',
      attrs(),
      ctx({
        impactNodes: new Set(['affected']),
        hoveredEdgePair: { source: 'affected', target: 'tgt' },
        pathNodes: new Set(['affected']),
      }),
    );
    // impact 분기(size 변동 없음)가 먼저 — path 였으면 1.25x
    expect(out!.borderColor).toBe(CONTEXT_HIGHLIGHT_BORDER_STRONG);
    expect(out!.size).toBe(5);
  });

  it('필터 미통과가 impact 보다 우선', () => {
    const out = applyContextDimOverlay(
      'affected',
      attrs(),
      ctx({ searchPassed: false, impactNodes: new Set(['affected']) }),
    );
    expect(out!.color).toBe(CONTEXT_DIM_COLOR);
  });
});

describe('applyContextDimOverlay — 우선순위', () => {
  it('hoveredEdge 가 path 보다 우선 (path 도 동시 활성일 때)', () => {
    const out = applyContextDimOverlay(
      'src',
      attrs(),
      ctx({
        hoveredEdgePair: { source: 'src', target: 'tgt' },
        pathNodes: new Set(['src']),
      }),
    );
    expect(out!.borderColor).toBe(CONTEXT_HIGHLIGHT_BORDER_HOVER);
    // path 였으면 size 1.25x 이지만 hover 가 먼저 → size 변동 없음
    expect(out!.size).toBe(5);
  });
});
