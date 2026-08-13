// R17 — inferImports unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildImportImpactFocus, inferImports } from './infer-imports.mjs';

function withRepo(setup) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-imports-'));
  setup(root);
  return root;
}

test('relative import resolved to file path', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    writeFileSync(
      join(r, 'src/a/index.ts'),
      'import { foo } from "../b/foo";\nexport const a = 1;\n',
    );
    writeFileSync(join(r, 'src/b/foo.ts'), 'export const foo = 2;\n');
  });
  try {
    const r = inferImports(root);
    const e = r.edges.find(
      (x) => x.from === 'src/a/index.ts' && x.to === 'src/b/foo.ts',
    );
    assert.ok(e, `expected edge a/index.ts → b/foo.ts, got: ${JSON.stringify(r.edges)}`);
    assert.equal(e.kind, 'static');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust repositories expose unsupported import-graph coverage instead of presenting zero edges as absence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'Cargo.toml'), '[package]\nname = "coverage-boundary"\n');
    writeFileSync(join(r, 'src', 'lib.rs'), 'mod engine;\nuse crate::engine::run;\n');
    writeFileSync(join(r, 'src', 'engine.rs'), 'pub fn run() {}\n');
  });
  try {
    const result = inferImports(root);
    assert.equal(result.filesScanned, 0);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.moduleEdges, []);
    assert.deepEqual(result.coverage, {
      contract: 'importScanCoverage:v1',
      supportedLanguages: ['javascript', 'python', 'typescript'],
      supportedExtensions: ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.py', '.ts', '.tsx'],
      detectedUnsupportedLanguages: ['rust'],
      allDetectedLanguagesSupported: false,
      zeroEdgesMeaning: 'no_supported_static_import_edges_observed',
      limitations: [
        'Rust use/mod and macro dependency graphs are not scanned; zero edges is not evidence that a Rust repository has no dependencies.',
        'Observed edges are bounded static source evidence, not runtime execution or semantic depends_on approval.',
      ],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

test('source/ TypeScript root preserves feature dependency evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'source', 'features', 'alpha'), { recursive: true });
    mkdirSync(join(r, 'source', 'features', 'beta'), { recursive: true });
    writeFileSync(
      join(r, 'source', 'features', 'alpha', 'index.ts'),
      'import { beta } from "../beta";\nexport const alpha = beta;\n',
    );
    writeFileSync(
      join(r, 'source', 'features', 'beta', 'index.ts'),
      'export const beta = true;\n',
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
          edge.from === 'capabilities/alpha' &&
          edge.to === 'capabilities/beta',
      ),
      `expected source/ feature boundary, got: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.ok(
      inferImports(root, { sourceFolders: ['source/features'] }).moduleEdges.some(
        (edge) =>
          edge.from === 'capabilities/alpha' &&
          edge.to === 'capabilities/beta',
      ),
      'a nested feature scope must not erase its top-level source-root semantics',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source/ top-level coordinators and helper files stay implementation elements', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'source', 'helpers'), { recursive: true });
    writeFileSync(
      join(r, 'source', 'feature-manager.tsx'),
      'import { enable } from "./helpers/feature-utils";\nexport const run = enable;\n',
    );
    writeFileSync(
      join(r, 'source', 'helpers', 'feature-utils.ts'),
      'export const enable = true;\n',
    );
    writeFileSync(
      join(r, 'source', 'helpers', 'feature-utils.test.ts'),
      'import { enable } from "./feature-utils";\nexport const observed = enable;\n',
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
          edge.from === 'elements/feature-manager' &&
          edge.to === 'elements/feature-utils',
      ),
      `expected source coordinator → helper element boundary, got: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.equal(
      result.moduleEdges.some((edge) => edge.sourceRoleCounts.test > 0),
      false,
      `test files must collapse to their production endpoint, not create ontology nodes: ${JSON.stringify(result.moduleEdges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-source assets never become ontology module endpoints', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'source', 'features'), { recursive: true });
    writeFileSync(
      join(r, 'source', 'features', 'alpha.tsx'),
      'import "./alpha.css";\nexport const alpha = true;\n',
    );
    writeFileSync(join(r, 'source', 'features', 'alpha.css'), '.alpha {}\n');
  });
  try {
    const result = inferImports(root);
    assert.ok(
      result.edges.length > 0,
      'fixture must contain at least one observed asset import',
    );
    assert.deepEqual(
      result.moduleEdges,
      [],
      'asset imports are file evidence, not ontology capability/element endpoints',
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
        'from pkg import runtime',
      ].join('\n'),
    );
  });
  try {
    const result = inferImports(root);
    const typeEdge = result.edges.find((edge) => edge.to === 'pkg/models.py');
    const valueEdge = result.edges.find((edge) => edge.to === 'pkg/runtime.py');

    assert.equal(typeEdge?.importUsage, 'type_only');
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

test('external (npm) import classified separately', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'src/main.ts'),
      'import React from "react";\nimport { z } from "zod";\n',
    );
  });
  try {
    const r = inferImports(root);
    assert.equal(r.edges.length, 0);
    const specs = r.externalImports.map((x) => x.spec).sort();
    assert.deepEqual(specs, ['react', 'zod']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tsconfig path alias (@/) — resolves to src/ when target exists, else unresolved', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/lib'), { recursive: true });
    writeFileSync(join(r, 'src/lib/foo.ts'), 'export const foo = 1;');
    writeFileSync(
      join(r, 'src/main.ts'),
      'import { foo } from "@/lib/foo";\nimport { gone } from "@/missing";\n',
    );
  });
  try {
    const r = inferImports(root);
    // @/lib/foo → resolved to src/lib/foo.ts (internal edge)
    const e = r.edges.find((x) => x.to === 'src/lib/foo.ts');
    assert.ok(e, `expected alias-resolved edge to src/lib/foo.ts, got: ${JSON.stringify(r.edges)}`);
    // @/missing → unresolved with alias-not-found
    assert.ok(
      r.unresolved.some(
        (u) => u.spec === '@/missing' && u.reason === 'alias-not-found',
      ),
      `expected alias-not-found, got: ${JSON.stringify(r.unresolved)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tsconfig paths aliases are resolved before fallback @/ guesses', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'app/page'), { recursive: true });
    mkdirSync(join(r, 'src/app/providers'), { recursive: true });
    mkdirSync(join(r, 'messages'), { recursive: true });
    writeFileSync(
      join(r, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            paths: {
              '@/*': ['./*'],
              '@/app-providers/*': ['./src/app/*'],
            },
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(r, 'app/page/index.ts'),
      [
        'import { Provider } from "@/app-providers/providers";',
        'import ko from "@/messages/ko.json";',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src/app/providers/index.ts'), 'export const Provider = 1;');
    writeFileSync(join(r, 'messages/ko.json'), '{"hello":"안녕"}');
  });
  try {
    const r = inferImports(root);
    assert.ok(
      r.edges.some(
        (edge) =>
          edge.from === 'app/page/index.ts' &&
          edge.to === 'src/app/providers/index.ts',
      ),
      `expected tsconfig alias edge to src/app/providers/index.ts, got: ${JSON.stringify(r.edges)}`,
    );
    assert.ok(
      r.edges.some(
        (edge) =>
          edge.from === 'app/page/index.ts' &&
          edge.to === 'messages/ko.json',
      ),
      `expected root alias edge to messages/ko.json, got: ${JSON.stringify(r.edges)}`,
    );
    assert.deepEqual(r.unresolved, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tsconfig paths resolve non-@ aliases before classifying npm imports', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/shared'), { recursive: true });
    mkdirSync(join(r, 'src/features/search'), { recursive: true });
    writeFileSync(
      join(r, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            paths: {
              '#shared/*': ['./src/shared/*'],
            },
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(r, 'src/features/search/index.ts'),
      [
        'import { normalize } from "#shared/normalize";',
        'import { missing } from "#shared/missing";',
        'import scoped from "@scope/pkg";',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src/shared/normalize.ts'), 'export const normalize = 1;');
  });
  try {
    const r = inferImports(root);
    assert.ok(
      r.edges.some(
        (edge) =>
          edge.from === 'src/features/search/index.ts' &&
          edge.to === 'src/shared/normalize.ts',
      ),
      `expected #shared alias edge, got: ${JSON.stringify(r.edges)}`,
    );
    assert.ok(
      r.unresolved.some(
        (entry) => entry.spec === '#shared/missing' && entry.reason === 'alias-not-found',
      ),
      `expected missing #shared alias to stay unresolved, got: ${JSON.stringify(r.unresolved)}`,
    );
    assert.ok(
      r.externalImports.some((entry) => entry.spec === '@scope/pkg'),
      `expected unmatched scoped package to stay external, got: ${JSON.stringify(r.externalImports)}`,
    );
    assert.equal(
      r.externalImports.some((entry) => entry.spec === '#shared/missing'),
      false,
      `did not expect unresolved alias as external import: ${JSON.stringify(r.externalImports)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dynamic import + require + reexport detected', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    writeFileSync(join(r, 'src/b/x.ts'), 'export const x = 1;');
    writeFileSync(
      join(r, 'src/a/index.ts'),
      [
        'const m = await import("../b/x");',
        'const r = require("../b/x");',
        'export { x } from "../b/x";',
      ].join('\n'),
    );
  });
  try {
    const r = inferImports(root);
    const toX = r.edges.filter((e) => e.to === 'src/b/x.ts');
    assert.deepEqual(
      toX.map((edge) => edge.kind).sort(),
      ['dynamic', 'reexport', 'require'],
    );
    const moduleEdge = r.moduleEdges.find(
      (edge) => edge.from === 'capabilities/a' && edge.to === 'capabilities/b',
    );
    assert.deepEqual(moduleEdge?.kindCounts, {
      dynamic: 1,
      reexport: 1,
      require: 1,
    });
    assert.deepEqual(moduleEdge?.evidence, [
      { from: 'src/a/index.ts', to: 'src/b/x.ts', kind: 'dynamic', sourceRole: 'production', importUsage: 'value' },
      { from: 'src/a/index.ts', to: 'src/b/x.ts', kind: 'reexport', sourceRole: 'production', importUsage: 'value' },
      { from: 'src/a/index.ts', to: 'src/b/x.ts', kind: 'require', sourceRole: 'production', importUsage: 'value' },
    ]);
    assert.equal(moduleEdge?.evidenceLimited, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD features/ — capability folder slug, analyze 와 일관)', () => {
  // features/X · entities/X 는 capabilities/X 로 맞춘다. analyze_repo_structure
  // 후보와 같은 slug 라 semantic review에서 양쪽 개념을 정확히 대조할 수 있다.
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features/auth'), { recursive: true });
    mkdirSync(join(r, 'src/features/billing'), { recursive: true });
    writeFileSync(
      join(r, 'src/features/auth/index.ts'),
      'import { invoice } from "../billing/index";\nimport { token } from "../billing/token";\n',
    );
    writeFileSync(join(r, 'src/features/billing/index.ts'), 'export const invoice = 1;');
    writeFileSync(join(r, 'src/features/billing/token.ts'), 'export const token = 1;');
  });
  try {
    const r = inferImports(root);
    const e = r.moduleEdges.find(
      (x) => x.from === 'capabilities/auth' && x.to === 'capabilities/billing',
    );
    assert.ok(e, `expected module edge capabilities/auth → capabilities/billing, got: ${JSON.stringify(r.moduleEdges)}`);
    assert.equal(e.count, 2, '두 import 합산');
    assert.deepEqual(e.evidence, [
      {
        from: 'src/features/auth/index.ts',
        to: 'src/features/billing/index.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
      {
        from: 'src/features/auth/index.ts',
        to: 'src/features/billing/token.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
    ]);
    assert.equal(e.evidenceLimited, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module edge evidence receipt is bounded and declares truncation', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    for (let index = 0; index < 6; index += 1) {
      writeFileSync(join(r, 'src/b', `dep-${index}.ts`), `export const v${index} = ${index};\n`);
    }
    writeFileSync(
      join(r, 'src/a/index.ts'),
      Array.from({ length: 6 }, (_, index) =>
        `import { v${index} } from "../b/dep-${index}";`,
      ).join('\n'),
    );
  });
  try {
    const edge = inferImports(root).moduleEdges.find(
      (row) => row.from === 'capabilities/a' && row.to === 'capabilities/b',
    );
    assert.equal(edge?.count, 6);
    assert.equal(edge?.evidence.length, 5);
    assert.equal(edge?.evidenceLimited, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module edge qualifies product value evidence separately from test-only type evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features/source'), { recursive: true });
    mkdirSync(join(r, 'src/features/target'), { recursive: true });
    writeFileSync(join(r, 'src/features/target/index.ts'), 'export const target = true;\nexport type Target = boolean;\n');
    writeFileSync(
      join(r, 'src/features/source/index.ts'),
      'import { target } from "../target/index";\nexport const source = target;\n',
    );
    writeFileSync(
      join(r, 'src/features/source/index.test.ts'),
      'import type { Target } from "../target/index";\nexport const fixture: Target = true;\n',
    );
  });
  try {
    const edge = inferImports(root).moduleEdges.find(
      (row) =>
        row.from === 'capabilities/source' &&
        row.to === 'capabilities/target',
    );

    assert.equal(edge?.count, 2, 'fixture must exercise both product and test evidence');
    assert.deepEqual(edge?.sourceRoleCounts, {
      production: 1,
      test: 1,
      unknown: 0,
    });
    assert.deepEqual(edge?.importUsageCounts, {
      value: 1,
      type_only: 1,
      unknown: 0,
    });
    assert.equal(edge?.productValueCount, 1);
    assert.deepEqual(edge?.evidence, [
      {
        from: 'src/features/source/index.ts',
        to: 'src/features/target/index.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
      {
        from: 'src/features/source/index.test.ts',
        to: 'src/features/target/index.ts',
        kind: 'static',
        sourceRole: 'test',
        importUsage: 'type_only',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (workspace packages — analyzer element slug parity)', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'apps', 'api', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'memory', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'shared', 'src'), { recursive: true });
    mkdirSync(join(r, 'scripts', 'lib'), { recursive: true });
    writeFileSync(
      join(r, 'apps', 'api', 'package.json'),
      '{"name":"@muse/api"}\n',
    );
    writeFileSync(
      join(r, 'packages', 'memory', 'package.json'),
      '{"name":"@muse/memory"}\n',
    );
    writeFileSync(
      join(r, 'packages', 'shared', 'package.json'),
      '{"name":"@muse/shared"}\n',
    );
    writeFileSync(
      join(r, 'packages', 'memory', 'src', 'index.ts'),
      'import { json } from "../../shared/src/index";\nexport { json };\n',
    );
    writeFileSync(
      join(r, 'packages', 'shared', 'src', 'index.ts'),
      'export const json = true;\n',
    );
    writeFileSync(
      join(r, 'apps', 'api', 'src', 'index.ts'),
      [
        'import { json } from "../../../packages/shared/src/index";',
        'import "../../../scripts/lib/helper";',
        'export { json };',
      ].join('\n'),
    );
    writeFileSync(join(r, 'scripts', 'lib', 'helper.ts'), 'export const helper = true;\n');
  });
  try {
    const r = inferImports(root);
    assert.deepEqual(r.moduleEdges, [
      {
        from: 'elements/api',
        to: 'elements/shared',
        count: 1,
        kindCounts: { static: 1 },
        sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
        importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
        productValueCount: 1,
        evidence: [
          {
            from: 'apps/api/src/index.ts',
            to: 'packages/shared/src/index.ts',
            kind: 'static',
            sourceRole: 'production',
            importUsage: 'value',
          },
        ],
        evidenceLimited: false,
      },
      {
        from: 'elements/memory',
        to: 'elements/shared',
        count: 1,
        kindCounts: { static: 1 },
        sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
        importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
        productValueCount: 1,
        evidence: [
          {
            from: 'packages/memory/src/index.ts',
            to: 'packages/shared/src/index.ts',
            kind: 'static',
            sourceRole: 'production',
            importUsage: 'value',
          },
        ],
        evidenceLimited: false,
      },
    ]);
    assert.deepEqual(
      inferImports(root, {
        sourceFolders: ['apps', 'packages'],
        ignore: ['packages'],
      }).moduleEdges,
      [],
    );
    assert.deepEqual(
      inferImports(root, {
        sourceFolders: ['apps', 'packages'],
        ignore: ['shared'],
      }).moduleEdges,
      [],
    );
    const ignoredWorkspace = inferImports(root, {
      sourceFolders: ['packages'],
      ignore: ['packages'],
    });
    const { coverage: ignoredCoverage, ...ignoredWorkspaceScan } = ignoredWorkspace;
    assert.equal(ignoredCoverage.contract, 'importScanCoverage:v1');
    assert.deepEqual(
      ignoredWorkspaceScan,
      {
        rootPath: root,
        filesScanned: 0,
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [],
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (single-file layered repo classifies support layers precisely)', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features'), { recursive: true });
    mkdirSync(join(r, 'src/domain'), { recursive: true });
    mkdirSync(join(r, 'src/storage'), { recursive: true });
    writeFileSync(
      join(r, 'src/features/check-in.js'),
      [
        'import { normalizeHabit } from "../domain/habit.js";',
        'import { appendEntry } from "../storage/json-store.js";',
        'export const checkIn = () => appendEntry(normalizeHabit("write"));',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'src/domain/habit.js'),
      'export const normalizeHabit = (habit) => habit;\n',
    );
    writeFileSync(
      join(r, 'src/storage/json-store.js'),
      'export const appendEntry = (entry) => entry;\n',
    );
  });
  try {
    const r = inferImports(root);
    assert.ok(
      r.moduleEdges.some(
        (x) =>
          x.from === 'capabilities/check-in' &&
          x.to === 'elements/habit',
      ),
      `expected feature → domain-model element edge, got: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.ok(
      r.moduleEdges.some(
        (x) =>
          x.from === 'capabilities/check-in' &&
          x.to === 'elements/json-store',
      ),
      `expected feature → storage element edge, got: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.equal(
      r.moduleEdges.some((x) => x.to === 'capabilities/domain'),
      false,
      `did not expect folder-name capability noise: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.equal(
      r.moduleEdges.some((x) => x.to === 'domains/habit'),
      false,
      `did not expect implementation model as ontology domain: ${JSON.stringify(r.moduleEdges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD widgets/ — element folder slug, analyze 와 일관)', () => {
  // widgets/X · views/X 는 평평한 elements/<name> 슬러그 — 2026-08-01 판정,
  // analyze 와 같은 규칙 (basename 이 레이어를 넘어 겹칠 때만 레이어 접미).
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/widgets/header'), { recursive: true });
    mkdirSync(join(r, 'src/widgets/footer'), { recursive: true });
    writeFileSync(
      join(r, 'src/widgets/header/index.ts'),
      'import { x } from "../footer";\nexport const h = x;\n',
    );
    writeFileSync(join(r, 'src/widgets/footer/index.ts'), 'export const x = 1;');
  });
  try {
    const r = inferImports(root);
    const e = r.moduleEdges.find(
      (x) => x.from === 'elements/header' && x.to === 'elements/footer',
    );
    assert.ok(e, `expected module edge elements/header → elements/footer, got: ${JSON.stringify(r.moduleEdges)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unresolved relative — 누락 파일 reason: relative-not-found', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'src/main.ts'),
      'import { gone } from "./missing";\n',
    );
  });
  try {
    const r = inferImports(root);
    assert.equal(r.edges.length, 0);
    assert.equal(r.unresolved[0]?.reason, 'relative-not-found');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TypeScript NodeNext — .js specifier resolves to .ts source', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features/a'), { recursive: true });
    mkdirSync(join(r, 'src/features/b'), { recursive: true });
    writeFileSync(join(r, 'src/features/a/index.ts'), "import '../b/index.js';\n");
    writeFileSync(join(r, 'src/features/b/index.ts'), 'export const b = 1;\n');
  });
  try {
    const r = inferImports(root);
    assert.equal(r.unresolved.length, 0);
    assert.equal(r.edges[0]?.to, 'src/features/b/index.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('node_modules / dist / .next ignored', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'node_modules/foo'), { recursive: true });
    mkdirSync(join(r, 'dist'), { recursive: true });
    writeFileSync(join(r, 'src/a/index.ts'), 'export const a = 1;');
    writeFileSync(join(r, 'node_modules/foo/index.js'), 'should not be scanned');
    writeFileSync(join(r, 'dist/build.js'), 'also not scanned');
  });
  try {
    const r = inferImports(root);
    assert.equal(r.filesScanned, 1, 'node_modules / dist 안 의 파일 walk 안 됨');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('side-effect import (import "X") 감지', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    writeFileSync(join(r, 'src/b/setup.ts'), 'console.log("setup");');
    writeFileSync(join(r, 'src/a/main.ts'), 'import "../b/setup";\nexport const a = 1;\n');
  });
  try {
    const r = inferImports(root);
    const sideEdge = r.edges.find((e) => e.kind === 'side');
    assert.ok(
      sideEdge,
      `expected side import edge, got: ${JSON.stringify(r.edges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid infer options are rejected instead of coerced', () => {
  const root = withRepo(() => {});
  try {
    assert.throws(
      () => inferImports(`${root}\0`),
      /rootPath must not contain a null byte/,
    );
    assert.throws(
      () => inferImports(root, { sourceFolders: ['src', ' lib'] }),
      /sourceFolders items must not have leading or trailing whitespace/,
    );
    assert.throws(
      () => inferImports(root, { sourceFolders: Array.from({ length: 51 }, (_, index) => `src-${index}`) }),
      /sourceFolders must contain at most 50 items/,
    );
    assert.throws(
      () => inferImports(root, { ignore: ['dist', 7] }),
      /ignore must be an array of strings/,
    );
    assert.throws(
      () => inferImports(root, { ignore: Array.from({ length: 201 }, (_, index) => `skip-${index}`) }),
      /ignore must contain at most 200 items/,
    );
    assert.throws(
      () => inferImports(root, { maxFiles: 0 }),
      /maxFiles must be a positive integer/,
    );
    assert.throws(
      () => inferImports(root, { maxFiles: 50001 }),
      /maxFiles must be <= 50000/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
