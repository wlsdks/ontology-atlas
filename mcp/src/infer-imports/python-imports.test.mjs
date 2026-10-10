import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

test('root Python package imports resolve to internal file and flat element dependency evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'diagnostic_client', 'services'), { recursive: true });
    writeFileSync(join(r, 'diagnostic_client', '__init__.py'), '');
    writeFileSync(join(r, 'diagnostic_client', 'Request.py'), '');
    writeFileSync(join(r, 'diagnostic_client', 'connections.py'), '');
    writeFileSync(join(r, 'diagnostic_client', 'services', '__init__.py'), '');
    writeFileSync(
      join(r, 'diagnostic_client', 'client.py'),
      [
        'from diagnostic_client import Request, services',
        'from diagnostic_client.connections import BaseConnection',
        'import logging',
      ].join('\n'),
    );
  });
  try {
    const result = inferImports(root);

    assert.equal(result.filesScanned, 5);
    assert.ok(
      result.edges.some(
        (edge) =>
          edge.from === 'diagnostic_client/client.py' &&
          edge.to === 'diagnostic_client/Request.py' &&
          edge.kind === 'static',
      ),
    );
    assert.ok(
      result.edges.some(
        (edge) =>
          edge.from === 'diagnostic_client/client.py' &&
          edge.to === 'diagnostic_client/services/__init__.py',
      ),
    );
    assert.ok(
      result.edges.some(
        (edge) =>
          edge.from === 'diagnostic_client/client.py' &&
          edge.to === 'diagnostic_client/connections.py',
      ),
    );
    assert.ok(
      result.externalImports.some(
        (entry) =>
          entry.from === 'diagnostic_client/client.py' &&
          entry.spec === 'logging',
      ),
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) =>
          edge.from === 'elements/client' &&
          edge.to === 'elements/request',
      ),
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) =>
          edge.from === 'elements/client' &&
          edge.to === 'elements/services',
      ),
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) =>
          edge.from === 'elements/client' &&
          edge.to === 'elements/connections',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('src-layout Python package preserves file-level dependency evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src', 'textual'), { recursive: true });
    writeFileSync(join(r, 'src', 'textual', '__init__.py'), '');
    writeFileSync(
      join(r, 'src', 'textual', 'app.py'),
      'from textual.message_pump import MessagePump\n',
    );
    writeFileSync(
      join(r, 'src', 'textual', 'message_pump.py'),
      'class MessagePump: pass\n',
    );
  });
  try {
    const result = inferImports(root);
    assert.ok(
      result.edges.length > 0,
      'fixture must contain at least one observed source import',
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) =>
          edge.from === 'elements/app' &&
          edge.to === 'elements/message-pump',
      ),
      `expected src-layout Python file boundary, got: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.ok(
      inferImports(root, { sourceFolders: ['src/textual'] }).moduleEdges.some(
        (edge) =>
          edge.from === 'elements/app' &&
          edge.to === 'elements/message-pump',
      ),
      'a nested sourceFolders scope must preserve repository-relative ontology endpoints',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Python import parsing handles package-relative multiline imports without docstring or test-package noise', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'protocol', 'sub'), { recursive: true });
    mkdirSync(join(r, 'tests'), { recursive: true });
    writeFileSync(join(r, 'protocol', '__init__.py'), '');
    writeFileSync(join(r, 'protocol', 'helpers.py'), '');
    writeFileSync(join(r, 'protocol', 'sub', '__init__.py'), '');
    writeFileSync(join(r, 'protocol', 'sub', 'local.py'), '');
    writeFileSync(
      join(r, 'protocol', 'sub', 'consumer.py'),
      [
        'DOC = """',
        'from protocol import ghost',
        '"""',
        'from . import (',
        '    local,  # actual package module',
        ')',
        'from .. import helpers',
      ].join('\n'),
    );
    writeFileSync(join(r, 'tests', '__init__.py'), '');
    writeFileSync(join(r, 'tests', 'test_consumer.py'), 'from protocol import helpers\n');
  });
  try {
    const result = inferImports(root);

    assert.equal(result.filesScanned, 5);
    assert.ok(
      result.edges.some(
        (edge) =>
          edge.from === 'protocol/sub/consumer.py' &&
          edge.to === 'protocol/sub/local.py',
      ),
    );
    assert.ok(
      result.edges.some(
        (edge) =>
          edge.from === 'protocol/sub/consumer.py' &&
          edge.to === 'protocol/helpers.py',
      ),
    );
    assert.equal(
      result.edges.some(
        (edge) =>
          edge.from === 'protocol/sub/consumer.py' &&
          edge.to === 'protocol/__init__.py',
      ),
      false,
      'an import-shaped line inside a docstring must not become evidence',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Python TYPE_CHECKING imports stay type-only while value imports remain product evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'pkg'), { recursive: true });
    writeFileSync(join(r, 'pkg', '__init__.py'), '');
    writeFileSync(join(r, 'pkg', 'models.py'), 'class Model: pass\n');
    writeFileSync(join(r, 'pkg', 'runtime.py'), 'VALUE = 1\n');
    writeFileSync(
      join(r, 'pkg', 'client.py'),
      [
        'from typing import TYPE_CHECKING',
        'if TYPE_CHECKING:',
        '    from pkg import models',
        'from pkg import models, models',
        'from pkg import runtime',
      ].join('\n'),
    );
  });
  try {
    const result = inferImports(root);
    const typeEdge = result.edges.find((edge) => edge.to === 'pkg/models.py');
    const valueEdge = result.edges.find((edge) => edge.to === 'pkg/runtime.py');

    assert.equal(typeEdge?.importUsage, 'type_only');
    assert.equal(result.edges.filter((edge) => edge.to === 'pkg/models.py').length, 1);
    assert.equal(valueEdge?.importUsage, 'value');
    assert.equal(
      result.moduleEdges.find((edge) => edge.to === 'elements/models')?.productValueCount,
      0,
    );
    assert.equal(
      result.moduleEdges.find((edge) => edge.to === 'elements/runtime')?.productValueCount,
      1,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('repository-escaping Python package symlinks are not scanned', () => {
  const outside = withRepo((r) => {
    writeFileSync(join(r, '__init__.py'), '');
    writeFileSync(join(r, 'client.py'), 'import logging\n');
  });
  const root = withRepo((r) => {
    symlinkSync(outside, join(r, 'escaped_package'));
  });
  try {
    const result = inferImports(root);

    assert.equal(result.filesScanned, 0);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.externalImports, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('Python import resolution rejects a package-internal symlink that escapes the repository', () => {
  const outside = withRepo((r) => {
    writeFileSync(join(r, '__init__.py'), '');
  });
  const root = withRepo((r) => {
    mkdirSync(join(r, 'pkg'), { recursive: true });
    writeFileSync(join(r, 'pkg', '__init__.py'), '');
    writeFileSync(join(r, 'pkg', 'client.py'), 'from pkg.escaped import Secret\n');
    symlinkSync(outside, join(r, 'pkg', 'escaped'));
  });
  try {
    const result = inferImports(root);

    assert.equal(
      result.edges.some((edge) => edge.to === 'pkg/escaped/__init__.py'),
      false,
    );
    assert.equal(
      result.moduleEdges.some((edge) => edge.to === 'elements/escaped'),
      false,
    );
    assert.ok(
      result.unresolved.some(
        (row) =>
          row.from === 'pkg/client.py' &&
          row.spec === 'pkg.escaped' &&
          row.reason === 'alias-not-found',
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
