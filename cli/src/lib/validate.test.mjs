import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateVaultDocument } from './validate.mjs';

// `cli/src/lib/validate.mjs` re-exports mcp/src/validate.mjs rather than copying
// it, so these cases are also the proof that the re-export resolves and delegates
// — including inside the packed two-package install, where `npm test` runs this
// file against the installed ontology-atlas-mcp package rather than the checkout.
// tests/contract/validate-vault-document.contract.test.ts still pins the
// issue-code set the TypeScript twin must agree on.
const TEST_UID = '00000000-0000-4000-8000-000000000001';

describe('relation_notes guard (swallowed entries and orphaned keys)', () => {
  const head = `---\nuid: ${TEST_UID}\nkind: capability\ntitle: ACP\ndomain: domains/agent-integration\n`;

  it('an unquoted value that ran past its comma leaves a pseudo-key: orphaned-relation-note', () => {
    // The exact shape found in docs/ontology/capabilities/acp-runtime.md on
    // 2026-08-30: the first value ends at the comma, and the rest of the sentence
    // plus the next entry's slug become the second KEY. The value test alone saw
    // nothing, so validate_vault reported 0 problems.
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server]\nrelates: [capabilities/reviewed-ontology-writing]\n' +
        'relation_notes: { capabilities/mcp-server: The ACP session receives this server, ACP sits on top of it. capabilities/reviewed-ontology-writing: "ACP permission requests reuse the reviewed writing contract." }\n---\n',
    );
    assert.equal(r.ok, false);
    const orphaned = r.issues.filter((issue) => issue.code === 'orphaned-relation-note');
    assert.equal(orphaned.length, 1);
    assert.match(orphaned[0].message, /ACP sits on top of it\. capabilities\/reviewed-ontology-writing/);
    assert.match(orphaned[0].message, /wrap that value in double quotes/);
  });

  it('the repaired shape (value quoted, two entries) is clean', () => {
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server]\nrelates: [capabilities/reviewed-ontology-writing]\n' +
        'relation_notes: { capabilities/mcp-server: "The ACP session receives this server, ACP sits on top of it.", capabilities/reviewed-ontology-writing: "ACP permission requests reuse the reviewed writing contract." }\n---\n',
    );
    assert.deepEqual(r.issues, []);
    assert.equal(r.ok, true);
  });

  it('a value that swallowed the next entry as text: swallowed-relation-note', () => {
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server, capabilities/skill-handoff]\n' +
        'relation_notes:\n  capabilities/mcp-server: "gate., capabilities/skill-handoff: the handoff"\n---\n',
    );
    assert.deepEqual(
      r.issues.map((issue) => issue.code),
      ['swallowed-relation-note'],
    );
    assert.match(r.issues[0].message, /capabilities\/skill-handoff/);
  });

  it('a note keyed by the full slug, tail alias, or inline domain parent is a declared target', () => {
    const r = validateVaultDocument(
      head +
        'dependencies: [mcp-server]\nrelates: [capabilities/vault-ontology]\n' +
        'relation_notes: { capabilities/mcp-server: "full slug for a tail entry", vault-ontology: "tail for a full entry", domains/agent-integration: "the inline parent" }\n---\n',
    );
    assert.deepEqual(r.issues, []);
  });

  it('a note for a relation this node never declares is orphaned', () => {
    const r = validateVaultDocument(
      head + 'dependencies: [capabilities/mcp-server]\nrelation_notes: { capabilities/gone: "stale after a manual removal" }\n---\n',
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['orphaned-relation-note']);
    assert.match(r.issues[0].message, /declared: .*capabilities\/mcp-server/);
  });
});
