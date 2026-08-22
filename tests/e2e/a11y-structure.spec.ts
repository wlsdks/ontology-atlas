import { expect, test, type Page } from "@playwright/test";

/**
 * Measures heading hierarchy and landmarks on the main routes:
 *   - exactly one `h1` per page
 *   - a `main` landmark is present
 *   - a "skip to main content" link is present
 *
 * **2026-07-29 — from measuring to blocking.** For a long time this spec only printed
 * its results with `console.log` and contained **no assertions at all**, so it passed
 * green whatever it found — a report shaped like a gate. It is what this repository
 * keeps writing down ("a spec with no rule is not kept") happening to a test itself.
 *
 * An exhaustive measurement before switching it on: **findings=0** across 6 routes at
 * 1440px. So enabling the assertions exposes no existing debt and blocks only future
 * inflow.
 *
 * **Why two widths.** The same route **draws different components** by width.
 * Measuring only the wide width never sees the narrow width's demotion and
 * rearrangement branches. If a heading disappears, users who scan by heading cannot
 * read the reason or the next step.
 */

const ROUTES = [
  "/en/",
  "/en/project/ontology-atlas/",
  "/en/docs/",
  "/en/topology/",
  "/en/ontology/",
  "/en/projects/",
  // Routes whose body component splits by width — the narrow branch was this spec's
  // blind spot. Studio compatibility addresses have no screen of their own and are not
  // audited.
  "/en/ontology/insights/",
] as const;

/** The wide (workbench) branch and the narrow rearrangement branch. */
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
