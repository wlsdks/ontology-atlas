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
 * **화면이 쓴 링크를 에이전트가 읽는다** — 두 패키지를 가로지르는 이음새.
 *
 * 에디터의 `@` 멘션은 두 가지를 쓴다: frontmatter 의 관계(사실)와 본문의 표준
 * 마크다운 링크(사람이 눌러 갈 길). 그 본문 표기를 **MCP 의 `find_backlinks`
 * 가 알아보는지**는 두 코드가 서로를 모르는 채 정해진다 — 웹은
 * `relative-doc-path.ts` 가 만들고, MCP 는 `vault.mjs` 의 본문 바늘
 * (`[[슬러그]]` · `(슬러그.md)` · `/슬러그.md`)이 찾는다.
 *
 * ## 왜 계약 테스트인가
 *
 * 본문 표기를 **2026-08-08 하루에 세 번 바꿨다** — 평문 → 위키링크 → 표준
 * 링크(각각 소유자 지적으로). 그때마다 「에이전트가 이걸 아직 찾나」는 아무도
 * 안 물었다. 실제로 답이 바뀔 수 있었다: 만약 같은 폴더 링크를 `./` 없이
 * `[이름](tgt.md)` 로 썼다면 세 바늘 중 어느 것에도 안 걸린다(`/tgt.md` 의
 * 슬래시가 없다). 지금은 `./` 를 붙여서 걸리는데, **그 사실이 우연처럼
 * 보이면 다음 사람이 지운다.**
 *
 * 그래서 논리를 베끼지 않고 **실제 두 함수를 같은 임시 볼트에 붙여** 잰다.
 * 어느 쪽이 바뀌어도 여기서 먼저 터진다.
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

/** `@` 멘션이 실제로 만드는 문서 한 쌍 — 관계는 frontmatter, 링크는 본문. */
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
   * 폴더 배치마다 상대 경로 모양이 달라진다(`../a/b.md` · `./b.md` ·
   * `a/b.md`). 하나만 재면 나머지 모양에서 조용히 깨진다.
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
      // ① 사실 — frontmatter 관계로 잡힌다
      expect(hit.matchedKeys, `관계가 안 잡혔다 (링크: ${link})`).toContain('relates');
      // ② 길 — 본문 링크로도 잡힌다. 이게 false 면 에이전트는 「글에서
      //    언급됐다」를 못 보고, 사람이 쓴 문맥을 잃는다.
      expect(
        hit.matchedInBody,
        `본문 링크를 MCP 의 바늘이 못 찾았다 — 표기를 바꿀 때 이 이음새를 같이 봐야 한다. ` +
          `링크: ${link}`,
      ).toBe(true);
    });
  }

  /**
   * 공회전 차단 — 위 시험들이 「찾았다」를 말할 때, 그 탐지가 정말 본문을 보고
   * 있는지 확인한다. 본문 링크를 뺀 같은 문서는 `matchedInBody` 가 없어야 한다.
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
   * 이 계약이 실제로 무엇에 기대는지 못박는다: **파일 이름 앞의 슬래시.**
   * MCP 의 바늘 중 경로형은 `/슬러그.md` 이므로, 같은 폴더 링크를 `./` 없이
   * 쓰면 걸리지 않는다. 지금 `./` 를 붙이는 것이 우연이 아니라 계약이다.
   */
  it('모든 배치에서 파일 이름 앞에 슬래시가 있다 — MCP 바늘의 전제', () => {
    for (const layout of layouts) {
      const href = relativeDocPath(layout.from, layout.to);
      const tail = layout.to.split('/').pop();
      expect(href, `${layout.name}: ${href} 에 "/${tail}.md" 가 없다`).toContain(`/${tail}.md`);
    }
  });
});
