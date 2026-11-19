import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSurvey } from './declaration-survey.mjs';
import { importsOf } from './import-bindings.mjs';

const file = (path, text) => ({ path, lines: text.split('\n').map((line) => `${line}\n`) });
// Whether a spec resolves to `path` in a repository holding that file.
const specReaches = (spec, path) => Boolean(spec) && buildSurvey([path], new Map()).modulePaths(spec).includes(path);
const reachesAnySpec = (bindings, path) => bindings.specs.some((spec) => specReaches(spec, path));
const reaches = (bindings, name, path) => (bindings.names.get(name) ?? []).some((binding) => specReaches(binding.spec, path));

test('a JavaScript import names the module it resolves to, by path, alias and segment', () => {
  const bindings = importsOf(file('src/app/entry.ts', [
    "import { charge, refund as giveBack } from './billing';",
    'import {',
    '  audit,',
    "} from '../lib/audit.mjs';",
    "import * as store from '@/shared/store';",
    "import Queue from 'queue-kit/queue';",
    "const { sign } = require('./crypto');",
    "import { panel } from './panel';",
  ].join('\n')));
  assert.ok(reaches(bindings, 'charge', 'src/app/billing.ts'));
  assert.ok(!reaches(bindings, 'charge', 'src/other/billing.ts'), 'a relative import is one path, not any file of that name');
  assert.deepEqual(bindings.names.get('giveBack').map((binding) => binding.imported), ['refund'], 'an alias keeps the name it imports');
  assert.equal(bindings.names.has('refund'), false);
  assert.ok(reaches(bindings, 'audit', 'src/lib/audit.mjs'), 'a statement over several lines is read whole');
  assert.ok(specReaches(bindings.modules.get('store'), 'src/shared/store.ts'), 'an @/ alias names the path after it');
  assert.ok(specReaches(bindings.modules.get('store'), 'src/shared/store/index.ts'), 'an index file answers to its folder');
  assert.ok(!specReaches(bindings.modules.get('Queue'), 'src/myqueue-kit/queue.ts'), 'a package import matches whole segments');
  assert.ok(specReaches(bindings.modules.get('Queue'), 'packages/queue-kit/queue.ts'));
  assert.ok(reaches(bindings, 'sign', 'src/app/crypto.js'), 'require() is an import');
  assert.ok(reachesAnySpec(bindings, 'src/app/panel/index.tsx'));
  assert.ok(!reachesAnySpec(bindings, 'src/app/unrelated.ts'));
});

test('a Python import resolves relative levels, and `from a import b` reaches the module a/b', () => {
  const bindings = importsOf(file('pkg/sub/job.py', [
    'from .limits import clamp',
    'from ..core import queue',
    'from pkg.tools import (',
    '    trim as cut,',
    ')',
    'import pkg.store as storage',
  ].join('\n')));
  assert.ok(reaches(bindings, 'clamp', 'pkg/sub/limits.py'));
  assert.ok(!reaches(bindings, 'clamp', 'pkg/limits.py'), 'one dot is the importing package');
  assert.ok(reaches(bindings, 'queue', 'pkg/core/__init__.py'));
  assert.ok(specReaches(bindings.modules.get('queue'), 'pkg/core/queue.py'), 'an imported name may be a module');
  assert.deepEqual(bindings.names.get('cut').map((binding) => binding.imported), ['trim']);
  assert.ok(specReaches(bindings.modules.get('storage'), 'src/pkg/store.py'));
});

test('a Go import reaches its package folder, and a Rust use drops crate, self and super', () => {
  const go = importsOf(file('server/server.go', ['package server', '', 'import (', '\t"example.com/app/store"', '\tcfg "example.com/app/config/v2"', ')'].join('\n')));
  assert.ok(specReaches(go.modules.get('store'), 'store/memory.go'));
  assert.ok(!specReaches(go.modules.get('store'), 'other/memory.go'), 'another folder is another package');
  assert.ok(!specReaches(go.modules.get('store'), 'memory.go'));
  assert.ok(specReaches(go.modules.get('cfg'), 'config/v2/config.go'));
  assert.ok(reachesAnySpec(go, 'store/memory.go') && reachesAnySpec(go, 'config/v2/config.go'), 'the folder is a suffix of the import path');
  assert.ok(!reachesAnySpec(go, 'other/memory.go'));

  const rust = importsOf(file('src/lib.rs', ['use crate::store::{save, load as fetch};', 'use super::util::trim;'].join('\n')));
  assert.ok(reaches(rust, 'save', 'src/store.rs'));
  assert.ok(reaches(rust, 'save', 'src/store/mod.rs'));
  assert.deepEqual(rust.names.get('fetch').map((binding) => binding.imported), ['load']);
  assert.ok(reaches(rust, 'trim', 'crates/x/src/util.rs'));
});

test('one name keeps at most four modules it is imported from', () => {
  const bindings = importsOf(file('src/entry.py', Array.from({ length: 10 }, (_, at) => `from pkg${at} import x`).join('\n')));
  assert.equal(bindings.names.get('x').length, 4);
});
