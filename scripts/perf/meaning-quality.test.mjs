import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { importDesk, readDeskFixture, wordSearch } from './meaning-quality.mjs';

const { questions } = JSON.parse(readFileSync(new URL('../../tests/fixtures/meaning-search/questions.json', import.meta.url), 'utf8'));

test('the desk word search loads under Node and finds an exact-term question in its gold file', async () => {
  const app = await importDesk();
  const vault = readDeskFixture(app);
  const exact = questions.filter((question) => question.exactTerm);
  assert.ok(exact.length > 0);
  for (const question of exact) {
    const found = wordSearch(app, vault, question.question);
    const files = new Set([...found.claims, ...found.sources].map((lead) => lead.id));
    assert.ok(question.gold.every((gold) => files.has(gold)), question.question);
  }
});
