import { expect, test, type Page } from "@playwright/test";

import { waitForAnimationsDone, waitFrames } from "../settle";
import {
  goToMap,
  openFolderWithReview,
  rail,
  REVIEW,
  reviewAnswers,
  reviewReads,
  reviewSession,
  roundsFile,
  runReviewNow,
  startWikiCheck,
} from "./scheduled-run-fixture";

/** Every top-level tab from the map, where the walk starts, and back; Automations is the run's own stage. */
const WALK_TABS = ["library", "architecture", "planning", "projects", "agents", "changes", "git", "map"] as const;

interface CardFrame { t: number; path: string; card: number; opacity: number; documents: number; seconds: number }

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
      const figures = card?.querySelector('[data-work-run-layer="current"] [data-testid="work-run-figures"]')?.textContent ?? "";
      const minutes = Number(/(\d+)\s*m(?!s)/.exec(figures)?.[1] ?? 0);
      log.__cardFrames.push({
        t,
        card: card ? ids.get(card)! : 0,
        opacity: card ? Number(window.getComputedStyle(card).opacity) : 0,
        documents: Number(/(\d+) documents? checked/.exec(figures)?.[1] ?? 0),
        seconds: minutes * 60 + Number(/(\d+)\s*s\b/.exec(figures)?.[1] ?? 0),
        path: window.location.pathname,
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

/** Points of the card something else is drawn over. */
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
    return misses;
  });
}

/**
 * A scheduled check belongs to the app session: it runs above every route, the card carries it
 * on every screen but Automations, and its Stop ends the run while the schedule stays on.
 */
test.describe("a scheduled check keeps running and in view away from Automations", () => {
  test("finishes while the map is open, and its one door lands on the run in its history", async ({ page }) => {
    await openFolderWithReview(page);
    await runReviewNow(page);
    await expect(page.getByTestId("automations-run-stage"), "Automations is the run's stage").toBeVisible();
    await expect(page.getByTestId("work-run-card")).toHaveCount(0);

    await goToMap(page);
    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-run-kind", "scheduled");
    await expect(page.getByTestId("work-run-title")).toHaveText("Source gaps · scheduled check");
    await expect(rail(page).getByTestId("app-nav-rail-ring-automations")).toBeVisible();
    await reviewReads(page, "wiki/alpha.md");
    await reviewReads(page, "wiki/beta.md");
    await expect(page.getByTestId("work-run-line")).toHaveText("wiki/beta");
    await expect(page.getByTestId("work-run-figures")).toContainText("2 documents checked");
    await waitForAnimationsDone(card);
    const runningBox = await card.boundingBox();

    await reviewAnswers(page, "Two capabilities lack a source path.");
    await expect(card).toHaveAttribute("data-phase", "ended");
    await expect(page.getByTestId("work-run-title")).toHaveText("Source gaps · review complete");
    await expect(page.getByTestId("work-run-detail")).toHaveText("Two capabilities lack a source path.");
    await waitForAnimationsDone(card);
    expect(await card.boundingBox(), "the card changed its box when the result replaced the run").toEqual(runningBox);
    await expect(rail(page).getByTestId("app-nav-rail-ring-automations")).toHaveCount(0);
    const tile = rail(page).getByTestId("app-nav-rail-item-automations");
    await expect(tile).toHaveAttribute("data-work-run", "finished");
    await expect(rail(page).getByTestId("app-nav-rail-badge-automations")).toHaveText("1");

    await page.getByTestId("work-run-open-run").click();
    await expect(page).toHaveURL(/\/automations\/\?kind=ontology&round=r-review&run=/);
    const runId = new URL(page.url()).searchParams.get("run");
    const landed = page.locator(`[data-run-id="${runId}"]`);
    await expect(landed).toHaveAttribute("data-landed", "");
    await expect(landed).toBeFocused();
    await expect(landed).toContainText("Two capabilities lack a source path.");
    await expect(page.getByTestId("work-run-card")).toHaveCount(0);
    await expect(tile).not.toHaveAttribute("data-work-run");
  });

  test("stops from the card elsewhere and leaves the schedule on, as it was", async ({ page }) => {
    const harness = await openFolderWithReview(page);
    await runReviewNow(page);
    await goToMap(page);
    await expect(page.getByTestId("work-run-card")).toHaveAttribute("data-run-kind", "scheduled");

    await page.getByTestId("work-run-stop").click();
    await expect(page.getByTestId("work-run-card")).toHaveCount(0);
    await expect(rail(page).getByTestId("app-nav-rail-ring-automations")).toHaveCount(0);
    await expect.poll(async () => (await reviewSession(page))?.cancelled, { message: "Stop reaches the agent as a cancel" }).toBe(true);
    await expect.poll(async () => (await harness.snapshot(page)).files[".ontology-atlas/rounds-ledger.jsonl"] ?? "", { message: "the stopped run is written down" })
      .toContain('"note":"stopped"');
    const [saved] = (await roundsFile(harness, page)).rounds;
    expect(saved, "Stop paused or edited the schedule").toMatchObject({ id: REVIEW.id, name: REVIEW.name, enabled: true, cadence: REVIEW.cadence, query: REVIEW.query });

    await rail(page).getByTestId("app-nav-rail-item-automations").click();
    await page.getByTestId("automations-tab-ontology").click();
    await expect(page.getByTestId(`automation-${REVIEW.id}`)).toContainText("Scheduled");
    await expect(page.getByTestId("automations-last-run")).toContainText("This run was stopped before it finished.");
  });

  test("names the latest of two runs and lists both in a centred dialog", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await openFolderWithReview(page);
    await startWikiCheck(page);
    await runReviewNow(page);
    await goToMap(page);

    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-run-kind", "scheduled");
    await expect(page.getByTestId("work-run-title")).toHaveText("Source gaps · scheduled check");
    const more = page.getByTestId("work-run-more");
    await expect(more).toHaveText("1 more running");
    await expect(rail(page).getByTestId("app-nav-rail-ring-library")).toBeVisible();
    await expect(rail(page).getByTestId("app-nav-rail-ring-automations")).toBeVisible();

    // Dev server only: Next's badge floats at the bottom right; the exported app has none.
    await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
    await more.click();
    const dialog = page.getByTestId("work-runs-dialog");
    await expect(dialog).toBeVisible();
    await waitForAnimationsDone(dialog);
    const [dialogBox, viewport] = [await dialog.boundingBox(), page.viewportSize()];
    expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport!.width / 2), "the dialog stands in the middle").toBeLessThanOrEqual(1);
    const tabs = dialog.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByTestId("work-runs-pane-title")).toHaveText("Source gaps · scheduled check");
    await expect(dialog.locator("[aria-expanded], details")).toHaveCount(0);

    await tabs.first().press("ArrowDown");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(dialog.getByTestId("work-runs-pane-title")).toHaveText("Checking the wiki");

    await tabs.first().click();
    await dialog.getByTestId("work-runs-stop").click();
    await expect.poll(async () => (await reviewSession(page))?.cancelled).toBe(true);
    await expect(tabs).toHaveCount(1);
    await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByTestId("work-runs-pane-title")).toHaveText("Checking the wiki");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveAttribute("data-run-kind", "check");
    await expect(page.getByTestId("work-run-more")).toHaveCount(0);
  });

  test("keeps the same turn and the same card through every tab", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await openFolderWithReview(page);
    // The Library's first mount in a session costs about 60 ms of frame with no run at all; the
    // walk measures the card, so that route is opened once before the log starts.
    await rail(page).getByTestId("app-nav-rail-item-library").click();
    await expect(page).toHaveURL(/\/library\//);
    await runReviewNow(page);
    await goToMap(page);
    const card = page.getByTestId("work-run-card");
    await expect(card).toHaveAttribute("data-state", "open");
    await waitForAnimationsDone(card);
    await startFrameLog(page);

    let read = 0;
    const readAndSee = async (where: string) => {
      read += 1;
      await reviewReads(page, `wiki/walk-${read}.md`);
      await expect(page.getByTestId("work-run-figures"), `the count on ${where}`).toContainText(`${read} document${read === 1 ? "" : "s"} checked`);
      // Dev server only: Next's badge floats at the bottom right; the exported app has none.
      await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
      await expect.poll(() => cardCover(page), { message: `something covers the card on ${where}` }).toEqual([]);
    };

    for (const tab of WALK_TABS) {
      await rail(page).getByTestId(`app-nav-rail-item-${tab}`).click();
      await expect(rail(page).getByTestId(`app-nav-rail-item-${tab}`)).toHaveAttribute("aria-current", "page");
      await readAndSee(tab);
    }

    await waitFrames(page);
    const frames = await stopFrameLog(page);
    const session = await reviewSession(page);
    expect(session, "a move ended the review's turn").toMatchObject({ stopped: false, cancelled: false });
    expect(new Set(frames.map((frame) => frame.card)), "the card remounted or went missing on a frame").toEqual(new Set([1]));
    expect(frames.filter((frame) => frame.opacity < 0.99).map((frame) => `${Math.round(frame.t)}ms: ${frame.opacity.toFixed(2)}`), "the card flashed").toEqual([]);
    const counts = frames.map((frame) => frame.documents);
    const seconds = frames.map((frame) => frame.seconds);
    expect(counts.some((count, index) => index > 0 && count < counts[index - 1]!), "the count went back").toBe(false);
    expect(seconds.some((value, index) => index > 0 && value < seconds[index - 1]!), "the time went back").toBe(false);
    expect(counts.at(-1)).toBe(read);

    await rail(page).getByTestId("app-nav-rail-item-automations").click();
    await expect(page.getByTestId("work-run-card")).toHaveCount(0);
    await expect(page.getByTestId("automations-run-stage-figures")).toContainText(`${read} documents checked`);

    const intervals = frames.slice(1).map((frame, index) => ({ ms: frame.t - frames[index]!.t, path: frame.path }));
    const longest = intervals.reduce((worst, interval) => (interval.ms > worst.ms ? interval : worst));
    test.info().annotations.push({ type: "longest frame interval (ms)", description: `${Math.round(longest.ms)} on ${longest.path}` });
    // A local exported build is the instrument: dev compiles each route on its first visit, and a
    // shared CI runner composites in software, so both only report the number above.
    if (process.env.PLAYWRIGHT_STATIC && !process.env.CI) {
      expect(longest.ms, `a frame on ${longest.path} took longer than the motion rule allows`).toBeLessThanOrEqual(50);
    }
  });
});
