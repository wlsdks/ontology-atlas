import { mkdirSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { installDesktopRailRuntime, type ModelsStubOptions } from "./desktop-rail-arrival-harness";
import { waitForAnimationsDone, waitForBoxStill } from "./settle";

/**
 * **Agents → Models** (owner, 2026-09-25): API keys, local runners, the experimental Jev check and
 * the sent log, moved out of the settings sheet. Walked in the installed-app shape (the desktop
 * harness answers the Keychain, `secret_verify`, `jev_*` and the vault's audit file), at the two
 * desk widths the owner works at.
 *
 * What a walk here has to show a person, in order:
 * - the tab is reachable from the rail and from the old settings door, and `?tab=models` holds;
 * - a runner row tells connected, unreachable and empty apart, in words;
 * - a key can be added, replaced and removed, and only its last four are ever drawn;
 * - the Jev request is on screen, unfolded, before the one press that sends it, and what is sent
 *   is exactly that text;
 * - every transfer is one more line in the folder's record, and the count says so.
 */

const AXE_PATH = require.resolve("axe-core/axe.min.js");
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CAPTURE_DIR = process.env.AGENTS_MODELS_CAPTURE_DIR ?? "";

const PRIOR_AUDIT = [
  {
    v: 1,
    at: "2026-09-24T08:00:00.000Z",
    provider: "openai",
    host: "api.openai.com",
    model: null,
    purpose: "verify",
    question: null,
    scope: { nodes: [], promptChars: 0, vaultChars: 0 },
    payloadSha256: "0".repeat(64),
    outcome: "ok",
    httpStatus: 200,
    responseChars: 0,
    durationMs: 312,
  },
];

const MODELS: ModelsStubOptions = {
  keys: { openai: "4f2a" },
  jevKey: null,
  runners: {
    "http://localhost:11434": { answer: "ok", models: ["qwen3:8b", "gemma3:12b", "nomic-embed-text:latest"] },
    "http://localhost:1234": { answer: "ok", models: [] },
  },
  audit: PRIOR_AUDIT,
};

async function openModelsTab(page: Page) {
  await installDesktopRailRuntime(page, {}, undefined, { models: MODELS });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ko/?guides=off");
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });
  await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
  await page.getByTestId("agents-tab-models").click();
  await expect(page.getByTestId("ai-connection-view")).toBeVisible();
  await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);
}

/** A viewport capture with `focusTestId` scrolled into view (the page scrolls inside `<main>`). */
async function capture(page: Page, name: string, focusTestId?: string) {
  if (!CAPTURE_DIR) return;
  mkdirSync(CAPTURE_DIR, { recursive: true });
  if (focusTestId) {
    await page.getByTestId(focusTestId).evaluate((el) => el.scrollIntoView({ block: "center" }));
  }
  // Let a closing disclosure and a toast settle, so the capture shows the state, not a transition.
  await waitForAnimationsDone(page.locator("body"));
  if (focusTestId) await waitForBoxStill(page.getByTestId(focusTestId));
  await page.screenshot({ path: `${CAPTURE_DIR}/${name}.png` });
}

async function auditCount(page: Page): Promise<number> {
  return Number(await page.getByTestId("ai-audit-count").getAttribute("data-count"));
}

async function axe(page: Page) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (tags) => {
    type Run = { violations: Array<{ id: string; nodes: Array<{ target: unknown }> }>; passes: unknown[] };
    const run = await (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<Run> } }).axe.run(
      { include: [["[data-testid=\"agents-page\"]"]] },
      { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "passes"] },
    );
    return {
      rulesPassed: run.passes.length,
      violations: run.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) })),
    };
  }, WCAG_TAGS);
}

for (const width of [1280, 1512]) {
  test.describe(`agents → models at ${width}`, () => {
    test.use({ viewport: { width, height: width === 1512 ? 982 : 800 } });

    test("the tab reads 에이전트 | 모델 | MCP and holds its address", async ({ page }) => {
      await openModelsTab(page);
      await expect(page.getByRole("tab")).toHaveText(["에이전트", "모델", /^MCP/]);
      await expect(page.getByTestId("agents-tab-models")).toHaveAttribute("aria-selected", "true");
      // Nothing was probed on arrival: the only line is the one the folder already had.
      await expect.poll(() => auditCount(page)).toBe(1);
      await capture(page, `${width}-01-arrival`);
      const result = await axe(page);
      expect(result.rulesPassed).toBeGreaterThanOrEqual(10);
      expect(result.violations).toEqual([]);
      // The address survives a reload.
      await page.reload();
      await expect(page.getByTestId("ai-connection-view")).toBeVisible();
    });

    test("runner rows tell connected, empty and unreachable apart, and each check is recorded", async ({ page }) => {
      await openModelsTab(page);
      // Ollama answers with three models; pick one and it becomes the connected runner.
      const detail = (id: string) => page.getByTestId(`ai-detail-local-${id}`);
      await page.getByTestId("ai-register-local-ollama").click();
      await detail("ollama").getByTestId("ai-verify-local").click();
      await expect(page.getByTestId("ai-local-status-ollama")).toHaveText(/모델 3개/);
      await expect(page.getByTestId("ai-local-status-ollama")).toHaveAttribute("data-tone", "success");
      await detail("ollama").getByTestId("ai-local-model").click();
      await page.getByRole("option", { name: /qwen3:8b/ }).click();
      await expect(page.getByTestId("ai-local-connected")).toBeVisible();
      await expect(page.getByTestId("ai-local-status-ollama")).toHaveText(/연결됨/);
      await capture(page, `${width}-02-ollama-connected`, "models-local");

      // LM Studio answers but has nothing installed.
      await page.getByTestId("ai-register-local-lmstudio").click();
      await expect(detail("lmstudio").getByTestId("ai-local-one-at-a-time")).toContainText("Ollama");
      await detail("lmstudio").getByTestId("ai-verify-local").click();
      await expect(page.getByTestId("ai-local-status-lmstudio")).toHaveText("모델 없음");
      await expect(page.getByTestId("ai-local-status-lmstudio")).toHaveAttribute("data-tone", "warning");
      // Looking at LM Studio did not break Ollama.
      await expect(page.getByTestId("ai-local-status-ollama")).toHaveText(/연결됨/);
      await capture(page, `${width}-03-lmstudio-no-models`, "models-local");

      // Nothing listens on llama.cpp's port.
      await page.getByTestId("ai-register-local-llamacpp").click();
      await detail("llamacpp").getByTestId("ai-verify-local").click();
      await expect(page.getByTestId("ai-local-status-llamacpp")).toHaveText("응답 없음");
      await expect(page.getByTestId("ai-local-status-llamacpp")).toHaveAttribute("data-tone", "danger");
      await expect(detail("llamacpp").getByTestId("ai-local-failure")).toContainText("localhost:8080");
      await capture(page, `${width}-04-llamacpp-unreachable`, "models-local");

      // Three checks, three more lines in the folder's record.
      await expect.poll(() => auditCount(page)).toBe(4);
    });

    test("a key is added, replaced and removed, and only its last four are ever drawn", async ({ page }) => {
      await openModelsTab(page);
      await expect(page.getByTestId("ai-stored-openai")).toContainText("····4f2a");

      await page.getByTestId("ai-register-anthropic").click();
      await page.getByTestId("ai-key-input-anthropic").fill("sk-ant-e2e-secret-9x7y");
      await capture(page, `${width}-05-key-draft`, "models-keys");
      await page.getByTestId("ai-save-anthropic").click();
      await expect(page.getByTestId("ai-stored-anthropic")).toContainText("····9x7y");
      expect(await page.content()).not.toContain("sk-ant-e2e-secret");
      // The row says it, and the announcer reads it out. A toast repeating it stood over this
      // tall page's own text (2026-09-25: the sent-log caption at 1512, the Jev row at 1280),
      // and it would have been on screen by now, beside the row's new last four.
      await expect(page.getByTestId("models-announcer")).toContainText("키를 저장했어요");
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);

      await page.getByTestId("ai-replace-openai").click();
      await page.getByTestId("ai-key-input-openai").fill("sk-openai-new-key-k2m3");
      await page.getByTestId("ai-save-openai").click();
      await expect(page.getByTestId("ai-stored-openai")).toContainText("····k2m3");

      await page.getByTestId("ai-replace-openai").click();
      const clear = page.getByTestId("ai-clear-openai");
      await clear.click();
      await expect(clear).toHaveText("정말 지우기");
      await clear.click();
      await expect(page.getByTestId("ai-status-openai")).toHaveText("키 없음");
      await expect(page.getByTestId("ai-register-openai")).toBeVisible();
      await expect(page.getByTestId("models-announcer")).toContainText("키를 지웠어요");
      await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
      await capture(page, `${width}-06-keys-after`, "models-keys");
    });

    test("the Jev request is shown before the one press that sends exactly it", async ({ page }) => {
      await openModelsTab(page);
      const external = page.getByTestId("models-external");
      await expect(external.getByTestId("models-experimental")).toHaveText("(실험 기능)");
      await expect(page.getByTestId("jev-key-status")).toHaveText("키 없음");

      await page.getByTestId("jev-register").click();
      await page.getByTestId("ai-key-input-jev").fill("ts-e2e-key-7q8w");
      await page.getByTestId("ai-save-jev").click();
      await expect(page.getByTestId("jev-key-status")).toContainText("····7q8w");

      await page.getByTestId("jev-open-check").click();
      await expect(page.getByTestId("jev-send")).toBeDisabled();
      await page.getByTestId("jev-claim").fill("환불 요청만으로 재고가 바로 돌아온다.");
      await page.getByTestId("jev-evidence").fill("환불이 승인되면 재고 복원 작업을 대기열에 넣는다. (orders/refund.ts:42)");
      const preview = page.getByTestId("jev-request-preview");
      await expect(preview).toBeVisible();
      await expect(preview).toContainText("환불 요청만으로 재고가 바로 돌아온다.");
      // The whole request is on the page, not behind a scrollbar macOS does not draw.
      expect(await preview.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      const shown = (await preview.textContent()) ?? "";
      const before = await auditCount(page);
      // Nothing has left yet.
      expect(await page.evaluate(() => (window as unknown as { __jevPayloads: string[] }).__jevPayloads.length)).toBe(0);
      await capture(page, `${width}-07-jev-preview`, "jev-request-preview");

      await page.getByTestId("jev-send").click();
      await expect(page.getByTestId("jev-result")).toHaveAttribute("data-choice", "contradicted");
      const sent = await page.evaluate(() => (window as unknown as { __jevPayloads: string[] }).__jevPayloads);
      expect(sent).toEqual([shown]);
      await expect.poll(() => auditCount(page)).toBe(before + 1);
      await expect(page.getByTestId("ai-audit-row").first()).toContainText("api.typesafe.ai");
      // What left is what the person pasted, never "folder characters".
      await expect(page.getByTestId("ai-audit-row").first()).toContainText("붙여 넣은 글");
      await expect(page.getByTestId("ai-audit-row").first()).not.toContainText("폴더 데이터");
      await capture(page, `${width}-08-jev-result`, "jev-result");
    });

    test("the old settings door lands on this tab", async ({ page }) => {
      await installDesktopRailRuntime(page, {}, undefined, { models: MODELS });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/ko/?guides=off");
      await page.getByTestId("first-run-open").click();
      await page.locator('[data-testid="app-settings-trigger"]:visible').click();
      await expect(page.getByTestId("app-settings-nav-ai")).toHaveCount(0);
      await page.getByTestId("app-settings-nav-models").click();
      await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);
      await expect(page.getByTestId("ai-connection-view")).toBeVisible();
    });
  });
}

test("on the web the tab exists and says where it works, with no sample rows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ko/agents/?tab=models&guides=off");
  await expect(page.getByTestId("agents-tab-models")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("ai-connection-web-degraded")).toBeVisible();
  await expect(page.getByTestId("ai-connection-download-link")).toHaveAttribute("href", /\/download\//);
  for (const id of ["models-local", "models-keys", "models-external", "ai-audit-tail"]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await capture(page, "1280-09-web");
  const result = await axe(page);
  expect(result.violations).toEqual([]);
});
