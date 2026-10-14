import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import type { LibraryGraphProbeNode as ProbeNode } from "./library-graph-probe";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import { waitFrames as frames } from "../../settle";

/**
 * A cheap hash of the whole canvas, so two frames can be compared exactly. Reading
 * pixels asks nothing of `requestAnimationFrame`, which matters in the case that
 * counts those calls.
 */
const canvasHash = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const element = document.querySelector<HTMLCanvasElement>('[data-testid="library-graph-canvas"]')!;
    const { data } = element.getContext("2d")!.getImageData(0, 0, element.width, element.height);
    let hash = 2166136261;
    for (let index = 0; index < data.length; index += 97) {
      hash ^= data[index]!;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  });


/**
 * Claims only a running browser can settle: drag, hover dim in canvas pixels, wheel scale, fit,
 * stillness at rest. Aim via `window.__atlasLibraryGraph`; `interaction()` tells grab from pan.
 */

/** Dense fixture: seven sources, six pages, each page citing four to seven sources. */
const SOURCES = [
  "quarter-plan.pdf",
  "budget.xlsx",
  "design-system.docx",
  "kickoff-notes.html",
  "release-dates.csv",
  "security-review.rtf",
  "customer-interviews.txt",
] as const;

const CONCEPTS = [
  ["domains/checkout", "Checkout", "domain"],
  ["domains/loyalty", "Loyalty", "domain"],
  ["capabilities/billing", "Billing", "capability"],
  ["capabilities/search", "Search", "capability"],
  ["domains/onboarding", "Onboarding", "domain"],
] as const;

const PAGES = [
  ["quarter-plan", "Quarter plan", [0, 1, 2, 3], [0, 2]],
  ["budget-review", "Budget review", [1, 2, 3, 4, 5], [2, 3]],
  ["release-notes", "Release notes", [2, 3, 4, 5, 6, 0], [1, 3, 4]],
  ["security-posture", "Security posture", [0, 4, 5, 6], [0, 4]],
  ["customer-themes", "Customer themes", [1, 3, 5, 6, 0, 2, 4], [1, 2]],
  ["design-decisions", "Design decisions", [2, 5, 6, 1, 0], [0, 3, 4]],
] as const;

function denseVault(): Record<string, string> {
  const vault: Record<string, string> = {
    "project.md": ["---", "kind: project", "slug: dense-demo", "title: Dense demo", "---", "", "# Dense demo", ""].join("\n"),
  };
  CONCEPTS.forEach(([slug, title, kind], index) => {
    vault[`${slug}.md`] = [
      "---",
      `title: ${title}`,
      `kind: ${kind}`,
      `uid: 5f1c2a8e-9b4d-4c3e-8a1f-2d3e4f5a6b${(0x70 + index).toString(16)}`,
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");
  });
  for (const name of SOURCES) vault[`sources/${name}`] = `bytes for ${name}\n`;
  PAGES.forEach(([slug, title, cites, mentions], index) => {
    vault[`wiki/${slug}.md`] = [
      "---",
      `title: ${title}`,
      "created_by: agent:claude",
      "compiled_at: 2026-09-06T10:00:00Z",
      "sources:",
      ...cites.map((source) => `  - sources/${SOURCES[source]}`),
      "source_hash:",
      // A third of the pages record a hash that cannot match, so the canvas also carries
      // the broken-citation mark rather than only confident lines.
      ...cites.map((source) => `  sources/${SOURCES[source]}: ${(index % 3 === 0 ? "0" : "1").repeat(64)}`),
      "status: draft",
      `summary: ${title}.`,
      "---",
      "",
      "## Summary",
      "",
      `${title} in one line.`,
      "",
      "## Facts",
      "",
      ...mentions.map((concept) => `- Touches [[${CONCEPTS[concept][0]}]].`),
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
  await stubDirectoryPicker(page, denseVault());
  // `e2e=1` opens the inspection window; `guides=off` keeps the first-run shelf from
  // covering the canvas and intercepting every pointer event.
  await page.goto("/en/library/?guides=off&e2e=1");
  await page.getByTestId("library-open-vault").click();
  await expect(page.getByTestId("library-graph-canvas")).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.nodes().length ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(10);
  // The picture is still arriving; wait for the simulation to come to rest so that what
  // moves next moved because of the gesture.
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.alpha() ?? 1), { timeout: 15_000 })
    .toBeLessThan(0.01);
  // The flow layout is laid, not settled, so the alpha is 0 from the first frame; the marks
  // still travel while the camera eases to its fit, and a press aimed at a mark read
  // mid-journey lands on canvas.
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.arriving() ?? true), { timeout: 20_000 })
    .toBe(false);
}

const nodes = (page: Page): Promise<ProbeNode[]> =>
  page.evaluate(() => window.__atlasLibraryGraph!.nodes());

test.describe("the library graph responds", () => {
  test("a drag on a mark moves the whole picture and no mark leaves its row", async ({ page }) => {
    await openGraph(page);
    const canvas = page.getByTestId("library-graph-canvas");
    const box = (await canvas.boundingBox())!;
    const before = await nodes(page);
    const target = before
      .filter((node) => node.kind === "source")
      .sort((first, second) => second.radius - first.radius)[0]!;

    await page.mouse.move(box.x + target.x, box.y + target.y);
    await page.mouse.down();
    // Past the 7px threshold in the first step, then a real path: one long jump is a
    // teleport, and the pointer state machine is entitled to read it as one.
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(box.x + target.x + step * 16, box.y + target.y + step * 10);
      await frames(page, 1);
    }

    /*
     * The picture is columns: a mark has a place, so a drag is a camera pan and every mark
     * travels by the same offset.
     */
    const holding = await page.evaluate(() => window.__atlasLibraryGraph!.interaction());
    expect(holding.kind, "a drag on a mark in the flow picture is a pan").toBe("pan");

    const during = await nodes(page);
    const moved = during.find((node) => node.id === target.id)!;
    const offset = { x: moved.x - target.x, y: moved.y - target.y };
    expect(Math.hypot(offset.x, offset.y), "the picture did not go with the hand").toBeGreaterThan(40);
    for (const node of before) {
      const now = during.find((candidate) => candidate.id === node.id)!;
      expect(
        Math.hypot(now.x - node.x - offset.x, now.y - node.y - offset.y),
        `${node.id} moved by a different offset than the picture`,
      ).toBeLessThan(0.5);
    }

    await page.mouse.up();
    await expect
      .poll(async () => page.evaluate(() => window.__atlasLibraryGraph!.interaction().kind))
      .toBe("idle");
  });

  test("hovering dims everything outside the neighbourhood, in the canvas's own pixels", async ({
    page,
  }) => {
    await openGraph(page);
    const canvas = page.getByTestId("library-graph-canvas");
    const box = (await canvas.boundingBox())!;
    const marks = await nodes(page);
    const target = marks
      .filter((node) => node.kind === "source")
      .sort((first, second) => second.radius - first.radius)[0]!;
    // A concept is never cited, so it is never in a source's neighbourhood: it is the
    // control group this measurement needs.
    const outsider = marks.find((node) => node.kind === "concept")!;

    /** Mean luminance of the mark's own pixels, read straight off the live canvas. */
    const inkAt = (point: { x: number; y: number }) =>
      page.evaluate(({ x, y }) => {
        const element = document.querySelector<HTMLCanvasElement>('[data-testid="library-graph-canvas"]')!;
        const context = element.getContext("2d")!;
        const dpr = element.width / element.getBoundingClientRect().width;
        const half = Math.round(12 * dpr);
        const { data } = context.getImageData(
          Math.round(x * dpr) - half,
          Math.round(y * dpr) - half,
          half * 2,
          half * 2,
        );
        let brightest = 0;
        for (let index = 0; index < data.length; index += 4) {
          brightest = Math.max(brightest, (data[index]! + data[index + 1]! + data[index + 2]!) / 3);
        }
        return brightest;
      }, point);

    const restingOutsider = await inkAt(outsider);
    const restingTarget = await inkAt(target);
    expect(restingOutsider, "the control mark was not drawn at all").toBeGreaterThan(40);

    await page.mouse.move(box.x + target.x, box.y + target.y);
    await page.mouse.move(box.x + target.x + 1, box.y + target.y);
    await expect(canvas).toHaveAttribute("data-hovered-node-id", target.id);
    /*
     * The dim ramps over `--motion-fast`. The assertion **is** the condition — the
     * outsider's ink is below 60% of its resting value — so it is polled rather than
     * slept in front of: no ramp budget is read or guessed here, and a slow machine
     * simply takes more frames to reach the same ink.
     */
    await expect
      .poll(() => inkAt(outsider), { message: "the dim never reached the outsider" })
      .toBeLessThan(restingOutsider * 0.6);
    const dimmedOutsider = await inkAt(outsider);
    const heldTarget = await inkAt(target);
    // Down to about 35%, so anything at or below 60% of its resting ink is the dim rather
    // than a rounding wobble — and the mark being pointed at kept its own.
    expect(dimmedOutsider).toBeLessThan(restingOutsider * 0.6);
    expect(heldTarget).toBeGreaterThan(restingTarget * 0.85);
  });

  test("the wheel zooms about the pointer and the fit control brings the picture back", async ({
    page,
  }) => {
    await openGraph(page);
    const canvas = page.getByTestId("library-graph-canvas");
    const box = (await canvas.boundingBox())!;
    const fitted = Number(await canvas.getAttribute("data-view-scale"));
    expect(fitted).toBeGreaterThan(0);

    /*
     * The wheel goes out: the zoom ceiling is absolute (1.6) and the fit is clamped into it, so zooming
     * in on a small folder is a no-op.
     */
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let notch = 0; notch < 4; notch += 1) {
      await page.mouse.wheel(0, 120);
      await frames(page, 1);
    }
    await expect.poll(async () => Number(await canvas.getAttribute("data-view-scale"))).toBeLessThan(fitted * 0.85);

    // The page itself did not scroll: the canvas took the gesture.
    const pageScrolled = await page.evaluate(() => window.scrollY);
    expect(pageScrolled).toBe(0);

    await page.getByTestId("library-graph-fit").click();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-view-scale")), { timeout: 5_000 })
      .toBeGreaterThan(fitted * 0.95);
    // And the whole picture is inside the box again.
    const inside = await page.evaluate(() => {
      const probe = window.__atlasLibraryGraph!;
      const view = probe.view();
      return probe.nodes().every((node) => node.x > 0 && node.x < view.width && node.y > 0 && node.y < view.height);
    });
    expect(inside, "a mark is outside the canvas after the fit").toBe(true);
  });

  /**
   * A settled canvas is still and stops asking for frames. The drift was a display offset the loop
   * applied after the view transform, so only a frame count can catch it.
   */
  test("a settled canvas is still and stops asking for frames, hover included", async ({ page }) => {
    await page.addInitScript(() => {
      const counter = { frames: 0 };
      (window as unknown as { __rafCount: typeof counter }).__rafCount = counter;
      const original = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback: FrameRequestCallback) => {
        counter.frames += 1;
        return original(callback);
      };
    });
    await openGraph(page);
    const canvas = page.getByTestId("library-graph-canvas");
    const box = (await canvas.boundingBox())!;
    /*
     * Watched, not timed: four identical samples in a row mean the stale-citation breath has let go.
     * `alpha() < 0.01` alone is not enough. Never use `waitFrames` here; rAF is replaced by a counter.
     */
    let previousFrame: string | null = null;
    let repeats = 0;
    await expect
      .poll(
        async () => {
          const drawn = await canvasHash(page);
          repeats = previousFrame !== null && drawn === previousFrame ? repeats + 1 : 0;
          previousFrame = drawn;
          return repeats >= 3;
        },
        { timeout: 25_000, message: "the picture never stopped changing, so it is not settled at all" },
      )
      .toBe(true);

    const readFrames = () =>
      page.evaluate(() => (window as unknown as { __rafCount: { frames: number } }).__rafCount.frames);
    const idleFrom = await readFrames();
    const restingPositions = await nodes(page);
    /*
     * A **measurement window**, not a wait: the claim is that no frame is asked for over a
     * stretch of real time, so the stretch has to pass. It stays in milliseconds because
     * this case has replaced `requestAnimationFrame` with a counting wrapper, and any
     * frame-based wait would be counted as the canvas asking for one.
     */
    // measurement window: no frame may be asked for over a stretch of real time.
    await page.waitForTimeout(3_000);
    expect(
      (await readFrames()) - idleFrom,
      "the settled canvas is still asking for animation frames",
    ).toBe(0);
    const stillThere = await nodes(page);
    const travelled = (before: ProbeNode[], after: ProbeNode[]): number => {
      const at = new Map(before.map((node) => [node.id, node]));
      let worst = 0;
      for (const node of after) {
        const was = at.get(node.id);
        if (was) worst = Math.max(worst, Math.hypot(node.x - was.x, node.y - was.y));
      }
      return worst;
    };
    expect(travelled(restingPositions, stillThere), "a mark moved on its own").toBe(0);

    // And hovering is ink only. A slow sweep onto a mark, which is the gesture that was
    // reported, then a hold: neither may move anything.
    const target = restingPositions.sort((first, second) => second.radius - first.radius)[0]!;
    await page.mouse.move(box.x + 4, box.y + 4);
    await expect(canvas, "the pointer never left the marks").toHaveAttribute("data-hovered-node-id", "");
    const beforeHover = await nodes(page);
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(box.x + (target.x * step) / 12, box.y + (target.y * step) / 12);
    }
    // The attribute assertion retries on its own, so the sweep needs nothing in front of it.
    await expect(canvas).toHaveAttribute("data-hovered-node-id", target.id);
    expect(travelled(beforeHover, await nodes(page)), "hover moved a mark").toBe(0);
  });

  test.describe("under reduced motion", () => {
    test("the canvas is still: the same picture, arrived at without the journey", async ({ page }) => {
      /*
       * Use `emulateMedia`: `test.use({ reducedMotion })` is not an option in this Playwright version and
       * is silently ignored.
       */
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      await openGraph(page);
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
        "the reduced-motion emulation did not survive the navigation",
      ).toBe(true);
      const frameHash = () => canvasHash(page);

      /* The pointer leaves the canvas first: a hovered mark runs the dim ramp, which is not at rest. */
      await page.mouse.move(0, 0);
      await expect(page.getByTestId("library-graph-canvas")).toHaveAttribute("data-hovered-node-id", "");
      /*
       * Let the ink ramp finish by watching it finish: two identical frames mean the
       * picture has stopped changing, which is what "one ramp's worth of time" was
       * standing in for.
       */
      await expect
        .poll(
          async () => {
            const sample = await frameHash();
            await frames(page, 2);
            return (await frameHash()) === sample;
          },
          { timeout: 20_000, message: "the picture never stopped changing" },
        )
        .toBe(true);

      const first = await frameHash();
      // A **measurement window**: the claim is that nothing drifts over a stretch longer
      // than one ambient period, so the stretch has to pass.
      // measurement window: nothing may drift over more than one ambient period.
      await page.waitForTimeout(2_000);
      const second = await frameHash();
      // measurement window: the second half of the same stretch.
      await page.waitForTimeout(2_000);
      const third = await frameHash();
      expect(second, "the canvas drifted under prefers-reduced-motion").toBe(first);
      expect(third).toBe(first);
    });
  });
});
