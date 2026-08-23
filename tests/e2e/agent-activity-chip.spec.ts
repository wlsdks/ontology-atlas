import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **Does the screen distinguish a verified live heartbeat from a recent write log?**
 *
 * **Why this spec exists.** The activity chip (`AgentActivityChip`) had no e2e at
 * all — unit tests swap the whole feed for a mock, so no gate had seen the full chain
 * "one line of the vault's `activity.jsonl` → parser → session grouping → feed →
 * on-screen wording". That chain just gained an `agent` name field (clientInfo.name
 * from the MCP connection greeting, PR #1066), and only this layer can measure whether
 * the new field really flows through to the screen.
 *
 * Only the picker is stubbed; everything behind it is real code (see the
 * `vault-picker-stub` preamble).
 *
 * **Timestamps are created at the moment the folder is picked.** `activity.jsonl`
 * records writes that already happened, so it does not prove live. Only a fresh
 * `agent-activity.json` heartbeat states the current step, and deleting it must drop
 * the same screen to `Change Detected` and remove the map's focus ring with it.
 */
test("fresh heartbeat만 현재 단계와 지도 대상을 말하고, 제거되면 변경 감지로 내린다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  const activityLine = JSON.stringify({
    v: 1,
    at: "{{NOW-30000}}",
    tool: "add_concept",
    target: "capabilities/pay",
    summary: "add_concept capability:capabilities/pay",
    agent: "codex-mcp-client",
    why: null,
  });
  const heartbeat = JSON.stringify({
    agent: "codex-acp",
    state: "verifying",
    focus: {
      summary: "결제 역량 관계를 검증해줘",
      ontologySlug: "capabilities/pay",
      files: [],
    },
    plan: ["변경 결과 확인"],
    evidence: { mcp: ["validate_vault"], source: [], codegraph: [], verification: [] },
    updatedAt: "{{NOW-1000}}",
  });

  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - capabilities/pay\n---\n\n# Chip Shop\n`,
    "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
    ".ontology-atlas/activity.jsonl": `${activityLine}\n`,
    ".ontology-atlas/agent-activity.json": `${heartbeat}\n`,
  });

  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();

  const status = page.getByTestId("agent-activity-status");
  await expect(status, "fresh heartbeat가 상태 칩에 닿지 않았다").toBeVisible({
    timeout: 30_000,
  });
  await expect(status).toHaveText("Codex · 검증 중");
  await expect(page.getByTestId("agent-activity-target")).toContainText("현재 대상:");
  await expect(page.getByTestId("agent-activity-target")).toContainText("Pay");
  await page.getByTestId("agent-activity-status-trigger").click();
  const current = page.getByTestId("agent-activity-current-work");
  await expect(current).toContainText("결제 역량 관계를 검증해줘");
  await expect(current).toContainText("validate_vault");
  await page.keyboard.press("Escape");

  const focused = () =>
    page.evaluate(() => {
      const map = (
        window as unknown as {
          __atlasMap?: { nodes: () => Array<{ id: string; agentFocus: boolean }> };
        }
      ).__atlasMap;
      if (!map) return null;
      return map.nodes().filter((node) => node.agentFocus).map((node) => node.id);
    });
  await expect.poll(focused, { timeout: 30_000 }).toEqual(["capability:pay"]);

  const cleared = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const key of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) {
      if (key.startsWith("stub-vault-")) names.push(key);
    }
    names.sort();
    const dirName = names.at(-1);
    if (!dirName) return false;
    const dir = await root.getDirectoryHandle(dirName);
    const sidecar = await dir.getDirectoryHandle(".ontology-atlas");
    await sidecar.removeEntry("agent-activity.json");
    return true;
  });
  expect(cleared).toBe(true);
  await expect(status).toHaveText(/Codex · 변경 감지/, { timeout: 30_000 });
  await expect(page.getByTestId("agent-activity-target")).toContainText("마지막 변경:");
  await expect.poll(focused, { timeout: 30_000 }).toEqual([]);

  await page.getByTestId("agent-activity-target").click();
  await expect(page).toHaveURL(/\/ko\/topology\/?\?.*p=capabilities%2Fpay/);
  await expect(page.getByRole("heading", { name: "Pay" })).toBeVisible();
});

/**
 * The notification tray states the same name — a finished job (more than 5 minutes
 * after the last write) turns its "job finished" line into "claude-code job finished". The
 * seed is two writes from 20 minutes ago: they group into one job, and since it has
 * gone quiet there is a completion notification.
 */
test("알림함의 작업 알림이 에이전트 이름으로 말한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // For the same reason as the test above, timestamps are created **at write time** —
  // the margin is large here, but two ways of seeding in one file means the next person
  // copies the stale one.
  const at = (minAgo: number) => `{{NOW-${minAgo * 60_000}}}`;
  const line = (iso: string) =>
    JSON.stringify({
      v: 1,
      at: iso,
      tool: "add_concept",
      target: "capabilities/pay",
      summary: "add_concept capability:capabilities/pay",
      agent: "claude-code",
      why: null,
    });

  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, {
    "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - capabilities/pay\n---\n\n# Chip Shop\n`,
    "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
    ".ontology-atlas/activity.jsonl": `${line(at(21))}\n${line(at(20))}\n`,
  });

  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();

  const bell = page.getByTestId("agent-activity-bell");
  await expect(bell, "알림 벨이 안 떴다").toBeVisible({ timeout: 30_000 });
  // Dev server only: Next's dev badge (<nextjs-portal>, bottom right) floats in the
  // same corner as the bell and intercepts the click (measured — 0 console errors, a
  // pure badge). It does not exist in the product, so removing it does not distort the
  // screen. A no-op in a static build.
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await bell.click();

  const endRow = page
    .getByTestId("agent-activity-inbox-row")
    .and(page.locator('[data-kind="task-end"]'));
  await expect(endRow).toHaveCount(1);
  await expect(endRow, "끝난 작업 줄이 이름을 잃었다").toContainText("Claude Code 작업 끝");
});
