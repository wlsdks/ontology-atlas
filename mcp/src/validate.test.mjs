import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidVaultTitle, validateVaultDocument } from './validate.mjs';

const TEST_UID = '00000000-0000-4000-8000-000000000001';

describe('isValidVaultTitle', () => {
  it('비-string 은 false', () => {
    assert.equal(isValidVaultTitle(undefined), false);
    assert.equal(isValidVaultTitle(null), false);
    assert.equal(isValidVaultTitle(0), false);
    assert.equal(isValidVaultTitle(123), false);
    assert.equal(isValidVaultTitle(true), false);
    assert.equal(isValidVaultTitle({}), false);
    assert.equal(isValidVaultTitle([]), false);
  });

  it('빈 문자열 / 공백-only 는 false', () => {
    assert.equal(isValidVaultTitle(''), false);
    assert.equal(isValidVaultTitle('   '), false);
    assert.equal(isValidVaultTitle('\t\n'), false);
  });

  it('비-empty trimmed string 은 true', () => {
    assert.equal(isValidVaultTitle('Auth Platform'), true);
    assert.equal(isValidVaultTitle('한글 제목'), true);
    assert.equal(isValidVaultTitle('  Trimmed  '), true);
    assert.equal(isValidVaultTitle('A'), true);
  });
});

describe('validateVaultDocument (R11 #23)', () => {
  it('frontmatter 없으면 ok', () => {
    const r = validateVaultDocument('# just a doc');
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
  });

  it('정상 frontmatter ok', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: project\ntitle: Foo\n---\nbody`,
    );
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
  });

  it('닫는 --- 빠지면 unclosed-frontmatter error', () => {
    const r = validateVaultDocument('---\nkind: project\n# unclosed');
    assert.equal(r.ok, false);
    assert.equal(r.issues[0].code, 'unclosed-frontmatter');
    assert.equal(r.issues[0].severity, 'error');
  });

  it('빈 kind 는 empty-kind error', () => {
    const r = validateVaultDocument('---\nkind:\n---\n');
    assert.equal(r.ok, false);
    assert.equal(r.issues.some((i) => i.code === 'empty-kind'), true);
  });

  it('kind 없으면 missing-kind warning (ok=true)', () => {
    const r = validateVaultDocument('---\ntitle: Foo\n---\n');
    assert.equal(r.ok, true);
    assert.equal(r.issues.some((i) => i.code === 'missing-kind'), true);
  });

  it('non-canonical kind 는 unknown-kind warning', () => {
    const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: weird\n---\n`);
    assert.equal(r.ok, true);
    assert.equal(r.issues.some((i) => i.code === 'unknown-kind'), true);
  });

  it('canonical kind 6 종 모두 인식 (capability/element 는 domain 채워야 clean)', () => {
    // capability and element warn with missing-expected-field when `domain` is
    // absent. This test only checks that the canonical kind is recognised, so
    // `domain` is filled in to keep it clean.
    const cases = [
      { k: 'project' },
      { k: 'domain' },
      { k: 'capability', extra: 'domain: domains/auth' },
      { k: 'element', extra: 'domain: domains/auth' },
      { k: 'document' },
      { k: 'vault-readme' },
    ];
    for (const { k, extra } of cases) {
      const extraLine = extra ? `\n${extra}` : '';
      const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: ${k}${extraLine}\n---\n`);
      assert.equal(r.ok, true, `kind=${k}`);
      assert.equal(r.issues.length, 0, `kind=${k}`);
    }
  });

  it('R14 — capability without domain → missing-expected-field warning', () => {
    const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: capability\ntitle: X\n---\n`);
    assert.equal(r.ok, true);
    assert.equal(
      r.issues.some((i) => i.code === 'missing-expected-field'),
      true,
    );
  });

  it('graph 배열 중복/비정렬이면 non-canonical-graph-array warning', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: project\ntitle: X\ndependencies: [z, a, z]\n---\n`,
    );
    assert.equal(r.ok, true);
    assert.equal(
      r.issues.some((i) => i.code === 'non-canonical-graph-array'),
      true,
    );
  });

  it('malformed graph relation values are errors, not silently ignored', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: capability\ndepends_on: [capabilities/auth\nrelates: capabilities/legacy\n---\n`,
    );
    assert.equal(r.ok, false);
    assert.deepEqual(
      r.issues.filter((issue) => issue.code === 'malformed-frontmatter-line').map((issue) => issue.message),
      [
        'Frontmatter line 4 graph relation `depends_on:` must be an array.',
        'Frontmatter line 5 graph relation `relates:` must be an array.',
      ],
    );
  });
});

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
