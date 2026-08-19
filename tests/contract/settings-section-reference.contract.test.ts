import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * 「설정의 X 칸으로 가세요」라고 적었으면 **그 칸이 실제로 있어야 한다.**
 *
 * ## 왜 (2026-08-17 실측)
 *
 * 설정 시트의 칸 이름은 아홉이다(당시 이름 — 두 칸은 2026-08-19 소유자
 * 지시로 「Agents」·「MCP 연결」이 됐다) — 화면 · 지도 배경 · 확장 · 발자국 ·
 * 알림 · 작업 공간 · **앱에서 대화** · **터미널에서 연결** · API Key. 그런데
 * 두 안내가 없는 이름을 대고 있었다:
 *
 * | 어디 | 뭐라고 했나 | 실제 이름 |
 * |---|---|---|
 * | 실행기 강등 카드 | 「**MCP**」 칸에서 | 터미널에서 연결 |
 * | 대화 실행 실패 안내 | 설정의 **Agents** 칸에서 | 앱에서 대화 |
 *
 * 읽은 사람은 없는 탭을 찾다가 포기한다. 이 저장소가 이미 적어 둔 말과 같은
 * 갈래다 — *"갈 곳이 없는 줄은 등재된 적이 없는 것과 같다."*
 *
 * ## 왜 문장을 못박지 않고 이렇게 재나
 *
 * 이 결함을 처음 드러낸 것은 웹 스모크였는데, 그 검사는 **문구를 통째로**
 * 못박고 있었다(`alsoHere: /내 에이전트 연결/`). 그래서 문구가 바뀌자 빨간불이
 * 됐고, 그 빨간불이 「문구가 낡았다」인지 「가리키는 곳이 없다」인지 구별되지
 * 않았다. `documentation.md` 가 금지하는 바로 그 모양이다 — *"사람이 쓴 문장을
 * 못박지 마라. 기계가 만들어 낼 수 있는 것만 검사하라."*
 *
 * 그래서 문장 대신 **관계**를 잰다: 「…」 안의 이름이 `section.*` 값 중 하나인가.
 * 문구는 얼마든지 고쳐도 되고 번역해도 되며, 없는 칸을 가리킬 때만 터진다.
 */

/** 「X」 칸 · “X” section · 섹션 「X」 — 「그 칸으로 가라」는 말의 모양들. */
const SECTION_REFERENCE_PATTERNS = [
  /[「“]([^」”]+)[」”]\s*(?:칸|section)/gu,
  /(?:섹션|section)\s*[「“]([^」”]+)[」”]/gu,
] as const;

type Bundle = Record<string, unknown>;

function sectionNames(bundle: Bundle): Set<string> {
  const nav = (bundle.nav as Bundle | undefined)?.settingsMenu as Bundle | undefined;
  const section = nav?.section as Record<string, string> | undefined;
  return new Set(Object.values(section ?? {}));
}

function sectionReferences(bundle: Bundle): Array<{ key: string; name: string }> {
  const out: Array<{ key: string; name: string }> = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      for (const pattern of SECTION_REFERENCE_PATTERNS) {
        for (const match of node.matchAll(pattern)) {
          out.push({ key: path, name: match[1].trim() });
        }
      }
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(bundle, '');
  return out;
}

describe.each([
  ['ko', ko as unknown as Bundle],
  ['en', en as unknown as Bundle],
])('설정 칸을 가리키는 안내 — %s', (_locale, bundle) => {
  const names = sectionNames(bundle);
  const refs = sectionReferences(bundle);

  it('설정 칸 이름 목록이 비어 있지 않다', () => {
    // 이게 비면 아래 검사는 전부 통과하면서 아무것도 안 재게 된다.
    expect(names.size).toBeGreaterThan(5);
  });

  /*
   * ⚠️ **이 검사가 두 번째로 중요하다.** 「가리키는 안내」가 0건이면 본 검사는
   * 빈 배열을 돌며 늘 초록이다. 오늘 2건(실행기 강등 카드 · 대화 실행 실패
   * 안내)이 실측이고, 안내를 지웠으면 이 줄을 같이 내리면 된다.
   */
  it('가리키는 안내가 실제로 있다 — 없으면 본 검사가 헛돈다', () => {
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('가리킨 칸이 전부 실재한다', () => {
    const missing = refs.filter((ref) => !names.has(ref.name));
    expect(
      missing.map((ref) => `${ref.key} → 「${ref.name}」`),
      '없는 설정 칸을 가리키는 안내가 있다',
    ).toEqual([]);
  });
});

describe('두 언어가 같은 자리를 가리킨다', () => {
  it('참조하는 번역 키가 같다 — 한쪽만 고치면 다른 쪽이 낡는다', () => {
    const keys = (bundle: Bundle) => sectionReferences(bundle).map((r) => r.key).sort();
    expect(keys(ko as unknown as Bundle)).toEqual(keys(en as unknown as Bundle));
  });
});

/*
 * ## 이름이 실재해도 칸이 안 그려지면 같은 결함이다 (2026-08-19)
 *
 * 위 검사는 「…」 속 이름을 `section.*` **값**과 대조한다. 그런데 값은 남았는데
 * 그 키가 `SETTINGS_GROUPS` 에서 빠지면 — 칸을 메뉴에서 내리고 번역 키를
 * 지우는 걸 잊으면 — 위 검사는 초록인 채로 안내가 **안 그려지는 칸**을
 * 가리킨다. 그래서 문장을 못박지 않고 양쪽에서 **뽑아 대조**한다:
 * messages 의 `section.*` 키 집합 == 메뉴가 실제로 그리는 items 집합.
 */
describe('section.* 키는 전부 실제로 그려지는 칸이다', () => {
  const source = readFileSync(
    join(__dirname, '../../src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx'),
    'utf8',
  );
  const renderedItems = [...source.matchAll(/items:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]),
  );

  it('items 추출이 헛돌지 않는다 — 0개면 아래 검사는 아무것도 안 잰다', () => {
    expect(renderedItems.length).toBeGreaterThan(5);
  });

  it.each([
    ['ko', ko as unknown as Bundle],
    ['en', en as unknown as Bundle],
  ])('%s 의 section.* 키 집합 == SETTINGS_GROUPS 의 items 집합', (_locale, bundle) => {
    const nav = (bundle.nav as Bundle | undefined)?.settingsMenu as Bundle | undefined;
    const keys = Object.keys((nav?.section as Record<string, string>) ?? {}).sort();
    expect(keys).toEqual([...renderedItems].sort());
  });
});
