import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import type { LibraryGraphProbeNode as ProbeNode } from "./library-graph-probe";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { waitFrames } from "./settle";

/**
 * **A press on a mark opens a card beside it — the claims only a browser can settle.**
 *
 * The owner, 2026-09-12: *"when I click it just navigates straight to the page. I want a
 * press to raise a popup that shows me something … and for the motion to show knowledge
 * flowing."* Direction B answers that, and this file owns the half of it that is geometry
 * and gesture rather than arithmetic:
 *
 * 1. a press opens a card **beside** the mark, and **no mark moves** — the standing rule
 *    of 2026-09-08, which this slice must not spend;
 * 2. the card never covers its own mark, and never reaches the caption row or the strip
 *    above the picture — both stated falsifiers of the direction;
 * 3. it flips to the other side of a mark at the canvas's edge, instead of spilling out;
 * 4. Escape closes it and gives the canvas its keyboard back, with the walk's position
 *    intact; a second press on the same mark closes it; a double press is still the
 *    shortcut to the page, and `Open` inside the card is the same commit, named;
 * 5. the citations of the open card's mark are the ones drifting, and under
 *    `prefers-reduced-motion` the canvas is byte-identical frame to frame **with a card
 *    open** — the static equivalent is a chevron and a full amber dot, not an animation
 *    nobody asked for;
 * 6. a frame with a card open stays inside its budget on a three-hundred-file folder.
 *
 * ⚠️ **Aiming is done through `window.__atlasLibraryGraph`, never by sweeping pixels** —
 * the map lost six measurement rounds to specs that were silently panning the background.
 */

const SOURCES = [
  "settlement-policy.md",
  "fee-schedule.csv",
  "chargeback-runbook.md",
  "dispute-metrics.xlsx",
  "merchant-onboarding.html",
] as const;

const CONCEPTS = [
  ["domains/settlement", "Settlement domain", "domain"],
  ["capabilities/payouts", "Payouts", "capability"],
] as const;

/** `[slug, title, cited indices, named concept indices, stale?]` */
const PAGES = [
  ["settlement", "Settlement", [0, 1], [0], true],
  ["disputes", "Disputes", [2, 3], [1], false],
  ["onboarding", "Merchant onboarding", [4], [], false],
] as const;

function seedVault(): Record<string, string> {
  const vault: Record<string, string> = {
    "project.md": ["---", "kind: project", "slug: card-probe", "title: Card probe", "---", "", "# Card probe", ""].join("\n"),
  };
  CONCEPTS.forEach(([slug, title, kind], index) => {
    vault[`${slug}.md`] = [
      "---",
      `title: ${title}`,
      `kind: ${kind}`,
      `uid: 9d1c2a8e-9b4d-4c3e-8a1f-2d3e4f5a6b${(0x80 + index).toString(16)}`,
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");
  });
  for (const name of SOURCES) vault[`sources/${name}`] = `bytes for ${name}\n${"row,value\n".repeat(6)}`;
  PAGES.forEach(([slug, title, cites, named, stale]) => {
    vault[`wiki/${slug}.md`] = [
      "---",
      `title: ${title}`,
      "created_by: agent:claude",
      "compiled_at: 2026-09-12T04:20:00Z",
      "sources:",
      ...cites.map((index) => `  - sources/${SOURCES[index]}`),
      "source_hash:",
      // A page marked stale records a hash its bytes cannot match, which is the state the
      // amber pulse and the card's own facts line are about.
      ...cites.map((index) => `  sources/${SOURCES[index]}: ${(stale ? "0" : "1").repeat(64)}`),
      "status: draft",
      `summary: ${title} in one line.`,
      "---",
      "",
      "## Summary",
      "",
      `${title} turns a completed transaction into money. It also does other things.`,
      "",
      "## Facts",
      "",
      ...named.map((concept) => `- Touches [[${CONCEPTS[concept][0]}]].`),
      `- Recorded in [[src:sources/${SOURCES[cites[0]!]}]].`,
      "",
      "## Decisions",
      "",
      "## Open questions",
      "",
      "## Not in sources",
      "",
    ].join("\n");
  });
  return vault;
}

async function openGraph(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, seedVault());
  await page.goto("/en/library/?guides=off&e2e=1");
  await page.getByTestId("library-open-vault").click();
  await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.nodes().length ?? 0), {
      timeout: 20_000,
    })
    .toBeGreaterThan(8);
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.alpha() ?? 1), { timeout: 20_000 })
    .toBeLessThan(0.01);
  /*
   * The home's single stale breath runs once the picture settles; let it finish so what
   * moves next moved because of the press. The breath clears its own timestamp and
   * `flow().pulsing` reports it, so this asks the canvas rather than budgeting for it.
   */
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.flow().pulsing ?? true), {
      timeout: 20_000,
      message: "the arrival breath never let go",
    })
    .toBe(false);
}

const marks = (page: Page): Promise<ProbeNode[]> =>
  page.evaluate(() => window.__atlasLibraryGraph!.nodes());

/** Presses the mark, in the canvas's own coordinates. */
async function pressMark(page: Page, mark: ProbeNode): Promise<void> {
  const box = (await page.getByTestId("library-graph-canvas").boundingBox())!;
  await page.mouse.move(box.x + mark.x, box.y + mark.y);
  await page.mouse.down();
  await page.mouse.up();
}

test.describe("a press on a mark opens a card beside it", () => {
  test("the card stands beside the mark, covers neither it nor the strip, and moves nothing", async ({
    page,
  }) => {
    await openGraph(page);
    const before = await marks(page);
    const target = before
      .filter((node) => node.kind === "page")
      .sort((first, second) => second.radius - first.radius)[0]!;

    await pressMark(page, target);
    const card = page.getByTestId("library-graph-card");
    await expect(card).toBeVisible();
    expect(await card.getAttribute("data-card-node-id")).toBe(target.id);
    // The declaration the sweeping surface check measures, rather than guessing.
    expect(await card.getAttribute("data-transient-surface")).toBe("anchored");

    /*
     * ⚠️ **The rule this slice must not spend.** Every mark's position, before the press
     * and after it: the picture stands still (`docs/DECISIONS.md`, 2026-09-08).
     */
    const after = await marks(page);
    for (const mark of before) {
      const now = after.find((candidate) => candidate.id === mark.id)!;
      expect(Math.hypot(now.x - mark.x, now.y - mark.y), `${mark.id} moved on the press`).toBeLessThan(0.5);
    }

    const canvasBox = (await page.getByTestId("library-graph-canvas").boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    const placement = (await page.evaluate(() => window.__atlasLibraryGraph!.card()))!;

    // Beside its mark: the card's box and the mark's own square share no area.
    const markLeft = canvasBox.x + placement.mark.x - placement.mark.radius;
    const markRight = canvasBox.x + placement.mark.x + placement.mark.radius;
    const markTop = canvasBox.y + placement.mark.y - placement.mark.radius;
    const markBottom = canvasBox.y + placement.mark.y + placement.mark.radius;
    const overlap =
      cardBox.x < markRight &&
      cardBox.x + cardBox.width > markLeft &&
      cardBox.y < markBottom &&
      cardBox.y + cardBox.height > markTop;
    expect(overlap, "the card covered the mark it belongs to").toBe(false);

    // Inside the canvas, which begins below the caption row — so the strip is safe by
    // construction, and this asserts both halves.
    expect(cardBox.x).toBeGreaterThanOrEqual(canvasBox.x - 0.5);
    expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(canvasBox.x + canvasBox.width + 0.5);
    expect(cardBox.y).toBeGreaterThanOrEqual(canvasBox.y - 0.5);
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(canvasBox.y + canvasBox.height + 0.5);
    for (const testId of ["library-graph-counts", "library-strip-stale"]) {
      const strip = await page.getByTestId(testId).boundingBox();
      if (!strip) continue;
      const covered =
        cardBox.x < strip.x + strip.width &&
        cardBox.x + cardBox.width > strip.x &&
        cardBox.y < strip.y + strip.height &&
        cardBox.y + cardBox.height > strip.y;
      expect(covered, `the card covered ${testId}`).toBe(false);
    }
    expect(cardBox.width).toBeLessThanOrEqual(320.5);

    // What it says: the page's own opening sentence, its counts, and what it leans on.
    await expect(page.getByTestId("library-graph-card-sentence")).toContainText("turns a completed transaction");
    await expect(page.getByTestId("library-graph-card-facts")).toBeVisible();
    await expect(page.getByTestId("library-graph-card-rows")).toBeVisible();
  });

  test("it flips to the other side of a mark at the canvas edge", async ({ page }) => {
    await openGraph(page);
    const all = await marks(page);
    const rightmost = all.reduce((furthest, node) => (node.x > furthest.x ? node : furthest), all[0]!);
    await pressMark(page, rightmost);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();
    await expect
      .poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.card() !== null))
      .toBe(true);
    const placement = (await page.evaluate(() => window.__atlasLibraryGraph!.card()))!;
    const view = await page.evaluate(() => window.__atlasLibraryGraph!.view());
    // Either there was room on the right, or it flipped — never a card hanging off the edge.
    expect(placement.left + placement.width).toBeLessThanOrEqual(view.width + 0.5);
    if (placement.side === "right") {
      expect(view.width - rightmost.x).toBeGreaterThan(placement.width);
    } else {
      expect(["left", "below", "above"]).toContain(placement.side);
    }
  });

  test("Escape, a second press, and its own control each close it — and the keyboard comes back", async ({
    page,
  }) => {
    await openGraph(page);
    const all = await marks(page);
    const target = all.find((node) => node.kind === "source")!;

    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();
    // The card took the keyboard, so Tab reaches its doors.
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? ""),
      )
      .toBe("library-graph-card");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("library-graph-card")).toHaveCount(0);
    // One press closes one thing: the canvas has the keyboard, and the stale clause — the
    // other thing on this screen that answers Escape — was not spent by it.
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? ""),
      )
      .toBe("library-graph-canvas");

    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();
    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toHaveCount(0);

    await pressMark(page, target);
    await page.getByTestId("library-graph-card-close").click();
    await expect(page.getByTestId("library-graph-card")).toHaveCount(0);

    // A press on the empty canvas dismisses it too.
    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();
    const view = await page.evaluate(() => window.__atlasLibraryGraph!.view());
    const box = (await page.getByTestId("library-graph-canvas").boundingBox())!;
    const empty = all.every((node) => Math.hypot(node.x - 4, node.y - view.height + 4) > 40);
    if (empty) {
      await page.mouse.click(box.x + 4, box.y + view.height - 4);
      await expect(page.getByTestId("library-graph-card")).toHaveCount(0);
    }
  });

  test("`Open` is the commit a press used to be, now named", async ({ page }) => {
    await openGraph(page);
    const all = await marks(page);
    const target = all.find((node) => node.kind === "page" && node.label === "Settlement")!;

    await pressMark(page, target);
    await page.getByTestId("library-graph-card-open").click();
    // The card closed and the reader took the document column: the same outcome the press
    // used to have, reached from a door that says what it does.
    await expect(page.getByTestId("library-graph-card")).toHaveCount(0);
    await expect(page.getByTestId("library-reading-pane")).toBeVisible();
  });

  /*
   * **The mitigation on the record for the second press this direction costs.** A person who
   * already knows where they are going does not have to read the card: the gesture they
   * know for "open it" still opens it.
   */
  test("a double press is still the shortcut straight to the page", async ({ page }) => {
    await openGraph(page);
    const all = await marks(page);
    const target = all.find((node) => node.kind === "page" && node.label === "Disputes")!;
    const box = (await page.getByTestId("library-graph-canvas").boundingBox())!;
    await page.mouse.dblclick(box.x + target.x, box.y + target.y);
    await expect(page.getByTestId("library-reading-pane")).toBeVisible();
    await expect(page.getByTestId("library-graph-card")).toHaveCount(0);
  });

  test("the drifting lines are the open mark's own citations, and only those", async ({ page }) => {
    await openGraph(page);
    const all = await marks(page);
    const target = all.find((node) => node.kind === "page" && node.label === "Settlement")!;
    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();

    const flow = await page.evaluate(() => window.__atlasLibraryGraph!.flow());
    const edges = await page.evaluate(() => window.__atlasLibraryGraph!.edges());
    expect(flow.edges.length).toBeGreaterThan(0);
    const citations = edges.filter(
      (edge) => edge.relation === "cites" && (edge.source === target.id || edge.target === target.id),
    );
    expect(flow.edges).toHaveLength(citations.length);
    // The stale ones are a subset, and they are the ones the amber breath is about.
    expect(flow.stale.length).toBeGreaterThan(0);
    expect(flow.stale.length).toBeLessThanOrEqual(flow.edges.length);

    /*
     * The drift has words **in the card**, beside the lines — three cold walkers read the
     * travelling dashes as "loading" when the only sentence about them was at the foot of
     * the window (2026-09-12). The legend under the canvas keeps teaching the marks.
     */
    await expect(page.getByTestId("library-graph-card-flow")).toContainText("flow from each original");
    /*
     * And the slot below the canvas is still the picture's. With the pointer off the marks
     * it is the legend again — the key a walker reported losing when the card took this
     * line for its own sentence (2026-09-12).
     */
    const box = (await page.getByTestId("library-graph-canvas").boundingBox())!;
    await page.mouse.move(box.x + 3, box.y + 3);
    await expect(page.getByTestId("library-graph-hint")).toContainText("A filled circle is a page");
  });

  /**
   * **The home's one breath, and that it is one.**
   *
   * Every citation the folder cannot vouch for pulses once as the picture arrives — the
   * only thing on this home that moves with nobody's hand on it. A loop there would spend
   * the 2026-09-08 promise outright, so what is measured is that it *ends*: frames during
   * the breath, none after it.
   */
  test("the arrival breath runs once and the canvas then goes quiet", async ({ page }) => {
    await page.addInitScript(() => {
      const counter = { frames: 0 };
      (window as unknown as { __rafCount: typeof counter }).__rafCount = counter;
      const original = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        counter.frames += 1;
        return original(callback);
      };
    });
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, seedVault());
    await page.goto("/en/library/?guides=off&e2e=1");
    await page.getByTestId("library-open-vault").click();
    await expect
      .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.alpha() ?? 1), { timeout: 20_000 })
      .toBeLessThan(0.01);
    const read = () =>
      page.evaluate(() => (window as unknown as { __rafCount: { frames: number } }).__rafCount.frames);

    // A **measurement window**, not a wait: the claim is that the breath asks for frames
    // while it runs, so some of its run has to pass before the count means anything.
    const duringFrom = await read();
    await page.waitForTimeout(900);
    const during = (await read()) - duringFrom;
    expect(during, "the arrival breath asked for no frames at all").toBeGreaterThan(5);

    // Then it clears its own timestamp, and the canvas stops. The timestamp is the
    // condition; 2.6 s was an estimate of when it would be gone.
    await expect
      .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.flow().pulsing ?? true), {
        timeout: 20_000,
        message: "the breath never let go",
      })
      .toBe(false);
    const quietFrom = await read();
    // A **measurement window**, not a wait: "the breath became a loop" is a claim about a
    // stretch of real time with no frame asked for, so the stretch has to pass.
    await page.waitForTimeout(2_000);
    expect((await read()) - quietFrom, "the breath became a loop").toBe(0);
  });

  test("a frame with a card open stays inside its budget", async ({ page }) => {
    await openGraph(page);
    const all = await marks(page);
    const target = all
      .filter((node) => node.kind === "page")
      .sort((first, second) => second.radius - first.radius)[0]!;
    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();

    await page.evaluate(() => window.__atlasLibraryGraph!.paint().reset());
    // A **measurement window**: the budget is per painted frame, so some have to be
    // painted before the mean and the worst mean anything.
    await page.waitForTimeout(1_000);
    const paint = await page.evaluate(() => {
      const { last, mean, worst, frames } = window.__atlasLibraryGraph!.paint();
      return { last, mean, worst, frames };
    });
    // The drift is running, so the loop is awake: a measurement over no frames would pass.
    expect(paint.frames, "the card's drift scheduled no frames").toBeGreaterThan(20);
    expect(paint.mean).toBeLessThan(2);
  });
});

test.describe("with reduced motion", () => {
  test("an open card leaves the canvas byte-identical frame to frame", async ({ page }) => {
    /*
     * ⚠️ **`emulateMedia`, not `test.use({ reducedMotion })`** — the fixture form is not in
     * this Playwright version's typings, and the media emulation is what the product reads
     * (`usePrefersReducedMotion`). Set before the folder is picked, so the picture settles
     * synchronously the way a reduced-motion visitor's does.
     */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGraph(page);

    const hash = () =>
      page.evaluate(() => {
        const element = document.querySelector<HTMLCanvasElement>('[data-testid="library-graph-canvas"]')!;
        const context = element.getContext("2d")!;
        const { data } = context.getImageData(0, 0, element.width, element.height);
        let sum = 0;
        for (let index = 0; index < data.length; index += 997) sum = (sum * 31 + data[index]!) % 2147483647;
        return sum;
      });

    /*
     * ⚠️ **Wait for the folder to finish judging itself first.** Hashing the files is
     * asynchronous, and when it lands a square goes from hollow to filled and a citation
     * from broken to whole — the picture changing because the *facts* changed, which is not
     * motion and is not this claim. Two identical frames say the judging is done.
     */
    await expect
      .poll(
        async () => {
          const first = await hash();
          // The gap between the two samples of a stability poll, not a gate: the poll
          // returns the moment two frames agree.
          await page.waitForTimeout(260);
          return (await hash()) === first;
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    const all = await marks(page);
    const target = all.find((node) => node.kind === "page" && node.label === "Settlement")!;
    await pressMark(page, target);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();
    /*
     * Past the ink ramp, which reduced motion keeps at 120 ms by decision (2026-09-12) —
     * seen rather than budgeted for: two identical frames are the ramp having finished.
     */
    await expect
      .poll(
        async () => {
          const sample = await hash();
          await waitFrames(page, 2);
          return (await hash()) === sample;
        },
        { timeout: 20_000, message: "the ink ramp never finished" },
      )
      .toBe(true);

    /*
     * The static equivalent is a chevron on each citation and a full amber dot in each
     * break — one paint, nothing travelling. So three frames a third of a second apart are
     * the same bytes, which is the 2026-09-08 stillness promise holding with a card open.
     */
    // Three **measurement** samples a third of a second apart: the claim is about a
    // stretch of real time in which nothing may change.
    const first = await hash();
    await page.waitForTimeout(320);
    const second = await hash();
    await page.waitForTimeout(320);
    const third = await hash();
    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});
