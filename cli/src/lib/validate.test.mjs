import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateVaultDocument } from './validate.mjs';

// `cli/src/lib/validate.mjs` re-exports mcp/src/validate.mjs rather than copying
// it, so these cases are also the proof that the re-export resolves and delegates
// — including inside the packed two-package install, where `npm test` runs this
// file against the installed ontology-atlas-mcp package rather than the checkout.
// tests/contract/validate-vault-document.contract.test.ts still pins the
// issue-code set the TypeScript twin must agree on.
const TEST_UID = '00000000-0000-4000-8000-000000000001';

/**
 * A finished capability body.
 *
 * The validator reads the prose too since 2026-09-22, so a case written to test
 * one frontmatter rule needs a body that answers every meaning question, or the
 * rule under test arrives buried under findings about a body nobody meant to
 * write.
 */
const FINISHED_CAPABILITY_BODY =
  '\n# Ability\n\n' +
  'Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n' +
  '## Includes\n\n- Reading frontmatter relations from every document\n\n' +
  '## Excludes\n\n- Drawing the result on screen, which the map surface owns\n\n' +
  '## Uncertainty\n\n- The symlinked-subtree case was never measured\n';

describe('relation_notes guard (swallowed entries and orphaned keys)', () => {
  const head = `---\nuid: ${TEST_UID}\nkind: capability\ntitle: ACP\ndomain: domains/agent-integration\n`;
  const tail = `---\n${FINISHED_CAPABILITY_BODY}`;

  it('an unquoted value that ran past its comma leaves a pseudo-key: orphaned-relation-note', () => {
    // The exact shape found in docs/ontology/capabilities/acp-runtime.md on
    // 2026-08-30: the first value ends at the comma, and the rest of the sentence
    // plus the next entry's slug become the second KEY. The value test alone saw
    // nothing, so validate_vault reported 0 problems.
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server]\nrelates: [capabilities/reviewed-ontology-writing]\n' +
        'relation_notes: { capabilities/mcp-server: The ACP session receives this server, ACP sits on top of it. capabilities/reviewed-ontology-writing: "ACP permission requests reuse the reviewed writing contract." }\n' + tail,
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
        'relation_notes: { capabilities/mcp-server: "The ACP session receives this server, ACP sits on top of it.", capabilities/reviewed-ontology-writing: "ACP permission requests reuse the reviewed writing contract." }\n' + tail,
    );
    assert.deepEqual(r.issues, []);
    assert.equal(r.ok, true);
  });

  it('a value that swallowed the next entry as text: swallowed-relation-note', () => {
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server, capabilities/skill-handoff]\n' +
        'relation_notes:\n  capabilities/mcp-server: "gate., capabilities/skill-handoff: the handoff"\n' + tail,
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
        'relation_notes: { capabilities/mcp-server: "full slug for a tail entry", vault-ontology: "tail for a full entry", domains/agent-integration: "the inline parent" }\n' + tail,
    );
    assert.deepEqual(r.issues, []);
  });

  it('a note for a relation this node never declares is orphaned', () => {
    const r = validateVaultDocument(
      head + 'dependencies: [capabilities/mcp-server]\nrelation_notes: { capabilities/gone: "stale after a manual removal" }\n' + tail,
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['orphaned-relation-note']);
    assert.match(r.issues[0].message, /declared: .*capabilities\/mcp-server/);
  });

  it('the body half arrives through the same re-export', () => {
    // The CLI executes `mcp/src/validate.mjs` rather than copying it, so this is
    // the proof that the meaning findings reach `ontology-atlas validate` at all
    // — including in the packed two-package install, where `meaning-findings.mjs`
    // has to be in the MCP package's `files` list to resolve.
    const r = validateVaultDocument(head + tail.replace(FINISHED_CAPABILITY_BODY, '\n# ACP\n'));
    assert.deepEqual(
      r.issues.map((issue) => issue.code).sort(),
      ['boundary-missing', 'boundary-missing', 'definition-missing', 'uncertainty-missing'],
    );
    assert.equal(r.ok, true, 'a thin body is advisory, never an error');
  });

  it('a flat slug is reported only when the caller states the position', () => {
    const raw = head + tail;
    assert.deepEqual(validateVaultDocument(raw).issues, []);
    assert.deepEqual(
      validateVaultDocument(raw, { slug: 'acp' }).issues.map((issue) => issue.code),
      ['slug-outside-kind-folder'],
    );
  });
});

/**
 * The whole-vault half of the validator.
 *
 * `dependency-unwitnessed` cannot live in `validateVaultDocument` for two
 * reasons at once: it opens the source file a node cites, which only means
 * something against a repository root, and it needs the `path:` of the node at
 * the *far* end of the edge, which no single document carries. So it runs as a
 * pass over the whole vault, and the only honest way to prove that wiring is to
 * run the command the way a person does.
 */
describe('dependency-unwitnessed — the whole-vault pass in `validate`', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-cli-witness-'));
    const vault = join(root, 'vault');
    mkdirSync(join(vault, 'capabilities'), { recursive: true });
    mkdirSync(join(vault, 'domains'), { recursive: true });
    mkdirSync(join(root, 'src', 'lib'), { recursive: true });
    writeFileSync(join(root, 'src', 'lib', 'helper.ts'), 'export const helper = 1;\n');
    writeFileSync(join(root, 'src', 'stranger.ts'), 'export const nothing = "no other file";\n');
    writeFileSync(
      join(root, 'src', 'consumer.ts'),
      "import { helper } from './lib/helper';\nexport const used = helper;\n",
    );
    const node = (slug, extra) =>
      `---\nuid: ${randomUUID()}\nslug: ${slug}\nkind: capability\ntitle: ${slug}\ndomain: domains/core\n${extra}---\n${FINISHED_CAPABILITY_BODY}`;
    writeFileSync(
      join(vault, 'domains', 'core.md'),
      `---\nuid: ${randomUUID()}\nslug: domains/core\nkind: domain\ntitle: Core\n---\n${FINISHED_CAPABILITY_BODY}`,
    );
    writeFileSync(join(vault, 'capabilities', 'helper.md'), node('capabilities/helper', 'path: src/lib/helper.ts\n'));
    writeFileSync(
      join(vault, 'capabilities', 'stranger.md'),
      node('capabilities/stranger', 'path: src/stranger.ts\ndependencies: [capabilities/helper]\nrelation_notes: { capabilities/helper: "The stranger is said to use the helper." }\n'),
    );
    writeFileSync(
      join(vault, 'capabilities', 'consumer.md'),
      node('capabilities/consumer', 'path: src/consumer.ts\ndependencies: [capabilities/helper]\nrelation_notes: { capabilities/helper: "The consumer imports the helper." }\n'),
    );
    return { root, vault };
  }

  function runCli(vault, env) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../index.mjs', import.meta.url)), 'validate', vault, '--json'],
      { encoding: 'utf-8', env: { ...process.env, ...env } },
    );
    return JSON.parse(result.stdout);
  }

  it('names the one unwitnessed edge and leaves the witnessed one alone', (t) => {
    const { root, vault } = fixture();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const report = runCli(vault, { OATLAS_REPO_ROOT: root });
    const rows = report.problems.flatMap((problem) =>
      problem.issues
        .filter((issue) => issue.code === 'dependency-unwitnessed')
        .map((issue) => ({ file: problem.file, message: issue.message })),
    );
    assert.equal(rows.length, 1);
    assert.match(rows[0].file, /stranger/);
    assert.match(rows[0].message, /src\/lib\/helper\.ts/);
    // A warning, never an error: the vault is valid Markdown the graph reads
    // correctly, and the absence of an import is not proof of independence.
    assert.equal(report.summary.errorFiles, 0);
  });

  /*
   * With no root, the check has no tree to measure against. Silence here means
   * "not looked at", which is the opposite of "nothing found" and the reason
   * `--list-codes` marks this one vault scope.
   */
  it('stays silent with OATLAS_REPO_ROOT unset', (t) => {
    const { root, vault } = fixture();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const report = runCli(vault, { OATLAS_REPO_ROOT: '' });
    assert.equal(
      report.problems.flatMap((p) => p.issues).filter((i) => i.code === 'dependency-unwitnessed').length,
      0,
    );
  });
});

/**
 * The starter examples `init` leaves behind.
 *
 * The one whole-vault meaning pass with no environment condition: no repository
 * root, no file on disk, no body. So the interesting case is not that it fires
 * but that a freshly scaffolded vault — which is nothing *but* starters — comes
 * back clean, because that is the vault `ontology-atlas init` hands a person on
 * their first minute.
 */
describe('starter-example-node — the whole-vault pass in `validate`', () => {
  function vaultWith(extra) {
    const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-cli-starter-'));
    mkdirSync(join(root, 'domains'), { recursive: true });
    mkdirSync(join(root, 'capabilities'), { recursive: true });
    mkdirSync(join(root, 'elements'), { recursive: true });
    const write = (path, slug, kind, title, extraKeys = '') =>
      writeFileSync(
        join(root, path),
        `---\nuid: ${randomUUID()}\nslug: ${slug}\nkind: ${kind}\ntitle: ${title}\n${extraKeys}---\n${FINISHED_CAPABILITY_BODY}`,
      );
    write('domains/example-domain.md', 'domains/example-domain', 'domain', 'Example domain');
    write('capabilities/example-capability.md', 'capabilities/example-capability', 'capability', 'Example capability', 'domain: domains/example-domain\n');
    write('elements/example-element.md', 'elements/example-element', 'element', 'Example element', 'domain: domains/example-domain\n');
    for (const row of extra) write(...row);
    return root;
  }

  function runCli(vault) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../index.mjs', import.meta.url)), 'validate', vault, '--json'],
      { encoding: 'utf-8', env: { ...process.env, OATLAS_REPO_ROOT: '' } },
    );
    return JSON.parse(result.stdout);
  }

  function starterRows(report) {
    return report.problems.flatMap((problem) =>
      problem.issues
        .filter((issue) => issue.code === 'starter-example-node')
        .map(() => problem.file),
    );
  }

  it('a vault straight out of `init` is clean', (t) => {
    const root = vaultWith([]);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const report = runCli(root);
    assert.deepEqual(starterRows(report), []);
    assert.equal(report.summary.errorFiles, 0);
  });

  it('names each starter once a real node of that kind arrives', (t) => {
    const root = vaultWith([
      ['domains/billing.md', 'domains/billing', 'domain', 'Billing'],
      ['elements/stripe-client.md', 'elements/stripe-client', 'element', 'Stripe client', 'domain: domains/billing\n'],
    ]);
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const report = runCli(root);
    // The capability starter stays silent: no real capability exists yet.
    assert.deepEqual(starterRows(report).sort(), [
      'domains/example-domain.md',
      'elements/example-element.md',
    ]);
    // A warning, never an error — the vault is valid and nothing blocks.
    assert.equal(report.summary.errorFiles, 0);
  });
});
