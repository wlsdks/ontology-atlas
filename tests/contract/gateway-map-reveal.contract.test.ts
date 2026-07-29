import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * **관문 지도는 도착해야 한다 — 나타나면 안 된다.**
 *
 * 이 페이지의 유일한 판매 논증은 "이건 그림이 아니라 살아 있는 엔진" 이다.
 * 그 논증은 첫 프레임에서 증명되거나 첫 프레임에서 무너진다.
 *
 * 엔진에는 이미 도착 안무가 있다 — `use-topology-loop.ts` 의 P3d(E1): 전
 * 노드가 project 노드 홈에 모였다가 호밍 스프링(임계감쇠 · reduced-motion
 * 스냅 내장)으로 제자리에 정착한다. 신규 모션 계약이 0인 기존 기제다.
 *
 * ⚠️ 그런데 `StageMap` 이 `revealToken={1}` 을 **상수로** 넘기는 동안 그
 * 안무는 **한 번도 발화한 적이 없었다.** 엔진의 비교 기준
 * (`lastRevealTokenRef`)이 0 으로 시작하므로 첫 마운트가 그 증가를 그대로
 * 삼킨다 — 그 파일 자신의 주석이 경고해 둔 패턴이다. 실측(2026-07-29,
 * rAF 픽셀 diff): 캔버스가 **1프레임 하드컷**으로 완성된 지도를 내놓았다.
 *
 * 수리 후 실측: 비영 diff 453프레임 / 3775ms, 앞 1/3 평균 161.1 → 뒤 1/3
 * 평균 3.7 (단조 감쇠). reduced-motion 에서는 1프레임 · 창 0ms (스냅).
 *
 * ## 왜 소스 계약인가
 *
 * 이 결함은 **값이 맞는데 안 걸리는 층**의 교과서 사례다 — 상수 `1` 은 타입도
 * 맞고 lint 도 통과하며 렌더 결과에 리터럴을 남기지 않는다. 화면에서만 죽어
 * 있었다. 픽셀 시계열로 재는 것이 가장 정확하지만 그건 e2e 비용이고, 회귀의
 * **형태**는 하나로 좁혀진다: 토큰을 리터럴로 고정하는 것. 그 형태를 막는다.
 */
/**
 * 주석을 걷어낸 **코드만** 본다 — 이 파일과 소스가 둘 다 `revealToken={1}` 을
 * 회귀 사례로 **인용**하기 때문이다. 인용을 위반으로 세면 탐지기가 자기
 * 문서에 걸려 무력화된다(라벨 장식 게이트가 글리프가 아니라 위치로 판별하는
 * 것과 같은 이유).
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('관문 지도의 도착 안무', () => {
  const stage = codeOnly(read('src/views/download/ui/StageMap.tsx'));

  it('revealToken 을 리터럴로 고정하지 않는다', () => {
    // `revealToken={1}` / `revealToken={0}` 같은 상수는 마운트가 삼킨다.
    expect(stage).not.toMatch(/revealToken=\{\s*\d+\s*\}/);
    expect(stage).toMatch(/revealToken=\{revealToken\}/);
  });

  it('0 에서 시작해 마운트 뒤에 올린다', () => {
    // 0 초기값이 핵심 — 현재 prop 으로 초기화하면 엔진이 전이를 못 본다.
    expect(stage).toMatch(/useState\(0\)/);
    // 같은 프레임에 올리면 마운트가 다시 삼키므로 한 틱 미룬다.
    expect(stage).toMatch(/requestAnimationFrame\(/);
    expect(stage).toMatch(/setRevealToken\(1\)/);
  });

  it('엔진 쪽 안무는 여전히 살아 있다', () => {
    const loop = codeOnly(read('src/widgets/topology-map-v2/ui/use-topology-loop.ts'));
    // 비교 기준이 0 으로 시작한다는 것이 위 계약의 전제다.
    expect(loop).toMatch(/lastRevealTokenRef = useRef\(0\)/);
    // 출발점은 project 노드 홈 — 방사 스프링의 자연 호가 직선 비행을 막는다.
    expect(loop).toMatch(/homingActiveRef\.current = true/);
  });
});
