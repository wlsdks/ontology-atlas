import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidVaultTitle, validateVaultDocument } from './validate.mjs';

const TEST_UID = '00000000-0000-4000-8000-000000000001';

/**
 * A finished body, per kind.
 *
 * Since 2026-09-22 this validator reads the prose too, so a document written to
 * test one frontmatter rule has to carry a body that answers every meaning
 * question — otherwise the case under test arrives buried under four findings
 * about a body nobody meant to write. These are the shortest bodies that do:
 * one non-circular sentence, both boundary sides where the kind has them, and a
 * stated unknown.
 */
const FINISHED_BODY = {
  domain: '\n# Area\n\n' +
    'Owns how an outside coding agent reaches this folder and what it may change.\n\n' +
    '## Includes\n\n- The stdio child this product starts itself\n\n' +
    '## Excludes\n\n- The coding agent provider traffic, which nothing here sees\n\n' +
    '## Uncertainty\n\n- The Windows launcher path was never exercised\n',
  capability: '\n# Ability\n\n' +
    'Turns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n' +
    '## Includes\n\n- Reading frontmatter relations from every document\n\n' +
    '## Excludes\n\n- Drawing the result on screen, which the map surface owns\n\n' +
    '## Uncertainty\n\n- The symlinked-subtree case was never measured\n',
  element: '\n# Role\n\n' +
    'Holds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n' +
    '## Uncertainty\n\n- The older build deep-link fallback was not read\n',
};

/** The finished capability body, for the `relation_notes` cases below. */
const CAPABILITY_BODY = FINISHED_BODY.capability;

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
      // A finished body where the kind has body duties, so the only thing this
      // case can fail on is the kind itself.
      const body = FINISHED_BODY[k] ?? '';
      const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: ${k}${extraLine}\n---\n${body}`);
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

  it('a scalar whose quote closes early is an error, not a silent rename', () => {
    // docs/ontology/elements/agents-destination.md, 2026-08-31: the node loaded,
    // validate said 0 issues, and the map rendered the stray quote.
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: element\ndomain: domains/agent-integration\ntitle: Agents Destination\ndisplay_ko: "에이전트" 목적지\n---\n`,
    );
    assert.equal(r.ok, false);
    const issue = r.issues.find((i) => i.code === 'malformed-quoted-scalar');
    assert.equal(issue.severity, 'error');
    assert.match(issue.message, /`display_ko:`/);
    assert.match(issue.message, /Close the quote or remove it: `display_ko: 에이전트 목적지`/);
  });

  it('a correctly quoted or escaped scalar stays clean', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: element\ndomain: domains/agent-integration\ntitle: "Agents Destination"\ndisplay_ko: 에이전트 목적지\ndisplay_en: "a \\"quoted\\" word"\n---\n`,
    );
    assert.equal(r.ok, true);
    assert.equal(r.issues.some((i) => i.code === 'malformed-quoted-scalar'), false);
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

describe('the meaning half — the body checks the person can finally run', () => {
  /*
   * Until 2026-09-22 every one of these was reported to the *agent* at the write
   * door and to nobody else, so an agent could read six findings and tell the
   * person the vault validated clean without contradicting a single surface the
   * person could check. These cases are that gap closed: the same judgements,
   * from the same module, on the validator the owner runs.
   */
  it('a body that opens straight into headings has no definition', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: element\ndomain: domains/auth\ntitle: Token Rotator\n---\n` +
        '# Token Rotator\n\n## Uncertainty\n\n- The refresh path was never opened\n',
    );
    assert.equal(r.ok, true, 'a thin body is advisory, never an error');
    assert.deepEqual(r.issues.map((issue) => issue.code), ['definition-missing']);
    assert.equal(r.issues[0].severity, 'warning');
  });

  it('a definition that only restates the title is still missing', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: element\ndomain: domains/auth\ntitle: Bottom Tab Bar\n---\n` +
        '# Bottom Tab Bar\n\nMobile and web bottom tab navigation bar for the app.\n\n' +
        '## Uncertainty\n\n- The tablet layout was not measured\n',
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['definition-missing']);
  });

  it('each missing boundary side is its own finding', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: capability\ndomain: domains/auth\ntitle: Ability\n---\n` +
        '# Ability\n\nTurns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n' +
        '## Uncertainty\n\n- The symlinked-subtree case was never measured\n',
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['boundary-missing', 'boundary-missing']);
  });

  it('an exclusion that names an evidence limit is reported as one', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: capability\ndomain: domains/auth\ntitle: Ability\n---\n` +
        CAPABILITY_BODY.replace(
          '- Drawing the result on screen, which the map surface owns',
          '- The retry queue, which this survey did not inspect',
        ),
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['epistemic-exclusion']);
  });

  it('an Uncertainty section holding only the template placeholder is empty', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: element\ndomain: domains/auth\ntitle: Role\n---\n` +
        '# Role\n\nHolds the one address every agent-facing link resolves to, so a moved surface renames once.\n\n' +
        '## Uncertainty\n\n- <what you did not read or could not check>\n',
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['uncertainty-missing']);
  });

  it('a flat slug is reported only when the caller states where the file sits', () => {
    const raw =
      `---\nuid: ${TEST_UID}\nkind: element\ndomain: domains/auth\ntitle: Role\n---\n` +
      FINISHED_BODY.element;
    // Position is not a fact about bytes: a caller holding only the text is
    // never told a node is in the wrong place.
    assert.deepEqual(validateVaultDocument(raw).issues, []);
    assert.deepEqual(
      validateVaultDocument(raw, { slug: 'token-rotator' }).issues.map((issue) => issue.code),
      ['slug-outside-kind-folder'],
    );
    assert.deepEqual(validateVaultDocument(raw, { slug: 'elements/token-rotator' }).issues, []);
  });

  it('the document own `slug:` answers when the caller does not', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nslug: token-rotator\nkind: element\ndomain: domains/auth\ntitle: Role\n---\n` +
        FINISHED_BODY.element,
    );
    assert.deepEqual(r.issues.map((issue) => issue.code), ['slug-outside-kind-folder']);
  });

  it('a project and a document carry no body duty', () => {
    for (const kind of ['project', 'document']) {
      const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: ${kind}\ntitle: X\n---\n# X\n`);
      assert.deepEqual(r.issues, [], kind);
    }
  });
});

describe('relation_notes guard (swallowed entries and orphaned keys)', () => {
  const head = `---\nuid: ${TEST_UID}\nkind: capability\ntitle: ACP\ndomain: domains/agent-integration\n`;
  /** Every case here is about frontmatter, so the body is always the finished one. */
  const tail = `---\n${CAPABILITY_BODY}`;

  it('an unquoted value that ran past its comma leaves a pseudo-key: orphaned-relation-note', () => {
    // The exact shape found in docs/ontology/capabilities/acp-runtime.md on
    // 2026-08-30: the first value ends at the comma, and the rest of the sentence
    // plus the next entry's slug become the second KEY. The value test alone saw
    // nothing, so validate_vault reported 0 problems.
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server]\nrelates: [capabilities/reviewed-ontology-writing]\n' +
        'relation_notes: { capabilities/mcp-server: The ACP session receives this server, ACP sits on top of it. capabilities/reviewed-ontology-writing: "ACP permission requests reuse the reviewed writing contract." }\n' +
        tail,
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
        'relation_notes: { capabilities/mcp-server: "The ACP session receives this server, ACP sits on top of it.", capabilities/reviewed-ontology-writing: "ACP permission requests reuse the reviewed writing contract." }\n' +
        tail,
    );
    assert.deepEqual(r.issues, []);
    assert.equal(r.ok, true);
  });

  it('a value that swallowed the next entry as text: swallowed-relation-note', () => {
    const r = validateVaultDocument(
      head +
        'dependencies: [capabilities/mcp-server, capabilities/skill-handoff]\n' +
        'relation_notes:\n  capabilities/mcp-server: "gate., capabilities/skill-handoff: the handoff"\n' +
        tail,
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
        'relation_notes: { capabilities/mcp-server: "full slug for a tail entry", vault-ontology: "tail for a full entry", domains/agent-integration: "the inline parent" }\n' +
        tail,
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
});
