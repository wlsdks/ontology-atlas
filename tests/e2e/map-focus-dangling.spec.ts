import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **The map must be readable however you deep-link into it** (owner report,
 * 2026-08-17).
 *
 * ## What happened
 *
 * Clicking "open in map" on a project document in the docs view made **every node on
 * the map look like it had vanished**. Owner: *"이건 또 뭐지?"* · *"로딩속도도 느리고"*
 * (what is this now? and it loads slowly too).
 *
 * Nothing had vanished — **everything had been dimmed**. That button produces
 * `?p=<project slug>` (e.g. `project`), while map node names are `kind:slug`
 * (`project:project`) — a project slug has no prefix and a node name does, so the two
 * can **never match, structurally**. When the map concludes something is selected it
 * keeps that node and its neighbours and sinks the rest; with no node matching,
 * **everything became "the rest".**
 *
 * Measured (a 7-document vault, background `#0a0a0d`): the brightest node on screen
 * was **1.40:1** against the background. The floor for UI shapes is 3:1. On the
 * 125-node sample vault, **zero** pixels exceeded luminance 60.
 *
 * ## Why this check counts pixels
 *
 * **Lint, types, and contract tests are all blind to this defect** — every value used
 * is a legitimate token (`--topology-v2-node-stroke-dim`), and what is wrong is
 * *which nodes* it was applied to. The map is a canvas with no DOM, so there is
 * nothing for a selector to ask. The remaining instrument is **counting the painted
 * pixels directly.**
 *
 * The verdict is not "how many bright pixels" but **"is there any readable pixel at
 * all"** — node count, layout, and zoom differ per vault, but *whatever is drawn must
 * be visible to a person* holds for every vault.
 */

const VAULT = {
  "project.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: My project\ncontains:\n  - domains/example-domain\n---\n\n# My project\n`,
  "domains/example-domain.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: domains/example-domain\nkind: domain\ntitle: Example domain\ncapabilities:\n  - capabilities/example-capability\n---\n\n# Example domain\n`,
  "capabilities/example-capability.md": `---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/example-capability\nkind: capability\ntitle: Example capability\ndomain: domains/example-domain\n---\n\n# Example capability\n`,
};

/** Pixels clearly brighter than the background — node outlines and labels land here. */
async function readablePixelCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    /*
     * ⚠️ There can be **two canvases** — during a surface change the outgoing and
     * incoming ones coexist (`use-presence`). Taking the first measures the outgoing one
     * (a screen already emptying), so **the brightest one** is chosen.
     */
    const canvases = [
      ...document.querySelectorAll<HTMLCanvasElement>('[data-testid="topology-map-v2-canvas"]'),
    ].filter((c) => c.width > 0 && c.height > 0);
    if (canvases.length === 0) return -1;
    const canvas = canvases[canvases.length - 1];
    const ctx = canvas.getContext("2d");
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let readable = 0;
    // Sample every 4 pixels — a full scan is slow, and node outlines are several pixels thick so they are still caught.
    for (let i = 0; i < data.length; i += 4 * 4) {
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      // The background is #0a0a0d (luminance ≈ 10). 60 clears 3:1 against it comfortably.
      if (luminance > 60) readable += 1;
    }
    return readable;
  });
}

async function openVault(page: import("@playwright/test").Page, query: string) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto(`/ko/topology/?e2e=1&guides=off`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  if (query) {
    await page.goto(`/ko/topology/?e2e=1&guides=off&${query}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  }
  // Until the layout has been drawn — decided by value (a fixed wait rides machine speed).
  await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000, message: "지도가 아무것도 안 그렸다" })
    .toBeGreaterThan(-1);
}

test("문서함이 보내는 프로젝트 딥링크로 들어와도 지도가 읽힌다", async ({ page }) => {
  test.setTimeout(120_000);

  // Baseline — how bright it is when opened with no parameters.
  await openVault(page, "");
  const plain = await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000 })
    .toBeGreaterThan(0)
    .then(() => readablePixelCount(page));

  // The failing path — the address "open in map" on a project document actually
  // produces (`topology-href.ts`: kind: project → `/topology/?p=<slug>`).
  await page.goto("/ko/topology/?e2e=1&guides=off&p=project", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => readablePixelCount(page), {
      timeout: 30_000,
      message:
        "프로젝트 딥링크로 들어오니 지도에 읽을 수 있는 픽셀이 없다 — " +
        "맞는 노드가 없는 선택이 「전부 흐리게」로 번역된 것이다",
    })
    .toBeGreaterThan(0);

  const viaProjectLink = await readablePixelCount(page);
  // Must reach half the baseline — "one pixel is enough to pass" would go green on a
  // state where only a label survives and every node has sunk.
  expect(
    viaProjectLink,
    `프로젝트 딥링크(${viaProjectLink})가 파라미터 없는 화면(${plain})보다 크게 어둡다`,
  ).toBeGreaterThan(plain / 2);
});

test("지도에 없는 노드를 가리키는 딥링크는 아무것도 안 고른 것으로 떨어진다", async ({ page }) => {
  test.setTimeout(120_000);

  await openVault(page, "");
  const plain = await readablePixelCount(page);

  /*
   * Measures the safety net itself. The test above blocks **one cause** (project slug
   * vs node name mismatch), but as long as the rule that translates "selected a node
   * that does not exist" into "dim everything" survives, the same accident happens by
   * another path. So this checks the map stays readable even for a name that could not
   * possibly exist.
   */
  await page.goto("/ko/topology/?e2e=1&guides=off&p=element:this-node-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => readablePixelCount(page), {
      timeout: 30_000,
      message: "없는 노드를 가리키는 딥링크가 지도를 통째로 가라앉혔다",
    })
    .toBeGreaterThan(plain / 2);
});
