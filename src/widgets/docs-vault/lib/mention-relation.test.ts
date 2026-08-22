import { describe, expect, it } from 'vitest';

import {
  detectMentionTrigger,
  insertMentionRelation,
  MENTION_RELATIONS,
} from './mention-relation';

/**
 * The `@` mention holds one property: **choosing changes the graph.**
 *
 * The old `[[` wikilink did not. Adding and removing a wikilink in the same vault
 * left the compiled edge count and the graph hash identical (9 · `c07785b6`,
 * measured 2026-08-08). So these tests measure not 「does the menu appear」 but
 * **「does the frontmatter change」**. A menu that appears and changes nothing is
 * the same defect under a new name.
 */

const DOC = [
  '---',
  'uid: 11111111-2222-4333-8444-555555555555',
  'slug: capabilities/alpha',
  'kind: capability',
  'title: 알파',
  'domain: domains/orders',
  '---',
  '',
  '# 알파',
  '',
  '이 기능은 ',
].join('\n');

describe('detectMentionTrigger — 매칭이 없으면 평범한 글자로 남는다', () => {
  it('공백 뒤의 @ 를 잡고 질의어를 돌려준다', () => {
    const src = '이 기능은 @결제';
    const hit = detectMentionTrigger(src, src.length);
    expect(hit).toEqual({ query: '결제', start: src.indexOf('@') });
  });

  it('줄머리의 @ 도 잡는다', () => {
    const src = '@결제';
    expect(detectMentionTrigger(src, src.length)?.query).toBe('결제');
  });

  /**
   * With a local vault open, the docs vault can also edit `CLAUDE.md` and
   * `AGENTS.md`, and in those files `@AGENTS.md` is **real import syntax**. A menu
   * intruding there hijacks someone else's syntax.
   */
  it('경로 표기(@AGENTS.md · @docs/…)는 가로채지 않는다', () => {
    for (const src of ['@AGENTS.md', '읽어라 @docs/FOUNDATIONS.md', '@.claude/rules']) {
      const hit = detectMentionTrigger(src, src.length);
      // A query starting with `.` or `/` is not a trigger.
      expect(hit === null || !/^[/.]/.test(hit.query)).toBe(true);
    }
    // It withdraws **the moment a path character arrives**, not the moment it
    // becomes a path — a menu that appears and vanishes mid-typing leaves an Enter
    // in that flicker turning someone else's syntax into a node name.
    expect(detectMentionTrigger('@AGENTS', 7)).not.toBeNull(); // still an ordinary query
    expect(detectMentionTrigger('@AGENTS.md', 10)).toBeNull(); // the dot ends it
    expect(detectMentionTrigger('@docs/x', 7)).toBeNull();
  });

  it('이메일·핸들 중간의 @ 는 안 잡는다', () => {
    expect(detectMentionTrigger('me@example', 10)).toBeNull();
  });

  it('줄바꿈을 건너 잡지 않는다', () => {
    expect(detectMentionTrigger('@결제\n다음 줄', '@결제\n다음 줄'.length)).toBeNull();
  });
});

describe('insertMentionRelation — 본문은 문장, frontmatter 는 사실', () => {
  const trigger = (content: string) => {
    const caret = content.length;
    const hit = detectMentionTrigger(content, caret);
    if (!hit) throw new Error('트리거를 못 잡았다 — 시험 전제가 깨졌다');
    return hit;
  };

  it('관계가 frontmatter 에 canonical 로 들어가고 본문에는 이름만 남는다', () => {
    const content = `${DOC}@베`;
    const result = insertMentionRelation({
      content,
      editingSlug: 'capabilities/alpha',
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'dependencies',
    });

    expect(result.relationAdded).toBe(true);
    // ① The fact — frontmatter
    expect(result.content).toContain('dependencies: [capabilities/beta]');
    // ② The prose — the body gets **a notation you can click through**. Plain text
    //    looks as though nothing happened (owner report, 2026-08-08). The viewer,
    //    Obsidian and GitHub all read this notation as a link, so no format of our
    //    own is invented.
    expect(result.content).toContain('이 기능은 [베타](./beta.md)');
    expect(result.content).not.toContain('@베');
  });

  it('커서가 삽입한 이름 뒤에 선다 — frontmatter 가 길어진 만큼 밀려도', () => {
    const content = `${DOC}@베`;
    const result = insertMentionRelation({
      content,
      editingSlug: 'capabilities/alpha',
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'relates',
    });
    // The caret lands **after** the inserted notation — you have to be able to keep writing.
    expect(result.content.slice(result.caret - 1, result.caret)).toBe(')');
  });

  it('이미 있는 관계는 파일을 건드리지 않는다 (본문만 바뀐다)', () => {
    const withRelation = DOC.replace(
      'domain: domains/orders',
      'domain: domains/orders\nrelates: [capabilities/beta]',
    );
    const content = `${withRelation}@베`;
    const result = insertMentionRelation({
      content,
      editingSlug: 'capabilities/alpha',
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'relates',
    });
    expect(result.relationAdded).toBe(false);
    expect(result.content).toContain('relates: [capabilities/beta]');
    // A relation is written to the frontmatter **once**, however many body notations there are.
    const fm = result.content.slice(0, result.content.indexOf('---', 3));
    expect(fm.match(/capabilities\/beta/g)).toHaveLength(1);
    // The body gets a clickable notation (prose is written even when the link already exists).
    expect(result.content).toContain('[베타](./beta.md)');
  });

  /**
   * The sort rule is not redefined here — `non-canonical-graph-array` in
   * `validate-vault-document.ts` already requires «deduplicated plus localeCompare
   * sorted». Writing it differently would make the file we just wrote raise a
   * warning in our own check.
   */
  it('기존 항목이 있으면 정렬된 집합으로 합친다', () => {
    const withRelation = DOC.replace(
      'domain: domains/orders',
      'domain: domains/orders\nrelates: [capabilities/zeta, capabilities/alpha2]',
    );
    const content = `${withRelation}@베`;
    const result = insertMentionRelation({
      content,
      editingSlug: 'capabilities/alpha',
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'relates',
    });
    expect(result.content).toContain(
      'relates: [capabilities/alpha2, capabilities/beta, capabilities/zeta]',
    );
  });

  it('제목이 비면 슬러그를 본문에 쓴다 — 빈 글자를 남기지 않는다', () => {
    const content = `${DOC}@x`;
    const result = insertMentionRelation({
      content,
      editingSlug: 'capabilities/alpha',
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '   ' },
      relationId: 'contains',
    });
    // With no title, the slug becomes the label — no empty brackets are left behind.
    expect(result.content).toContain('이 기능은 [capabilities/beta](./beta.md)');
  });

  /**
   * **A node cannot link to itself** — and this assertion caught a real bug.
   *
   * 2026-08-08: at the call site, `const { doc, trigger } = pendingMention` shadowed
   * the component prop `doc` (the document being edited), so **the chosen target**
   * was passed as the base point. The base and destination then match and the link
   * comes out as `./같은폴더.md`. It was caught by measuring the screen, but with
   * this assertion in place it would have thrown **at the call**. An API that is
   * hard to misuse beats a comment.
   */
  it('편집 중 문서와 고른 문서가 같으면 거절한다', () => {
    const content = `${DOC}@알`;
    expect(() =>
      insertMentionRelation({
        content,
        editingSlug: 'capabilities/alpha',
        trigger: trigger(content),
        target: { slug: 'capabilities/alpha', title: '알파' },
        relationId: 'relates',
      }),
    ).toThrow(/itself|same document/i);
  });

  it('링크의 기준점은 **편집 중 문서**다 — 고른 문서가 아니다', () => {
    const content = `${DOC}@베`;
    const result = insertMentionRelation({
      content,
      // The document being edited is under domains/, the chosen one under capabilities/.
      editingSlug: 'domains/orders',
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'relates',
    });
    // Passing the wrong base point yields `./beta.md` (same folder), which does not resolve.
    expect(result.content).toContain('[베타](../capabilities/beta.md)');
  });

  it('네 방위 전부가 실재하는 frontmatter 키로 쓴다', () => {
    for (const relation of MENTION_RELATIONS) {
      const content = `${DOC}@베`;
      const result = insertMentionRelation({
        content,
        editingSlug: 'capabilities/alpha',
        trigger: trigger(content),
        target: { slug: 'capabilities/beta', title: '베타' },
        relationId: relation.id,
      });
      expect(result.content).toContain(`${relation.frontmatterKey}: [capabilities/beta]`);
    }
  });
});
