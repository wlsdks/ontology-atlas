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
 * ## 시각이 든 씨앗은 **고를 때** 만든다 — `{{NOW-<ms>}}`
 *
 * 씨앗 문자열 안의 `{{NOW-30000}}` 은 파일을 실제로 쓰는 순간(= 사용자가 폴더를
 * 고르는 순간)에 `new Date(Date.now() - 30000).toISOString()` 으로 바뀐다.
 *
 * ⚠️ **왜 spec 쪽에서 계산하면 안 되나** (2026-08-17 검사 전수조사): 활동 칩의
 * 「작업 중」 창은 마지막 쓰기 후 **2분**이다. spec 이 파일 맨 위에서 「30초 전」을
 * 계산해 두면, 그 값이 화면에 닿기까지 **페이지 로드 전부**가 그 2분을 갉아먹는다
 * — 여유는 90초인데 spec 자신의 상한이 120초라, 느린 러너에서는 창을 넘겨
 * 「마지막 작업」이 되고 제품과 무관하게 터진다. 쓰는 순간에 계산하면 남는 것은
 * 볼트를 읽고 그리는 시간뿐이다.
 *
 * @param seed 폴더 안에 미리 넣어 둘 마크다운 (경로 → 내용)
 */
export async function stubDirectoryPicker(page: Page, seed: Record<string, string>) {
  await page.addInitScript((files: Record<string, string>) => {
    /** `{{NOW-<ms>}}` → 지금으로부터 그만큼 전의 ISO 시각. */
    const resolveNowTokens = (body: string) =>
      body.replace(/\{\{NOW-(\d+)\}\}/g, (_match, ms: string) =>
        new Date(Date.now() - Number(ms)).toISOString(),
      );

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
        await writable.write(resolveNowTokens(body));
        await writable.close();
      }
      return patch(dir);
    };
  }, seed);
}
