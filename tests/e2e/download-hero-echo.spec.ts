import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **The typing echo** (Direction B, owner, 2026-08-30): the hero object assembles as the headline
 * is typed. What this gate measures is the falsifier the decision was recorded with — **the dots
 * lit are the characters typed**, read from two independent sources: the typed count from the
 * headline's DOM (`.gateway-type-ch.is-on`) and the lit count from the engine's own ledger
 * (`window.__heroEcho`, attached under `?e2e=1`). If the object ever goes back to a clock of its
 * own — a stage fade, a per-tier timer — the two counts stop agreeing mid-sentence.
 *
 * The second half is the pointer: a fine pointer on a dot prints one fact in the caption line, and
 * the line is **reserved** — its box is the same height empty and full, so a fact appearing never
 * moves the CTA column beside the stage.
 */

interface EchoWindow {
  lit: () => number;
  nodes: () => { s: string; k: string; x: number; y: number }[];
  count: number;
}

async function openHero(page: Page, reducedMotion: "reduce" | "no-preference") {
  await page.setViewportSize({ width: 1512, height: 945 });
  await page.emulateMedia({ reducedMotion });
  await seedFirstRunSeen(page);
  await page.goto("/en/download/?e2e=1&guides=off", { waitUntil: "load" });
  await page.waitForFunction(() => Boolean((window as unknown as { __heroEcho?: unknown }).__heroEcho));
}

const readEcho = (page: Page) =>
  page.evaluate(() => {
    const echo = (window as unknown as { __heroEcho: EchoWindow }).__heroEcho;
    // Scoped to the hero headline: the agent scene types too, with the same characters.
    // A character counts as typed when it is *visible*, not when it carries `is-on`: under reduced
    // motion the stylesheet's carve-out shows every character while React keeps the server's
    // classes, so the class would report a dark headline the reader can plainly read.
    const h1 = document.querySelector('[data-testid="gateway-hero"] h1');
    const chars = [...(h1?.querySelectorAll(".gateway-type-ch") ?? [])];
    const typed = chars.filter((c) => getComputedStyle(c).visibility === "visible").length;
    return { typed, total: chars.length, lit: echo.lit(), count: echo.count };
  });

test.describe("download hero — the typing echo", () => {
  test("the dots lit follow the characters typed, and both finish together", async ({ page }) => {
    await openHero(page, "no-preference");

    const samples: { typed: number; lit: number; count: number; total: number }[] = [];
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const s = await readEcho(page);
      samples.push(s);
      if (s.typed >= s.total && s.lit >= s.count) break;
      await page.waitForTimeout(40);
    }
    const last = samples.at(-1)!;
    expect(last.total, "the headline has characters").toBeGreaterThan(0);
    expect(last.count, "the object has dots").toBeGreaterThan(0);
    expect(last.typed, "the headline finished typing").toBe(last.total);
    expect(last.lit, "the last character lit the last dot").toBe(last.count);

    // Mid-sentence the echo is progressive: some sample has typed part of the sentence and lit
    // part of the object — not everything on one frame, not nothing until the end.
    const mid = samples.filter((s) => s.typed > 0 && s.typed < s.total);
    expect(mid.length, "typing was observed mid-sentence").toBeGreaterThan(0);
    expect(mid.some((s) => s.lit > 0 && s.lit < s.count), "the object was observed mid-assembly").toBe(true);

    // The lit count is the typed count's echo: it never exceeds what the typed count has earned
    // (ceil of the proportion) and never lags it by more than one keystroke's worth.
    for (const s of samples) {
      const earned = s.typed >= s.total ? s.count : Math.ceil((s.typed / s.total) * s.count);
      const earnedBefore = s.typed <= 1 ? 0 : Math.ceil(((s.typed - 1) / s.total) * s.count);
      expect(s.lit, `typed ${s.typed}/${s.total} lit ${s.lit}/${s.count}`).toBeLessThanOrEqual(earned);
      expect(s.lit, `typed ${s.typed}/${s.total} lit ${s.lit}/${s.count}`).toBeGreaterThanOrEqual(earnedBefore);
    }
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].lit, "dots are never put out").toBeGreaterThanOrEqual(samples[i - 1].lit);
    }
  });

  test("under reduced motion the sentence and the object are complete from the first frame", async ({ page }) => {
    await openHero(page, "reduce");
    // "Complete from the first frame" is measured as: the count is never partial. The first
    // sample may still be the server's dark headline before hydration; what must never appear is
    // a headline or an object part-way through, because one that merely finishes quickly is not
    // a still one.
    const seen: { typed: number; total: number; lit: number; count: number }[] = [];
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      const s = await readEcho(page);
      seen.push(s);
      if (s.typed === s.total && s.lit === s.count) break;
      await page.waitForTimeout(25);
    }
    const last = seen.at(-1)!;
    expect(last.typed).toBe(last.total);
    expect(last.lit).toBe(last.count);
    for (const s of seen) {
      expect(s.typed === 0 || s.typed === s.total, `a partial headline was drawn: ${s.typed}/${s.total}`).toBe(true);
      expect(s.lit === 0 || s.lit === s.count, `a partial object was drawn: ${s.lit}/${s.count}`).toBe(true);
    }
  });

  test("a fine pointer on a dot prints one fact, and the caption line keeps its box", async ({ page }) => {
    await openHero(page, "no-preference");
    await page.waitForFunction(() => {
      const echo = (window as unknown as { __heroEcho: EchoWindow }).__heroEcho;
      return echo.lit() >= echo.count;
    });

    const caption = page.getByTestId("gateway-hero-caption");
    const stage = page.getByTestId("gateway-hero-object");
    const before = { caption: await caption.boundingBox(), stage: await stage.boundingBox() };
    expect(before.caption, "the caption line is reserved while nothing is pointed at").not.toBeNull();
    expect(before.caption!.height).toBeGreaterThan(0);
    await expect(caption).toHaveText(/^\s*$/);

    // The apex is the one dot that never sits at the rim, so it is reachable at every yaw.
    const canvas = stage.locator("canvas");
    const box = (await canvas.boundingBox())!;
    const apex = await page.evaluate(() => {
      const echo = (window as unknown as { __heroEcho: EchoWindow }).__heroEcho;
      return echo.nodes().find((n) => n.k === "project") ?? null;
    });
    expect(apex, "the project apex is on screen").not.toBeNull();
    await page.mouse.move(box.x + apex!.x, box.y + apex!.y, { steps: 4 });
    await expect(caption).not.toHaveText(/^\s*$/);
    const text = (await caption.textContent()) ?? "";
    expect(text.length, "one fact, one line").toBeLessThan(120);

    const after = { caption: await caption.boundingBox(), stage: await stage.boundingBox() };
    expect(after.caption!.height, "the caption's box did not grow").toBe(before.caption!.height);
    expect(after.caption!.y, "the caption did not move").toBe(before.caption!.y);
    expect(after.stage!.height, "the stage did not move").toBe(before.stage!.height);
    // The fact stays inside its box — a long label is cut, never spilled.
    const fits = await caption.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, "the caption is not wider than its line").toBe(true);

    await page.mouse.move(box.x + box.width + 40, box.y + box.height + 40, { steps: 2 });
    await expect(caption).toHaveText(/^\s*$/);
    expect((await caption.boundingBox())!.height).toBe(before.caption!.height);
  });
});
