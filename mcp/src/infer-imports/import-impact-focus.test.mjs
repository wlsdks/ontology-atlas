import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImportImpactFocus } from './import-impact-focus.mjs';

test('buildImportImpactFocus — one path returns bounded incoming/outgoing evidence with a stable cursor', () => {
  const incoming = Array.from({ length: 121 }, (_, index) => ({
    from: `source/features/feature-${String(index).padStart(3, '0')}.tsx`,
    to: 'source/feature-manager.tsx',
    kind: 'static',
    sourceRole: 'production',
    importUsage: 'value',
  }));
  const outgoing = [
    {
      from: 'source/feature-manager.tsx',
      to: 'source/options-storage.ts',
      kind: 'static',
      sourceRole: 'production',
      importUsage: 'value',
    },
    {
      from: 'source/feature-manager.tsx',
      to: 'source/helpers/feature-utils.ts',
      kind: 'static',
      sourceRole: 'production',
      importUsage: 'value',
    },
  ];
  const unrelated = {
    from: 'source/a.ts',
    to: 'source/b.ts',
    kind: 'static',
    sourceRole: 'production',
    importUsage: 'value',
  };

  const first = buildImportImpactFocus([...outgoing, unrelated, ...incoming], {
    focusPath: './source/feature-manager.tsx',
    direction: 'both',
    limit: 50,
  });
  assert.equal(first.contract, 'importImpactFocus:v1');
  assert.equal(first.focusPath, 'source/feature-manager.tsx');
  assert.equal(first.sourceQualification, 'observed_static_imports_not_runtime_or_semantic_impact');
  assert.equal(first.writeAllowed, false);
  assert.deepEqual(first.summary, {
    incoming: 121,
    outgoing: 2,
    selected: 123,
    returned: 50,
    limited: true,
  });
  assert.equal(first.edges.length, 50);
  assert.equal(new Set(first.edges.map((edge) => edge.edgeId)).size, 50);
  assert.equal(first.cursor.afterEdgeId, null);
  assert.equal(first.cursor.total, 123);
  assert.equal(first.cursor.remaining, 73);
  assert.equal(first.cursor.hasMore, true);
  assert.equal(typeof first.cursor.nextAfterEdgeId, 'string');

  const second = buildImportImpactFocus([...outgoing, unrelated, ...incoming], {
    focusPath: 'source/feature-manager.tsx',
    direction: 'both',
    limit: 50,
    afterEdgeId: first.cursor.nextAfterEdgeId,
  });
  assert.equal(second.edges.length, 50);
  assert.equal(second.cursor.remaining, 23);
  assert.equal(
    second.edges.some((edge) => first.edges.some((prior) => prior.edgeId === edge.edgeId)),
    false,
  );
});

test('buildImportImpactFocus — direction, no-match truth, and stale cursor fail closed', () => {
  const edges = [{
    from: 'src/caller.ts',
    to: 'src/hub.ts',
    kind: 'static',
    sourceRole: 'production',
    importUsage: 'value',
  }];
  const outgoing = buildImportImpactFocus(edges, {
    focusPath: 'src/hub.ts',
    direction: 'outgoing',
  });
  assert.deepEqual(outgoing.summary, {
    incoming: 1,
    outgoing: 0,
    selected: 0,
    returned: 0,
    limited: false,
  });
  assert.deepEqual(outgoing.edges, []);
  assert.equal(outgoing.cursor.nextAfterEdgeId, null);
  assert.match(outgoing.interpretation, /does not prove no impact/i);

  assert.throws(
    () => buildImportImpactFocus(edges, {
      focusPath: 'src/hub.ts',
      afterEdgeId: 'import-impact:stale',
    }),
    /afterEdgeId was not found/i,
  );
  assert.throws(
    () => buildImportImpactFocus(edges, { focusPath: '../outside.ts' }),
    /repository-relative path/i,
  );
  assert.throws(
    () => buildImportImpactFocus(edges, { focusPath: 'src/hub.ts', direction: 'sideways' }),
    /direction must be one of/i,
  );
});
