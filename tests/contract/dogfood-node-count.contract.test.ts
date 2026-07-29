import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { dogfoodVaultCensus } from '../../scripts/lib/vault-census.mjs';

/**
 * 도그푸드 볼트 노드 수는 **사용자가 읽는 문장 안에 있다.**
 *
 * `mapEntry.demoNote` 는 지도 진입 라우트가 하이드레이트되기 전 서버가 굽는
 * 문장이고, README·런치 자산이 가리키는 데모 주소에서 크롤러와 링크 미리보기가
 * 보는 유일한 본문이다. 그 문장이 "자기 자신을 서술한 그래프 N개" 라고 말한다.
 *
 * ## 왜 게이트가 필요한가
 *
 * 이 숫자는 **볼트에 노드를 하나 더할 때마다 틀려진다**. 실제로 그렇게 됐다 —
 * 브랜드 자산 파이프라인 노드를 더하는 순간 97 이 98 이 됐는데, 문장은 97 인 채
 * 남았고 어떤 타입 검사·lint·테스트도 그것을 볼 수 없었다. 볼트 파일을 세는 일과
 * 카피를 고치는 일 사이에 아무 연결이 없었기 때문이다.
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

describe('도그푸드 노드 수 — 화면 문장이 실제 볼트와 같다', () => {
  const count: number = dogfoodVaultCensus(process.cwd()).total;

  it.each([
    ['en', en.mapEntry.demoNote],
    ['ko', ko.mapEntry.demoNote],
  ])('%s 데모 문장의 수가 볼트의 노드 수와 같다', (locale, copy) => {
    const found = copy.match(/\d+/g)?.map(Number) ?? [];
    expect(
      found,
      `${locale} demoNote 가 볼트의 ${count}개와 다른 수를 말한다: "${copy}"`,
    ).toContain(count);
  });

  /** 수가 하나도 없으면 위 테스트가 조용히 통과할 수 없어야 한다. */
  it('두 로케일 모두 수를 실제로 말한다', () => {
    expect(en.mapEntry.demoNote).toMatch(/\d/);
    expect(ko.mapEntry.demoNote).toMatch(/\d/);
    expect(count).toBeGreaterThan(0);
  });
});
