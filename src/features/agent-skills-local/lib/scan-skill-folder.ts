import type { SkillSourceFile } from "@/entities/agent-skill";

/**
 * 사용자가 **직접 건네준 폴더 하나**만 읽는다.
 *
 * 로컬 우선 약속이 여기서 걸린다: 우리는 `~/.claude` 를 찾아 나서지 않는다.
 * 사용자가 폴더 고르기로 지목한 것만 읽고, 그 밖으로는 한 발도 안 나간다
 * (앱에서는 네이티브 다리가 상위 경로 탈출을 막고, 웹에서는 브라우저가 막는다).
 * 그래서 **새 네이티브 권한이 하나도 필요 없다** — 볼트를 읽는 그 다리 그대로다.
 */

/** 들어가 봐야 소용없고 비싸기만 한 폴더. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "target",
  "out",
  "__pycache__",
  ".venv",
  "venv",
]);

/**
 * 한 번에 읽을 상한.
 *
 * ⚠️ **상한이 있다는 사실을 화면이 말해야 한다.** 조용히 자르면 「깨진 참조 0건」이
 * 「다 괜찮다」로 읽히는데 실제로는 못 본 것뿐이다 — 이 저장소가 게이트에서
 * 반복해 겪은 실패 그대로다. 그래서 `truncated` 를 돌려주고 화면이 그것을 띄운다.
 */
export const SCAN_LIMITS = {
  maxDepth: 8,
  maxFiles: 20_000,
  maxSkills: 2_000,
} as const;

export interface SkillFolderScan {
  readonly files: readonly SkillSourceFile[];
  /** 폴더 안에 실재하는 모든 상대 경로 — 깨진 참조 판정의 재료. */
  readonly existingPaths: ReadonlySet<string>;
  /** 상한에 걸려 못 본 것이 있는가. */
  readonly truncated: boolean;
  /** 훑은 파일 총수 (스킬만이 아니라 전부). */
  readonly scannedFiles: number;
}

interface DirEntry {
  readonly name: string;
  readonly handle: FileSystemDirectoryHandle | FileSystemFileHandle;
}

async function* entriesOf(dir: FileSystemDirectoryHandle): AsyncGenerator<DirEntry> {
  // `entries()` 는 표준이지만 구형 구현엔 없다 — 있으면 그것, 없으면 반복자.
  const withEntries = dir as unknown as {
    entries?: () => AsyncIterableIterator<[string, FileSystemHandle]>;
  };
  if (typeof withEntries.entries === "function") {
    for await (const [name, handle] of withEntries.entries()) {
      yield { name, handle: handle as DirEntry["handle"] };
    }
    return;
  }
  for await (const handle of dir as unknown as AsyncIterable<DirEntry["handle"]>) {
    yield { name: handle.name, handle };
  }
}

/**
 * 폴더를 훑어 `SKILL.md` 를 모으고, **그 폴더에 실재하는 모든 경로**도 같이 모은다.
 *
 * 두 번째가 없으면 「이 스킬이 가리킨 파일이 진짜 있나」를 답할 수 없다. 그리고
 * 답할 수 없을 때 우리가 하는 말은 「깨졌다」가 아니라 **침묵**이다
 * (`buildSkillInventory` 의 `existingPaths` 계약).
 */
export async function scanSkillFolder(
  root: FileSystemDirectoryHandle,
  limits: typeof SCAN_LIMITS = SCAN_LIMITS,
): Promise<SkillFolderScan> {
  const files: SkillSourceFile[] = [];
  const existingPaths = new Set<string>();
  let scannedFiles = 0;
  let truncated = false;

  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
    if (depth > limits.maxDepth) {
      truncated = true;
      return;
    }
    for await (const entry of entriesOf(dir)) {
      if (scannedFiles >= limits.maxFiles || files.length >= limits.maxSkills) {
        truncated = true;
        return;
      }
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.handle.kind === "directory") {
        // 점으로 시작하는 폴더는 건너뛰되 `.claude` 는 예외 — 스킬이 사는 자리다.
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".claude" && entry.name !== ".agents")
          continue;
        await walk(entry.handle as FileSystemDirectoryHandle, relativePath, depth + 1);
        continue;
      }
      scannedFiles += 1;
      existingPaths.add(relativePath);
      if (entry.name !== "SKILL.md") continue;
      try {
        const file = await (entry.handle as FileSystemFileHandle).getFile();
        files.push({ relativePath, text: await file.text() });
      } catch {
        // 읽기 실패한 파일 하나가 전체 훑기를 멈추게 하지 않는다.
      }
    }
  };

  await walk(root, "", 0);
  return { files, existingPaths, truncated, scannedFiles };
}
