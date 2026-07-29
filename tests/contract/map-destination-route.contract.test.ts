import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **지도로 보내겠다고 말하는 링크는 지도 주소를 가리켜야 한다.**
 *
 * ## 왜 이 게이트가 생겼나
 *
 * 2026-07-29 소유자 결정으로 `/` 는 **마케팅 페이지**가 된다(원장 참고 —
 * 2026-07 「root-first-open」의 뒤집기). 그 전까지 `/` 와 `/topology` 는 **같은
 * 화면**이었고, 그래서 지도로 보내는 링크가 둘 중 아무 쪽을 가리켜도 아무도
 * 몰랐다.
 *
 * 전환 직전 실측에서 그 무차별이 **세 개의 죽은 약속**으로 드러났다:
 *
 * | 라벨 | 가리키던 곳 | 전환 후 |
 * |---|---|---|
 * | 「지도로 돌아가기」 | `/` | 마케팅으로 감 |
 * | 「설치 없이 브라우저에서 써보기」 | `/` | 마케팅으로 감 |
 * | 〃 (미게시 분기) | `/` | 마케팅으로 감 |
 *
 * 두 번째가 특히 나쁘다 — 소유자가 마케팅 페이지의 일을 *"다운로드 유도하거나
 * 웹버전 이동"* 이라고 정의했는데, 그 「웹버전 이동」 버튼이 **마케팅으로
 * 되돌아오는 고리**가 된다.
 *
 * ## 왜 lint 가 아니라 계약 테스트인가
 *
 * 판정에 **라벨과 목적지를 함께** 봐야 한다. `href="/"` 자체는 결함이 아니다 —
 * 로고와 404 의 「홈으로」는 그대로 `/` 가 맞다. 결함은 *"지도"* 라고 말해 놓고
 * `/` 로 보내는 것이고, 그 판정은 한 AST 노드에 안 담긴다.
 *
 * ## 이 게이트가 지키지 않는 것
 *
 * 홈으로 가는 링크(로고 · 에러 페이지 · breadcrumb)는 대상이 아니다. 마케팅
 * 페이지가 홈인 것이 맞고, 그 링크들은 지도를 약속한 적이 없다.
 */

const MAP_ROUTE = "/topology";

/**
 * 지도를 약속하는 컨트롤의 testid 와, 그 약속의 근거가 되는 메시지 키.
 *
 * **testid 로 지목하는 이유**: 라벨 문자열로 찾으면 문구를 고칠 때마다 게이트가
 * 눈이 먼다 — 오늘 낮에 `check-hosted-download-surface` 가 정확히 그렇게
 * 무장 해제됐다(카피 키가 리네임되자 `String.includes(undefined)` 가
 * `"undefined"` 를 찾으며 초록으로 통과). testid 는 컨트롤의 신원이라 문구와
 * 독립적이다.
 */
const MAP_DESTINED = [
  { testid: "download-web-cta", why: "「설치 없이 브라우저에서 써보기」 — 웹 제품을 여는 버튼" },
  { testid: "download-back-to-map", why: "「지도로 돌아가기」 — GNB 의 되돌아가기" },
] as const;

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/**
 * `data-testid="X"` 가 달린 JSX 원소가 같은 여는 태그 안에서 쓰는 `href` 를
 * 뽑는다. 속성 순서는 자유이므로 태그 전체를 잡고 그 안에서 찾는다.
 */
function hrefForTestid(source: string, testid: string): string[] {
  const found: string[] = [];
  const marker = `data-testid="${testid}"`;
  let cursor = source.indexOf(marker);
  while (cursor !== -1) {
    // 여는 태그의 시작(`<`)과 끝(`>`)을 찾아 그 구간만 본다.
    const open = source.lastIndexOf("<", cursor);
    const close = source.indexOf(">", cursor);
    const tag = source.slice(open, close === -1 ? source.length : close);
    const match = /href=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/.exec(tag);
    if (match) found.push(match[1] ?? match[2] ?? match[3] ?? "");
    cursor = source.indexOf(marker, cursor + marker.length);
  }
  return found;
}

describe("지도를 약속하는 링크의 목적지", () => {
  const source = readSource("src/views/download/ui/DownloadPage.tsx");

  for (const { testid, why } of MAP_DESTINED) {
    it(`${testid} 는 ${MAP_ROUTE} 로 간다 — ${why}`, () => {
      const hrefs = hrefForTestid(source, testid);

      expect(
        hrefs.length,
        `${testid} 를 가진 링크를 못 찾았다. testid 가 사라졌거나 이름이 바뀌었다면 ` +
          `이 게이트도 함께 갱신해야 한다 — 조용히 통과시키지 않는다.`,
      ).toBeGreaterThan(0);

      for (const href of hrefs) {
        expect(
          href,
          `${testid} 가 "${href}" 를 가리킨다. \`/\` 는 2026-07-29 부터 마케팅 ` +
            `페이지다 — 지도를 약속한 컨트롤이 그리로 가면 사용자는 방금 떠난 ` +
            `화면으로 되돌아온다. 지도는 ${MAP_ROUTE} 다.`,
        ).toBe(MAP_ROUTE);
      }
    });
  }

  /**
   * 탐지기가 스스로 무장 해제하지 않는지 본다 — 오늘 낮의 사고와 같은 종류를
   * 이 파일에서 미리 막는다. 추출기가 고장 나면 `hrefs.length` 가 0이 되어 위
   * 시험이 "못 찾았다" 로 실패하는데, 그 실패가 **정상 동작**임을 여기서 증명한다.
   */
  it("추출기가 실제로 href 를 읽는다 (탐지기 무장 확인)", () => {
    const probe = `
      <Link href="/" data-testid="probe-root">홈</Link>
      <Link data-testid="probe-map" href="/topology">지도</Link>
    `;
    expect(hrefForTestid(probe, "probe-root")).toEqual(["/"]);
    expect(hrefForTestid(probe, "probe-map")).toEqual(["/topology"]);
    expect(hrefForTestid(probe, "probe-absent")).toEqual([]);
  });
});
