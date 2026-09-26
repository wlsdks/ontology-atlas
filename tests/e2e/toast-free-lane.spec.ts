import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone, waitForBoxStill } from "./settle";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **A toast and the agent status never stand over the map's own chrome** (owner,
 * 2026-09-24: *"the toast at the top — the design is poor, the colour too, and the
 * position"*).
 *
 * Measured before this spec, with a folder open and an agent heartbeat live:
 *
 * - at 1040 the top-centred toast lay over the expanded INDEX (310–730 over 88–388) and,
 *   with the meaning panel open, over the panel by 114px;
 * - at 1040 the status line hanging under the toolbar lay across the search lane's
 *   second row (832–918 × 74–98 over 804–1016 × 76–112);
 * - at 1512 with the panel open the toast covered that status line.
 *
 * The claims are geometric, so they are measured as rects across three widths with the
 * right panel closed and open: the toast's box intersects none of the toolbar rows, INDEX
 * or the panel, and stays inside the window; the status is a segment of the toolbar row,
 * joined to the bell, and intersects no other lane.
 *
 * Only the picker is stubbed; everything behind it is real code.
 */

type Rect = { x: number; y: number; width: number; height: number };

const seed = () => ({
  "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - capabilities/pay\n---\n\n# Chip Shop\n`,
  "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
  // A write 20 minutes ago puts a receipt behind the bell, so both halves are drawn.
  ".ontology-atlas/activity.jsonl": `${JSON.stringify({ v: 1, at: "{{NOW-1200000}}", tool: "add_concept", target: "capabilities/pay", summary: "add_concept capability:capabilities/pay", agent: "codex-acp", why: null })}\n`,
  ".ontology-atlas/agent-activity.json": `${JSON.stringify({
    agent: "codex-acp",
    state: "planning",
    focus: { summary: "경로 설명", ontologySlug: "capabilities/pay", files: [] },
    plan: ["확인"],
    evidence: { mcp: ["find_path"], source: [], codegraph: [], verification: [] },
    updatedAt: "{{NOW-1000}}",
  })}\n`,
});

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;

// Soft expectations: one run reports every rect a toast or the status crosses, not only
// the first.

async function rects(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    };
    return {
      toast: box("[data-sonner-toast]"),
      utilityRow: box('[data-testid="topology-utility-action-row"]'),
      searchLane: box('[data-testid="topology-search-action-lane"]'),
      index: box('[data-testid="topology-index-panel"]') ?? box('[data-testid="topology-index-tab"]'),
      panel: box('[data-agent-dock-surface="inset"]'),
      status: box('[data-testid="agent-activity-status-trigger"]'),
      readout: box('[data-testid="topology-readout-stack"]:not([aria-hidden="true"])'),
      hint: box('[data-testid="sample-node-hint"]'),
      bell: box('[data-testid="agent-activity-bell"]'),
    };
  });
}

for (const width of [1040, 1512, 1920]) {
  for (const panel of ["closed", "open"] as const) {
    test(`toast and agent status stay off the chrome — ${width}, panel ${panel}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await seedFirstRunSeen(page);
      await stubDirectoryPicker(page, seed());
      await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
      await page.getByTestId("first-run-starter-open").click();
      await page.getByTestId("vault-guide-pick-existing").click();
      await expect(page.getByTestId("agent-activity-status-trigger")).toBeVisible({ timeout: 30_000 });
      if (panel === "open") {
        await page.getByTestId("topology-meaning-workbench-toggle").click();
        await expect(page.locator('[data-agent-dock-surface="inset"]')).toBeVisible();
        // The panel's frame animates its width in; measure the rest state.
        await expect
          .poll(async () => (await rects(page)).panel?.width ?? 0, { timeout: 5_000 })
          .toBeGreaterThan(300);
        await waitForBoxStill(page.locator('[data-agent-dock-surface="inset"]'));
      }

      // ① The status is a segment of the toolbar row, joined to the bell. Its entry
      // (`.topology-chrome-in`) moves it a few px; measure once it has settled.
      await page.waitForFunction(() =>
        document.getAnimations().every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations === Infinity),
      );
      const chrome = await rects(page);
      const { status, bell, utilityRow, searchLane } = chrome;
      expect(status, "작업 상태가 안 보인다").not.toBeNull();
      expect(bell, "종이 안 보인다").not.toBeNull();
      expect.soft(Math.abs(status!.y - bell!.y), "상태가 종과 같은 줄이 아니다").toBeLessThanOrEqual(1);
      expect.soft(Math.abs(status!.height - bell!.height), "상태가 도구줄 타일 높이가 아니다").toBeLessThanOrEqual(1);
      expect.soft(
        Math.abs(status!.x + status!.width - bell!.x),
        "상태가 종에 붙어 있지 않다 — 떠 있는 상자다",
      ).toBeLessThanOrEqual(1);
      expect.soft(Math.abs(status!.y - utilityRow!.y), "상태가 도구줄 안에 있지 않다").toBeLessThanOrEqual(1);
      if (searchLane) {
        expect.soft(overlap(status!, searchLane), `상태가 검색 줄을 덮었다 ${JSON.stringify({ status, searchLane })}`).toBe(false);
      }

      // ② A toast raised by the map stands in the free lane.
      await page.getByTestId("topology-auto-arrange").click();
      const toast = page.locator("[data-sonner-toast]").first();
      await expect(toast).toBeVisible();
      // Let the entry settle (`--motion-base`) and the lane observer publish (it measures on a frame).
      await waitForAnimationsDone(toast);
      await waitForBoxStill(toast);
      const measured = await rects(page);
      const t = measured.toast!;
      expect(t, "토스트가 안 떴다").not.toBeNull();
      expect.soft(t.x, "토스트 왼변이 창 밖이다").toBeGreaterThanOrEqual(0);
      expect.soft(t.x + t.width, "토스트 오른변이 창 밖이다").toBeLessThanOrEqual(width);
      expect.soft(t.y + t.height, "토스트 아랫변이 창 밖이다").toBeLessThanOrEqual(900);
      for (const [name, rect] of [
        ["도구줄", measured.utilityRow],
        ["검색 줄", measured.searchLane],
        ["INDEX", measured.index],
        ["오른쪽 패널", measured.panel],
        ["작업 상태", measured.status],
        ["지도 판독", measured.readout],
      ] as const) {
        if (!rect) continue;
        expect.soft(overlap(t, rect), `토스트가 ${name}을(를) 덮었다 ${JSON.stringify({ toast: t, [name]: rect })}`).toBe(false);
      }
      // Centred in the lane between INDEX (or its tab) and the panel, within a pixel.
      const left = measured.index ? measured.index.x + measured.index.width : 0;
      const right = measured.panel ? measured.panel.x : width;
      expect.soft(Math.abs(t.x + t.width / 2 - (left + right) / 2), "토스트가 빈 지도 가운데가 아니다").toBeLessThanOrEqual(2);
    });
  }
}

/*
 * **The floor.** The sample map's first visit stands two readings on the bottom band —
 * the corner readout and the centred "press a node" hint. Measured at 768 before the
 * floor walls: the toast lay over the readout's zoom line. The toast stands above both.
 */
for (const [width, height] of [[768, 1024], [1040, 720], [1512, 900]] as const) {
  test(`toast stands above the map's floor readings — sample, ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/ko/topology/?e2e=1&guides=off&p=missing-xyz", { waitUntil: "domcontentloaded" });
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 30_000 });
    await waitForAnimationsDone(toast);
    await waitForBoxStill(toast);
    const measured = await rects(page);
    const t = measured.toast!;
    expect(t, "토스트가 안 떴다").not.toBeNull();
    for (const [name, rect] of [
      ["지도 판독", measured.readout],
      ["첫 방문 안내", measured.hint],
      ["INDEX", measured.index],
    ] as const) {
      if (!rect) continue;
      expect.soft(overlap(t, rect), `토스트가 ${name}을(를) 덮었다 ${JSON.stringify({ toast: t, [name]: rect })}`).toBe(false);
    }
    expect.soft(t.y + t.height, "토스트 아랫변이 창 밖이다").toBeLessThanOrEqual(height);
  });
}
