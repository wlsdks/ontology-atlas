import { describe, expect, it } from 'vitest';

import { parseConceptFilter } from './concept-filter';
import type { VaultReadDoc } from './vault-read-port';

const doc = (overrides: Partial<VaultReadDoc> & Pick<VaultReadDoc, 'slug' | 'kind'>): VaultReadDoc => ({
  path: `${overrides.slug}.md`,
  title: overrides.slug,
  frontmatter: {},
  ...overrides,
});

const login = doc({ slug: 'capabilities/login', kind: 'capability', title: 'Log in', domain: 'domains/auth', frontmatter: { dependencies: ['elements/session'] } });
const logout = doc({ slug: 'capabilities/logout', kind: 'capability', title: 'Log out', domain: 'domains/auth', frontmatter: { created_by: 'agent:codex' } });
const auth = doc({ slug: 'domains/auth', kind: 'domain', title: 'Auth' });

describe('parseConceptFilter', () => {
  it('lets AND bind tighter than OR and NOT negate one atom', () => {
    const predicate = parseConceptFilter('kind=domain OR kind=capability AND NOT has(dependencies)');
    expect([login, logout, auth].filter((row) => predicate.match(row)).map((row) => row.slug)).toEqual(['capabilities/logout', 'domains/auth']);
  });

  it('reads the depends_on alias, quoted values and created_by', () => {
    expect(parseConceptFilter('has(depends_on)').match(login)).toBe(true);
    expect(parseConceptFilter('title="Log out"').match(logout)).toBe(true);
    expect(parseConceptFilter('created_by="agent:codex"').match(logout)).toBe(true);
    expect(parseConceptFilter('domain!=domains/auth').match(auth)).toBe(true);
  });

  it('names what it cannot read instead of matching nothing', () => {
    expect(() => parseConceptFilter('knd=capability')).toThrow(/key must be one of/);
    expect(() => parseConceptFilter('has(capabilties)')).toThrow(/has key must be one of/);
    expect(() => parseConceptFilter('kind=')).toThrow(/expects a value/);
    expect(() => parseConceptFilter('(kind=domain')).toThrow(/closing parenthesis/);
  });
});
