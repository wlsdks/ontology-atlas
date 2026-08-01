import { describe, expect, it } from 'vitest';

import {
  manualConnectConfig,
  manualSetupCommand,
  manualVerifyCommand,
  normalizeManualPath,
} from './manual-connect';

describe('normalizeManualPath — 모양만 본다', () => {
  it('절대 경로를 그대로 받는다', () => {
    expect(normalizeManualPath('/Users/me/notes')).toEqual({
      ok: true,
      value: '/Users/me/notes',
      issue: null,
    });
  });

  it('빈 값은 오류가 아니라 아직 안 채운 상태다', () => {
    expect(normalizeManualPath('   ').issue).toBe('empty');
    expect(normalizeManualPath('').ok).toBe(false);
  });

  it('감싼 따옴표를 걷어낸다 — 터미널·Finder 복사가 흔히 씌운다', () => {
    expect(normalizeManualPath(`'/Users/me/my notes'`).value).toBe('/Users/me/my notes');
    expect(normalizeManualPath('"/Users/me/notes"').ok).toBe(true);
  });

  it('꼬리 슬래시를 걷어낸다 — 같은 폴더가 두 값이 되지 않게', () => {
    expect(normalizeManualPath('/Users/me/notes/').value).toBe('/Users/me/notes');
    expect(normalizeManualPath('/').value).toBe('/');
  });

  it('터미널 드래그의 공백 이스케이프를 되돌린다', () => {
    expect(normalizeManualPath('/Users/me/my\\ notes').value).toBe('/Users/me/my notes');
  });

  it('Finder 에서 끌어 온 file:// URL 을 경로로 되돌린다', () => {
    expect(normalizeManualPath('file:///Users/me/my%20notes').value).toBe('/Users/me/my notes');
  });

  it('홈 물결은 거절한다 — 설정 파일에서 펼쳐지지 않아 조용히 안 붙는다', () => {
    expect(normalizeManualPath('~/notes')).toMatchObject({ ok: false, issue: 'tilde' });
  });

  it('상대 경로는 거절한다', () => {
    expect(normalizeManualPath('notes').issue).toBe('relative');
    expect(normalizeManualPath('./notes').issue).toBe('relative');
  });

  it('여러 줄은 거절한다 — 경로 하나만 받는다', () => {
    expect(normalizeManualPath('/a\n/b').issue).toBe('multiline');
  });

  it('윈도우 드라이브 경로를 받는다 — 웹의 두 번째 일이 앱 없는 OS 다', () => {
    expect(normalizeManualPath('C:\\Users\\me\\notes').ok).toBe(true);
    expect(normalizeManualPath('C:/Users/me/notes').ok).toBe(true);
  });
});

const INPUT = {
  vaultAbsolute: '/Users/me/notes',
  checkoutAbsolute: '/Users/me/ontology-atlas',
};

describe('manualConnectConfig — 도구별 설정', () => {
  it('Claude Code 는 .mcp.json 에 절대 경로가 박힌 stdio triple 을 받는다', () => {
    const config = manualConnectConfig('claude-code', INPUT);
    expect(config.file).toBe('.mcp.json');
    const parsed = JSON.parse(config.body);
    expect(parsed.mcpServers['ontology-atlas']).toEqual({
      command: 'node',
      args: ['/Users/me/ontology-atlas/mcp/src/index.js'],
      env: { OATLAS_VAULT: '/Users/me/notes' },
    });
  });

  it('도구마다 설정 파일 위치가 다르다 — 그 지식은 AGENT_CLIENTS 한 곳에 있다', () => {
    expect(manualConnectConfig('cursor', INPUT).file).toBe('.cursor/mcp.json');
    expect(manualConnectConfig('antigravity', INPUT).file).toBe('.agents/mcp_config.json');
    expect(manualConnectConfig('codex', INPUT).file).toBe('.codex/config.toml');
  });

  it('Codex 만 TOML 이다', () => {
    const config = manualConnectConfig('codex', INPUT);
    expect(config.body).toContain('[mcp_servers.ontology-atlas]');
    expect(config.body).toContain('OATLAS_VAULT = "/Users/me/notes"');
    expect(config.body).toContain('/Users/me/ontology-atlas/mcp/src/index.js');
  });

  it('자리표시자가 남지 않는다 — 복사한 것이 그대로 실행돼야 한다', () => {
    for (const client of ['claude-code', 'cursor', 'antigravity', 'codex'] as const) {
      expect(manualConnectConfig(client, INPUT).body).not.toMatch(/<|자리|placeholder/i);
    }
  });
});

describe('manualSetupCommand / manualVerifyCommand', () => {
  it('체크아웃의 CLI 를 절대 경로로 부른다 — 전역 바이너리는 존재하지 않는다', () => {
    expect(manualSetupCommand(INPUT)).toBe(
      'node /Users/me/ontology-atlas/cli/src/index.mjs agent-setup /Users/me/notes --root /Users/me/notes --write',
    );
  });

  it('공백이 든 경로를 셸에서 쪼개지지 않게 감싼다', () => {
    expect(
      manualSetupCommand({ ...INPUT, vaultAbsolute: '/Users/me/my notes' }),
    ).toContain(`'/Users/me/my notes'`);
  });

  it('검증 명령은 mcp-verify 다 — 화면이 만든 것이 진짜 붙는지 사용자가 직접 본다', () => {
    expect(manualVerifyCommand(INPUT)).toBe(
      'node /Users/me/ontology-atlas/cli/src/index.mjs mcp-verify /Users/me/notes --timeout-ms 15000',
    );
  });
});
