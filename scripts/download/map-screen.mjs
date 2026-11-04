// The README's map picture: the live map of this repository's ontology with one project selected,
// shot only when asked for (`--only=map`), English only, outside the gateway's eight screens.
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
