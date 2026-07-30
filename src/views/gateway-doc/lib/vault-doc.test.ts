import { describe, expect, it } from 'vitest';
import { extractEntries, normalizeHeadingKey, readVaultDoc, trimToRecentSections } from './vault-doc';

/**
 * 관문 읽을거리의 **내용은 볼트에서 온다** — 이 시험이 그 계약을 잡는다.
 *
 * 손으로 쓴 사본으로 되돌아가는 것이 가장 그럴듯한 회귀다(급할 때 "그냥 여기
 * 문자열로 박자"). 그러면 방문자가 보는 문서와 저장소가 리뷰하는 문서가 갈라지고,
 * 갈라졌다는 사실은 아무도 모른다.
 */
describe('관문 읽을거리는 볼트 문서를 읽는다', () => {
  it('가이드 첫 장과 변경 내역이 볼트에 실제로 있다', () => {
    // 가이드는 2026-07-31 에 한 장(`GUIDE`)에서 여섯 장(`guide/*`)으로 갈렸다.
    // 전체 목록의 검증은 `tests/contract/gateway-routes.contract.test.ts` 가 진다.
    expect(readVaultDoc('guide/what-is-atlas')).toBeTruthy();
    expect(readVaultDoc('CHANGELOG')).toBeTruthy();
  });

  it('없는 슬러그는 null 이다 — 빈 문자열로 조용히 넘어가지 않는다', () => {
    expect(readVaultDoc('NOPE-NOT-A-DOC')).toBeNull();
  });

  it('가이드가 실제 안내문이다 — 자리표시자가 아니다', () => {
    const guide = readVaultDoc('guide/what-is-atlas') ?? '';
    // 이 저장소가 죽은 채널로 등재한 명령이 안내문에 살아 있으면 안 된다
    // (`surfaces.md` 「배포 채널은 둘뿐이다」).
    expect(guide).not.toMatch(/npx\s+ontology-atlas/);
    expect(guide.length).toBeGreaterThan(700);
  });
});

describe('trimToRecentSections', () => {
  const doc = [
    '머리말 문단.',
    '',
    '## 하나',
    'ㄱ',
    '',
    '## 둘',
    'ㄴ',
    '',
    '## 셋',
    'ㄷ',
  ].join('\n');

  it('절 수가 상한 이하면 전문 그대로다', () => {
    expect(trimToRecentSections(doc, 5)).toEqual({ body: doc, omittedSections: 0 });
  });

  it('앞에서 상한만큼만 남기고 몇 개를 접었는지 센다', () => {
    const { body, omittedSections } = trimToRecentSections(doc, 2);
    expect(body).toContain('## 하나');
    expect(body).toContain('## 둘');
    expect(body).not.toContain('## 셋');
    expect(omittedSections).toBe(1);
  });

  it('머리말은 절이 아니므로 항상 남는다', () => {
    expect(trimToRecentSections(doc, 1).body).toContain('머리말 문단.');
  });

  /**
   * 코드 펜스 안의 `## ` 를 절로 세면 절단 위치가 문서 한가운데가 되고,
   * 접힌 개수도 거짓이 된다. CHANGELOG 는 코드 블록이 많은 문서다.
   */
  it('코드 펜스 안의 `##` 는 절이 아니다', () => {
    const withFence = [
      '## 진짜 절',
      '',
      '```md',
      '## 이건 예시지 절이 아니다',
      '```',
      '',
      '## 두 번째 진짜 절',
    ].join('\n');
    const { body, omittedSections } = trimToRecentSections(withFence, 1);
    expect(omittedSections).toBe(1);
    expect(body).toContain('## 이건 예시지 절이 아니다');
    expect(body).not.toContain('## 두 번째 진짜 절');
  });

  it('실제 CHANGELOG 를 12절로 자르면 실제로 줄어든다', () => {
    const raw = readVaultDoc('CHANGELOG') ?? '';
    const { body, omittedSections } = trimToRecentSections(raw, 12);
    expect(omittedSections).toBeGreaterThan(0);
    expect(body.length).toBeLessThan(raw.length / 4);
  });
});


/**
 * 항목 목록의 링크는 **본문에 실제로 있는 자리**를 가리켜야 한다.
 *
 * ⚠️ 실측 결함(2026-07-31): 목록은 원문 제목을, 본문 `h2` 는 **렌더된** 텍스트를
 * 키로 썼다. 백틱이 든 제목 3개의 앵커가 조용히 끊겼다 — 눌러 보기 전에는 안
 * 보이는 실패라 여기서 잡는다.
 */
describe('extractEntries', () => {
  it('날짜와 제목을 갈라 낸다', () => {
    const [entry] = extractEntries('## 2026-07-31 — 무언가 바뀌었다\n본문');
    expect(entry?.date).toBe('2026-07-31');
    expect(entry?.title).toBe('무언가 바뀌었다');
  });

  it('날짜가 없으면 제목 전체를 쓴다', () => {
    const [entry] = extractEntries('## 그냥 제목\n본문');
    expect(entry?.date).toBeNull();
    expect(entry?.title).toBe('그냥 제목');
  });

  it('같은 제목이 겹쳐도 id 가 유일하다 — 겹치면 첫 번째로만 간다', () => {
    const entries = extractEntries('## 같은 제목\n\n## 같은 제목');
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });

  it('코드 펜스 안의 `##` 는 항목이 아니다', () => {
    const entries = extractEntries(['## 진짜', '', '```md', '## 예시', '```'].join('\n'));
    expect(entries).toHaveLength(1);
  });

  it('인라인 마크다운이 든 제목도 정규화하면 렌더 텍스트와 같아진다', () => {
    // 이 등식이 깨지는 순간 앵커가 끊긴다.
    const raw = '2026-07-30 — 관문에 읽을거리 둘: `/guide` · **강조**';
    const rendered = '2026-07-30 — 관문에 읽을거리 둘: /guide · 강조';
    expect(normalizeHeadingKey(raw)).toBe(normalizeHeadingKey(rendered));
  });

  it('실제 CHANGELOG 의 모든 항목이 유일한 id 를 갖는다', () => {
    const entries = extractEntries(readVaultDoc('CHANGELOG') ?? '');
    expect(entries.length).toBeGreaterThan(10);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
});
