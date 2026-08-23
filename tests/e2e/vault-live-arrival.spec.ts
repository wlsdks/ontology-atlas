import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * When an agent writes a node, **does the map follow**, and **is that visible**?
 *
 * ## Why this spec exists (owner request, 2026-08-17)
 *
 * Owner: *"The ontology should be visibly drawn on the left map in real time now that
 * interaction works — and that should be verified."*
 *
 * The plumbing already exists: a folder change triggers a reread. But **plumbing
 * existing and the screen following are different claims**, and this repository has
 * been hurt by that difference several times (correct values that never draw because
 * the loop is asleep; a hook count is not a screen). So instead of guessing, this
 * spec **really writes one more file** and looks at the screen.
 *
 * ## What is and is not measured
 *
 * **Measured**: whether a new node actually arrives in the list on the browser path,
 * and within how many seconds (an upper bound only).
 *
 * **Not measured**: the installed app's OS file watcher. That does not exist in a
 * browser — `.claude/rules/surfaces.md` establishes that desktop-only behaviour is
 * proven only on an installed build. What is locked here is **the web path
 * (polling)**, and if it dies the app dies with it since both use the same reread
 * code.
 */

/** The web polls at 1.5s right after a change and 5s when quiet. Allow slack. */
const ARRIVAL_BUDGET_MS = 20_000;

const NEW_NODE_SLUG = "capabilities/live-arrival-probe";
const NEW_NODE_TITLE = "실시간 도착 확인용";
const NEW_NODE_BODY = `---
uid: 9f1d3c2a-0000-4000-8000-00000000f00d
kind: capability
title: ${NEW_NODE_TITLE}
domain: domains/storefront
---

이 문서는 지도가 새 노드를 따라오는지 재려고 시험이 직접 쓴 것이다.
`;

test("에이전트가 쓴 노드가 지도 목록에 실제로 도착한다", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(
    page.getByTestId("first-run-starter"),
    "볼트가 안 물렸다 — 아래 측정은 전부 무의미하다.",
  ).toHaveCount(0, { timeout: 30_000 });

  const rows = page.getByTestId("topology-index-row");
  await expect(
    rows.first(),
    "목록에 행이 하나도 없다 — 셀 것이 없으면 「도착했다」도 증명 못 한다.",
  ).toBeVisible({ timeout: 30_000 });
  const before = await rows.count();
  expect(before, "픽스처 볼트가 너무 얇다").toBeGreaterThan(3);

  // ── Write one more file into the folder, as an agent would ────────────────
  const wrote = await page.evaluate(
    async ([slug, body]) => {
      const root = await navigator.storage.getDirectory();
      // Find the vault folder the stub created (its name carries a timestamp, so take the newest).
      const names: string[] = [];
      for await (const key of (
        root as unknown as { keys: () => AsyncIterable<string> }
      ).keys()) {
        if (key.startsWith("stub-vault-")) names.push(key);
      }
      names.sort();
      const dirName = names.at(-1);
      if (!dirName) return null;
      const dir = await root.getDirectoryHandle(dirName);
      const segments = `${slug}.md`.split("/");
      const file = segments.pop() as string;
      let cursor = dir;
      for (const segment of segments) {
        cursor = await cursor.getDirectoryHandle(segment, { create: true });
      }
      const handle = await cursor.getFileHandle(file, { create: true });
      const writable = await handle.createWritable();
      await writable.write(body);
      await writable.close();
      return dirName;
    },
    [NEW_NODE_SLUG, NEW_NODE_BODY],
  );
  expect(wrote, "스텁 볼트 폴더를 못 찾았다 — 아무것도 안 썼다").not.toBeNull();

  // ── Does the screen follow? ────────────────────────────────────────
  const startedAt = Date.now();
  await expect(
    page.getByText(NEW_NODE_TITLE).first(),
    `${ARRIVAL_BUDGET_MS}ms 안에 새 노드가 화면에 안 나타났다 — 에이전트가 볼트를 ` +
      `고쳐도 지도가 따라오지 않는다는 뜻이다.`,
  ).toBeVisible({ timeout: ARRIVAL_BUDGET_MS });
  const elapsed = Date.now() - startedAt;

  const after = await rows.count();
  await testInfo.attach("arrival.json", {
    body: JSON.stringify({ before, after, elapsedMs: elapsed }, null, 2),
    contentType: "application/json",
  });

  expect(after, "제목은 보이는데 목록 행은 안 늘었다").toBeGreaterThan(before);
});
