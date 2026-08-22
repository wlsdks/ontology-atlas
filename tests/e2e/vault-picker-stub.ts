import type { Page } from "@playwright/test";

/**
 * Stubs `showDirectoryPicker` with an OPFS handle.
 *
 * The File System Access API opens an OS window that automation cannot click. An
 * OPFS handle (`navigator.storage.getDirectory()`) is a **real**
 * `FileSystemDirectoryHandle`, so the app's vault read/write paths — including
 * `createWritable` — run unchanged. This stub replaces only the picker window;
 * everything after it is verified against real code.
 *
 * **Why a module outside the spec** (2026-08-04): this stub was born inside web
 * smoke ②, and while it stayed there **the only means of reproducing
 * data-dependent defects** was one spec's private property. Screens rendering
 * shapes absent from the sample vault (cross-domain edges and the like) had never
 * been seen by any gate — a second consumer is the moment to promote it.
 *
 * **Seeds carrying a timestamp are built at pick time** — `{{NOW-<ms>}}`.
 * `{{NOW-30000}}` inside a seed string becomes
 * `new Date(Date.now() - 30000).toISOString()` at the moment the file is actually
 * written (that is, when the user picks the folder).
 *
 * ⚠️ **Why it must not be computed in the spec** (full check audit, 2026-08-17):
 * the activity chip's "working" window is **2 minutes** after the last write. If
 * the spec computes "30 seconds ago" at the top of the file, **the entire page
 * load** eats into those 2 minutes before the value reaches the screen — the slack
 * is 90 seconds while the spec's own timeout is 120, so on a slow runner it passes
 * the window, becomes "last worked", and fails for reasons unrelated to the
 * product. Computing at write time leaves only the vault read and render.
 *
 * @param seed markdown to pre-place in the folder (path → contents)
 */
export async function stubDirectoryPicker(page: Page, seed: Record<string, string>) {
  await page.addInitScript((files: Record<string, string>) => {
    /** `{{NOW-<ms>}}` → an ISO timestamp that many milliseconds ago. */
    const resolveNowTokens = (body: string) =>
      body.replace(/\{\{NOW-(\d+)\}\}/g, (_match, ms: string) =>
        new Date(Date.now() - Number(ms)).toISOString(),
      );

    const grant = async () => "granted" as const;
    // The handle the picker returns and every descendant handle must answer
    // permission queries — the app calls `queryPermission` on the IndexedDB restore
    // path.
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
