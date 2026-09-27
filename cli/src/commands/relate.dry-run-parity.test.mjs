// `--dry-run` must give the same answer as the real command: an agent follows a green preview with
// the real call. Both paths now call the same pure refusal rule.

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
