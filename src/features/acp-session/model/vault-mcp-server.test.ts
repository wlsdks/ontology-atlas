import { describe, expect, it } from 'vitest';

import {
  VAULT_MCP_SERVER_NAME,
  vaultAlreadyRegisters,
  vaultMcpServers,
  vaultSelfReadSlot,
} from './vault-mcp-server';

/**
 * Measured 2026-08-17. Opening a codex session in a vault created by `init` had **the same server
 * running twice** — one from the vault's `.codex/config.toml`, one wired by the app. Both names gave
 * the same result:
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
    // Skipping here produces a session with **no tools at all** — far worse than a duplicate.
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
   * ⚠️ Listing an unmeasured runtime can produce **a session with no tools at all**. This test is the
   * place that prevents it — adding one means measuring first and then editing this line.
   */
  it('안 재 본 런타임은 종전대로 꽂는다', () => {
    expect(vaultSelfReadSlot('claude-acp')).toBeNull();
    expect(vaultSelfReadSlot('gemini-acp')).toBeNull();
    expect(vaultSelfReadSlot(null)).toBeNull();
    expect(vaultSelfReadSlot(undefined)).toBeNull();
  });
});

/**
 * Measured in the installed app, 2026-08-25. The door created `<project>/atlas`, opened it, and
 * handed the work to Claude — which stopped at the first step and said the Atlas server reported its
 * code root as the vault folder itself, refusing to look one level up at the product. The feature
 * built to make a map from somebody's code could not see their code.
 */


describe('저장소 루트 — 지도가 프로젝트 안에 있으면 코드는 한 단계 위다', () => {
  const rootOf = (servers: ReturnType<typeof vaultMcpServers>) =>
    (servers[0]?.env as Array<{ name: string; value: string }> | undefined)?.find(
      (e) => e.name === 'OATLAS_REPO_ROOT',
    )?.value ?? null;

  it('프로젝트 안의 금고면 부모를 코드 루트로 넘긴다', () => {
    expect(rootOf(vaultMcpServers(launch, '/Users/dana/my-product/atlas'))).toBe(
      '/Users/dana/my-product',
    );
  });

  /*
   * ⚠️ The narrow half, and the reason the old code guessed nothing. A vault somebody keeps at
   * `~/notes` has no project above it; naming its parent as a code root would point the survey at
   * their home directory.
   */
  it('우리가 만든 모양이 아니면 예전처럼 아무것도 넘기지 않는다', () => {
    expect(rootOf(vaultMcpServers(launch, '/Users/dana/notes'))).toBeNull();
    expect(rootOf(vaultMcpServers(launch, '/Users/dana/Documents/my-ontology'))).toBeNull();
  });

  it('파일시스템 뿌리에 있는 atlas 는 프로젝트가 없다', () => {
    expect(rootOf(vaultMcpServers(launch, '/atlas'))).toBeNull();
  });
});
