import { describe, expect, it } from 'vitest';
import { deriveBootstrapPlan } from './bootstrap-candidates';
import { executeBootstrapPlan, type BootstrapVaultWriter } from './execute-bootstrap-plan';

type Call =
  | { op: 'updateFrontmatter'; slug: string; updates: Record<string, unknown>; skipRefresh: boolean }
  | { op: 'createDoc'; slug: string; content: string; skipRefresh: boolean }
  | { op: 'refresh' };

function fakeVault(docs: Array<{ slug: string; frontmatter: Record<string, unknown> }>) {
  const calls: Call[] = [];
  const vault: BootstrapVaultWriter = {
    manifest: { docs },
    async updateFrontmatter(slug, updates, opts) {
      calls.push({ op: 'updateFrontmatter', slug, updates, skipRefresh: opts?.skipRefresh === true });
    },
    async createDoc(slug, content, opts) {
      calls.push({ op: 'createDoc', slug, content, skipRefresh: opts?.skipRefresh === true });
    },
    async refresh() {
      calls.push({ op: 'refresh' });
    },
  };
  return { vault, calls };
}

const doc = (slug: string, fm: Record<string, unknown> = {}, title = slug) => ({
  slug,
  title,
  frontmatter: fm,
});

describe('executeBootstrapPlan batch write contract', () => {
  it('mints a UID for a document receiving kind for the first time and keeps an existing UID', async () => {
    const preservedUid = '01890f3e-7b5d-4c0a-8f14-123456789abc';
    const docs = [
      doc('guides/missing'),
      doc('guides/preserved', { uid: preservedUid }),
    ];
    const { vault, calls } = fakeVault(docs);
    const plan = deriveBootstrapPlan(docs, 'my-vault');

    await executeBootstrapPlan(vault, plan, {
      projectTitle: 'My Vault',
      acceptedDomains: new Set(['guides']),
    });

    const missing = calls.find((call) => call.op === 'updateFrontmatter' && call.slug === 'guides/missing');
    const preserved = calls.find((call) => call.op === 'updateFrontmatter' && call.slug === 'guides/preserved');
    expect(missing && missing.op === 'updateFrontmatter' ? missing.updates.uid : null).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(preserved && preserved.op === 'updateFrontmatter' ? preserved.updates.uid : null).toBe(
      preservedUid,
    );
  });

  it('skips refresh on every write and refreshes exactly once at the end', async () => {
    const docs = [doc('guides/a'), doc('guides/b')];
    const { vault, calls } = fakeVault(docs);
    const plan = deriveBootstrapPlan(docs, 'my-vault');

    const result = await executeBootstrapPlan(vault, plan, {
      projectTitle: 'My Vault',
      acceptedDomains: new Set(['guides']),
    });

    expect(result).toMatchObject({ addedToExisting: false, elementCount: 2 });
    const refreshes = calls.filter((c) => c.op === 'refresh');
    expect(refreshes).toHaveLength(1);
    expect(calls[calls.length - 1].op).toBe('refresh');
    for (const call of calls) {
      if (call.op !== 'refresh') expect(call.skipRefresh).toBe(true);
    }
  });

  it('creates an approved domain as a .md file unless a same-named domain document exists', async () => {
    const docs = [doc('guides/a'), doc('guides/guides', { kind: 'domain' })];
    const { vault, calls } = fakeVault(docs);
    const plan = deriveBootstrapPlan(docs, 'x');

    await executeBootstrapPlan(vault, plan, { projectTitle: 'x', acceptedDomains: new Set(['guides']) });

    expect(calls.filter((c) => c.op === 'createDoc' && c.slug === 'guides/guides')).toHaveLength(0);
  });

  it('merges domains into an existing kind project instead of creating a file', async () => {
    const docs = [
      doc('project', { kind: 'project', title: 'P', domains: ['old'] }),
      doc('guides/a'),
    ];
    const { vault, calls } = fakeVault(docs);
    const plan = deriveBootstrapPlan(docs, 'x');

    const result = await executeBootstrapPlan(vault, plan, {
      projectTitle: 'P',
      acceptedDomains: new Set(['guides']),
    });

    expect(result?.addedToExisting).toBe(true);
    const projectWrite = calls.find((c) => c.op === 'updateFrontmatter' && c.slug === 'project');
    const projectUpdates = projectWrite && projectWrite.op === 'updateFrontmatter' ? projectWrite.updates : null;
    expect(projectUpdates).toMatchObject({
      domains: ['old', 'guides'],
    });
    expect(projectUpdates?.uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(calls.filter((c) => c.op === 'createDoc' && c.slug === plan.projectSlug)).toHaveLength(0);
  });

  it('writes nothing and returns null without a manifest', async () => {
    const { vault, calls } = fakeVault([]);
    vault.manifest = null;
    const plan = deriveBootstrapPlan([], 'x');
    expect(await executeBootstrapPlan(vault, plan, { projectTitle: 'x', acceptedDomains: new Set() })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
