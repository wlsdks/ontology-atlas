import { expect, test, type Page } from "@playwright/test";

import { waitForAnimationsDone } from "../settle";
import {
  answers,
  askWrite,
  goToMap,
  harnessCalls,
  ignoreCancel,
  logEntries,
  processes,
  rail,
  startWritingTurn,
  wikiPage,
  writesTo,
} from "./library-turn-run-fixture";

/** Every top-level tab but the Library, where the walk starts. */
const WALK_TABS = ["map", "architecture", "planning", "automations", "projects", "agents", "changes", "git"] as const;

const card = (page: Page) => page.getByTestId("work-run-card");

async function longestFrameDuring(page: Page, walk: () => Promise<void>) {
  await page.evaluate(() => {
    const log = window as unknown as { __frames: number[]; __framesOn: boolean };
    log.__frames = [];
    log.__framesOn = true;
    const tick = (t: number) => {
      log.__frames.push(t);
      if (log.__framesOn) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
  await walk();
  const frames = await page.evaluate(() => {
    const log = window as unknown as { __frames: number[]; __framesOn: boolean };
    log.__framesOn = false;
    return log.__frames;
  });
  return Math.max(...frames.slice(1).map((t, index) => t - frames[index]!));
}

/**
 * A Library turn that may write belongs to the app session: leaving keeps it, the card elsewhere
 * carries it and its requests, Stop is enforced, and no second agent writes the same folder.
 */
test.describe("a writing Library turn keeps running away from the Library", () => {
  test("finishes on the map, naming the page it wrote", async ({ page }) => {
    await startWritingTurn(page, { writeMode: "auto" });
    await goToMap(page);
    await expect(card(page)).toHaveAttribute("data-phase", "running");
    await waitForAnimationsDone(card(page));
    const runningBox = await card(page).boundingBox();

    const asked = await askWrite(page, "wiki/architecture.md", wikiPage("Architecture"));
    await expect.poll(() => answers(page), { message: "the standing choice answers a fitting page" }).toEqual({ [asked]: "allow" });
    await expect(page.getByTestId("work-run-figures")).toContainText("1 file written");
    await harnessAnswer(page, "Wrote the architecture page.");

    await expect(card(page)).toHaveAttribute("data-phase", "written");
    await expect(page.getByTestId("work-run-title")).toHaveText("1 file written");
    await expect(page.getByTestId("work-run-detail")).toHaveText("Claude Agent wrote wiki/architecture.");
    await waitForAnimationsDone(card(page));
    expect(await card(page).boundingBox(), "the card changed its box when the result replaced the run").toEqual(runningBox);
    expect(await harnessCalls(page), "leaving the Library ended the agent's turn").not.toContain("acp_stop");
    expect(await logEntries(page), "the turn's log entry").toBe(1);

    await page.getByTestId("work-run-open-page").click();
    await expect(page).toHaveURL(/\/library\//);
    await expect(page.getByTestId("library-page")).toBeVisible();
  });

  test("a request while away waits on the card, and Review shows it in the Library conversation", async ({ page }) => {
    await startWritingTurn(page);
    await goToMap(page);
    await askWrite(page, "wiki/architecture.md");
    await expect(card(page)).toHaveAttribute("data-phase", "asking");
    await expect(page.getByTestId("work-run-title")).toContainText("Waiting for permission");
    await expect(page.getByTestId("work-run-line")).toHaveText("Claude Agent wants to change wiki/architecture");
    await expect(rail(page).getByTestId("app-nav-rail-waiting-library")).toBeVisible();
    expect(await answers(page), "a request was answered without the person").toEqual({});

    await page.getByTestId("work-run-review").click();
    await expect(page).toHaveURL(/\/library\//);
    await expect(page.getByTestId("library-agent-dock")).toBeVisible();
    await expect(page.getByTestId("acp-permission-card")).toBeVisible();
  });

  test("Stop holds against an agent that ignores it: nothing more is allowed, and the process ends after the grace", async ({ page }) => {
    await startWritingTurn(page, { writeMode: "auto" });
    await askWrite(page, "wiki/architecture.md", wikiPage("Architecture"));
    await expect.poll(async () => Object.values(await answers(page))).toEqual(["allow"]);
    await goToMap(page);
    await ignoreCancel(page);
    await expect(page.getByTestId("work-run-figures")).toContainText("1 file written");

    await page.getByTestId("work-run-stop").click();
    await expect(page.getByTestId("work-run-title")).toHaveText("Stopping Claude Agent");
    await expect(card(page)).toHaveAttribute("data-phase", "stopping");
    await expect.poll(async () => (await processes(page)).cancels, { message: "Stop asks the agent to end" }).toBe(1);

    const later = await askWrite(page, "wiki/later.md", wikiPage("Later"));
    await expect.poll(async () => (await answers(page))[later], { message: "a request after Stop is refused, write mode auto or not" }).toBe("reject");
    await expect(card(page)).toHaveAttribute("data-phase", "stopping");

    await expect.poll(async () => (await processes(page)).stops, { message: "the process ends after the grace", timeout: 15_000 }).toBe(1);
    await expect(card(page)).toHaveAttribute("data-phase", "stopped");
    await expect(page.getByTestId("work-run-title")).toHaveText("Stopped after 1 file");
    expect(await writesTo(page, "wiki/later.md"), "a write after Stop reached the folder").toBe(0);
  });

  test("Stop on a waiting turn closes its request unanswered", async ({ page }) => {
    await startWritingTurn(page);
    await goToMap(page);
    await ignoreCancel(page);
    const waiting = await askWrite(page, "wiki/architecture.md");
    await page.getByTestId("work-run-review").click();
    await expect(page.getByTestId("acp-permission-card")).toBeVisible();

    await page.getByTestId("acp-chat-stop").click();
    await expect.poll(async () => (await answers(page))[waiting], { message: "the waiting request closes" }).toBe("reject");
    await expect(page.getByTestId("acp-permission-card")).toHaveCount(0);
    await expect.poll(async () => (await processes(page)).stops, { message: "the process ends after the grace", timeout: 15_000 }).toBe(1);
    expect(await writesTo(page, "wiki/architecture.md")).toBe(0);
  });

  test("a map conversation for the same folder waits for the turn and starts no agent", async ({ page }) => {
    await startWritingTurn(page);
    await goToMap(page);
    await page.getByTestId("topology-vault-agent-toggle").click();
    await expect(page.getByTestId("acp-folder-busy")).toBeVisible();
    expect((await processes(page)).starts, "a second agent started for the folder").toBe(1);

    await page.getByTestId("acp-folder-busy-stop").click();
    await expect.poll(async () => (await processes(page)).cancels, { message: "Stop from the waiting dock reaches the agent" }).toBe(1);
    await expect(page.getByTestId("acp-folder-busy")).toHaveCount(0);
    await expect.poll(async () => (await processes(page)).starts, { message: "the map's conversation starts once the turn has ended" }).toBe(2);
  });

  test("returning to the Library mid-turn brings the conversation back, keeps the doors closed, and logs once", async ({ page }) => {
    await startWritingTurn(page, { writeMode: "auto" });
    await goToMap(page);
    await rail(page).getByTestId("app-nav-rail-item-library").click();
    await expect(page.getByTestId("library-agent-dock")).toBeVisible();
    await page.getByTestId("library-workspace-sources").click();
    await expect(page.getByTestId("library-progress-continue")).toBeDisabled();
    await expect(card(page)).toHaveCount(0);

    await askWrite(page, "wiki/architecture.md", wikiPage("Architecture"));
    await expect.poll(() => writesTo(page, "wiki/architecture.md")).toBe(1);
    await harnessAnswer(page, "Wrote the architecture page.");
    await expect.poll(() => logEntries(page), { message: "the turn's log entry" }).toBe(1);
    await expect(page.getByTestId("library-progress-continue")).toBeEnabled();
    expect((await harnessCalls(page)).filter((method) => method === "session/prompt"), "the return restarted the turn").toHaveLength(1);
  });

  test("keeps one turn and one card through every tab", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await startWritingTurn(page, { writeMode: "auto" });
    await goToMap(page);
    await waitForAnimationsDone(card(page));
    const longest = await longestFrameDuring(page, async () => {
      let written = 0;
      for (const tab of WALK_TABS) {
        await rail(page).getByTestId(`app-nav-rail-item-${tab}`).click();
        await expect(rail(page).getByTestId(`app-nav-rail-item-${tab}`)).toHaveAttribute("aria-current", "page");
        written += 1;
        await askWrite(page, `wiki/walk-${written}.md`, wikiPage(`Walk ${written}`));
        await expect(page.getByTestId("work-run-figures"), `the count on ${tab}`).toContainText(`${written} file${written === 1 ? "" : "s"} written`);
      }
    });
    expect(await harnessCalls(page), "a move ended the turn").not.toContain("acp_stop");
    test.info().annotations.push({ type: "longest frame interval (ms)", description: String(Math.round(longest)) });
    // A local exported build is the instrument; dev compiles each route and CI composites in software.
    if (process.env.PLAYWRIGHT_STATIC && !process.env.CI) {
      expect(longest, "a frame took longer than the motion rule allows").toBeLessThanOrEqual(50);
    }
  });
});

async function harnessAnswer(page: Page, text: string) {
  await page.evaluate((answer) => (window as unknown as { __atlasLibraryWorkHarness?: { answer(text: string): void } }).__atlasLibraryWorkHarness?.answer(answer), text);
}
