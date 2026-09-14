import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { previewDocumentPatch } from './document-patch.mjs';
import { updateDoc } from './vault.mjs';

const UID = '00000000-0000-4000-8000-000000000001';
const raw = [
  '---',
  '# owner comment is normalized by the existing writer',
  `uid: ${UID}`,
  'kind: capability',
  'title: 환불',
  'owner_only: "keep: exactly as parsed"',
  'description: old',
  'depends_on: [elements/z, elements/a]',
  '---',
  '',
  '기존 body',
].join('\n');

function actualBytes(frontmatterPatch, body) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-document-patch-'));
  const path = join(root, 'refund.md');
  writeFileSync(path, raw, 'utf8');
  try {
    updateDoc(root, 'refund', { frontmatter: frontmatterPatch, body });
    return readFileSync(path, 'utf8');
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('preview bytes equal actual updateDoc bytes across preservation, deletion, arrays and Unicode', () => {
  const patch = {
    description: null,
    depends_on: [' elements/z ', 'elements/b', 'elements/a', 'elements/b', ''],
    condition: '승인 후\n정산 전',
  };
  const preview = previewDocumentPatch({ rawBefore: raw, frontmatterPatch: patch });
  assert.equal(preview.status, 'available');
  assert.equal(preview.markdown, actualBytes(patch, undefined));
  assert.match(preview.markdown, /owner_only:/);
  assert.doesNotMatch(preview.markdown, /description:/);
  assert.match(preview.markdown, /depends_on: \[elements\/a, elements\/b, elements\/z\]/);
  assert.doesNotMatch(preview.markdown, /owner comment/);
});

test('explicit empty body and newly appended unknown key match actual writer bytes', () => {
  const patch = { future_owner_field: { team: '결제', level: 2 } };
  const preview = previewDocumentPatch({ rawBefore: raw, frontmatterPatch: patch, body: '' });
  assert.equal(preview.status, 'available');
  assert.equal(preview.markdown, actualBytes(patch, ''));
  assert.ok(preview.markdown.endsWith('---\n\n'));
});

test('preview refuses an identity the writer would mint unless that exact UID is supplied', () => {
  const withoutUid = raw.replace(`uid: ${UID}\n`, '');
  assert.deepEqual(
    previewDocumentPatch({ rawBefore: withoutUid, frontmatterPatch: { title: 'Changed' } }),
    { status: 'unavailable', reason: 'writer_minted_uid_required' },
  );
  const supplied = previewDocumentPatch({ rawBefore: withoutUid, frontmatterPatch: { title: 'Changed' }, mintedUid: UID });
  assert.equal(supplied.status, 'available');
  assert.match(supplied.markdown, new RegExp(`uid: ${UID}`));
});

test('actual writer supplies its minted UID to the same formatter', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-document-patch-uid-'));
  const path = join(root, 'refund.md');
  const withoutUid = raw.replace(`uid: ${UID}\n`, '');
  writeFileSync(path, withoutUid, 'utf8');
  try {
    const written = updateDoc(root, 'refund', { frontmatter: { title: 'Writer minted' } });
    assert.ok(written.mintedUid);
    const expected = previewDocumentPatch({
      rawBefore: withoutUid,
      frontmatterPatch: { title: 'Writer minted' },
      mintedUid: written.mintedUid,
    });
    assert.equal(expected.status, 'available');
    assert.equal(readFileSync(path, 'utf8'), expected.markdown);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('undefined identity fields are skipped before the writer decides to mint a UID', () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-document-patch-undefined-kind-'));
  const path = join(root, 'node.md');
  const before = '---\nkind: capability\ntitle: Before\n---\nbody';
  writeFileSync(path, before, 'utf8');
  try {
    const written = updateDoc(root, 'node', {
      frontmatter: { kind: undefined, title: 'Changed' },
    });
    assert.ok(written.mintedUid);
    const expected = previewDocumentPatch({
      rawBefore: before,
      frontmatterPatch: { kind: undefined, title: 'Changed' },
      mintedUid: written.mintedUid,
    });
    assert.equal(expected.status, 'available');
    assert.equal(expected.frontmatter.kind, 'capability');
    assert.equal(readFileSync(path, 'utf8'), expected.markdown);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
