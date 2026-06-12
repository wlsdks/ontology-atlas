import { describe, expect, it } from 'vitest';
import { kindLabel, relationQualityLabel } from './SigmaEdgeTooltip';

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
