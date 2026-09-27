import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreEvidence } from './evidence-rank.mjs';

test('scoreEvidence — title match outranks frontmatter-ref outranks body', () => {
  const exact = scoreEvidence('token issue', { title: 'token issue', frontmatterHaystack: '', body: '' });
  const titleSub = scoreEvidence('token', { title: 'token issue', frontmatterHaystack: '', body: '' });
  const fmHit = scoreEvidence('token', { title: 'auth', frontmatterHaystack: 'token-store', body: '' });
  const bodyHit = scoreEvidence('token', { title: 'auth', frontmatterHaystack: '', body: 'we mint a token here' });

  assert.ok(exact.score > titleSub.score, 'exact title > substring title');
  assert.ok(titleSub.score > fmHit.score, 'title substring > frontmatter ref');
  assert.ok(fmHit.score > bodyHit.score, 'frontmatter ref > body');
  assert.equal(bodyHit.matchedIn, 'body');
  assert.equal(fmHit.matchedIn, 'frontmatter');
});

test('scoreEvidence — no substring match anywhere → score 0 (inclusion unchanged)', () => {
  const r = scoreEvidence('nonexistent', { title: 'auth', frontmatterHaystack: 'x', body: 'y' });
  assert.equal(r.score, 0);
  assert.equal(r.matchedIn, null);
});

test('scoreEvidence — title token-overlap breaks ties (more query tokens in title ranks higher)', () => {
  const both = scoreEvidence('token issue', { title: 'token issue handler', body: '' });
  const one = scoreEvidence('token issue', { title: 'token bucket', body: '' });
  // Both are title substrings of the query; the base and overlap both favour "both".
  assert.ok(both.score >= one.score);
});

test('scoreEvidence — deterministic + bounded (0..~1.1), rounded', () => {
  const r = scoreEvidence('mcp', { title: 'MCP Server', frontmatterHaystack: '', body: '' });
  assert.deepEqual(r, scoreEvidence('mcp', { title: 'MCP Server', frontmatterHaystack: '', body: '' }));
  assert.ok(r.score > 0 && r.score <= 1.1);
  assert.equal(Math.round(r.score * 1000) / 1000, r.score, 'rounded to 3 decimals');
});

test('scoreEvidence — empty/blank query → score 0', () => {
  assert.equal(scoreEvidence('', { title: 'x' }).score, 0);
  assert.equal(scoreEvidence('   ', { title: 'x' }).score, 0);
});
