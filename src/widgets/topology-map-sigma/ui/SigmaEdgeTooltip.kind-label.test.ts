import { createElement, type ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import enMessages from '../../../../messages/en.json';
import koMessages from '../../../../messages/ko.json';
import {
  SELECTED_EDGE_CARD_DOCK_CLASS,
  SigmaEdgeTooltip,
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
    expect(relationClaimLensTone('strong')).toContain(
      '--topology-selected-relation-claim-strong-surface',
    );
    expect(relationClaimLensDotTone('strong')).toContain(
      '--topology-selected-relation-claim-strong-dot',
    );
    expect(relationClaimLensTone('weak')).toContain(
      '--topology-selected-relation-claim-weak-surface',
    );
    expect(relationClaimLensDotTone('weak')).toContain(
      '--topology-selected-relation-claim-weak-dot',
    );
    expect(relationClaimLensTone('review')).toContain(
      '--topology-selected-relation-claim-review-surface',
    );
    expect(relationClaimLensDotTone('review')).toContain(
      '--topology-selected-relation-claim-review-dot',
    );
    expect(relationClaimLensTone('supported')).toContain(
      '--topology-selected-relation-claim-supported-surface',
    );
    expect(relationClaimLensDotTone(undefined)).toContain(
      '--topology-selected-relation-claim-supported-dot',
    );
  });
});

describe('SigmaEdgeTooltip — compact relation fact surface', () => {
  it('hover tooltip exposes relation type, evidence state, and surface token markers', () => {
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
      x: 24,
      y: 32,
    };

    const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
      locale: 'en',
      messages: enMessages,
      children: createElement(SigmaEdgeTooltip, { data }),
    };

    render(createElement(NextIntlClientProvider, providerProps));

    const tooltip = screen.getByTestId('topology-edge-tooltip');
    expect(tooltip).toHaveAttribute('data-edge-tooltip-contract', 'compact-relation-fact');
    expect(tooltip).toHaveAttribute(
      'data-edge-tooltip-surface-token',
      '--topology-edge-tooltip-surface',
    );
    expect(tooltip).toHaveAttribute('data-relation-type', 'contains');
    expect(tooltip).toHaveAttribute('data-relation-evidence-state', 'source-backed');
    expect(tooltip).toHaveTextContent('Views');
    expect(tooltip).toHaveTextContent('Topology modes');
    expect(tooltip).toHaveTextContent('contains');
    expect(tooltip).toHaveTextContent('1 source');
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
    expect(relationAgentDecisionTone('handoff-ready')).toContain(
      '--topology-selected-relation-gate-handoff-surface',
    );
    expect(relationAgentDecisionLabelTone('handoff-ready')).toContain(
      '--topology-selected-relation-gate-handoff-text',
    );
    expect(relationAgentDecisionTone('preflight-first')).toContain(
      '--topology-selected-relation-gate-preflight-surface',
    );
    expect(relationAgentDecisionLabelTone('preflight-first')).toContain(
      '--topology-selected-relation-gate-preflight-text',
    );
    expect(relationAgentDecisionTone('review-first')).toContain(
      '--topology-selected-relation-gate-review-surface',
    );
    expect(relationAgentDecisionLabelTone('review-first')).toContain(
      '--topology-selected-relation-gate-review-text',
    );
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
    ).toContain('--topology-selected-relation-copy-handoff-surface');
    expect(
      relationCopyButtonTone({ gateKind: 'preflight-first', primary: true }),
    ).toContain('--topology-selected-relation-copy-preflight-surface');
    expect(
      relationCopyButtonTone({ gateKind: 'review-first', primary: true }),
    ).toContain('--topology-selected-relation-copy-review-surface');
    expect(
      relationCopyButtonTone({ gateKind: 'review-first', primary: false }),
    ).toContain('--topology-selected-relation-copy-secondary-text');
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

    const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
      locale: 'en',
      messages: enMessages,
      children: createElement(SigmaSelectedEdgeCard, { data, onClose: () => undefined }),
    };

    render(createElement(NextIntlClientProvider, providerProps));

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
    expect(primary).toHaveAttribute('data-copy-recommendation-label', 'Best next');
    expect(primary).toHaveAttribute(
      'data-copy-label-contract',
      'visible-action-full-label-accessible',
    );
    expect(primary).toHaveAttribute('data-copy-visible-label', 'explain_relation');
    expect(primary).toHaveAttribute('data-copy-full-label', 'Copy explain');
    expect(primary).toHaveAccessibleName('Copy explain · Best next');
    expect(primary).toHaveTextContent('explain_relation');
    expect(primary).not.toHaveTextContent('Best next');

    const secondary = screen.getByRole('button', { name: /Copy relation check/i });
    expect(secondary).toHaveAttribute('data-relation-copy-action', 'relation_check');
    expect(secondary).toHaveAttribute(
      'data-relation-copy-payload-call',
      'query_ontology({"operation":"relation_check","from":"domain:views","to":"capability:topology-analysis-modes","type":"contains"})',
    );
    expect(secondary).toHaveAttribute('data-relation-copy-priority', 'secondary');
    expect(secondary).toHaveAttribute('data-copy-recommended', 'false');
    expect(secondary).not.toHaveAttribute('data-copy-recommendation-label');
    expect(secondary).toHaveAttribute(
      'data-copy-label-contract',
      'visible-action-full-label-accessible',
    );
    expect(secondary).toHaveAttribute('data-copy-visible-label', 'relation_check');
    expect(secondary).toHaveAttribute('data-copy-full-label', 'Copy relation check');
    expect(secondary).toHaveTextContent('relation_check');

    const nextAction = screen.getByTestId('sigma-selected-edge-next-action');
    expect(nextAction).toHaveAttribute('data-next-action-contract', 'primary-action-first');
    expect(nextAction).toHaveAttribute('data-next-action', 'explain_relation');
    expect(nextAction).toHaveAttribute(
      'data-next-action-surface-token',
      '--topology-selected-relation-next-action-surface',
    );
    expect(nextAction).toHaveAttribute(
      'data-next-action-accent-text-token',
      '--topology-selected-relation-accent-text',
    );
    expect(nextAction).toContainElement(primary);
    expect(nextAction).toContainElement(secondary);

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
    expect(payload).toHaveAttribute(
      'data-copy-payload-accent-muted-token',
      '--topology-selected-relation-accent-muted',
    );
    expect(primary).toHaveAttribute(
      'data-focus-ring-token',
      '--topology-selected-relation-focus-ring',
    );
    expect(primary).toHaveAttribute(
      'data-primary-shadow-token',
      '--topology-selected-relation-copy-primary-shadow',
    );
    const payloadSummary = payload.querySelector('[data-copy-payload-summary]');
    expect(payloadSummary).toHaveAttribute(
      'data-copy-payload-summary',
      'query_ontology · explain_relation · domain:views → capability:topology-analysis-modes · contains · source-backed · handoff-ready',
    );
    expect(payloadSummary).toHaveAttribute(
      'data-copy-payload-visible-summary',
      'query_ontology · explain_relation · domain:views → capability:topology-analysis-modes',
    );
    expect(payload).toHaveTextContent(
      'query_ontology · explain_relation · domain:views → capability:topology-analysis-modes',
    );
    expect(payload).not.toHaveTextContent('source-backed · handoff-ready');
    const cliFallback = payload.querySelector('[data-cli-fallback-summary]');
    expect(cliFallback).toHaveClass('sr-only');
    expect(cliFallback).toHaveAttribute(
      'data-cli-fallback-summary',
      "ontology-atlas explain 'domain:views' 'capability:topology-analysis-modes' [vault] --type 'contains'",
    );
    expect(payload).not.toHaveTextContent('CLI fallback');

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
    expect(route).toHaveAttribute('data-route-density', 'micro-rail');
    expect(route).toHaveAttribute(
      'data-route-layout-contract',
      'compact-two-column-route-grid',
    );
    expect(route).toHaveAttribute('data-overflow-contract', 'no-horizontal-scroll');
    expect(route).toHaveClass('shrink-0');
    expect(route).toHaveClass('grid-cols-4');
    expect(route).toHaveClass('max-[960px]:min-h-16');
    expect(route).toHaveClass('max-[960px]:grid-cols-2');
    expect(route).toHaveClass('overflow-hidden');
    expect(route.className).not.toContain('overflow-x-auto');
    const steps = Array.from(route.querySelectorAll('[data-route-step]')).map((step) =>
      step.getAttribute('data-route-step'),
    );
    expect(steps).toEqual(['fact', 'evidence', 'gate', 'action']);
    expect(route.querySelector('[data-route-step="evidence"]')).toHaveAttribute(
      'data-route-step-value',
      '1 source',
    );
    const proofBand = screen.getByTestId('sigma-selected-edge-proof-band');
    const copyPayload = screen.getByTestId('sigma-selected-edge-copy-payload');
    expect(proofBand).toContainElement(screen.getByTestId('sigma-selected-edge-contract'));
    expect(proofBand).toContainElement(screen.getByTestId('sigma-selected-edge-agent-decision'));
    const selectedCard = screen.getByTestId('sigma-selected-edge-card');
    const metricStrip = screen.getByTestId('sigma-selected-edge-metric-strip');
    const copyActions = screen.getByTestId('sigma-selected-edge-copy-actions');
    expect(selectedCard).toHaveAttribute('data-surface-role', 'active-relation-inspector');
    expect(selectedCard).toHaveAttribute('data-card-density', 'compact');
    expect(selectedCard).toHaveAttribute(
      'data-density-contract',
      'mini-relation-inspector',
    );
    expect(selectedCard).toHaveAttribute(
      'data-dock-contract',
      'right-compact-relation-rail',
    );
    expect(selectedCard).toHaveAttribute(
      'data-attention-lane',
      'right-inspector-rail',
    );
    expect(selectedCard).toHaveAttribute(
      'data-map-clearance-contract',
      'selected-label-keeps-map-lane',
    );
    expect(selectedCard).toHaveAttribute(
      'data-scale-contract',
      'density-fixed-no-ui-zoom',
    );
    expect(selectedCard).toHaveAttribute(
      'data-width-token',
      '--topology-selected-relation-card-width',
    );
    expect(selectedCard).toHaveAttribute(
      'data-max-height-token',
      '--topology-selected-relation-card-max-height',
    );
    expect(selectedCard).toHaveAttribute(
      'data-inset-token',
      '--topology-selected-relation-card-inset',
    );
    expect(selectedCard).toHaveAttribute(
      'data-copy-action-min-width-token',
      '--topology-selected-relation-action-min-width',
    );
    expect(selectedCard).toHaveAttribute(
      'data-copy-payload-min-height-token',
      '--topology-selected-relation-copy-payload-min-height',
    );
    expect(selectedCard).toHaveAttribute(
      'data-route-step-min-width-token',
      '--topology-selected-relation-route-step-min-width',
    );
    expect(selectedCard).toHaveAttribute(
      'data-surface-token',
      '--topology-selected-relation-card-surface',
    );
    expect(selectedCard).toHaveAttribute(
      'data-border-token',
      '--topology-selected-relation-card-border',
    );
    expect(selectedCard).toHaveAttribute(
      'data-shadow-token',
      '--topology-selected-relation-card-shadow',
    );
    expect(selectedCard).toHaveAttribute(
      'data-accent-text-token',
      '--topology-selected-relation-accent-text',
    );
    expect(selectedCard).toHaveAttribute(
      'data-accent-muted-token',
      '--topology-selected-relation-accent-muted',
    );
    expect(selectedCard).toHaveAttribute(
      'data-focus-ring-token',
      '--topology-selected-relation-focus-ring',
    );
    expect(selectedCard).toHaveAttribute(
      'data-copy-primary-shadow-token',
      '--topology-selected-relation-copy-primary-shadow',
    );
    expect(selectedCard).toHaveAttribute(
      'data-typography-contract',
      'legible-compact-relation-inspector',
    );
    expect(selectedCard).toHaveAttribute(
      'data-kicker-font-size-token',
      '--topology-selected-relation-kicker-font-size',
    );
    expect(selectedCard).toHaveAttribute(
      'data-chip-font-size-token',
      '--topology-selected-relation-chip-font-size',
    );
    expect(selectedCard).toHaveAttribute(
      'data-route-label-font-size-token',
      '--topology-selected-relation-route-label-font-size',
    );
    expect(selectedCard).toHaveAttribute(
      'data-route-value-font-size-token',
      '--topology-selected-relation-route-value-font-size',
    );
    expect(selectedCard).toHaveAttribute(
      'data-payload-font-size-token',
      '--topology-selected-relation-payload-font-size',
    );
    expect(selectedCard).toHaveAttribute(
      'data-elevation-contract',
      'solid-active-inspector-over-map',
    );
    expect(selectedCard).toHaveAttribute(
      'data-motion-contract',
      'active-relation-inspector-entry',
    );
    expect(selectedCard).toHaveAttribute('data-motion-duration-ms', '180');
    expect(selectedCard).toHaveAttribute('data-motion-easing', 'ease-out');
    expect(selectedCard.className).toContain(
      'motion-safe:animate-[topology-relation-inspector-enter_180ms_ease-out_1]',
    );
    expect(selectedCard.className).not.toContain('topology-ui-scale');
    expect(selectedCard.className).not.toContain('backdrop-blur');
    expect(proofBand).toHaveClass('grid-cols-2');
    expect(route).toHaveAttribute(
      'data-route-step-min-width-token',
      '--topology-selected-relation-route-step-min-width',
    );
    expect(route.querySelector('[data-route-step="fact"]')?.className).toContain(
      'min-w-[var(--topology-selected-relation-route-step-min-width)]',
    );
    expect(route.querySelector('[data-route-step="fact"]')?.className).toContain(
      'max-[960px]:min-w-0',
    );
    expect(route.querySelector('[data-route-step-label-text]')?.className).toContain(
      'text-[length:var(--topology-selected-relation-route-label-font-size)]',
    );
    expect(route.querySelector('[data-route-step-value-text]')?.className).toContain(
      'text-[length:var(--topology-selected-relation-route-value-font-size)]',
    );
    expect(copyPayload).toHaveAttribute(
      'data-min-height-token',
      '--topology-selected-relation-copy-payload-min-height',
    );
    expect(copyPayload).toHaveClass(
      'min-h-[var(--topology-selected-relation-copy-payload-min-height)]',
    );
    expect(copyActions).toHaveAttribute(
      'data-copy-action-min-width-token',
      '--topology-selected-relation-action-min-width',
    );
    expect(copyActions).toHaveAttribute('data-overflow-contract', 'no-horizontal-scroll');
    expect(copyActions).toHaveClass('min-w-0');
    expect(copyActions).toHaveClass('overflow-hidden');
    const relationCheckCopy = selectedCard.querySelector(
      '[data-relation-copy-action="relation_check"]',
    );
    const explainCopy = selectedCard.querySelector(
      '[data-relation-copy-action="explain_relation"]',
    );
    expect(relationCheckCopy).toHaveAttribute(
      'data-copy-label-contract',
      'visible-action-full-label-accessible',
    );
    expect(relationCheckCopy).toHaveAttribute('data-copy-visible-label', 'relation_check');
    expect(relationCheckCopy).toHaveAttribute('data-copy-full-label', 'Copy relation check');
    expect(relationCheckCopy).toHaveTextContent('relation_check');
    expect(explainCopy).toHaveAttribute(
      'data-copy-label-contract',
      'visible-action-full-label-accessible',
    );
    expect(explainCopy).toHaveAttribute('data-copy-visible-label', 'explain_relation');
    expect(explainCopy).toHaveAttribute('data-copy-full-label', 'Copy explain');
    expect(explainCopy).toHaveTextContent('explain_relation');
    expect(metricStrip).toHaveClass('sr-only');
    expect(metricStrip).toContainElement(
      screen.getByTestId('sigma-selected-edge-agent-gate'),
    );
  });

  it('한국어 relation inspector 는 사람이 보는 handoff 상태 문구를 한국어로 보여준다', () => {
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

    const providerProps: ComponentProps<typeof NextIntlClientProvider> = {
      locale: 'ko',
      messages: koMessages,
      children: createElement(SigmaSelectedEdgeCard, { data, onClose: () => undefined }),
    };

    render(createElement(NextIntlClientProvider, providerProps));

    const card = screen.getByTestId('sigma-selected-edge-card');
    expect(card).toHaveTextContent('에이전트 게이트');
    expect(card).toHaveTextContent('전달 준비됨');
    expect(card).toHaveTextContent('에이전트 전달 판단');
    expect(screen.getByTestId('sigma-selected-edge-next-action')).toHaveTextContent(
      '권장 다음 작업',
    );
    const primary = screen.getByRole('button', { name: /관계 설명 복사/ });
    expect(primary).toHaveAttribute('data-copy-recommendation-label', '권장 다음 작업');
    expect(primary).toHaveAccessibleName('관계 설명 복사 · 권장 다음 작업');
    expect(card).toHaveTextContent('온톨로지 핸들');
    expect(card).toHaveTextContent('MCP 페이로드');
    expect(screen.getByTestId('sigma-selected-edge-copy-payload')).toHaveAttribute(
      'data-cli-fallback-command',
      "ontology-atlas explain 'domain:views' 'capability:topology-analysis-modes' [vault] --type 'contains'",
    );
    expect(
      screen
        .getByTestId('sigma-selected-edge-copy-payload')
        .querySelector('[data-cli-fallback-summary]'),
    ).toHaveClass('sr-only');
    expect(card).not.toHaveTextContent('Agent gate');
    expect(card).not.toHaveTextContent('Agent handoff');
    expect(card).not.toHaveTextContent('handoff 준비됨');
    expect(card).not.toHaveTextContent('Ontology handles');
    expect(card).not.toHaveTextContent('MCP payload');
    expect(card).not.toHaveTextContent('CLI fallback');
    expect(card).toHaveAttribute('data-agent-gate-kind', 'handoff-ready');
    expect(screen.getByTestId('sigma-selected-edge-handle-strip')).toHaveClass('sr-only');
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
  it('docks the selected relation card to a tokenized compact right rail', () => {
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain(
      'right-[var(--topology-selected-relation-card-inset)]',
    );
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain(
      'top-[var(--topology-selected-relation-card-top)]',
    );
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).toContain(
      'lg:w-[var(--topology-selected-relation-card-width)]',
    );
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).not.toContain('lg:left-[');
    expect(SELECTED_EDGE_CARD_DOCK_CLASS).not.toContain('lg:right-auto');
  });
});
