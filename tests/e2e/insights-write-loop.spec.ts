import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **Doing what Insights asks, right there, changes a file in the user's folder**
 * (2026-08-11).
 *
 * ## Why this spec exists
 *
 * Walking the north-star journey revealed there was **no** gate measuring this round
 * trip. `MeaningGapSection.test.tsx` covers the component, but only as far as
 * "pressing the button calls the handler". **What the handler writes to disk** was
 * covered by nobody — and that is precisely this product's promise (*"data is always
 * plain markdown files"*).
 *
 * The write path can break while component tests stay green: vault handle
 * permissions, the write lock, `expected_mtime` conflicts, path resolution — all
 * outside the component.
 *
 * Only the picker is stubbed (`vault-picker-stub`); everything after it is real
 * code. So what this spec measures is not an imitation but **whether the file really
 * changes.**
 *
 * ## ⚠️ While writing this spec, my own instrument was wrong first
 *
 * The first version swept only `capabilities/` and read the result as "not on disk"
 * — but the first item in the list was **a project**, and its file lives at the vault
 * root. It nearly reported a healthy product as defective. **Sweep the whole
 * vault.**
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

/** When this sentence appears in a file, the round trip is complete. */
const SENTENCE = "결제 승인을 처리하는 역량이에요.";

/** Finds the file containing that sentence anywhere in the vault — root and subfolders. */
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
        let body: string;
        try {
          body = await (await (handle as FileSystemFileHandle).getFile()).text();
        } catch (error) {
          // The app writes atomically (temp file, then rename), so an entry listed a
          // moment ago can be gone by the time it is read. A vanished temp file is
          // not a missing vault file; skip it and keep sweeping.
          if ((error as DOMException)?.name === "NotFoundError") continue;
          throw error;
        }
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
   * "Write it here" must exist — this screen's value is letting the next action happen
   * **in place**. Without it, it is a board that only shows a list, which is what this
   * repository calls a dead-end CTA.
   */
  // 2026-09-01: the one-list Do-next tab labels the inline-write toggle with the shared
  // fix-here action word; the button still opens the same in-place editor.
  // 2026-09-06: the list is one row per finding group, so the row carrying the inline editor is
  // behind its group's disclosure. Opening every group is what a person does to reach a row.
  const toggles = page.getByTestId("do-next-group-toggle");
  await expect(toggles.first()).toBeVisible({ timeout: 30_000 });
  for (let index = 0; index < (await toggles.count()); index += 1) {
    await toggles.nth(index).click();
  }

  const write = page.locator("button", { hasText: "직접 고치기" }).first();
  await expect(write, "인사이트가 뜻을 적을 자리를 주지 않는다").toBeVisible({ timeout: 30_000 });
  await write.click();

  const field = page.getByTestId("meaning-gap-definition-input");
  await expect(field).toBeVisible({ timeout: 10_000 });
  await field.fill(SENTENCE);

  const save = page.locator("button", { hasText: /^저장$/ }).filter({ visible: true }).first();
  await expect(save, "적을 자리는 줬는데 저장할 길이 없다").toBeVisible();
  await save.click();

  /*
   * Not locked by time — how many seconds pass between the write and the reread is the
   * machine's business. The property to lock is **whether it ends up in the file.**
   */
  await expect
    .poll(async () => (await filesContaining(page, SENTENCE)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);

  const hits = await filesContaining(page, SENTENCE);
  console.log(`[insights-write] 디스크에 쓴 파일: ${hits.join(", ")}`);
});

/**
 * **"Fix these together" writes the back-links, one document at a time, and only what was ticked.**
 *
 * The batch is the first control on this board that changes more than one of the person's files,
 * so the property under test is not that a dialog opened but that **the domain document on disk
 * gained the members it was missing** — and that the run went through the same
 * `updateFrontmatter` path, with `expected_mtime`, as every other write in the product.
 *
 * The seed is the exact shape `computeVaultHealth` calls a missing containment: two capabilities
 * that declare `domain: domains/billing`, and a billing document that lists neither. Nothing is
 * inferred from it — both halves of every write are already on disk, which is the whole reason
 * this one repair may be batched at all.
 */
const CONTAINMENT_SEED: Record<string, string> = {
  "domains/billing.md": [
    "---",
    "uid: 33333333-3333-4333-8333-333333333333",
    "slug: domains/billing",
    "kind: domain",
    "title: Billing",
    "---",
    "",
    "# Billing",
    "",
  ].join("\n"),
  "capabilities/pay.md": [
    "---",
    "uid: 44444444-4444-4444-8444-444444444444",
    "slug: capabilities/pay",
    "kind: capability",
    "title: Pay",
    "domain: domains/billing",
    "---",
    "",
    "# Pay",
    "",
  ].join("\n"),
  "capabilities/refund.md": [
    "---",
    "uid: 55555555-5555-4555-8555-555555555555",
    "slug: capabilities/refund",
    "kind: capability",
    "title: Refund",
    "domain: domains/billing",
    "---",
    "",
    "# Refund",
    "",
  ].join("\n"),
};

/** Reads one file out of the stubbed vault, so the assertion is about bytes and not about a screen. */
async function readVaultFile(page: import("@playwright/test").Page, path: string) {
  return page.evaluate(async (target: string) => {
    const root = await navigator.storage.getDirectory();
    let vault: FileSystemDirectoryHandle | null = null;
    for await (const [name, handle] of root.entries()) {
      if (name.startsWith("stub-vault-") && handle.kind === "directory") {
        vault = handle as FileSystemDirectoryHandle;
      }
    }
    if (!vault) return null;
    const parts = target.split("/");
    let dir = vault;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    const file = await dir.getFileHandle(parts[parts.length - 1]);
    return (await (await file).getFile()).text();
  }, path);
}

test("「한 번에 고치기」가 고른 것만 도메인 문서에 적는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, CONTAINMENT_SEED);

  await page.goto("/ko/topology/?guides=off", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("topology-index-panel")).toContainText("Billing", {
    timeout: 30_000,
  });

  await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });

  const batch = page.getByTestId("do-next-group-batch");
  await expect(batch, "되가리키지 않는 도메인 묶음에 한 번에 고치는 길이 없다").toBeVisible({
    timeout: 30_000,
  });
  await batch.click();

  const rows = page.getByTestId("containment-batch-row");
  await expect(rows).toHaveCount(2, { timeout: 10_000 });

  // Untick one row. Nothing may be written for it — "nothing auto" is the contract, and a batch
  // that ignores an untick is a batch nobody can trust with the rest.
  await rows.filter({ hasText: "Refund" }).getByRole("checkbox").uncheck();

  await page.getByTestId("containment-batch-apply").click();
  await expect(page.getByTestId("containment-batch-outcome")).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(async () => (await readVaultFile(page, "domains/billing.md")) ?? "", { timeout: 30_000 })
    .toContain("capabilities/pay");

  const billing = (await readVaultFile(page, "domains/billing.md")) ?? "";
  console.log(`[containment-batch] domains/billing.md:\n${billing}`);
  expect(billing, "체크를 푼 줄까지 적혔다 — 자동으로 도는 것이 있다").not.toContain(
    "capabilities/refund",
  );
  expect(billing, "본문이 사라졌다").toContain("# Billing");
  expect(billing, "다른 프론트매터 줄이 사라졌다").toContain("uid: 33333333-3333-4333-8333-333333333333");
});
