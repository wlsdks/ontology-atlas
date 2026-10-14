import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import {
  buildOntologyRelationEditPlan,
  IMPACT_EDIT_RELATIONS,
  RELATION_EDGE_TYPE,
  type MeaningEditRelation,
} from '@/entities/knowledge-graph';
import { looksLikeCodePath } from '@/shared/lib/concept-display/humanize-code-path-title';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

import { buildCompactAgentBrief } from '../../../mcp/src/agent-brief-compact.mjs';
import { compileOntology } from '../../../mcp/src/ontology-compiler.mjs';
import { queryCompiledOntology } from '../../../mcp/src/ontology-engine.mjs';
import { buildProjectSourceReceipt } from '../../../mcp/src/project-source-mint.mjs';
import { deriveProjectSourceWitnessesFromDocs } from '../../../mcp/src/project-source-witnesses.mjs';
import { loadVaultDocs } from '../../../mcp/src/vault/documents.mjs';

/**
 * Help naming a consumer is worth reading only if the consumer does what it says.
 * Each case runs that consumer on a fixture, so moving code stays green and
 * changing what the consumer does turns red.
 */

const ROOT = resolve(__dirname, '../../..');
const LOCALES = readdirSync(resolve(ROOT, 'messages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const catalog = (locale: string) =>
  JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), 'utf8'));

const EDITOR_RELATIONS = Object.keys(RELATION_EDGE_TYPE) as MeaningEditRelation[];
const TARGET = 'capabilities/target';
const sourceOf = (relation: MeaningEditRelation) => `capabilities/source-${relation.toLowerCase()}`;
const goneOf = (relation: MeaningEditRelation) => `capabilities/gone-${relation.toLowerCase()}`;
let uidSerial = 0;
const doc = (title: string) =>
  `---\nuid: 01890f3e-7b5d-4c0a-8f14-${String(++uidSerial).padStart(12, '0')}\nkind: capability\ntitle: ${title}\n---\n\n${title} body.\n`;

/** Writes one relation line the way the map's editor does: plan, then patch the file. */
function writeRelation(raw: string, sourceSlug: string, relation: MeaningEditRelation, targetSlug: string) {
  const plan = buildOntologyRelationEditPlan({
    sourceSlug,
    targetSlug,
    fromRelation: null,
    toRelation: relation,
    why: 'Fixture reason.',
    frontmatter: parseFrontmatter(raw).frontmatter,
  });
  return applyFrontmatterUpdates(raw, plan.updates);
}

// Every editor relation points at a target that exists and at one whose file
// was later deleted: the dangling line a person meets in a real folder.
const vault = mkdtempSync(join(tmpdir(), 'field-help-'));
mkdirSync(join(vault, 'capabilities'));
writeFileSync(join(vault, `${TARGET}.md`), doc('Target'));
for (const relation of EDITOR_RELATIONS) {
  const slug = sourceOf(relation);
  const raw = writeRelation(writeRelation(doc(slug), slug, relation, TARGET), slug, relation, goneOf(relation));
  writeFileSync(join(vault, `${slug}.md`), raw);
}
const artifact = compileOntology(loadVaultDocs(vault)) as {
  nodes: { slug: string }[];
  edges: { from: string; to: string }[];
  issues: { code: string; slug?: string; severity: string; ref?: string }[];
};

type ValidateReport = { problems: { slug: string; issues: { code: string; severity: string }[] }[] };
let validateVaultReport: (input: object) => ValidateReport;
beforeAll(async () => {
  // validate_vault resolves its folder from OATLAS_VAULT when its module loads.
  vi.stubEnv('OATLAS_VAULT', vault);
  ({ validateVaultReport } = await import('../../../mcp/src/tools/validate-vault.mjs'));
});
afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(vault, { recursive: true, force: true });
});

describe('relation help: each line is one connection, and a missing target only warns', () => {
  it.each(EDITOR_RELATIONS)('%s becomes one edge and its missing target is a warning', (relation) => {
    const slug = sourceOf(relation);
    expect(artifact.nodes.map((node) => node.slug)).toContain(slug);
    expect(artifact.edges.filter((edge) => edge.from === slug && edge.to === TARGET)).toHaveLength(1);

    const compiled = artifact.issues.filter(
      (issue) => issue.code === 'dangling-graph-reference' && issue.slug === slug,
    );
    expect(compiled).toEqual([expect.objectContaining({ severity: 'warning', ref: goneOf(relation) })]);

    const reported = validateVaultReport({}).problems.find((problem) => problem.slug === slug)?.issues ?? [];
    const dangling = reported.filter((issue) => issue.code === 'dangling-graph-reference');
    expect(dangling.map((issue) => issue.severity)).toEqual(['warning']);
  });
});

describe('target help names exactly the relations an impact query follows', () => {
  it('the relations the help is built from are the ones impact traversal reaches', () => {
    const reached = new Set(
      queryCompiledOntology(artifact, { operation: 'impact', slug: TARGET }).nodes.map(
        (node: { slug: string }) => node.slug,
      ),
    );
    const walked = EDITOR_RELATIONS.filter((relation) => reached.has(sourceOf(relation)));
    expect(walked.length).toBeGreaterThan(0);
    expect(IMPACT_EDIT_RELATIONS).toEqual(walked);
  });
});

describe('code-location help: each listed path is checked against the connected code folder', () => {
  // Both verdicts occur, so the page's filter and the witness filter are compared on each.
  const ELEMENTS = ['src/b.ts', 'packages/core/index', 'notes/guide.md', 'elements/role', 'capabilities/x', 'readme.md', 'src/a b.ts'];
  const docs = [
    { slug: 'project', frontmatter: { kind: 'project', title: 'Project' }, body: '' },
    { slug: 'capabilities/a', frontmatter: { kind: 'capability', title: 'A', path: 'src/a.ts', elements: ELEMENTS }, body: '' },
  ];
  const witnesses: { path: string }[] = deriveProjectSourceWitnessesFromDocs({ projectSlug: 'project', docs });
  const witnessed = witnesses.map((witness) => witness.path);
  const receipt = (files: string[]) =>
    buildProjectSourceReceipt({
      projectSlug: 'project',
      probe: { sourceId: 'source', kind: 'git', revision: 'r1', fingerprint: 'f1', files, truncated: false },
      witnesses,
      graphHash: 'graph',
      measuredAt: '2026-01-01T00:00:00.000Z',
    });

  it('witnesses `path:` and exactly the `elements:` entries the page lists under the help', () => {
    expect(new Set(ELEMENTS.map(looksLikeCodePath)).size).toBe(2);
    expect(witnessed.sort()).toEqual(['src/a.ts', ...ELEMENTS.filter(looksLikeCodePath)].sort());
  });

  it('a missing path leaves the document for review; all present confirms it', () => {
    const missing = receipt(witnessed.filter((path) => path !== 'src/b.ts'));
    expect(missing.status).toBe('review_required');
    expect(missing.topGap).toEqual({ id: 'declared_source_path_missing', nodeSlug: 'capabilities/a' });
    expect(receipt(witnessed).status).toBe('verified_current');
  });
});

describe('the compact agent brief reads Definition, Includes and Excludes', () => {
  const project = { slug: 'project', frontmatter: { kind: 'project', title: 'Operations' }, body: 'Local operations.' };
  const focus = (title: string, body: string, task = 'Rotate encryption keys.') => {
    const docs = [project, { slug: 'capabilities/catalog', frontmatter: { kind: 'capability', title }, body }];
    return buildCompactAgentBrief({
      brief: { projectSlug: 'project', meaningRepair: { workflow: [], stopWhen: ['source_not_current'] } },
      artifact: { nodes: docs.map((d) => ({ slug: d.slug, ...d.frontmatter })), edges: [] },
      docs,
      task,
    }).focus;
  };

  it('Definition supplies the statement', () => {
    expect(focus('Encryption Keys', '## Definition\n\nRotate encryption keys.').capability?.statement)
      .toBe('Rotate encryption keys.');
    expect(focus('Encryption Keys', '## Notes\n\nRotate encryption keys.').capability?.statement).toBe('');
  });

  it('Includes qualifies a capability its title alone would not', () => {
    expect(focus('Archive Catalog', '## Includes\n\nRotate encryption keys.').capability?.slug)
      .toBe('capabilities/catalog');
    expect(focus('Archive Catalog', '## Notes\n\nRotate encryption keys.').capability?.slug).toBeUndefined();
  });

  it('Excludes withdraws a claim and settles a stated non-goal', () => {
    const includes = '## Includes\n\nRotate encryption keys. Send mail.';
    const task = 'Rotate encryption keys. Do not send mail.';
    expect(focus('Archive Catalog', includes, task).refusal?.reason).toBe('boundary_conflict');
    expect(focus('Archive Catalog', `${includes}\n\n## Excludes\n\nSend mail.`, task).capability?.slug)
      .toBe('capabilities/catalog');
    expect(focus('Archive Catalog', '## Includes\n\nRotate encryption keys.\n\n## Excludes\n\nRotate encryption keys.')
      .capability?.slug).toBeUndefined();
  });
});

it('each consumer help string is authored in every locale', () => {
  expect(LOCALES.length).toBeGreaterThan(1);
  for (const locale of LOCALES) {
    const messages = catalog(locale);
    for (const help of [
      messages.meaningEditor.relationHelp,
      messages.meaningEditor.targetHelp,
      messages.docsVault.frontmatterBlock.relationsConsumerHelp,
      messages.docsVault.frontmatterBlock.codeLocationsConsumerHelp,
    ]) {
      expect([locale, typeof help === 'string' && help.length > 0]).toEqual([locale, true]);
    }
  }
});
