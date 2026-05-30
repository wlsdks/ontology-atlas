import { describe, expect, it } from 'vitest';
import {
  HUB_LABEL_RATIO,
  NODE_LABEL_RATIO,
  isTopologyLabelAnchor,
  shouldCullLabelAtZoom,
} from './label-lod';

/**
 * 라벨 LOD(level-of-detail) 정책 — 줌아웃 시 라벨 밀집 방지.
 *
 * graph-build 가 도메인 + 고차수(≥5) ontology 노드를 forceLabel 랜드마크로
 * 승격("어디가 hub-like 인지 한 눈에 — fingerprint")하는데, 이전 reducer 는
 * `attrs.isHub`(프로젝트 허브 전용, ontology 노드엔 false)만 봐서 그 랜드마크를
 * 일반 노드 ratio(0.28)로 일찍 솎아내 graph-build 의 의도를 무력화했다.
 * 이 helper 는 두 surface 의 정책을 한 곳으로 모아(테스트 가능) 랜드마크를
 * 프로젝트 허브와 동일하게 다룬다(anchor ratio 0.55).
 */

describe('isTopologyLabelAnchor', () => {
  it('프로젝트 허브는 anchor', () => {
    expect(isTopologyLabelAnchor({ isHub: true })).toBe(true);
  });

  it('graph-build 가 forceLabel 한 ontology 랜드마크(도메인/고차수)는 anchor', () => {
    expect(isTopologyLabelAnchor({ forceLabel: true })).toBe(true);
  });

  it('일반 노드/leaf(둘 다 아님)는 anchor 아님', () => {
    expect(isTopologyLabelAnchor({})).toBe(false);
    expect(isTopologyLabelAnchor({ isHub: false, forceLabel: false })).toBe(false);
  });
});

describe('shouldCullLabelAtZoom', () => {
  it('anchor 는 HUB_LABEL_RATIO(0.55) 까지 라벨 유지, 초과 시 솎음', () => {
    expect(shouldCullLabelAtZoom(true, 0.5)).toBe(false);
    expect(shouldCullLabelAtZoom(true, HUB_LABEL_RATIO)).toBe(false);
    expect(shouldCullLabelAtZoom(true, 0.6)).toBe(true);
  });

  it('비-anchor 는 NODE_LABEL_RATIO(0.28) 까지만 유지 — 랜드마크보다 먼저 솎임', () => {
    expect(shouldCullLabelAtZoom(false, 0.2)).toBe(false);
    expect(shouldCullLabelAtZoom(false, NODE_LABEL_RATIO)).toBe(false);
    expect(shouldCullLabelAtZoom(false, 0.3)).toBe(true);
  });

  it('mid-zoom(0.28< ratio ≤0.55): anchor 는 유지, 비-anchor 는 솎임 — 랜드마크 fingerprint', () => {
    const ratio = 0.45;
    expect(shouldCullLabelAtZoom(true, ratio)).toBe(false);
    expect(shouldCullLabelAtZoom(false, ratio)).toBe(true);
  });
});
