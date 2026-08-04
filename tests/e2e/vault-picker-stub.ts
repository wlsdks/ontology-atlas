import type { Page } from "@playwright/test";

/**
 * `showDirectoryPicker` 를 OPFS 핸들로 스텁한다.
 *
 * File System Access API 는 OS 창을 열기 때문에 자동화가 클릭할 수 없다.
 * OPFS(`navigator.storage.getDirectory()`) 핸들은 **진짜**
 * `FileSystemDirectoryHandle` 이라 `createWritable` 을 포함한 앱의 볼트
 * 읽기/쓰기 경로가 그대로 돈다 — 즉 이 스텁은 픽커 창만 대신하고 그
 * 이후 여정은 전부 실제 코드로 검증된다.
 *
 * **왜 spec 밖의 모듈인가** (2026-08-04): 이 스텁은 웹 스모크 ② 안에서
 * 태어났지만, 그 자리에 갇혀 있는 동안 **데이터에 의존하는 결함을 재현할
 * 유일한 수단**이 한 spec 의 사유물이었다. 샘플 볼트에 없는 모양
 * (교차 도메인 엣지 등)을 그리는 화면은 어떤 게이트도 본 적이 없다 —
 * 두 번째 소비처가 생긴 지금이 승격 시점이다.
 *
 * @param seed 폴더 안에 미리 넣어 둘 마크다운 (경로 → 내용)
 */
export async function stubDirectoryPicker(page: Page, seed: Record<string, string>) {
  await page.addInitScript((files: Record<string, string>) => {
    const grant = async () => "granted" as const;
    // 픽커가 돌려주는 핸들과 그 하위 핸들 전부가 권한 질의에 답해야 한다 —
    // 앱은 IndexedDB 복원 경로에서 `queryPermission` 을 부른다.
    const patch = (handle: FileSystemDirectoryHandle): FileSystemDirectoryHandle => {
      const target = handle as FileSystemDirectoryHandle & {
        queryPermission?: () => Promise<"granted">;
        requestPermission?: () => Promise<"granted">;
      };
      target.queryPermission ??= grant;
      target.requestPermission ??= grant;
      const inner = target.getDirectoryHandle.bind(target);
      target.getDirectoryHandle = async (name: string, options?: FileSystemGetDirectoryOptions) =>
        patch(await inner(name, options));
      return target;
    };

    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(`stub-vault-${Date.now()}`, { create: true });
      for (const [path, body] of Object.entries(files)) {
        const segments = path.split("/");
        const name = segments.pop() as string;
        let cursor = dir;
        for (const segment of segments) {
          cursor = await cursor.getDirectoryHandle(segment, { create: true });
        }
        const file = await cursor.getFileHandle(name, { create: true });
        const writable = await file.createWritable();
        await writable.write(body);
        await writable.close();
      }
      return patch(dir);
    };
  }, seed);
}
