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

  // 지도도 같은 사실을 말한다(3번 조각) — 하트비트 없이 activity.jsonl 만으로
  // 쓰는-중 대상 노드에 W6 링이 붙는다. 캔버스 픽셀은 못 읽으므로
  // `__atlasMap.nodes()` 의 typed 신호로 잰다(그리는 쪽과 같은 판정).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const map = (
            window as unknown as {
              __atlasMap?: { nodes: () => Array<{ id: string; agentFocus: boolean }> };
            }
          ).__atlasMap;
          if (!map) return null;
          return map
            .nodes()
            .filter((node) => node.agentFocus)
            .map((node) => node.id);
        }),
      { timeout: 30_000, message: "쓰는-중 대상 노드에 에이전트 링이 안 붙었다" },
    )
    .toEqual(["capability:pay"]);
});

/**
 * 알림함도 같은 이름을 말한다 — 끝난 작업(마지막 쓰기 후 5분 초과)의 「작업 끝」
 * 줄이 「claude-code 작업 끝」이 된다. 씨앗은 20분 전 쓰기 두 줄: 한 작업으로
 * 묶이고, 이미 조용해졌으므로 끝 알림이 있다.
 */
test("알림함의 작업 알림이 에이전트 이름으로 말한다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
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
  await expect(endRow, "끝난 작업 줄이 이름을 잃었다").toContainText("claude-code 작업 끝");
});
