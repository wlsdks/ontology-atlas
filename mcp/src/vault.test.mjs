import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { nodeUidIssue } from './schema.mjs';

import {
  FULL_BODY_MAX_CHARS,
  deleteDoc,
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

describe('vaultSlugExists', () => {
  it('실재하는 top-level slug 는 true', () => {
    assert.equal(vaultSlugExists(root, 'README'), true);
  });

  it('실재하는 subdir slug 는 true', () => {
    assert.equal(vaultSlugExists(root, 'capabilities/auth'), true);
  });

  it('없는 slug 는 false', () => {
    assert.equal(vaultSlugExists(root, 'capabilities/nope'), false);
    assert.equal(vaultSlugExists(root, 'phantom'), false);
  });

  it('빈 / null / undefined slug 는 false (throw 안 함)', () => {
    assert.equal(vaultSlugExists(root, ''), false);
    assert.equal(vaultSlugExists(root, null), false);
    assert.equal(vaultSlugExists(root, undefined), false);
  });

  it('vault 외부로 escape 시도하는 slug 는 false (throw 안 함)', () => {
    assert.equal(vaultSlugExists(root, '../etc/passwd'), false);
    assert.equal(vaultSlugExists(root, '../../README'), false);
  });

  it('null byte injection 시도는 false', () => {
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
    // domain → contains → capability → elements (1 hop = capability, 2 hop = element)
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

  it('hops 와 edges 는 길이가 1 차이 — 매 hop 사이 via 가 명시', () => {
    const r = findPath(pathRoot, 'project', 'elements/token');
    assert.ok(r, 'path 가 존재해야 한다');
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

  it('trivial path (from === to) 는 edges 가 빈 배열', () => {
    const r = findPath(pathRoot, 'project', 'project');
    assert.deepEqual(r.hops, ['project']);
    assert.deepEqual(r.edges, []);
  });

  it('domains[] project containment 도 path edge 로 해석', () => {
    const r = findPath(pathRoot, 'project', 'domains/identity');
    assert.ok(r, 'project.domains[] 경로가 존재해야 한다');
    assert.deepEqual(r.hops, ['project', 'domains/identity']);
    assert.deepEqual(r.edges[0], {
      from: 'project',
      to: 'domains/identity',
      via: 'domains',
    });
  });

  it('frontmatter slug 를 endpoint alias 로 해석', () => {
    const r = findPath(pathRoot, 'project-display', 'domains/identity');
    assert.ok(r, 'frontmatter slug alias 경로가 존재해야 한다');
    assert.deepEqual(r.hops, ['project', 'domains/identity']);
  });

  it('domain: inline parent 도 path edge 로 해석', () => {
    const r = findPath(pathRoot, 'capabilities/auth', 'domains/identity');
    assert.ok(r, 'capability.domain 경로가 존재해야 한다');
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
    // A hop without a note carries no `rationale` key at all — never null.
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

  it('maxHops 는 core 에서도 non-negative integer, max 20 으로 검증', () => {
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

  it('domains[] 와 domain: inline 참조를 orphan 판정에 반영', () => {
    const result = findOrphans(orphanRoot, { kind: 'domain' });
    assert.equal(
      result.orphans.some((node) => node.slug === 'domains/identity'),
      false,
    );
  });

  it('project / vault-readme 루트 문서는 기본 orphan cleanup 후보에서 제외', () => {
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

  it('tail 정확 일치가 최우선', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'mcp-server');
    assert.deepEqual(r[0], 'capabilities/mcp-server');
  });

  it('substring 매치 — 일부만 친 경우', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'mcp');
    assert.ok(r.includes('capabilities/mcp-server'));
    assert.ok(r.includes('capabilities/mcp-conflict-guard'));
  });

  it('전혀 안 비슷하면 빈 배열', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'totally-unrelated-xyz');
    assert.deepEqual(r, []);
  });

  it('limit 존중 (default 3)', () => {
    const r = suggestSimilarSlugs(suggestRoot, 'a', 2);
    assert.ok(r.length <= 2);
  });

  it('빈 / null badSlug 는 빈 배열', () => {
    assert.deepEqual(suggestSimilarSlugs(suggestRoot, ''), []);
    assert.deepEqual(suggestSimilarSlugs(suggestRoot, null), []);
  });
});

describe('actionable 에러 메시지 (R+)', () => {
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

  it('writeDoc duplicate slug — patch_concept 사용 권장 + rename 옵션 명시', () => {
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

  it('deleteDoc not-found (substring-similar slug) — 비슷한 slug 후보 노출', () => {
    let caught;
    try {
      // The bad slug contains 'mcp-server' as a substring, so candidates can match.
      deleteDoc(errRoot, 'capabilities/mcp-server-x');
    } catch (e) {
      caught = e;
    }
    assert.ok(caught);
    assert.match(caught.message, /not found/i);
    assert.match(caught.message, /list_concepts/);
    assert.match(caught.message, /capabilities\/mcp-server/);
  });

  it('deleteDoc not-found (전혀 안 비슷한 slug) — list_concepts fallback 안내만', () => {
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
   * Mimics a node a person typed straight into an editor — no `uid:`. The point is
   * that it does not use `writeDoc`: that door demands identity, so this state
   * cannot be created through it. Real users just make the file in Obsidian, vim,
   * or the GitHub web editor.
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
   * **Filling an absent identity for the first time is not changing an identity**
   * (2026-08-08).
   *
   * A node a person writes by hand in Obsidian or an editor has no `uid:`. In that
   * state **every graph command on the whole vault dies** (`overview`, `health`,
   * `agent-brief`, `query_ontology` — the compile stops on a node identity error).
   * Yet an agent carrying only Atlas MCP had **no door at all** to fix it:
   *
   * | attempt | old response |
   * |---|---|
   * | `patch_concept` (other fields, no uid) | "`uid:` must be a UUIDv4" |
   * | `patch_concept({uid: <new value>})` | "`uid:` is immutable" |
   * | `add_concept` (same slug) | "already exists; use patch" |
   *
   * The three pointed at each other in a closed loop. The cause: the immutability
   * check did not distinguish **changing a value that was there from filling one
   * that was not**. With no value to change, nothing is being changed — and the
   * theft risk (taking another node's identity) is already blocked separately by
   * the collision check in `assertNodeIdentity`.
   *
   * It is also a local-first promise problem: we say «you can just write the
   * markdown by hand», and then a hand-written node killed the vault with recovery
   * blocked.
   */
  it('uid 가 없던 노드는 첫 쓰기가 신원을 채워 준다 — 손으로 쓴 노드의 복구로', () => {
    // A file a person typed by hand in an editor — it does not go through `writeDoc`.
    // (Going through it would demand a uid, so this state could not exist at all.)
    handWrite('capabilities/hand-written', 'Hand written');
    // ① Filled even with no value supplied — an ordinary patch of another field revives it.
    const patched = patchFrontmatter(root, 'capabilities/hand-written', {
      description: 'now repaired',
    });
    assert.ok(patched.frontmatter.uid, 'uid 가 채워지지 않았다');
    assert.equal(nodeUidIssue(patched.frontmatter.uid), null);
    assert.equal(patched.mintedUid, patched.frontmatter.uid, '채운 사실을 응답이 말해야 한다');

    // ② Once filled it is immutable again — this repair must not pierce immutability.
    const settled = patched.frontmatter.uid;
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/hand-written', { uid: uidB }),
      /immutable|uid/i,
    );
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/hand-written', { uid: null }),
      /immutable|uid/i,
    );

    // ③ The caller may also supply the value directly (an agent that mints its own UUID).
    handWrite('capabilities/hand-written-2', 'HW2');
    const filled = patchFrontmatter(root, 'capabilities/hand-written-2', { uid: uidB });
    assert.equal(filled.frontmatter.uid, uidB);

    // ④ Filling in someone else's identity is still blocked — the collision check lives.
    handWrite('capabilities/hand-written-3', 'HW3');
    assert.throws(
      () => patchFrontmatter(root, 'capabilities/hand-written-3', { uid: settled }),
      /already belongs|collision/i,
    );
  });
});

describe('extractSummaryExcerpt (R+)', () => {
  it('prose 시작 — 첫 단락 그대로', () => {
    const body = '`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 16 도구 노출.\n\n다음 단락은 무시.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버. 16 도구 노출.');
  });

  it('H1 + 빈 줄 + prose — H1 skip 후 prose 만', () => {
    const body = '\n# MCP Server (16 tools)\n\n`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버.\n';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '`@modelcontextprotocol/sdk` 기반 stdio JSON-RPC 서버.');
  });

  it('H1 + 표 + prose — 표 skip 후 prose 만 (mcp-server 같은 dogfood pattern)', () => {
    const body = '\n# MCP Server\n\n| col1 | col2 |\n|---|---|\n| a | b |\n\n환경변수 설정 후 사용.\n';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '환경변수 설정 후 사용.');
  });

  it('코드블록 + prose — 코드 skip 후 prose 만', () => {
    const body = '```js\nconst x = 1;\nconst y = 2;\n```\n\nprose paragraph.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, 'prose paragraph.');
  });

  it('multi-line prose — 한 줄로 join', () => {
    const body = '첫 줄.\n둘째 줄.\n셋째 줄.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '첫 줄. 둘째 줄. 셋째 줄.');
  });

  it('빈 / null body — 빈 문자열', () => {
    assert.equal(extractSummaryExcerpt(''), '');
    assert.equal(extractSummaryExcerpt(null), '');
    assert.equal(extractSummaryExcerpt(undefined), '');
  });

  it('block 만 있는 body — fallback (원본 trim, prose 0건)', () => {
    const body = '| a | b |\n|---|---|\n| 1 | 2 |';
    const r = extractSummaryExcerpt(body);
    // Fallback when no prose is found — the whole body, within the cap
    assert.match(r, /\|/);
  });

  it('maxLen cap — 초과 시 … 부착', () => {
    const long = 'a'.repeat(900);
    const r = extractSummaryExcerpt(long, 800);
    assert.equal(r.length, 801); // 800 + '…'
    assert.ok(r.endsWith('…'));
  });

  it('list / 인용도 block 으로 인식 (-, *, ordered, > 모두)', () => {
    const body = '- item 1\n- item 2\n\n뒤에 오는 prose.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '뒤에 오는 prose.');
  });

  it('ordered list 는 prose 로 오인하지 않고 다음 설명 단락을 사용', () => {
    const body = '1. first step\n2) second step\n\nActual explanatory paragraph.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, 'Actual explanatory paragraph.');
  });

  it('이미지와 thematic break 는 설명문 대신 다음 prose 를 사용', () => {
    const body = '![diagram](./graph.png)\n\n---\n\nActual summary after visual lead.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, 'Actual summary after visual lead.');
  });
});

describe('describeBodyDelivery — 잘렸으면 잘렸다고 말한다 (2026-08-01)', () => {
  // A body carrying exactly what the construction rules demand: definition,
  // evidence, confidence, inclusion/exclusion. The excerpt takes only the first
  // paragraph, so every remaining section stays outside the response.
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

  it('발췌 모드에서도 원본 길이와 안 준 글자 수를 말한다', () => {
    const { text, info } = describeBodyDelivery(RULED_BODY, { maxLen: 200 });
    assert.equal(text, '워크스페이스 안에서 앱을 만드는 능력.');
    assert.equal(info.mode, 'excerpt');
    assert.equal(info.totalChars, RULED_BODY.length);
    assert.equal(info.truncated, true);
    assert.ok(info.omittedChars > 0);
  });

  it('잘렸을 때만 hint 를 싣는다 — 멀쩡한 응답에 안내문을 붙이지 않는다', () => {
    const withHint = describeBodyDelivery(RULED_BODY, { hint: 'call X' });
    assert.equal(withHint.info.hint, 'call X');
    const whole = describeBodyDelivery('한 단락짜리 본문.', { hint: 'call X' });
    assert.equal(whole.info.truncated, false);
    assert.equal(whole.info.hint, undefined);
    assert.equal(whole.info.omittedChars, undefined);
  });

  it('줄바꿈만 다른 한 단락은 잘린 것이 아니다 (글자 수 비교의 오탐)', () => {
    // An excerpt joins lines with spaces, so its length differs from the original.
    // Deciding "truncated" on that alone puts a false warning on every fully
    // delivered body.
    const body = '\n첫 줄.\n둘째 줄.\n';
    const { info } = describeBodyDelivery(body);
    assert.equal(info.truncated, false);
  });

  it('full 모드는 본문 전체를 그대로 돌려준다', () => {
    const { text, info } = describeBodyDelivery(RULED_BODY, { mode: 'full' });
    assert.equal(text, RULED_BODY);
    assert.equal(info.mode, 'full');
    assert.equal(info.truncated, false);
    assert.equal(info.returnedChars, RULED_BODY.length);
  });

  it('full 모드도 상한을 넘으면 잘렸다고 말한다', () => {
    const huge = 'x'.repeat(FULL_BODY_MAX_CHARS + 500);
    const { text, info } = describeBodyDelivery(huge, { mode: 'full', hint: 'read the file' });
    assert.equal(text.length, FULL_BODY_MAX_CHARS);
    assert.equal(info.truncated, true);
    assert.equal(info.omittedChars, 500);
    assert.equal(info.hint, 'read the file');
  });

  it('빈 본문 — 잘림 없음', () => {
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

  it('정규화 동일 title(대소문자/공백 차이) → 기존 slug + patch 안내 경고', () => {
    const w = detectDuplicateTitle('  mcp   server ', 'capabilities/new-mcp', docs);
    assert.ok(w, 'expected a duplicate warning');
    assert.match(w, /capabilities\/mcp-server/);
    assert.match(w, /patch_concept/);
  });

  it('다른 title → null (오경고 없음)', () => {
    assert.equal(detectDuplicateTitle('Topology Engine', 'capabilities/topo', docs), null);
  });

  it('같은 slug(자기 자신)은 중복으로 보지 않음', () => {
    assert.equal(detectDuplicateTitle('MCP Server', 'capabilities/mcp-server', docs), null);
  });

  it('frontmatter.name fallback 도 매칭', () => {
    const w = detectDuplicateTitle('views', 'domains/new-views', docs);
    assert.ok(w);
    assert.match(w, /domains\/views/);
  });

  it('빈/공백 title → null', () => {
    assert.equal(detectDuplicateTitle('   ', 'x', docs), null);
    assert.equal(detectDuplicateTitle('', 'x', docs), null);
  });

  it('빈 docs → null', () => {
    assert.equal(detectDuplicateTitle('MCP Server', 'x', []), null);
  });
});
