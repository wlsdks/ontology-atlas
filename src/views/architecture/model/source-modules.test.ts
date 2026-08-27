import { describe, expect, it } from 'vitest';

import { FSD_PROFILE_FRONTMATTER, HEXAGONAL_PROFILE_FRONTMATTER } from '../../../../tests/fixtures/architecture-profile-cases.mjs';
import { parseArchitectureProfile } from '@/entities/architecture-profile';
import { deriveRoleSourceModules, listPatternModules, type SourceDirEntry } from './source-modules';

/** A tiny in-memory tree: path → entries. Missing path = missing directory. */
function lister(tree: Record<string, SourceDirEntry[]>) {
  return async (relativePath: string) => tree[relativePath] ?? null;
}

const dir = (name: string): SourceDirEntry => ({ name, kind: 'dir' });
const file = (name: string): SourceDirEntry => ({ name, kind: 'file' });

describe('listPatternModules', () => {
  it('lists a concrete base pattern as its children, not as itself', async () => {
    const modules = await listPatternModules('src/views/**', lister({
      'src/views': [dir('home'), dir('architecture'), file('index.ts')],
    }));
    expect(modules.map((m) => m.path)).toEqual([
      'src/views/home',
      'src/views/architecture',
      'src/views/index.ts',
    ]);
    expect(modules[0]).toMatchObject({ name: 'home', kind: 'dir' });
  });

  it('lists a branched pattern as its concrete branches, named branch-relative', async () => {
    const modules = await listPatternModules('services/*/domain/**', lister({
      services: [dir('checkout'), dir('billing'), file('README.md')],
      'services/checkout/domain': [file('order.ts')],
      // billing has no domain directory: listing it returns null, so it is absent, not empty.
    }));
    expect(modules).toEqual([
      { name: 'checkout/domain', path: 'services/checkout/domain', kind: 'dir' },
    ]);
  });

  it('treats a wildcard leaf as the matching entries themselves', async () => {
    const modules = await listPatternModules('src/shared/*', lister({
      'src/shared': [dir('ui'), dir('lib'), file('index.ts')],
    }));
    expect(modules.map((m) => m.name)).toEqual(['ui', 'lib', 'index.ts']);
  });

  it('returns nothing when the base directory does not exist', async () => {
    expect(await listPatternModules('src/views/**', lister({}))).toEqual([]);
  });
});

describe('deriveRoleSourceModules', () => {
  it('fills each role from the real tree and applies the profile excludes', async () => {
    const profile = parseArchitectureProfile({
      ...FSD_PROFILE_FRONTMATTER,
      exclude_paths: ['**/legacy'],
    } as Record<string, unknown>);
    const byRole = await deriveRoleSourceModules(profile, lister({
      app: [dir('[locale]'), file('globals.css')],
      'src/views': [dir('home'), dir('legacy')],
      'src/app': [], 'src/widgets': [], 'src/features': [], 'src/entities': [], 'src/shared': [],
    }));
    expect(byRole.routing!.map((m) => m.name)).toEqual(['[locale]', 'globals.css']);
    // The excluded module is filtered with the shared glob dialect, not shown as occupied.
    expect(byRole.views!.map((m) => m.name)).toEqual(['home']);
    expect(byRole.widgets).toEqual([]);
  });

  it('dedupes a module that two globs of one role both reach', async () => {
    const profile = parseArchitectureProfile({
      ...HEXAGONAL_PROFILE_FRONTMATTER,
      role_domain: ['src/payments/domain/**', 'src/payments/domain/*'],
    } as Record<string, unknown>);
    const byRole = await deriveRoleSourceModules(profile, lister({
      'src/payments/domain': [dir('model')],
    }));
    expect(byRole.domain).toEqual([
      { name: 'model', path: 'src/payments/domain/model', kind: 'dir' },
    ]);
  });
});
