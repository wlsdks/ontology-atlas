import { describe, expect, it } from 'vitest';
import {
  appendProvenance,
  planBlockImport,
  prefixBlockSlug,
  type BlockImportFile,
} from './merge-plan';

const OPTS = {
  resolution: 'skip' as const,
  blockName: 'Auth Block',
  sourceProject: 'ontology-atlas',
};

function file(path: string, raw: string): BlockImportFile {
  return { path, raw };
}

const CAP = file(
  'capabilities/login.md',
  '---\nslug: capabilities/login\nkind: capability\ntitle: Login\n---\n\n# Login\n\nBody with [[capabilities/session]] ref.\n',
);
const SESSION = file(
  'capabilities/session.md',
  '---\nslug: capabilities/session\nkind: capability\ntitle: Session\n---\n\n# Session\n',
);

describe('planBlockImport — dry-run contract', () => {
  it('is pure: reports new nodes without mutating inputs and produces writes only as data', () => {
    const files = [CAP, SESSION];
    const rawBefore = files.map((f) => f.raw);
    const existing = new Set<string>();

    const plan = planBlockImport(files, existing, OPTS);

    // 입력 미변경 — dry-run 은 데이터만 반환한다.
    expect(files.map((f) => f.raw)).toEqual(rawBefore);
    expect(existing.size).toBe(0);
    expect(plan.newCount).toBe(2);
    expect(plan.conflictCount).toBe(0);
    expect(plan.writes.map((w) => w.slug)).toEqual([
      'capabilities/login',
      'capabilities/session',
    ]);
  });

  it('detects slug conflicts against the vault and, with skip resolution, excludes them from writes', () => {
    const plan = planBlockImport(
      [CAP, SESSION],
      new Set(['capabilities/login']),
      OPTS,
    );

    expect(plan.conflictCount).toBe(1);
    expect(plan.newCount).toBe(1);
    const conflicted = plan.entries.find((e) => e.originalSlug === 'capabilities/login');
    expect(conflicted?.status).toBe('conflict-skipped');
    expect(conflicted?.finalSlug).toBeNull();
    expect(plan.writes.map((w) => w.slug)).toEqual(['capabilities/session']);
  });

  it('reports kindless files without planning a write (CLI import parity — kind 없으면 skip)', () => {
    const plan = planBlockImport(
      [file('notes/loose.md', '# Loose note\n')],
      new Set(),
      OPTS,
    );
    expect(plan.kindlessCount).toBe(1);
    expect(plan.writes).toEqual([]);
    expect(plan.entries[0]?.status).toBe('kindless');
  });

  it('detects conflicts inside the same batch (two files claiming one slug)', () => {
    const dup = file('other/login.md', '---\nslug: capabilities/login\nkind: capability\ntitle: Dup\n---\nBody\n');
    const plan = planBlockImport([CAP, dup], new Set(), OPTS);
    expect(plan.conflictCount).toBe(1);
    expect(plan.newCount).toBe(1);
  });

  it('falls back to the file path (without .md) when frontmatter has no slug', () => {
    const noSlug = file('domains/views.md', '---\nkind: domain\ntitle: Views\n---\nBody\n');
    const plan = planBlockImport([noSlug], new Set(), OPTS);
    expect(plan.writes[0]?.slug).toBe('domains/views');
  });
});

describe('planBlockImport — prefix resolution', () => {
  const PREFIX_OPTS = { ...OPTS, resolution: 'prefix' as const };

  it('renames conflicting slugs with the slugified block name on the last segment', () => {
    const plan = planBlockImport(
      [CAP, SESSION],
      new Set(['capabilities/login']),
      PREFIX_OPTS,
    );

    const renamed = plan.entries.find((e) => e.originalSlug === 'capabilities/login');
    expect(renamed?.status).toBe('conflict-renamed');
    expect(renamed?.finalSlug).toBe('capabilities/auth-block-login');
    expect(plan.writes.map((w) => w.slug)).toEqual([
      'capabilities/auth-block-login',
      'capabilities/session',
    ]);
  });

  it('rewrites intra-block wikilink refs to a renamed slug and updates the frontmatter slug key', () => {
    const plan = planBlockImport(
      [CAP, SESSION],
      new Set(['capabilities/session']),
      PREFIX_OPTS,
    );

    // session 이 리네임됐으니 login 본문의 [[capabilities/session]] 도 따라간다.
    const login = plan.writes.find((w) => w.slug === 'capabilities/login');
    expect(login?.content).toContain('[[capabilities/auth-block-session]]');
    const session = plan.writes.find((w) => w.slug === 'capabilities/auth-block-session');
    expect(session?.content).toContain('slug: capabilities/auth-block-session');
  });

  it('suffixes -2 when even the prefixed slug is taken (CLI --rename parity)', () => {
    const plan = planBlockImport(
      [CAP],
      new Set(['capabilities/login', 'capabilities/auth-block-login']),
      PREFIX_OPTS,
    );
    expect(plan.writes[0]?.slug).toBe('capabilities/auth-block-login-2');
  });

  it('does not double-prefix a slug that already carries the block prefix', () => {
    expect(prefixBlockSlug('capabilities/auth-block-login', 'auth-block')).toBe(
      'capabilities/auth-block-login',
    );
    expect(prefixBlockSlug('capabilities/login', 'auth-block')).toBe(
      'capabilities/auth-block-login',
    );
  });
});

describe('provenance', () => {
  it('appends exactly one provenance quote line at the end of the content', () => {
    const out = appendProvenance('# Title\n\nBody\n', 'Auth Block', 'ontology-atlas');
    expect(out.endsWith('\n> Imported from block "Auth Block" (ontology-atlas)\n')).toBe(true);
  });

  it('every planned write carries the provenance line', () => {
    const plan = planBlockImport([CAP, SESSION], new Set(), OPTS);
    for (const w of plan.writes) {
      expect(w.content).toContain('> Imported from block "Auth Block" (ontology-atlas)');
    }
  });
});
