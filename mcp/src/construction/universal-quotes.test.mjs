import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { createUniversalQuoter } from './universal-quotes.mjs';

/** The warnings `text` gets in a folder of `files`, with `reads` ([path, [ranges]]) served this session. */
function quotesIn(files, text, reads = []) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-universal-quote-'));
  try {
    for (const [path, body] of Object.entries({ 'package.json': '{"name":"tool"}', ...files })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), body);
    }
    return createUniversalQuoter({ root, reads: new Map(reads) }).quote(text, { body: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const countOf = (warning) => /This family has at least (\d+) members[\s\S]*this session read (\d+):/.exec(warning ?? '')?.slice(1).map(Number) ?? null;

const PY = {
  'app/__init__.py': '',
  'app/transform.py': 'class Transform:\n    def __call__(self, subject):\n        if self.p < 1:\n            return subject\n        return self.apply(subject)\n',
  'app/flip.py': 'from .transform import Transform\n\n\nclass Flip(Transform):\n    def apply(self, subject):\n        return subject\n',
  'app/blur.py': 'from .transform import Transform\n\n\nclass Blur(Transform):\n    def apply(self, subject):\n        return subject\n',
  'app/noise.py': 'from .transform import Transform\n\n\nclass Noise(Transform):\n    def apply(self, subject):\n        return subject\n',
};
const TS = {
  'src/plugin.ts': 'export interface IPlugin {\n  apply(token: string): boolean;\n}\n',
  ...Object.fromEntries(['Slack', 'Mail'].map((name) => [`src/${name.toLowerCase()}.ts`, `import { IPlugin } from './plugin';\n\nexport class ${name} implements IPlugin {\n  apply(token: string) {\n    return Boolean(token);\n  }\n}\n`])),
};

test('a universal sentence citing the base or a member, or naming the base, is quoted with the count', () => {
  assert.deepEqual(countOf(quotesIn(PY, 'Every transform records itself (app/transform.py:L2-L5).')[0]), [3, 0], 'a cite inside the base');
  assert.deepEqual(countOf(quotesIn(PY, 'Each one returns the subject (app/flip.py:L5-L6).')[0]), [3, 0], 'a cite of a member');
  assert.deepEqual(countOf(quotesIn(PY, 'Each one checks p first (app/transform.py:L3-L4).')[0]), [3, 0], 'a cite inside a method of the base');
  assert.deepEqual(countOf(quotesIn(PY, 'All transforms return the subject unchanged.')[0]), [3, 0], 'the base named in the plural');
  assert.deepEqual(countOf(quotesIn(TS, '- **Both plugins** refuse an empty token.')[0]), [2, 0], 'an interface named without its I prefix, after a bullet');
  const [quoted] = quotesIn(PY, 'Every transform records itself (app/transform.py:L2-L5).', [['app/flip.py', [{ startLine: 4, endLine: 6 }]]]);
  assert.match(quoted, /^"Every transform records itself \(app\/transform\.py:L2-L5\)\." speaks for a whole family\. .*this session read 1: write "1 of at least 3 read" or name the member\.$/);
});

test('a family read whole, a counted sentence, an Uncertainty line or another sentence gets nothing', () => {
  const all = ['flip', 'blur', 'noise'].map((name) => [`app/${name}.py`, [{ startLine: 1, endLine: 6 }]]);
  assert.deepEqual(quotesIn(PY, 'Every transform returns the subject.', all), []);
  assert.deepEqual(quotesIn(PY, 'Every transform read so far returns the subject: 1 of at least 3 read.'), []);
  assert.deepEqual(quotesIn(PY, 'Transforms.\n\n## Uncertainty\n\n- Every transform but Flip is unread.\n'), []);
  assert.deepEqual(quotesIn(PY, 'Flip returns the subject (app/flip.py:L5-L6). Most transforms do too.'), []);
});

test('a sentence the server cannot tie to exactly one family says nothing', () => {
  const twoPlugins = {
    ...TS,
    'src/other/plugin.ts': 'export class Plugin {\n  apply(token: string) {\n    return true;\n  }\n}\n',
    ...Object.fromEntries(['Teams', 'Chat'].map((name) => [`src/other/${name.toLowerCase()}.ts`, `import { Plugin } from './plugin';\n\nexport class ${name} extends Plugin {}\n`])),
  };
  assert.deepEqual(quotesIn(twoPlugins, 'Every plugin refuses an empty token.'), [], 'a name two declarations answer to');
  assert.deepEqual(quotesIn({ ...PY, ...TS }, 'Every transform refuses an empty token (src/slack.ts:L4-L6).'), [], 'a cite and a name of different families');
  const fifth = 'Every transform returns the subject (app/flip.py:L5, app/blur.py:L5, app/noise.py:L5, app/flip.py:L6, src/slack.ts:L4).';
  assert.deepEqual(countOf(quotesIn({ ...PY, ...TS }, fifth)[0]), [3, 0], 'cites past the fourth are not read');
  const sameName = {
    'src/a.ts': 'export class Reader {\n  load(path: string) {\n    return path;\n  }\n}\n',
    'src/b.ts': 'export class Writer {\n  load(path: string) {\n    return path;\n  }\n}\n',
  };
  assert.deepEqual(quotesIn(sameName, 'Every loader returns the path (src/a.ts:L2-L4).'), [], 'methods that share a name are no family');
  assert.deepEqual(quotesIn(PY, 'Every ticket is closed.'), [], 'a word that names no base');
  assert.deepEqual(createUniversalQuoter({ root: null }).quote('Every transform returns the subject.'), [], 'a server with no repository');
});

test('a Go interface is the base of the types that match it', () => {
  const go = {
    'go.mod': 'module example.com/tool\n\ngo 1.22\n',
    'store/store.go': 'package store\n\ntype Store interface {\n\tGet(key string) string\n\tSet(key string, value string)\n}\n',
    ...Object.fromEntries(['Disk', 'Memory'].map((name) => [`store/${name.toLowerCase()}.go`, `package store\n\ntype ${name} struct{}\n\nfunc (s *${name}) Get(key string) string {\n\treturn key\n}\n\nfunc (s *${name}) Set(key string, value string) {}\n`])),
  };
  assert.deepEqual(countOf(quotesIn(go, 'Every store keeps values in memory (store/store.go:L3-L6).')[0]), [2, 0]);
  assert.deepEqual(countOf(quotesIn(go, 'Every store keeps values in memory.', [['store/disk.go', [{ startLine: 5, endLine: 7 }]]])[0]), [2, 1], 'a read of a method reads its type');
});
