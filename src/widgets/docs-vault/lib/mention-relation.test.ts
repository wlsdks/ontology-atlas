import { describe, expect, it } from 'vitest';

import {
  detectMentionTrigger,
  insertMentionRelation,
  MENTION_RELATIONS,
} from './mention-relation';

/**
 * `@` 멘션이 지키는 성질은 하나다: **고르면 그래프가 바뀐다.**
 *
 * 종전 `[[` 위키링크는 그러지 않았다 — 같은 볼트에서 위키링크를 넣었다 뺐을 때
 * 컴파일 엣지 수도 그래프 해시도 동일했다(9 · `c07785b6`, 2026-08-08 실측).
 * 그래서 이 시험들은 「메뉴가 뜨나」가 아니라 **「frontmatter 가 바뀌나」**를
 * 잰다. 뜨기만 하고 안 바뀌면 이름만 바꾼 같은 결함이다.
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
   * 문서함은 로컬 볼트를 열면 `CLAUDE.md`·`AGENTS.md` 도 편집할 수 있고,
   * 그 파일에서 `@AGENTS.md` 는 **진짜 import 문법**이다. 메뉴가 거기 끼어들면
   * 남의 문법을 가로채는 것이다.
   */
  it('경로 표기(@AGENTS.md · @docs/…)는 가로채지 않는다', () => {
    for (const src of ['@AGENTS.md', '읽어라 @docs/FOUNDATIONS.md', '@.claude/rules']) {
      const hit = detectMentionTrigger(src, src.length);
      // `.` 또는 `/` 로 시작하는 질의어는 트리거가 아니다.
      expect(hit === null || !/^[/.]/.test(hit.query)).toBe(true);
    }
    // 「경로가 되는 순간」이 아니라 **경로 글자가 들어오는 순간** 물러난다 —
    // 타이핑 도중 메뉴가 떴다 사라지면 그 깜빡임 사이의 Enter 가 남의 문법을
    // 노드 이름으로 바꿔 버린다.
    expect(detectMentionTrigger('@AGENTS', 7)).not.toBeNull(); // 아직 평범한 질의어
    expect(detectMentionTrigger('@AGENTS.md', 10)).toBeNull(); // 점이 들어오면 끝
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
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'dependencies',
    });

    expect(result.relationAdded).toBe(true);
    // ① 사실 — frontmatter
    expect(result.content).toContain('dependencies: [capabilities/beta]');
    // ② 문장 — 본문에는 사람이 읽는 이름만. 슬러그도 대괄호도 남지 않는다.
    expect(result.content).toContain('이 기능은 베타');
    expect(result.content).not.toContain('@베');
    expect(result.content).not.toContain('[[');
  });

  it('커서가 삽입한 이름 뒤에 선다 — frontmatter 가 길어진 만큼 밀려도', () => {
    const content = `${DOC}@베`;
    const result = insertMentionRelation({
      content,
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'relates',
    });
    // 커서 위치의 바로 앞 글자가 방금 넣은 이름의 끝이어야 한다.
    expect(result.content.slice(result.caret - 2, result.caret)).toBe('베타');
  });

  it('이미 있는 관계는 파일을 건드리지 않는다 (본문만 바뀐다)', () => {
    const withRelation = DOC.replace(
      'domain: domains/orders',
      'domain: domains/orders\nrelates: [capabilities/beta]',
    );
    const content = `${withRelation}@베`;
    const result = insertMentionRelation({
      content,
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '베타' },
      relationId: 'relates',
    });
    expect(result.relationAdded).toBe(false);
    expect(result.content).toContain('relates: [capabilities/beta]');
    // 중복이 생기지 않는다.
    expect(result.content.match(/capabilities\/beta/g)).toHaveLength(1);
  });

  /**
   * 정렬 규칙을 여기서 새로 정하지 않는다 — `validate-vault-document.ts` 의
   * `non-canonical-graph-array` 가 이미 «중복 제거 + localeCompare 정렬» 을
   * 요구한다. 그것과 다르게 쓰면 우리가 방금 쓴 파일이 우리 검사에서 경고를
   * 받는다.
   */
  it('기존 항목이 있으면 정렬된 집합으로 합친다', () => {
    const withRelation = DOC.replace(
      'domain: domains/orders',
      'domain: domains/orders\nrelates: [capabilities/zeta, capabilities/alpha2]',
    );
    const content = `${withRelation}@베`;
    const result = insertMentionRelation({
      content,
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
      trigger: trigger(content),
      target: { slug: 'capabilities/beta', title: '   ' },
      relationId: 'contains',
    });
    expect(result.content).toContain('이 기능은 capabilities/beta');
  });

  it('네 방위 전부가 실재하는 frontmatter 키로 쓴다', () => {
    for (const relation of MENTION_RELATIONS) {
      const content = `${DOC}@베`;
      const result = insertMentionRelation({
        content,
        trigger: trigger(content),
        target: { slug: 'capabilities/beta', title: '베타' },
        relationId: relation.id,
      });
      expect(result.content).toContain(`${relation.frontmatterKey}: [capabilities/beta]`);
    }
  });
});
