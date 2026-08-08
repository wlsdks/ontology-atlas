import { defaultUrlTransform } from 'react-markdown';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * **위키링크 센티넬은 URL 스킴이면 안 된다** — 마크다운 렌더러가 지운다.
 *
 * ## 무엇이 났나 (2026-08-08 실측)
 *
 * 뷰어는 `[[슬러그|이름]]` 을 표준 마크다운 링크
 * `[이름](WIKILINK:슬러그)` 로 바꿔 놓고, `a` 컴포넌트에서 `WIKILINK:` 접두사를
 * 잡아 내부 라우팅으로 보냈다. 설계는 말이 되는데 **한 층을 빼먹었다**:
 *
 * `react-markdown` 은 URL 을 살균한다(`defaultUrlTransform`). 허용 목록은
 * http · https · mailto · xmpp · irc 류이고, **모르는 스킴은 빈 문자열로
 * 만든다.** 실측:
 *
 * ```
 * defaultUrlTransform('WIKILINK:capabilities/x') === ''
 * ```
 *
 * 그래서 `href` 가 비고, `a` 컴포넌트의 첫 줄
 * (`if (!href) return <span>{children}</span>`)이 링크 대신 **아무 표시 없는
 * 평문 span** 을 돌려줬다. 화면에서는 글자만 보인다 — 링크도 아니고, 「이 슬러그
 * 못 찾음」 점선 표시도 아니다. **두 실패가 한 그림이었다.**
 *
 * ## 왜 아무도 못 봤나
 *
 * 도그푸드 볼트의 본문 위키링크가 **0개**였다(2026-08-08 전수). 아무도 그
 * 경로를 지나가지 않았으므로 깨진 채로 남았다. 배포 샘플에도 없다. 즉 이
 * 기능은 «있다고 적혀 있고, 코드도 있고, 한 번도 동작한 적 없는» 부류였다.
 *
 * 에디터의 `@` 멘션이 본문에 위키링크를 넣기 시작하면서 처음으로 그 경로를
 * 밟았고, 그때 드러났다.
 *
 * ## 이 게이트가 잠그는 성질
 *
 * *위키링크가 만드는 URL 은 렌더러의 살균을 통과한다.* 구현이 센티넬을
 * 어떻게 짜든 상관없다 — 스킴 모양이든, 쿼리든, 데이터 속성이든. 다만 그것이
 * **살균 뒤에도 살아 있어야** 한다. 그리고 살균 함수는 우리 것이 아니라
 * 라이브러리 것이라, 버전이 올라가며 허용 목록이 바뀌어도 여기서 먼저 터진다.
 */

const VIEWER = 'src/widgets/docs-vault/ui/DocsVaultViewer.tsx';

describe('위키링크 URL 은 마크다운 렌더러의 살균을 통과한다', () => {
  /** 뷰어가 실제로 쓰는 센티넬 접두사를 소스에서 읽는다 — 여기 베끼지 않는다. */
  const sentinel = (() => {
    const source = readFileSync(VIEWER, 'utf8');
    const match = source.match(/const WIKILINK_SENTINEL = '([^']+)';/);
    return match?.[1] ?? null;
  })();

  it('뷰어가 센티넬 접두사를 갖고 있다 — 못 찾으면 이 시험이 공회전한다', () => {
    expect(sentinel, '뷰어에서 위키링크 센티넬을 못 찾았다 — 게이트가 낡았다').toBeTruthy();
  });

  it('그 센티넬이 붙은 URL 이 살균 뒤에도 남는다', () => {
    const url = `${sentinel}capabilities/example`;
    expect(
      defaultUrlTransform(url),
      `react-markdown 이 "${url}" 를 지운다 — href 가 비면 뷰어의 a 컴포넌트가 ` +
        '링크도 「못 찾음」 표시도 아닌 **아무 표시 없는 평문**을 돌려준다. ' +
        '스킴 모양(`X:`)은 허용 목록 밖이면 통째로 잘린다 — 쿼리나 경로 모양을 쓰라.',
    ).not.toBe('');
  });

  it('한글 슬러그도 살아남는다 — 볼트 슬러그는 한글일 수 있다', () => {
    const url = `${sentinel}capabilities/스윕-검증-절차`;
    expect(defaultUrlTransform(url)).not.toBe('');
  });

  /**
   * 공회전 차단의 반대 방향 — 이 검사가 «무엇이든 통과» 시키고 있지 않은지.
   * 실제로 잘리는 값을 하나 넣어, 살균이 살아 있다는 것부터 확인한다.
   */
  it('계기가 살아 있다 — 정말 잘리는 스킴은 빈 값이 된다', () => {
    expect(defaultUrlTransform('javascript:alert(1)')).toBe('');
    expect(defaultUrlTransform('WIKILINK:capabilities/x')).toBe('');
  });
});

/**
 * **두 번째 층 — 파서가 URL 을 퍼센트 인코딩한다.**
 *
 * 살균을 통과시킨 뒤에도 한글 위키링크는 전부 「폴더에 없는 링크」 점선으로
 * 떨어졌다. 실측: 뷰어의 `a` 컴포넌트에 도착한 값이
 * `capabilities/%EC%8A%A4%EC%9C%95-…`(69자)였다 — 마크다운 파서가 인코딩해서
 * 넘긴 것이다. 볼트 슬러그 집합에는 디코드된 형태(21자)만 있으므로 안 맞는다.
 *
 * **영문 슬러그는 인코딩할 것이 없어 멀쩡했다.** 그래서 이 결함은 한글(또는
 * 공백·비ASCII) 슬러그를 쓰는 볼트에서만 보인다 — 우리 샘플이 영문이라
 * 아무도 못 봤다. 이 게이트가 그 사각을 지킨다.
 */
describe('위키링크 해소는 퍼센트 인코딩과 정규화를 견딘다', () => {
  const source = readFileSync(VIEWER, 'utf8');

  it('뷰어가 슬러그를 디코드한다', () => {
    expect(
      source,
      '파서가 URL 을 퍼센트 인코딩해서 넘기므로, 디코드 없이 슬러그 집합과 ' +
        '비교하면 비ASCII 슬러그가 전부 「없는 링크」가 된다.',
    ).toMatch(/decodeURIComponent/);
  });

  it('뷰어가 NFC 로 맞춘다 — 글자는 같은데 문자열이 다른 상태를 없앤다', () => {
    expect(source).toMatch(/normalize\('NFC'\)/);
  });

  it('디코드 실패가 문서를 죽이지 않는다 — 잘린 퍼센트 시퀀스는 원문으로 둔다', () => {
    // `decodeURIComponent('%')` 는 던진다. 뷰어가 그것을 잡아야 한다.
    expect(() => decodeURIComponent('%')).toThrow();
    expect(source, 'decodeURIComponent 를 try 없이 부르면 문서 하나가 통째로 안 그려진다').toMatch(
      /try \{[\s\S]{0,200}decodeURIComponent/,
    );
  });
});
