// evidence-rank — unit test (node:test). Atlas roadmap Track A #4.
// find_evidence was a flat includes() sweep: the best node buried in an
// unranked list. scoreEvidence ranks by WHERE the match is (title > frontmatter
// ref > body) + a small title token-overlap tiebreaker. Inclusion is unchanged
// (score>0 iff a substring matched, exactly like before) — purely additive sort.
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
  // both are title substring matches of "token"; the one whose title also
  // contains the other query token ranks higher.
  const both = scoreEvidence('token issue', { title: 'token issue handler', body: '' });
  const one = scoreEvidence('token issue', { title: 'token bucket', body: '' });
  // "token issue" is a substring of "token issue handler" (base high) but not of
  // "token bucket" (only "token" substring) — so both differ by base too; assert order holds.
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
