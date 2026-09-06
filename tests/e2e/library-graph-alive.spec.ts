import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **The library graph is alive** — the five claims only a running browser can settle.
 *
 * The owner's verdict on 2026-09-07 was that the shipped picture was *"a static hairball
 * — nothing moves, nothing responds"*, and the answer (`docs/DECISIONS.md`, 2026-09-07)
 * replaced a one-shot layout with a live force simulation and four gestures. Unit tests
 * own the physics, the view arithmetic and what one frame paints; this spec owns the
 * things that are only true once a real pointer meets a real canvas:
 *
 * 1. a drag moves the mark **and pulls its neighbours after it** — the whole point of
 *    live physics, and the one claim a settled layout could never make;
 * 2. hovering dims everything outside the neighbourhood, measured **in the canvas's own
 *    pixels**, because that is the only place the dim exists;
 * 3. the wheel changes the scale rather than scrolling the page;
 * 4. the fit control brings the whole picture back;
 * 5. under `prefers-reduced-motion` the canvas is **identical** frame to frame — no
 *    settle, no drift.
 *
 * ⚠️ **Aiming is done through `window.__atlasLibraryGraph`, never by sweeping pixels.**
 * The map lost six measurement rounds to drag specs that were silently panning the
 * background, because from outside a canvas a grab and a pan are the same cursor over the
 * same colour. `interaction()` is what distinguishes them, and this spec asserts it before
 * it asserts anything a drag did.
 */

/**
 * The owner's own folder shape: **seven sources, six pages, every page citing four to
 * seven of them and naming two or three concepts.** Sparse fixtures make any layout look
 * competent; this is the density that produced the hairball.
 */
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

interface ProbeNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  radius: number;
}

declare global {
  interface Window {
    __atlasLibraryGraph?: {
      nodes: () => ProbeNode[];
      interaction: () => { kind: "idle" | "node" | "pan"; nodeId: string | null };
      view: () => { scale: number; x: number; y: number; width: number; height: number };
      alpha: () => number;
    };
  }
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
}

const nodes = (page: Page): Promise<ProbeNode[]> =>
  page.evaluate(() => window.__atlasLibraryGraph!.nodes());

test.describe("the library graph responds", () => {
  test("a drag carries the mark and pulls its neighbours after it", async ({ page }) => {
    await openGraph(page);
    const canvas = page.getByTestId("library-graph-canvas");
    const box = (await canvas.boundingBox())!;
    const before = await nodes(page);
    // The busiest source: the mark with the most pages hanging off it, so the neighbours
    // that must follow are unambiguous.
    const target = before
      .filter((node) => node.kind === "source")
      .sort((first, second) => second.radius - first.radius)[0]!;
    const neighbours = before.filter((node) => node.kind === "page");

    await page.mouse.move(box.x + target.x, box.y + target.y);
    await page.mouse.down();
    // Past the 7px threshold in the first step, then a real path: one long jump is a
    // teleport, and the pointer state machine is entitled to read it as one.
    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(box.x + target.x + step * 16, box.y + target.y + step * 10);
      await page.waitForTimeout(24);
    }

    // ⚠️ The assertion that makes every other one in this case mean anything: the gesture
    // is holding a **node**, not the background.
    const holding = await page.evaluate(() => window.__atlasLibraryGraph!.interaction());
    expect(holding.kind, "the drag grabbed the background instead of a mark").toBe("node");
    expect(holding.nodeId).toBe(target.id);

    const during = await nodes(page);
    const moved = during.find((node) => node.id === target.id)!;
    expect(Math.hypot(moved.x - target.x, moved.y - target.y)).toBeGreaterThan(40);

    // The neighbours reacted. A settled layout could move the mark under the pointer and
    // nothing else; live springs cannot.
    const pulled = neighbours.filter((node) => {
      const now = during.find((candidate) => candidate.id === node.id)!;
      return Math.hypot(now.x - node.x, now.y - node.y) > 2;
    });
    expect(pulled.length, "no page moved while its source was dragged away").toBeGreaterThan(0);

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
    // The dim ramps over `--motion-fast`; a frame or two is enough for it to finish.
    await page.waitForTimeout(300);

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

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let notch = 0; notch < 4; notch += 1) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(60);
    }
    await expect.poll(async () => Number(await canvas.getAttribute("data-view-scale"))).toBeGreaterThan(fitted * 1.2);

    // The page itself did not scroll: the canvas took the gesture.
    const pageScrolled = await page.evaluate(() => window.scrollY);
    expect(pageScrolled).toBe(0);

    await page.getByTestId("library-graph-fit").click();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-view-scale")), { timeout: 5_000 })
      .toBeLessThan(fitted * 1.15);
    // And the whole picture is inside the box again.
    const inside = await page.evaluate(() => {
      const probe = window.__atlasLibraryGraph!;
      const view = probe.view();
      return probe.nodes().every((node) => node.x > 0 && node.x < view.width && node.y > 0 && node.y < view.height);
    });
    expect(inside, "a mark is outside the canvas after the fit").toBe(true);
  });

  test.describe("under reduced motion", () => {
    test("the canvas is still: the same picture, arrived at without the journey", async ({ page }) => {
      /*
       * ⚠️ **`emulateMedia`, not `test.use({ reducedMotion })`.** The fixture form is not in
       * this Playwright version's test options, so it type-checks as an unknown key and is
       * silently ignored — the first draft of this case ran with motion fully on, and
       * failed for the right reason by luck (2026-09-07). Emulating before the navigation
       * means the preference is true from the app's first client render.
       */
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      await openGraph(page);
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
        "the reduced-motion emulation did not survive the navigation",
      ).toBe(true);
      /** A cheap hash of the whole canvas, so two frames can be compared exactly. */
      const frameHash = () =>
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

      const first = await frameHash();
      // Longer than one ambient period would have moved a mark by its full amplitude.
      await page.waitForTimeout(2_000);
      const second = await frameHash();
      await page.waitForTimeout(2_000);
      const third = await frameHash();
      expect(second, "the canvas drifted under prefers-reduced-motion").toBe(first);
      expect(third).toBe(first);
    });
  });
});
