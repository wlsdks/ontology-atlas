import { describe, expect, it } from 'vitest';

import { FSD_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { deriveRoleOccupants } from './architecture-occupants';
import { parseArchitectureProfile } from './architecture-profile';

const profile = parseArchitectureProfile(FSD_PROFILE_FRONTMATTER as Record<string, unknown>);

const doc = (slug: string, frontmatter: Record<string, unknown>) => ({ slug, frontmatter });

describe('deriveRoleOccupants', () => {
  it('places concepts into every role whose globs match their path', () => {
    const byRole = deriveRoleOccupants(profile, [
      doc('elements/home', { kind: 'element', title: 'Home', path: 'src/views/home', uid: 'u1' }),
      doc('capabilities/mcp', { kind: 'capability', title: 'MCP Server', path: 'mcp/src' }),
      doc('elements/cn', { kind: 'element', title: 'cn', path: 'src/shared/lib/cn.ts' }),
    ]);
    expect(byRole.views!.map((o) => o.slug)).toEqual(['elements/home']);
    expect(byRole.shared!.map((o) => o.slug)).toEqual(['elements/cn']);
    // mcp/src is outside every role glob: present in the vault, absent from the blueprint.
    expect(Object.values(byRole).flat().some((o) => o.slug === 'capabilities/mcp')).toBe(false);
  });

  it('ignores docs without a path and kinds that are meaning, not placement', () => {
    const byRole = deriveRoleOccupants(profile, [
      doc('elements/pathless', { kind: 'element', title: 'Pathless' }),
      doc('elements/blank', { kind: 'element', title: 'Blank', path: '   ' }),
      doc('domains/ui', { kind: 'domain', title: 'UI', path: 'src/views/home' }),
      doc('project', { kind: 'project', title: 'P', path: 'src/views/home' }),
    ]);
    expect(Object.values(byRole).flat()).toEqual([]);
  });

  it('lists an overlap under both roles instead of silently resolving it', () => {
    const overlapping = parseArchitectureProfile({
      ...FSD_PROFILE_FRONTMATTER,
      role_views: ['src/views/**', 'src/widgets/**'],
    } as Record<string, unknown>);
    const byRole = deriveRoleOccupants(overlapping, [
      doc('elements/rail', { kind: 'element', title: 'Rail', path: 'src/widgets/app-nav-rail' }),
    ]);
    expect(byRole.views!.map((o) => o.slug)).toEqual(['elements/rail']);
    expect(byRole.widgets!.map((o) => o.slug)).toEqual(['elements/rail']);
  });

  it('orders a role by path then slug, stable across input order', () => {
    const docs = [
      doc('elements/b', { kind: 'element', title: 'B', path: 'src/views/beta' }),
      doc('elements/a', { kind: 'element', title: 'A', path: 'src/views/alpha' }),
      doc('elements/a2', { kind: 'element', title: 'A2', path: 'src/views/alpha' }),
    ];
    const forward = deriveRoleOccupants(profile, docs);
    const reversed = deriveRoleOccupants(profile, [...docs].reverse());
    expect(forward.views!.map((o) => o.slug)).toEqual(['elements/a', 'elements/a2', 'elements/b']);
    expect(reversed.views).toEqual(forward.views);
  });

  it('falls back to the slug when a title is missing, and keeps a normalized path', () => {
    const byRole = deriveRoleOccupants(profile, [
      doc('elements/untitled', { kind: 'element', path: './src/views/untitled/' }),
    ]);
    expect(byRole.views![0]).toMatchObject({
      slug: 'elements/untitled',
      title: 'elements/untitled',
      uid: null,
      path: 'src/views/untitled',
    });
  });
});
