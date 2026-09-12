import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { prepushUnitCommand } from './prepush-unit-plan.mjs';

const BASE = 'a'.repeat(40);

test('unit plan targets only existing changed tests while ignoring package metadata', () => {
  const existing = new Set(['src/a.test.ts', 'app/b.spec.tsx']);
  const command = prepushUnitCommand({
    paths: ['package.json', 'src/a.test.ts', 'app/b.spec.tsx'],
    base: BASE,
    exists: (path) => existing.has(path),
  });
  assert.match(command, /vitest run 'app\/b\.spec\.tsx' 'src\/a\.test\.ts'/);
  assert.doesNotMatch(command, /--changed/);
  assert.match(command, /\*\/\*\.perf\.test/);
  assert.match(command, /tests\/contract/);
  assert.match(command, /--passWithNoTests/);
});

test('unit plan uses the graph for production paths and never broad-runs deleted tests', () => {
  const graph = prepushUnitCommand({ paths: ['src/lib/value.ts'], base: BASE, exists: () => true });
  assert.match(graph, new RegExp(`--changed='${BASE}'`));
  assert.equal(prepushUnitCommand({ paths: ['src/old.test.ts'], base: BASE, exists: () => false }), ':');
  assert.throws(() => prepushUnitCommand({ paths: ['src/a.test.ts'], base: 'HEAD' }), /40-character/);
});

test('quoted test paths stay literal when the emitted command reaches a shell', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-unit-plan-'));
  try {
    const bin = join(cwd, 'bin');
    mkdirSync(bin);
    const output = join(cwd, 'args');
    writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nprintf '%s\\n' "$@" >'${output}'\n`, { mode: 0o755 });
    const hostile = "src/quote'-$()-probe.test.ts";
    const command = prepushUnitCommand({ paths: [hostile], base: BASE, exists: () => true });
    const result = spawnSync('sh', ['-c', command], { cwd, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(output, 'utf8').trim().split('\n');
    assert.deepEqual(args.slice(0, 4), ['exec', 'vitest', 'run', hostile]);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('planner CLI exits nonzero when the exact Git scope cannot be read', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-unit-plan-scope-'));
  try {
    const cli = new URL('./prepush-unit-plan.mjs', import.meta.url).pathname;
    const result = spawnSync(process.execPath, [cli, `--base=${BASE}`], { cwd, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /prepush-unit-plan/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

 test('real pre-push defers full scans and rejects a failing selected lane', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-hook-'));
  try {
    const git=(...args)=>execFileSync('git',args,{cwd,stdio:'pipe'});
    git('init'); git('config','user.email','test@example.com'); git('config','user.name','Test');
    writeFileSync(join(cwd,'README.md'),'before'); git('add','.'); git('commit','-m','base');
    git('update-ref','refs/remotes/origin/main','HEAD');
    writeFileSync(join(cwd,'README.md'),'after');
    mkdirSync(join(cwd,'src/entities/docs-vault/data'),{recursive:true});
    writeFileSync(join(cwd,'src/entities/docs-vault/data/content.json'),'{}');
    git('add','.'); git('commit','-m','change');
    const bin=join(cwd,'bin'); mkdirSync(bin);
    writeFileSync(join(bin,'pnpm'),'#!/bin/sh\ncase "$1" in docs:language) exit "${PROBE_FAILURE:-0}";; source:language) exit "${LANGUAGE_FAILURE:-0}";; esac\nexit 0\n',{mode:0o755});
    mkdirSync(join(cwd,'scripts/quality/source-language'),{recursive:true});
    copyFileSync(new URL('./quality/source-language/source-paths.mjs',import.meta.url),join(cwd,'scripts/quality/source-language/source-paths.mjs'));
    const realNode = "'" + process.execPath.replaceAll("'", "'\"'\"'") + "'";
    writeFileSync(join(bin,'node'),`#!/bin/sh\nif [ "$1" = "--input-type=module" ]; then exec ${realNode} "$@"; fi\nexit 0\n`,{mode:0o755});
    const hook=new URL('../.githooks/pre-push',import.meta.url).pathname;
    const run=(failure,languageFailure=0)=>spawnSync('sh',[hook],{cwd,encoding:'utf8',input:'refs/heads/test abc refs/heads/test def\n',env:{...process.env,PATH:bin+':'+process.env.PATH,PROBE_FAILURE:String(failure),LANGUAGE_FAILURE:String(languageFailure)}});
    const green=run(0); assert.equal(green.status,0,green.stdout+green.stderr);
    assert.match(green.stdout,/Running .*docs/); assert.doesNotMatch(green.stdout,/Running .*\b(contract|dead_code|unit)\b/);
    assert.doesNotMatch(green.stdout,/Running .*source_language/);
    const red=run(7); assert.equal(red.status,1); assert.match(red.stdout,/FAIL\s+docs/);
    git('update-ref','refs/remotes/origin/main','HEAD');
    writeFileSync(join(cwd,'src/entities/docs-vault/data/content.json'),'{}\n');
    git('add','src/entities/docs-vault/data/content.json'); git('commit','-m','data');
    const data=run(0); assert.equal(data.status,0,data.stdout+data.stderr);
    assert.doesNotMatch(data.stdout,/Running .*\b(source_language|comment_refs)\b/);
    writeFileSync(join(cwd,'probe.rs'),'// source comment\n');
    git('add','probe.rs'); git('commit','-m','source');
    const source=run(0,9); assert.equal(source.status,1); assert.match(source.stdout,/FAIL\s+source_language/);
  } finally {rmSync(cwd,{recursive:true,force:true});}
 });

 test('message changes keep graph selection even beside a test-only edit', () => {
  const base = 'a'.repeat(40);
  for (const paths of [['messages/ko.json'], ['messages/ko.json', 'src/example.test.ts']]) {
    assert.match(prepushUnitCommand({paths,base,exists:()=>true}), /--changed=/);
  }
 });
