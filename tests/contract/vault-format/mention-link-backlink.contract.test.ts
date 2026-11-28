import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildDocLinkMarkdown,
  relativeDocPath,
} from '../../../src/widgets/docs-vault/lib/relative-doc-path';
import { callServerTool } from '../server-session/call-server-tool';

/**
 * The web mention link and the server's `find_backlinks` are decided by code that knows nothing of
 * each other, so the web function writes into a temporary vault and the server is asked over stdio
 * about the same folder. The `./` prefix is what makes a same-folder link match the body needles.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-mention-link-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

interface BacklinkMatch {
  slug: string;
  matchedKeys?: string[];
  matchedInBody?: boolean;
}

async function backlinksOf(slug: string): Promise<BacklinkMatch[]> {
  const answer = await callServerTool(root, 'find_backlinks', { slug });
  expect(answer.isError, String(answer.value)).toBe(false);
  return (answer.value as { matches: BacklinkMatch[] }).matches;
}

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

describe('an agent finds the body link a mention wrote through backlinks', () => {
  /**
   * The relative-path shape differs per folder layout (`../a/b.md`, `./b.md`,
   * `a/b.md`). Measuring one shape leaves the others quietly broken.
   */
  const layouts = [
    { name: 'a different folder', from: 'domains/src', to: 'capabilities/tgt' },
    { name: 'the same folder', from: 'capabilities/src', to: 'capabilities/tgt' },
    { name: 'from the root into a folder', from: 'ROOT-DOC', to: 'capabilities/tgt' },
    { name: 'from a deep folder', from: 'guides/deep/src', to: 'capabilities/tgt' },
    { name: 'a Hangul slug', from: 'domains/src', to: 'capabilities/한글-대상' },
  ] as const;

  for (const layout of layouts) {
    it(`${layout.name}: both the relation and the body link are caught`, async () => {
      const link = writeMentionPair(layout.from, layout.to);
      const matches = await backlinksOf(layout.to);
      const hit = matches.find(
        (m: { slug: string }) => m.slug === layout.from,
      ) as { matchedKeys?: string[]; matchedInBody?: boolean } | undefined;

      expect(hit, `${layout.from} is not in the backlinks (link: ${link})`).toBeTruthy();
      if (!hit) return;
      // ① The fact — caught via the frontmatter relation
      expect(hit.matchedKeys, `the relation was not caught (link: ${link})`).toContain('relates');
      // ② The path — also caught via the body link. If this is false the agent cannot
      //    see "mentioned in the prose" and loses the context a person wrote.
      expect(
        hit.matchedInBody,
        `The server's needle did not find the body link; when the notation changes, check this seam too. ` +
          `Link: ${link}`,
      ).toBe(true);
    });
  }

  /**
   * Idling guard — when the tests above say "found", this confirms the detection
   * really came from the body. The same document without the body link must have no
   * `matchedInBody`.
   */
  it('the instrument is alive: with no body link there is no body hit either', async () => {
    writeNode('capabilities/tgt', `uid: ${UID}\nslug: capabilities/tgt\nkind: capability\ntitle: 타깃`);
    writeNode(
      'domains/src',
      `uid: ${UID2}\nslug: domains/src\nkind: capability\ntitle: 출처\nrelates: [capabilities/tgt]`,
      '본문에는 링크가 없다.',
    );
    const hit = (await backlinksOf('capabilities/tgt')).find(
      (m: { slug: string }) => m.slug === 'domains/src',
    ) as { matchedKeys?: string[]; matchedInBody?: boolean } | undefined;
    expect(hit).toBeTruthy();
    if (!hit) return;
    expect(hit.matchedKeys).toContain('relates');
    expect(hit.matchedInBody, 'a body hit appeared though the body has no link, so the detection spins idle').toBeUndefined();
  });

  /**
   * Pins what this contract actually depends on: **the slash before the filename.**
   * The server's path-shaped needle is `/slug.md`, so a same-folder link written without
   * `./` does not match. Adding `./` today is the contract, not a coincidence.
   */
  it("in every arrangement there is a slash before the file name, a premise of the server's needle", () => {
    for (const layout of layouts) {
      const href = relativeDocPath(layout.from, layout.to);
      const tail = layout.to.split('/').pop();
      expect(href, `${layout.name}: "/${tail}.md" is not in ${href}`).toContain(`/${tail}.md`);
    }
  });
});
