import { expect, test } from "@playwright/test";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";
import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";

test("a branch reveals the capability batch it claims and collapse restores the preview", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?e2e=1&guides=off&realm=project%3Astorefront", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("topology-realm-chip")).toBeVisible();
  await waitForMapStill(page);
  const dial = () => page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
  const clickText = async (role: "domain" | "more", pattern: RegExp) => {
    const text = (await dial()).texts.find((text) => text.id === "domain:order" && text.role === role && pattern.test(text.text));
    expect(text, `Orders has a drawn ${role} target matching ${pattern}`).toBeDefined();
    const box = (await page.getByTestId("ontology-map-canvas").boundingBox())!;
    await page.mouse.click(box.x + (text!.box.minX + text!.box.maxX) / 2, box.y + (text!.box.minY + text!.box.maxY) / 2);
    await page.mouse.move(5, 5);
  };
  await clickText("domain", /^Orders$/);
  await expect.poll(() => page.evaluate(() => window.__atlasMap!.selection().nodeId), { message: "the drawn Orders name selects its domain" }).toBe("domain:order");
  await waitForMapStill(page);
  const shown = async () => {
    const frame = await dial();
    const members = new Set(frame.clusters.find((cluster) => cluster.domainId === "domain:order")!.capabilityIds);
    return frame.discs.filter((disc) => members.has(disc.id)).map((disc) => disc.id).sort();
  };
  const before = await shown();
  expect(before.length, "the domain shows a capability preview").toBeGreaterThan(0);
  const more = (await dial()).texts.find((text) => text.id === "domain:order" && text.role === "more" && /^View \d+ more$/.test(text.text));
  expect(more, "the preview claims a concrete next batch").toBeDefined();
  const claimed = Number(more!.text.match(/\d+/)![0]);
  expect(claimed).toBeGreaterThan(0);
  await clickText("more", /^View \d+ more$/);
  await expect.poll(async () => (await shown()).length, { message: "More reveals exactly the claimed capability batch" }).toBe(before.length + claimed);
  await waitForMapStill(page);
  const after = await shown();
  expect(before.every((id) => after.includes(id)), "revealing a batch retains the preview").toBe(true);
  const frame = await dial();
  const names = frame.texts.filter((text) => after.includes(text.id ?? "") && text.role === "capability");
  expect(names.map((text) => text.id).sort(), "every disclosed capability is named").toEqual(after);
  for (const name of names) {
    expect(name.box.minX, `${name.id} clears the free map's left edge`).toBeGreaterThanOrEqual(frame.freeRect.minX);
    expect(name.box.maxX, `${name.id} clears the inspector`).toBeLessThanOrEqual(frame.freeRect.maxX);
    expect(name.box.minY, `${name.id} stays below the toolbar`).toBeGreaterThanOrEqual(frame.freeRect.minY);
    expect(name.box.maxY, `${name.id} stays above the footer`).toBeLessThanOrEqual(frame.freeRect.maxY);
  }
  const marks = frame.discs.filter((disc) => after.includes(disc.id));
  expect(marks.length, "each disclosed capability has a visible mark").toBe(after.length);
  for (const [index, mark] of marks.entries()) {
    for (const other of marks.slice(index + 1)) {
      expect(Math.hypot(mark.x - other.x, mark.y - other.y), `${mark.id} does not overlap ${other.id}`).toBeGreaterThanOrEqual(mark.r + other.r);
    }
  }
  await clickText("more", /^Collapse \d+ revealed capabilities$/);
  await expect.poll(shown, { message: "Collapse restores the original capability preview" }).toEqual(before);
});
