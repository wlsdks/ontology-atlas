import { expect, test } from "@playwright/test";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { seedFirstRunSeen } from "./first-run-seed";

const SEED: Record<string, string> = {
  "shop.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: shop\nkind: project\ntitle: Reflect Shop\ncontains:\n  - capabilities/pay\n---\n\n# Reflect Shop\n`,
  "capabilities/pay.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: capabilities/pay\nkind: capability\ntitle: Pay\n---\n\n# Pay\n`,
};

/**
 * **「고치면 지도가 따라온다」** — 이 제품의 핵심 약속을 왕복으로 잰다 (2026-08-11).
 *
 * ## 왜 이 spec 이 생겼나
 *
 * 북극성 여정을 걸어 보다 이 자리를 재는 게이트가 **하나도 없다**는 것을 알았다.
 * 볼트를 여는 것은 웹 스모크 ②가 보고, 지도 그리기는 지도 spec 들이 본다. 그런데
 * **디스크가 바뀐 뒤 화면이 따라오는 것**은 아무도 안 봤다 — 이 제품이 파는 문장이
 * 정확히 그것인데도.
 *
 * 픽커만 스텁하고 그 뒤는 전부 실제 코드다(`vault-picker-stub`). 그래서 이 spec 이
 * 재는 것은 흉내가 아니라 **웹이 폴더를 다시 읽는 그 경로**다.
 *
 * ## 시간으로 잠그지 않는다
 *
 * 실측 5.6초였는데(웹은 잠잠할 때 5초 주기 — `surfaces.md`), 그 숫자를 상한으로 박지
 * 않는다. 기계와 부하에 따라 달라지는 값을 게이트로 만들면 제품이 아니라 러너를 재게
 * 된다(이 저장소가 이미 두 번 그렇게 실패했다). 잠글 성질은 **결국 따라오는가**다.
 *
 * ## 지우는 방향도 잰다
 *
 * 파일이 사라졌는데 화면에 남아 있으면 사용자는 없는 노드를 근거로 판단한다 — 더하는
 * 것보다 나쁘다. 한 방향만 재면 그 절반은 아무도 안 본다.
 */
test("고치면 지도가 따라온다 — 더할 때와 지울 때 모두", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, SEED);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  const index = page.getByTestId("topology-index-panel");
  await expect(index).toContainText("Reflect Shop", { timeout: 30_000 });
  await expect(index).toContainText("2 개념", { timeout: 20_000 });
  console.log("OPENED · 2 개념");

  // 디스크에 노드를 하나 더 쓴다 — 사용자가 에디터로 파일을 만든 것과 같다.
  const t0 = Date.now();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    // 스텁이 만든 볼트 폴더를 찾는다
    let vault: FileSystemDirectoryHandle | null = null;
    // @ts-expect-error entries() 는 표준이지만 lib.dom 에 아직 없다
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith("stub-vault-") && handle.kind === "directory") vault = handle as FileSystemDirectoryHandle;
    }
    if (!vault) throw new Error("stub vault not found");
    const caps = await vault.getDirectoryHandle("capabilities", { create: true });
    const file = await caps.getFileHandle("ship.md", { create: true });
    const w = await file.createWritable();
    await w.write(`---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/ship\nkind: capability\ntitle: Ship\n---\n\n# Ship\n`);
    await w.close();
  });
  await expect(index).toContainText("3 개념", { timeout: 30_000 });
  console.log(`[reflect] 더하기 반영 ${Date.now() - t0}ms`);

  // 그리고 지웠을 때도 따라와야 한다 — 없는 노드가 화면에 남으면 더 나쁘다.
  const t1 = Date.now();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    let vault: FileSystemDirectoryHandle | null = null;
    // @ts-expect-error entries() 는 표준이지만 lib.dom 에 아직 없다
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith("stub-vault-") && handle.kind === "directory") vault = handle as FileSystemDirectoryHandle;
    }
    if (!vault) throw new Error("stub vault not found");
    const caps = await vault.getDirectoryHandle("capabilities");
    await caps.removeEntry("ship.md");
  });
  await expect(index).toContainText("2 개념", { timeout: 30_000 });
  console.log(`[reflect] 지우기 반영 ${Date.now() - t1}ms`);
});
