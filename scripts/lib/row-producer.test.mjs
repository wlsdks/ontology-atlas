import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ROW_PRODUCER_ENTRY, rowProducerClosure, rowProducerHash } from './row-producer.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'row-producer-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@/*': ['./*'], '@/shared/*': ['./src/shared/*'] } } }));
  for (const [path, text] of Object.entries(files)) write(path, text);
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('the app build names its rows after the parser and derive code it ships', () => {
  const { files } = rowProducerClosure(REPO);
  for (const producer of [
    ROW_PRODUCER_ENTRY,
    'src/shared/lib/vault-document/parse-frontmatter.ts',
    'src/shared/lib/vault-document/meaning-findings.ts',
  ]) {
    assert.ok(files.includes(producer), `${producer} is part of the row producer`);
  }
});

test('a change to any module or package a row depends on gives the rows a new name; anything else does not', () => {
  const { root, write, cleanup } = tree({
    'src/entry.ts': "import { parse } from './parse';\nimport type { Shape } from '@/shared/shape';\nimport { load } from 'yaml-ish/load';\n",
    'src/parse.ts': "export const parse = (text: string) => text.trim();\n",
    'src/shared/shape.ts': 'export type Shape = { a: number };\n',
    'src/unrelated.ts': 'export const other = 1;\n',
    'node_modules/yaml-ish/package.json': JSON.stringify({ version: '1.0.0' }),
  });
  try {
    const name = () => rowProducerHash(root, 'src/entry.ts');
    const first = name();
    assert.equal(name(), first, 'the same code always has the same name');

    write('src/unrelated.ts', 'export const other = 2;\n');
    assert.equal(name(), first, 'code a row does not load leaves the name alone');

    write('src/parse.ts', "export const parse = (text: string) => text.trimStart();\n");
    const parserChanged = name();
    assert.notEqual(parserChanged, first, 'a changed parser renames the rows');

    write('src/shared/shape.ts', 'export type Shape = { a: string };\n');
    const aliasChanged = name();
    assert.notEqual(aliasChanged, parserChanged, 'a module reached through @/ counts');

    write('node_modules/yaml-ish/package.json', JSON.stringify({ version: '1.0.1' }));
    assert.notEqual(name(), aliasChanged, 'a package upgrade renames the rows');
  } finally {
    cleanup();
  }
});
