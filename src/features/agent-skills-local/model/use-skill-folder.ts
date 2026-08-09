"use client";

import { useCallback, useState } from "react";

import { buildSkillInventory, type SkillInventory } from "@/entities/agent-skill";
import { isTauriVaultRuntime, pickTauriVaultDirectory } from "@/shared/lib/tauri-vault-fs";

import { scanSkillFolder, type SkillFolderScan } from "../lib/scan-skill-folder";

/**
 * 스킬 폴더 하나를 열어 인벤토리로 만든다.
 *
 * **볼트와 같은 다리를 쓰지만 볼트가 아니다.** 여기서 연 폴더는 볼트를 대체하지도
 * 않고 볼트 상태를 건드리지도 않는다 — 진실원은 여전히 볼트 하나이고, 스킬 폴더는
 * 그저 「지금 화면에 띄워 놓고 읽는 남의 폴더」다. 그래서 이 훅은 아무것도
 * 저장하지 않는다(IndexedDB 에도 안 남긴다): 다시 보려면 다시 고른다.
 *
 * 그 대가는 매번 고르는 번거로움이고, 얻는 것은 **우리가 사용자 몰래 남의 폴더를
 * 기억하고 있지 않다는 것**이다. 이 화면이 남의 파일을 다루는 이상 그쪽이 맞다.
 */

export type SkillFolderStatus = "idle" | "loading" | "ready" | "unsupported" | "error";

export interface SkillFolderState {
  readonly status: SkillFolderStatus;
  readonly inventory: SkillInventory | null;
  readonly folderName: string | null;
  readonly scan: Pick<SkillFolderScan, "truncated" | "scannedFiles" | "skippedNotInstalled"> | null;
  readonly error: string | null;
}

/** 폴더 고르기를 부를 수 있나 — `in` 이 아니라 **호출 가능한지**로 본다. */
export function canPickFolder(): boolean {
  if (typeof window === "undefined") return false;
  const picker = (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  return typeof picker === "function" || isTauriVaultRuntime();
}

const IDLE: SkillFolderState = {
  status: "idle",
  inventory: null,
  folderName: null,
  scan: null,
  error: null,
};

export function useSkillFolder() {
  const [state, setState] = useState<SkillFolderState>(IDLE);

  const openFolder = useCallback(async (dialogTitle?: string) => {
    if (!canPickFolder()) {
      setState({ ...IDLE, status: "unsupported" });
      return;
    }
    let handle: FileSystemDirectoryHandle | null = null;
    try {
      handle = isTauriVaultRuntime()
        ? await pickTauriVaultDirectory(dialogTitle)
        : await (
            window as unknown as {
              showDirectoryPicker: (o: { mode: "read" }) => Promise<FileSystemDirectoryHandle>;
            }
          ).showDirectoryPicker({ mode: "read" });
    } catch {
      // 고르기 취소는 오류가 아니다 — 아무 일도 없었던 것으로 둔다.
      return;
    }
    if (!handle) return;

    setState({ ...IDLE, status: "loading", folderName: handle.name });
    try {
      const scan = await scanSkillFolder(handle);
      setState({
        status: "ready",
        inventory: buildSkillInventory({
          files: scan.files,
          existingPaths: scan.existingPaths,
        }),
        folderName: handle.name,
        scan: {
          truncated: scan.truncated,
          scannedFiles: scan.scannedFiles,
          skippedNotInstalled: scan.skippedNotInstalled,
        },
        error: null,
      });
    } catch (error) {
      setState({
        ...IDLE,
        status: "error",
        folderName: handle.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const clear = useCallback(() => setState(IDLE), []);

  return { ...state, openFolder, clear };
}
