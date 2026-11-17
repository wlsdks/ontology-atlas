import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";

/**
 * The harness film plays the app's own Harness › Setup screen. Over one loop on a fake clock, the
 * film may add only its own nodes to the window and shows no vendor mark, every frame keeps the window, a lifted card and
 * the pointer inside the picture zone, and the visitor's scroll and focus never move.
 */

const FILM_NODES = ["scrim", "ring", "pointer", "clone", "card"];

async function filmTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const fills = [...document.querySelectorAll<HTMLElement>('[data-testid="gateway-harness"] nav button span span')];
    const lit = fills.map((fill) => Number(/scaleX\(([\d.e-]+)\)/.exec(fill.style.transform)?.[1] ?? 0));
    const lengths = [2600, 2600, 2800, 2800];
    const starts = [0, 2600, 5200, 8000];
    const act = lit.findIndex((value) => value < 1);
    return act < 0 ? 10800 : starts[act]! + lit[act]! * lengths[act]!;
  });
}

/** Everything one frame must hold; an empty list is a frame that passes. */
async function frameFaults(page: Page): Promise<string[]> {
  return page.evaluate((allowed) => {
    const faults: string[] = [];
    const film = document.querySelector('[data-testid="gateway-harness"]')!;
    const win = film.querySelector<HTMLElement>("[data-film-window]")!;
    const layer = win.querySelector<HTMLElement>("[data-film-layer]")!;
    for (const child of layer.children) {
      const kind = (child as HTMLElement).dataset.filmNode ?? "";
      if (!allowed.includes(kind)) faults.push(`the film layer holds a node of its own kind "${kind}"`);
    }
    /* Third-party logos need their owners' written permission; the film names the tools in text. */
    if (win.querySelector("[data-vendor-mark], [data-vendor-mark-ink], img")) faults.push("the window shows a vendor mark or image");
    for (const node of win.querySelectorAll("[data-film-node]")) {
      if (!layer.contains(node)) faults.push("a film node sits inside the screen itself");
    }
    const stage = film.querySelector("[data-harness-film-frame]")!.parentElement!.getBoundingClientRect();
    const label = film.querySelector("#gateway-harness-title")!.parentElement!.getBoundingClientRect();
    const block = film.querySelector("nav")!.parentElement!.getBoundingClientRect();
    const narrow = block.width < 960;
    const left = narrow ? stage.left + Math.max(32, (stage.width - 960) / 2) : block.left;
    const right = narrow ? stage.right - (left - stage.left) : block.right;
    const zone = { left, right, top: stage.top + Math.max(120, label.bottom - stage.top + 24), bottom: block.top - 32 };
    const within = (name: string, r: { left: number; top: number; right: number; bottom: number }) => {
      if (r.left < zone.left - 0.5 || r.top < zone.top - 0.5 || r.right > zone.right + 0.5 || r.bottom > zone.bottom + 0.5) {
        faults.push(`${name} leaves the picture zone: ${[r.left, r.top, r.right, r.bottom].map(Math.round).join(",")}`);
      }
    };
    const frame = win.getBoundingClientRect();
    within("the window", frame);
    /* The window clips what it holds, so a card is judged by what of it shows. */
    for (const card of layer.querySelectorAll('[data-film-node="card"]')) {
      const r = card.getBoundingClientRect();
      within("a lifted card", {
        left: Math.max(r.left, frame.left),
        top: Math.max(r.top, frame.top),
        right: Math.min(r.right, frame.right),
        bottom: Math.min(r.bottom, frame.bottom),
      });
    }
    const pointer = layer.querySelector<SVGElement>('[data-film-node="pointer"]')!;
    if (Number(getComputedStyle(pointer).opacity) > 0) within("the pointer", pointer.getBoundingClientRect());
    return faults;
  }, FILM_NODES);
}

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 2560, height: 1440 },
]) {
  test(`${viewport.width}×${viewport.height}: one loop adds only the film's nodes, stays in its zone, and leaves scroll and focus alone`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await seedFirstRunSeen(page);
    await page.clock.install();
    await page.goto("/en/download/?guides=off", { waitUntil: "load" });
    await page.clock.runFor(1500);
    const film = page.getByTestId("gateway-harness");
    await expect(film).toHaveAttribute("data-gateway-harness", "playing");
    const before = await page.evaluate(() => {
      const film = document.querySelector('[data-testid="gateway-harness"]')!;
      const pane = document.querySelector<HTMLElement>("[data-app-shell-pane]")!;
      pane.scrollTo({ top: film.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop, behavior: "instant" });
      (document.activeElement as HTMLElement | null)?.blur();
      return { scroll: pane.scrollTop, focus: document.activeElement?.tagName ?? null };
    });
    await expect
      .poll(async () => {
        await page.clock.runFor(32);
        return (await page.locator("[data-film-window]").count()) > 0 ? filmTime(page) : 0;
      }, { timeout: 60_000 })
      .toBeGreaterThan(0);

    const faults: string[] = [];
    let at = await filmTime(page);
    let samples = 0;
    while (at < 10800) {
      await page.clock.runFor(100);
      at = await filmTime(page);
      samples += 1;
      for (const fault of await frameFaults(page)) faults.push(`${Math.round(at)}ms: ${fault}`);
      const now = await page.evaluate(() => ({
        scroll: document.querySelector<HTMLElement>("[data-app-shell-pane]")!.scrollTop,
        focus: document.activeElement?.tagName ?? null,
      }));
      if (now.scroll !== before.scroll) faults.push(`${Math.round(at)}ms: the page scrolled from ${before.scroll} to ${now.scroll}`);
      if (now.focus !== before.focus) faults.push(`${Math.round(at)}ms: focus moved to ${now.focus}`);
    }
    expect(samples, "probe: the loop was sampled through to its end").toBeGreaterThan(80);
    expect(faults).toEqual([]);
  });
}
