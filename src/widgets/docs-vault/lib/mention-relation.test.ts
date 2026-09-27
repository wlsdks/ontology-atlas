import { describe, expect, it } from 'vitest';

import {
  detectMentionTrigger,
  insertMentionRelation,
  MENTION_RELATIONS,
} from './mention-relation';

/** Choosing a mention must change frontmatter, not only show a menu. */

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

describe('detectMentionTrigger leaves plain text alone when nothing matches', () => {
  it('catches an @ after a space and returns the query', () => {
    const src = '이 기능은 @결제';
    const hit = detectMentionTrigger(src, src.length);
    expect(hit).toEqual({ query: '결제', start: src.indexOf('@') });
  });

  it('catches an @ at the start of a line', () => {
    const src = '@결제';
    expect(detectMentionTrigger(src, src.length)?.query).toBe('결제');
  });

  /**
   * In `CLAUDE.md` and `AGENTS.md`, `@AGENTS.md` is real import syntax the menu must not hijack.
   */
  it('does not capture path notation such as @AGENTS.md or @docs/', () => {
    for (const src of ['@AGENTS.md', '읽어라 @docs/FOUNDATIONS.md', '@.claude/rules']) {
      const hit = detectMentionTrigger(src, src.length);
      // A query starting with `.` or `/` is not a trigger.
      expect(hit === null || !/^[/.]/.test(hit.query)).toBe(true);
    }
    // Withdraws as soon as a path character arrives, or an Enter during the flicker turns another
    // syntax into a node name.
    expect(detectMentionTrigger('@AGENTS', 7)).not.toBeNull(); // still an ordinary query
    expect(detectMentionTrigger('@AGENTS.md', 10)).toBeNull(); // the dot ends it
    expect(detectMentionTrigger('@docs/x', 7)).toBeNull();
  });

  it('does not catch an @ inside an email or handle', () => {
    expect(detectMentionTrigger('me@example', 10)).toBeNull();
  });

  it('does not match across a line break', () => {
    expect(detectMentionTrigger('@결제\n다음 줄', '@결제\n다음 줄'.length)).toBeNull();
  });
});

describe('insertMentionRelation writes prose to the body and facts to frontmatter', () => {
  const trigger = (content: string) => {
    const caret = content.length;
    const hit = detectMentionTrigger(content, caret);
    if (!hit) throw new Error('트리거를 못 잡았다 — 시험 전제가 깨졌다');
    return hit;
  };

  it('adds the relation to frontmatter canonically and leaves only the name in the body', () => {
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
    // The body gets a clickable standard link.
    expect(result.content).toContain('이 기능은 [베타](./beta.md)');
    expect(result.content).not.toContain('@베');
  });

  it('places the cursor after the inserted name even when frontmatter grew', () => {
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

  it('leaves frontmatter untouched when the relation already exists', () => {
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
   * The sort rule matches `non-canonical-graph-array` in `validate-vault-document.ts`, or our own
   * check would warn.
   */
  it('merges into existing entries as a sorted set', () => {
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

  it('writes the slug into the body when the title is empty', () => {
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
   * A node cannot link to itself; the assertion throws if the chosen target is passed as the base.
   */
  it('rejects picking the document being edited', () => {
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

  it('resolves the link relative to the document being edited, not the picked one', () => {
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

  it('writes every direction to a real frontmatter key', () => {
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
