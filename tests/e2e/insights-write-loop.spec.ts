import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **인사이트가 시킨 일을 그 자리에서 하면, 내 폴더의 파일이 바뀐다** (2026-08-11).
 *
 * ## 왜 이 spec 이 생겼나
 *
 * 북극성 여정을 걸어 보다 이 왕복을 재는 게이트가 **없다**는 것을 알았다.
 * `MeaningGapSection.test.tsx` 가 컴포넌트를 보지만, 그건 「버튼을 누르면 핸들러가
 * 불린다」까지다. **핸들러가 디스크에 쓰는 것**은 아무도 안 봤다 — 그리고 이 제품의
 * 약속은 정확히 그것이다(*"데이터는 언제나 평범한 마크다운 파일"*).
 *
 * 컴포넌트 시험이 초록인 채로 쓰기 경로가 깨질 수 있다: 볼트 핸들 권한, 쓰기 락,
 * `expected_mtime` 충돌, 경로 해석 — 전부 컴포넌트 밖이다.
 *
 * 픽커만 스텁하고 그 뒤는 실제 코드다(`vault-picker-stub`). 그래서 이 spec 이 재는
 * 것은 흉내가 아니라 **파일이 정말 바뀌는가**다.
 *
 * ## ⚠️ 이 spec 을 쓰다 내 계기가 먼저 틀렸다
 *
 * 처음에는 `capabilities/` 만 훑어서 「디스크에 없다」고 읽었다 — 그런데 목록의 첫
 * 항목은 **프로젝트**였고 그 파일은 볼트 루트에 있었다. 하마터면 멀쩡한 제품을
 * 결함으로 신고했을 것이다. **볼트 전체를 훑는다.**
 */

const SEED: Record<string, string> = {
  "shop.md": [
    "---",
    "uid: 11111111-1111-4111-8111-111111111111",
    "slug: shop",
    "kind: project",
    "title: Insight Shop",
    "contains:",
    "  - capabilities/pay",
    "---",
    "",
    "# Insight Shop",
    "",
  ].join("\n"),
  "capabilities/pay.md": [
    "---",
    "uid: 22222222-2222-4222-8222-222222222222",
    "slug: capabilities/pay",
    "kind: capability",
    "title: Pay",
    "---",
    "",
    "# Pay",
    "",
  ].join("\n"),
};

/** 이 문장이 파일에 나타나면 왕복이 끝난 것이다. */
const SENTENCE = "결제 승인을 처리하는 역량이에요.";

/** 볼트 전체에서 그 문장을 담은 파일을 찾는다 — 루트도 하위 폴더도 본다. */
async function filesContaining(page: import("@playwright/test").Page, needle: string) {
  return page.evaluate(async (text: string) => {
    const root = await navigator.storage.getDirectory();
    let vault: FileSystemDirectoryHandle | null = null;
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith("stub-vault-") && handle.kind === "directory") {
        vault = handle as FileSystemDirectoryHandle;
      }
    }
    if (!vault) return ["(볼트를 못 찾았다)"];
    const hits: string[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind === "directory") {
          await walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`);
          continue;
        }
        const body = await (await (handle as FileSystemFileHandle).getFile()).text();
        if (body.includes(text)) hits.push(prefix + name);
      }
    };
    await walk(vault, "");
    return hits;
  }, needle);
}

test("인사이트의 「여기서 적기」가 내 폴더의 파일을 바꾼다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);

  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("topology-index-panel")).toContainText("Insight Shop", {
    timeout: 30_000,
  });

  await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });

  /*
   * 「여기서 적기」가 있어야 한다 — 이 화면의 값어치는 다음 할 일을 **그 자리에서**
   * 하게 하는 것이다. 없으면 목록만 보여 주는 보드이고, 그건 이 저장소가 이름 붙여 둔
   * 「다음 단계가 없음」이다.
   */
  const write = page.locator("button", { hasText: "여기서 적기" }).first();
  await expect(write, "인사이트가 뜻을 적을 자리를 주지 않는다").toBeVisible({ timeout: 30_000 });
  await write.click();

  const field = page.getByTestId("meaning-gap-definition-input");
  await expect(field).toBeVisible({ timeout: 10_000 });
  await field.fill(SENTENCE);

  const save = page.locator("button", { hasText: /^저장$/ }).filter({ visible: true }).first();
  await expect(save, "적을 자리는 줬는데 저장할 길이 없다").toBeVisible();
  await save.click();

  /*
   * 시간으로 잠그지 않는다 — 쓰기 뒤 다시 읽기까지 몇 초가 걸리는지는 기계가 정한다.
   * 잠글 성질은 **결국 파일에 있는가**다.
   */
  await expect
    .poll(async () => (await filesContaining(page, SENTENCE)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  const hits = await filesContaining(page, SENTENCE);
  console.log(`[insights-write] 디스크에 쓴 파일: ${hits.join(", ")}`);
});
