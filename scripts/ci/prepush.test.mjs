import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { contentTree, proofFile, recordProof, treeOf } from '../lib/ci/focused-checks-proof.mjs';
import { createTestReach } from '../lib/import-graph/test-reach.mjs';
import { fastCheckPlan, selectNodeTestFiles } from '../lib/prepush/fast-checks.mjs';
import { prepushUnitCommand } from './prepush-unit-plan.mjs';

const BASE = 'a'.repeat(40);

function writeNodeShim(bin, { unitCommand = null, proof = true } = {}) {
  writeFileSync(join(bin, '../.git/info/exclude'), '/scripts/quality/source-language/source-paths.mjs\n/scripts/lib/ci/focused-checks-proof.mjs\n');
  const root = new URL('../..', import.meta.url).pathname;
  const quote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const realNode = quote(process.execPath);
  const unit = unitCommand === null
    ? `shift; exec ${realNode} ${quote(`${root}scripts/ci/prepush-unit-plan.mjs`)} "$@"`
    : `printf '%s\\n' ${quote(unitCommand)}`;
  const proofRun = proof ? `shift; exec ${realNode} ${quote(`${root}scripts/lib/ci/focused-checks-proof.mjs`)} "$@"` : 'exit 1';
  writeFileSync(join(bin, 'node'), `#!/bin/sh\ncase "$1" in\n  --input-type=module) exec ${realNode} "$@" ;;\n  scripts/lib/prepush/fast-checks.mjs) shift; exec ${realNode} ${quote(`${root}scripts/lib/prepush/fast-checks.mjs`)} "$@" ;;\n  scripts/ci/prepush-unit-plan.mjs) ${unit} ;;\n  scripts/lib/ci/focused-checks-proof.mjs) ${proofRun} ;;\nesac\nexit 0\n`, { mode: 0o755 });
}

function hookFixture(t, changes) {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-prepush-fast-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const put = (file, content) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), content);
  };
  git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  put('README.md', 'base\n'); git('add', 'README.md'); git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', base);
  for (const [file, content] of Object.entries(changes)) put(file, content);
  git('add', '.'); git('commit', '-qm', 'change');
  const head = git('rev-parse', 'HEAD');
  const bin = join(cwd, 'bin'); mkdirSync(bin);
  const log = join(cwd, 'commands.jsonl');
  writeFileSync(join(bin, 'pnpm'), `#!${process.execPath}\nconst fs = require('node:fs');\nconst args = process.argv.slice(2);\nfs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');\nprocess.exit(args.includes(process.env.FAIL_ARGUMENT) ? 7 : 0);\n`, { mode: 0o755 });
  writeNodeShim(bin);
  put('scripts/quality/source-language/source-paths.mjs', readFileSync(new URL('../quality/source-language/source-paths.mjs', import.meta.url), 'utf8'));
  const run = ({ input = `refs/heads/test ${head} refs/heads/test ${base}\n`, env = {} } = {}) =>
    spawnSync('sh', [new URL('../../.githooks/pre-push', import.meta.url).pathname], {
      cwd, encoding: 'utf8', input, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env },
    });
  const commands = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { cwd, base, head, git, put, run, commands };
}

test('the hook refuses a different pushed commit and accepts a tag for HEAD', (t) => {
  const fixture = hookFixture(t, { 'README.md': 'changed\n' });
  const wrong = fixture.run({ input: `refs/heads/other ${fixture.base} refs/heads/other ${fixture.base}\n` });
  assert.equal(wrong.status, 1, wrong.stdout + wrong.stderr);
  assert.deepEqual(fixture.commands(), []);
  fixture.git('tag', '-am', 'release', 'probe-tag');
  const tag = fixture.git('rev-parse', 'probe-tag');
  const tagged = fixture.run({ input: `refs/tags/probe-tag ${tag} refs/tags/probe-tag ${'0'.repeat(40)}\n` });
  assert.equal(tagged.status, 0, tagged.stdout + tagged.stderr);
  assert.ok(fixture.commands().length > 0);
});

test('tracked edits block new hook evidence while deletion-only pushes do nothing', (t) => {
  const fixture = hookFixture(t, { 'src/value.ts': 'export const value = 1;\n' });
  fixture.put('src/value.ts', 'export const value = 2;\n');
  const dirty = fixture.run();
  assert.equal(dirty.status, 1, dirty.stdout + dirty.stderr);
  assert.deepEqual(fixture.commands(), []);
  fixture.git('add', 'src/value.ts');
  assert.equal(fixture.run().status, 1);
  const deletion = fixture.run({ input: `refs/heads/test ${'0'.repeat(40)} refs/heads/test ${fixture.head}\n` });
  assert.equal(deletion.status, 0, deletion.stdout + deletion.stderr);
  assert.deepEqual(fixture.commands(), []);
});

test('untracked source cannot mask a missing committed import, while ignored output stays local', (t) => {
  const fixture = hookFixture(t, { 'src/value.ts': "import './missing';\n" });
  fixture.put('src/missing.ts', 'export {};\n');
  const hidden = fixture.run();
  assert.equal(hidden.status, 1, hidden.stdout + hidden.stderr);
  assert.match(hidden.stderr, /src\/missing\.ts/);
  assert.deepEqual(fixture.commands(), []);
  assert.ok(existsSync(join(fixture.cwd, 'src/missing.ts')));
  fixture.git('add', 'src/missing.ts'); fixture.git('commit', '-qm', 'include the source');
  fixture.put('.git/info/exclude', '/scripts/quality/source-language/source-paths.mjs\n/src/entities/docs-vault/data/\n');
  fixture.put('src/entities/docs-vault/data/content.json', '{}\n');
  fixture.put('local-notes.txt', 'local\n');
  const head = fixture.git('rev-parse', 'HEAD');
  const ignored = fixture.run({ input: `refs/heads/test ${head} refs/heads/test ${fixture.base}\n` });
  assert.equal(ignored.status, 0, ignored.stdout + ignored.stderr);
});

test('invalid push objects fail before any local command runs', (t) => {
  const fixture = hookFixture(t, { 'README.md': 'changed\n' });
  for (const sha of ['abc', 'f'.repeat(40), fixture.git('hash-object', 'README.md')]) {
    const result = fixture.run({ input: `refs/heads/test ${sha} refs/heads/test ${fixture.base}\n` });
    assert.equal(result.status, 1, result.stdout + result.stderr);
  }
  assert.deepEqual(fixture.commands(), []);
});

test('changed script tests run once and their lint or test failure blocks the push', (t) => {
  const file = "scripts/quote'$(touch PWNED)\nlocal.test.mjs";
  const fixture = hookFixture(t, { [file]: "import test from 'node:test'; test('example', () => {});\n" });
  const green = fixture.run();
  assert.equal(green.status, 0, green.stdout + green.stderr);
  const commands = fixture.commands();
  assert.equal(commands.filter((args) => args.includes('eslint') && args.includes(file)).length, 1);
  assert.equal(commands.filter((args) => args.includes('--test') && args.includes(file)).length, 1);
  assert.equal(existsSync(join(fixture.cwd, 'PWNED')), false);
  for (const arg of ['eslint', '--test']) {
    const red = fixture.run({ env: { FAIL_ARGUMENT: arg } });
    assert.equal(red.status, 1, red.stdout + red.stderr);
  }
});

test('document registries and workflow guards run only for their inputs and block failures', (t) => {
  const fixture = hookFixture(t, { 'README.md': 'changed\n', '.github/workflows/probe.yml': 'name: Probe\n' });
  const green = fixture.run();
  assert.equal(green.status, 0, green.stdout + green.stderr);
  const commands = fixture.commands();
  assert.equal(commands.filter((args) => args[0] === 'dev-checks:check').length, 1);
  const workflow = commands.filter((args) => args.includes('tests/contract/security/workflow-security.contract.test.ts'));
  assert.equal(workflow.length, 1);
  assert.ok(workflow[0].includes('tests/contract/security/github-action-pins.contract.test.ts'));
  for (const arg of ['dev-checks:check', 'tests/contract/security/workflow-security.contract.test.ts']) {
    const red = fixture.run({ env: { FAIL_ARGUMENT: arg } });
    assert.equal(red.status, 1, red.stdout + red.stderr);
  }
});

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
  assert.doesNotMatch(command, /--passWithNoTests/);
});

test('unit plan unions cross-package, deleted-source and message reach in one run', (t) => {
  const fixture = hookFixture(t, {
    'mcp/value.mjs': 'export const value = 1;\n',
    'messages/ko.json': '{}\n',
    'src/one.test.ts': "import '../mcp/value.mjs'; import '../../messages/ko.json';\n",
    'src/two.test.ts': "import '../mcp/deleted.mjs';\n",
    'src/timing.perf.test.ts': "import '../mcp/value.mjs';\n",
    'tests/contract/example.test.ts': "import '../../mcp/value.mjs';\n",
  });
  const command = prepushUnitCommand({
    paths: ['mcp/value.mjs', 'mcp/deleted.mjs', 'messages/ko/library.json', 'src/one.test.ts'],
    base: BASE,
    exists: (file) => existsSync(join(fixture.cwd, file)),
    reach: createTestReach(fixture.cwd),
  });
  assert.equal(command, "pnpm exec vitest run 'src/one.test.ts' 'src/two.test.ts' --exclude='**/*.perf.test.*' --exclude='tests/contract/**'");
  assert.equal(prepushUnitCommand({ paths: ['src/old.test.ts'], base: BASE, exists: () => false }), ':');
  assert.throws(() => prepushUnitCommand({ paths: ['src/a.test.ts'], base: 'HEAD' }), /40-character/);
});

test('fast Node selection expands only exact aliases and never drops lifecycle hooks', () => {
  const commands = [
    'pnpm exec node --test scripts/a.test.mjs',
    'pnpm test:exact',
    'pnpm test:before',
    'pnpm test:after',
    'pnpm test:flags',
    'pnpm test:broad',
    'pnpm integration:mcp',
    'pnpm exec playwright test tests/e2e/example.spec.ts',
    'pnpm test:contracts',
    'pnpm knip',
  ].map((command) => ({ command }));
  const scripts = {
    'test:exact': 'node --test scripts/a.test.mjs scripts/b.test.mjs',
    'test:before': 'node --test scripts/before.test.mjs',
    'pretest:before': 'node setup.mjs',
    'test:after': 'node --test scripts/after.test.mjs',
    'posttest:after': 'node cleanup.mjs',
    'test:flags': 'node --test --test-name-pattern=one scripts/flags.test.mjs',
    'test:broad': 'node --test scripts/*.test.mjs',
    'integration:mcp': 'node mcp/test-integration.mjs',
  };
  assert.deepEqual(selectNodeTestFiles({ commands, scripts, exists: () => true }), [
    'scripts/a.test.mjs', 'scripts/b.test.mjs',
  ]);
});

test('the real CI authority mapping selects its Node regression files once', () => {
  const scripts = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts;
  const plan = fastCheckPlan(['scripts/ci/classify-change.mjs', '.github/workflows/e2e.yml'], { scripts });
  const expected = scripts['test:ci:impact'].slice('node --test '.length).split(' ');
  assert.ok(expected.length > 0);
  for (const file of expected) assert.ok(plan.nodeFiles.includes(file), file);
  assert.equal(new Set(plan.nodeFiles).size, plan.nodeFiles.length);
  assert.equal(plan.workflows, true);
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
    copyFileSync(new URL('../quality/source-language/source-paths.mjs',import.meta.url),join(cwd,'scripts/quality/source-language/source-paths.mjs'));
    writeNodeShim(bin, { unitCommand: ':', proof: false });
    const hook=new URL('../../.githooks/pre-push',import.meta.url).pathname;
    const run=(failure,languageFailure=0)=>spawnSync('sh',[hook],{cwd,encoding:'utf8',input:`refs/heads/test ${String(git('rev-parse','HEAD')).trim()} refs/heads/test ${BASE}\n`,env:{...process.env,PATH:bin+':'+process.env.PATH,PROBE_FAILURE:String(failure),LANGUAGE_FAILURE:String(languageFailure)}});
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

 test('a changed file name reaches eslint as data and is never executed', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-hook-names-'));
  try {
    const git=(...args)=>execFileSync('git',args,{cwd,stdio:'pipe'});
    git('init'); git('config','user.email','test@example.com'); git('config','user.name','Test');
    writeFileSync(join(cwd,'README.md'),'base'); git('add','.'); git('commit','-m','base');
    git('update-ref','refs/remotes/origin/main','HEAD');
    const hostile = ['src/probe$(touch PWNED).ts', "src/quote'`touch PWNED2`.ts"];
    mkdirSync(join(cwd,'src'));
    for (const name of hostile) writeFileSync(join(cwd,name),'export {};\n');
    git('add','.'); git('commit','-m','names');
    const bin=join(cwd,'bin'); mkdirSync(bin);
    const eslintArgs=join(cwd,'eslint-args');
    writeFileSync(join(bin,'pnpm'),`#!/bin/sh\nif [ "$1" = exec ] && [ "$2" = eslint ]; then shift 2; printf '%s\\n' "$@" >'${eslintArgs}'; fi\nexit 0\n`,{mode:0o755});
    writeNodeShim(bin, { unitCommand: ':', proof: false });
    const hook=new URL('../../.githooks/pre-push',import.meta.url).pathname;
    const result=spawnSync('sh',[hook],{cwd,encoding:'utf8',input:`refs/heads/test ${String(git('rev-parse','HEAD')).trim()} refs/heads/test ${BASE}\n`,env:{...process.env,PATH:bin+':'+process.env.PATH}});
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.equal(existsSync(join(cwd,'PWNED')),false,'a file name ran as a command substitution');
    assert.equal(existsSync(join(cwd,'PWNED2')),false,'a file name ran as a backtick substitution');
    assert.deepEqual(readFileSync(eslintArgs,'utf8').trim().split('\n'),['--max-warnings=0','--no-warn-ignored','--',...hostile]);
  } finally {rmSync(cwd,{recursive:true,force:true});}
 });

 test('a lockfile change runs the license lane, and a refused license stops the push', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-hook-licenses-'));
  try {
    const git=(...args)=>execFileSync('git',args,{cwd,stdio:'pipe'});
    git('init'); git('config','user.email','test@example.com'); git('config','user.name','Test');
    writeFileSync(join(cwd,'README.md'),'base'); git('add','.'); git('commit','-m','base');
    git('update-ref','refs/remotes/origin/main','HEAD');
    writeFileSync(join(cwd,'pnpm-lock.yaml'),'lockfileVersion: 9.0\n'); git('add','.'); git('commit','-m','lock');
    const bin=join(cwd,'bin'); mkdirSync(bin);
    writeFileSync(join(bin,'pnpm'),'#!/bin/sh\ncase "$1" in licenses:check) exit "${LICENSE_FAILURE:-0}";; esac\nexit 0\n',{mode:0o755});
    writeNodeShim(bin, { unitCommand: ':', proof: false });
    const hook=new URL('../../.githooks/pre-push',import.meta.url).pathname;
    const run=(failure)=>spawnSync('sh',[hook],{cwd,encoding:'utf8',input:`refs/heads/test ${String(git('rev-parse','HEAD')).trim()} refs/heads/test ${BASE}\n`,env:{...process.env,PATH:bin+':'+process.env.PATH,LICENSE_FAILURE:String(failure)}});
    const green=run(0); assert.equal(green.status,0,green.stdout+green.stderr);
    assert.match(green.stdout,/Running .*\blicenses\b/);
    const red=run(3); assert.equal(red.status,1); assert.match(red.stdout,/FAIL\s+licenses/);
  } finally {rmSync(cwd,{recursive:true,force:true});}
 });

 test('lanes never inherit the pushing repository through GIT_DIR', () => {
  // Git exports GIT_DIR to hooks; a lane that builds a scratch repository in a temp directory must
  // not configure or commit to the real one.
  const cwd=mkdtempSync(join(tmpdir(),'atlas-hook-env-'));
  try {
    const git=(...args)=>execFileSync('git',args,{cwd,stdio:'pipe'}).toString().trim();
    git('init'); git('config','user.email','test@example.com'); git('config','user.name','Owner');
    writeFileSync(join(cwd,'README.md'),'before'); git('add','.'); git('commit','-m','base');
    git('update-ref','refs/remotes/origin/main','HEAD');
    writeFileSync(join(cwd,'README.md'),'after'); git('add','.'); git('commit','-m','change');
    const bin=join(cwd,'bin'); mkdirSync(bin);
    // The docs lane stands in for any fixture test: a fresh repository in a temp dir.
    writeFileSync(join(bin,'pnpm'),'#!/bin/sh\ncase "$1" in docs:language) d=$(mktemp -d) && cd "$d" && git init -q . && git config user.name Leak ;; esac\nexit 0\n',{mode:0o755});
    writeNodeShim(bin, { unitCommand: ':', proof: false });
    const hook=new URL('../../.githooks/pre-push',import.meta.url).pathname;
    const result=spawnSync('sh',[hook],{cwd,encoding:'utf8',input:`refs/heads/test ${String(git('rev-parse','HEAD')).trim()} refs/heads/test ${BASE}\n`,env:{...process.env,PATH:bin+':'+process.env.PATH,GIT_DIR:join(cwd,'.git')}});
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.match(result.stdout,/Running .*docs/);
    assert.equal(git('config','user.name'),'Owner','a lane rewrote the pushing repository\'s config');
  } finally {rmSync(cwd,{recursive:true,force:true});}
 });

 test('the unit lane is skipped only when a proof covers the merge base to HEAD', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-hook-proof-'));
  try {
    const git=(...args)=>execFileSync('git',args,{cwd,stdio:'pipe',encoding:'utf8'}).trim();
    git('init'); git('config','user.email','test@example.com'); git('config','user.name','Test');
    mkdirSync(join(cwd,'src')); writeFileSync(join(cwd,'src/a.ts'),'export const a = 1;\n'); git('add','.'); git('commit','-m','base');
    git('update-ref','refs/remotes/origin/main','HEAD');
    const base=treeOf('HEAD',{cwd});
    writeFileSync(join(cwd,'src/a.ts'),'export const a = 2;\n');
    const content=contentTree({cwd});
    git('add','.'); git('commit','-m','change');
    const bin=join(cwd,'bin'); mkdirSync(bin);
    writeFileSync(join(bin,'pnpm'),'#!/bin/sh\nexit 0\n',{mode:0o755});
    mkdirSync(join(cwd,'scripts/lib/ci'),{recursive:true});
    copyFileSync(new URL('../lib/ci/focused-checks-proof.mjs',import.meta.url),join(cwd,'scripts/lib/ci/focused-checks-proof.mjs'));
    writeNodeShim(bin, { unitCommand: "pnpm exec vitest run src/a.test.ts" });
    const hook=new URL('../../.githooks/pre-push',import.meta.url).pathname;
    const run=()=>spawnSync('sh',[hook],{cwd,encoding:'utf8',input:`refs/heads/test ${String(git('rev-parse','HEAD')).trim()} refs/heads/test ${BASE}\n`,env:{...process.env,PATH:bin+':'+process.env.PATH}});
    const without=run(); assert.equal(without.status,0,without.stdout+without.stderr);
    assert.match(without.stdout,/Running .*\bunit\b/); assert.doesNotMatch(without.stdout,/unit: every change/);
    recordProof({from:base,to:content,file:proofFile({cwd})});
    const withProof=run(); assert.equal(withProof.status,0,withProof.stdout+withProof.stderr);
    assert.match(withProof.stdout,/unit: every change since the merge base passed/); assert.doesNotMatch(withProof.stdout,/Running .*\bunit\b/);
  } finally {rmSync(cwd,{recursive:true,force:true});}
 });
