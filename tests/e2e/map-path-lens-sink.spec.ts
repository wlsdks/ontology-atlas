import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForMapStill, waitFrames } from "./settle";

/**
 * Resolve once the lens's sink ramp has arrived. It steps only inside the frame body, and while
 * it has not arrived the frame gate records `spotlightSettling` among the causes that kept the
 * frame awake (`idleDebug`, e2e only). Arrived is a frame awake for other reasons only, or two
 * samples with no awake frame at all; then one more painted frame carries the arrived value.
 */
async function waitForSinkArrived(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    (window as unknown as { __sinkSeen?: unknown }).__sinkSeen = undefined;
  });
  await page.waitForFunction(
    () => {
      type Debug = { lastActive: { t: number; causes: string[] } | null };
      const debug = (window as unknown as { __atlasMap?: { idleDebug?: () => Debug } }).__atlasMap?.idleDebug?.();
      if (!debug) return false;
      const store = window as unknown as { __sinkSeen?: { t: number | null; quiet: number } };
      const t = debug.lastActive?.t ?? null;
      const settling = debug.lastActive?.causes.includes("spotlightSettling") ?? false;
      const seen = store.__sinkSeen;
      const quiet = seen && seen.t === t ? seen.quiet + 1 : 0;
      store.__sinkSeen = { t, quiet };
      return !settling || quiet >= 2;
    },
    undefined,
    { polling: "raf", timeout: 30_000 },
  );
  await waitFrames(page, 2);
}

/**
 * **A path is the only bright thing while a path is asked for** (2026-09-19).
 *
 * The path lens sank everything off the path to the recent-changes lens's rest
 * alpha (0.65), chosen so that a whole-map lens keeps its context readable. A
 * path is two ends and a line; at 0.65 the off-path domain rings measured 123
 * against 143 on the path and every drawn name measured the same 185, so a
 * still frame did not say which two the person had asked about. The path lens
 * now has its own rest alpha (`--map-path-rest-alpha`).
 *
 * Read from the canvas pixels, because alpha is not in the DOM: the brightest
 * pixel under an off-path domain's name against the brightest under an on-path
 * one.
 */
test("off the path, a domain's name is at most half as bright as one on it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off&mode=path&pathFrom=domain:order&pathTo=domain:fulfillment", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("ontology-map")).toHaveAttribute("data-map-lens", "path");
  await waitForMapStill(page);
  // The sink ramps on its own clock; wait for the frame it has arrived in.
  await waitForSinkArrived(page);

  const reading = await page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio;
    const brightest = (box: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const x = Math.round(box.minX * dpr);
      const y = Math.round(box.minY * dpr);
      const w = Math.max(1, Math.round((box.maxX - box.minX) * dpr));
      const h = Math.max(1, Math.round((box.maxY - box.minY) * dpr));
      const data = ctx.getImageData(x, y, w, h).data;
      let max = 0;
      for (let i = 0; i < data.length; i += 4) max = Math.max(max, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      return max;
    };
    const onPath = new Set(["domain:order", "domain:fulfillment"]);
    const on: number[] = [];
    const off: number[] = [];
    for (const label of probe.labels()) {
      if (!label.nodeId.startsWith("domain:")) continue;
      (onPath.has(label.nodeId) ? on : off).push(brightest(label));
    }
    return { on, off };
  });
  expect(reading.on.length, "경로 위 도메인 이름이 안 그려졌다").toBe(2);
  expect(reading.off.length, "경로 밖 도메인 이름이 하나도 없으면 비교할 게 없다").toBeGreaterThan(0);
  const onMin = Math.min(...reading.on);
  const offMax = Math.max(...reading.off);
  expect(offMax / onMin, `경로 밖 이름(${Math.round(offMax)})이 경로 위 이름(${Math.round(onMin)})의 절반보다 밝다`).toBeLessThanOrEqual(0.5);
});

/**
 * **One sink, one meaning of dimmed** (2026-09-21).
 *
 * The lens sink used to be folded into a label's `revealAlpha` *and* applied again as a
 * multiplier at the draw. A domain name ignores `revealAlpha`, so it sank once; a capability
 * or element name ran the sunk value through the child ramp's smoothstep first and sank
 * again, landing near the square of the rest alpha. Off the path the two kinds therefore
 * disagreed about what dimmed means.
 *
 * Measured as **each name against itself**: the same camera and the same open folder, once
 * with the lens and once without. Comparing a name to its own unsunk self cancels the
 * per-kind ink token, which is what makes a capability's sink comparable to a domain's.
 *
 * Two choices that come from measurement (2026-09-21):
 *
 * - **`open=domain:inventory`.** Children are anonymous dots at this altitude otherwise. Of
 *   the seven folders tried, this one's three names — one capability, two elements — are the
 *   ones the placer keeps in *both* frames, and a name missing from one frame cannot be
 *   compared to itself.
 * - **The 90th percentile of the box, not its brightest pixel.** A child's label box also
 *   holds its disc, which is far brighter than the glyphs and saturates the maximum: the
 *   brightest pixel read 52 against 52 for the defect and the repair alike. The p90 tracks
 *   the glyphs: off-path children measured 0.19, 0.19 and 0.25 of their own unsunk selves
 *   with the sink charged twice, 0.35, 0.42 and 0.44 with it charged once, against 0.31–0.37
 *   for the domains beside them.
 */
const LENS_URL =
  "/ko/topology/?e2e=1&guides=off&open=domain:inventory&mode=path&pathFrom=domain:order&pathTo=domain:fulfillment";
const PLAIN_URL = "/ko/topology/?e2e=1&guides=off&open=domain:inventory";

async function namePresencePerNode(page: import("@playwright/test").Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await waitForMapStill(page);
  // The sink ramps on its own clock; wait for the frame it has arrived in.
  await waitForSinkArrived(page);
  return page.evaluate(() => {
    const probe = window.__atlasMap!;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="ontology-map-canvas"]')!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio;
    const reading: Record<string, number> = {};
    for (const label of probe.labels()) {
      const x = Math.round(label.minX * dpr);
      const y = Math.round(label.minY * dpr);
      const w = Math.max(1, Math.round((label.maxX - label.minX) * dpr));
      const h = Math.max(1, Math.round((label.maxY - label.minY) * dpr));
      const data = ctx.getImageData(x, y, w, h).data;
      const lum: number[] = [];
      for (let i = 0; i < data.length; i += 4) lum.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      lum.sort((a, b) => a - b);
      reading[label.nodeId] = lum[Math.floor(lum.length * 0.9)]!;
    }
    return reading;
  });
}

test("the lens sinks a capability or element name no further than a domain name", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 806 });
  await seedFirstRunSeen(page);
  const lens = await namePresencePerNode(page, LENS_URL);
  const plain = await namePresencePerNode(page, PLAIN_URL);

  const sunk = new Map<"domain" | "child", number[]>();
  for (const [nodeId, lit] of Object.entries(lens)) {
    const rest = plain[nodeId];
    if (rest === undefined || rest <= 0) continue;
    const kind = nodeId.split(":")[0];
    const of = kind === "capability" || kind === "element" ? "child" : kind === "domain" ? "domain" : null;
    if (of === null) continue;
    sunk.set(of, [...(sunk.get(of) ?? []), lit / rest]);
  }

  const domains = sunk.get("domain") ?? [];
  const children = sunk.get("child") ?? [];
  expect(domains.length, "두 프레임에 모두 선 도메인 이름이 없으면 비교할 게 없다").toBeGreaterThan(2);
  expect(children.length, "두 프레임에 모두 선 자식 이름이 없으면 잴 게 없다").toBeGreaterThan(1);
  const deepestDomain = Math.min(...domains);
  const deepestChild = Math.min(...children);
  // The case only says something while the lens really is sinking names.
  expect(deepestDomain, "렌즈가 도메인 이름을 전혀 안 가라앉혔다 — 이 프레임은 아무것도 증명하지 않는다").toBeLessThan(0.6);
  expect(
    deepestChild,
    `자식 이름(${deepestChild.toFixed(2)})이 도메인 이름(${deepestDomain.toFixed(2)})보다 더 가라앉았다 — 가라앉히기가 두 번 먹었다`,
  ).toBeGreaterThan(deepestDomain * 0.75);
});
