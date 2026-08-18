import { readdirSync, readFileSync } from "node:fs";
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
  { testid: "gateway-hero-web-cta", why: "히어로의 「브라우저에서 열기」 — 웹 제품을 여는 버튼" },
  /*
   * ⚠️ `download-web-cta` 는 **2026-08-19 에 컨트롤 자체가 사라졌다** — 소유자가
   * 설치 절(다운로드 판)을 통째로 걷어냈다(*"맨 마지막 이거는 없어도 될듯?
   * 어차피 맨 위에 다 있어서"*). 같은 약속을 지금 지는 것은 히어로의 웹 CTA 다.
   */
  /*
   * ⚠️ `download-back-to-map` 은 **2026-07-31 에 컨트롤 자체가 사라졌다**
   * (소유자: *"이건 홍보 페이지라 메인 화면에서만 이동 가능하게"*). 관문 크롬에
   * 워크벤치로 가는 길을 두면 아직 볼트가 없는 방문자에게 작업 표면을 권하게
   * 되고, 볼트가 있는 사람은 애초에 `/` 에서 지도로 간다.
   *
   * 목록에서 지우는 것이 **게이트를 약화시키지 않는다** — 이 게이트가 지키는
   * 명제는 "지도를 약속한 컨트롤은 지도로 간다" 이지 "그 컨트롤이 존재한다" 가
   * 아니다. 없는 약속은 어길 수도 없다. 남은 하나가 그 명제를 계속 진다.
   *
   * 반대로 **컨트롤을 되살리면 여기 한 줄을 되돌려야 한다.** 안 되돌리면 그
   * 링크만 감시 밖에 서고, 그게 이 파일이 애초에 막으려던 형태다.
   */
] as const;

/**
 * 관문 크롬의 소스를 **파일 위치에 의존하지 않고** 모은다.
 *
 * ⚠️ 예전엔 `src/views/download/ui/DownloadPage.tsx` 한 파일만 읽었다. 2026-07-30
 * 에 GNB 가 `widgets/gateway-chrome` 로 내려가자(`/guide`·`/changelog` 가 같은
 * 크롬을 쓰게 되면서) **그 파일에서 testid 가 사라져 게이트가 눈이 멀었다** —
 * 다행히 "못 찾았다" 단언이 있어 초록으로 새지 않고 빨갛게 터졌다. 그 단언이
 * 없었으면 조용히 통과했을 것이다.
 *
 * 교훈은 게이트의 **조준을 경로에 묶지 않는 것**이다. 컨트롤은 리팩터링으로
 * 움직이지만 testid 는 신원이라 안 움직인다. 그래서 `src/` 를 훑어 마커를 가진
 * 파일만 모은다 — 다음에 또 옮겨도 게이트는 따라간다.
 */
function collectSources(): string {
  const roots = [join(process.cwd(), "src")];
  const chunks: string[] = [];
  let scanned = 0;
  while (roots.length) {
    const dir = roots.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        roots.push(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        scanned += 1;
        const text = readFileSync(full, "utf8");
        if (text.includes("data-testid=")) chunks.push(text);
      }
    }
  }
  // 파서가 죽으면 "위반 0" 이 아니라 여기서 먼저 터진다.
  if (scanned < 200) throw new Error(`소스 스캔이 ${scanned}개에서 멈췄다 — 순회가 깨졌다`);
  return chunks.join("\n");
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
  const source = collectSources();

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

/**
 * **등록을 기억해야 작동하는 게이트는, 기억 못 한 것에 대해 존재하지 않는다.**
 *
 * 위 시험은 `MAP_DESTINED` 허용목록을 돈다. 그건 "이 컨트롤은 지도로 간다" 를
 * 정확히 지키지만, **목록에 없는 컨트롤은 구조적으로 시야 밖**이다. 그래서
 * 2026-08-01 실측에서 `/projects` 의 「← 지도」가 `/`(관문)로 가고 있었는데도
 * 이 파일 전체가 초록이었다 — 그 링크에는 testid 자체가 없었다.
 *
 * 이 시험은 조준을 뒤집는다. **누가 등록했는지가 아니라 라벨이 무엇을
 * 약속하는지**로 찾는다: i18n 값이 「지도」/「Map」 그 자체인 키를 모으고,
 * 그 키를 렌더하는 링크의 href 를 본다. 새 링크를 만들면서 이 게이트에
 * 등록하는 것을 잊어도, 라벨이 지도를 약속하는 한 잡힌다.
 *
 * 사정거리를 **라벨이 곧 「지도」인 것**으로 좁힌 이유: 「지도에서 보기」처럼
 * 문장 안에 지도가 든 것까지 넣으면 링크가 아닌 안내 문구까지 걸려 소음이
 * 된다. 실제로 깨진 부류가 정확히 이 좁은 부류였고, 넓히는 것은 위반이
 * 관측될 때 하면 된다.
 */
const MAP_LABEL = /^[\s←→]*(?:지도|map)[\s←→]*$/i;

/** i18n 값이 「지도」 그 자체인 leaf 키들 — `t("<leaf>")` 가 쓰는 이름이다. */
function mapLabelKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of ["messages/ko.json", "messages/en.json"]) {
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === "string") {
          if (MAP_LABEL.test(value)) keys.add(key);
        } else {
          walk(value);
        }
      }
    };
    walk(JSON.parse(readFileSync(join(process.cwd(), file), "utf8")));
  }
  return keys;
}

/**
 * `t("key")` 를 렌더하는 원소가 속한 **가장 가까운 href 보유 여는 태그**의 href.
 *
 * 라벨은 `<Link href=…>{t("key")}</Link>` 처럼 자식 자리에 있고, 때로 한 겹 더
 * 감싸인다(`<span>{t("key")}</span>`). 그래서 뒤로 걸어 올라가며 href 를 가진
 * 첫 태그를 찾는다. 링크가 아니면(href 없음) 대상이 아니므로 건너뛴다.
 */
/**
 * 한 여는 태그에서 `href` 의 **값**을 읽는다. 못 읽으면 `null`.
 *
 * ⚠️ **이 함수의 사정거리가 곧 이 게이트의 사정거리다** (2026-08-01 실측 교훈).
 * 종전엔 `href="…"` · `href={\`…\`}` · `href={"…"}` 셋만 봤고, 그래서 실제
 * 결함이 **두 형태로 빠져나갔다**:
 *
 * - `href={workspaceHref}` — 같은 파일 위쪽의 `const workspaceHref = '/'`
 * - `href={'/'}` — 중괄호 안 **작은따옴표**
 *
 * 둘 다 `/project/[slug]` 의 「지도」 링크였고, 라벨이 「지도」인데 관문으로
 * 보내고 있었다. 게이트는 초록이었다 — 안 보는 형태였으니까. 이 저장소가
 * 라벨 장식 룰에서 이미 배운 것과 같은 병이다: **룰이 있어도 사정거리가
 * 짧으면 룰이 없는 것과 같다.**
 *
 * 값을 못 정하는 형태(`getTopologyProjectHref(slug)` 같은 호출식)는 `null` 을
 * 돌려 **건너뛴다** — 여기서 추측하면 오탐이 나고, 오탐이 나는 게이트는 곧
 * 꺼진다. 대신 그런 링크는 함수 이름 자체가 목적지를 말한다.
 */
function hrefValue(tag: string, source: string): string | null {
  const literal = /href=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/.exec(tag);
  if (literal) return literal[1] ?? literal[2] ?? literal[3] ?? literal[4] ?? literal[5] ?? "";

  // `href={identifier}` — 같은 파일의 단순 상수 선언을 한 겹만 따라간다.
  const ident = /href=\{([A-Za-z_$][\w$]*)\}/.exec(tag);
  if (!ident) return null;
  const decl = new RegExp(
    `\\b(?:const|let|var)\\s+${ident[1]}\\s*(?::[^=]+)?=\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)`,
  ).exec(source);
  if (!decl) return null;
  return decl[1] ?? decl[2] ?? decl[3] ?? "";
}

function hrefForLabelKey(source: string, key: string): string[] {
  const found: string[] = [];
  for (const marker of [`t("${key}")`, `t('${key}')`]) {
    let cursor = source.indexOf(marker);
    while (cursor !== -1) {
      let at = cursor;
      for (let hop = 0; hop < 6; hop += 1) {
        const open = source.lastIndexOf("<", at);
        if (open === -1) break;
        const close = source.indexOf(">", open);
        const tag = source.slice(open, close === -1 ? source.length : close);
        // 닫는 태그를 만났다 = 앞선 **형제** 원소를 지나친 것이다. 더 올라가면
        // 남의 링크 href 를 자기 것으로 주워온다(프로브가 이걸 잡았다).
        if (tag.startsWith("</")) break;
        const href = hrefValue(tag, source);
        if (href !== null) {
          found.push(href);
          break;
        }
        at = open - 1;
      }
      cursor = source.indexOf(marker, cursor + marker.length);
    }
  }
  return found;
}

describe("라벨이 「지도」인 링크는 등록 없이도 감시된다", () => {
  const source = collectSources();
  const keys = [...mapLabelKeys()].sort();

  it("i18n 에서 지도 라벨 키를 실제로 찾는다 (탐지기 무장 확인)", () => {
    // 0개면 이 시험 전체가 공회전한다 — 조용한 무력화를 여기서 막는다.
    expect(keys.length).toBeGreaterThan(0);
  });

  it("그 라벨을 렌더하는 링크는 전부 지도로 간다", () => {
    const violations: string[] = [];
    for (const key of keys) {
      for (const href of hrefForLabelKey(source, key)) {
        // 로케일 prefix 는 `@/i18n/navigation` 이 붙이므로 소스에는 없다.
        if (href.replace(/\/$/, "") !== MAP_ROUTE) {
          violations.push(`t("${key}") → "${href}"`);
        }
      }
    }
    expect(
      violations,
      `라벨이 「지도」인데 ${MAP_ROUTE} 가 아닌 곳으로 가는 링크가 있다. ` +
        `\`/\` 는 2026-07-30 부터 관문(마케팅)이라, 지도라고 적어 놓고 그리로 ` +
        `보내면 사용자는 방금 떠난 화면으로 되돌아온다.`,
    ).toEqual([]);
  });

  it("추출기가 감싸인 라벨의 href 도 읽는다 (탐지기 무장 확인)", () => {
    const probe = `
      <Link href="/topology"><span>{t("crumbBack")}</span></Link>
      <Link href="/">{t("someOther")}</Link>
      <p>{t("crumbBack")}</p>
    `;
    expect(hrefForLabelKey(probe, "crumbBack")).toEqual(["/topology"]);
    expect(hrefForLabelKey(probe, "someOther")).toEqual(["/"]);
    expect(hrefForLabelKey(probe, "absent")).toEqual([]);
  });

  /**
   * **실제로 빠져나갔던 두 형태.** 프로브가 여기 상주하는 이유는 이 게이트가
   * 조용히 좁아지는 것을 막기 위해서다 — 2026-08-01 에 두 형태가 통과했고,
   * 통과한 이유는 결함이 없어서가 아니라 **추출기가 안 보는 문법**이라서였다.
   */
  it("추출기가 변수 href 와 작은따옴표 href 도 읽는다 (사정거리 프로브)", () => {
    const viaConst = `
      const workspaceHref = '/';
      <Link href={workspaceHref}>{t("crumbBack")}</Link>
    `;
    expect(hrefForLabelKey(viaConst, "crumbBack")).toEqual(["/"]);

    const viaSingleQuote = `<Link href={'/'}>{t("crumbBack")}</Link>`;
    expect(hrefForLabelKey(viaSingleQuote, "crumbBack")).toEqual(["/"]);

    const viaTemplateConst = "const h = `/topology/`;\n<Link href={h}>{t(\"crumbBack\")}</Link>";
    expect(hrefForLabelKey(viaTemplateConst, "crumbBack")).toEqual(["/topology/"]);

    // 값을 못 정하는 호출식은 건너뛴다 — 추측하면 오탐이고, 오탐 나는 게이트는 꺼진다.
    const viaCall = `<Link href={getTopologyProjectHref(slug)}>{t("crumbBack")}</Link>`;
    expect(hrefForLabelKey(viaCall, "crumbBack")).toEqual([]);
  });
});
