import { test, type Page } from "@playwright/test";

/**
 * 주요 라우트의 heading 계층과 landmark role을 수집해 기본 접근성 품질을 본다.
 *   - 페이지당 h1이 정확히 1개 있는지
 *   - main 랜드마크가 존재하는지
 *   - 건너뛸 수 있는 "메인 콘텐츠로 건너뛰기" skip link가 있는지
 */

const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/project/sample/",
  // mission v2 정렬: admin namespace + /review/knowledge 폐기 (PR #5/#6).
  // 살아있는 운영 surface 는 /knowledge/ · /settings/* · /diagnostics/*.
  "/knowledge/",
  "/topology/",
  "/ontology/",
  "/ontology/edit/",
];

interface Finding {
  route: string;
  kind: "h1-count" | "no-main" | "no-skip-link";
  detail: string;
}

async function collect(page: Page, url: string, findings: Finding[]) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const h1s = Array.from(document.querySelectorAll("h1")).map(
      (h) => (h as HTMLElement).innerText?.trim() ?? "",
    );
    const hasMain =
      document.querySelector("main") !== null ||
      document.querySelector('[role="main"]') !== null;
    const skipLink = document.querySelector('a[href="#main"]');
    const hasSkipLink = skipLink !== null;
    return { h1s, hasMain, hasSkipLink };
  });

  if (info.h1s.length !== 1) {
    findings.push({
      route: url,
      kind: "h1-count",
      detail: `h1 count=${info.h1s.length} (${JSON.stringify(info.h1s)})`,
    });
  }
  if (!info.hasMain) {
    findings.push({ route: url, kind: "no-main", detail: "" });
  }
  if (!info.hasSkipLink) {
    findings.push({ route: url, kind: "no-skip-link", detail: "" });
  }
  console.log(
    `[A11Y] ${url} h1s=${info.h1s.length} main=${info.hasMain} skip=${info.hasSkipLink}`,
  );
}

test("heading/landmark 기본 접근성 품질", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const findings: Finding[] = [];
  for (const url of ROUTES) {
    await collect(page, url, findings);
  }
  console.log(`[A11Y] findings=${findings.length}`);
  for (const f of findings) console.log(`[A11Y]   ${f.kind} @ ${f.route} :: ${f.detail}`);
});
