import { expect, test, type Page } from "@playwright/test";

import { waitForAnimationsDone } from "../settle";
import { goToMap, harnessCalls, otherSessions, rail, readPage, startCheck, THREE_FINDINGS } from "./library-check-run-fixture";

/** Every top-level tab but the Library, where the walk starts; the map is visited again with its dock. */
const WALK_TABS = ["map", "architecture", "planning", "automations", "projects", "agents", "changes", "git"] as const;

interface CardFrame { t: number; card: number; opacity: number; pages: number; seconds: number }

/** Records the card on every animation frame: which element it is, how opaque, and its numbers. */
async function startFrameLog(page: Page) {
  await page.evaluate(() => {
    const log = window as unknown as { __cardFrames: unknown[]; __cardFramesOn: boolean };
    const ids = new WeakMap<Element, number>();
    let cards = 0;
    log.__cardFrames = [];
    log.__cardFramesOn = true;
    const tick = (t: number) => {
      const card = document.querySelector('[data-testid="work-run-card"][data-state="open"]');
      if (card && !ids.has(card)) ids.set(card, ++cards);
      const figures = card?.querySelector('[data-testid="work-run-figures"]')?.textContent ?? "";
      const minutes = Number(/(\d+)\s*m(?!s)/.exec(figures)?.[1] ?? 0);
      log.__cardFrames.push({
        t,
        card: card ? ids.get(card)! : 0,
        opacity: card ? Number(window.getComputedStyle(card).opacity) : 0,
        pages: Number(/(\d+) pages? read/.exec(figures)?.[1] ?? 0),
        seconds: minutes * 60 + Number(/(\d+)\s*s\b/.exec(figures)?.[1] ?? 0),
      });
      if (log.__cardFramesOn) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
}

async function stopFrameLog(page: Page): Promise<CardFrame[]> {
  return page.evaluate(() => {
    const log = window as unknown as { __cardFrames: CardFrame[]; __cardFramesOn: boolean };
    log.__cardFramesOn = false;
    return log.__cardFrames;
  });
}

/** Points of the card something else is drawn over, and docks or panels its box overlaps. */
function cardCover(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[data-testid="work-run-card"][data-state="open"]');
    if (!card) return ["no card"];
    const box = card.getBoundingClientRect();
    const misses: string[] = [];
    for (const x of [0.1, 0.5, 0.9]) for (const y of [0.15, 0.5, 0.85]) {
      const hit = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
      if (!hit || !card.contains(hit)) misses.push(`${x},${y}: ${hit?.getAttribute("data-testid") ?? hit?.tagName ?? "nothing"}`);
    }
    const panels = document.querySelectorAll<HTMLElement>('[data-toast-wall="right"], [data-testid="library-agent-dock-frame"]');
    for (const panel of panels) {
      if (panel.closest('[aria-hidden="true"]') || Number(window.getComputedStyle(panel).opacity) < 0.05) continue;
      const rect = panel.getBoundingClientRect();
      if (rect.width > 0 && rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top) {
        misses.push(`overlaps ${panel.getAttribute("data-testid") ?? panel.tagName}`);
      }
    }
    return misses;
  });
}

/**
 * A wiki check belongs to the app session, not to the Library screen: leaving keeps the agent's
 * turn, the card elsewhere carries it, and Stop on that card ends it without a log line.
 */
test.describe("a wiki check keeps running away from the Library", () => {
  test("finishes while the map is open and leaves its findings unread in the Library", async ({ page }) => {
    const harness = await startCheck(page);
    await goToMap(page);
    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-phase", "running");
    await expect(rail(page).getByTestId("app-nav-rail-ring-library")).toBeVisible();

    await waitForAnimationsDone(card);
    const runningBox = await card.boundingBox();
    await harness.read(page);
    await harness.answer(page, THREE_FINDINGS);

    expect(await harnessCalls(page), "leaving the Library ended the agent's turn").not.toContain("acp_stop");
    await expect.poll(async () => (await harness.snapshot(page)).writes.map((write) => write.relativePath), { message: "a finished check logs itself" }).toContain("wiki/_log.md");
    await expect(card).toHaveAttribute("data-phase", "found");
    await expect(page.getByTestId("work-run-title")).toHaveText("3 findings on 3 pages");
    await waitForAnimationsDone(card);
    expect(await card.boundingBox(), "the card changed its box when the result replaced the run").toEqual(runningBox);
    await expect(rail(page).getByTestId("app-nav-rail-ring-library")).toHaveCount(0);
    const libraryTile = rail(page).getByTestId("app-nav-rail-item-library");
    await expect(libraryTile).toHaveAttribute("data-work-run", "finished");
    await expect(libraryTile).toContainText("1");

    await libraryTile.click();
    await expect(page.getByTestId("library-report-unseen")).toBeVisible();
    await page.getByTestId("library-open-report").click();
    await expect(page.getByTestId("library-finding")).toHaveCount(3);
    await expect(page.getByTestId("library-report-unseen")).toHaveCount(0);
    await expect(rail(page).getByTestId("app-nav-rail-item-library")).not.toHaveAttribute("data-work-run");
  });

  test("stops from the card elsewhere and writes nothing to the wiki log", async ({ page }) => {
    const harness = await startCheck(page);
    await goToMap(page);
    const writesBefore = (await harness.snapshot(page)).writes.length;

    await page.getByTestId("work-run-stop").click();
    await expect(page.getByTestId("work-run-card")).toHaveCount(0);
    await expect(rail(page).getByTestId("app-nav-rail-ring-library")).toHaveCount(0);
    await expect.poll(() => harnessCalls(page), { message: "Stop reaches the agent as a cancel" }).toContain("session/cancel");
    expect(await harnessCalls(page)).not.toContain("acp_stop");

    await rail(page).getByTestId("app-nav-rail-item-library").click();
    await page.getByTestId("library-open-report").click();
    await expect(page.getByTestId("library-check-lede")).toHaveText("You stopped this check. Nothing was reported, and no file was changed.");
    const writes = (await harness.snapshot(page)).writes.slice(writesBefore).map((write) => write.relativePath);
    expect(writes, "a stopped check wrote a log line").not.toContain("wiki/_log.md");
  });

  test("keeps the same turn and the same card through every tab and the map's own conversation", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await startCheck(page);
    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-state", "open");
    await waitForAnimationsDone(card);
    await startFrameLog(page);

    let read = 0;
    const readAndSee = async (where: string) => {
      read += 1;
      await readPage(page, `wiki/walk-${read}.md`);
      await expect(page.getByTestId("work-run-figures"), `the count on ${where}`).toContainText(`${read} page${read === 1 ? "" : "s"} read`);
      // Dev server only: Next's badge floats at the bottom right; the exported app has none.
      await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
      await expect.poll(() => cardCover(page), { message: `something covers the card on ${where}` }).toEqual([]);
    };

    await readAndSee("the Library");
    for (const tab of WALK_TABS) {
      await rail(page).getByTestId(`app-nav-rail-item-${tab}`).click();
      await expect(rail(page).getByTestId(`app-nav-rail-item-${tab}`)).toHaveAttribute("aria-current", "page");
      await readAndSee(tab);
    }
    await goToMap(page);
    await page.getByTestId("topology-vault-agent-toggle").click();
    await expect.poll(async () => (await otherSessions(page)).opened, { message: "the map's conversation starts its own session" }).toBe(1);
    await readAndSee("the map with its conversation open");
    await page.getByTestId("topology-vault-agent-toggle").click();
    await rail(page).getByTestId("app-nav-rail-item-library").click();
    await readAndSee("the Library again");

    const frames = await stopFrameLog(page);
    expect(await harnessCalls(page), "a move ended the check's turn").not.toContain("acp_stop");
    expect((await harnessCalls(page)).filter((method) => method === "session/prompt"), "a move restarted the check").toHaveLength(1);
    expect(new Set(frames.map((frame) => frame.card)), "the card remounted or went missing on a frame").toEqual(new Set([1]));
    expect(frames.filter((frame) => frame.opacity < 0.99).map((frame) => `${Math.round(frame.t)}ms: ${frame.opacity.toFixed(2)}`), "the card flashed").toEqual([]);
    const counts = frames.map((frame) => frame.pages);
    const seconds = frames.map((frame) => frame.seconds);
    expect(counts.some((count, index) => index > 0 && count < counts[index - 1]!), "the count went back").toBe(false);
    expect(seconds.some((value, index) => index > 0 && value < seconds[index - 1]!), "the time went back").toBe(false);
    expect(counts.at(-1)).toBe(read);
    const longest = Math.max(...frames.slice(1).map((frame, index) => frame.t - frames[index]!.t));
    test.info().annotations.push({ type: "longest frame interval (ms)", description: String(Math.round(longest)) });
    // A local exported build is the instrument: dev compiles each route on its first visit, and a
    // shared CI runner composites in software, so both only report the number above.
    if (process.env.PLAYWRIGHT_STATIC && !process.env.CI) {
      expect(longest, "a frame took longer than the motion rule allows").toBeLessThanOrEqual(50);
    }
  });
});
