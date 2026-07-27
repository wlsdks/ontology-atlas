import { describe, expect, it } from 'vitest';

import {
  agentConfigContents,
  bundledServerLaunch,
  vaultPathRelativeToConfigRoot,
} from './agent-config-contents';

const LAUNCH = bundledServerLaunch(
  '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp',
);

describe('vaultPathRelativeToConfigRoot', () => {
  it('is "." when the vault folder is itself the config root', () => {
    expect(vaultPathRelativeToConfigRoot('/Users/j/vault', '/Users/j/vault')).toBe('.');
  });

  it('is the subpath when the config lands at the repo root above the vault', () => {
    expect(vaultPathRelativeToConfigRoot('/Users/j/repo', '/Users/j/repo/docs/ontology')).toBe(
      'docs/ontology',
    );
  });

  it('falls back to the absolute path when the vault is not under the config root', () => {
    expect(vaultPathRelativeToConfigRoot('/Users/j/repo', '/elsewhere/vault')).toBe(
      '/elsewhere/vault',
    );
  });
});

describe('agentConfigContents', () => {
  const base = {
    launch: LAUNCH,
    vaultRelative: 'docs/ontology',
    vaultAbsolute: '/Users/j/repo/docs/ontology',
  };

  it('points .mcp.json at the vault, not at the config root', () => {
    // 회귀 가드: 설치 앱 실측에서 이 파일만 "." 로 박혀 repo 루트를 vault 로
    // 읽는 설정이 나왔다. 자가 검증은 vault 경로를 직접 스폰하므로 못 잡는다.
    const parsed = JSON.parse(agentConfigContents({ ...base, fileName: '.mcp.json' }));
    expect(parsed.mcpServers['ontology-atlas'].env.OATLAS_VAULT).toBe('docs/ontology');
    expect(parsed.mcpServers['ontology-atlas'].command).toBe(LAUNCH.command);
    expect(parsed.mcpServers['ontology-atlas'].args).toEqual([]);
  });

  it('gives .mcp.json.example the absolute path, since it is used from elsewhere', () => {
    const parsed = JSON.parse(agentConfigContents({ ...base, fileName: '.mcp.json.example' }));
    expect(parsed.mcpServers['ontology-atlas'].env.OATLAS_VAULT).toBe(
      '/Users/j/repo/docs/ontology',
    );
  });

  it('points the Codex config at the same relative vault as .mcp.json', () => {
    const toml = agentConfigContents({ ...base, fileName: '.codex/config.toml' });
    expect(toml).toContain('OATLAS_VAULT = "docs/ontology"');
    expect(toml).toContain(`command = ${JSON.stringify(LAUNCH.command)}`);
  });

  it('never emits npx — there is no npm package to run', () => {
    for (const fileName of ['.mcp.json', '.mcp.json.example', '.codex/config.toml']) {
      expect(agentConfigContents({ ...base, fileName })).not.toContain('npx');
    }
  });
});
