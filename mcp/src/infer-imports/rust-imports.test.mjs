import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

test('Rust repositories expose bounded local module and external crate evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'Cargo.toml'), '[package]\nname = "coverage-boundary"\n');
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      'mod engine;\nuse crate::engine::run;\nuse std::collections::HashMap;\nuse serde::{Deserialize, Serialize};\n',
    );
    writeFileSync(join(r, 'src', 'engine.rs'), 'pub fn run() {}\n');
  });
  try {
    const result = inferImports(root);
    assert.equal(result.filesScanned, 2);
    assert.deepEqual(result.edges, [
      {
        from: 'src/lib.rs',
        to: 'src/engine.rs',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
      {
        from: 'src/lib.rs',
        to: 'src/engine.rs',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
    ]);
    assert.deepEqual(result.externalImports, [{ from: 'src/lib.rs', spec: 'serde' }]);
    assert.deepEqual(result.unresolved, []);
    assert.deepEqual(
      result.moduleEdges.map((edge) => [edge.from, edge.to, edge.count]),
      [['elements/lib', 'elements/engine', 2]],
    );
    assert.deepEqual(result.coverage, {
      contract: 'importScanCoverage:v1',
      supportedLanguages: ['go', 'javascript', 'python', 'rust', 'typescript'],
      supportedExtensions: ['.cjs', '.cts', '.go', '.js', '.jsx', '.mjs', '.mts', '.py', '.rs', '.ts', '.tsx'],
      detectedUnsupportedLanguages: [],
      allDetectedLanguagesSupported: true,
      zeroEdgesMeaning: 'no_supported_static_import_edges_observed',
      limitations: [
        'Rust evidence covers deterministic use paths, file-backed mod declarations, and exact literal path/include forms; macro expansion, cfg evaluation, and symbol resolution are not inferred.',
        'Observed edges are bounded static source evidence, not runtime execution or semantic depends_on approval.',
      ],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust nested modules, exact literal paths, and include macros keep direction without evaluating macros', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'Cargo.toml'), '[package]\nname = "rust-paths"\n');
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      [
        'mod nested;',
        '#[path = "alternate.rs"]',
        'mod named;',
        'include!("generated.rs");',
        'include_str!("schema.json");',
        'include!(concat!(env!("OUT_DIR"), "/bindings.rs"));',
        'const LOOKALIKE: &str = "mod fake; use crate::fake::*;";',
        '// mod fake;',
        'mod inline { mod fake; use crate::fake::*; }',
        'macro_rules! fake_dependency { () => { use crate::fake::*; } }',
        '#[cfg(test)]',
        'mod tests { use crate::fake::*; }',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src', 'nested.rs'), 'use super::*;\n');
    writeFileSync(join(r, 'src', 'alternate.rs'), 'pub fn alternate() {}\n');
    writeFileSync(join(r, 'src', 'generated.rs'), 'pub fn generated() {}\n');
    writeFileSync(join(r, 'src', 'schema.json'), '{}\n');
    writeFileSync(join(r, 'src', 'fake.rs'), 'pub fn fake() {}\n');
  });
  try {
    const result = inferImports(root);
    assert.deepEqual(
      result.edges.map((edge) => [edge.from, edge.to]),
      [
        ['src/lib.rs', 'src/nested.rs'],
        ['src/lib.rs', 'src/alternate.rs'],
        ['src/lib.rs', 'src/generated.rs'],
        ['src/lib.rs', 'src/schema.json'],
        ['src/nested.rs', 'src/lib.rs'],
      ],
    );
    assert.equal(result.moduleEdges.some((edge) => edge.to.includes('schema')), false);
    assert.deepEqual(result.unresolved, [
      {
        from: 'src/lib.rs',
        spec: 'include!(concat!(env!("OUT_DIR"), "/bindings.rs"))',
        reason: 'unsupported-static-form',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust scanning rejects escaped paths and bounds source text and statements', () => {
  const outside = withRepo((r) => {
    writeFileSync(join(r, 'outside.rs'), 'pub fn outside() {}\n');
  });
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'Cargo.toml'), '[package]\nname = "rust-bounds"\n');
    writeFileSync(
      join(r, 'src', 'lib.rs'),
      ['#[path = "../../outside.rs"]', 'mod escaped;', ...Array.from({ length: 257 }, (_, index) => `use crate_${index}::Thing;`)].join('\n'),
    );
    writeFileSync(join(r, 'src', 'large.rs'), `//${'x'.repeat(262144)}\nuse hidden::Thing;\n`);
  });
  try {
    const result = inferImports(root);
    assert.equal(result.externalImports.length, 255);
    assert.deepEqual(result.unresolved, [
      {
        from: 'src/large.rs',
        spec: '<source-text>',
        reason: 'file-too-large',
      },
      {
        from: 'src/lib.rs',
        spec: '<rust-statement-limit>',
        reason: 'unsupported-static-form',
      },
      {
        from: 'src/lib.rs',
        spec: '#[path = "../../outside.rs"]\nmod escaped',
        reason: 'relative-not-found',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
