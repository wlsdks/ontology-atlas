import { expect, test } from "@playwright/test";
import { useDogfoodSample } from "./sample-source";

/**
 * /ontology surface smoke — trimmed (2026-07 e2e decontamination).
 *
 * This file used to cover the old `/ontology` tree/workbench page
 * (`OntologyViewPage`, `ontology-command-bar`, `#tree-data-warnings`, the
 * MCP/Agents settings tab, the Insights maintenance board, …). That page was
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

  test("desktop: /download states installability before it explains the product", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/download/");

    // The headline comes from the catalog, not from a copy of it. Pinning the
    // sentence is what broke this spec on the 2026-07-27 remake: the assertion
    // was about *the page having one headline*, but it was written as "this
    // exact sentence", so a rewrite read as a regression.
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toBeVisible();

    // The macOS action is a single stable target across both release states:
    // the Apple Silicon DMG once published, an honestly-labelled link to the
    // releases page before that. Asserting the label would pin this spec to one
    // state and break on release day — assert the role the element plays.
    const primary = page.getByTestId("download-primary-cta");
    await expect(primary).toBeVisible();
    await expect(primary).toHaveAttribute("href", /github\.com\/wlsdks\/ontology-atlas/);

    await expect(page.getByRole("link", { name: "View source code" })).toHaveAttribute(
      "href",
      "https://github.com/wlsdks/ontology-atlas",
    );

    // Both platforms are named. Omitting Windows left a Windows visitor unable
    // to tell whether the product excluded them or had not got there yet.
    await expect(page.getByTestId("download-platform-macos")).toBeVisible();
    const windows = page.getByTestId("download-platform-windows");
    await expect(windows).toBeVisible();
    await expect(windows).toContainText("Windows");

    // Trust facts, stated as what is true today (Developer ID signing has been
    // live since 2026-07-27) with the proof for each. The unsigned-era detour
    // through System Settings is false now, and it is the single most
    // expensive thing a first-time visitor could be told to do.
    const trust = page.getByTestId("download-trust");
    await expect(trust).toContainText(/Developer ID/);
    await expect(trust).toContainText(/SHA-256/);
    await expect(page.getByText(/Open Anyway/i)).toHaveCount(0);
    await expect(page.getByText(/Not signed yet/i)).toHaveCount(0);

    // A visitor who does not know which Mac they own must not be left in
    // front of two architecture buttons with no way to choose. Before a
    // release exists there is no choice to make, so the rule is conditional:
    // offer both architectures, or explain how to pick — never the first
    // without the second. (The published branch is covered as a unit test;
    // e2e can only ever see the state actually shipped.)
    const intelDownload = page.getByTestId("download-macos-x64");
    const archHelp = page.getByText(/About This Mac/i);
    expect(
      (await intelDownload.count()) === 0 || (await archHelp.count()) > 0,
      "offering an architecture choice requires telling visitors how to make it",
    ).toBe(true);

    // Operator-only release-pipeline status must never reach the public page.
    await expect(page.getByText(/waiting on PR review/i)).toHaveCount(0);
    await expect(page.getByText(/version alignment/i)).toHaveCount(0);
  });

  // #712 회귀 가드의 형제 — 이 라우트는 하단 탭바가 없는 유일한 라우트라
  // 예약고를 잡지 않는다. 브라우저 없이는 잴 수 없는 층이므로 여기서 잰다.
  test("desktop: /download keeps breathing room at the scroll end and never scrolls sideways", async ({
    page,
  }) => {
    for (const width of [1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/en/download/");
      await page.waitForLoadState("networkidle");

      const measured = await page.evaluate(() => {
        const main = document.getElementById("main");
        if (!main) return null;
        let scroller: HTMLElement = main;
        let node: HTMLElement | null = main;
        while (node && node !== document.documentElement) {
          const style = getComputedStyle(node);
          if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
            scroller = node;
            break;
          }
          node = node.parentElement;
        }
        scroller.scrollTop = scroller.scrollHeight;
        const lastInk = [...main.querySelectorAll("*")]
          .filter((element) => element.getBoundingClientRect().height > 0)
          .reduce((max, element) => Math.max(max, element.getBoundingClientRect().bottom), 0);
        return {
          gap: Math.round(scroller.getBoundingClientRect().bottom - lastInk),
          overflowX: main.scrollWidth - main.clientWidth,
        };
      });

      expect(measured, `#main must exist at ${width}px`).not.toBeNull();
      expect(measured!.gap, `scroll-end breathing room at ${width}px`).toBeGreaterThanOrEqual(24);
      expect(measured!.overflowX, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
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
