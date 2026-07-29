import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * **스크롤하는 문서 안의 지도는 페이지의 휠을 삼키면 안 된다.**
 *
 * 2026-07-28 모션석 실측이 잡은 P0: `/download` 의 캔버스가 뷰포트의 **62.1%**
 * 인데 휠 핸들러가 어떤 가드보다 먼저 무조건 `preventDefault()` 를 불렀다.
 * 리스너는 `{ passive: false }` 로 붙으므로, **랜딩에 착지한 방문자가 가장
 * 먼저 하는 행동(스크롤)이 아무것도 하지 않고 지도만 줌됐다.** 접힘 아래에
 * 판매 논증 전부(논지 · 사람/에이전트 두 열 · 검증)가 있는데 거기 도달할
 * 수 없었다. `touch-action: none` 이라 폰에서는 더 나빴다.
 *
 * 원인은 버그가 아니라 **전제의 유출**이다 — 워크벤치에서는 지도가 화면
 * 전체이고 스크롤할 페이지가 없으므로 그 줄이 옳다. 그 결정이 전제가 성립하지
 * 않는 표면으로 새어 나갔다. 저장소가 공방 폭 게이트에서 이미 이름 붙인
 * 실패 패턴이다.
 *
 * ## 왜 계약 테스트인가 (lint 가 못 보는 층)
 *
 * 결함이 **한 줄의 존재**가 아니라 **두 줄의 순서**다 — `preventDefault()` 가
 * 조기 반환보다 앞에 있느냐. `no-restricted-syntax` 는 셀렉터 하나로 "이
 * 호출이 저 가드보다 뒤에 있는가" 를 물을 수 없다. 그리고 렌더 결과에는
 * 리터럴이 남지 않아 값 검사의 시야 밖이다(정확히 이 저장소가 "값은 맞는데
 * 안 걸리는 것들" 로 분류해 둔 층).
 */
describe('wheel intent — 스크롤하는 문서 안의 지도', () => {
  const handlers = read('src/widgets/topology-map-v2/ui/topology-pointer-handlers.ts');

  it('page-scroll 의도에서는 preventDefault 보다 먼저 빠져나간다', () => {
    const start = handlers.indexOf('const handleWheel');
    expect(start).toBeGreaterThan(-1);
    const body = handlers.slice(start, start + 900);

    const bail = body.indexOf('wheelIntent === "page-scroll"');
    const prevent = body.indexOf('e.preventDefault()');

    expect(bail).toBeGreaterThan(-1);
    expect(prevent).toBeGreaterThan(-1);
    // 순서가 이 계약의 전부다. 뒤집히면 트랩이 그대로 돌아온다.
    expect(bail).toBeLessThan(prevent);
  });

  it('명시적 핀치는 여전히 줌이다 — 평 휠만 페이지에 양보한다', () => {
    const start = handlers.indexOf('const handleWheel');
    const body = handlers.slice(start, start + 900);
    // `!e.ctrlKey` 가 빠지면 관문에서 줌이 통째로 죽는다(반대 방향 회귀).
    expect(body).toMatch(/wheelIntent === "page-scroll" && !e\.ctrlKey/);
  });

  it('세로 스와이프도 같은 계약을 탄다 — touch-action 이 의도를 따라간다', () => {
    const widget = read('src/widgets/topology-map-v2/ui/TopologyMapV2.tsx');
    // `none` 은 세로 스와이프까지 삼켜서 폰에서 페이지가 아예 안 움직인다.
    expect(widget).toMatch(/wheelIntent === "page-scroll" \? "pan-y" : "none"/);
  });

  it('워크벤치는 기본값으로 현행 동작을 유지한다', () => {
    expect(handlers).toMatch(/wheelIntent = "zoom"/);
    const widget = read('src/widgets/topology-map-v2/ui/TopologyMapV2.tsx');
    expect(widget).toMatch(/wheelIntent = "zoom"/);
  });

  it('관문만 page-scroll 을 옵트인한다', () => {
    const stage = read('src/views/download/ui/StageMap.tsx');
    expect(stage).toMatch(/wheelIntent="page-scroll"/);

    // 워크벤치(HomePage)는 넘기지 않는다 — 넘기면 지도 줌이 죽는다.
    const home = read('src/views/home/ui/HomePage.tsx');
    expect(home).not.toMatch(/wheelIntent/);
  });
});
