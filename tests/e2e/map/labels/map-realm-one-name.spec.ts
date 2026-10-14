import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

/** One thing, one name inside a realm: the ledger header reads the localized `display`, not `title`. */
test("영역 안에서도 한 사물에 한 이름", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&realm=domain%3Apayment", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as unknown as { __atlasMap?: unknown }).__atlasMap), null, { timeout: 30_000 });
  await waitForMapStill(page, { what: "camera" });

  const ledgerTitle = page.getByTestId("topology-realm-title");
  const chipTitle = page.getByTestId("topology-realm-chip-title");
  await expect(ledgerTitle).toBeVisible();
  await expect(chipTitle).toBeVisible();

  const onCanvas = await page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { nodes: () => Array<{ id: string; label: string }> } }).__atlasMap;
    return m.nodes().find((n) => n.id === "domain:payment")?.label ?? null;
  });
  expect(onCanvas, "지도에서 결제 노드를 못 찾았다 — 스펙이 공회전한다").toBeTruthy();

  const chip = (await chipTitle.textContent())?.trim();
  const ledger = (await ledgerTitle.textContent())?.trim();
  expect(chip, "칩이 지도와 다른 이름을 쓴다").toBe(onCanvas);
  expect(ledger, "원장 머리가 지도·칩과 다른 이름을 쓴다").toBe(onCanvas);
});
