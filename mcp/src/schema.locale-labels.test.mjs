import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildFrontmatter, normalizeLocaleLabels, localeLabelCodes } from './schema.mjs';

// 어권별 표시 이름 (소유자 지시 2026-07-24) — agent 가 `labels: {ko, en}` 로
// 보낸 값이 `display_<locale>` frontmatter 로 정규화되는지 고정한다.
test('normalizeLocaleLabels keeps 2-letter locale string values only', () => {
  assert.deepEqual(
    normalizeLocaleLabels({ ko: '결제', en: '  Payments  ', kor: 'x', en2: 'y', bad: 3, empty: '  ' }),
    { display_ko: '결제', display_en: 'Payments' },
  );
  assert.deepEqual(normalizeLocaleLabels(null), {});
  assert.deepEqual(normalizeLocaleLabels(['ko']), {});
});

test('localeLabelCodes reports which locales were filled', () => {
  assert.deepEqual(localeLabelCodes({ display_en: 'Payments' }), ['en']);
  assert.deepEqual(localeLabelCodes({ display_ko: '결제', display_en: 'Payments' }), ['en', 'ko']);
});

test('buildFrontmatter groups display_<locale> right after display', () => {
  const fm = buildFrontmatter({
    slug: 'domains/payment',
    kind: 'domain',
    title: '결제',
    display: '결제',
    ...normalizeLocaleLabels({ ko: '결제', en: 'Payments' }),
  });
  const keys = Object.keys(fm);
  assert.equal(keys[keys.indexOf('display') + 1], 'display_ko');
  assert.equal(keys[keys.indexOf('display') + 2], 'display_en');
  assert.equal(fm.title, '결제', 'title stays the search/matching source');
});
