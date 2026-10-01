import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { defaultBody, nodeUidIssue } from './schema.mjs';

import {
  FULL_BODY_MAX_CHARS,
  canonicalDiskSlug,
  deleteDoc,
  drainNodeEligibilityFindings,
  resetNodeEligibilityGate,
  describeBodyDelivery,
  detectDuplicateTitle,
  extractSummaryExcerpt,
  findOrphans,
  findPath,
  suggestSimilarSlugs,
  vaultSlugExists,
  patchFrontmatter,
  updateDoc,
  writeDoc,
} from './vault.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ontology-atlas-vault-test-'));
  mkdirSync(join(root, 'capabilities'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '---\nslug: README\n---\n');
  writeFileSync(
    join(root, 'capabilities', 'auth.md'),
    '---\nslug: capabilities/auth\nkind: capability\n---\n',
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('canonicalDiskSlug', () => {
  it('returns an exact existing slug unchanged', () => {
    assert.equal(canonicalDiskSlug(root, 'capabilities/auth'), 'capabilities/auth');
    assert.equal(canonicalDiskSlug(root, 'README'), 'README');
  });

  it('resolves a wrong-case slug to the on-disk spelling, in file and directory segments', () => {
    assert.equal(canonicalDiskSlug(root, 'capabilities/Auth'), 'capabilities/auth');
    assert.equal(canonicalDiskSlug(root, 'Capabilities/AUTH'), 'capabilities/auth');
    assert.equal(canonicalDiskSlug(root, 'readme'), 'README');
  });

  it('returns null for a slug that matches nothing', () => {
    assert.equal(canonicalDiskSlug(root, 'capabilities/nope'), null);
    assert.equal(canonicalDiskSlug(root, ''), null);
    assert.equal(canonicalDiskSlug(root, null), null);
  });

  it('returns null for a slug escaping the vault (never throws)', () => {
    assert.equal(canonicalDiskSlug(root, '../etc/passwd'), null);
  });
});

describe('vaultSlugExists', () => {
  it('an existing top-level slug is true', () => {
    assert.equal(vaultSlugExists(root, 'README'), true);
  });

  it('an existing subdirectory slug is true', () => {
    assert.equal(vaultSlugExists(root, 'capabilities/auth'), true);
  });

  it('a missing slug is false', () => {
    assert.equal(vaultSlugExists(root, 'capabilities/nope'), false);
    assert.equal(vaultSlugExists(root, 'phantom'), false);
  });

  it('an empty, null or undefined slug is false (no throw)', () => {
    assert.equal(vaultSlugExists(root, ''), false);
    assert.equal(vaultSlugExists(root, null), false);
    assert.equal(vaultSlugExists(root, undefined), false);
  });

  it('a slug escaping the vault is false (no throw)', () => {
    assert.equal(vaultSlugExists(root, '../etc/passwd'), false);
    assert.equal(vaultSlugExists(root, '../../README'), false);
  });

  it('a null byte injection attempt is false', () => {
    assert.equal(vaultSlugExists(root, 'README\0evil'), false);
  });
});

describe('findPath — edge metadata (R+)', () => {
  let pathRoot;
  beforeEach(() => {
    pathRoot = mkdtempSync(join(tmpdir(), 'ontology-atlas-vault-path-'));
    mkdirSync(join(pathRoot, 'capabilities'), { recursive: true });
    mkdirSync(join(pathRoot, 'domains'), { recursive: true });
    mkdirSync(join(pathRoot, 'elements'), { recursive: true });
    // domain → contains → capability → elements (1 hop = capability, 2 hops = element)
    writeFileSync(
      join(pathRoot, 'project.md'),
      '---\nslug: project-display\nkind: project\ndomains: [identity]\ncapabilities: [auth]\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'domains', 'identity.md'),
      '---\nslug: domains/identity\nkind: domain\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'capabilities', 'auth.md'),
      '---\nslug: capabilities/auth\nkind: capability\ndomain: identity\nelements: [token]\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'elements', 'token.md'),
      '---\nslug: elements/token\nkind: element\n---\n',
    );
  });
  afterEach(() => {
    rmSync(pathRoot, { recursive: true, force: true });
  });

  it('hops outnumber edges by one, with via named between every hop', () => {
    const r = findPath(pathRoot, 'project', 'elements/token');
    assert.ok(r);
    assert.deepEqual(r.hops, ['project', 'capabilities/auth', 'elements/token']);
    assert.equal(r.edges.length, r.hops.length - 1);
    assert.deepEqual(r.edges[0], {
      from: 'project',
      to: 'capabilities/auth',
      via: 'capabilities',
    });
    assert.deepEqual(r.edges[1], {
      from: 'capabilities/auth',
      to: 'elements/token',
      via: 'elements',
    });
  });

  it('a trivial path (from === to) has empty edges', () => {
    const r = findPath(pathRoot, 'project', 'project');
    assert.deepEqual(r.hops, ['project']);
    assert.deepEqual(r.edges, []);
  });

  it('resolves domains[] project containment as a path edge', () => {
    const r = findPath(pathRoot, 'project', 'domains/identity');
    assert.ok(r, 'the project.domains[] path must exist');
    assert.deepEqual(r.hops, ['project', 'domains/identity']);
    assert.deepEqual(r.edges[0], {
      from: 'project',
      to: 'domains/identity',
      via: 'domains',
    });
  });

  it('resolves a frontmatter slug as an endpoint alias', () => {
    const r = findPath(pathRoot, 'project-display', 'domains/identity');
    assert.ok(r, 'the frontmatter slug alias path must exist');
    assert.deepEqual(r.hops, ['project', 'domains/identity']);
  });

  it('an ambiguous tail ref draws no edge — a path is never routed through an arbitrary match', () => {
    // capabilities/foo.md and elements/foo.md both exist, so `capabilities: [foo]`
    // is ambiguous and must not route a path through either.
    writeFileSync(
      join(pathRoot, 'capabilities', 'foo.md'),
      '---\nslug: capabilities/foo\nkind: capability\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'elements', 'foo.md'),
      '---\nslug: elements/foo\nkind: element\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'd1.md'),
      '---\nslug: d1\nkind: document\ncapabilities: [foo]\n---\n',
    );
    assert.equal(findPath(pathRoot, 'd1', 'capabilities/foo'), null);
    assert.equal(findPath(pathRoot, 'd1', 'elements/foo'), null);
  });

  it('an ambiguous ref keeps every candidate out of the orphan list', () => {
    writeFileSync(
      join(pathRoot, 'capabilities', 'foo.md'),
      '---\nslug: capabilities/foo\nkind: capability\ndomain: identity\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'elements', 'foo.md'),
      '---\nslug: elements/foo\nkind: element\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'd1.md'),
      '---\nslug: d1\nkind: document\ncapabilities: [foo]\n---\n',
    );
    const orphanSlugs = findOrphans(pathRoot).orphans.map((row) => row.slug);
    assert.equal(orphanSlugs.includes('capabilities/foo'), false);
    assert.equal(orphanSlugs.includes('elements/foo'), false);
  });

  it('resolves an inline domain: parent as a path edge', () => {
    const r = findPath(pathRoot, 'capabilities/auth', 'domains/identity');
    assert.ok(r, 'the capability.domain path must exist');
    assert.deepEqual(r.hops, ['capabilities/auth', 'domains/identity']);
    assert.deepEqual(r.edges[0], {
      from: 'capabilities/auth',
      to: 'domains/identity',
      via: 'domain',
    });
  });

  it('edges carry the stored relation_notes sentence as `rationale`, and omit the key without one', () => {
    writeFileSync(
      join(pathRoot, 'capabilities', 'auth.md'),
      '---\nslug: capabilities/auth\nkind: capability\ndomain: identity\nelements: [token]\n' +
        'relation_notes: { token: "Auth mints the token, so a token format change is an auth change." }\n---\n',
    );
    const withNote = findPath(pathRoot, 'capabilities/auth', 'elements/token');
    assert.deepEqual(withNote.edges, [
      {
        from: 'capabilities/auth',
        to: 'elements/token',
        via: 'elements',
        rationale: 'Auth mints the token, so a token format change is an auth change.',
      },
    ]);
    // The note explains the pair, so it rides along whichever way BFS walked it.
    const reversed = findPath(pathRoot, 'elements/token', 'capabilities/auth');
    assert.equal(reversed.edges[0].rationale, withNote.edges[0].rationale);
    // A hop without a note has no `rationale` key at all, never null.
    const withoutNote = findPath(pathRoot, 'project', 'capabilities/auth');
    assert.deepEqual(withoutNote.edges, [{ from: 'project', to: 'capabilities/auth', via: 'capabilities' }]);
    assert.equal('rationale' in withoutNote.edges[0], false);
  });

  it('a note keyed by the full slug is found when the array holds the tail alias', () => {
    writeFileSync(
      join(pathRoot, 'capabilities', 'auth.md'),
      '---\nslug: capabilities/auth\nkind: capability\ndomain: identity\nelements: [token]\n' +
        'relation_notes: { elements/token: "Keyed by the resolved slug." }\n---\n',
    );
    const r = findPath(pathRoot, 'capabilities/auth', 'elements/token');
    assert.equal(r.edges[0].rationale, 'Keyed by the resolved slug.');
  });

  it('core also validates maxHops as a non-negative integer up to 20', () => {
    assert.throws(
      () => findPath(pathRoot, 'project', 'elements/token', -1),
      /maxHops must be a non-negative integer/,
    );
    assert.throws(
      () => findPath(pathRoot, 'project', 'elements/token', 1.5),
      /maxHops must be a non-negative integer/,
    );
    assert.throws(
      () => findPath(pathRoot, 'project', 'elements/token', 21),
      /maxHops must be <= 20/,
    );
  });
});

describe('findOrphans — graph frontmatter keys', () => {
  let orphanRoot;
  beforeEach(() => {
    orphanRoot = mkdtempSync(join(tmpdir(), 'ontology-atlas-vault-orphans-'));
    mkdirSync(join(orphanRoot, 'capabilities'), { recursive: true });
    mkdirSync(join(orphanRoot, 'domains'), { recursive: true });
    writeFileSync(
      join(orphanRoot, 'project.md'),
      '---\nslug: project\nkind: project\ndomains: [identity]\n---\n',
    );
    writeFileSync(
      join(orphanRoot, 'domains', 'identity.md'),
      '---\nslug: domains/identity\nkind: domain\n---\n',
    );
    writeFileSync(
      join(orphanRoot, 'capabilities', 'auth.md'),
      '---\nslug: capabilities/auth\nkind: capability\ndomain: identity\n---\n',
    );
  });
  afterEach(() => {
    rmSync(orphanRoot, { recursive: true, force: true });
  });

  it('orphan detection honours domains[] and inline domain: references', () => {
    const result = findOrphans(orphanRoot, { kind: 'domain' });
    assert.equal(
      result.orphans.some((node) => node.slug === 'domains/identity'),
      false,
    );
  });

  it('project and vault-readme root documents are excluded from default orphan cleanup candidates', () => {
    writeFileSync(
      join(orphanRoot, 'README.md'),
      '---\nkind: vault-readme\ntitle: README\n---\n',
    );
    const result = findOrphans(orphanRoot);
    assert.equal(result.orphans.some((node) => node.kind === 'project'), false);
    assert.equal(result.orphans.some((node) => node.kind === 'vault-readme'), false);

    const explicit = findOrphans(orphanRoot, { excludeKinds: [] });
    assert.equal(explicit.orphans.some((node) => node.kind === 'project'), true);
    assert.equal(explicit.orphans.some((node) => node.kind === 'vault-readme'), true);
  });
});

describe('suggestSimilarSlugs (R+)', () => {
  let suggestRoot;
  beforeEach(() => {
    suggestRoot = mkdtempSync(join(tmpdir(), 'ontology-atlas-vault-suggest-'));
    mkdirSync(join(suggestRoot, 'capabilities'), { recursive: true });
    mkdirSync(join(suggestRoot, 'domains'), { recursive: true });
    writeFileSync(
      join(suggestRoot, 'capabilities', 'mcp-server.md'),
      '---\nslug: capabilities/mcp-server\nkind: capability\n---\n',
    );
    writeFileSync(
      join(suggestRoot, 'capabilities', 'mcp-conflict-guard.md'),
      '---\nslug: capabilities/mcp-conflict-guard\nkind: capability\n---\n',
    );
    writeFileSync(
      join(suggestRoot, 'domains', 'ai-agent-partner.md'),
      '---\nslug: domains/ai-agent-partner\nkind: domain\n---\n',
    );
  });
  afterEach(() => {
    rmSync(suggestRoot, { recursive: true, force: true });
  });

  it('an exact tail match ranks first', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'mcp-server');
    assert.deepEqual(r[0], 'capabilities/mcp-server');
  });

  it('suggests disk slugs without opening unrelated document contents', () => {
    const original = fs.openSync;
    fs.openSync = () => { throw new Error('Suggestion must not open document contents'); };
    syncBuiltinESMExports();
    try {
      assert.deepEqual(suggestSimilarSlugs(suggestRoot, 'mcp-server'), ['capabilities/mcp-server']);
    } finally {
      fs.openSync = original;
      syncBuiltinESMExports();
    }
  });

  it('a substring match covers a partial slug', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'mcp');
    assert.ok(r.includes('capabilities/mcp-server'));
    assert.ok(r.includes('capabilities/mcp-conflict-guard'));
  });

  it('nothing similar yields an empty array', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'totally-unrelated-xyz');
    assert.deepEqual(r, []);
  });

  it('honours limit (default 3)', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'a', 2);
    assert.ok(r.length <= 2);
  });

  it('an empty or null badSlug yields an empty array', () => {
    assert.deepEqual(suggestSimilarSlugs(suggestRoot, ''), []);
    assert.deepEqual(suggestSimilarSlugs(suggestRoot, null), []);
  });
});

describe('actionable error messages', () => {
  let errRoot;
  beforeEach(() => {
    errRoot = mkdtempSync(join(tmpdir(), 'ontology-atlas-vault-err-'));
    mkdirSync(join(errRoot, 'capabilities'), { recursive: true });
    writeFileSync(
      join(errRoot, 'capabilities', 'mcp-server.md'),
      '---\nslug: capabilities/mcp-server\nkind: capability\n---\n',
    );
  });
  afterEach(() => {
    rmSync(errRoot, { recursive: true, force: true });
  });

  it('writeDoc duplicate slug recommends patch_concept and names the rename option', () => {
    let caught;
    try {
      writeDoc(errRoot, 'capabilities/mcp-server', {
        frontmatter: { slug: 'capabilities/mcp-server', kind: 'capability', title: 'X' },
      });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'should throw');
    assert.match(caught.message, /already exists/);
    assert.match(caught.message, /patch_concept/);
    assert.match(caught.message, /rename_concept/);
  });

  it('deleteDoc not-found (substring-similar slug) lists similar slug candidates', () => {
    let caught;
    try {
      deleteDoc(errRoot, 'capabilities/mcp-server-x');
    } catch (e) {
      caught = e;
    }
    assert.ok(caught);
    assert.match(caught.message, /not found/i);
    assert.match(caught.message, /list_concepts/);
    assert.match(caught.message, /capabilities\/mcp-server/);
  });

  it('deleteDoc not-found (nothing similar) points only to the list_concepts fallback', () => {
    let caught;
    try {
      deleteDoc(errRoot, 'totally/unrelated-xyz');
    } catch (e) {
      caught = e;
    }
    assert.ok(caught);
    assert.match(caught.message, /not found/i);
    assert.match(caught.message, /list_concepts/);
  });
});

describe('UID identity write gate', () => {
  const uidA = '01890f3e-7b5d-4c0a-8f14-123456789abc';
  const uidB = '11890f3e-7b5d-4c0a-8f14-123456789abc';

  /**
   * A node typed straight into an editor, with no `uid:`. Not through writeDoc,
   * which demands identity, so the state could not exist otherwise.
   */
  const handWrite = (slug, title) => {
    const filePath = join(root, `${slug}.md`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(
      filePath,
      `---\nkind: capability\nslug: ${slug}\ntitle: ${title}\n---\n\n# ${title}\n`,
      'utf-8',
    );
  };

  it('known-kind create requires one valid unique UID', () => {
    assert.throws(
      () => writeDoc(root, 'capabilities/missing-uid', {
        frontmatter: { slug: 'capabilities/missing-uid', kind: 'capability', title: 'Missing' },
      }),
      /uid/i,
    );
    writeDoc(root, 'capabilities/first', {
      frontmatter: { uid: uidA, slug: 'capabilities/first', kind: 'capability', title: 'First' },
    });
    assert.throws(
      () => writeDoc(root, 'capabilities/collision', {
        frontmatter: { uid: uidA, slug: 'capabilities/collision', kind: 'capability', title: 'Collision' },
      }),
      /already belongs|collision|UID/i,
    );
  });

  it('generic patch/update cannot change, remove, or forge merged identities', () => {
    writeDoc(root, 'capabilities/identity', {
      frontmatter: { uid: uidA, slug: 'capabilities/identity', kind: 'capability', title: 'Identity' },
    });
    assert.throws(() => patchFrontmatter(root, 'capabilities/identity', { uid: uidB }), /immutable|uid/i);
    assert.throws(() => patchFrontmatter(root, 'capabilities/identity', { uid: null }), /immutable|uid/i);
    assert.throws(
      () => updateDoc(root, 'capabilities/identity', { frontmatter: { merged_uids: [uidB] } }),
      /merge_concepts|merged_uids/i,
    );
  });

  /**
   * Filling an absent identity is not changing one. A hand-written node has
   * no `uid:` and stops every graph command, and patch, set-uid and add each refused
   * to repair it. Theft of another node's identity stays blocked
   * by `assertNodeIdentity`'s collision check.
   */
  it('the first write mints a uid for a node without one, recovering a hand-written node', () => {
    handWrite('capabilities/hand-written', 'Hand written');
    // ① An ordinary patch of another field fills it.
    const patched = patchFrontmatter(root, 'capabilities/hand-written', {
      description: 'now repaired',
    });
    assert.ok(patched.frontmatter.uid, 'the uid was not filled');
    assert.equal(nodeUidIssue(patched.frontmatter.uid), null);
    assert.equal(patched.mintedUid, patched.frontmatter.uid, 'the response must say it filled the uid');

    // ② Once filled it is immutable again.
    const settled = patched.frontmatter.uid;
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/hand-written', { uid: uidB }),
      /immutable|uid/i,
    );
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/hand-written', { uid: null }),
      /immutable|uid/i,
    );

    // ③ The caller may supply the value (an agent minting its own UUID).
    handWrite('capabilities/hand-written-2', 'HW2');
    const filled = patchFrontmatter(root, 'capabilities/hand-written-2', { uid: uidB });
    assert.equal(filled.frontmatter.uid, uidB);

    // ④ Taking another node's identity is still blocked.
    handWrite('capabilities/hand-written-3', 'HW3');
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/hand-written-3', { uid: settled }),
      /already belongs|collision/i,
    );
  });
});

describe('extractSummaryExcerpt (R+)', () => {
  it('prose first: the first paragraph as is', () => {
    const body = '`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 16 도구 노출.\n\n다음 단락은 무시.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 16 도구 노출.');
  });

  it('H1, blank line, prose: skips the H1 and keeps only the prose', () => {
    const body = '\n# MCP Server (16 tools)\n\n`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버.\n';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버.');
  });

  it('H1, table, prose: skips the table and keeps only the prose (a dogfood pattern like mcp-server)', () => {
    const body = '\n# MCP Server\n\n| col1 | col2 |\n|---|---|\n| a | b |\n\n환경변수 설정 후 사용.\n';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '환경변수 설정 후 사용.');
  });

  it('code block then prose: skips the code and keeps only the prose', () => {
    const body = '```js\nconst x = 1;\nconst y = 2;\n```\n\nprose paragraph.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, 'prose paragraph.');
  });

  it('multi-line prose is joined into one line', () => {
    const body = '첫 줄.\n둘째 줄.\n셋째 줄.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '첫 줄. 둘째 줄. 셋째 줄.');
  });

  it('an empty or null body yields an empty string', () => {
    assert.equal(extractSummaryExcerpt(''), '');
    assert.equal(extractSummaryExcerpt(null), '');
    assert.equal(extractSummaryExcerpt(undefined), '');
  });

  it('a body of blocks only falls back to the trimmed original (no prose)', () => {
    const body = '| a | b |\n|---|---|\n| 1 | 2 |';
    const r = extractSummaryExcerpt(body);
    assert.match(r, /\|/);
  });

  it('maxLen cap appends … when exceeded', () => {
    const long = 'a'.repeat(900);
    const r = extractSummaryExcerpt(long, 800);
    assert.equal(r.length, 801); // 800 + '…'
    assert.ok(r.endsWith('…'));
  });

  it('treats lists and quotes as blocks (-, *, ordered, >)', () => {
    const body = '- item 1\n- item 2\n\n뒤에 오는 prose.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '뒤에 오는 prose.');
  });

  it('does not mistake an ordered list for prose and uses the next description paragraph', () => {
    const body = '1. first step\n2) second step\n\nActual explanatory paragraph.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, 'Actual explanatory paragraph.');
  });

  it('uses the next prose instead of an image or thematic break', () => {
    const body = '![diagram](./graph.png)\n\n---\n\nActual summary after visual lead.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, 'Actual summary after visual lead.');
  });
});

describe('describeBodyDelivery says a truncated body is truncated', () => {
  // A body with what the construction rules demand; the excerpt takes only the
  // first paragraph.
  const RULED_BODY = [
    '## 정의',
    '',
    '워크스페이스 안에서 앱을 만드는 능력.',
    '',
    '## 근거',
    '',
    '- `app/src/main.ts`',
    '- `app/src/editor/index.ts`',
    '',
    '## 확신도',
    '',
    '높음 — 두 경로를 직접 열어 확인했다.',
  ].join('\n');

  it('excerpt mode also states the original length and the characters withheld', () => {
    const { text, info } = describeBodyDelivery(RULED_BODY, { maxLen: 200 });
    assert.equal(text, '워크스페이스 안에서 앱을 만드는 능력.');
    assert.equal(info.mode, 'excerpt');
    assert.equal(info.totalChars, RULED_BODY.length);
    assert.equal(info.truncated, true);
    assert.ok(info.omittedChars > 0);
  });

  it('carries a hint only when truncated, never on an intact response', () => {
    const withHint = describeBodyDelivery(RULED_BODY, { hint: 'call X' });
    assert.equal(withHint.info.hint, 'call X');
    const whole = describeBodyDelivery('한 단락짜리 본문.', { hint: 'call X' });
    assert.equal(whole.info.truncated, false);
    assert.equal(whole.info.hint, undefined);
    assert.equal(whole.info.omittedChars, undefined);
  });

  it('a paragraph differing only in line breaks is not truncated (a character-count false positive)', () => {
    // An excerpt joins lines with spaces, so its length differs from the original
    // without anything being cut.
    const body = '\n첫 줄.\n둘째 줄.\n';
    const { info } = describeBodyDelivery(body);
    assert.equal(info.truncated, false);
  });

  it('full mode returns the whole body as is', () => {
    const { text, info } = describeBodyDelivery(RULED_BODY, { mode: 'full' });
    assert.equal(text, RULED_BODY);
    assert.equal(info.mode, 'full');
    assert.equal(info.truncated, false);
    assert.equal(info.returnedChars, RULED_BODY.length);
  });

  it('full mode also says truncated past the cap', () => {
    const huge = 'x'.repeat(FULL_BODY_MAX_CHARS + 500);
    const { text, info } = describeBodyDelivery(huge, { mode: 'full', hint: 'read the file' });
    assert.equal(text.length, FULL_BODY_MAX_CHARS);
    assert.equal(info.truncated, true);
    assert.equal(info.omittedChars, 500);
    assert.equal(info.hint, 'read the file');
  });

  it('an empty body is not truncated', () => {
    const { text, info } = describeBodyDelivery('');
    assert.equal(text, '');
    assert.equal(info.truncated, false);
    assert.equal(info.totalChars, 0);
  });
});

describe('detectDuplicateTitle', () => {
  const docs = [
    { slug: 'capabilities/mcp-server', frontmatter: { title: 'MCP Server', kind: 'capability' } },
    { slug: 'domains/views', frontmatter: { name: 'Views', kind: 'domain' } },
  ];

  it('a normalized-equal title (case or whitespace) warns with the existing slug and a patch hint', () => {
    const w = detectDuplicateTitle('  mcp   server ', 'capabilities/new-mcp', docs);
    assert.ok(w, 'expected a duplicate warning');
    assert.match(w, /capabilities\/mcp-server/);
    assert.match(w, /patch_concept/);
  });

  it('a different title returns null (no false warning)', () => {
    assert.equal(detectDuplicateTitle('Topology Engine', 'capabilities/topo', docs), null);
  });

  it('the same slug (itself) is not a duplicate', () => {
    assert.equal(detectDuplicateTitle('MCP Server', 'capabilities/mcp-server', docs), null);
  });

  it('also matches the frontmatter.name fallback', () => {
    const w = detectDuplicateTitle('views', 'domains/new-views', docs);
    assert.ok(w);
    assert.match(w, /domains\/views/);
  });

  it('an empty or whitespace title returns null', () => {
    assert.equal(detectDuplicateTitle('   ', 'x', docs), null);
    assert.equal(detectDuplicateTitle('', 'x', docs), null);
  });

  it('empty docs return null', () => {
    assert.equal(detectDuplicateTitle('MCP Server', 'x', []), null);
  });
});

/**
 * add_concept fills the starter scaffold when no body is passed. The write still
 * succeeds (construction rule 5), the reader is told what is owed, and writing
 * it clears the finding.
 */
describe('write-time meaning findings — the default body is reported, a written one is not', () => {
  beforeEach(() => {
    resetNodeEligibilityGate();
    mkdirSync(join(root, 'domains'), { recursive: true });
    writeFileSync(
      join(root, 'domains', 'vault.md'),
      '---\nuid: 11111111-1111-4111-8111-111111111111\nslug: domains/vault\nkind: domain\ntitle: Vault\n---\n',
    );
  });

  afterEach(() => {
    resetNodeEligibilityGate();
  });

  it('a capability created with the starter body is told its body is still a label', () => {
    const filePath = writeDoc(root, 'capabilities/folder-access', {
      frontmatter: {
        uid: '22222222-2222-4222-8222-222222222222',
        slug: 'capabilities/folder-access',
        kind: 'capability',
        title: 'Folder Access',
        domain: 'domains/vault',
        path: 'README.md',
      },
      body: defaultBody('capability', 'Folder Access'),
    });
    // Never blocked: the file is on disk with the scaffold.
    assert.ok(filePath.endsWith('capabilities/folder-access.md'));
    const codes = drainNodeEligibilityFindings()
      .filter((finding) => finding.slug === 'capabilities/folder-access')
      .map((finding) => finding.code)
      .sort();
    assert.deepEqual(codes, ['boundary-missing', 'boundary-missing', 'definition-missing', 'uncertainty-missing']);
  });

  it('patching in a written body clears them — the gate does not keep accusing a repaired node', () => {
    writeDoc(root, 'capabilities/folder-access', {
      frontmatter: {
        uid: '33333333-3333-4333-8333-333333333333',
        slug: 'capabilities/folder-access',
        kind: 'capability',
        title: 'Folder Access',
        domain: 'domains/vault',
        path: 'README.md',
      },
      body: defaultBody('capability', 'Folder Access'),
    });
    drainNodeEligibilityFindings();
    // A fresh ledger, so the silence below is the body's doing, not the notice rule.
    resetNodeEligibilityGate();
    updateDoc(root, 'capabilities/folder-access', {
      body: [
        '# Folder Access',
        '',
        'Opens one Markdown folder on the person\'s own disk and keeps reading it as',
        'the graph, so no part of the ontology waits on a server.',
        '',
        '## Includes',
        '',
        '- Choosing the folder and remembering the handle between sessions.',
        '',
        '## Excludes',
        '',
        '- Copying that folder anywhere else; team sync is a separate layer.',
        '',
        '## Uncertainty',
        '',
        '- The Safari fallback was inferred from the feature check, not exercised.',
        '',
      ].join('\n'),
    });
    const codes = drainNodeEligibilityFindings().map((finding) => finding.code);
    assert.equal(codes.includes('definition-missing'), false, codes.join(', '));
    assert.equal(codes.includes('boundary-missing'), false, codes.join(', '));
    assert.equal(codes.includes('uncertainty-missing'), false, codes.join(', '));
  });
});
