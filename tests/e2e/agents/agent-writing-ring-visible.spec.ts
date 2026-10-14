import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

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

function heartbeatLine(slug: string, atIso: string): string {
  return JSON.stringify({
    agent: "claude-code",
    state: "editing",
    focus: { summary: "결제 역량을 고치는 중", ontologySlug: slug, files: [] },
    plan: [],
    evidence: { mcp: ["patch_concept"], source: [], codegraph: [], verification: [] },
    updatedAt: atIso,
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

  await expect(page.getByTestId("ontology-map-canvas")).toBeVisible({ timeout: 30_000 });

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

  // Starting state: nobody is writing. If it were already on here, the assertion
  // below would prove nothing.
  await expect
    .poll(focused, { timeout: 30_000 })
    .not.toBeNull();
  expect(await focused(), "시작부터 켜져 있다 — 이 시험은 무엇도 못 잰다").toEqual([]);

  // ── Plant the heartbeat saying "an agent is editing this node right now" ──
  const seeded = await page.evaluate(
    async ([line, heartbeat]) => {
      const root = await navigator.storage.getDirectory();
      const names: string[] = [];
      for await (const key of (root as unknown as { keys: () => AsyncIterable<string> }).keys()) {
        if (key.startsWith("stub-vault-")) names.push(key);
      }
      names.sort();
      const dirName = names.at(-1);
      if (!dirName) return false;
      const dir = await root.getDirectoryHandle(dirName);
      // A real agent leaves **the document and the record together** — planting only one
      // would measure a state that never actually occurs.
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
      const heartbeatHandle = await sidecar.getFileHandle("agent-activity.json", { create: true });
      const heartbeatWritable = await heartbeatHandle.createWritable();
      await heartbeatWritable.write(`${heartbeat}\n`);
      await heartbeatWritable.close();
      return true;
    },
    [
      activityLine(WRITTEN_SLUG, new Date().toISOString()),
      heartbeatLine(WRITTEN_SLUG, new Date().toISOString()),
    ],
  );
  expect(seeded, "활동 기록을 못 심었다").toBe(true);

  // Wait for polling (1.5 s right after a change, 5 s when quiet) to pick it up.
  await expect
    .poll(focused, {
      timeout: 30_000,
      message:
        "보고 있는 동안 fresh heartbeat가 생겼는데 지도가 target을 모른다. " +
        "끊긴 곳은 **되묻기(폴링) 재독해** 또는 heartbeat→focus 배선이다.",
    })
    .not.toEqual([]);
  await expect(page.getByTestId("agent-activity-status")).toHaveText("Claude Code · 편집 중");
});
