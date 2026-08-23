import { expect, test } from "@playwright/test";
import { useDogfoodSample } from "./sample-source";

/**
 * /ontology surface smoke — trimmed (2026-07 e2e decontamination).
 *
 * This file used to cover the old `/ontology` tree/workbench page
 * (`OntologyViewPage`, `ontology-command-bar`, `#tree-data-warnings`, the
 * MCP/Agents settings tab, the Insights maintenance board, …). That page was
 * retired when `/ontology` converged into a thin redirect to
 * `/topology?index=expanded` (B3 — "the hub is the map"), so those 17 tests only
 * failed waiting for markup that no longer renders — no product defect, just
 * e2e rot. They were deleted rather than repaired because the surface itself
 * is gone; equivalent current-surface coverage lives in
 * `topology-v2-smoke.spec.ts`.
 *
 * One more test ("detail panel is not exposed when there is no data") was dropped even
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
  // Every assertion in this file depends on dogfood vault data (project name, deep-link
  // slug, node labels). Since the default sample became the example business on
  // 2026-07-26, this selects explicitly per file rather than relying on the default.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  /**
   * **This check's address split on 2026-07-30.**
   *
   * The original sentence was *"root renders the topology map directly (no marketing
   * landing detour)"*, encoding the 2026-07 root-first-open decision. The owner signed a
   * reversal: `/` became the web visitor's face and the map moved to `/topology`.
   *
   * **The check was not deleted but moved into two.** The guarantee that the map appears
   * directly still stands; only the address it asks about changed. Deleting it would have
   * made this transition remove a guarantee.
   */
  test("desktop: /topology renders the map directly (no detour)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/topology/");
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    // The old marketing landing's hero copy remains at no address.
    await expect(page.getByText("Codebase ontology that grows with AI")).toHaveCount(0);
  });

  test("desktop: root renders the gateway face, not the workbench", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/");
    // The face's top bar appears, and the workbench's INDEX does not.
    await expect(page.getByTestId("download-gnb")).toBeVisible();
    await expect(page.getByTestId("topology-index-panel")).toHaveCount(0);
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
    // the Apple Silicon DMG once published, the browser map before that.
    // Asserting the label would pin this spec to one state and break on
    // release day — assert the role the element plays.
    //
    // [re-aimed 2026-08-19] This site used to be the panel (`download-primary-cta`).
    // After the owner removed the install section entirely (*"the last section is probably unnecessary, it is
    // all at the top anyway"* — the last section is probably unnecessary, it is
    // all at the top anyway), the hero CTA carries the same role.
    const primary = page.getByTestId("gateway-hero-cta");
    await expect(primary).toBeVisible();

    /*
     * [deleted 2026-08-19] The subjects that disappeared with it — the repository exit
     * link (`download-repo-link`), the two platform sections (`download-platform-macos`,
     * `download-platform-windows`), the verification rail (`download-trust`, Developer ID,
     * SHA-256), and the architecture guidance (`About This Mac`). All lived inside the
     * download panel and the verification rail. `docs/DECISIONS.md` 2026-08-19 records the
     * cost.
     *
     * The signing and notarisation claim survives as the hero's single trust line, so that
     * is all this measures.
     */
    await expect(page.getByText(/Signed and notarized by Apple/i).first()).toBeVisible();
    await expect(page.getByText(/Open Anyway/i)).toHaveCount(0);
    await expect(page.getByText(/Not signed yet/i)).toHaveCount(0);

    // Operator-only release-pipeline status must never reach the public page.
    await expect(page.getByText(/waiting on PR review/i)).toHaveCount(0);
    await expect(page.getByText(/version alignment/i)).toHaveCount(0);
  });

  // A sibling of the #712 regression guard — this is the only route without a bottom
  // tab bar, so it reserves no height for one. That layer cannot be measured without a
  // browser, so it is measured here.
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
        /**
         * ⚠️ **A box is not ink.**
         *
         * In recent Chromium the contents of a closed `<details>` are handled with
         * **`content-visibility: hidden`** rather than `display: none` (changed to make
         * expansion animations possible). So they are neither painted nor hit-tested while
         * **the layout box remains** — counting by height alone makes a 561px ghost that is not
         * on screen into the "last ink" (measured 2026-07-29: the "why it is safe to download"
         * disclosure on `/download` produced a margin of −505px).
         *
         * `checkVisibility()` is the standard answer to this distinction. As long as this
         * check is named for *ink*, its predicate must be whether it paints.
         */
        const lastInk = [...main.querySelectorAll("*")]
          .filter((element) => {
            // ② **Leaves only.** A container's bottom padding is margin, not content — the
            // sibling spec (`scroll-end-gap.spec.ts`) already uses the same rule. Without it the
            // outer wrapper's `pb-…` becomes the "last ink" and the gap is reported as **absent**
            // by exactly the size of that padding (measured 2026-07-29: real text ended at 760
            // while the wrapper box reached 800, so the gap read as 0).
            if (element.children.length > 0) return false;
            const rect = element.getBoundingClientRect();
            if (rect.height <= 2 || rect.width <= 2) return false;
            // ① Does it paint — see the comment above.
            return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
          })
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

    // Both the on-screen form (`Ontology Atlas`) and the slug (`ontology-atlas`) are
    // accepted — this test watches whether dogfood content renders, not its notation.
    await expect(page.getByText(/ontology[- ]atlas/i).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
