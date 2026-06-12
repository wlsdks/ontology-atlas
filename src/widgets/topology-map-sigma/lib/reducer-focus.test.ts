import { describe, expect, it } from 'vitest';
import {
  FOCUS_DENSE_THRESHOLD,
  applyFocusEdgeOverlay,
  applyFocusOverlay,
  type FocusContext,
} from './reducer-focus';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

function attrs(overrides: Partial<SigmaNodeAttrs> = {}): SigmaNodeAttrs {
  return {
    x: 0,
    y: 0,
    size: 5,
    label: 'node-label',
    color: 'rgba(120,120,120,1)',
    borderColor: 'var(--color-border-strong)',
    outerBorderColor: 'transparent',
    projectSlug: 'p',
    categoryId: 'c',
    isHub: false,
    ownerKey: 'unassigned',
    ...overrides,
  };
}

function ctx(overrides: Partial<FocusContext> = {}): FocusContext {
  return {
    focusNode: 'focus',
    neighbors: new Set(['n1', 'n2']),
    secondHop: new Set(['s1']),
    backrefNodes: new Set(),
    backrefHighlight: false,
    bounceFactor: 1,
    ...overrides,
  };
}

function edgeAttrs(overrides: Partial<SigmaEdgeAttrs> = {}): SigmaEdgeAttrs {
  return {
    size: 1,
    color: 'rgba(120,120,120,1)',
    kind: 'depends-on',
    ...overrides,
  };
}

describe('applyFocusOverlay — focus self', () => {
  it('focus 노드는 kind fill 유지 + 인디고 ring + size 1.6x (비허브)', () => {
    // fill = 데이터(kind 색), 인디고 = 선택 상태이며 ring 채널로만 — 범례가
    // 선택 중에도 참으로 유지된다 (디자이너 패널 합의).
    const out = applyFocusOverlay('focus', attrs(), ctx());
    expect(out.color).toBe('rgba(120,120,120,1)');
    expect(out.borderColor).toBe('rgba(139, 151, 255, 0.95)');
    expect(out.outerBorderColor).toBe('rgba(139, 151, 255, 0.35)');
    expect(out.size).toBeCloseTo(5 * 1.6);
    expect(out.zIndex).toBe(10);
    expect(out.forceLabel).toBe(false);
    expect(out.label).toBeUndefined();
  });

  it('focus 가 허브면 size 1.25x', () => {
    const out = applyFocusOverlay('focus', attrs({ isHub: true }), ctx());
    expect(out.size).toBeCloseTo(5 * 1.25);
  });

  it('bounceFactor 가 size 에 곱해짐', () => {
    const out = applyFocusOverlay(
      'focus',
      attrs(),
      ctx({ bounceFactor: 1.2 }),
    );
    expect(out.size).toBeCloseTo(5 * 1.6 * 1.2);
  });
});

describe('applyFocusOverlay — 1-hop neighbor', () => {
  it('일반 1-hop 은 kind fill 유지 + white border 신호 + forceLabel true', () => {
    const out = applyFocusOverlay('n1', attrs(), ctx());
    expect(out.color).toBe('rgba(120,120,120,1)');
    expect(out.borderColor).toBe('rgba(255, 255, 255, 0.30)');
    expect(out.zIndex).toBe(9);
    expect(out.forceLabel).toBe(true);
    expect(out.label).toBe('node-label');
  });

  it('1-hop 허브도 kind fill 유지 (인디고 재채색 없음)', () => {
    const out = applyFocusOverlay('n1', attrs({ isHub: true }), ctx());
    expect(out.color).toBe('rgba(120,120,120,1)');
    expect(out.borderColor).toBe('rgba(255, 255, 255, 0.30)');
  });

  it('dense focus (≥8 neighbors) 도 kind fill 유지 + 라벨 솎아냄', () => {
    const denseNeighbors = new Set([
      'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8',
    ]);
    expect(denseNeighbors.size).toBe(FOCUS_DENSE_THRESHOLD);
    const out = applyFocusOverlay(
      'n1',
      attrs(),
      ctx({ neighbors: denseNeighbors }),
    );
    expect(out.color).toBe('rgba(120,120,120,1)');
    expect(out.borderColor).toBe('rgba(255, 255, 255, 0.30)');
    expect(out.zIndex).toBe(9);
    // dense 일 때 forceLabel 미설정 (라벨 그리드가 솎아냄)
    expect((out as { forceLabel?: boolean }).forceLabel).toBeUndefined();
  });

  it('backref overlay 켜졌을 때 backref 매치 1-hop 은 amber border-only (fill 유지)', () => {
    // amber fill 은 capability kind 색과 hue 충돌 — border 채널로만 신호.
    const out = applyFocusOverlay(
      'n1',
      attrs(),
      ctx({
        backrefHighlight: true,
        backrefNodes: new Set(['n1']),
      }),
    );
    expect(out.color).toBe('rgba(120,120,120,1)');
    expect(out.borderColor).toBe('rgba(232, 196, 162, 0.9)');
    expect(out.forceLabel).toBe(true);
  });

  it('backref overlay 켜져도 dense + backref 면 forceLabel false (라벨 솎아냄)', () => {
    const denseNeighbors = new Set([
      'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9',
    ]);
    const out = applyFocusOverlay(
      'n1',
      attrs(),
      ctx({
        neighbors: denseNeighbors,
        backrefHighlight: true,
        backrefNodes: new Set(['n1']),
      }),
    );
    expect(out.forceLabel).toBe(false);
  });

  it('backref overlay 꺼졌으면 backrefNodes 매치되어도 일반 톤', () => {
    const out = applyFocusOverlay(
      'n1',
      attrs(),
      ctx({
        backrefHighlight: false,
        backrefNodes: new Set(['n1']),
      }),
    );
    // 일반 1-hop 톤 (amber border 아님)
    expect(out.borderColor).toBe('rgba(255, 255, 255, 0.30)');
  });
});

describe('applyFocusOverlay — 2-hop / 그 외', () => {
  it('2-hop 노드는 약한 dim + label undefined', () => {
    const out = applyFocusOverlay('s1', attrs(), ctx());
    expect(out.color).toBe('rgba(70, 75, 90, 0.1)');
    expect(out.borderColor).toBe('rgba(70, 75, 90, 0.05)');
    expect(out.label).toBeUndefined();
    expect(out.forceLabel).toBe(false);
  });

  it('어디에도 안 속하는 노드는 deep dim', () => {
    const out = applyFocusOverlay('outer', attrs(), ctx());
    expect(out.color).toBe('rgba(70, 75, 90, 0.06)');
    expect(out.borderColor).toBe('rgba(70, 75, 90, 0.04)');
    expect(out.label).toBeUndefined();
  });
});

describe('applyFocusOverlay — explicit isDenseFocus 우선', () => {
  it('caller 가 isDenseFocus=true 명시하면 neighbors 작아도 dense 적용 (라벨 솎아냄)', () => {
    const out = applyFocusOverlay(
      'n1',
      attrs(),
      ctx({ neighbors: new Set(['n1', 'n2']), isDenseFocus: true }),
    );
    // dense 분기 = forceLabel 미설정 (fill 은 두 분기 모두 kind 색 유지)
    expect((out as { forceLabel?: boolean }).forceLabel).toBeUndefined();
  });

  it('caller 가 isDenseFocus=false 명시하면 neighbors 많아도 비-dense (forceLabel)', () => {
    const big = new Set(['n1','n2','n3','n4','n5','n6','n7','n8','n9']);
    const out = applyFocusOverlay(
      'n1',
      attrs(),
      ctx({ neighbors: big, isDenseFocus: false }),
    );
    expect(out.forceLabel).toBe(true);
  });
});

describe('applyFocusEdgeOverlay — dense focus legibility', () => {
  it('dense focus 직접 edge 는 낮은 alpha 와 얇은 선으로 유지한다', () => {
    const denseNeighbors = new Set([
      'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8',
    ]);
    const out = applyFocusEdgeOverlay(edgeAttrs({ size: 1.4 }), {
      focusNode: 'focus',
      source: 'focus',
      target: 'n1',
      neighbors: denseNeighbors,
      wave: 1,
    });

    expect(out.color).toBe('rgba(139, 151, 255, 0.28)');
    expect(out.size).toBe(0.7);
    expect(out.zIndex).toBe(1);
  });

  it('dense focus 이웃끼리 edge 는 흰 덩어리가 되지 않게 거의 숨긴다', () => {
    const denseNeighbors = new Set([
      'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8',
    ]);
    const out = applyFocusEdgeOverlay(edgeAttrs(), {
      focusNode: 'focus',
      source: 'n1',
      target: 'n2',
      neighbors: denseNeighbors,
      wave: 0.5,
    });

    expect(out.color).toBe('rgba(255, 255, 255, 0.012)');
    expect(out.size).toBe(0.35);
  });

  it('일반 focus 직접 edge 는 여전히 읽히지만 이전보다 과도하게 밝지 않다', () => {
    const out = applyFocusEdgeOverlay(edgeAttrs(), {
      focusNode: 'focus',
      source: 'focus',
      target: 'n1',
      neighbors: new Set(['n1', 'n2']),
      wave: 1,
    });

    expect(out.color).toBe('rgba(139, 151, 255, 0.7)');
    expect(out.size).toBe(1.25);
    expect(out.zIndex).toBe(2);
  });
});
