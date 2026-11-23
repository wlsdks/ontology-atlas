import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { deskRows, importDesk, nearestPassages, placement } from './meaning-quality.mjs';

let app;
before(async () => { app = await importDesk(); });

/** A two-page wiki and one source: the answer shares no word with the question. */
function smallVault() {
  const page = (title, facts) => `---\ntitle: ${title}\n---\n## Facts\n${facts.map((fact) => `- ${fact}`).join('\n')}\n`;
  const pages = {
    'wiki/defrost': page('Defrost', ['Evaporators run a defrost cycle every 6 hours.']),
    'wiki/fleet': page('Fleet', ['The fleet runs 9 reefer vans for chilled loads.']),
  };
  const source = '# Log\nChilled loads leave the dock at 6.\n';
  const docs = Object.entries(pages).map(([slug, raw]) => ({ slug, title: slug, frontmatter: app.parseFrontmatter(raw).frontmatter }));
  const claimsBySlug = new Map(Object.entries(pages).map(([slug, raw]) => [slug, app.deskPageClaims(raw)]));
  const bytes = new TextEncoder().encode(source);
  return {
    docs, claimsBySlug,
    sources: [{ path: 'sources/log.md', bytes: bytes.length, mtime: 0 }],
    unitsByPath: new Map([['sources/log.md', app.sourceUnits(bytes, 'sources/log.md').units]]),
  };
}

describe('meaning-quality desk rows', () => {
  it('lists a passage only meaning found as a row of the fused list, with its reason', () => {
    const vault = smallVault();
    const question = 'how often is ice cleared from chilled loads';
    const gold = ['wiki/defrost.md'];
    const wordsOnly = deskRows(app, vault, question, null);
    assert.deepEqual(wordsOnly.map((row) => row.reason), wordsOnly.map(() => 'words'));
    assert.equal(placement(gold, wordsOnly).first8, 0);

    // File lines: frontmatter 1-3, Facts 4, the claim 5.
    const meaningHits = [{ path: 'wiki/defrost.md', lineStart: 4, lineEnd: 5, score: 0.8 }];
    const fused = deskRows(app, vault, question, meaningHits);
    const answer = fused.find((row) => row.files[0] === 'wiki/defrost.md');
    assert.equal(answer?.reason, 'meaning');
    assert.equal(answer?.text, 'Evaporators run a defrost cycle every 6 hours.');
    assert.equal(placement(gold, fused).first8, 1);
    assert.equal(fused.length, wordsOnly.length + 1);
  });

  it('places the gold files: all within the first 3, all within the first 8, and the first one by rank', () => {
    const rows = ['a', 'b', 'c', 'd', 'gold-1', 'e', 'gold-2'].map((file) => ({ files: [file] }));
    assert.deepEqual(placement(['gold-1', 'gold-2'], rows), { first3: 0, first8: 1, reciprocalRank: 1 / 5 });
    assert.deepEqual(placement(['a', 'c'], rows), { first3: 1, first8: 1, reciprocalRank: 1 });
    assert.deepEqual(placement(['missing'], rows), { first3: 0, first8: 0, reciprocalRank: 0 });
  });

  it('counts a claim row as reaching the files its citation presses open', () => {
    const vault = smallVault();
    const cited = '---\ntitle: Cited\n---\n## Facts\n- Evaporators defrost every 6 hours. [[src:sources/log.md#l2]]\n';
    vault.docs.push({ slug: 'wiki/cited', title: 'wiki/cited', frontmatter: {} });
    vault.claimsBySlug.set('wiki/cited', app.deskPageClaims(cited));
    const rows = deskRows(app, vault, 'evaporators defrost', null);
    assert.deepEqual(rows[0].files, ['wiki/cited.md', 'sources/log.md']);
    assert.equal(placement(['wiki/cited.md', 'sources/log.md'], rows).first3, 1);
  });

  it('returns the nearest passages by cosine up to the limit, ties by path then line', () => {
    const passage = (path, start, vector) => ({ path, start, end: start, vector: Float32Array.from(vector) });
    const hits = nearestPassages([
      passage('b.md', 1, [1, 0]), passage('a.md', 9, [1, 0]), passage('a.md', 2, [1, 0]), passage('c.md', 1, [0, 1]),
    ], Float32Array.from([1, 0]), 3);
    assert.deepEqual(hits.map((hit) => `${hit.path}:${hit.lineStart}`), ['a.md:2', 'a.md:9', 'b.md:1']);
    assert.equal(hits[0].score, 1);
  });
});
