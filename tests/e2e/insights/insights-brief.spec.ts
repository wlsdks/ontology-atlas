import { expect, test } from "@playwright/test";
import { stubDirectoryPicker } from "../vault-picker-stub";
import { seedFirstRunSeen } from "../first-run-seed";
import { HARNESS_SOURCE_COMMANDS, installHarnessRuntime, mountHarnessVault } from "../harness-tab-fixture";

/**
 * **The brief reports the folder a person actually opened.**
 *
 * The hosted sample cannot answer any of this: it has no wiki, no agent log, and a browser
 * cannot read the code beside a folder. So this spec opens a real folder through the picker
 * stub and reads what the brief then says — the wiki page whose source moved under it, the
 * agent calls since, and the named list of what changed. The one thing it must NOT say is
 * that ontology evidence is fine: with no Git bridge the honest answer is "measured in the
 * app", and a screen quietly reporting `current` would be the defect this tab exists to end.
 */

const FRONT = (lines: string[]) => ["---", ...lines, "---", ""].join("\n");

const SOURCE_BODY = "2026 3분기 계획\n환불은 승인 뒤 7일 안에 처리한다.\n";

const SEED: Record<string, string> = {
  "project.md": FRONT([
    "uid: 6f1d41a2-1111-4aaa-9aaa-000000000001",
    "kind: project",
    "slug: project",
    "title: Brief Shop",
    "contains:",
    "  - domains/orders",
  ]) + "# Brief Shop\n\n브리핑을 검사하는 폴더.\n",
  "domains/orders.md": FRONT([
    "uid: 6f1d41a2-1111-4aaa-9aaa-000000000002",
    "kind: domain",
    "slug: domains/orders",
    "title: Orders",
    "description: 주문을 받고 환불한다.",
    "contains:",
    "  - capabilities/refund",
  ]) + "# Orders\n\n주문 도메인.\n",
  // Written by an agent and never reviewed by a person: one of the brief's own lines.
  "capabilities/refund.md": FRONT([
    "uid: 6f1d41a2-1111-4aaa-9aaa-000000000003",
    "kind: capability",
    "slug: capabilities/refund",
    "title: Refund",
    "domain: domains/orders",
    "path: src/refund.ts",
    "created_by: agent:claude",
  ]) + "# Refund\n\n## Definition\n\n환불을 처리하는 역량이에요.\n",
  "sources/quarter-plan.txt": SOURCE_BODY,
  // The page records a hash that is not this file's: the source moved under the page.
  "wiki/quarter-plan.md": FRONT([
    "title: 분기 계획",
    "created_by: agent:claude",
    "compiled_at: 2026-09-18T00:00:00Z",
    "sources:",
    "  - sources/quarter-plan.txt",
    "source_hash:",
    "  sources/quarter-plan.txt: 0000000000000000000000000000000000000000000000000000000000000000",
    "status: draft",
    "summary: 3분기 계획 한 장.",
  ]) + "## Summary\n\n환불 기한이 적힌 계획.\n\n## Facts\n\n- 환불은 7일 안에 처리한다. [[src:sources/quarter-plan.txt#p1]]\n",
  ".ontology-atlas/activity.jsonl": [
    JSON.stringify({ v: 1, at: new Date().toISOString(), tool: "get_concept", target: "capabilities/refund", summary: "read", agent: "claude", why: null }),
    JSON.stringify({ v: 1, at: new Date().toISOString(), tool: "add_concept", target: "capabilities/refund", summary: "wrote", agent: "claude", why: null }),
    "",
  ].join("\n"),
};

test("the brief names the open folder's wiki and agents, and says so for what it could not measure", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);

  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("topology-index-panel")).toContainText("Brief Shop", { timeout: 30_000 });

  await page.goto("/ko/ontology/insights/?tab=brief&guides=off", { waitUntil: "domcontentloaded" });
  const brief = page.getByTestId("brief-tab");
  await expect(brief).toBeVisible({ timeout: 30_000 });

  await expect(page.locator('[data-brief-core="wiki"][data-brief-line="wiki-stale-pages"]')).toHaveText(/1/, { timeout: 30_000 });

  // The list does not count the calls a second time; the since card names them one by one.
  const agent = page.getByTestId("brief-lines");
  await expect(agent.locator('[data-brief-core="agent"][data-brief-line="agent-writes-since"]')).toHaveText(/1/);
  await expect(agent.locator('[data-brief-line="agent-calls-since"]')).toHaveCount(0);

  // A concept an agent wrote that nobody has reviewed is named as unknown, not as fine.
  const ontology = page.getByTestId("brief-lines");
  await expect(ontology.locator('[data-brief-core="ontology"][data-brief-line="ontology-agent-unreviewed"]')).toHaveText(/1/);
  await expect(
    ontology.locator('[data-brief-line="ontology-evidence-moved"]'),
    "a browser cannot date the code beside the folder, so it must not claim anything moved or is fine",
  ).toHaveCount(0);
  await expect(page.getByTestId("brief-app-only")).toContainText("앱에서만 잴 수 있어요");

  // The heading sums lines, and the since list names what changed rather than counting again.
  await expect(page.getByTestId("brief-headline")).toContainText("새로 알아야 할 것");
  const since = page.getByTestId("brief-since");
  await expect(since).toContainText("add_concept");
  await expect(since).toContainText("Refund");

  // The one state-changing control answers in the same frame: the window sentence becomes a
  // visit sentence and the counts it governed restart at zero.
  await expect(brief).toContainText("최근 7일 기준");
  await page.getByTestId("brief-mark-seen").click();
  await expect(brief).toContainText("오늘 본 뒤로");
  await expect(agent.locator('[data-brief-line="agent-writes-since"]')).toHaveCount(0);
  await expect(page.getByTestId("brief-since")).toHaveCount(0);

});

test("while the app is still reading instructions, the headline shows no partial sum and says it is counting", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await installHarnessRuntime(page);
  await page.addInitScript((sourceCommands: readonly string[]) => {
    const internals = (window as unknown as {
      __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
    }).__TAURI_INTERNALS__;
    const inner = internals.invoke.bind(internals);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (window as unknown as { __releaseGuidanceScan: () => void }).__releaseGuidanceScan = () => release();
    internals.invoke = (command, args = {}) =>
      sourceCommands.includes(command) ? gate.then(() => inner(command, args)) : inner(command, args);
  }, HARNESS_SOURCE_COMMANDS);
  await mountHarnessVault(page);

  await page.goto("/ko/ontology/insights/?tab=brief&guides=off", { waitUntil: "domcontentloaded" });
  const headline = page.getByTestId("brief-headline");
  await expect(page.getByTestId("brief-core-reading-harness")).toBeVisible({ timeout: 30_000 });
  await expect(headline).toHaveAttribute("data-brief-headline-state", "counting");
  await expect(headline).toHaveAttribute("aria-busy", "true");
  // Drawn once the read outlasts the loading beat, in the working ink.
  await expect(headline.locator(".acp-working-shimmer")).toHaveCount(1);
  await expect(headline).toHaveText("새로 알아야 할 것과 확인 못 한 것을 세고 있어요");
  const counting = await headline.boundingBox();

  await page.evaluate(() => (window as unknown as { __releaseGuidanceScan: () => void }).__releaseGuidanceScan());
  await expect(page.getByTestId("brief-core-reading-harness")).toHaveCount(0, { timeout: 30_000 });
  await expect(headline).toHaveAttribute("data-brief-headline-state", "settled");
  await expect(headline).not.toHaveAttribute("aria-busy", "true");
  await expect(headline).toHaveText(/새로 알아야 할 것 \d+개 · 확인 못 한 것 \d+개/);
  await expect(headline.locator(".acp-working-shimmer")).toHaveCount(0);
  const settled = await headline.boundingBox();
  // One hero line in both states: nothing under it moves when the numbers land.
  expect(settled?.height).toBe(counting?.height);
  expect(settled?.y).toBe(counting?.y);
});
