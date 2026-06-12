import { describe, expect, it } from 'vitest';
import {
  kindLabel,
  relationAgentGateLabel,
  relationClaimLensText,
  relationEvidenceLabel,
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

describe('relationAgentGateLabel — agent handoff gate', () => {
  const gateLabels = {
    handoffReady: 'HANDOFF READY',
    preflightFirst: 'PREFLIGHT FIRST',
    reviewFirst: 'REVIEW FIRST',
  };

  it('strong/supported 관계가 근거를 가지면 handoff ready 로 보낸다', () => {
    expect(
      relationAgentGateLabel({ relationQuality: 'strong', evidenceCount: 1 }, gateLabels),
    ).toBe('HANDOFF READY');
    expect(
      relationAgentGateLabel({ relationQuality: 'supported', authored: true }, gateLabels),
    ).toBe('HANDOFF READY');
  });

  it('weak 관계는 agent handoff 전에 relation_check 를 요구한다', () => {
    expect(
      relationAgentGateLabel({ relationQuality: 'weak', evidenceCount: 2 }, gateLabels),
    ).toBe('PREFLIGHT FIRST');
  });

  it('review 관계나 근거 없는 관계는 사람이 먼저 검토해야 한다', () => {
    expect(
      relationAgentGateLabel({ relationQuality: 'review', evidenceCount: 1 }, gateLabels),
    ).toBe('REVIEW FIRST');
    expect(relationAgentGateLabel({}, gateLabels)).toBe('REVIEW FIRST');
  });
});
