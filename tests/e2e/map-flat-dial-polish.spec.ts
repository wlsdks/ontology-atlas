import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { dogfoodVaultFiles } from "./dogfood-vault-files";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapSettled, waitForPageSettled } from "./settle";

interface Rect { x: number; y: number; right: number; bottom: number }
interface Read {
  owns: boolean;
  namesCrossed: number;
  textOverlaps: number;
  domains: number;
  concepts: number;
  readout: { synthetic: string | null; concepts: number | null } | null;
  rects: Record<"legend" | "readout" | "hint", Rect | null>;
}

const SIZES = [
  { width: 1512, height: 982 },
  { width: 1040, height: 720 },
];

async function settle(page: Page) {
  await page.waitForFunction(() => ((window as unknown as { __atlasMap?: { nodes: () => unknown[] } }).__atlasMap?.nodes().length ?? 0) > 5, undefined, { timeout: 90_000 });
  await waitForMapSettled(page, { timeout: 90_000 });
  await waitForPageSettled(page);
}

function read(page: Page): Promise<Read> {
  return page.evaluate(() => {
    const m = (window as unknown as { __atlasMap: { dial: () => Record<string, unknown>; nodes: () => { kind: string }[] } }).__atlasMap;
    const d = m.dial() as { owns: boolean; namesCrossed: number; textOverlaps: number; clusters: unknown[] };
    const rect = (id: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    };
    const el = document.querySelector('[data-testid="topology-scope-readout"]');
    return {
      owns: d.owns, namesCrossed: d.namesCrossed, textOverlaps: d.textOverlaps, domains: d.clusters.length,
      concepts: m.nodes().filter((n) => n.kind !== "document").length,
      readout: el ? { synthetic: el.getAttribute("data-synthetic"), concepts: Number(el.getAttribute("data-total-concepts")) } : null,
      rects: { legend: rect("flat-dial-legend"), readout: rect("topology-scope-readout"), hint: rect("sample-node-hint") },
    };
  });
}

for (const size of SIZES) {
  test(`sample ${size.width}: the scope count matches the graph without generic overlays`, async ({ page }) => {
    await page.setViewportSize(size);
    await seedFirstRunSeen(page);
    await page.goto("/en/topology/?e2e=1&guides=off");
    await settle(page);
    const r = await read(page);
    expect(r.owns).toBe(true);
    expect(r.readout).toMatchObject({ synthetic: "false", concepts: r.concepts });
    expect(r.rects.legend).toBeNull();
    expect(r.rects.hint).toBeNull();
    expect(r.rects.readout).not.toBeNull();
    expect(r.textOverlaps).toBe(0);
    if (size.width === 1512) expect(r.namesCrossed).toBe(0);
  });

  test(`dogfood ${size.width}: the entered domain's ledger keeps off its name`, async ({ page }) => {
    await page.setViewportSize(size);
    await installDesktopRailRuntime(page, dogfoodVaultFiles(), undefined, { replaceFixture: true });
    await page.goto("/en/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
    await page.getByTestId("first-run-open").click();
    await settle(page);
    const r = await read(page);
    expect(r.owns).toBe(true);
    expect(r.textOverlaps).toBe(0);
    if (size.width === 1512) expect(r.namesCrossed).toBe(0);
  });
}

test("synth 10,000: the readout identifies generated data without the sample introduction", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/?synth=10000&e2e=1&guides=off");
  await settle(page);
  const r = await read(page);
  expect(r.owns).toBe(true);
  expect(r.readout).toMatchObject({ synthetic: "true", concepts: r.concepts });
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0);
  expect(r.domains).toBeGreaterThan(9);
});
