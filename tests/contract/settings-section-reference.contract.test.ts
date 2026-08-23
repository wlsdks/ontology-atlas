import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * If a string says "go to the X section of settings", **that section must exist.**
 *
 * **Why** (measured 2026-08-17). The settings sheet had nine section names at the
 * time — two of them became 「Agents」 and 「MCP Connection」 by owner instruction on
 * 2026-08-19 — Screen · Map Background · Extension · Footprint · Notification · Workspace ·
 * **Chat in App** · **Connect in Terminal** · API Key. Two pieces of guidance named
 * sections that did not exist:
 *
 * | Where | What it said | The real name |
 * |---|---|---|
 * | Runtimes degradation card | in the 「**MCP**」 section | Connect in Terminal |
 * | Chat launch-failure notice | in settings' **Agents** section | Chat in App |
 *
 * Whoever reads it hunts for a tab that is not there and gives up. Same species as
 * what this repository already wrote down: *"a row with no destination is the same
 * as never having been registered."*
 *
 * **Why measure this instead of pinning the sentence.** The defect first surfaced in
 * the web smoke test, and that check was pinning **the whole wording**
 * (`alsoHere: /My Agent Connection/`). So a wording change turned it red, and that red
 * could not distinguish "the wording is stale" from "it points nowhere" — exactly the
 * shape `.claude/rules/documentation.md` forbids: *do not pin a sentence a human
 * wrote; check only what a machine can generate.*
 *
 * So this measures a **relation** instead of a sentence: is the name inside 「…」 one
 * of the `section.*` values? The wording may be edited or translated freely, and this
 * breaks only when it points at a section that does not exist.
 */

/** 「X」 field · “X” section · section 「X」 — the shapes a "go to that section" instruction takes. */
const SECTION_REFERENCE_PATTERNS = [
  /[「“]([^」”]+)[」”]\s*(?:칸|section)/gu,
  /(?:섹션|section)\s*[「“]([^」”]+)[」”]/gu,
] as const;

type Bundle = Record<string, unknown>;

/**
 * **The places that can be pointed at live in two tables** (2026-08-21, ledger 90).
 *
 * Runtimes and MCP connect left the sheet and became the "agent" destination, so
 * guidance may point at a sheet section **or at a section of that destination**.
 * Looking at only one table reports perfectly good guidance as a defect.
 *
 * Does adding a table loosen the check? No. **Both are sets of names that really
 * exist on screen**, and what this check blocks is naming something that does not
 * exist, not which table it is in. To compensate, each table gets **its own idling
 * floor** below.
 */
function sheetSectionNames(bundle: Bundle): Set<string> {
  const nav = (bundle.nav as Bundle | undefined)?.settingsMenu as Bundle | undefined;
  const section = nav?.section as Record<string, string> | undefined;
  return new Set(Object.values(section ?? {}));
}

/** The section headings the "agent" destination renders on screen. */
function destinationSectionNames(bundle: Bundle): Set<string> {
  const agents = bundle.agents as Record<string, string> | undefined;
  return new Set(
    Object.entries(agents ?? {})
      .filter(([key]) => key.endsWith('Heading'))
      .map(([, value]) => value),
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
      '「에이전트」 목적지의 절 제목이 0개다',
    ).toBeGreaterThan(1);
  });

  /*
   * ⚠️ **The second most important check here.** With zero pieces of pointing
   * guidance the main check iterates an empty array and is always green. Today's
   * measurement is 2 (the runtimes degradation card and the chat launch-failure
   * notice); if guidance is deleted, lower this line with it.
   */
  it('가리키는 안내가 실제로 있다 — 없으면 본 검사가 헛돈다', () => {
    // 2026-08-21: one line, the runtimes degradation card, points at a destination
    // section. If that guidance is deleted, lower this line with it.
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
 * A name that exists but whose section is not rendered is the same defect
 * (2026-08-19).
 *
 * The check above compares the name inside 「…」 against `section.*` **values**. But
 * if the value survives while its key drops out of `SETTINGS_GROUPS` — removing the
 * section from the menu and forgetting to delete the translation key — the check
 * above stays green while the guidance points at **a section that is never
 * rendered**. So instead of pinning a sentence, both sides are **extracted and
 * compared**: the set of `section.*` keys in messages == the set of items the menu
 * actually renders.
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
