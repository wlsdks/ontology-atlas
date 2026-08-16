import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * 대화가 **도는 동안** 에이전트가 쓴 노드에 지도가 표시를 낸다.
 *
 * ## 이미 있는 것과 무엇이 다른가 (2026-08-17)
 *
 * `agent-activity-chip.spec.ts` 가 같은 사슬을 이미 잠근다 — 다만 신호를
 * **볼트를 열기 전에** 심는다. 그건 「앱을 켰더니 에이전트가 작업 중이더라」를
 * 재는 것이고, 소유자가 말한 것은 그게 아니다:
 *
 * > *"실시간으로 좌측 지도에 온톨로지가 그려지는게 보이도록"*
 *
 * 즉 **보고 있는 동안** 들어오는 것. 그 경로는 다른 코드가 탄다 — 첫 로드가
 * 아니라 되묻기(폴링)와 그 안의 「사이드카만 바뀐 경우」 갈래다. 그 갈래는
 * 2026-08-16 에 「안 바뀌었으면 상태도 안 건드린다」로 좁혀졌고, 그때 사이드카
 * 비교는 **길이만** 본다. 아무도 그 길을 실제로 걸어 본 적이 없다.
 *
 * ## 무엇이 끊기면 이 시험이 빨개지나
 *
 * 되묻기 재독해를 끄고 확인했다 — 빨개진다. 반대로 「사이드카만 바뀐 경우」
 * 비교를 무력화해도 **통과한다**: 진짜 에이전트는 문서와 기록을 같이 남기고,
 * 문서가 바뀌면 지문이 달라져 전체 재독해가 돌기 때문이다. 그 갈래는 이
 * 시험의 사정거리 밖이라고 적어 둔다 — 통과를 그 갈래의 증거로 읽지 마라.
 *
 * ## 재는 법
 *
 * 캔버스는 단언할 원소가 없다. 픽셀 비교도 안 쓴다 — 물리 시뮬레이션이 스스로
 * 움직여서 「달라졌다」가 우리 신호 때문인지 알 수 없다(실제로 그렇게 만들어
 * 봤다가 버렸다). 대신 그리는 쪽과 **같은 판정**을 노출하는
 * `__atlasMap.nodes()` 의 `agentFocus` 를 본다 — 옆 스펙이 이미 쓰는 방식이다.
 */

const WRITTEN_SLUG = "capabilities/checkout";

function activityLine(slug: string, atIso: string): string {
  return JSON.stringify({
    v: 1,
    at: atIso,
    tool: "patch_concept",
    target: slug,
    summary: "시험이 심은 쓰기",
    agent: "claude-code",
    why: null,
  });
}

test("보고 있는 동안 에이전트가 쓴 노드를 지도가 집는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(
    page.getByTestId("first-run-starter"),
    "볼트가 안 물렸다 — 아래 측정은 전부 무의미하다.",
  ).toHaveCount(0, { timeout: 30_000 });

  await expect(page.getByTestId("topology-map-v2-canvas")).toBeVisible({ timeout: 30_000 });

  const focused = () =>
    page.evaluate(() => {
      const map = (
        window as unknown as {
          __atlasMap?: { nodes: () => Array<{ id: string; agentFocus: boolean }> };
        }
      ).__atlasMap;
      if (!map) return null;
      return map.nodes().filter((n) => n.agentFocus).map((n) => n.id);
    });

  // 시작 상태 — 아무도 안 쓰고 있다. 여기서 이미 켜져 있으면 아래 단언이
  // 아무것도 증명하지 못한다.
  await expect
    .poll(focused, { timeout: 30_000 })
    .not.toBeNull();
  expect(await focused(), "시작부터 켜져 있다 — 이 시험은 무엇도 못 잰다").toEqual([]);

  // ── 「에이전트가 방금 이 노드를 썼다」를 볼트에 심는다 ──────────────────
  const seeded = await page.evaluate(
    async ([line]) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const key of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) {
        if (key.startsWith("stub-vault-")) names.push(key);
      }
      names.sort();
      const dirName = names.at(-1);
      if (!dirName) return false;
      const dir = await root.getDirectoryHandle(dirName);
      // 진짜 에이전트는 **문서와 기록을 같이** 남긴다 — 하나만 심으면 실제로
      // 일어나지 않는 상태를 재게 된다.
      const caps = await dir.getDirectoryHandle("capabilities");
      const doc = await caps.getFileHandle("checkout.md");
      const previous = await (await doc.getFile()).text();
      const docWritable = await doc.createWritable();
      await docWritable.write(`${previous}\n에이전트가 방금 고친 자국.\n`);
      await docWritable.close();

      const sidecar = await dir.getDirectoryHandle(".ontology-atlas", { create: true });
      const handle = await sidecar.getFileHandle("activity.jsonl", { create: true });
      const writable = await handle.createWritable();
      await writable.write(`${line}\n`);
      await writable.close();
      return true;
    },
    [activityLine(WRITTEN_SLUG, new Date().toISOString())],
  );
  expect(seeded, "활동 기록을 못 심었다").toBe(true);

  // 되묻기(직후 1.5초 / 잠잠하면 5초)가 그것을 읽어 오기까지 기다린다.
  await expect
    .poll(focused, {
      timeout: 30_000,
      message:
        "보고 있는 동안 에이전트가 노드를 썼는데 지도가 그것을 모른다. " +
        "첫 로드에서는 되는 길이므로(agent-activity-chip.spec.ts) 끊긴 곳은 " +
        "**되묻기(폴링) 재독해**다 — 지문이 달라졌는데 다시 안 읽었거나, " +
        "다시 읽고도 활동 기록이 화면까지 안 왔다.",
    })
    .not.toEqual([]);
});
