import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';

/**
 * **Three things, three words — the collision this file was written around.**
 *
 * Audit, 2026-09-05: `messages/ko.json` used one word for **three different referents** across
 * 71 strings.
 *
 * | Referent | What it is | Word |
 * |---|---|---|
 * | the destination | the screen at `/docs` — the rail entry, its links, its own controls | the destination word |
 * | the folder | the person's Markdown folder on disk — its path, choosing it, what it holds | the folder word |
 * | 「Library」 | the settings card that opens `/docs/` | **not a third thing** |
 *
 * The third referent turned out not to exist. `nav.settingsMenu.vaultTitle` navigates to
 * `vaultHref = '/docs/'` — the same address the rail's Docs entry opens — so English, not Korean,
 * had the extra name there, and the repair was to stop calling one destination two things rather
 * than to coin a third Korean word.
 *
 * ⚠️ **A real Library appeared the next day, and this table did not become wrong** (2026-09-06).
 * `/library` is now a destination carrying its own name in both languages, and that is exactly
 * why the row above still stands: the settings card at
 * `nav.settingsMenu.vaultTitle` still opens `/docs/`, so calling *it* "Library" would now name one
 * screen with another screen's name, which is worse than the ambiguity this file was written for.
 * The assertions below are unchanged and are what hold the two apart.
 *
 * Why it matters more in Korean: one label asked for the absolute path of a *screen*, because the
 * folder word and the destination word were the same word. Someone reading it has to work out
 * which of the two things each sentence means, and the one word gave them nothing to work with.
 *
 * This gate counts referents, not sentences — `.claude/rules/documentation.md` forbids pinning
 * authored prose, and `.claude/rules/design.md` "One word per thing" owns the rule.
 * `user-facing-vocabulary.contract.test.ts` owns the folder-versus-vault half.
 */

type Catalog = Record<string, unknown>;

function at(catalog: Catalog, path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => {
    if (!node || typeof node !== 'object') return undefined;
    return (node as Catalog)[key];
  }, catalog);
  expect(typeof value, `${path} 가 문자열이 아니다`).toBe('string');
  return value as string;
}

/**
 * Bare labels that name the destination and nothing else. A label is where a second name does the
 * most damage: it is the word a person looks for in the rail, the settings sheet, and the map's own
 * toolbar, and three spellings of it read as three places.
 */
const DESTINATION_LABELS = [
  'metadata.pages.docs',
  'navRail.docs',
  'nav.settingsMenu.vaultTitle',
  'searchWidgets.shortcuts.scope.docs',
  'topology.controls.docsLabel',
  'ontologyPages.insights.emptyTitleLink',
  'projectPages.detail.topBarDocsVault',
] as const;

/**
 * Strings about **the folder on disk**: its absolute path, picking it, and what is inside it.
 * None of them may borrow the destination's word — that is the sentence that sent someone looking
 * for the absolute path of a screen.
 */
const FOLDER_STRINGS = [
  'agentConnect.manualVaultLabel',
  'agentConnect.manualVaultPlaceholderPath',
  'agentConnect.manualPathConfirmation',
  'agentConnect.manualFileHint',
  'agentConnect.manualNotReadyNote',
  'docsVault.desktopWelcome.title',
  'docsVault.desktopWelcome.body',
  'docsVault.desktopWelcome.openTitle',
  'docsVault.desktopWelcome.createTitle',
  'docsVault.desktopWelcome.sampleTitle',
  'docsVault.desktopWelcome.contractAriaLabel',
  'docsVault.desktopWelcome.contractFilesLabel',
  'docsVault.desktopWelcome.actionsAriaLabel',
  'docsVault.sourceContract.ariaLabel',
  'docsVault.sourceContract.filesLabel',
  'docsVault.vaultStatus.openPicker',
  'docsVault.vaultStatus.missingSlugBanner',
  'docsVault.header.sourceAriaLabel',
  'docsVault.commands.sourceServer',
  'docsVault.commands.sourceLocal',
  'appUpdate.readyBody',
  'download.trustPrivacyNote',
  'featuresMisc.starterCta.proofAgentBody',
] as const;

describe('문서함과 폴더 — 한 화면과 한 폴더는 서로의 이름을 쓰지 않는다', () => {
  it('목적지 라벨은 한국어에서 전부 「문서함」이다', () => {
    for (const path of DESTINATION_LABELS) {
      expect(at(ko as Catalog, path), `${path} 가 목적지를 다른 이름으로 부른다`).toBe('문서함');
    }
  });

  it('목적지 라벨은 영어에서 전부 「Docs」다 — Library·Workspace·Source folder 로 갈라지지 않는다', () => {
    for (const path of DESTINATION_LABELS) {
      expect(at(en as Catalog, path), `${path} names the destination something else`).toBe('Docs');
    }
  });

  /*
   * The heart of the audit. Each of these sentences is about the folder, and every one of them
   * used to borrow the destination's word — so one word asked for a screen's absolute path, named
   * the files inside a folder, and labelled the button that picks one.
   */
  it('폴더를 말하는 문장은 목적지 이름을 빌려 쓰지 않는다', () => {
    const offenders = FOLDER_STRINGS.filter((path) => at(ko as Catalog, path).includes('문서함'));
    expect(
      offenders,
      '이 문장들은 디스크의 폴더를 가리킨다 — 화면 이름을 빌리면 어느 쪽을 말하는지 읽는 사람이 풀어야 한다',
    ).toEqual([]);
  });

  it('폴더를 말하는 문장은 실제로 「폴더」라고 말한다 — 이름을 빼기만 하지 않았다', () => {
    const silent = FOLDER_STRINGS.filter((path) => !at(ko as Catalog, path).includes('폴더'));
    expect(silent, '목적지 이름을 지우고 아무 이름도 주지 않으면 문장이 무엇을 가리키는지 사라진다').toEqual(
      [],
    );
  });

  /*
   * The one that would have caught the whole thing. The settings card and the rail open the same
   * address, so they cannot carry different names — in either language.
   */
  it('설정 카드와 레일은 같은 곳을 열므로 같은 이름을 쓴다', () => {
    expect(at(ko as Catalog, 'nav.settingsMenu.vaultTitle')).toBe(at(ko as Catalog, 'navRail.docs'));
    expect(at(en as Catalog, 'nav.settingsMenu.vaultTitle')).toBe(at(en as Catalog, 'navRail.docs'));
  });

  /*
   * A ratchet on the collision itself. The destination word legitimately appears wherever the
   * destination is meant, so the honest shape is a count that may fall and never rise — 71 before
   * the audit, measured after it.
   */
  it('「문서함」 사용이 다시 늘지 않는다', () => {
    const BASELINE = 39;
    const flat: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') return void flat.push(node);
      if (node && typeof node === 'object') Object.values(node as Catalog).forEach(walk);
    };
    walk(ko);
    const current = flat.filter((text) => text.includes('문서함')).length;
    expect(
      current,
      `「문서함」이 ${BASELINE} → ${current} 로 늘었다. 디스크의 폴더를 가리키는 자리라면 ` +
        '「폴더」를 써라 — 상한을 올리는 것은 래칫을 푸는 것이다.',
    ).toBeLessThanOrEqual(BASELINE);
  });
});
