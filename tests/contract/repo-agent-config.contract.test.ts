import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `ontology-atlas init` rewrites `.mcp.json` and `.codex/config.toml` with the current vault path, so
 * committing them here would leave one person absolute path. Nothing may point outside the repository.
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
        `${file} holds values that only work on this computer:\n  ${hits.join('\n  ')}\n` +
          '`init` and Connect agent rewrite this file automatically. If you ran them inside this repository, ' +
          'revert it before committing: `.mcp.json.example` is the canonical copy.',
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
      'The Claude side and the Codex side point at different folders, so in one repository the two tools ' +
        'read different maps',
    ).toBe(mcpVault);
  });

  it('가리키는 볼트가 이 저장소 안에 실재한다', () => {
    const mcp = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { env?: Record<string, string> }>;
    };
    const vault = mcp.mcpServers['ontology-atlas']?.env?.OATLAS_VAULT ?? '';
    // Must be a relative path, and a vault must really be at that location.
    expect(vault.startsWith('.'), `볼트 경로가 상대 경로가 아니다: ${vault}`).toBe(true);
    // Existence, stated as existence: a `.length > 0` check only fires if someone empties the file.
    expect(existsSync(join(ROOT, vault, 'README.md')), `${vault} 에 볼트가 없다`).toBe(true);
  });
});
