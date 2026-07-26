import { expect, test } from "@playwright/test";
import { useDogfoodSample } from "./sample-source";

/**
 * /ontology surface smoke — trimmed (2026-07 e2e decontamination).
 *
 * This file used to cover the old `/ontology` tree/workbench page
 * (`OntologyViewPage`, `ontology-command-bar`, `#tree-data-warnings`, the
 * MCP/Agents settings tab, the insights query cockpit, …). That page was
 * retired when `/ontology` converged into a thin redirect to
 * `/topology?index=expanded` (B3 — "허브가 곧 지도"), so those 17 tests only
 * failed waiting for markup that no longer renders — no product defect, just
 * e2e rot. They were deleted rather than repaired because the surface itself
 * is gone; equivalent current-surface coverage lives in
 * `topology-v2-smoke.spec.ts`.
 *
 * One more test ("데이터가 없으면 detail 패널은 노출되지 않음") was dropped even
 * though it still reported green: it asserted zero `ontology-node-detail`
 * elements, but that testid has zero producers left in `src/` — the
 * assertion passes vacuously forever regardless of actual empty-state
 * behavior, so it stopped being a real regression guard.
 *
 * The five tests below survive because they exercise routes/testids that
 * are still live today (`/`, `/download/`, `/projects/`, and `/ontology/`'s
 * redirect-then-render-topology behavior) and still fail for a real reason
 * if broken.
 */
test.describe("ontology view UI", () => {
  // 이 파일의 단언은 전부 dogfood 볼트 데이터(프로젝트 이름 · 딥링크 슬러그 ·
  // 노드 라벨)에 기댄다. 2026-07-26 기본 샘플이 예시 비즈니스로 바뀌었으니
  // 기본값에 기대지 않고 파일 단위로 명시 선택한다.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  test("desktop: root renders the topology map directly (no marketing landing detour)", async ({ page }) => {
    // root-first-open (2026-07) — `/` used to render a marketing LandingPage
    // when no vault was selected; it now renders the map (HomePage) itself,
    // same as `/topology`. The LandingPage hero copy moved to `/download`.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/");
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    await expect(page.getByText("Codebase ontology that grows with AI")).toHaveCount(0);
  });

  test("desktop: /download exposes the app CTA and the absorbed intro section", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/download/");
    // 2026-07 download 페이지 재설계 — 옛 히어로 문구/링크명이 바뀌었다
    // (`download.title` = "Install once…", primaryCta = "Check GitHub
    // releases"). 릴리스 href 는 primary CTA(MacosDownloadLink)가, 소스는
    // sourceCta 가 담당한다.
    await expect(
      page.getByRole("heading", { name: "Install once. Work from your local vault." }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Check GitHub releases" }).first(),
    ).toHaveAttribute("href", "https://github.com/wlsdks/ontology-atlas/releases");
    await expect(page.getByRole("link", { name: "View source code" })).toHaveAttribute(
      "href",
      "https://github.com/wlsdks/ontology-atlas",
    );
  });

  // R+ /projects redesign — the census/activity/card-zone layout
  // (`docs/prototypes/projects-list-final.html`) dropped the old
  // WorkspaceOntologyStrip shortcut and per-card "Proof · N" query-pack link.
  // Ontology navigation is already covered by the bottom tab bar elsewhere —
  // these two tests guard the *replacement* affordances instead: the
  // new-project CTA and the card's "View in topology" link.
  test("mobile: new-project CTA is tappable and opens the create form", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/");
    // `next dev` can transiently double-render this page's client tree
    // (streaming/hydration artifact, not visible in a production static
    // export) — under load from other tests this occasionally leaves two
    // `project-selector-new-cta` nodes in the DOM for one frame, which trips
    // Playwright's strict-mode locator. Letting the network settle first
    // gives that duplicate time to collapse before the strict-mode query.
    await page.waitForLoadState("networkidle");

    const newProjectCta = page.getByTestId("project-selector-new-cta");
    await expect(newProjectCta).toBeVisible();
    const ctaBox = await newProjectCta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox?.height).toBeGreaterThanOrEqual(32);
    await newProjectCta.click();
    await expect(page).toHaveURL(/\/en\/project\/new\/?(\?|$)/);
  });

  test("mobile: project cards expose a tappable topology link", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/");

    const topologyLink = page
      .getByTestId("project-selector-card")
      .filter({ hasText: "ontology-atlas" })
      .getByRole("link", { name: "View in topology" });
    await expect(topologyLink).toBeVisible();
    const linkBox = await topologyLink.boundingBox();
    expect(linkBox).not.toBeNull();
    expect(linkBox?.height).toBeGreaterThanOrEqual(32);
    await topologyLink.click();
    await expect(page).toHaveURL(/\/en\/topology\/\?p=ontology-atlas/);
  });

  test("mobile: dogfood tree content is visible without horizontal overflow", async ({ page }) => {
    // `/ontology/` redirects to `/topology/?index=expanded` — this still
    // exercises real current behavior (the redirect + the expanded INDEX
    // panel rendering dogfood content), not the retired tree page.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    // 화면 표기(`Ontology Atlas`)와 slug(`ontology-atlas`) 둘 다 허용 —
    // 이 테스트가 보는 건 도그푸드 내용이 렌더되는가이지 표기법이 아니다.
    await expect(page.getByText(/ontology[- ]atlas/i).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
