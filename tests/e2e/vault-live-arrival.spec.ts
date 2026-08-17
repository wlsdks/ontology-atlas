import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * 에이전트가 노드를 쓰면 **지도가 따라오는가**, 그리고 **그게 보이는가**.
 *
 * ## 왜 이 스펙이 있나 (2026-08-17 소유자 지시)
 *
 * 소유자: *"실시간으로 좌측 지도에 온톨로지가 그려지는게 보이도록 하는것도
 * 필요할듯? 이제 상호작용이 가능하게 되었으니? 그걸 검증해보기도 해야함"*
 *
 * 배관은 이미 있다 — 폴더가 바뀌면 다시 읽는다. 그런데 **배관이 있다는 것과
 * 화면이 따라온다는 것은 다른 말**이고, 이 저장소는 그 차이로 이미 여러 번
 * 다쳤다(값은 맞는데 루프가 잠들어 안 그려진다 · 훅 개수는 화면이 아니다).
 * 그래서 짐작하지 않고 **파일을 진짜로 하나 더 쓰고** 화면을 본다.
 *
 * ## 무엇을 재고 무엇을 안 재나
 *
 * **잰다**: 브라우저 경로에서 새 노드가 목록에 실제로 도착하는가, 그리고 몇
 * 초 안에 오는가(상한만).
 *
 * **안 잰다**: 설치된 앱의 OS 파일워처. 그건 브라우저에 없다 —
 * `.claude/rules/surfaces.md` 가 데스크톱 전용 동작은 설치본에서만 증명된다고
 * 정해 뒀다. 여기서 잠그는 것은 **웹 경로(되묻기)** 이고, 그것이 죽으면 앱도
 * 같은 재독해 코드를 쓰므로 같이 죽는다.
 */

/** 웹은 방금 바뀐 직후 1.5초 / 잠잠하면 5초 간격으로 되묻는다. 여유를 준다. */
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

  // ── 에이전트가 쓴 것처럼 폴더에 파일을 하나 더 쓴다 ────────────────────
  const wrote = await page.evaluate(
    async ([slug, body]) => {
      const root = await navigator.storage.getDirectory();
      // 스텁이 만든 볼트 폴더를 찾는다(이름에 시각이 붙어 있어 가장 최근 것).
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

  // ── 화면이 따라오는가 ──────────────────────────────────────────────
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
