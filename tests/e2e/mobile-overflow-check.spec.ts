import { test } from "@playwright/test";

test("공개 상세 모바일 overflow 원인 분석", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/project/aslan-maps/");
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate(() => {
    const main = document.getElementById("main");
    const article = document.querySelector("[data-testid='project-knowledge-topology']") as HTMLElement | null;
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      docClientWidth: document.documentElement.clientWidth,
      mainScrollWidth: main?.scrollWidth ?? null,
      mainClientWidth: main?.clientWidth ?? null,
      articleScrollWidth: article?.scrollWidth ?? null,
      articleClientWidth: article?.clientWidth ?? null,
      articleRect: article?.getBoundingClientRect().toJSON() ?? null,
    };
  });

  console.log(JSON.stringify(metrics, null, 2));
});
