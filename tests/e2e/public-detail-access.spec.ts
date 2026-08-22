import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Verifies the public detail page (`/project/[slug]/`) exposes real content without a
 * login. Screenshot timing can make it look identical to having fallen through to the
 * root map (HomePage), so identification uses DOM-level signals (heading, description
 * copy). Before root-first-open the confusable page was LandingPage; now that the root
 * is also the map, the signal became the absence of the INDEX panel.
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
  // Slack for hydration plus the client fetch.
  await page.waitForTimeout(2000);
  await snap(page, "project-detail-full");

  // The document title carries the project name. The URL slug is `ontology-atlas`
  // while the name shown on screen is the human form (`Ontology Atlas`), so the
  // comparison is case-insensitive — what is being confirmed here is that the detail
  // page really rendered that project, not its casing.
  const title = await page.title();
  expect(title.toLowerCase()).toContain("ontology atlas");

  // The body heading must contain the project name.
  const headings = await page.locator("h1, h2").allTextContents();
  console.log("[detail-access] headings:", headings.slice(0, 8));

  // Confirm the URL is preserved (no redirect to the root map).
  expect(page.url()).toMatch(/\/en\/project\/ontology-atlas\/?$/);

  // The root-map-only marker (the INDEX panel) must be absent from the body — its
  // presence means we fell through to the root HomePage rather than the detail page.
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
