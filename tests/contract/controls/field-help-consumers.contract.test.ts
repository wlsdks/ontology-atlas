import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { applyFrontmatterUpdates } from '@/entities/docs-vault';
import {
  buildOntologyRelationEditPlan,
  IMPACT_EDIT_RELATIONS,
  RELATION_EDGE_TYPE,
  type MeaningEditRelation,
} from '@/entities/knowledge-graph';
import { looksLikeCodePath } from '@/shared/lib/concept-display/humanize-code-path-title';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';

import { deriveProjectSourceWitnesses } from '@/features/project-source-binding/lib/project-source-witnesses';
import { buildProjectSourceReceipt } from '@/shared/lib/project-source/project-source-receipt';

import { callServerTools } from '../server-session/call-server-tool';

/**
 * Help naming a consumer is worth reading only if the consumer does what it says.
 * Each case runs that consumer on a fixture, so moving code stays green and
 * changing what the consumer does turns red. The server is asked over stdio.
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

type ValidateReport = { problems: { slug: string; issues: { code: string; severity: string }[] }[] };
type CompiledArtifact = {
  nodes: { slug: string }[];
  edges: { from: string; to: string }[];
  issues: { code: string; slug?: string; severity: string; ref?: string }[];
};

const [compiledAnswer, validatedAnswer, impactAnswer] = await callServerTools(vault, [
  { name: 'compile_ontology', arguments: { full: true } },
  { name: 'validate_vault', arguments: {} },
  { name: 'query_ontology', arguments: { operation: 'impact', slug: TARGET } },
]);
for (const answer of [compiledAnswer, validatedAnswer, impactAnswer]) expect(answer.isError, String(answer.value)).toBe(false);
const artifact = compiledAnswer.value as CompiledArtifact;
const validateReport = validatedAnswer.value as ValidateReport;
const impactNodes = (impactAnswer.value as { nodes: { slug: string }[] }).nodes;

afterAll(() => {
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

    const reported = validateReport.problems.find((problem) => problem.slug === slug)?.issues ?? [];
    const dangling = reported.filter((issue) => issue.code === 'dangling-graph-reference');
    expect(dangling.map((issue) => issue.severity)).toEqual(['warning']);
  });
});

describe('target help names exactly the relations an impact query follows', () => {
  it('the relations the help is built from are the ones impact traversal reaches', () => {
    const reached = new Set(impactNodes.map((node) => node.slug));
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
  const nodes = [
    { id: 'project:project', kind: 'project', title: 'Project', projectIds: [], agentSlug: 'project' },
    { id: 'capability:a', kind: 'capability', title: 'A', projectIds: ['project'], agentSlug: 'capabilities/a' },
  ];
  const witnesses = deriveProjectSourceWitnesses({ projectSlug: 'project', nodes: nodes as never, docs: docs as never });
  const witnessed = witnesses.map((witness) => witness.path);
  const receipt = (files: string[]) =>
    buildProjectSourceReceipt({
      projectSlug: 'project',
      probe: { sourceId: 'source', kind: 'git', revision: 'r1', fingerprint: 'f1', dirty: false, files, truncated: false },
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
