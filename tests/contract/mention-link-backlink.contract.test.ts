import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findBacklinks } from '../../mcp/src/vault.mjs';
import {
  buildDocLinkMarkdown,
  relativeDocPath,
} from '../../src/widgets/docs-vault/lib/relative-doc-path';

/**
 * **The agent reads the link the screen wrote** — a seam across two packages.
 *
 * An editor `@` mention writes two things: a relation in frontmatter (the fact) and
 * a standard markdown link in the body (the path a person clicks). Whether **MCP's
 * `find_backlinks` recognises that body notation** is decided by two pieces of code
 * that know nothing of each other — the web side is produced by
 * `relative-doc-path.ts`, and MCP finds it with the body needles in `vault.mjs`
 * (`[[slug]]` · `(slug.md)` · `/slug.md`).
 *
 * **Why a contract test.** The body notation changed **three times in one day on
 * 2026-08-08** — plain text → wiki link → standard link (each on owner feedback).
 * Nobody asked "does the agent still find this" at any point, and the answer really
 * could have changed: a same-folder link written as `[name](tgt.md)` without `./`
 * matches none of the three needles (there is no slash for `/tgt.md`). Today the
 * `./` makes it match, and **if that fact looks accidental the next person removes
 * it.**
 *
 * So instead of copying the logic, **both real functions are pointed at the same
 * temporary vault**. A change on either side breaks here first.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-mention-link-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const UID = '01890f3e-7b5d-4c0a-8f14-123456789abc';
const UID2 = '11890f3e-7b5d-4c0a-8f14-123456789abc';

function writeNode(slug: string, frontmatter: string, body = '') {
  const file = join(root, `${slug}.md`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf-8');
}

/** The pair of documents an `@` mention really creates — the relation in frontmatter, the link in the body. */
function writeMentionPair(editingSlug: string, targetSlug: string) {
  writeNode(targetSlug, `uid: ${UID}\nslug: ${targetSlug}\nkind: capability\ntitle: 타깃`);
  const link = buildDocLinkMarkdown({ fromSlug: editingSlug, toSlug: targetSlug, label: '타깃' });
  writeNode(
    editingSlug,
    `uid: ${UID2}\nslug: ${editingSlug}\nkind: capability\ntitle: 출처\nrelates: [${targetSlug}]`,
    `이건 ${link} 에 기댄다.`,
  );
  return link;
}

describe('멘션이 쓴 본문 링크를 에이전트가 역참조로 찾는다', () => {
  /**
   * The relative-path shape differs per folder layout (`../a/b.md`, `./b.md`,
   * `a/b.md`). Measuring one shape leaves the others quietly broken.
   */
  const layouts = [
    { name: '다른 폴더', from: 'domains/src', to: 'capabilities/tgt' },
    { name: '같은 폴더', from: 'capabilities/src', to: 'capabilities/tgt' },
    { name: '루트에서 폴더로', from: 'ROOT-DOC', to: 'capabilities/tgt' },
    { name: '깊은 폴더에서', from: 'guides/deep/src', to: 'capabilities/tgt' },
    { name: '한글 슬러그', from: 'domains/src', to: 'capabilities/한글-대상' },
  ] as const;

  for (const layout of layouts) {
    it(`${layout.name} — 관계와 본문 링크가 모두 잡힌다`, () => {
      const link = writeMentionPair(layout.from, layout.to);
      const matches = findBacklinks(root, layout.to);
      const hit = matches.find(
        (m: { slug: string }) => m.slug === layout.from,
      ) as { matchedKeys?: string[]; matchedInBody?: boolean } | undefined;

      expect(hit, `${layout.from} 이 역참조에 없다 (링크: ${link})`).toBeTruthy();
      if (!hit) return;
      // ① The fact — caught via the frontmatter relation
      expect(hit.matchedKeys, `관계가 안 잡혔다 (링크: ${link})`).toContain('relates');
      // ② The path — also caught via the body link. If this is false the agent cannot
      //    see "mentioned in the prose" and loses the context a person wrote.
      expect(
        hit.matchedInBody,
        `본문 링크를 MCP 의 바늘이 못 찾았다 — 표기를 바꿀 때 이 이음새를 같이 봐야 한다. ` +
          `링크: ${link}`,
      ).toBe(true);
    });
  }

  /**
   * Idling guard — when the tests above say "found", this confirms the detection
   * really came from the body. The same document without the body link must have no
   * `matchedInBody`.
   */
  it('계기가 살아 있다 — 본문 링크가 없으면 본문 히트도 없다', () => {
    writeNode('capabilities/tgt', `uid: ${UID}\nslug: capabilities/tgt\nkind: capability\ntitle: 타깃`);
    writeNode(
      'domains/src',
      `uid: ${UID2}\nslug: domains/src\nkind: capability\ntitle: 출처\nrelates: [capabilities/tgt]`,
      '본문에는 링크가 없다.',
    );
    const hit = findBacklinks(root, 'capabilities/tgt').find(
      (m: { slug: string }) => m.slug === 'domains/src',
    ) as { matchedKeys?: string[]; matchedInBody?: boolean } | undefined;
    expect(hit).toBeTruthy();
    if (!hit) return;
    expect(hit.matchedKeys).toContain('relates');
    expect(hit.matchedInBody, '본문에 링크가 없는데 본문 히트가 났다 — 탐지가 헛돈다').toBeUndefined();
  });

  /**
   * Pins what this contract actually depends on: **the slash before the filename.**
   * MCP's path-shaped needle is `/slug.md`, so a same-folder link written without
   * `./` does not match. Adding `./` today is the contract, not a coincidence.
   */
  it('모든 배치에서 파일 이름 앞에 슬래시가 있다 — MCP 바늘의 전제', () => {
    for (const layout of layouts) {
      const href = relativeDocPath(layout.from, layout.to);
      const tail = layout.to.split('/').pop();
      expect(href, `${layout.name}: ${href} 에 "/${tail}.md" 가 없다`).toContain(`/${tail}.md`);
    }
  });
});
