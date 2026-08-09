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
export interface ScanLimits {
  readonly maxDepth: number;
  readonly maxFiles: number;
  readonly maxSkills: number;
}

export const SCAN_LIMITS: ScanLimits = {
  maxDepth: 8,
  maxFiles: 20_000,
  maxSkills: 2_000,
};

/**
 * 플러그인 설치 정본 — **어느 것이 실제로 로드되나.**
 *
 * ## 왜 이게 없으면 숫자가 3배가 되나 (2026-08-09, 설치된 앱 실측)
 *
 * `~/.claude` 를 통째로 훑으면 스킬이 **195개**로 보인다. 실제로 로드되는 것은
 * **60개**다. 나머지는 둘이다:
 *
 * - `plugins/cache/<플러그인>/<버전>/` — 버전마다 사본이 남는다. 로드되는 것은
 *   `installed_plugins.json` 이 지목한 **한 버전**뿐이다.
 * - `plugins/marketplaces/<카탈로그>/` — 설치도 안 한 카탈로그의 git 체크아웃.
 *   여기 있는 스킬은 **하나도 로드되지 않는다.**
 *
 * 이 저장소는 같은 실수를 이미 한 번 했다 — 개발용 감사 명령이 207개를 보고했고
 * (실제 60개), 그 부풀린 분모로 쓴 브리핑이 카운슬 판정 셋을 움직였다. 화면이
 * 같은 실수를 반복하면 사용자는 **로드되지도 않는 스킬을 지우려 든다.**
 *
 * 그래서 정본이 있으면 그것을 따르고, 없으면(프로젝트의 `.claude` 처럼) 평소대로
 * 전부 훑는다.
 */
const INSTALLED_MANIFEST = "plugins/installed_plugins.json";

/** `installed_plugins.json` 이 지목한 설치 경로를, 고른 폴더 기준 상대 경로로. */
export function installedPluginPrefixes(manifestText: string, rootName: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch {
    return [];
  }
  const plugins = (parsed as { plugins?: Record<string, unknown> })?.plugins;
  if (!plugins || typeof plugins !== "object") return [];
  const out = new Set<string>();
  for (const entries of Object.values(plugins)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const installPath = (entry as { installPath?: unknown })?.installPath;
      if (typeof installPath !== "string") continue;
      // 절대 경로(`/Users/x/.claude/plugins/cache/a/1.0.0`)를 고른 폴더 기준으로
      // 자른다. 고른 폴더 이름이 경로 어디에 있는지로 맞춘다 — 사용자가 `.claude`
      // 를 골랐는지 그 위를 골랐는지 우리는 모른다.
      const marker = `/${rootName}/`;
      const at = installPath.lastIndexOf(marker);
      out.add(at === -1 ? installPath.replace(/^\/+/, "") : installPath.slice(at + marker.length));
    }
  }
  return [...out];
}

export interface SkillFolderScan {
  readonly files: readonly SkillSourceFile[];
  /** 폴더 안에 실재하는 모든 상대 경로 — 깨진 참조 판정의 재료. */
  readonly existingPaths: ReadonlySet<string>;
  /** 상한에 걸려 못 본 것이 있는가. */
  readonly truncated: boolean;
  /** 훑은 파일 총수 (스킬만이 아니라 전부). */
  readonly scannedFiles: number;
  /**
   * 설치 정본을 따라 건너뛴 폴더 수 — 버전 캐시와 카탈로그 사본.
   *
   * `null` 이면 정본이 없어서 전부 훑었다는 뜻이다(프로젝트 `.claude` 등).
   * 0 과 `null` 은 다르다 — 0은 「정본을 봤고 뺄 것이 없었다」다.
   */
  readonly skippedNotInstalled: number | null;
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
  limits: ScanLimits = SCAN_LIMITS,
): Promise<SkillFolderScan> {
  const files: SkillSourceFile[] = [];
  const existingPaths = new Set<string>();
  let scannedFiles = 0;
  let truncated = false;
  let skippedNotInstalled: number | null = null;

  // 설치 정본을 **먼저** 읽는다. 있으면 `plugins/` 아래에서 로드되는 것만 본다.
  const installed = await readInstalledPrefixes(root);
  if (installed) skippedNotInstalled = 0;

  /**
   * `plugins/` 아래 이 폴더로 내려갈 가치가 있나.
   *
   * 설치 경로의 **조상**이면 내려가야 하고(`plugins` · `plugins/cache` ·
   * `plugins/cache/pdf-tools`), 설치 경로 **자신이거나 그 안**이면 당연히 본다.
   * 둘 다 아니면 로드되지 않는 사본이다.
   */
  const insidePlugins = (path: string): boolean => {
    if (!installed) return true;
    if (!path.startsWith("plugins")) return true;
    return installed.some(
      (prefix) => prefix === path || prefix.startsWith(`${path}/`) || path.startsWith(`${prefix}/`),
    );
  };

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
        if (!insidePlugins(relativePath)) {
          // 로드되지 않는 사본 — 세어서 화면이 말할 수 있게 하고 내려가지 않는다.
          skippedNotInstalled = (skippedNotInstalled ?? 0) + 1;
          continue;
        }
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
  return { files, existingPaths, truncated, scannedFiles, skippedNotInstalled };
}

/** 고른 폴더에 설치 정본이 있으면 그 설치 경로들을, 없으면 `null`. */
async function readInstalledPrefixes(
  root: FileSystemDirectoryHandle,
): Promise<string[] | null> {
  try {
    const [dirName, fileName] = INSTALLED_MANIFEST.split("/");
    const dir = await root.getDirectoryHandle(dirName);
    const handle = await dir.getFileHandle(fileName);
    const text = await (await handle.getFile()).text();
    const prefixes = installedPluginPrefixes(text, root.name);
    return prefixes.length > 0 ? prefixes : null;
  } catch {
    // 정본이 없다 = 플러그인 폴더가 아니다(프로젝트 `.claude` 등). 전부 훑는다.
    return null;
  }
}
