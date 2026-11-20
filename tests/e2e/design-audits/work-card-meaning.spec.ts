import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import type { VectorStatus } from "../../../src/shared/lib/vault-folder/tauri-vault-vectors";
import { seedFirstRunSeen } from "../first-run-seed";
import { goToMap, harnessCalls, rail, startCheck, THREE_FINDINGS } from "../library/library-check-run-fixture";
import {
  installLibraryWorkHarness,
  LIBRARY_VECTOR_FAILURES,
  LIBRARY_VECTOR_SCRIPT,
  type LibraryVectorsScript,
  type LibraryWorkHarness,
} from "../library-work-harness";
import { openFolderFromFirstRun } from "../open-folder";
import { waitForAnimationsDone } from "../settle";

const FILES = {
  "project.md": "---\nuid: 00000000-0000-4000-8000-000000000001\nkind: project\ntitle: Launch\nslug: launch\n---\n\n# Launch\n",
  "wiki/architecture.md": "---\ntitle: Architecture\nstatus: draft\n---\n\n## Summary\n\nHow the launch is built.\n",
  "sources/architecture.docx": "Architecture evidence\n",
};

const VAULT_ROOT = "/Users/probe/Ontology Atlas/launch";

const card = (page: Page) => page.getByTestId("work-run-card");
const ring = (page: Page) => page.getByTestId("app-nav-rail-ring-library");
const libraryTile = (page: Page) => rail(page).getByTestId("app-nav-rail-item-library");
const deskLine = (page: Page) => page.getByTestId("meaning-desk-line");
const navRail = (locale: string) =>
  (JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as { navRail: Record<string, string> }).navRail;

async function openFolder(page: Page, vectors: LibraryVectorsScript = {}, locale = "en"): Promise<LibraryWorkHarness> {
  await seedFirstRunSeen(page);
  const harness = await installLibraryWorkHarness(page, { files: FILES, vectors });
  await openFolderFromFirstRun(page, locale);
  return harness;
}

/** Client-side, so the app session (and every run it holds) survives the move. */
async function goTo(page: Page, destination: "map" | "library" | "architecture" | "planning" | "automations") {
  await rail(page).getByTestId(`app-nav-rail-item-${destination}`).click();
  if (destination === "map") await expect(page).toHaveURL(/\/topology\//);
  else await expect(page).toHaveURL(new RegExp(`/${destination}/`));
}

/** The Library opens on its Wiki desk: the segment is chosen once and remembered. */
async function goToDesk(page: Page) {
  await goTo(page, "library");
  const wiki = page.getByTestId("library-workspace-wiki");
  if (await wiki.isVisible()) await wiki.click();
  await expect(deskLine(page)).toBeVisible();
}

/** Download and prepare, pressed in the setup dialog the desk line opens. */
async function pressDownloadAndPrepare(page: Page) {
  await goToDesk(page);
  await page.getByTestId("meaning-desk-setup").click();
  await page.getByTestId("meaning-setup-primary").click();
  await expect(page.getByTestId("meaning-setup-dialog")).toHaveCount(0);
}

/** The folder chose the built-in model in an earlier launch, so Resume has a source to resume. */
async function seedBuiltinChoice(page: Page) {
  await page.addInitScript(([key, value]) => {
    if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value);
  }, ["ontology-atlas:vault-vectors:v1", JSON.stringify({ [VAULT_ROOT]: { source: { kind: "builtin" }, paused: false } })]);
}

async function emit(harness: LibraryWorkHarness, page: Page, status: VectorStatus) {
  await harness.emitVectorStatus(page, status);
}

const vectorCalls = async (harness: LibraryWorkHarness, page: Page, command: string) =>
  (await harness.snapshot(page)).calls.filter((call) => call.method === command).length;

test.describe("search by meaning in the long-work seat", () => {
  test("a pressed preparation follows the person to the map, keeps one card across tabs, and stands down on the desk", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const harness = await openFolder(page);
    await pressDownloadAndPrepare(page);
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing);
    await expect(card(page), "the desk is the job's stage").toHaveCount(0);

    await goTo(page, "map");
    await expect(card(page)).toHaveAttribute("data-kind", "meaning");
    await expect(card(page)).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("work-run-figures")).toHaveText("312 of 2,000 files");
    await expect(page.getByTestId("work-run-file")).toHaveAttribute("title", "wiki/architecture.md");
    await expect(page.getByTestId("work-run-line")).toContainText("architecture.md");

    await card(page).evaluate((element) => element.setAttribute("data-probe-identity", "kept"));
    await goTo(page, "architecture");
    await goTo(page, "planning");
    await expect(card(page), "the same element survives two tabs").toHaveAttribute("data-probe-identity", "kept");

    await goToDesk(page);
    await expect(card(page)).toHaveCount(0);
    await expect(deskLine(page)).toContainText("312 of 2,000 files");
  });

  test("a preparation already running at load draws only the ring, and a failure raises the card", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const harness = await openFolder(page, { status: LIBRARY_VECTOR_SCRIPT.preparing }, "en");
    await expect(ring(page)).toBeVisible();
    await expect(ring(page)).toHaveAttribute("data-ring-fraction", "0.1560");
    await expect(libraryTile(page)).toHaveAccessibleName(`${navRail("en").library}: 15% done`);
    await expect(card(page)).toHaveCount(0);

    await emit(harness, page, LIBRARY_VECTOR_FAILURES.runnerDown);
    await expect(card(page)).toHaveAttribute("data-phase", "failed");
    await expect(page.getByTestId("work-run-detail")).toHaveText("Ollama did not answer. Start Ollama, then press Resume.");
    await expect(ring(page)).toHaveCount(0);
  });

  test("Hide leaves the ring; Stop holds the folder and nothing but Resume opens the card again", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const harness = await openFolder(page);
    await pressDownloadAndPrepare(page);
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing);
    await goTo(page, "map");
    await page.getByTestId("work-run-hide").click();
    await expect(card(page)).toHaveCount(0);
    await expect(ring(page)).toBeVisible();
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparingMeasured);
    await expect(card(page), "a hidden card stays hidden while the job runs").toHaveCount(0);

    await goToDesk(page);
    await page.getByTestId("meaning-desk-stop").click();
    await expect(deskLine(page)).toHaveAttribute("data-state", "stopped");
    await page.getByTestId("meaning-desk-resume").click();
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparingMeasured);
    await goTo(page, "map");
    await expect(card(page), "Resume is a press: the card opens again").toHaveAttribute("data-state", "open");

    const stopsBefore = await vectorCalls(harness, page, "vault_vectors_stop");
    await page.getByTestId("work-run-stop").click();
    await expect(card(page)).toHaveCount(0);
    await expect.poll(() => vectorCalls(harness, page, "vault_vectors_stop")).toBe(stopsBefore + 1);
    await expect(ring(page)).toHaveCount(0);
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.stopped);
    await goTo(page, "architecture");
    await expect(card(page), "a stopped job is held: nothing opens its card").toHaveCount(0);
  });

  test("a finish with the card open offers Ask a question, which lands in the desk's field; a hidden finish says nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const harness = await openFolder(page);
    await pressDownloadAndPrepare(page);
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparingMeasured);
    await goTo(page, "map");
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.ready);
    await expect(card(page)).toHaveAttribute("data-phase", "ready");
    await expect(page.getByTestId("work-run-figures")).toHaveText("2,000 files");
    await expect(page.getByTestId("work-run-line")).toHaveText("Ready to search by meaning");
    await page.getByTestId("work-run-ask").click();
    await expect(page).toHaveURL(/\/library\//);
    await expect(page.getByTestId("question-desk-input")).toBeFocused();
    await expect(card(page)).toHaveCount(0);

    await page.getByTestId("meaning-desk-line").waitFor();
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.stopped);
    await page.getByTestId("meaning-desk-resume").click();
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparingMeasured);
    await goTo(page, "map");
    await page.getByTestId("work-run-hide").click();
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.ready);
    await goTo(page, "architecture");
    await expect(card(page), "nothing waits unseen").toHaveCount(0);
    await expect(ring(page)).toHaveCount(0);
    await expect(rail(page).getByTestId("app-nav-rail-badge-library")).toHaveCount(0);
  });

  test("an update draws nothing under ten changed files and only the ring from ten", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const harness = await openFolder(page, { status: LIBRARY_VECTOR_SCRIPT.ready });
    await emit(harness, page, { ...LIBRARY_VECTOR_SCRIPT.updating, filesDone: 0, filesTotal: 3 });
    await goTo(page, "architecture");
    await expect(ring(page)).toHaveCount(0);
    await expect(card(page)).toHaveCount(0);
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.updatingMany);
    await expect(ring(page)).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});

test.describe("two runs in one seat", () => {
  test("shows the later run, lists both behind 1 more running, and each Stop ends only its own run", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    const harness = await startCheck(page);
    await pressDownloadAndPrepare(page);
    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing);
    await goToMap(page);
    await expect(card(page), "the preparation was started last").toHaveAttribute("data-kind", "meaning");
    const more = page.getByTestId("work-run-more");
    await expect(more).toHaveAttribute("data-shown", "true");
    await expect(more).toHaveText("1 more running");

    await more.click();
    const dialog = page.getByTestId("work-runs-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("work-runs-list").getByRole("button")).toHaveCount(2);
    await expect(page.getByTestId("work-runs-detail"), "the run off the card is chosen first").toHaveAttribute("data-kind", "check");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();

    await more.click();
    await page.getByTestId("work-runs-row-meaning").click();
    await page.getByTestId("work-runs-stop").click();
    await expect.poll(() => vectorCalls(harness, page, "vault_vectors_stop")).toBe(1);
    await expect(card(page), "the check runs on and takes the card").toHaveAttribute("data-kind", "check");
    await expect(card(page)).toHaveAttribute("data-phase", "running");

    await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparingMeasured);
    await expect(more).toHaveAttribute("data-shown", "true");
    await more.click();
    await page.getByTestId("work-runs-row-check").click();
    await page.getByTestId("work-runs-stop").click();
    await expect.poll(() => harnessCalls(page)).toContain("session/cancel");
    await expect(card(page)).toHaveCount(0);
    await expect(ring(page), "the preparation runs on").toBeVisible();
    expect(await vectorCalls(harness, page, "vault_vectors_stop")).toBe(1);
  });
});

/** The card's box, its presses' left edges, and the presses a neighbour covers or the box cuts. */
async function cardGeometry(page: Page) {
  const box = card(page);
  await waitForAnimationsDone(box);
  return box.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const presses = [...element.querySelectorAll<HTMLElement>('[data-work-run-layer="current"] button')];
    const more = element.querySelector<HTMLElement>('[data-testid="work-run-more"][data-shown="true"]')?.getBoundingClientRect();
    const shown = more ? [...presses, element.querySelector<HTMLElement>('[data-testid="work-run-more"]')!] : presses;
    const title = element.querySelector<HTMLElement>('[data-work-run-layer="current"] [data-testid="work-run-title"]');
    /** The box a text or press draws in: a title's padding is room it leaves, not text. */
    const drawn = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      const right = box.right - Number.parseFloat(getComputedStyle(node).paddingRight);
      return { left: box.left, right, top: box.top, bottom: box.bottom, name: node.textContent };
    };
    const meets = (a: { left: number; right: number; top: number; bottom: number }, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      presses: presses.map((button) => Math.round(button.getBoundingClientRect().left - rect.left)),
      underMore: more
        ? [...presses, ...(title ? [title] : [])].map(drawn).filter((box) => meets(box, more)).map((box) => box.name)
        : [],
      cut: shown
        .filter((button) => button.scrollWidth > button.clientWidth || button.getBoundingClientRect().right > rect.right - 4)
        .map((button) => button.textContent),
    };
  });
}

for (const locale of ["en", "ko"] as const) {
  for (const width of [1040, 1512] as const) {
    test(`keeps one box across every phase of both runs in ${locale} at ${width}, and 1 more running moves no press`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await seedBuiltinChoice(page);
      const harness = await startCheck(page, { locale });
      await goToMap(page);
      const sizes = new Map<string, string>();
      const record = async (name: string, phase: string) => {
        await expect(card(page)).toHaveAttribute("data-phase", phase);
        const geometry = await cardGeometry(page);
        sizes.set(name, geometry.size);
        expect(geometry.underMore, `${name}: a press runs under 1 more running`).toEqual([]);
        expect(geometry.cut, `${name}: a press is cut`).toEqual([]);
        return geometry;
      };
      const alone = await record("check running", "running");
      await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing);
      await expect(page.getByTestId("work-run-more")).toHaveAttribute("data-shown", "true");
      const beside = await record("check running beside a preparation", "running");
      expect(beside.presses, "the presses keep their places when 1 more running appears").toEqual(alone.presses);
      await harness.answer(page, THREE_FINDINGS);
      await record("check found", "found");
      await page.getByTestId("work-run-close").click();

      await goToDesk(page);
      await page.getByTestId("meaning-desk-stop").click();
      await page.getByTestId("meaning-desk-resume").click();
      await goToMap(page);
      for (const [phase, status] of [
        ["modelDownloading", LIBRARY_VECTOR_SCRIPT.downloading],
        ["modelConverting", LIBRARY_VECTOR_SCRIPT.converting],
        ["waitingTurn", LIBRARY_VECTOR_SCRIPT.waitingTurn],
        ["preparing", LIBRARY_VECTOR_SCRIPT.preparingMeasured],
        ["ready", LIBRARY_VECTOR_SCRIPT.ready],
      ] as const) {
        await emit(harness, page, status);
        await record(phase, phase);
      }
      await emit(harness, page, LIBRARY_VECTOR_SCRIPT.preparing);
      await emit(harness, page, LIBRARY_VECTOR_FAILURES.write);
      await record("failed", "failed");

      const shapes = new Set(sizes.values());
      expect(shapes.size, [...sizes].map(([name, size]) => `${name}: ${size}`).join("\n")).toBe(1);
      test.info().annotations.push({ type: "box", description: `${locale}@${width}: ${[...shapes][0]}` });
    });
  }
}
