import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { buildBreadthMap } from './breadth-map.mjs';
import { collectSourceUnits } from './source-units.mjs';
import { surveyAreas } from './survey-areas.mjs';

function write(root, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

/** What a clean checkout holds: tracked files, one of them under an ignored folder, and an untracked draft. */
const CHECKOUT = {
  '.gitignore': 'output/\n/next-env.d.ts\ndist/\ndocs/api/\ndocs/*.draft.md\ngenerated/\n',
  'package.json': JSON.stringify({ name: 'tool', bin: { tool: 'dist/cli.js' } }),
  'src/cli.ts': 'export function run(argv: string[]) { return argv.length; }\n',
  'src/core/engine.ts': 'export function start() { return 1; }\n',
  'src/core/draft.ts': 'export function sketch() { return 2; }\n',
  'docs/guide.md': '# Guide\n\nHow the tool runs.\n',
  'generated/schema.ts': 'export const schema = { version: 1 };\n',
};

/** What a developer's checkout adds beside it, all of it ignored by the `.gitignore` above. */
const IGNORED = {
  'next-env.d.ts': '/// <reference types="next" />\n',
  'output/scratch/pw.config.ts': 'export default { testDir: "." };\n',
  'output/scratch/probe.ts': 'export function probe() { return 3; }\n',
  'dist/cli.js': '#!/usr/bin/env node\nrequire("../src/cli");\n',
  'docs/api/index.md': '# API\n\nGenerated reference.\n',
  'docs/notes.draft.md': '# Notes\n\nA page kept out of Git.\n',
  'generated/client.ts': 'export function call() { return 4; }\n',
};

function checkout(base, name, files) {
  const root = join(base, name);
  write(root, files);
  git(root, 'init', '-q');
  git(root, 'add', '.gitignore', 'package.json', 'src/cli.ts', 'src/core/engine.ts', 'docs/guide.md');
  git(root, 'add', '-f', 'generated/schema.ts');
  return root;
}

/** Everything the survey and the coverage measure read from a root, with the root's own path left out. */
function surveyed(root) {
  const collection = collectSourceUnits(root);
  const map = buildBreadthMap(root, { collection });
  const product = collection.files.filter((file) => file.class === 'product' && file.lines > 0);
  return {
    files: collection.files.map((file) => file.path),
    areas: surveyAreas(product).map((area) => area.path),
    text: map.text.split(root).join('<root>'),
  };
}

test('a working checkout is surveyed like a clean one: files and folders Git ignores count nowhere', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-git-ignored-'));
  try {
    const clean = checkout(base, 'clean', CHECKOUT);
    const working = checkout(base, 'working', { ...CHECKOUT, ...IGNORED });
    const survey = surveyed(working);
    for (const path of Object.keys(IGNORED)) {
      assert.doesNotMatch(survey.text, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${path} is not in the survey`);
    }
    assert.ok(survey.files.includes('generated/schema.ts'), 'a tracked file under an ignored folder is still surveyed');
    assert.ok(survey.files.includes('src/core/draft.ts'), 'an untracked file Git does not ignore is still surveyed');
    assert.ok(!survey.areas.includes('output') && !survey.areas.includes('.'), 'no area comes from ignored files');
    assert.deepEqual(survey, surveyed(clean));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('when Git cannot answer, every file is surveyed as before', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-git-ignored-'));
  const path = process.env.PATH;
  try {
    const root = join(base, 'export');
    write(root, { ...CHECKOUT, ...IGNORED });
    const expected = Object.keys({ ...CHECKOUT, ...IGNORED }).filter((file) => /\.[jt]s$/.test(file) && !file.startsWith('dist/')).sort();
    assert.deepEqual(collectSourceUnits(root).files.map((file) => file.path).sort(), expected, 'outside a work tree');
    git(root, 'init', '-q');
    process.env.PATH = join(base, 'no-programs');
    assert.deepEqual(collectSourceUnits(root).files.map((file) => file.path).sort(), expected, 'with no git program');
  } finally {
    process.env.PATH = path;
    rmSync(base, { recursive: true, force: true });
  }
});

test('a root Git ignores, or one inside an ignored folder, is surveyed whole', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-git-ignored-'));
  try {
    write(base, {
      '.gitignore': 'sample/\n',
      'sample/app.ts': 'export function app() { return 1; }\n',
      'sample/inner/engine.ts': 'export function engine() { return 2; }\n',
    });
    git(base, 'init', '-q');
    assert.deepEqual(collectSourceUnits(join(base, 'sample')).files.map((file) => file.path).sort(), ['app.ts', 'inner/engine.ts']);
    assert.deepEqual(collectSourceUnits(join(base, 'sample', 'inner')).files.map((file) => file.path), ['engine.ts']);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
