import { describe, expect, it } from 'vitest';

import { parseArchitectureProfile } from '@/entities/architecture-profile';

import { FSD_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import type { RoleConcept } from './role-concepts';
import { buildRoleMembers, conceptModuleName, patternPathLabel } from './role-members';

function concept(slug: string, path: string): RoleConcept {
  return { slug, title: slug, kind: 'element', path, dependsOn: [], relatesTo: [] };
}

describe('a role band holds', () => {
  const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER);

  it('the listed source modules when the source can be listed', () => {
    const members = buildRoleMembers(
      profile,
      { views: [{ name: 'home', path: 'src/views/home', kind: 'dir' }] },
      { views: [concept('elements/library', 'src/views/library/ui/Page.tsx')] },
    );
    expect(members.views).toEqual({ names: ['home'], source: 'modules' });
  });

  it('the modules recorded concepts sit in, most recorded first, without a listing', () => {
    const members = buildRoleMembers(profile, null, {
      views: [
        concept('elements/a', 'src/views/library/ui/A.tsx'),
        concept('elements/b', 'src/views/home/ui/B.tsx'),
        concept('elements/c', 'src/views/library/model/c.ts'),
      ],
    });
    expect(members.views).toEqual({ names: ['library', 'home'], source: 'concepts' });
    expect(members.shared).toEqual({ names: [], source: 'none' });
  });
});

describe('the module a concept sits in', () => {
  it.each([
    ['src/views/home/ui/Map.tsx', 'src/views/**', 'home'],
    ['app/[locale]/layout.tsx', 'app/**', '[locale]'],
    ['services/checkout/domain/order.ts', 'services/*/domain/**', 'checkout/domain'],
    ['services/checkout/adapters/order.ts', 'services/*/domain/**', null],
    ['lib/other/x.ts', 'src/views/**', null],
  ])('%s under %s is %s', (path, pattern, expected) => {
    expect(conceptModuleName(path, pattern)).toBe(expected);
  });

  it('prints a pattern as the path it covers', () => {
    expect(patternPathLabel('src/views/**')).toBe('src/views');
    expect(patternPathLabel('services/*/domain/**')).toBe('services/*/domain');
  });
});
