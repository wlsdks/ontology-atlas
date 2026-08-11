import type { Page } from "@playwright/test";

/**
 * 스킬 화면을 **폴더가 열린 상태**로 만드는 스텁.
 *
 * 두 스펙이 같은 것을 필요로 해서 여기로 뽑았다(2026-08-12):
 * `skills-inventory.spec.ts` 는 목록·겹침을 재고, `page-frame.spec.ts` 는
 * 「목록이 있을 때 제목이 다른 목적지와 같은 y 에 서는가」를 잰다 — 빈 상태의
 * 스킬은 무대가 되므로 그 상태로는 머리 규격을 잴 수 없다.
 */
/** OPFS 에 스킬 폴더를 짓고 `showDirectoryPicker` 가 그것을 돌려주게 만든다. */
export async function stubSkillFolder(
  page: Page,
  files: Record<string, string>,
) {
  await page.addInitScript((seed: Record<string, string>) => {
    const build = async () => {
      const root = await navigator.storage.getDirectory();
      // 매 실행이 같은 상태에서 시작하도록 먼저 비운다.
      for await (const name of (
        root as unknown as { keys: () => AsyncIterableIterator<string> }
      ).keys()) {
        await root.removeEntry(name, { recursive: true }).catch(() => undefined);
      }
      const stage = await root.getDirectoryHandle("skills-fixture", { create: true });
      for (const [path, text] of Object.entries(seed)) {
        const parts = path.split("/");
        let dir = stage;
        for (const part of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(part, { create: true });
        }
        const file = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const writable = await file.createWritable();
        await writable.write(text);
        await writable.close();
      }
      return stage;
    };
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker = build;
  }, files);
}

/** 스킬 화면에서 스텁 폴더를 실제로 열어 목록 상태로 만든다. */
export async function openStubbedSkillFolder(page: Page): Promise<void> {
  await page.getByTestId("skills-empty-open").click();
  await page.getByTestId("skills-census").waitFor({ state: "visible", timeout: 20_000 });
}
