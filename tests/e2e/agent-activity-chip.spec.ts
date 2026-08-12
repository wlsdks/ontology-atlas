import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **「누가 작업 중인지」 칩이 실제 로그에서 이름을 읽는가** (2026-08-13).
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
 * ## 시각은 스펙 실행 시점에 만든다
 *
 * 「작업 중」 창은 마지막 쓰기 후 2분(`AGENT_WRITING_WINDOW_MS`)이라 고정
 * 타임스탬프는 하루만 지나도 창 밖이다. 씨앗의 `at` 은 실행 순간 기준 30초
 * 전으로 계산한다 — 페이지 로드가 2분을 넘기면 이 spec 은 시간 초과로 죽지
 * 문구가 조용히 틀리지는 않는다(그때는 「마지막 작업」 문구가 되므로 단언이
 * 명시적으로 실패한다).
 */
test("활동 칩은 로그의 에이전트 이름으로 「작업 중」을 말한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  const recentAt = new Date(Date.now() - 30_000).toISOString();
  const activityLine = JSON.stringify({
    v: 1,
    at: recentAt,
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
    ".ontology-atlas/activity.jsonl": `${activityLine}\n`,
  });

  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();

  const status = page.getByTestId("agent-activity-status");
  await expect(status, "활동 칩이 안 떴다 — 30초 전 쓰기는 24시간 창 안이다").toBeVisible({
    timeout: 30_000,
  });
  // 이름이 로그에 있으면 화면도 이름으로 말한다. 「작업 중」만 남고 이름이
  // 빠지면 파서→세션→피드 어딘가에서 agent 칸이 떨어진 것이다.
  await expect(status).toHaveText(/claude-code 작업 중/);
  // 대상 링크도 같은 줄에서 산다 — 매니페스트에 실재하는 슬러그라 링크여야 한다.
  await expect(page.getByTestId("agent-activity-target")).toHaveText("Pay");
});
