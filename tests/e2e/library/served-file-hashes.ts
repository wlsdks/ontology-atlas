import type { Page } from "@playwright/test";

/**
 * Makes `hash_vault_files` answer what the app's native side answers: each file's real sha256 under
 * `sha256`, `null` for a file that is not there. The faked runtime answers a placeholder under another
 * name, so a wiki page's recorded `source_hash` never matches and no source reads as having a page.
 *
 * Call after `installDesktopRailRuntime` and before the first `page.goto`.
 */
export async function hashServedFilesLikeTheDisk(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    type Served = { roots(): string[]; readBytes(root: string, path: string): number[] | null };
    const bridge = (window as unknown as { __TAURI_INTERNALS__: { invoke: Invoke } }).__TAURI_INTERNALS__;
    const served = () => (window as unknown as { __desktopFake: Served }).__desktopFake;
    const nativeInvoke = bridge.invoke.bind(bridge);
    bridge.invoke = async (command, args = {}) => {
      if (command !== "hash_vault_files") return nativeInvoke(command, args);
      await nativeInvoke(command, args);
      const root = String(args.rootPath ?? served().roots()[0] ?? "");
      return Promise.all(
        ((args.relativePaths as string[]) ?? []).map(async (relativePath) => {
          const bytes = served().readBytes(root, relativePath);
          if (bytes === null) return { relativePath, sha256: null };
          const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
          const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
          return { relativePath, sha256 };
        }),
      );
    };
  });
}
