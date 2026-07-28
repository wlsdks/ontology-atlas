import { listTauriVaultEntries, readTauriVaultText } from '@/shared/lib/tauri-vault-fs';

import type { AgentFileEntry } from './agent-files';

/**
 * 두 스킬 트리를 **절대 경로로** 읽는다 — 데스크톱 전용.
 *
 * ## 왜 manifest 가 아닌가
 *
 * `build-local-manifest.ts` 와 `build-docs-vault.mjs` 는 둘 다
 * `if (name.startsWith('.')) continue;` 로 dot 디렉터리를 건너뛴다. 그래서
 * `.claude/skills` 는 **manifest 에 절대 들어오지 않고**, manifest 를 먹는
 * 검사는 코드가 있어도 영영 발화하지 못한다(2026-07-29 PO 카운슬이 발견).
 *
 * walker 를 고치지 않는 것이 이 슬라이스의 결정이다. 그 필터는 볼트를
 * "사람이 읽고 쓰는 문서 폴더" 로 정의하는 규칙이고, 에이전트 설정 파일을
 * 문서 목록에 섞으면 문서함이 무엇을 보여 주는 곳인지 흐려진다. 대신 필요한
 * 곳에서 **따로** 읽는다.
 *
 * ## 왜 웹에는 없나
 *
 * FSA 핸들에는 절대 경로가 없고, 사용자가 고른 폴더 밖으로 나갈 수도 없다.
 * `.claude/` 를 못 보는 것이 브라우저의 원리적 한계라 웹 동등물은 짓지 않는다
 * (`surfaces.md` — 데스크톱 능력은 웹 백필 의무가 없다). 다리가 없으면 이
 * 함수는 **빈 배열**을 돌려주고, 호출부는 그 자리에 아무것도 그리지 않는다.
 */

const SKILL_TREES = ['.claude/skills', '.agents/skills'] as const;

/** 스킬 트리 안에서 비교할 가치가 있는 파일 — 설정·지침은 텍스트다. */
const READABLE = /\.(md|mdc|txt|json|ya?ml|toml)$/i;

/** 폭주 방지 — 스킬 트리에 수천 파일이 들어 있을 이유가 없다. */
const MAX_FILES = 400;
const MAX_DEPTH = 4;

async function walk(
  rootPath: string,
  relative: string,
  depth: number,
  out: AgentFileEntry[],
): Promise<void> {
  if (depth > MAX_DEPTH || out.length >= MAX_FILES) return;
  let entries: Array<{ name: string; kind: 'file' | 'directory' }>;
  try {
    entries = await listTauriVaultEntries(rootPath, relative);
  } catch {
    // 트리가 아예 없는 것은 결함이 아니다 — 대부분의 볼트에 `.claude/` 는 없다.
    return;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    const path = `${relative}/${entry.name}`;
    if (entry.kind === 'directory') {
      await walk(rootPath, path, depth + 1, out);
      continue;
    }
    if (!READABLE.test(entry.name)) continue;
    try {
      const text = await readTauriVaultText(rootPath, path);
      out.push({ path, content: text });
    } catch {
      // 읽기 실패한 파일은 **없는 척하지 않는다** — 내용 없이 경로만 싣는다.
      // 그래야 "한쪽에만 있다" 판정이 읽기 실패로 뒤바뀌지 않는다.
      out.push({ path, content: null });
    }
  }
}

export async function readDesktopSkillTrees(rootPath: string): Promise<AgentFileEntry[]> {
  const out: AgentFileEntry[] = [];
  for (const tree of SKILL_TREES) {
    await walk(rootPath, tree, 0, out);
  }
  return out;
}
