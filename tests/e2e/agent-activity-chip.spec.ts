import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **검증된 live heartbeat와 최근 쓰기 로그를 화면이 구분하는가.**
 *
 * ## 왜 이 spec 이 생겼나
 *
 * 활동 칩(`AgentActivityChip`)에는 e2e 가 하나도 없었다 — 단위 테스트는 피드를
 * 통째로 목으로 갈아 끼우므로, 「볼트의 `activity.jsonl` 한 줄 → 파서 → 세션
 * 묶음 → 피드 → 화면 문구」 사슬 전체를 본 게이트가 없었다. 그 사슬에 방금
 * `agent` 이름 칸이 하나 늘었다(MCP 연결 인사의 clientInfo.name, PR #1066) —
 * 늘어난 칸이 화면까지 실제로 흐르는지는 이 층만 잴 수 있다.
 *
 * 픽커만 스텁하고 그 뒤는 전부 실제 코드다(`vault-picker-stub` 머리말).
 *
 * ## 시각은 **폴더를 고르는 순간** 에 만든다
 *
 * `activity.jsonl`은 이미 일어난 쓰기 사실이라 live를 증명하지 않는다. fresh
 * `agent-activity.json` heartbeat만 현재 단계를 말하고, 그것을 지우면 같은 화면이
 * `변경 감지`로 내려가며 지도 focus ring도 함께 사라져야 한다.
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
 * 알림함도 같은 이름을 말한다 — 끝난 작업(마지막 쓰기 후 5분 초과)의 「작업 끝」
 * 줄이 「claude-code 작업 끝」이 된다. 씨앗은 20분 전 쓰기 두 줄: 한 작업으로
 * 묶이고, 이미 조용해졌으므로 끝 알림이 있다.
 */
test("알림함의 작업 알림이 에이전트 이름으로 말한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // 위 시험과 같은 이유로 시각은 **쓰는 순간** 에 만든다 — 여기는 여유가 크지만
  // 한 파일 안에서 씨앗 만드는 법이 둘이면 다음 사람이 낡은 쪽을 베낀다.
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
  // dev 서버 전용: Next 개발 배지(<nextjs-portal>, 우하단)가 벨과 같은 구석에
  // 떠서 클릭을 가로챈다(실측 — 콘솔 에러 0, 순수 배지). 제품에는 없는
  // 요소라 치우는 것이 화면을 왜곡하지 않는다. 정적 빌드에서는 no-op.
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await bell.click();

  const endRow = page
    .getByTestId("agent-activity-inbox-row")
    .and(page.locator('[data-kind="task-end"]'));
  await expect(endRow).toHaveCount(1);
  await expect(endRow, "끝난 작업 줄이 이름을 잃었다").toContainText("Claude Code 작업 끝");
});
