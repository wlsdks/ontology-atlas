import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

import { forgetSecrets, ownedSecretNames, ownRefs } from './connector-secrets';

const deletes: string[] = [];
let refuseDelete = false;

vi.mock('@/shared/lib/connectors/tauri-connector-secrets', async () => {
  const actual = await vi.importActual<
    typeof import('@/shared/lib/connectors/tauri-connector-secrets')
  >('@/shared/lib/connectors/tauri-connector-secrets');
  return {
    ...actual,
    connectorSecretDelete: async (reference: string) => {
      if (refuseDelete) throw new Error('keychain refused');
      deletes.push(reference);
      return { secretRef: reference, stored: false, last4: null };
    },
  };
});

beforeEach(() => {
  deletes.length = 0;
  refuseDelete = false;
});

const OWN = { name: 'NOTION_TOKEN', secretRef: 'connector:mine:NOTION_TOKEN' };
const OTHERS = { name: 'API_KEY', secretRef: 'connector:someone-else:API_KEY' };
const LITERAL = { name: 'REGION', value: 'eu' };

describe('ownRefs', () => {
  it('keeps only references minted for this connector and this variable name', () => {
    expect(ownRefs('mine', [OWN, OTHERS, LITERAL])).toEqual([OWN.secretRef]);
  });
});

describe('ownedSecretNames', () => {
  it('lists the variable names across env and headers whose token this connector owns', () => {
    const connector: ConnectorRecord = {
      id: 'mine',
      name: 'n',
      transport: 'http',
      url: 'https://a.example/mcp',
      args: [],
      env: [OWN, LITERAL],
      headers: [{ name: 'Authorization', secretRef: 'connector:mine:Authorization' }, OTHERS],
      enabled: false,
    };
    expect(ownedSecretNames(connector)).toEqual(['NOTION_TOKEN', 'Authorization']);
  });
});

describe('forgetSecrets', () => {
  it('deletes only its own tokens, never one a shared row names for another connector', async () => {
    await forgetSecrets('mine', [OWN, OTHERS, LITERAL]);
    expect(deletes).toEqual([OWN.secretRef]);
  });

  it('does not stop the removal when the keychain refuses', async () => {
    refuseDelete = true;
    await expect(forgetSecrets('mine', [OWN])).resolves.toBeUndefined();
  });
});
