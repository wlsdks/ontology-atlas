// `--dry-run` must give the same answer the real command gives.
//
// **Why** (measured 2026-08-16): the same arguments called twice gave opposite answers:
//
//   relate … --dry-run   → `dry-run would write …` · `safe_to_add` · exit 0
//   relate …             → `error  why is required …`             · exit 1
//
// A preview's only use is **knowing the outcome before doing it for real**. Saying
// «will write» about something that will be refused is not a preview, it is a
// wrong forecast — above all when the caller is an agent rather than a person,
// because a green preview is followed by the real call.
//
// The cause was that the refusal rule lived **inside the writing function**. A dry
// run never calls it, so it could not help but skip the rule. The rule was
// extracted as a pure function so **both paths call the same thing**.

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { relationWriteRefusal } from './relate.mjs';

describe('relate dry-run and write apply the same rules', () => {
  it('both reject a new dependency without evidence', () => {
    const refusal = relationWriteRefusal({
      frontmatter: {},
      relation: 'dependencies',
      to: 'capabilities/mcp-server',
      why: null,
    });
    assert.ok(refusal, 'a rejection reason is required');
    assert.match(refusal, /why/i);
  });

  it('both accept a dependency with evidence', () => {
    assert.equal(
      relationWriteRefusal({
        frontmatter: {},
        relation: 'dependencies',
        to: 'capabilities/mcp-server',
        why: 'ACP 세션이 이 서버를 주입받아 도구를 얻는다',
      }),
      null,
    );
  });

  it('both reject a domain when another domain is already set', () => {
    const refusal = relationWriteRefusal({
      frontmatter: { domain: 'domains/auth' },
      relation: 'domain',
      to: 'domains/payment',
      why: null,
    });
    assert.ok(refusal);
    assert.match(refusal, /domains\/auth/);
  });

  it('accepts rewriting the same domain', () => {
    assert.equal(
      relationWriteRefusal({
        frontmatter: { domain: 'domains/auth' },
        relation: 'domain',
        to: 'domains/auth',
        why: null,
      }),
      null,
    );
  });

  it('does not require evidence for a non-dependency relation', () => {
    assert.equal(
      relationWriteRefusal({ frontmatter: {}, relation: 'relates', to: 'x/y', why: null }),
      null,
    );
  });

  it('judges the frontmatter key spelling the same as the relation type', () => {
    assert.ok(
      relationWriteRefusal({ frontmatter: {}, relation: 'depends_on', to: 'x/y', why: '' }),
      'depends_on must follow the dependencies rules',
    );
  });
});
