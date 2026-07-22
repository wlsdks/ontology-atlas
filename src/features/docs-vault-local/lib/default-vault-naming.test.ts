import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VAULT_BASE_NAME,
  buildDefaultVaultDisplayPath,
  resolveUniqueVaultDirName,
} from './default-vault-naming';

describe('resolveUniqueVaultDirName', () => {
  it('uses the base name when nothing else exists', () => {
    expect(resolveUniqueVaultDirName([])).toBe(DEFAULT_VAULT_BASE_NAME);
    expect(resolveUniqueVaultDirName(['unrelated-folder'])).toBe(DEFAULT_VAULT_BASE_NAME);
  });

  it('appends -2 when the base name is already taken', () => {
    expect(resolveUniqueVaultDirName([DEFAULT_VAULT_BASE_NAME])).toBe(
      `${DEFAULT_VAULT_BASE_NAME}-2`,
    );
  });

  it('walks past every taken numbered suffix in order', () => {
    expect(
      resolveUniqueVaultDirName([
        DEFAULT_VAULT_BASE_NAME,
        `${DEFAULT_VAULT_BASE_NAME}-2`,
        `${DEFAULT_VAULT_BASE_NAME}-3`,
      ]),
    ).toBe(`${DEFAULT_VAULT_BASE_NAME}-4`);
  });

  it('does not get confused by a gap in the numbered sequence', () => {
    // -2 가 비어있고 -3 만 있으면 -2 를 그대로 재사용 — 최소 번호 우선.
    expect(
      resolveUniqueVaultDirName([DEFAULT_VAULT_BASE_NAME, `${DEFAULT_VAULT_BASE_NAME}-3`]),
    ).toBe(`${DEFAULT_VAULT_BASE_NAME}-2`);
  });

  it('supports a custom base name', () => {
    expect(resolveUniqueVaultDirName(['acme'], 'acme')).toBe('acme-2');
  });
});

describe('buildDefaultVaultDisplayPath', () => {
  it('joins the fixed parent label with the chosen dir name', () => {
    expect(buildDefaultVaultDisplayPath('my-ontology')).toBe(
      '~/Documents/Ontology Atlas/my-ontology',
    );
    expect(buildDefaultVaultDisplayPath('my-ontology-2')).toBe(
      '~/Documents/Ontology Atlas/my-ontology-2',
    );
  });
});
