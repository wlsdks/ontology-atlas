import { describe, expect, it } from 'vitest';
import {
  HUB_LABEL_RATIO,
  NODE_LABEL_RATIO,
  OVERVIEW_LANDMARK_MAX,
  isOverviewLandmark,
  isTopologyLabelAnchor,
  pickOverviewLandmarks,
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

describe('pickOverviewLandmarks — overview 에서 항상 라벨할 최상위 N개', () => {
  it('degree 내림차순 top N(OVERVIEW_LANDMARK_MAX)만 선택', () => {
    const entries = [
      { id: 'a', degree: 90 },
      { id: 'b', degree: 80 },
      { id: 'c', degree: 30 },
      { id: 'd', degree: 20 },
      { id: 'e', degree: 10 },
      { id: 'f', degree: 5 },
      { id: 'g', degree: 3 },
    ];
    const out = pickOverviewLandmarks(entries, 5);
    expect(out).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
    expect(out.size).toBe(5);
  });

  it('degree 0(orphan)은 제외 — 랜드마크 자격 없음', () => {
    const entries = [
      { id: 'a', degree: 4 },
      { id: 'orphan', degree: 0 },
      { id: 'b', degree: 2 },
    ];
    const out = pickOverviewLandmarks(entries, 5);
    expect(out.has('orphan')).toBe(false);
    expect(out).toEqual(new Set(['a', 'b']));
  });

  it('동률 degree 는 id 오름차순 tie-break — 결정적', () => {
    const entries = [
      { id: 'z', degree: 10 },
      { id: 'a', degree: 10 },
      { id: 'm', degree: 10 },
    ];
    // max 2 → degree 동률이라 id 사전순 a, m 선택(z 탈락)
    expect(pickOverviewLandmarks(entries, 2)).toEqual(new Set(['a', 'm']));
  });

  it('후보가 N 미만이면 있는 만큼만', () => {
    expect(pickOverviewLandmarks([{ id: 'a', degree: 3 }], 5)).toEqual(new Set(['a']));
    expect(pickOverviewLandmarks([], 5)).toEqual(new Set());
  });

  it('OVERVIEW_LANDMARK_MAX 는 작은 양의 정수(overview clutter 방지)', () => {
    expect(Number.isInteger(OVERVIEW_LANDMARK_MAX)).toBe(true);
    expect(OVERVIEW_LANDMARK_MAX).toBeGreaterThan(0);
    expect(OVERVIEW_LANDMARK_MAX).toBeLessThanOrEqual(8);
  });
});

describe('isOverviewLandmark', () => {
  it('overviewLandmark 플래그 노드는 true — 줌 무관 항상 라벨', () => {
    expect(isOverviewLandmark({ overviewLandmark: true })).toBe(true);
  });
  it('플래그 없거나 false 면 false', () => {
    expect(isOverviewLandmark({})).toBe(false);
    expect(isOverviewLandmark({ overviewLandmark: false })).toBe(false);
  });
});
