import { describe, expect, it } from 'vitest';

import {
  SETTINGS_SEARCH_LIMIT,
  groupSettingsResults,
  searchSettings,
  type SettingsSearchItem,
} from './settings-search';

function item(partial: Partial<SettingsSearchItem> & Pick<SettingsSearchItem, 'id' | 'label'>): SettingsSearchItem {
  return {
    section: 'screen',
    keywords: '',
    sectionLabel: 'Screen · language',
    scopeLabel: 'This computer',
    ...partial,
  };
}

const catalog: SettingsSearchItem[] = [
  item({ id: 'language', label: 'Language', keywords: 'locale, korean' }),
  item({ id: 'text-size', label: 'Text size', keywords: 'zoom, font, bigger' }),
  item({ id: 'motion', label: 'Motion', keywords: 'animation, reduce' }),
  item({ id: 'door-models', label: 'Models · API keys', section: 'agents', sectionLabel: 'Agents', keywords: 'key, provider', opensLabel: 'Agents' }),
  item({ id: 'version', label: 'Running build', section: 'about', sectionLabel: 'About', scopeLabel: 'App', keywords: 'version, release' }),
  item({ id: 'size-guides', label: 'Screen guides', keywords: 'size, hints' }),
];

const ids = (results: SettingsSearchItem[]) => results.map((result) => result.id);

describe('searchSettings', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchSettings(catalog, '')).toEqual([]);
    expect(searchSettings(catalog, '   ')).toEqual([]);
  });

  it('ranks a label prefix, then the label anywhere, then keywords, then the pane name', () => {
    const extended = [
      ...catalog,
      item({ id: 'agent-section', label: 'Wiki write mode', section: 'agents', sectionLabel: 'Agents' }),
    ];
    expect(ids(searchSettings(extended, 'size'))).toEqual(['text-size', 'size-guides']);
    expect(ids(searchSettings(extended, 'key'))).toEqual(['door-models']);
    expect(ids(searchSettings(extended, 'agen'))).toEqual(['door-models', 'agent-section']);
    expect(ids(searchSettings(catalog, 'API'))).toEqual(['door-models']);
    expect(ids(searchSettings(catalog, 's'))[0]).toBe('size-guides');
  });

  it('ranks a word start in the label above the label anywhere', () => {
    const korean = [
      item({ id: 'wiki', label: '에이전트가 위키 문서를 쓸 때', section: 'agents' }),
      item({ id: 'door-models', label: '모델 · API 키', section: 'agents' }),
    ];
    expect(ids(searchSettings(korean, '키'))).toEqual(['door-models', 'wiki']);
  });

  it('keeps catalog order inside a tier', () => {
    const tied = [item({ id: 'b', label: 'Map b' }), item({ id: 'a', label: 'Map a' })];
    expect(ids(searchSettings(tied, 'map'))).toEqual(['b', 'a']);
  });

  it('ignores case and Unicode composition', () => {
    expect(ids(searchSettings(catalog, 'MOTION'))).toEqual(['motion']);
    const decomposed = '화면'.normalize('NFD');
    expect(ids(searchSettings([item({ id: 'k', label: '화면 안내' })], decomposed))).toEqual(['k']);
  });

  it('matches Korean initials and a syllable the keyboard has not finished', () => {
    const korean = [
      item({ id: 'models', label: '모델 · API 키', section: 'agents', sectionLabel: '에이전트' }),
      item({ id: 'text-size', label: '글자 크기', keywords: '확대, 글꼴' }),
    ];
    expect(ids(searchSettings(korean, '키'))).toEqual(['models']);
    expect(ids(searchSettings(korean, 'ㄱㅈ'))).toEqual(['text-size']);
    expect(ids(searchSettings(korean, '글ㅈ'))).toEqual(['text-size']);
    expect(ids(searchSettings(korean, '확'))).toEqual(['text-size']);
    expect(ids(searchSettings(korean, '에이'))).toEqual(['models']);
  });

  it('returns at most thirty results', () => {
    const many = Array.from({ length: 40 }, (_, index) => item({ id: `row-${index}`, label: `Row ${index}` }));
    expect(searchSettings(many, 'row')).toHaveLength(SETTINGS_SEARCH_LIMIT);
    expect(SETTINGS_SEARCH_LIMIT).toBe(30);
  });
});

describe('groupSettingsResults', () => {
  it('groups by pane in the order panes first appear in the ranking', () => {
    const groups = groupSettingsResults(searchSettings(catalog, 'e'));
    expect(groups.map((group) => group.section)).toEqual(['screen', 'agents', 'about']);
    expect(groups[2]).toMatchObject({ sectionLabel: 'About', scopeLabel: 'App' });
    expect(groups.flatMap((group) => group.items).length).toBe(searchSettings(catalog, 'e').length);
  });
});
