import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listLocales } from '../../i18n/build-messages.mjs';
import {
  VOCABULARY,
  appliesTo,
  column,
  matches,
  missingColumns,
  sourceWordOffenders,
} from './locale-vocabulary.mjs';

test('every locale has a column or a stated reason for every concept', () => {
  const locales = listLocales();
  assert.ok(locales.includes('ko') && locales.includes('en'), 'the locale directories were not read');
  assert.deepEqual(missingColumns(locales), []);
});

test('a locale with neither a column nor a reason fails, so a new locale cannot pass by being absent', () => {
  const gaps = missingColumns(['en', 'ko', 'xx']);
  assert.equal(gaps.length, Object.keys(VOCABULARY).length);
  assert.ok(gaps.includes('folderSecondNames:xx has no column and no notApplicable reason'));
});

test('an explicit notApplicable with a reason satisfies the check and a blank one does not', () => {
  const table = {
    word: { applies: ['ko'], ko: { words: ['x'] }, notApplicable: { ja: 'kana has no such split', zh: ' ' } },
  };
  assert.deepEqual(missingColumns(['en', 'ko', 'ja'], table), []);
  assert.equal(missingColumns(['en', 'ko', 'zh'], table).length, 1);
});

test('a locale listed as applying without forms fails', () => {
  assert.deepEqual(missingColumns(['ko', 'ja'], { word: { applies: ['ko', 'ja'], ko: { words: [] } } }), [
    'word:ja applies but holds no forms',
  ]);
});

test('asking for a missing column throws instead of answering empty', () => {
  assert.throws(() => column('internalTerms', 'ja'), /no column/);
  assert.equal(appliesTo('internalTerms', 'ja'), false);
});

test('the folder forms match the phrases the readiness gate reads', () => {
  assert.equal(matches('folderWord', 'ko', '폴더 열기'), true);
  assert.equal(matches('folderWord', 'en', 'Open a Folder'), true);
});

test('the source word is caught outside kept keys in ko and only in the Library sense in ja', () => {
  const ko = [
    { path: 'library.kindSourcesTitle', text: '원문' },
    { path: 'gatewayNav.emptyBody', text: '원문은 저장소에서 읽을 수 있어요.' },
  ];
  assert.deepEqual(sourceWordOffenders('ko', ko), ['library.kindSourcesTitle']);
  const ja = [
    { path: 'library.kindSourcesTitle', text: 'ソース' },
    { path: 'library.sourcesHome.code', text: 'ソースコード' },
    { path: 'workCard.scheduled.staleBody', text: '原本と合わない' },
    { path: 'architecture.inspectSourceAction', text: 'ソースを検査' },
  ];
  assert.deepEqual(sourceWordOffenders('ja', ja), ['library.kindSourcesTitle', 'workCard.scheduled.staleBody']);
});
