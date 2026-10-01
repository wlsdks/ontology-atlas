import { it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createArtifactContext } from './artifact-context.mjs';

it('retains sorted unique source and relation evidence for a shared missing reference', () => {
  const edge = (from, via, ref = 'missing') => ({ from, via, ref, resolved: false });
  const edges = [edge('z', 'contains'), edge('a', 'dependencies'), edge('a', 'contains'),
    edge('a', 'dependencies'), edge('a', 'dependencies', 'other'),
    edge('a@b', 'c'), edge('a', 'b@c'), { ...edge('ignored', 'contains'), resolved: true, to: 'z' }];
  const context = createArtifactContext({ nodes: [], edges });
  assert.deepEqual(context.referencedOnlyByRef.get('missing'), [
    { slug: 'a', via: 'b@c' }, { slug: 'a', via: 'contains' }, { slug: 'a', via: 'dependencies' },
    { slug: 'a@b', via: 'c' }, { slug: 'z', via: 'contains' },
  ]);
  assert.deepEqual(context.referencedOnlyByRef.get('other'), [{ slug: 'a', via: 'dependencies' }]);
  assert.ok(Object.isFrozen(context.referencedOnlyByRef.get('missing')));
  assert.ok(context.referencedOnlyByRef.get('missing').every(Object.isFrozen));
});

it('keeps all evidence for a hundred thousand sources without suppressing distinct relations', () => {
  const edges = Array.from({ length: 100_000 }, (_, i) => ({
    id: String(i), from: `nodes/n${i}`, via: 'dependencies', ref: 'missing', resolved: false,
  }));
  const context = createArtifactContext({ nodes: [], edges: [...edges, ...edges] });
  assert.equal(context.referencedOnlyByRef.get('missing').length, 100_000);
  assert.equal(context.referencedOnlyByRef.get('missing')[0].slug, 'nodes/n0');
});

it('keeps mutable alias arrays live within a context', () => {
  const artifact = { nodes: [], edges: [], aliases: [{ alias: 'z', slug: 'a' }] };
  const context = createArtifactContext(artifact);
  assert.deepEqual(context.aliasesFor('a'), ['z']);
  artifact.aliases.push({ alias: 'a', slug: 'a' });
  assert.deepEqual(context.aliasesFor('a'), ['a', 'z']);
});

it('preserves sorted duplicates and protects shared alias lists from caller mutation', async () => {
  const { shareArtifact } = await import('./artifact-context.mjs');
  const artifact = shareArtifact({ nodes: [], edges: [], aliases: [
    { alias: 'z', slug: '__proto__' }, { alias: 'a', slug: '__proto__' }, { alias: 'a', slug: '__proto__' },
    { alias: 'other', slug: 'b' },
  ] });
  const context = createArtifactContext(artifact);
  const aliases = context.aliasesFor('__proto__');
  assert.deepEqual(aliases, ['a', 'a', 'z']);
  aliases.push('poison');
  assert.deepEqual(createArtifactContext(artifact).aliasesFor('__proto__'), ['a', 'a', 'z']);
  assert.deepEqual(context.aliasesFor('missing'), []);
});
