import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listLocales } from '../build-messages.mjs';
import {
  VOCABULARY,
  appliesTo,
  column,
  matches,
  matchesAll,
  missingColumns,
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

test('the installed-app and folder forms match the phrases the readiness gate reads', () => {
  assert.equal(matchesAll('installedApp', 'ko', '설치된 앱에서 여세요'), true);
  assert.equal(matchesAll('installedApp', 'ko', '앱에서 여세요'), false);
  assert.equal(matchesAll('installedApp', 'en', 'Open it in the installed app'), true);
  assert.equal(matches('folderWord', 'ko', '폴더 열기'), true);
  assert.equal(matches('folderWord', 'en', 'Open a Folder'), true);
});

test('the ratchet values are the ones the contracts held before the table', () => {
  assert.equal(column('aiWord', 'ko').baseline, 82);
  assert.equal(column('projectKindWord', 'ko').baseline, 144);
  assert.deepEqual(column('softenedKindNames', 'ko').baselines, { 영역: 14, 기능: 7 });
  assert.equal(column('nodeWord', 'en').baseline, 9);
  assert.equal(column('surfaceNaming', 'ko').pattern.source, column('surfaceNaming', 'en').pattern.source);
  assert.equal(column('internalTerms', 'ko').terms.length, 17);
  assert.equal(column('codeStyleWords', 'ko').words.length, 9);
});
