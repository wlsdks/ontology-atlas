import { expect, test, type Page } from "@playwright/test";

import { CODE_CONCEPTS, REFUSED_CONCEPTS, installCodeReaderRuntime, openConceptOnMap } from "./code-reader-fixture";
import { waitForAnimationsDone, waitForBoxStill, waitForMapStill } from "./settle";

/*
 * The code reader: a concept's cited lines read in place beside the concept panel, in the app.
 * The two code reader commands are stubbed as Rust answers them; Rust's own refusals are proven in
 * `src-tauri/src/code_reader/tests.rs`.
 */

const MAP_MIN_WIDTH_PX = 480;

const MODEL_ANSWER = "Every invoice line rounds before the total.";
type PendingAnswerWindow = Window & { __pendingModelAnswer: { asked: number; cancelled: number; finish(): void } };

/**
 * A model connection whose answer waits until the spec finishes it, as a slow provider does; a
 * cancel before then is counted, since that is what stopping the answer sends.
 */
async function installPendingModelAnswer(page: Page): Promise<void> {
  await page.addInitScript((answer) => {
    const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } }).__TAURI_INTERNALS__;
    const inner = internals.invoke.bind(internals);
    let release: (() => void) | null = null;
    const state = { asked: 0, cancelled: 0, finish: () => release?.() };
    (window as unknown as PendingAnswerWindow).__pendingModelAnswer = state;
    internals.invoke = (command, args = {}) => {
      if (command === "secret_status") return Promise.resolve({ provider: args.provider, stored: args.provider === "anthropic", last4: "abcd" });
      if (command === "llm_chat_prepare") return Promise.resolve("request-1");
      if (command === "llm_chat_cancel") {
        if (release !== null) state.cancelled += 1;
        return Promise.resolve(null);
      }
      if (command === "llm_chat") {
        state.asked += 1;
        return new Promise((resolve) => {
          release = () => {
            release = null;
            resolve({ status: 200, host: "api.anthropic.com", durationMs: 1, loggedAt: "2026-11-24T00:00:00Z", body: JSON.stringify({ content: [{ type: "text", text: answer }], stop_reason: "end_turn" }) });
          };
        });
      }
      return inner(command, args);
    };
  }, MODEL_ANSWER);
}

async function modelAnswer(page: Page): Promise<{ asked: number; cancelled: number }> {
  return page.evaluate(() => {
    const { asked, cancelled } = (window as unknown as PendingAnswerWindow).__pendingModelAnswer;
    return { asked, cancelled };
  });
}

async function openReader(page: Page) {
  const row = page.getByTestId("map-detail-panel-code");
  await expect(row).toBeVisible();
  await row.click();
  const reader = page.getByTestId("code-reader");
  await expect(reader).toBeVisible();
  return reader;
}

/** The map's uncovered width: from the expanded concept list, or the slot's edge, to the reader. */
async function mapWidthBesideReader(page: Page): Promise<number> {
  return page.evaluate(() => {
    const slot = document.querySelector('[data-testid="topology-map-surface"]')!.getBoundingClientRect();
    const list = document.querySelector('[data-testid="topology-index-panel"]:not([aria-hidden="true"] *)');
    const reader = document.querySelector('[data-testid="code-reader"]')!.getBoundingClientRect();
    return reader.left - Math.max(slot.left, list?.getBoundingClientRect().right ?? slot.left);
  });
}

/** Once the reader has taken its seat and the camera has settled. */
async function readerSettled(page: Page) {
  const reader = page.getByTestId("code-reader");
  await waitForAnimationsDone(reader);
  await waitForBoxStill(reader);
  await waitForMapStill(page, { what: "camera" });
}

/** Where the selected concept is drawn, and the boxes it must stay clear of. */
async function selectedConceptClearance(page: Page, title: string) {
  return page.evaluate((label) => {
    type ProbeNode = { label: string; x: number; y: number };
    const canvas = document.querySelector('[data-testid="ontology-map-canvas"]')!.getBoundingClientRect();
    const probe = (window as unknown as { __atlasMap: { nodes(): ProbeNode[] } }).__atlasMap;
    const node = probe.nodes().find((candidate) => candidate.label === label)!;
    const point = { x: canvas.left + node.x, y: canvas.top + node.y };
    const covers = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
    };
    return {
      inCanvas: point.x >= canvas.left && point.x <= canvas.right && point.y >= canvas.top && point.y <= canvas.bottom,
      underReader: covers('[data-testid="code-reader"]'),
      underList: covers('[data-testid="topology-index-panel"]:not([aria-hidden="true"] *)'),
    };
  }, title);
}

test.describe("Code reader", () => {
  test("opens on the cited lines beside the panel, moves between ranges and closes on a second press", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current);

    const row = page.getByTestId("map-detail-panel-code");
    await expect(row).toContainText("src/billing/invoice.ts");
    await expect(row).toContainText("2개");
    const reader = await openReader(page);
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(reader).toHaveAttribute("data-code-reader-placement", "beside");
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();

    const code = reader.getByTestId("code-reader-code");
    const cited = code.locator('[data-line="40"]');
    await expect(cited).toHaveAttribute("data-cited", "true");
    await expect(cited).toBeInViewport();
    await expect(reader.getByTestId("code-reader-band")).toBeVisible();
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "current");
    expect(await mapWidthBesideReader(page)).toBeGreaterThanOrEqual(MAP_MIN_WIDTH_PX);

    const ranges = reader.getByTestId("code-reader-range");
    await expect(ranges).toHaveText(["L40–52", "L7"]);
    await ranges.nth(1).click();
    await expect(ranges.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(code.locator('[data-line="7"]')).toHaveAttribute("data-cited", "true");
    await expect(code.locator('[data-line="7"]')).toBeInViewport();

    await reader.getByTestId("code-reader-top").click();
    await expect(reader.getByTestId("code-reader-band")).toHaveCount(0);

    await row.click();
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
    await expect(row).toHaveAttribute("aria-pressed", "false");
  });

  test("says when the file changed after the document, runs past the end, or is cited without lines", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.stale);
    let reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "stale");
    await expect(reader.locator('[data-line="40"]')).toHaveAttribute("data-cited", "true");

    await page.goto(`/ko/topology/?p=${CODE_CONCEPTS.beyond}&guides=off`);
    reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "beyond");
    await expect(reader.getByTestId("code-reader-trust")).toContainText("20");

    await page.goto(`/ko/topology/?p=${CODE_CONCEPTS.none}&guides=off`);
    reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-trust")).toHaveAttribute("data-cite-trust", "none");
    await expect(reader.getByTestId("code-reader-ranges")).toHaveCount(0);
    await expect(reader.locator('[data-line="1"]')).toBeInViewport();
  });

  test("a refused read shows its state and no text", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, REFUSED_CONCEPTS["config/.env"]!.slug);
    for (const [index, { slug, state }] of Object.values(REFUSED_CONCEPTS).entries()) {
      if (index > 0) await page.goto(`/ko/topology/?p=${slug}&guides=off`);
      const reader = await openReader(page);
      await expect(reader.getByTestId("code-reader-refusal")).toHaveAttribute("data-code-reader-refusal", state);
      await expect(reader.locator("[data-line]")).toHaveCount(0);
      await expect(reader.getByTestId("code-reader-copy-path")).toBeVisible();
    }
  });

  test("draws each bidi control as its code point and says which line was cut short", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.hiddenOrder, "en");
    const reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-bidi-control")).toHaveText(["U+202E", "U+2066", "U+2069", "U+2066"]);
    expect(await reader.locator('[data-line="2"]').textContent()).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    await expect(reader.getByTestId("code-reader-cut")).toHaveText("Line 4 is longer than 64 KiB, so only its start is shown.");
  });

  test("with no code folder connected the reader says so and offers the way to connect one", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page, { refuseAll: "code-reader-not-connected" });
    await openConceptOnMap(page, CODE_CONCEPTS.current);
    const reader = await openReader(page);
    await expect(reader.getByTestId("code-reader-refusal")).toHaveAttribute("data-code-reader-refusal", "notConnected");
    await expect(reader.getByTestId("code-reader-next-step")).toHaveText("코드 폴더 연결");
    await expect(reader.locator("[data-line]")).toHaveCount(0);
  });

  test("a file edited while open keeps its text and offers Read again; at rest nothing is read", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 900 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current);
    const reader = await openReader(page);
    await expect(reader.locator('[data-line="40"]')).toBeVisible();
    const before = await page.evaluate(() => ({ ...(window as unknown as { __codeReaderCalls: object }).__codeReaderCalls }));

    await page.evaluate(() => (window as unknown as { __codeReaderTouch(path: string): void }).__codeReaderTouch("src/billing/invoice.ts"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(reader.getByTestId("code-reader-changed")).toBeVisible();
    await expect(reader.locator('[data-line="40"]')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __codeReaderCalls: { window: number } }).__codeReaderCalls.window)).toBe(
      (before as { window: number }).window,
    );

    await reader.getByTestId("code-reader-read-again").click();
    await expect(reader.getByTestId("code-reader-changed")).toHaveCount(0);
    await expect(reader.locator('[data-line="40"]')).toHaveAttribute("data-cited", "true");
  });

  test("at 1040 the reader takes the panel's place and Back returns to the concept", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 800 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current);
    const reader = await openReader(page);
    await expect(reader).toHaveAttribute("data-code-reader-placement", "replace");
    await expect(page.locator("[data-code-reader-replaced]")).toHaveCSS("opacity", "0");
    expect(await mapWidthBesideReader(page)).toBeGreaterThanOrEqual(MAP_MIN_WIDTH_PX);

    await reader.getByTestId("code-reader-back").click();
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
    await expect(page.getByTestId("map-detail-panel")).toBeVisible();
    await expect(page.getByTestId("map-detail-panel-code")).toBeFocused();
  });

  for (const { name, width, height, foldList, placement } of [
    { name: "1512 with the concept list open", width: 1512, height: 900, foldList: false, placement: "replace" },
    { name: "1512 with the concept list folded", width: 1512, height: 900, foldList: true, placement: "beside" },
    { name: "1040", width: 1040, height: 800, foldList: false, placement: "replace" },
    { name: "1920", width: 1920, height: 1080, foldList: false, placement: "beside" },
  ] as const) {
    test(`at ${name} the map keeps 480 px and the selected concept stays in view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await installCodeReaderRuntime(page);
      await openConceptOnMap(page, CODE_CONCEPTS.current, "ko", { probe: true });
      if (foldList) {
        await page.getByTestId("topology-index-fold").click();
        await expect(page.getByTestId("topology-index-panel")).toHaveCount(0);
      }
      const reader = await openReader(page);
      await expect(reader).toHaveAttribute("data-code-reader-placement", placement);
      await readerSettled(page);
      expect(await mapWidthBesideReader(page)).toBeGreaterThanOrEqual(MAP_MIN_WIDTH_PX);
      expect(await selectedConceptClearance(page, "Invoice rounding")).toEqual({ inCanvas: true, underReader: false, underList: false });
    });
  }

  test("at 1040 the open conversation is put away for the reader and comes back as it was when it closes", async ({ page }) => {
    await page.setViewportSize({ width: 1040, height: 800 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current, "ko", { probe: true });
    const main = page.locator("main#main");
    await page.getByTestId("map-detail-panel-action-ask-agent").click();
    await expect(main).toHaveAttribute("data-agent-panel-open", "true");

    const reader = await openReader(page);
    await expect(main).toHaveAttribute("data-agent-panel-open", "false");
    await readerSettled(page);
    expect(await mapWidthBesideReader(page)).toBeGreaterThanOrEqual(MAP_MIN_WIDTH_PX);

    await reader.getByTestId("code-reader-back").click();
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
    await expect(main).toHaveAttribute("data-agent-panel-open", "true");
    await expect(page.getByTestId("map-detail-panel-code")).toBeFocused();
  });

  test("an answer still being written keeps running while the reader holds the conversation's room", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installCodeReaderRuntime(page);
    await installPendingModelAnswer(page);
    await openConceptOnMap(page, CODE_CONCEPTS.current, "en", { probe: true });
    const main = page.locator("main#main");
    await page.getByTestId("map-detail-panel-action-ask-agent").click();
    await expect(main).toHaveAttribute("data-agent-panel-open", "true");
    await page.getByTestId("agent-scope-accept").click();
    await page.getByTestId("vault-agent-input").fill("Where does rounding happen?");
    await page.getByTestId("vault-agent-input").press("Enter");
    await expect.poll(() => modelAnswer(page)).toMatchObject({ asked: 1 });

    const reader = await openReader(page);
    await expect(main).toHaveAttribute("data-agent-panel-open", "false");
    await readerSettled(page);
    expect(await modelAnswer(page)).toEqual({ asked: 1, cancelled: 0 });
    await page.evaluate(() => (window as unknown as PendingAnswerWindow).__pendingModelAnswer.finish());

    await reader.getByTestId("code-reader-back").click();
    await expect(main).toHaveAttribute("data-agent-panel-open", "true");
    await expect(page.getByTestId("vault-agent-panel").getByText(MODEL_ANSWER)).toBeVisible();
  });

  test("asking the agent from the reader while it holds the conversation's room brings the conversation back and closes the reader", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installCodeReaderRuntime(page);
    await openConceptOnMap(page, REFUSED_CONCEPTS["src/billing/renamed.ts"]!.slug);
    const main = page.locator("main#main");
    await page.getByTestId("map-detail-panel-action-ask-agent").click();
    await expect(main).toHaveAttribute("data-agent-panel-open", "true");
    const reader = await openReader(page);
    await expect(main).toHaveAttribute("data-agent-panel-open", "false");
    await expect(reader.getByTestId("code-reader-refusal")).toHaveAttribute("data-code-reader-refusal", "gone");

    await reader.getByTestId("code-reader-next-step").click();
    await expect(main).toHaveAttribute("data-agent-panel-open", "true");
    await expect(page.getByTestId("code-reader")).toHaveCount(0);
  });
});
