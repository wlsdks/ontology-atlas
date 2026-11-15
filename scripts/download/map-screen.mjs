// The README's map pictures: the live map of this repository's ontology with one project selected
// (`--only=map`) and the same ontology in Neural with one capability selected (`--only=neural`).
// Shot only when asked for, English only, outside the gateway's screens.
const probe = (page, read) => page.evaluate(read);

async function stillFor(page, frames) {
  await page.waitForFunction(
    (count) => {
      const camera = window.__atlasMap?.camera?.();
      const key = camera ? [camera.x, camera.y, camera.scale].map((v) => v.toFixed(2)).join() : null;
      const state = (window.__mapStill ??= { key: null, run: 0 });
      state.run = key !== null && key === state.key ? state.run + 1 : 0;
      state.key = key;
      return state.run >= count;
    },
    frames,
    { polling: "raf", timeout: 60_000 },
  );
}

export const MAP_SCREEN = {
  name: "map",
  route: "/topology/?e2e=1",
  out: "docs/assets/readme/topology-overview.png",
  locales: ["en"],
  explicit: true,
  async prepare(page) {
    await page.waitForFunction(() => (window.__atlasMap?.nodes?.() ?? []).length > 0, undefined, { polling: "raf", timeout: 120_000 });
    await stillFor(page, 30);
    const target = await probe(page, () => {
      const node = window.__atlasMap.nodes().find((item) => item.kind === "project" && !item.hidden);
      const box = document.querySelector("canvas")?.getBoundingClientRect();
      return node && box ? { x: box.left + node.x, y: box.top + node.y } : null;
    });
    if (!target) throw new Error("no project node on the map");
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => window.__atlasMap?.selection?.().nodeId, undefined, { polling: "raf", timeout: 30_000 });
    await page.waitForTimeout(300);
    await stillFor(page, 30);
  },
};

/** The dome has entered, rests, and its pose and camera have not moved for `frames` page frames. */
async function domeStillFor(page, frames) {
  await page.waitForFunction(
    (count) => {
      const dome = window.__atlasMap?.dome?.();
      const camera = window.__atlasMap?.camera?.();
      if (!dome || !camera || dome.ramp < 1 || dome.entryArmed || dome.settling || dome.poseTween) return false;
      const key = [dome.yaw, dome.pitch, camera.x, camera.y, camera.scale].map((v) => v.toFixed(3)).join();
      const state = (window.__domeStill ??= { key: null, run: 0 });
      state.run = key === state.key ? state.run + 1 : 0;
      state.key = key;
      return state.run >= count;
    },
    frames,
    { polling: "raf", timeout: 60_000 },
  );
}

export const NEURAL_SCREEN = {
  name: "neural",
  // The capture browser renders WebGL in software, which the app would otherwise leave to canvas 2D.
  route: "/topology/?e2e=1&neuralgl=force",
  out: "docs/assets/readme/neural.png",
  locales: ["en"],
  explicit: true,
  async prepare(page) {
    await page.waitForFunction(() => (window.__atlasMap?.nodes?.() ?? []).length > 0, undefined, { polling: "raf", timeout: 120_000 });
    await page.getByTestId("topology-view-3d").click();
    await page.getByTestId("topology-view-3d-choice-neural").click();
    await page.waitForFunction(() => window.__atlasMap?.dome?.()?.neural?.painter === "webgl", undefined, { polling: "raf", timeout: 60_000 });
    await domeStillFor(page, 30);
    const target = await probe(page, () => {
      const node = window.__atlasMap.nodes().find((item) => item.id === "capability:mcp-tool-server" && !item.hidden);
      const box = document.querySelector('[data-testid="ontology-map-canvas"]')?.getBoundingClientRect();
      return node && box ? { x: box.left + node.x, y: box.top + node.y } : null;
    });
    if (!target) throw new Error("the MCP tool server capability is not on the map");
    await page.mouse.click(target.x, target.y);
    await page.waitForFunction(() => window.__atlasMap?.selection?.().nodeId, undefined, { polling: "raf", timeout: 30_000 });
    await domeStillFor(page, 30);
  },
};
