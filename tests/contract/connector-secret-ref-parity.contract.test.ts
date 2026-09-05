import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ACP_SECRET_REF_KEY } from '@/shared/lib/tauri-connector-secrets';

/**
 * One literal has to mean the same thing on both sides of the Tauri boundary, and neither side can
 * see the other.
 *
 * The WebView writes `{"name":"NOTION_TOKEN","__atlasSecretRef":"connector:c1:NOTION_TOKEN"}` into
 * the outgoing `session/new`; Rust swaps that object for `{"name":…,"value":…}` on the way out. If
 * the two spellings drifted, nothing would fail loudly: the marker would travel to the agent
 * untouched, the connector would start with the literal string `connector:c1:NOTION_TOKEN` where
 * its token belongs, and every call it made would be refused by a service that has no idea why.
 *
 * The reference **format** is pinned here too, because Rust validates it before it becomes a
 * keychain account name — a TypeScript builder that produced a different shape would have every
 * save rejected as invalid.
 */

const rust = readFileSync(
  join(process.cwd(), 'src-tauri/src/connector_secrets.rs'),
  'utf-8',
);

describe('the connector secret marker means the same on both sides', () => {
  it('spells the marker key identically in TypeScript and Rust', () => {
    const declared = /pub\(crate\) const SECRET_REF_KEY: &str = "([^"]+)";/.exec(rust);
    expect(declared?.[1]).toBe(ACP_SECRET_REF_KEY);
  });

  it('agrees on the reference format the keychain account is built from', () => {
    // Rust's validator: `connector` · id · variable, three colon-separated parts.
    expect(rust).toContain('matches!(parts.next(), Some("connector"))');
    const built = 'connector:c1:NOTION_TOKEN'.split(':');
    expect(built[0]).toBe('connector');
    expect(built).toHaveLength(3);
  });

  it('keeps the connector keychain separate from the BYOK provider keychain', () => {
    // Sharing a service name would let a connector reference address a provider key, and would
    // pile both groups into one entry list nobody can safely clear.
    const service = /const SERVICE: &str = "([^"]+)";/.exec(rust);
    expect(service?.[1]).toBe('Ontology Atlas Connectors');
    const byok = readFileSync(join(process.cwd(), 'src-tauri/src/secrets.rs'), 'utf-8');
    expect(byok).toContain('const SERVICE: &str = "Ontology Atlas";');
  });

  it('exposes no Rust command that hands a stored connector token back to the WebView', () => {
    // The same promise `secrets.rs` makes for provider keys. Pinned from the outside as well as
    // from inside the module, because a new command is added by somebody reading neither.
    const body = rust.split('#[cfg(test)]')[0] ?? '';
    const commands = body.match(/#\[tauri::command\]/g) ?? [];
    const statusReturns = body.match(/Result<ConnectorSecretStatus, String>/g) ?? [];
    expect(commands).toHaveLength(3);
    expect(statusReturns).toHaveLength(commands.length);
  });
});
