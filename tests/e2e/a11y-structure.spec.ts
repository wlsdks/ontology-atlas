import { expect, test, type Page } from "@playwright/test";

/**
 * 주요 라우트의 heading 계층과 landmark 를 잰다.
 *   - 페이지당 `h1` 이 정확히 1개
 *   - `main` 랜드마크가 있다
 *   - "메인 콘텐츠로 건너뛰기" skip link 가 있다
 *
 * ## 2026-07-29 — 재는 것에서 **막는 것**으로
 *
 * 이 스펙은 오랫동안 결과를 `console.log` 로 뿌리기만 하고 **단언이 하나도
 * 없었다.** 즉 무엇을 발견하든 초록으로 통과했다 — 게이트처럼 생긴 보고서다.
 * 이 저장소가 반복해 적어 온 "룰 없는 규격은 지켜지지 않는다" 가 테스트
 * 자신에게 일어난 형태다.
 *
 * 켜기 전에 전수 측정했다: 6개 라우트 × 1440px 에서 **findings=0**. 그래서
 * 단언을 켜도 기존 부채가 드러나지 않고, 앞으로 유입만 막는다.
 *
 * ## 왜 폭을 둘 도나
 *
 * 같은 라우트가 폭에 따라 **다른 컴포넌트를 그린다.** 넓은 폭만 재면 좁은 폭의
 * 강등·재배치 분기를 한 번도 보지 못한다. 제목이 사라지면 그 이유와 다음 길을
 * 제목으로 훑는 사용자는 읽을 수 없다.
 */

const ROUTES = [
  "/en/",
  "/en/project/ontology-atlas/",
  "/en/docs/",
  "/en/topology/",
  "/en/ontology/",
  "/en/projects/",
  // 폭에 따라 본문 컴포넌트가 갈리는 라우트 — 좁은 쪽 분기가 이 스펙의
  // 사각지대였다. Studio 호환 주소는 자기 화면이 없어 감사하지 않는다.
  "/en/ontology/insights/",
] as const;

/** 넓은 쪽(워크벤치)과 좁은 쪽 재배치 분기. */
const WIDTHS = [
  { label: "1440", width: 1440, height: 900 },
  { label: "900", width: 900, height: 900 },
] as const;

interface Finding {
  route: string;
  width: string;
  kind: "h1-count" | "no-main" | "no-skip-link";
  detail: string;
}

async function collect(page: Page, url: string, width: string, findings: Finding[]) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const h1s = Array.from(document.querySelectorAll("h1")).map(
      (h) => (h as HTMLElement).innerText?.trim() ?? "",
    );
    const hasMain =
      document.querySelector("main") !== null ||
      document.querySelector('[role="main"]') !== null;
    const hasSkipLink = document.querySelector('a[href="#main"]') !== null;
    return { h1s, hasMain, hasSkipLink };
  });

  if (info.h1s.length !== 1) {
    findings.push({
      route: url,
      width,
      kind: "h1-count",
      detail: `h1 count=${info.h1s.length} (${JSON.stringify(info.h1s)})`,
    });
  }
  if (!info.hasMain) findings.push({ route: url, width, kind: "no-main", detail: "" });
  if (!info.hasSkipLink) findings.push({ route: url, width, kind: "no-skip-link", detail: "" });
}

for (const vp of WIDTHS) {
  test(`heading/landmark 기본 접근성 품질 (${vp.label}px)`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const findings: Finding[] = [];
    for (const url of ROUTES) {
      await collect(page, url, vp.label, findings);
    }

    expect(
      findings.map((f) => `${f.kind} @ ${f.route} (${f.width}px) ${f.detail}`),
      `heading/landmark 계약 위반. 화면에 제목이 **보이는 것**과 문서에 제목이\n` +
        `**있는 것**은 다른 문제다 — 제목으로 훑는 사용자에게는 뒤쪽만 존재한다.\n` +
        `본문이 카드 하나뿐인 화면(강등·빈 상태)이면 EmptyState 의 titleAs 로 h1 을 낸다.`,
    ).toEqual([]);
  });
}
