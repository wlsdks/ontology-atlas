import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import {
  ACP_SECRET_REF_KEY,
  type ConnectorSecretStatus,
  connectorSecretDelete,
  connectorSecretErrorMessage,
  connectorSecretRef,
  connectorSecretSet,
  connectorSecretStatus,
  isConnectorSecretBridgeAvailable,
  subscribeConnectorSecretChange,
} from './tauri-connector-secrets';

afterEach(() => {
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('connector secret bridge', () => {
  it('degrades honestly in a browser: null, with zero invokes', async () => {
    expect(isConnectorSecretBridgeAvailable()).toBe(false);
    expect(await connectorSecretSet('connector:c1:NOTION_TOKEN', 'ntn_live')).toBeNull();
    expect(await connectorSecretStatus('connector:c1:NOTION_TOKEN')).toBeNull();
    expect(await connectorSecretDelete('connector:c1:NOTION_TOKEN')).toBeNull();
    expect(tauriApiMock.invoke).not.toHaveBeenCalled();
  });

  it('passes the value down exactly once and never asks for it back', async () => {
    tauriApiMock.runtimeAvailable = true;
    const stored: ConnectorSecretStatus = {
      secretRef: 'connector:c1:NOTION_TOKEN',
      stored: true,
      last4: 'live',
    };
    tauriApiMock.invoke.mockResolvedValue(stored);
    expect(await connectorSecretSet('connector:c1:NOTION_TOKEN', 'ntn_live')).toEqual(stored);
    // Only `connector_secret_set` ever carries a secret argument. There is no reader wrapper in
    // this module at all, because Rust exposes no command that returns a stored value.
    const commands = tauriApiMock.invoke.mock.calls.map(([command]) => command);
    expect(commands).toEqual(['connector_secret_set']);
    expect(Object.keys(await import('./tauri-connector-secrets'))).not.toContain(
      'connectorSecretGet',
    );
  });

  it('keys the keychain by the record id, so a rename does not orphan the token', () => {
    expect(connectorSecretRef('c1', 'NOTION_TOKEN')).toBe('connector:c1:NOTION_TOKEN');
  });

  it('announces a change so a panel elsewhere re-reads instead of going stale', async () => {
    tauriApiMock.runtimeAvailable = true;
    tauriApiMock.invoke.mockResolvedValue({ secretRef: 'r', stored: true, last4: 'abcd' });
    const seen = vi.fn();
    const stop = subscribeConnectorSecretChange(seen);
    await connectorSecretSet('connector:c1:NOTION_TOKEN', 'ntn_live');
    await connectorSecretDelete('connector:c1:NOTION_TOKEN');
    expect(seen).toHaveBeenCalledTimes(2);
    stop();
    await connectorSecretSet('connector:c1:NOTION_TOKEN', 'ntn_live');
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('turns a coded rejection into the reader own sentence, keeping the variable name', () => {
    const message = connectorSecretErrorMessage(
      'connector-secret-missing: NOTION_TOKEN',
      (code) =>
        code === 'connector-secret-missing'
          ? 'A token this connector needs is not in the keychain.'
          : undefined,
    );
    expect(message).toContain('not in the keychain');
    // Rust supplies the variable name as the detail; it rides along in parentheses so the
    // reader knows which one to enter.
    expect(message).toContain('NOTION_TOKEN');
  });

  it('names the marker the outgoing line carries in place of a value', () => {
    expect(ACP_SECRET_REF_KEY).toBe('__atlasSecretRef');
  });
});
