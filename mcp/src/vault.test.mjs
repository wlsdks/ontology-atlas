import { afterEach, beforeEach, describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  deleteDoc,
  extractSummaryExcerpt,
  findPath,
  suggestSimilarSlugs,
  vaultSlugExists,
  writeDoc,
} from './vault.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'omot-vault-test-'));
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
    pathRoot = mkdtempSync(join(tmpdir(), 'omot-vault-path-'));
    mkdirSync(join(pathRoot, 'capabilities'), { recursive: true });
    mkdirSync(join(pathRoot, 'elements'), { recursive: true });
    // domain → contains → capability → elements (1 hop = capability, 2 hop = element)
    writeFileSync(
      join(pathRoot, 'project.md'),
      '---\nslug: project\nkind: project\ncapabilities: [auth]\n---\n',
    );
    writeFileSync(
      join(pathRoot, 'capabilities', 'auth.md'),
      '---\nslug: capabilities/auth\nkind: capability\nelements: [token]\n---\n',
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
});

describe('suggestSimilarSlugs (R+)', () => {
  let suggestRoot;
  beforeEach(() => {
    suggestRoot = mkdtempSync(join(tmpdir(), 'omot-vault-suggest-'));
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
    errRoot = mkdtempSync(join(tmpdir(), 'omot-vault-err-'));
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
      // bad slug 가 'mcp-server' 를 substring 으로 포함 — 후보 매칭 가능.
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
    // prose 못 찾았을 때 fallback — body 전체 (cap 안)
    assert.match(r, /\|/);
  });

  it('maxLen cap — 초과 시 … 부착', () => {
    const long = 'a'.repeat(900);
    const r = extractSummaryExcerpt(long, 800);
    assert.equal(r.length, 801); // 800 + '…'
    assert.ok(r.endsWith('…'));
  });

  it('list / 인용도 block 으로 인식 (-, *, > 모두)', () => {
    const body = '- item 1\n- item 2\n\n뒤에 오는 prose.';
    const r = extractSummaryExcerpt(body);
    assert.equal(r, '뒤에 오는 prose.');
  });
});
