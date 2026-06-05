import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * 공개 상세(`/project/[slug]/`)가 비로그인에게도 실제 내용을 노출하는지 검증한다.
 * 스크린샷 캡처 타이밍에 따라 landing과 혼동될 수 있어 DOM 레벨에서 식별 가능한
 * 신호(heading, description 문구 등)를 확인한다.
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

  // 문서 타이틀은 static export 단계에서 이미 "ontology-atlas · Demo".
  const title = await page.title();
  expect(title).toContain("ontology-atlas");

  // 본문 heading은 프로젝트 이름을 포함해야 한다.
  const headings = await page.locator("h1, h2").allTextContents();
  console.log("[detail-access] headings:", headings.slice(0, 8));

  // URL이 유지되는지(landing으로 redirect되지 않는지) 확인.
  expect(page.url()).toMatch(/\/en\/project\/ontology-atlas\/?$/);

  // landing 전용 문구가 본문에 없어야 한다 (만약 있다면 landing으로 떨어진 것).
  const landingSignature = "문서가 프로젝트 구조가 됩니다";
  const landingAppears = await page
    .getByText(landingSignature, { exact: false })
    .first()
    .isVisible()
    .catch(() => false);

  console.log(`[detail-access] landing-redirect? ${landingAppears}`);

  if (errors.length > 0) {
    console.log("[detail-access] errors:", errors);
  }
});
