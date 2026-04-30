import { describe, expect, it } from 'vitest';
import {
  AUDIT_ORPHAN_BORDER,
  AUDIT_ORPHAN_COLOR,
  AUDIT_PROMOTION_BORDER,
  AUDIT_PROMOTION_COLOR,
  AUDIT_STALE_BORDER,
  AUDIT_STALE_COLOR,
  applyAuditOverlay,
  type AuditNodeSets,
} from './reducer-audit';
import type { SigmaNodeAttrs } from './graph-build';

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

const empty: AuditNodeSets = {
  stale: new Set(),
  orphan: new Set(),
  promotion: new Set(),
};

describe('applyAuditOverlay — branches', () => {
  it('stale 매치 시 stale 톤 + size 1.2x + forceLabel true', () => {
    const sets: AuditNodeSets = {
      ...empty,
      stale: new Set(['n1']),
    };
    const out = applyAuditOverlay('n1', attrs(), sets);
    expect(out.color).toBe(AUDIT_STALE_COLOR);
    expect(out.borderColor).toBe(AUDIT_STALE_BORDER);
    expect(out.size).toBeCloseTo(5 * 1.2);
    expect(out.zIndex).toBe(10);
    expect(out.forceLabel).toBe(true);
    expect(out.label).toBe('node-label');
  });

  it('orphan 매치 (stale 없음) 시 orphan 톤 + size 1.15x', () => {
    const sets: AuditNodeSets = {
      ...empty,
      orphan: new Set(['n1']),
    };
    const out = applyAuditOverlay('n1', attrs(), sets);
    expect(out.color).toBe(AUDIT_ORPHAN_COLOR);
    expect(out.borderColor).toBe(AUDIT_ORPHAN_BORDER);
    expect(out.size).toBeCloseTo(5 * 1.15);
    expect(out.zIndex).toBe(9);
  });

  it('promotion 매치 시 promotion 톤 + size 1.25x', () => {
    const sets: AuditNodeSets = {
      ...empty,
      promotion: new Set(['n1']),
    };
    const out = applyAuditOverlay('n1', attrs(), sets);
    expect(out.color).toBe(AUDIT_PROMOTION_COLOR);
    expect(out.borderColor).toBe(AUDIT_PROMOTION_BORDER);
    expect(out.size).toBeCloseTo(5 * 1.25);
    expect(out.zIndex).toBe(9);
  });

  it('우선순위 stale > orphan > promotion — 한 노드가 여러 set 에 속해도 stale 적용', () => {
    const sets: AuditNodeSets = {
      stale: new Set(['n1']),
      orphan: new Set(['n1']),
      promotion: new Set(['n1']),
    };
    const out = applyAuditOverlay('n1', attrs(), sets);
    expect(out.color).toBe(AUDIT_STALE_COLOR);
  });

  it('orphan 도 stale 만큼 우선 — orphan + promotion 일 때 orphan', () => {
    const sets: AuditNodeSets = {
      stale: new Set(),
      orphan: new Set(['n1']),
      promotion: new Set(['n1']),
    };
    const out = applyAuditOverlay('n1', attrs(), sets);
    expect(out.color).toBe(AUDIT_ORPHAN_COLOR);
  });

  it('어느 set 에도 안 속하면 deep dim + label undefined', () => {
    const out = applyAuditOverlay('n1', attrs(), empty);
    expect(out.color).toBe('rgba(90, 95, 110, 0.08)');
    expect(out.borderColor).toBe('rgba(90, 95, 110, 0.04)');
    expect(out.label).toBeUndefined();
  });

  it('원본 attrs 의 다른 필드는 보존 (projectSlug / categoryId)', () => {
    const sets: AuditNodeSets = { ...empty, stale: new Set(['n1']) };
    const out = applyAuditOverlay(
      'n1',
      attrs({ projectSlug: 'design-system', categoryId: 'core' }),
      sets,
    );
    expect(out.projectSlug).toBe('design-system');
    expect(out.categoryId).toBe('core');
  });
});
