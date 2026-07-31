import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { dogfoodVaultCensus } from '../../scripts/lib/vault-census.mjs';

/**
 * 도그푸드 볼트 노드 수는 **사용자가 읽는 문장 안에 있을 수 있다.**
 *
 * `mapEntry.demoNote` 는 지도 진입 라우트가 하이드레이트되기 전 서버가 굽는
 * 문장이고, README·런치 자산이 가리키는 데모 주소에서 크롤러와 링크 미리보기가
 * 보는 유일한 본문이다.
 *
 * ## 요구는 걷고, 거짓말 금지는 남긴다 (2026-08-01)
 *
 * 이 게이트는 원래 그 문장이 노드 수를 **적고 있으라고 강제**했다. 그게 정확히
 * 이 저장소가 스스로 경계하는 썩음을 만들었다 — 노드는 아무나 더하는데 카피는
 * 사람이 두 로케일을 손으로 고쳐야 하니, 게이트가 사람에게 잡일을 시키는 장치가
 * 됐다. 볼트를 규격 기준으로 재생성하자 그 비용이 즉시 청구됐다: 볼트를 비우는
 * 순간 CI 가 빨개졌는데 **틀린 것은 카피가 아니라 게이트였다.**
 *
 * `src/shared/lib/launch-docs-current.test.ts` 가 문서 쪽에서 먼저 받은 수술을
 * 여기 카피 쪽에도 적용한다: **수를 말할 의무는 없애고, 말하기로 했다면 맞아야
 * 한다는 것만 남긴다.** 그래서 아래 검사는 "수가 있으면 볼트와 같은가" 이지
 * "수가 있는가" 가 아니다.
 *
 * 원래의 위험은 그대로 막힌다. 문장이 97 인데 볼트가 98 이던 상태(브랜드 자산
 * 노드가 더해진 날 실제로 그랬다)는 여전히 빨간불이다 — 사라진 것은 «반드시
 * 세어라» 뿐이고 «틀리게 세지 마라» 는 남았다.
 *
 * "지도가 자기 자신을 정확히 센다" 는 이 제품의 주장 자체라서, 여기서 틀린 수는
 * 오타가 아니라 **신뢰 비용**이다.
 *
 * ## 무엇을 세는가
 *
 * `scripts/lib/vault-census.mjs` 의 `dogfoodVaultCensus` — 런치 문서 게이트
 * (`src/shared/lib/launch-docs-current.test.ts`)가 쓰는 것과 **같은 계수기**다.
 * 세는 방법을 여기서 다시 구현하면 두 게이트가 서로 다른 수를 참이라 주장하게
 * 된다. 이 게이트가 덮는 곳이 다를 뿐이다 — 저쪽은 문서, 이쪽은 **앱이 화면에
 * 렌더하는 카피**다.
 *
 * 카피가 "도메인 · 역량 · 요소" 만 나열하지만 수는 그래프 전체를 가리킨다(그
 * 셋에 프로젝트·문서를 더한 것이라, 사람에게는 대표적인 셋만 부르는 편이 읽힌다).
 */

describe('도그푸드 노드 수 — 화면 문장이 수를 말한다면 볼트와 같다', () => {
  const count: number = dogfoodVaultCensus(process.cwd()).total;

  it.each([
    ['en', en.mapEntry.demoNote],
    ['ko', ko.mapEntry.demoNote],
  ])('%s 데모 문장이 낡은 노드 수를 말하지 않는다', (locale, copy) => {
    // 「노드/개」 를 달고 있는 수만 본다. 그 문장에 우연히 들어간 다른 수(연도,
    // 버전)까지 볼트 크기라고 우기면 게이트가 다시 잡일 장치가 된다.
    const claimed = [...copy.matchAll(/(\d+)\s*(?:nodes?\b|노드|개)/g)].map((m) => Number(m[1]));
    const stale = claimed.filter((n) => n !== count);
    expect(
      stale,
      `${locale} demoNote 가 볼트의 ${count}개와 다른 수를 말한다: "${copy}"`,
    ).toEqual([]);
  });

  it('볼트가 실제로 세어진다 — 계수기가 죽으면 위 검사가 조용히 통과한다', () => {
    // 수를 **말하라고 요구하지 않는다.** 다만 계수기 자체가 0 을 돌려주면 위
    // 검사는 어떤 카피에도 통과하므로, 계수기가 살아 있다는 것만 확인한다.
    expect(count).toBeGreaterThan(0);
  });
});
