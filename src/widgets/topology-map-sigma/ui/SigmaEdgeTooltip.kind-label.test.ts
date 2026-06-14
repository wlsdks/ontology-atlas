import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import {
  SELECTED_EDGE_CARD_DOCK_CLASS,
  SigmaSelectedEdgeCard,
  type SigmaEdgeTooltipData,
  kindLabel,
  relationAgentDecisionLabelTone,
  relationAgentDecisionTone,
  relationAgentDecisionText,
  relationAgentGateKind,
  relationAgentGateLabel,
  relationClaimLensDotTone,
  relationClaimLensText,
  relationClaimLensTone,
  relationCopyButtonTone,
  relationEvidenceLabel,
  relationEvidenceState,
  relationPrimaryCopyAction,
  relationQualityLabel,
} from './SigmaEdgeTooltip';

/**
 * 엣지 tooltip 의 관계 라벨은 *전부* i18n labels 로 와야 한다. 이전엔 contains
 * 만 로컬라이즈되고 knowledge / referenced-by / depends-on(else) 은 하드코딩
 * 영어라 ko 사용자가 토폴로지 엣지 hover 시 "depends on" 등 영어를 봤다.
 */
const labels = {
  knowledge: 'K',
  referencedBy: 'R',
  contains: 'C',
  dependsOn: 'D',
};

describe('kindLabel — 엣지 tooltip 관계 라벨 (모두 i18n)', () => {
  it('contains → labels.contains', () => {
    expect(kindLabel('contains', labels)).toBe('C');
  });
  it('knowledge → labels.knowledge (이전 하드코딩 "knowledge")', () => {
    expect(kindLabel('knowledge', labels)).toBe('K');
  });
  it('referenced-by → labels.referencedBy (이전 하드코딩 "referenced by")', () => {
    expect(kindLabel('referenced-by', labels)).toBe('R');
  });
  it('depends-on / 미지 kind(else) → labels.dependsOn (이전 하드코딩 "depends on")', () => {
    expect(kindLabel('depends-on', labels)).toBe('D');
    expect(kindLabel(undefined, labels)).toBe('D');
  });
});

describe('relationQualityLabel — 관계 품질 라벨 (모두 i18n)', () => {
  const qualityLabels = {
    strong: 'STRONG',
    supported: 'SUPPORTED',
    weak: 'WEAK',
    review: 'REVIEW',
  };

  it('품질 상태별 label map 을 그대로 사용한다', () => {
    expect(relationQualityLabel('strong', qualityLabels)).toBe('STRONG');
    expect(relationQualityLabel('supported', qualityLabels)).toBe('SUPPORTED');
    expect(relationQualityLabel('weak', qualityLabels)).toBe('WEAK');
    expect(relationQualityLabel('review', qualityLabels)).toBe('REVIEW');
  });
});

describe('relationEvidenceLabel — 관계 근거 라벨', () => {
  const evidenceLabels = {
    sourceBacked: (count: number) => `SOURCE:${count}`,
    authored: 'AUTHORED',
    needsReview: 'REVIEW',
  };

  it('source evidence 가 있으면 출처 수를 우선한다', () => {
    expect(relationEvidenceLabel({ evidenceCount: 2, authored: true }, evidenceLabels)).toBe(
      'SOURCE:2',
    );
  });

  it('source evidence 없이 authored 면 작성자 승인으로 표시한다', () => {
    expect(relationEvidenceLabel({ evidenceCount: 0, authored: true }, evidenceLabels)).toBe(
      'AUTHORED',
    );
  });

  it('근거가 없으면 검토 필요로 표시한다', () => {
    expect(relationEvidenceLabel({}, evidenceLabels)).toBe('REVIEW');
  });

  it('agent handoff contract 용 evidence state 를 안정적인 machine marker 로 만든다', () => {
    expect(relationEvidenceState({ evidenceCount: 2, authored: true })).toBe('source-backed');
    expect(relationEvidenceState({ evidenceCount: 0, authored: true })).toBe('authored');
    expect(relationEvidenceState({})).toBe('needs-review');
  });
});

describe('relationClaimLensText — 관계 claim lens', () => {
  it('품질과 근거를 유사도 점수가 아닌 ontology claim 으로 묶는다', () => {
    expect(
      relationClaimLensText({
        qualityLabel: 'STRONG',
        evidenceLabel: 'SOURCE:2',
        typedFactLabel: 'TYPED FACT',
      }),
    ).toBe('STRONG · SOURCE:2 · TYPED FACT');
  });
});

describe('relationClaimLensTone — 관계 claim lens 시각 톤', () => {
  it('claim lens container 와 dot 은 relation quality 색을 함께 따른다', () => {
    expect(relationClaimLensTone('strong')).toContain('rgba(139,151,255');
    expect(relationClaimLensDotTone('strong')).toContain('rgba(139,151,255');
    expect(relationClaimLensTone('weak')).toContain('rgba(217,161,65');
    expect(relationClaimLensDotTone('weak')).toContain('rgba(217,161,65');
    expect(relationClaimLensTone('review')).toContain('rgba(226,105,105');
    expect(relationClaimLensDotTone('review')).toContain('rgba(226,105,105');
    expect(relationClaimLensTone('supported')).toContain('rgba(72,184,203');
    expect(relationClaimLensDotTone(undefined)).toContain('rgba(72,184,203');
  });
});

describe('relationAgentGateLabel — agent handoff gate', () => {
  const gateLabels = {
    handoffReady: 'HANDOFF READY',
    preflightFirst: 'PREFLIGHT FIRST',
    reviewFirst: 'REVIEW FIRST',
  };

  it('strong/supported 관계가 근거를 가지면 handoff ready 로 보낸다', () => {
    expect(
      relationAgentGateKind({ relationQuality: 'strong', evidenceCount: 1 }),
    ).toBe('handoff-ready');
    expect(
      relationAgentGateLabel({ relationQuality: 'strong', evidenceCount: 1 }, gateLabels),
    ).toBe('HANDOFF READY');
    expect(
      relationAgentGateLabel({ relationQuality: 'supported', authored: true }, gateLabels),
    ).toBe('HANDOFF READY');
  });

  it('weak 관계는 agent handoff 전에 relation_check 를 요구한다', () => {
    expect(
      relationAgentGateKind({ relationQuality: 'weak', evidenceCount: 2 }),
    ).toBe('preflight-first');
    expect(
      relationAgentGateLabel({ relationQuality: 'weak', evidenceCount: 2 }, gateLabels),
    ).toBe('PREFLIGHT FIRST');
  });

  it('review 관계나 근거 없는 관계는 사람이 먼저 검토해야 한다', () => {
    expect(
      relationAgentGateKind({ relationQuality: 'review', evidenceCount: 1 }),
    ).toBe('review-first');
    expect(relationAgentGateKind({})).toBe('review-first');
    expect(
      relationAgentGateLabel({ relationQuality: 'review', evidenceCount: 1 }, gateLabels),
    ).toBe('REVIEW FIRST');
    expect(relationAgentGateLabel({}, gateLabels)).toBe('REVIEW FIRST');
  });
});

describe('relationAgentDecisionTone — agent decision panel tone', () => {
  it('decision panel 과 label 은 gate kind 색을 따른다', () => {
    expect(relationAgentDecisionTone('handoff-ready')).toContain('rgba(139,151,255');
    expect(relationAgentDecisionLabelTone('handoff-ready')).toContain('rgba(139,151,255');
    expect(relationAgentDecisionTone('preflight-first')).toContain('rgba(217,161,65');
    expect(relationAgentDecisionLabelTone('preflight-first')).toContain('rgba(247,212,150');
    expect(relationAgentDecisionTone('review-first')).toContain('rgba(226,105,105');
    expect(relationAgentDecisionLabelTone('review-first')).toContain('rgba(255,190,190');
  });
});

describe('relationPrimaryCopyAction — gate-aware MCP action priority', () => {
  it('handoff-ready 는 explain_relation 을, 나머지는 relation_check 를 우선한다', () => {
    expect(relationPrimaryCopyAction('handoff-ready')).toBe('explain_relation');
    expect(relationPrimaryCopyAction('preflight-first')).toBe('relation_check');
    expect(relationPrimaryCopyAction('review-first')).toBe('relation_check');
  });

  it('primary action button 은 gate kind 에 맞는 톤을 쓴다', () => {
    expect(
      relationCopyButtonTone({ gateKind: 'handoff-ready', primary: true }),
    ).toContain('rgba(139,151,255');
    expect(
      relationCopyButtonTone({ gateKind: 'preflight-first', primary: true }),
    ).toContain('rgba(217,161,65');
    expect(
      relationCopyButtonTone({ gateKind: 'review-first', primary: true }),
    ).toContain('rgba(226,105,105');
    expect(
      relationCopyButtonTone({ gateKind: 'review-first', primary: false }),
    ).toContain('var(--color-text-tertiary)');
  });
});

describe('SigmaSelectedEdgeCard — recommended MCP copy action', () => {
  it('marks the gate-aware primary copy action as the recommended next action', () => {
    const data: SigmaEdgeTooltipData = {
      source: 'domain:views',
      target: 'capability:topology-analysis-modes',
      sourceName: 'Views',
      targetName: 'Topology modes',
      kind: 'contains',
      relationType: 'contains',
      relationQuality: 'strong',
      evidenceCount: 1,
      authored: false,
      x: 0,
      y: 0,
    };

    render(
      createElement(
        NextIntlClientProvider,
        {
          locale: 'en',
          messages: enMessages,
          children: createElement(SigmaSelectedEdgeCard, { data, onClose: () => undefined }),
        },
      ),
    );

    const primary = screen.getByRole('button', { name: /Copy explain/i });
    expect(primary).toHaveAttribute('data-relation-copy-action', 'explain_relation');
    expect(primary).toHaveAttribute(
      'data-relation-copy-payload-call',
      'query_ontology({"operation":"explain_relation","from":"domain:views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );
    expect(primary).toHaveAttribute(
      'title',
      'query_ontology({"operation":"explain_relation","from":"domain:views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );
    expect(primary).toHaveAttribute('data-relation-copy-priority', 'primary');
    expect(primary).toHaveAttribute('data-copy-recommended', 'true');
    expect(primary.querySelector('[data-relation-copy-primary-badge]')).toHaveTextContent(
      'Best next',
    );

    const secondary = screen.getByRole('button', { name: /Copy relation check/i });
    expect(secondary).toHaveAttribute('data-relation-copy-action', 'relation_check');
    expect(secondary).toHaveAttribute(
      'data-relation-copy-payload-call',
      'query_ontology({"operation":"relation_check","from":"domain:views","to":"capability:topology-analysis-modes","type":"contains"})',
    );
    expect(secondary).toHaveAttribute('data-relation-copy-priority', 'secondary');
    expect(secondary).toHaveAttribute('data-copy-recommended', 'false');
    expect(secondary.querySelector('[data-relation-copy-primary-badge]')).toBeNull();

    const payload = screen.getByTestId('sigma-selected-edge-copy-payload');
    expect(payload).toHaveAttribute('data-copy-payload-tool', 'query_ontology');
    expect(payload).toHaveAttribute('data-copy-payload-action', 'explain_relation');
    expect(payload).toHaveAttribute('data-copy-payload-from', 'domain:views');
    expect(payload).toHaveAttribute('data-copy-payload-to', 'capability:topology-analysis-modes');
    expect(payload).toHaveAttribute('data-copy-payload-type', 'contains');
    expect(payload).toHaveAttribute('data-copy-payload-evidence', 'source-backed');
    expect(payload).toHaveAttribute('data-copy-payload-gate', 'handoff-ready');
    expect(payload).toHaveAttribute(
      'data-cli-fallback-command',
      "ontology-atlas explain 'domain:views' 'capability:topology-analysis-modes' [vault] --type 'contains'",
    );
    expect(payload).toHaveAttribute(
      'data-copy-payload-call',
      'query_ontology({"operation":"explain_relation","from":"domain:views","to":"capability:topology-analysis-modes","direction":"undirected","maxHops":5,"limit":10})',
    );
    expect(payload).toHaveTextContent(
      'query_ontology · explain_relation · domain:views → capability:topology-analysis-modes · contains · source-backed · handoff-ready',
    );
    expect(payload).toHaveTextContent(
      "CLI fallback ontology-atlas explain 'domain:views' 'capability:topology-analysis-modes' [vault] --type 'contains'",
    );

    const handles = screen.getByTestId('sigma-selected-edge-handle-strip');
    expect(handles).toHaveAttribute('data-source-handle', 'domain:views');
    expect(handles).toHaveAttribute('data-target-handle', 'capability:topology-analysis-modes');
    expect(handles).toHaveAttribute('data-relation-type', 'contains');
    expect(handles).toHaveAttribute(
      'data-handle-summary',
      'domain:views → capability:topology-analysis-modes · contains',
    );
    expect(handles).toHaveTextContent(
      'domain:views → capability:topology-analysis-modes · contains',
    );

    const route = screen.getByTestId('sigma-selected-edge-agent-route');
    expect(route).toHaveAttribute('data-relation-evidence-state', 'source-backed');
    const steps = Array.from(route.querySelectorAll('[data-route-step]')).map((step) =>
      step.getAttribute('data-route-step'),
    );
    expect(steps).toEqual(['fact', 'evidence', 'gate', 'action']);
    expect(route.querySelector('[data-route-step="evidence"]')).toHaveAttribute(
      'data-route-step-value',
      '1 source',
    );
    const proofBand = screen.getByTestId('sigma-selected-edge-proof-band');
    expect(proofBand).toContainElement(screen.getByTestId('sigma-selected-edge-contract'));
    expect(proofBand).toContainElement(screen.getByTestId('sigma-selected-edge-agent-decision'));
    const selectedCard = screen.getByTestId('sigma-selected-edge-card');
    const metricStrip = screen.getByTestId('sigma-selected-edge-metric-strip');
    expect(selectedCard).toHaveAttribute('data-card-density', 'compact');
    expect(proofBand).toHaveClass('grid-cols-2');
    expect(metricStrip).toHaveClass('sr-only');
    expect(metricStrip).toContainElement(
      screen.getByTestId('sigma-selected-edge-agent-gate'),
    );
  });
});

describe('relationAgentDecisionText — agent handoff decision', () => {
  const decisionLabels = {
    handoffReady: 'Include this relation in agent handoff.',
    preflightFirst: 'Run relation_check before agent handoff.',
    reviewFirst: 'Review relation evidence before agent handoff.',
  };

  it('handoff ready 관계에는 바로 handoff 가능한 이유를 보여준다', () => {
    expect(
      relationAgentDecisionText({ relationQuality: 'strong', evidenceCount: 1 }, decisionLabels),
    ).toBe('Include this relation in agent handoff.');
  });

  it('weak 관계에는 relation_check 선행을 명시한다', () => {
    expect(
      relationAgentDecisionText({ relationQuality: 'weak', evidenceCount: 1 }, decisionLabels),
    ).toBe('Run relation_check before agent handoff.');
  });

  it('review 또는 근거 없는 관계에는 handoff 전 검토를 명시한다', () => {
    expect(
      relationAgentDecisionText({ relationQuality: 'review', evidenceCount: 1 }, decisionLabels),
    ).toBe('Review relation evidence before agent handoff.');
    expect(relationAgentDecisionText({}, decisionLabels)).toBe(
      'Review relation evidence before agent handoff.',
    );
  });
});

describe('SELECTED_EDGE_CARD_DOCK_CLASS — selected relation card docking', () => {
  it('keeps the selected relation card out of the right-side node inspector rail', () => {
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain('lg:left-[calc(2rem+515px+18px)]');
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain('lg:right-auto');
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain('lg:w-[300px]');
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain('min-[1500px]:!w-[360px]');
  });
});
