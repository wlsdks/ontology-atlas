import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **The connection config this repository commits must work on anyone's machine.**
 *
 * ## Why this check exists (2026-08-16 — it actually happened)
 *
 * `.mcp.json` and `.codex/config.toml` are **files that rewrite themselves** — every
 * run of `ontology-atlas init` or the app's "connect an agent" rewrites them with
 * whatever vault path is current. On a user's machine that is correct behaviour.
 *
 * The problem is **running those commands inside this repository**. On 2026-08-16 a
 * single run against a temporary vault, done to measure the gateway, repointed both
 * files at that temporary folder, and it was committed as is:
 *
 * ```
 * "args": ["/Users/jinan/orca/workspaces/ontology-atlas/main-3/mcp/src/index.js"],
 * "OATLAS_VAULT": "../../../../../../private/tmp/.../scratchpad/trial-vault"
 * ```
 *
 * One absolute path points at **one person's working folder**, and the vault path
 * points at **a temporary folder that no longer exists**. Someone cloning this
 * repository starts with an agent that can read nothing, and no way to find out why.
 *
 * This repository's briefing discipline already names the cause — **do not use
 * `git add -A`**. That discipline is kept by people, and people forget. Hence a
 * check.
 *
 * ## What is blocked
 *
 * No values are pinned (the path structure may change). Two **properties** are:
 * ① nothing points outside the repository ② nobody's home directory is written down.
 */

const ROOT = process.cwd();

/** Shapes that only mean something on one person's machine. */
const MACHINE_SPECIFIC = [
  { pattern: /\/Users\//, why: 'macOS 홈 경로 — 다른 사람 컴퓨터에는 없다' },
  { pattern: /\/home\//, why: 'Linux 홈 경로 — 다른 사람 컴퓨터에는 없다' },
  { pattern: /[A-Z]:\\\\/, why: 'Windows 절대 경로' },
  { pattern: /\/private\/tmp\/|\/tmp\//, why: '임시 폴더 — 지워지고 나면 아무것도 아니다' },
  { pattern: /scratchpad/, why: '작업용 임시 폴더' },
  { pattern: /\.\.\/\.\.\/\.\./, why: '저장소 밖으로 세 단계 이상 올라간다' },
];

const FILES = ['.mcp.json', '.codex/config.toml'] as const;

describe('저장소가 커밋하는 연결 설정 — 누구 컴퓨터에서든 된다', () => {
  for (const file of FILES) {
    it(`${file} 에 한 사람의 컴퓨터만 아는 경로가 없다`, () => {
      const text = readFileSync(join(ROOT, file), 'utf8');
      const hits = MACHINE_SPECIFIC.filter(({ pattern }) => pattern.test(text)).map(
        ({ pattern, why }) => `${pattern} — ${why}`,
      );
      expect(
        hits,
        `${file} 이 이 컴퓨터에서만 통하는 값을 담고 있다:\n  ${hits.join('\n  ')}\n` +
          '이 파일은 `init` · 「에이전트 연결」이 자동으로 고친다. 이 저장소 안에서 그것을 ' +
          '돌렸으면 커밋하기 전에 되돌려라 — `.mcp.json.example` 이 정본이다.',
      ).toEqual([]);
    });
  }

  it('두 파일이 같은 볼트를 가리킨다 — 도구마다 다른 지도를 보지 않는다', () => {
    const mcp = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    const codex = readFileSync(join(ROOT, '.codex/config.toml'), 'utf8');
    const mcpVault = mcp.mcpServers['ontology-atlas']?.env?.OATLAS_VAULT;
    const codexVault = /OATLAS_VAULT\s*=\s*"([^"]+)"/.exec(codex)?.[1];

    expect(mcpVault, '.mcp.json 에 볼트 경로가 없다').toBeTruthy();
    expect(codexVault, '.codex/config.toml 에 볼트 경로가 없다').toBeTruthy();
    expect(
      codexVault,
      'Claude 쪽과 Codex 쪽이 서로 다른 폴더를 본다 — 같은 저장소에서 두 도구가 ' +
        '다른 지도를 읽게 된다',
    ).toBe(mcpVault);
  });

  it('가리키는 볼트가 이 저장소 안에 실재한다', () => {
    const mcp = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    const vault = mcp.mcpServers['ontology-atlas']?.env?.OATLAS_VAULT ?? '';
    // Must be a relative path, and a vault must really be at that location.
    expect(vault.startsWith('.'), `볼트 경로가 상대 경로가 아니다: ${vault}`).toBe(true);
    expect(
      readFileSync(join(ROOT, vault, 'README.md'), 'utf8').length,
      `${vault} 에 볼트가 없다`,
    ).toBeGreaterThan(0);
  });
});
