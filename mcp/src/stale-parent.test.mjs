// Tests for the stale-parent advisory.
//
// The behaviour worth defending is not "it flags things" — it is the set of things
// it refuses to flag. The first version of this module flagged 6 of 7 domains in the
// dogfood vault and every flag was wrong, so most of what follows pins a silence and
// names the case it is protecting.
//
// The dogfood vault is currently silent under this check, which is the correct
// answer for it and also means a real-vault run proves nothing about whether the
// check can fire at all. `plants a defect` below is that proof: it constructs the
// exact history a permanently-green gate would hide.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INSUFFICIENT_HISTORY,
  SUMMARY_KINDS,
  containedSlugs,
  describeStaleParent,
  findStaleParentSummaries,
  lastMovementOf,
  membershipKey,
  staleParentScore,
} from './stale-parent.mjs';

const DAY = 86_400_000;
const BASE = Date.parse('2026-08-01T00:00:00Z');
const at = (days) => new Date(BASE + days * DAY).toISOString();

function domain(slug, children, kind = 'domain') {
  return { slug, frontmatter: { kind, capabilities: children } };
}

/** Newest-first revisions, written oldest-first here because that is how history reads. */
function history(...entries) {
  return [...entries].reverse();
}
const rev = (day, body, children) => ({ changedAt: at(day), body, children });

describe('membershipKey', () => {
  it('ignores order and duplicates so a reorder is not a change', () => {
    assert.equal(membershipKey(['b', 'a']), membershipKey(['a', 'b', 'a']));
  });

  it('separates a real addition from a reorder', () => {
    assert.notEqual(membershipKey(['a', 'b']), membershipKey(['a', 'b', 'c']));
  });

  it('treats blank and missing entries as absent', () => {
    assert.equal(membershipKey(['a', '  ', null, undefined]), membershipKey(['a']));
    assert.equal(membershipKey(undefined), membershipKey([]));
  });
});

describe('containedSlugs', () => {
  it('reads every containment key and counts a slug named twice once', () => {
    const slugs = containedSlugs({ capabilities: ['capabilities/x'], contains: ['capabilities/x'], elements: ['elements/y'] });
    assert.deepEqual(slugs.sort(), ['capabilities/x', 'elements/y']);
  });

  it('is empty for frontmatter with no containment', () => {
    assert.deepEqual(containedSlugs({ kind: 'domain' }), []);
    assert.deepEqual(containedSlugs(null), []);
  });
});

describe('lastMovementOf', () => {
  it('separates the two clocks living in one file', () => {
    const moved = lastMovementOf(
      history(
        rev(0, 'first draft', ['a']),
        rev(3, 'rewritten', ['a']),
        rev(9, 'rewritten', ['a', 'b']),
      ),
    );
    assert.equal(moved.bodyChangedAt, at(3));
    assert.equal(moved.membershipChangedAt, at(9));
  });

  it('reports truncation rather than inventing a birth date', () => {
    const moved = lastMovementOf(history(rev(0, 'same', ['a']), rev(5, 'same', ['a'])));
    assert.equal(moved.truncated, true);
  });

  it('handles a single revision without claiming either clock moved', () => {
    const moved = lastMovementOf([rev(0, 'only', ['a'])]);
    assert.equal(moved.truncated, true);
    assert.equal(moved.bodyChangedAt, at(0));
  });

  it('returns unknown for no history at all', () => {
    assert.deepEqual(lastMovementOf([]), {
      bodyChangedAt: null,
      membershipChangedAt: null,
      truncated: true,
    });
  });
});

describe('findStaleParentSummaries', () => {
  const docs = [domain('domains/a', ['capabilities/x', 'capabilities/y'])];

  it('plants a defect: membership changed after the prose was last written', () => {
    const rows = findStaleParentSummaries({
      docs,
      revisionsOf: () =>
        history(
          rev(0, 'describes one capability', ['capabilities/x']),
          rev(10, 'describes one capability', ['capabilities/x', 'capabilities/y']),
        ),
    });
    assert.equal(rows.length, 1, 'the check must be able to fire at all');
    assert.equal(rows[0].slug, 'domains/a');
    assert.equal(rows[0].behindByMs, 10 * DAY);
  });

  it('stays silent when the prose was re-written after the membership moved', () => {
    const rows = findStaleParentSummaries({
      docs,
      revisionsOf: () =>
        history(
          rev(0, 'old', ['capabilities/x']),
          rev(4, 'old', ['capabilities/x', 'capabilities/y']),
          rev(6, 're-judged to cover both', ['capabilities/x', 'capabilities/y']),
        ),
    });
    assert.deepEqual(rows, []);
  });

  it('stays silent when one commit changed both, which is a re-judgement', () => {
    const rows = findStaleParentSummaries({
      docs,
      revisionsOf: () =>
        history(rev(0, 'old', ['capabilities/x']), rev(7, 'new', ['capabilities/x', 'capabilities/y'])),
    });
    assert.deepEqual(rows, []);
  });

  it('does not flag a child being edited, which is what broke the first version', () => {
    // Membership never moves; only the children's own files would have changed, and
    // those are not in this node's history at all.
    const rows = findStaleParentSummaries({
      docs,
      revisionsOf: () =>
        history(
          rev(0, 'stable description', ['capabilities/x', 'capabilities/y']),
          rev(20, 'stable description', ['capabilities/x', 'capabilities/y']),
        ),
    });
    assert.deepEqual(rows.filter((row) => row.reasonCode !== INSUFFICIENT_HISTORY), []);
  });

  it('does not flag a reordered containment array', () => {
    const rows = findStaleParentSummaries({
      docs,
      revisionsOf: () =>
        history(
          rev(0, 'text', ['capabilities/x', 'capabilities/y']),
          rev(11, 'text', ['capabilities/y', 'capabilities/x']),
        ),
    });
    assert.deepEqual(rows.filter((row) => row.reasonCode !== INSUFFICIENT_HISTORY), []);
  });

  it('flags a removal as readily as an addition', () => {
    const rows = findStaleParentSummaries({
      docs,
      revisionsOf: () =>
        history(
          rev(0, 'covers both', ['capabilities/x', 'capabilities/y']),
          rev(5, 'covers both', ['capabilities/x']),
        ),
    });
    assert.equal(rows.length, 1);
  });

  it('ignores kinds whose body is not an aggregate of their membership', () => {
    const rows = findStaleParentSummaries({
      docs: [domain('elements/e', ['capabilities/x'], 'element')],
      revisionsOf: () => history(rev(0, 'a', ['capabilities/x']), rev(9, 'a', ['capabilities/x', 'capabilities/z'])),
    });
    assert.deepEqual(rows, []);
    assert.ok(!SUMMARY_KINDS.includes('element'));
  });

  it('says nothing about a summary node that contains nothing', () => {
    const rows = findStaleParentSummaries({
      docs: [{ slug: 'domains/empty', frontmatter: { kind: 'domain' } }],
      revisionsOf: () => history(rev(0, 'a', []), rev(9, 'b', [])),
    });
    assert.deepEqual(rows, []);
  });

  it('skips a node whose history is unavailable rather than guessing', () => {
    assert.deepEqual(findStaleParentSummaries({ docs, revisionsOf: () => [] }), []);
    assert.deepEqual(findStaleParentSummaries({ docs }), []);
  });

  it('orders by how far behind the description is, then by slug', () => {
    const lags = { 'domains/near': 2, 'domains/far': 30, 'domains/mid': 30 };
    const rows = findStaleParentSummaries({
      docs: Object.keys(lags).map((slug) => domain(slug, ['capabilities/x'])),
      revisionsOf: (slug) =>
        history(rev(0, 'text', ['capabilities/x']), rev(lags[slug], 'text', ['capabilities/x', 'capabilities/y'])),
    });
    assert.deepEqual(
      rows.map((row) => row.slug),
      ['domains/far', 'domains/mid', 'domains/near'],
    );
  });

  it('is stable across input order', () => {
    const many = [domain('domains/b', ['capabilities/x']), domain('domains/a', ['capabilities/x'])];
    const revisionsOf = () =>
      history(rev(0, 't', ['capabilities/x']), rev(8, 't', ['capabilities/x', 'capabilities/y']));
    assert.deepEqual(
      findStaleParentSummaries({ docs: many, revisionsOf }),
      findStaleParentSummaries({ docs: [...many].reverse(), revisionsOf }),
    );
  });
});

describe('staleParentScore', () => {
  it('ranks a long lag above a short one', () => {
    assert.ok(staleParentScore({ behindByMs: 20 * DAY }) > staleParentScore({ behindByMs: 2 * DAY }));
  });

  it('saturates so one ancient lag cannot crowd out everything else', () => {
    assert.equal(staleParentScore({ behindByMs: 400 * DAY }), 1);
  });

  it('is zero without a lag', () => {
    assert.equal(staleParentScore({ reasonCode: INSUFFICIENT_HISTORY }), 0);
    assert.equal(staleParentScore(undefined), 0);
  });
});

describe('describeStaleParent', () => {
  it('names the lag and asks for a judgement rather than proposing a rewrite', () => {
    const message = describeStaleParent({ slug: 'domains/a', childCount: 3, behindByMs: 10 * DAY });
    assert.match(message, /domains\/a/);
    assert.match(message, /10 day/);
    assert.match(message, /re-judge/);
    assert.match(message, /nothing is blocked/);
    assert.doesNotMatch(message, /regenerate|rewrite it for you/i);
  });

  it('explains insufficient history instead of implying staleness', () => {
    const message = describeStaleParent({ slug: 'domains/a', childCount: 2, reasonCode: INSUFFICIENT_HISTORY });
    assert.match(message, /does not go back far enough/);
  });
});
