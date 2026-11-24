import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

const vaultRoot = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-write-gate-call-sites-')));
const FILES = {
  'capabilities/reserved': '---\nuid: 3f1a7c52-0000-4000-8000-000000000001\nkind: capability\ntitle: Reserved\nreview_state: human_decides\nreview_note: Which domain owns this?\n---\nBody.\n',
  'capabilities/open': '---\nuid: 3f1a7c52-0000-4000-8000-000000000002\nkind: capability\ntitle: Open\n---\nBody.\n',
  'capabilities/target': '---\nuid: 3f1a7c52-0000-4000-8000-000000000003\nkind: capability\ntitle: Target\n---\nBody.\n',
  'project-reserved': '---\nuid: 3f1a7c52-0000-4000-8000-000000000004\nkind: project\ntitle: Reserved project\nreview_state: human_decides\n---\nBody.\n',
  'notes/memo': '---\ntitle: Memo\n---\nOrdinary markdown.\n',
};
mkdirSync(join(vaultRoot, 'capabilities'));
mkdirSync(join(vaultRoot, 'notes'));
for (const [slug, content] of Object.entries(FILES)) writeFileSync(join(vaultRoot, `${slug}.md`), content);
after(() => rmSync(vaultRoot, { recursive: true, force: true }));

// Each handler reads the vault root once at import; point it at the fixture first.
process.env.OATLAS_VAULT = vaultRoot;
process.env.OATLAS_REPO_ROOT = vaultRoot;
const { patchConcept } = await import('./write-concepts.mjs');
const { addRelation, removeRelation, replaceRelation } = await import('./write-relations.mjs');
const { deleteConcept, mergeConcepts, reclassifyConcept, renameConcept } = await import('../lifecycle.mjs');
const { finalizeProjectMeaningTool } = await import('../project-source.mjs');
const { connectionInfoTool } = await import('../read.mjs');

const reservedRefusal = (operation, slug) =>
  new RegExp(`^Error: ${operation} refused: ${slug} carries review_state: human_decides, so it is reserved for a person\\.`);

function assertVaultUntouched() {
  for (const [slug, content] of Object.entries(FILES)) {
    assert.equal(readFileSync(join(vaultRoot, `${slug}.md`), 'utf8'), content, `${slug} was rewritten`);
  }
}

test('every write that names a reserved node as its source is refused before anything is written', () => {
  const reserved = 'capabilities/reserved';
  const open = 'capabilities/open';
  const cases = [
    ['patch_concept', () => patchConcept({ slug: reserved, frontmatter: { title: 'Renamed' } })],
    ['add_relations', () => addRelation({ from: reserved, to: open, type: 'depends_on' })],
    ['remove_relation', () => removeRelation({ from: reserved, to: open, type: 'depends_on', confirm: true })],
    ['replace_relation', () => replaceRelation({
      from: reserved, oldTo: open, oldType: 'depends_on', newTo: 'capabilities/target', newType: 'depends_on', confirm: true,
    })],
    ['rename_concept', () => renameConcept({ oldSlug: reserved, newSlug: 'capabilities/renamed', confirm: true })],
    ['reclassify_concept', () => reclassifyConcept({ slug: reserved, newKind: 'element', domain: 'domains/orders', confirm: true })],
    ['merge_concepts', () => mergeConcepts({ fromSlug: reserved, intoSlug: open, confirm: true })],
    ['merge_concepts', () => mergeConcepts({ fromSlug: open, intoSlug: reserved, confirm: true })],
    ['delete_concept', () => deleteConcept({ slug: reserved, confirm: true })],
  ];
  for (const [operation, call] of cases) {
    assert.throws(call, reservedRefusal(operation, reserved), operation);
  }
  assertVaultUntouched();
});

test('renaming onto a reserved node with overwrite is refused, so the reservation is not replaced', () => {
  assert.throws(
    () => renameConcept({ oldSlug: 'capabilities/open', newSlug: 'capabilities/reserved', overwrite: true, confirm: true }),
    reservedRefusal('rename_concept', 'capabilities/reserved'),
  );
  assertVaultUntouched();
});

test('finalizing the project meaning with answers is refused when a person has reserved the project', () => {
  const { guideText } = connectionInfoTool({ guide: 'competency' });
  const { answers } = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(guideText)[1]);
  assert.throws(
    () => finalizeProjectMeaningTool({ projectSlug: 'project-reserved', expected_mtime: 0, answers }),
    reservedRefusal('finalize_project_meaning', 'project-reserved'),
  );
  assertVaultUntouched();
});

test('a patch is refused when it would stamp authorship or set a person\'s review', () => {
  assert.throws(
    () => patchConcept({ slug: 'capabilities/open', frontmatter: { created_by: 'human' } }),
    /frontmatter\.created_by cannot be patched/,
  );
  assert.throws(
    () => patchConcept({ slug: 'capabilities/open', frontmatter: { review_state: 'confirmed' } }),
    /states that a person judged this node/,
  );
  assertVaultUntouched();
});

test('a relation to a document without a kind is refused at either end', () => {
  assert.throws(
    () => addRelation({ from: 'capabilities/open', to: 'notes/memo', type: 'depends_on' }),
    /Target "notes\/memo" is not a graph node/,
  );
  assert.throws(
    () => addRelation({ from: 'notes/memo', to: 'capabilities/open', type: 'depends_on' }),
    /Source "notes\/memo" is not a graph node/,
  );
  assertVaultUntouched();
});
