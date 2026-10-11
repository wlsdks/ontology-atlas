import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS } from '@/widgets/app-settings-menu/model/settings-sections';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * Guidance that points at a settings section must name one that exists. Checks the relation (the name
 * inside the quotes is a `section.*` value), not the wording.
 */

/** 「X」 field · “X” section · section 「X」 — the shapes a "go to that section" instruction takes. */
const SECTION_REFERENCE_PATTERNS = [
  /[「“]([^」”]+)[」”]\s*(?:칸|section)/gu,
  /(?:섹션|section)\s*[「“]([^」”]+)[」”]/gu,
] as const;

type Bundle = Record<string, unknown>;

/**
 * Guidance may point at a sheet section or a section of the agent destination, so both tables are
 * valid sets; each has its own floor below.
 */
function sheetSectionNames(bundle: Bundle): Set<string> {
  const nav = (bundle.nav as Bundle | undefined)?.settingsMenu as Bundle | undefined;
  const section = nav?.section as Record<string, string> | undefined;
  return new Set(Object.values(section ?? {}));
}

/**
 * Section headings a destination renders on screen. Two namespaces, `agents` and `mcp`, because
 * those screens are separate.
 */
const DESTINATION_NAMESPACES = ['agents', 'mcp'] as const;

function destinationSectionNames(bundle: Bundle): Set<string> {
  return new Set(
    DESTINATION_NAMESPACES.flatMap((namespace) =>
      Object.entries((bundle[namespace] as Record<string, string> | undefined) ?? {})
        .filter(([key]) => key.endsWith('Heading'))
        .map(([, value]) => value),
    ),
  );
}

function sectionNames(bundle: Bundle): Set<string> {
  return new Set([...sheetSectionNames(bundle), ...destinationSectionNames(bundle)]);
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
    // If this is empty, every check below passes while measuring nothing.
    expect(names.size).toBeGreaterThan(5);
  });

  /*
   * **Each table gets its own floor.** Counting only the union hides one table
   * disappearing entirely behind the other's number — the "a total covers the hole"
   * shape this repository has repeatedly hit with gates.
   */
  it('두 표가 각각 비어 있지 않다 — 합계가 한쪽의 소실을 덮지 않는다', () => {
    expect(sheetSectionNames(bundle).size, '시트 칸 이름이 0개다').toBeGreaterThan(5);
    expect(
      destinationSectionNames(bundle).size,
      '목적지(에이전트 · MCP)의 절 제목이 0개다',
    ).toBeGreaterThan(1);
  });

  /*
   * ⚠️ **The second most important check here.** With zero pieces of pointing
   * guidance the main check iterates an empty array and is always green. Today's
   * measurement is 2 (the runtimes degradation card and the chat launch-failure
   * notice); if guidance is deleted, lower this line with it.
   */
  it('가리키는 안내가 실제로 있다 — 없으면 본 검사가 헛돈다', () => {
    // One runtimes degradation card points at a destination section; lower this line if it is deleted.
    expect(refs.length).toBeGreaterThanOrEqual(1);
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
 * The set of `section.*` keys in messages must equal the set of items the menu renders, so a
 * translation left behind after removing a section is caught.
 */
describe('section.* 키는 전부 실제로 그려지는 칸이다', () => {
  const renderedItems = [...SETTINGS_SECTIONS];

  it('items 추출이 헛돌지 않는다 — 0개면 아래 검사는 아무것도 안 잰다', () => {
    expect(renderedItems.length).toBeGreaterThan(5);
  });

  it.each([
    ['ko', ko as unknown as Bundle],
    ['en', en as unknown as Bundle],
  ])('%s 의 section.* 키 집합 == SETTINGS_SECTIONS', (_locale, bundle) => {
    const nav = (bundle.nav as Bundle | undefined)?.settingsMenu as Bundle | undefined;
    const keys = Object.keys((nav?.section as Record<string, string>) ?? {}).sort();
    expect(keys).toEqual([...renderedItems].sort());
  });
});
