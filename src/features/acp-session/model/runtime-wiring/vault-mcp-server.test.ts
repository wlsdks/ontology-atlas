import { describe, expect, it } from 'vitest';

import {
  hasVaultMcpServer,
  VAULT_MCP_SERVER_NAME,
  vaultAlreadyRegisters,
  vaultMcpServers,
  vaultSelfReadSlot,
  vaultWriteConsentOn,
} from './vault-mcp-server';

const BINARY = '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp';
const launch = { kind: 'app-bundled' as const, command: BINARY, args: [] };
const VAULT = '/Users/me/Documents/vault';

describe('MCP servers plugged into the session', () => {
  it('plugs in nothing when the launch method or the vault is unknown', () => {
    expect(vaultMcpServers(null, VAULT)).toEqual([]);
    expect(vaultMcpServers(launch, null)).toEqual([]);
  });

  it('plugs in when the vault has no registration, so the user need not touch a config file', () => {
    const [server] = vaultMcpServers(launch, VAULT);
    expect(server.name).toBe(VAULT_MCP_SERVER_NAME);
    expect(server.command).toBe(BINARY);
    expect(server.env).toContainEqual({ name: 'OATLAS_VAULT', value: VAULT });
  });

  it('**duplicate reproduction**: does not plug in when the vault already registered the same command', () => {
    expect(
      vaultMcpServers(launch, VAULT, { command: BINARY, validForCurrentVault: true }),
    ).toEqual([]);
  });

  it('re-plugs from the app when the command matches but the config is not for the current vault', () => {
    expect(
      vaultMcpServers(launch, VAULT, { command: BINARY, validForCurrentVault: false }),
    ).toHaveLength(1);
  });

  it('plugs in when the registered command differs, since the vault entry may be stale', () => {
    // Skipping here produces a session with **no tools at all** — far worse than a duplicate.
    expect(
      vaultMcpServers(launch, VAULT, {
        command: '/old/path/ontology-atlas-mcp',
        validForCurrentVault: true,
      }),
    ).toHaveLength(1);
  });

  it('treats leading and trailing whitespace as equal, since TOML parsers trim to different degrees', () => {
    expect(
      vaultAlreadyRegisters(launch, {
        command: `  ${BINARY}  `,
        validForCurrentVault: true,
      }),
    ).toBe(true);
  });

  it('an empty registration is not a registration', () => {
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

describe('which runtime reads the vault config itself: only what was measured', () => {
  it('codex reads `.codex/config.toml` (measured 2026-08-17)', () => {
    expect(vaultSelfReadSlot('codex-acp')).toBe('codex-config');
  });

  /*
   * ⚠️ Listing an unmeasured runtime can produce **a session with no tools at all**. This test is the
   * place that prevents it — adding one means measuring first and then editing this line.
   */
  it('plugs in as before for a runtime not yet measured', () => {
    expect(vaultSelfReadSlot('claude-acp')).toBeNull();
    expect(vaultSelfReadSlot('gemini-acp')).toBeNull();
    expect(vaultSelfReadSlot(null)).toBeNull();
    expect(vaultSelfReadSlot(undefined)).toBeNull();
  });
});


describe('repository root: when the map is inside the project, the code is one level up', () => {
  const rootOf = (servers: ReturnType<typeof vaultMcpServers>) =>
    (servers[0]?.env as Array<{ name: string; value: string }> | undefined)?.find(
      (e) => e.name === 'OATLAS_REPO_ROOT',
    )?.value ?? null;

  it('passes the parent as the code root for a vault inside a project', () => {
    expect(rootOf(vaultMcpServers(launch, '/Users/dana/my-product/atlas'))).toBe(
      '/Users/dana/my-product',
    );
  });

  /*
   * ⚠️ The narrow half, and the reason the old code guessed nothing. A vault somebody keeps at
   * `~/notes` has no project above it; naming its parent as a code root would point the survey at
   * their home directory.
   */
  it('passes nothing, as before, for a shape we did not create', () => {
    expect(rootOf(vaultMcpServers(launch, '/Users/dana/notes'))).toBeNull();
    expect(rootOf(vaultMcpServers(launch, '/Users/dana/Documents/my-ontology'))).toBeNull();
  });

  it('an atlas at the filesystem root has no project', () => {
    expect(rootOf(vaultMcpServers(launch, '/atlas'))).toBeNull();
  });
});

describe('vault entries are found by name, since the list is no longer only ours', () => {
  const vaultEntry = {
    name: VAULT_MCP_SERVER_NAME,
    command: '/app/ontology-atlas-mcp',
    args: [],
    env: [{ name: 'OATLAS_WRITE_CONSENT', value: 'on' }],
  };
  const connectorEntry = {
    name: 'notion',
    command: '/opt/homebrew/bin/npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: [{ name: 'OATLAS_WRITE_CONSENT', value: 'on' }],
  };

  it('does not mistake a list carrying only externally connected tools for the vault server', () => {
    // Before external connectors, "the list is not empty" and "we wired the vault" were the same
    // sentence. They stopped being the same the moment somebody else's server could be in it.
    expect(hasVaultMcpServer([connectorEntry])).toBe(false);
    expect(hasVaultMcpServer([vaultEntry, connectorEntry])).toBe(true);
    expect(hasVaultMcpServer([])).toBe(false);
    expect(hasVaultMcpServer(null)).toBe(false);
  });

  it('reads only the environment of the vault entry for the checkpoint flag, so another config cannot make our sentence true', () => {
    // The screen says "changes through Atlas tools still stop at the server". A connector
    // carrying a variable of that name would have made that sentence true for a gate that is
    // not there.
    expect(vaultWriteConsentOn([connectorEntry])).toBe(false);
    expect(vaultWriteConsentOn([vaultEntry])).toBe(true);
    expect(vaultWriteConsentOn([connectorEntry, vaultEntry])).toBe(true);
  });

  it('keeps each shape even when vault entries and connected tools are mixed in one array', () => {
    const servers = [
      ...vaultMcpServers(launch, VAULT),
      { type: 'http' as const, name: 'linear', url: 'https://mcp.linear.app/mcp', headers: [] },
    ];
    expect(servers[0]).toMatchObject({ name: VAULT_MCP_SERVER_NAME });
    expect(servers[1]).toMatchObject({ type: 'http', name: 'linear' });
    // The vault server stays first: it is the one the session's instructions name.
    expect(hasVaultMcpServer(servers)).toBe(true);
    expect(vaultWriteConsentOn(servers)).toBe(true);
  });
});

it('binds an explicit connected source without changing the vault or consent boundary',()=>{
 const [server]=vaultMcpServers(launch,VAULT,null,{sourceRoot:'/connected/code',ownsWriteGate:false});
 expect(server.env).toContainEqual({name:'OATLAS_REPO_ROOT',value:'/connected/code'});
 expect(server.env).toContainEqual({name:'OATLAS_VAULT',value:VAULT});
 expect(vaultWriteConsentOn([server])).toBe(true);
});

it('does not reuse a vault registration whose source root has not been verified for the selected analysis',()=>{
 const registration={command:BINARY,validForCurrentVault:true};
 expect(vaultMcpServers(launch,VAULT,registration)).toEqual([]);
 const [scoped]=vaultMcpServers(launch,VAULT,registration,{sourceRoot:'/connected/code'});
 expect(scoped.name).toBe('atlas-vault');
 expect(scoped.env).toContainEqual({name:'OATLAS_REPO_ROOT',value:'/connected/code'});
 expect(vaultWriteConsentOn([scoped])).toBe(true);
});
