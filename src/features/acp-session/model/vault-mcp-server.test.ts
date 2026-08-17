import { describe, expect, it } from 'vitest';

import {
  VAULT_MCP_SERVER_NAME,
  vaultAlreadyRegisters,
  vaultMcpServers,
  vaultSelfReadSlot,
} from './vault-mcp-server';

/**
 * 2026-08-17 실측. `init` 이 만든 볼트에서 codex 세션을 열었더니 **같은 서버가
 * 두 번** 돌고 있었다 — 볼트의 `.codex/config.toml` 이 하나, 앱이 꽂은 것이
 * 하나. 두 이름 다 같은 결과를 냈다:
 *
 *   mcp.ontology-atlas.list_kinds → {"total": 5, …}
 *   mcp.atlas-vault.list_kinds    → {"total": 5, …}
 */
const BINARY = '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp';
const launch = { kind: 'app-bundled' as const, command: BINARY, args: [] };
const VAULT = '/Users/me/Documents/vault';

describe('세션에 꽂는 MCP 서버', () => {
  it('띄울 방법이나 볼트를 모르면 아무것도 안 꽂는다', () => {
    expect(vaultMcpServers(null, VAULT)).toEqual([]);
    expect(vaultMcpServers(launch, null)).toEqual([]);
  });

  it('볼트에 등록이 없으면 꽂는다 — 사용자가 설정 파일을 안 만져도 되게', () => {
    const [server] = vaultMcpServers(launch, VAULT);
    expect(server.name).toBe(VAULT_MCP_SERVER_NAME);
    expect(server.command).toBe(BINARY);
    expect(server.env).toContainEqual({ name: 'OATLAS_VAULT', value: VAULT });
  });

  it('**중복 재현** — 볼트가 같은 명령을 이미 등록했으면 안 꽂는다', () => {
    expect(
      vaultMcpServers(launch, VAULT, { command: BINARY, validForCurrentVault: true }),
    ).toEqual([]);
  });

  it('명령이 같아도 현재 볼트용 설정이 아니면 앱이 다시 꽂는다', () => {
    expect(
      vaultMcpServers(launch, VAULT, { command: BINARY, validForCurrentVault: false }),
    ).toHaveLength(1);
  });

  it('등록된 명령이 다르면 꽂는다 — 볼트 항목이 낡았을 수 있다', () => {
    // 여기서 건너뛰면 도구가 **통째로 없는** 세션이 된다. 중복보다 훨씬 나쁘다.
    expect(
      vaultMcpServers(launch, VAULT, {
        command: '/old/path/ontology-atlas-mcp',
        validForCurrentVault: true,
      }),
    ).toHaveLength(1);
  });

  it('앞뒤 공백은 같은 것으로 본다 — TOML 파서마다 다듬는 정도가 다르다', () => {
    expect(
      vaultAlreadyRegisters(launch, {
        command: `  ${BINARY}  `,
        validForCurrentVault: true,
      }),
    ).toBe(true);
  });

  it('빈 등록은 등록이 아니다', () => {
    expect(
      vaultAlreadyRegisters(launch, { command: '', validForCurrentVault: true }),
    ).toBe(false);
    expect(
      vaultAlreadyRegisters(launch, { command: '   ', validForCurrentVault: true }),
    ).toBe(false);
    expect(vaultAlreadyRegisters(launch, null)).toBe(false);
    expect(
      vaultAlreadyRegisters(null, { command: BINARY, validForCurrentVault: true }),
    ).toBe(false);
  });
});

describe('어느 런타임이 볼트 설정을 스스로 읽나 — 실측한 것만', () => {
  it('codex 는 `.codex/config.toml` 을 읽는다 (2026-08-17 실측)', () => {
    expect(vaultSelfReadSlot('codex-acp')).toBe('codex-config');
  });

  /*
   * ⚠️ 안 재 본 런타임을 넣으면 **도구가 통째로 없는 세션**이 만들어질 수 있다.
   * 이 검사는 그걸 막는 자리다 — 새로 넣으려면 실측부터 하고 이 줄을 고친다.
   */
  it('안 재 본 런타임은 종전대로 꽂는다', () => {
    expect(vaultSelfReadSlot('claude-acp')).toBeNull();
    expect(vaultSelfReadSlot('gemini-acp')).toBeNull();
    expect(vaultSelfReadSlot(null)).toBeNull();
    expect(vaultSelfReadSlot(undefined)).toBeNull();
  });
});
