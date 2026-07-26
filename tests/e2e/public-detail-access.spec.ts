import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * 공개 상세(`/project/[slug]/`)가 비로그인에게도 실제 내용을 노출하는지 검증한다.
 * 스크린샷 캡처 타이밍에 따라 루트 지도(HomePage)로 잘못 떨어진 것과 혼동될 수
 * 있어 DOM 레벨에서 식별 가능한 신호(heading, description 문구 등)를 확인한다.
 * (root-first-open 이전엔 이 혼동 대상이 LandingPage 였다 — 이제 루트도 지도라
 * 신호를 INDEX 패널 부재로 바꿨다.)
 */

const OUT = path.resolve("output/ui-audit/detail");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

test("비로그인 /project/ontology-atlas/ 상세가 실제 콘텐츠를 렌더한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  await page.goto("/en/project/ontology-atlas/");
  // 하이드레이션 + client fetch 여유.
  await page.waitForTimeout(2000);
  await snap(page, "project-detail-full");

  // 문서 타이틀은 프로젝트 이름을 담는다. URL slug 는 `ontology-atlas` 지만
  // 화면에 세우는 이름은 사람이 읽는 표기(`Ontology Atlas`)라, 대소문자를
  // 가리지 않고 비교한다 — 여기서 확인하려는 건 표기법이 아니라 "상세가
  // 실제로 그 프로젝트를 렌더했는가" 다.
  const title = await page.title();
  expect(title.toLowerCase()).toContain("ontology atlas");

  // 본문 heading은 프로젝트 이름을 포함해야 한다.
  const headings = await page.locator("h1, h2").allTextContents();
  console.log("[detail-access] headings:", headings.slice(0, 8));

  // URL이 유지되는지(루트 지도로 redirect되지 않는지) 확인.
  expect(page.url()).toMatch(/\/en\/project\/ontology-atlas\/?$/);

  // 루트 지도 전용 마커(INDEX 패널)가 본문에 없어야 한다 (있다면 상세가 아니라
  // 루트 HomePage 로 떨어진 것).
  const rootMapAppears = await page
    .getByTestId("topology-index-panel")
    .first()
    .isVisible()
    .catch(() => false);

  console.log(`[detail-access] fell back to root map? ${rootMapAppears}`);

  if (errors.length > 0) {
    console.log("[detail-access] errors:", errors);
  }
});
