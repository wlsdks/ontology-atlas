import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import {
  CREATED_BY_KEY,
  HUMAN_ONLY_REVIEW_KEYS,
  REVIEW_NOTE_KEY,
  REVIEW_STATE_CONFIRMED,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
} from '../../schema.mjs';

const vaultRoot = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-write-gates-')));
mkdirSync(join(vaultRoot, 'capabilities'));
mkdirSync(join(vaultRoot, 'notes'));
writeFileSync(join(vaultRoot, 'capabilities', 'checkout.md'), '---\nkind: capability\ntitle: Checkout\n---\nBody.\n');
writeFileSync(join(vaultRoot, 'notes', 'memo.md'), '---\ntitle: Memo\n---\nOrdinary markdown.\n');
writeFileSync(join(vaultRoot, 'notes', 'blank-kind.md'), '---\nkind: "  "\ntitle: Blank\n---\nBody.\n');
after(() => rmSync(vaultRoot, { recursive: true, force: true }));

// The gate module reads the vault root once at import; point it at the fixture first.
process.env.OATLAS_VAULT = vaultRoot;
process.env.OATLAS_REPO_ROOT = vaultRoot;
const {
  ADD_CONCEPT_KINDS,
  assertGraphNodeEndpoint,
  destructivePreviewState,
  requireNodeNotReservedForHuman,
  requireValidFrontmatterPatch,
} = await import('./write-gates.mjs');

test('a frontmatter patch with nothing in it is accepted', () => {
  assert.doesNotThrow(() => requireValidFrontmatterPatch(undefined));
  assert.doesNotThrow(() => requireValidFrontmatterPatch({}));
  assert.doesNotThrow(() => requireValidFrontmatterPatch({ title: 'Anything', domain: 'domains/orders', kind: 'capability' }));
});

test('a graph relation list in a patch must be a bounded array of clean strings, or null to clear it', () => {
  assert.doesNotThrow(() => requireValidFrontmatterPatch({ capabilities: null }));
  assert.doesNotThrow(() => requireValidFrontmatterPatch({ capabilities: ['capabilities/a'] }));
  assert.throws(() => requireValidFrontmatterPatch({ capabilities: 'capabilities/a' }), /frontmatter\.capabilities must be an array of strings\./);
  assert.throws(
    () => requireValidFrontmatterPatch({ dependencies: Array.from({ length: 501 }, (_, i) => `capabilities/n${i}`) }),
    /frontmatter\.dependencies must contain at most 500 items\./,
  );
  assert.doesNotThrow(() => requireValidFrontmatterPatch({ dependencies: Array.from({ length: 500 }, (_, i) => `capabilities/n${i}`) }));
});

test('a patch may not delete or invalidate kind', () => {
  assert.throws(() => requireValidFrontmatterPatch({ kind: null }), /kind cannot be deleted from a vault node/);
  assert.throws(() => requireValidFrontmatterPatch({ kind: '  ' }), /frontmatter\.kind must be a non-empty string\./);
  assert.throws(() => requireValidFrontmatterPatch({ kind: 7 }), /frontmatter\.kind must be a non-empty string\./);
  assert.throws(() => requireValidFrontmatterPatch({ kind: 'widget' }), /frontmatter\.kind must be one of: project, domain, capability, element, document\./);
  for (const kind of ADD_CONCEPT_KINDS) assert.doesNotThrow(() => requireValidFrontmatterPatch({ kind }));
});

test('a patch may clear domain and slug but not blank them', () => {
  for (const key of ['domain', 'slug']) {
    assert.doesNotThrow(() => requireValidFrontmatterPatch({ [key]: null }));
    assert.throws(() => requireValidFrontmatterPatch({ [key]: '   ' }), new RegExp(`frontmatter\\.${key}`));
  }
});

test('a patch never sets authorship, even to the value already there', () => {
  assert.throws(
    () => requireValidFrontmatterPatch({ [CREATED_BY_KEY]: 'human' }),
    new RegExp(`frontmatter\\.${CREATED_BY_KEY} cannot be patched — authorship is stamped once`),
  );
  assert.throws(() => requireValidFrontmatterPatch({ [CREATED_BY_KEY]: null }), /cannot be patched/);
});

test('a patch never sets the keys that record a person\'s review', () => {
  assert.ok(HUMAN_ONLY_REVIEW_KEYS.length > 0);
  for (const key of HUMAN_ONLY_REVIEW_KEYS) {
    assert.throws(
      () => requireValidFrontmatterPatch({ [key]: 'anything' }),
      new RegExp(`frontmatter\\.${key} records a person's review`),
      key,
    );
    assert.throws(() => requireValidFrontmatterPatch({ [key]: null }), /records a person's review/, `${key} cleared`);
  }
});

test('a patch may reserve a node for a person but never clear, confirm or invent a review state', () => {
  assert.doesNotThrow(() =>
    requireValidFrontmatterPatch({ [REVIEW_STATE_KEY]: REVIEW_STATE_HUMAN_DECIDES, [REVIEW_NOTE_KEY]: 'Which boundary is right?' }));
  for (const cleared of [null, undefined, '']) {
    assert.throws(
      () => requireValidFrontmatterPatch({ [REVIEW_STATE_KEY]: cleared }),
      /cannot be cleared from this path/,
      `cleared with ${String(cleared)}`,
    );
  }
  assert.throws(
    () => requireValidFrontmatterPatch({ [REVIEW_STATE_KEY]: REVIEW_STATE_CONFIRMED }),
    /states that a person judged this node/,
  );
  assert.throws(
    () => requireValidFrontmatterPatch({ [REVIEW_STATE_KEY]: 'approved' }),
    /must be human_decides on this path \(human_decides \| confirmed are the only values\)/,
  );
});

test('a node reserved for a person refuses the whole write and says what the person has to decide', () => {
  const reserved = {
    slug: 'capabilities/checkout',
    frontmatter: { [REVIEW_STATE_KEY]: REVIEW_STATE_HUMAN_DECIDES, [REVIEW_NOTE_KEY]: 'Is refund part of checkout?' },
  };
  assert.throws(
    () => requireNodeNotReservedForHuman(reserved, 'patch_concept'),
    /^Error: patch_concept refused: capabilities\/checkout carries review_state: human_decides, so it is reserved for a person\. What they have to decide: Is refund part of checkout\? Report it and let the person decide; only they release the reservation\.$/,
  );
  assert.throws(
    () => requireNodeNotReservedForHuman({ frontmatter: { [REVIEW_STATE_KEY]: REVIEW_STATE_HUMAN_DECIDES } }, 'delete_concept'),
    /delete_concept refused: this node carries/,
  );
});

test('a node that is absent, unreviewed or already confirmed is not reserved', () => {
  assert.doesNotThrow(() => requireNodeNotReservedForHuman(null, 'patch_concept'));
  assert.doesNotThrow(() => requireNodeNotReservedForHuman(undefined, 'patch_concept'));
  assert.doesNotThrow(() => requireNodeNotReservedForHuman({ slug: 'a', frontmatter: {} }, 'patch_concept'));
  assert.doesNotThrow(() =>
    requireNodeNotReservedForHuman({ slug: 'a', frontmatter: { [REVIEW_STATE_KEY]: REVIEW_STATE_CONFIRMED } }, 'patch_concept'));
});

test('a relation endpoint must be a document with a kind', () => {
  assert.doesNotThrow(() => assertGraphNodeEndpoint('capabilities/checkout', 'Source'));
  assert.throws(
    () => assertGraphNodeEndpoint('notes/memo', 'Target'),
    /^Error: Target "notes\/memo" is not a graph node — it has no `kind:`, so a relation to it would be a dangling reference the compiler drops\. /,
  );
  assert.throws(() => assertGraphNodeEndpoint('notes/blank-kind', 'Source'), /Source "notes\/blank-kind" is not a graph node/);
  assert.throws(() => assertGraphNodeEndpoint('capabilities/missing', 'Source'), /Source "capabilities\/missing" is not a graph node/);
});

test('a destructive preview can be confirmed only when it is a dry run that would change something and nothing blocks it', () => {
  assert.deepEqual(destructivePreviewState({ dryRun: true, wouldChange: true }), {
    previewReady: true,
    canConfirm: true,
    wouldChange: true,
    blockedReasons: [],
  });
  assert.equal(destructivePreviewState({ dryRun: true, wouldChange: false }).canConfirm, false);
  assert.deepEqual(destructivePreviewState({ dryRun: false, wouldChange: true }), {
    previewReady: false,
    canConfirm: false,
    wouldChange: false,
    blockedReasons: [],
  });
  const blocked = destructivePreviewState({ dryRun: true, wouldChange: true, blockedReasons: ['stale', 'stale', '  ', 7, 'conflict'] });
  assert.equal(blocked.canConfirm, false);
  assert.deepEqual(blocked.blockedReasons, ['stale', 'conflict']);
  assert.equal(blocked.wouldChange, true);
});
