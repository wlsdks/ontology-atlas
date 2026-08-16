import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **이 저장소가 커밋해 두는 연결 설정은 「누구 컴퓨터에서든 되는」 것이어야 한다.**
 *
 * ## 왜 이 검사가 생겼나 (2026-08-16, 실제로 저질렀다)
 *
 * `.mcp.json` 과 `.codex/config.toml` 은 **자동으로 고쳐지는 파일**이다 —
 * `ontology-atlas init` 이나 앱의 「에이전트 연결」이 실행될 때마다 그 순간의
 * 볼트 경로로 다시 쓰인다. 그건 사용자 컴퓨터에서는 맞는 동작이다.
 *
 * 문제는 **이 저장소 안에서 그 명령을 돌렸을 때**다. 2026-08-16, 관문을
 * 측정하려고 임시 볼트로 한 번 돌렸더니 두 파일이 임시 폴더를 가리키게 바뀌었고,
 * 그것이 그대로 커밋됐다:
 *
 * ```
 * "args": ["/Users/jinan/orca/workspaces/ontology-atlas/main-3/mcp/src/index.js"],
 * "OATLAS_VAULT": "../../../../../../private/tmp/.../scratchpad/trial-vault"
 * ```
 *
 * 절대 경로 하나는 **한 사람의 작업 폴더**를 가리키고, 볼트 경로는 **존재하지도
 * 않는 임시 폴더**를 가리킨다. 이 저장소를 새로 받은 사람은 에이전트가 아무것도
 * 못 읽는 상태로 시작하고, 왜 그런지 알 방법이 없다.
 *
 * 이 저장소의 브리핑 규율이 이미 그 원인을 적어 뒀다 — **`git add -A` 를 쓰지
 * 마라**. 그 규율은 사람이 지키는 것이고, 사람은 잊는다. 그래서 검사를 둔다.
 *
 * ## 무엇을 막나
 *
 * 값을 못 박지 않는다(경로 구조가 바뀔 수 있다). 못 박는 것은 **성질** 둘이다:
 * ① 저장소 밖을 가리키지 않는다 ② 누구의 홈 디렉터리도 안 적혀 있다.
 */

const ROOT = process.cwd();

/** 한 사람의 컴퓨터에서만 뜻이 통하는 모양들. */
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
    // 상대 경로여야 하고, 그 자리에 정말 볼트가 있어야 한다.
    expect(vault.startsWith('.'), `볼트 경로가 상대 경로가 아니다: ${vault}`).toBe(true);
    expect(
      readFileSync(join(ROOT, vault, 'README.md'), 'utf8').length,
      `${vault} 에 볼트가 없다`,
    ).toBeGreaterThan(0);
  });
});
