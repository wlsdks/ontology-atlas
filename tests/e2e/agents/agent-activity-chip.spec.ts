import { expect, test } from "@playwright/test";
import {
  installDesktopRailRuntime,
  mountDesktopVault,
  removeDesktopFile,
} from "../desktop-rail-arrival-harness";

/** An ISO timestamp this many milliseconds ago: the fake serves texts as written, so the spec resolves the time. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

test("only a fresh heartbeat states the current step and map target, and removal falls back to change detection", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  const activityLine = JSON.stringify({
    v: 1,
    at: ago(30_000),
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
    updatedAt: ago(1_000),
  });

  await installDesktopRailRuntime(page, {
    "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - capabilities/pay\n---\n\n# Chip Shop\n`,
    "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
    ".ontology-atlas/activity.jsonl": `${activityLine}\n`,
    ".ontology-atlas/agent-activity.json": `${heartbeat}\n`,
  }, undefined, { replaceFixture: true, writable: true });

  await mountDesktopVault(page, "ko");
  await page.goto("/ko/topology/?e2e=1&guides=off");

  const status = page.getByTestId("agent-activity-status");
  await expect(status, "the fresh heartbeat did not reach the status chip").toBeVisible({
    timeout: 30_000,
  });
  await expect(status).toHaveText("Codex · 검증 중");
  await page.getByTestId("agent-activity-status-trigger").click();
  const current = page.getByTestId("agent-activity-current-work");
  await expect(current).toContainText("현재 대상");
  await expect(page.getByTestId("agent-activity-target")).toContainText("Pay");
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

  await removeDesktopFile(page, ".ontology-atlas/agent-activity.json");
  await expect(status).toHaveText(/Codex · 변경 감지/, { timeout: 30_000 });
  await expect.poll(focused, { timeout: 30_000 }).toEqual([]);

  await page.getByTestId("agent-activity-status-trigger").click();
  await expect(page.getByTestId("agent-activity-current-work")).toContainText("마지막 변경");
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
test("job notifications in the inbox speak by agent name", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // For the same reason as the test above, timestamps are created **at write time** —
  // the margin is large here, but two ways of seeding in one file means the next person
  // copies the stale one.
  const at = (minAgo: number) => ago(minAgo * 60_000);
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

  await installDesktopRailRuntime(page, {
    "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Chip Shop\ncontains:\n  - capabilities/pay\n---\n\n# Chip Shop\n`,
    "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
    ".ontology-atlas/activity.jsonl": `${line(at(21))}\n${line(at(20))}\n`,
  }, undefined, { replaceFixture: true, writable: true });

  await mountDesktopVault(page, "ko");
  await page.goto("/ko/topology/?e2e=1&guides=off");

  const bell = page.getByTestId("agent-activity-bell");
  await expect(bell, "the notification bell did not appear").toBeVisible({ timeout: 30_000 });
  await bell.click();

  /*
   * The panel opens on the tab that has something in it — with nothing waiting on the
   * person, that is the results tab. Both tabs carry the agent's name on the second line,
   * beside the duration; the first line says what the work did. Both are checked,
   * because the name reaching one tab and not the other is the drift this spec exists
   * to catch.
   */
  const resultRow = page.getByTestId("agent-inbox-result-row");
  await expect(resultRow).toHaveCount(1);
  await expect(resultRow, "the finished job row lost its name").toContainText("Claude Code");
  await page.getByRole("tab", { name: /기록/ }).click();
  const endRow = page
    .getByTestId("agent-inbox-history-row")
    .and(page.locator('[data-kind="task-end"]'));
  await expect(endRow).toHaveCount(1);
  await expect(endRow, "the collapsed job in the history lost its name").toContainText("Claude Code");
});
