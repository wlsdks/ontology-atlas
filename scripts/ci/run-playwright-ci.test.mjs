import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventoryFiles, balanceFiles, failingSpecFiles, runPlaywrightCi } from './run-playwright-ci.mjs';
import { measureReport, mergeDurations } from './refresh-playwright-durations.mjs';

const passed = { expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] };
const skipped = { expectedStatus: 'skipped', status: 'skipped', results: [{ status: 'skipped' }] };
const report = (names, tests = [passed]) => ({ suites: [{ specs: names.map((file) => ({ file, tests })) }] });

test('help and invalid arguments cannot start discovery or write an assignment', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-playwright-cli-'));
  const spawn = t.mock.fn(() => { throw new Error('unexpected spawn'); });
  t.mock.method(console, 'log', () => {});
  try {
    for (const flag of ['--help', '-h']) assert.equal(runPlaywrightCi([flag], { cwd, spawn }), 0);
    for (const argv of [
      ['--shards=1/3'], ['--project=unknown'], ['--project'], ['--shard=0/3'], ['--shard=4/3'],
      ['--shard=1/2', '--shard=1/3'], ['--project=smoke', '--project=post-merge'],
      ['--exclude=web-surface-smoke.spec.ts', '--exclude=web-surface-smoke.spec.ts'],
      ['--exclude=a.spec.ts'], ['--help', '--project=smoke'], ['--shard=1/9007199254740992'],
      ['--only=../a.spec.ts'], ['--only=a.spec.ts', '--only=a.spec.ts'],
    ]) assert.throws(() => runPlaywrightCi(argv, { cwd, spawn }), /argument|project|shard|duplicate|separately|help|spec path/i, argv.join(' '));
    assert.equal(spawn.mock.callCount(), 0);
    assert.deepEqual(readdirSync(cwd), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('both named projects constrain discovery and execution without broadening the selection', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-playwright-project-'));
  try {
    for (const project of ['smoke', 'post-merge']) {
      const calls = [];
      const spawn = (_bin, args, options) => {
        calls.push(args);
        if (args.includes('--list')) return { status: 0, stdout: JSON.stringify(report(['a.spec.ts'])) };
        writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify(report(['a.spec.ts'])));
        return { status: 0 };
      };
      assert.equal(runPlaywrightCi([`--project=${project}`, '--shard=1/1'], { cwd, spawn }), 0);
      assert.ok(calls.every((args) => args.includes(`--project=${project}`)));
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('success requires execution evidence for assigned runnable tests, not just their definitions', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-playwright-results-'));
  try {
    for (const tests of [
      [{}], [{ ...passed, results: [] }], [skipped],
      [{ ...passed, results: [{ status: 'interrupted' }] }],
      [{ ...passed, status: 'unexpected', results: [{ status: 'failed' }] }],
      [{ ...skipped, expectedStatus: 'passed' }],
    ]) {
      const spawn = (_bin, args, options) => {
        if (args.includes('--list')) return { status: 0, stdout: JSON.stringify(report(['a.spec.ts'])) };
        writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify(report(['a.spec.ts'], tests)));
        return { status: 0 };
      };
      assert.throws(() => runPlaywrightCi(['--shard=1/1'], { cwd, spawn }), /execution|skipped|outcome/, JSON.stringify(tests));
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('explicit skips and retry successes stay visible without blocking unrelated development', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-playwright-outcomes-'));
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  try {
    const tests = [passed, skipped, { ...passed, status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }];
    let discovery = report(['a.spec.ts'], tests);
    let actual = discovery;
    const spawn = (_bin, args, options) => {
      if (args.includes('--list')) return { status: 0, stdout: JSON.stringify(discovery) };
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify(actual));
      return { status: 0 };
    };
    assert.equal(runPlaywrightCi(['--shard=1/1'], { cwd, spawn }), 0);
    assert.ok(lines.some((line) => /expected=1.*flaky=1.*skipped=1/.test(line)));
    discovery = actual = report(['a.spec.ts'], [skipped]);
    assert.equal(runPlaywrightCi(['--shard=1/1'], { cwd, spawn }), 0);
    assert.ok(lines.some((line) => /expected=0.*flaky=0.*skipped=1/.test(line)));
    assert.ok(lines.some((line) => /no runnable.*discovery/i.test(line)));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test('discovery rejects errors, empty subjects and unsupported paths', () => {
  assert.throws(() => inventoryFiles({ suites: [] }), /zero/);
  assert.throws(() => inventoryFiles(report(['a.spec.ts'], [])), /zero tests/);
  assert.throws(() => inventoryFiles({ errors: ['broken import'] }), /errors/);
  assert.throws(() => inventoryFiles(report(['../escape.spec.ts'])), /unsupported/);
  assert.deepEqual(inventoryFiles(report(['a.spec.ts', 'a.spec.ts'])), [{file:'a.spec.ts',tests:2}]);
});

test('recursive discovery retains nested file identities and every test', () => {
  const found=inventoryFiles({suites:[{specs:[{file:'a.spec.ts',tests:[{}]}],suites:[
    {specs:[{file:'gray-area/gray-area.spec.ts',tests:[{},{}]},{file:'other/a.spec.ts',tests:[{}]}]},
  ]}]});
  assert.deepEqual(found,[{file:'a.spec.ts',tests:1},{file:'gray-area/gray-area.spec.ts',tests:2},{file:'other/a.spec.ts',tests:1}]);
  const shards=balanceFiles(found,{files:{}},5);
  assert.deepEqual(shards.flatMap(s=>s.files).sort(),found.map(f=>f.file).sort());
  assert.equal(shards.reduce((sum,s)=>sum+s.tests,0),4);
});

test('nested discovery still rejects absolute, traversal, control and shell paths', () => {
  for(const file of ['/tmp/a.spec.ts','../a.spec.ts','area/../a.spec.ts','area/./a.spec.ts','area//a.spec.ts','area\\a.spec.ts','C:/a.spec.ts','area/a.spec.ts\n','area/a.spec.ts\r','area/a.spec.ts;touch','$(touch)/a.spec.ts','area/*/a.spec.ts']) {
    assert.throws(()=>inventoryFiles(report([file])),/unsupported/,file);
  }
});

test('execution filters distinguish a root spec from the same basename in a nested folder', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-playwright-nested-'));
  try {
    const files=['a.spec.ts','other/a.spec.ts'];let filters=[];
    const spawn=(_bin,args,options)=>{
      if(args.includes('--list'))return {status:0,stdout:JSON.stringify(report(files))};
      filters=args.filter(arg=>arg.endsWith('$'));
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME,JSON.stringify(report(files)));
      return {status:0};
    };
    assert.equal(runPlaywrightCi(['--shard=1/1'],{cwd,spawn}),0);
    for(const file of files){
      const matching=filters.filter(filter=>new RegExp(filter).test(`${cwd}/tests/e2e/${file}`));
      assert.equal(matching.length,1,file);
    }
  } finally {rmSync(cwd,{recursive:true,force:true});}
});

test('balancing partitions every live file exactly once including new files; timing is only advisory', () => {
  const files = ['a', 'b', 'c', 'd', 'new'].map((name) => ({file:`${name}.spec.ts`,tests:1}));
  const history = {files:{'a.spec.ts':{seconds:100,tests:1},'b.spec.ts':{seconds:90,tests:1},'c.spec.ts':{seconds:80,tests:1}}};
  const bins = balanceFiles(files, history, 3);
  assert.deepEqual(bins.flatMap((bin) => bin.files).sort(), files.map((row) => row.file).sort());
  assert.ok(bins.every((bin) => bin.files.length > 0));
  assert.equal(bins.reduce((sum, bin) => sum + bin.tests, 0), 5);
  assert.deepEqual(balanceFiles([...files].reverse(), history, 3), bins);
  assert.throws(() => balanceFiles([...files, files[0]], history, 3), /duplicate/);
  assert.throws(() => balanceFiles(files, history, 0), /invalid/);
});

test('the measured slow files are distributed across shards, rather than clustered at the end', () => {
  const history = JSON.parse(readFileSync(new URL('../data/playwright-file-durations.json',import.meta.url)));
  const files = Object.entries(history.files).map(([file,row]) => ({file,tests:row.tests}));
  const bins = balanceFiles(files,history,3);
  const weights = bins.map((bin) => bin.seconds);
  assert.ok(Math.max(...weights)-Math.min(...weights) < Math.max(...Object.values(history.files).map((row) => row.seconds)));
  assert.equal(new Set(bins.flatMap((bin) => bin.files)).size,files.length);
});

test('executor keeps discovery errors and test failures red, and excludes only separately owned files', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-playwright-run-'));
  try {
    const calls=[];
    const spawn=(_bin,args) => {
      calls.push(args);
      return args.includes('--list') ? {status:0,stdout:JSON.stringify(report(['a.spec.ts','web-surface-smoke.spec.ts']))} : {status:7};
    };
    assert.equal(runPlaywrightCi(['--shard=1/1','--exclude=web-surface-smoke.spec.ts'],{cwd,spawn,env:{CI:'true'}}),7);
    assert.ok(calls[1].includes('/tests/e2e/a\\.spec\\.ts$'));
    assert.ok(!calls[1].some((arg)=>arg.includes('web-surface')));
    assert.ok(calls[1].includes('--max-failures=5'), 'a red CI shard stops early, but late enough to show independent failures together');
    assert.equal(runPlaywrightCi(['--shard=1/1','--exclude=web-surface-smoke.spec.ts'],{cwd,spawn,env:{CI:'false'}}),7);
    assert.ok(!calls[3].some((arg)=>arg.startsWith('--max-failures=')), 'local runs keep their full diagnostic inventory');
    assert.throws(()=>runPlaywrightCi(['--shard=4/3'],{cwd,spawn}),/exceeds/);
    assert.throws(()=>runPlaywrightCi(['--exclude=a.spec.ts'],{cwd,spawn}),/separately/);
    assert.throws(()=>runPlaywrightCi([],{cwd,spawn:()=>({status:1,stderr:'bad config'})}),/discovery failed/);
  } finally {rmSync(cwd,{recursive:true,force:true});}
});

test('successful process exit cannot conceal missing assigned tests', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-playwright-coverage-'));
  try {
    const spawn=(_bin,args) => args.includes('--list')
      ? {status:0,stdout:JSON.stringify(report(['a.spec.ts','b.spec.ts']))}
      : {status:0};
    assert.throws(()=>runPlaywrightCi(['--shard=1/1'],{cwd,spawn}),/ENOENT/);
  } finally {rmSync(cwd,{recursive:true,force:true});}
});

test('executed inventory must equal the assigned inventory before success is accepted', () => {
  const cwd=mkdtempSync(join(tmpdir(),'atlas-playwright-report-'));
  try {
    let actual=['a.spec.ts'];
    const spawn=(_bin,args,options) => {
      if(args.includes('--list')) return {status:0,stdout:JSON.stringify(report(['a.spec.ts','b.spec.ts']))};
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME,JSON.stringify(report(actual)));
      return {status:0};
    };
    assert.throws(()=>runPlaywrightCi(['--shard=1/1'],{cwd,spawn}),/differs/);
    actual=['a.spec.ts','b.spec.ts'];
    assert.equal(runPlaywrightCi(['--shard=1/1'],{cwd,spawn}),0);
  } finally {rmSync(cwd,{recursive:true,force:true});}
});

test('refreshed weights count every attempt, keep unmeasured files that exist, and never record an empty file', () => {
  const attempt = (duration) => ({ duration });
  const report = { suites: [{ specs: [
    { file: 'a.spec.ts', tests: [{ results: [attempt(1500), attempt(500)] }, { results: [attempt(1000)] }] },
  ], suites: [{ specs: [{ file: 'b.spec.ts', tests: [] }] }] }] };
  const measured = measureReport(report);
  assert.deepEqual(measured.get('a.spec.ts'), { seconds: 3, tests: 2 });
  const history = { sourceRuns: [1, 2], files: { 'b.spec.ts': { seconds: 9, tests: 1 }, 'a.spec.ts': { seconds: 99, tests: 9 }, 'gone.spec.ts': { seconds: 5, tests: 1 } } };
  const merged = mergeDurations(history, measured, '7', (file) => file !== 'gone.spec.ts');
  assert.deepEqual(merged.files, { 'a.spec.ts': { seconds: 3, tests: 2 }, 'b.spec.ts': { seconds: 9, tests: 1 } });
  assert.deepEqual(merged.sourceRuns, [7, 1, 2]);
});

test('--only narrows the balanced files to the named ones and refuses a name discovery lacks', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-playwright-only-'));
  t.mock.method(console, 'log', () => {});
  try {
    const executed = [];
    const spawn = (_bin, args, options) => {
      if (args.includes('--list')) return { status: 0, stdout: JSON.stringify(report(['a.spec.ts', 'b/c.spec.ts', 'd.spec.ts'])) };
      const files = ['a.spec.ts', 'b/c.spec.ts', 'd.spec.ts'].filter((file) => args.some((arg) => arg.endsWith(`/${file.replaceAll('.', '\\.')}$`)));
      executed.push(...files);
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify(report(files)));
      return { status: 0 };
    };
    for (const shard of ['1/2', '2/2']) assert.equal(runPlaywrightCi([`--shard=${shard}`, '--only=a.spec.ts', '--only=b/c.spec.ts'], { cwd, spawn }), 0);
    assert.deepEqual(executed.sort(), ['a.spec.ts', 'b/c.spec.ts']);
    assert.throws(() => runPlaywrightCi(['--shard=1/1', '--only=gone.spec.ts'], { cwd, spawn }), /not discovered: gone\.spec\.ts/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('a red shard annotates each failing spec file once, for pr:land to read back', (t) => {
  const failedTest = { expectedStatus: 'passed', status: 'unexpected', results: [{ status: 'failed' }] };
  const red = { suites: [{ specs: [
    { file: 'b.spec.ts', tests: [failedTest] }, { file: 'b.spec.ts', tests: [failedTest] },
    { file: 'a.spec.ts', tests: [passed] }, { file: 'c/d.spec.ts', tests: [failedTest] },
  ] }] };
  assert.deepEqual(failingSpecFiles(red), ['b.spec.ts', 'c/d.spec.ts']);
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-playwright-annotate-'));
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  try {
    const spawn = (_bin, args, options) => {
      if (args.includes('--list')) return { status: 0, stdout: JSON.stringify(report(['a.spec.ts', 'b.spec.ts', 'c/d.spec.ts'])) };
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify(red));
      return { status: 1 };
    };
    assert.equal(runPlaywrightCi(['--shard=1/1'], { cwd, spawn, env: { GITHUB_ACTIONS: 'true' } }), 1);
    assert.deepEqual(lines.filter((line) => line.startsWith('::error')), [
      '::error file=tests/e2e/b.spec.ts,title=failing spec::tests/e2e/b.spec.ts',
      '::error file=tests/e2e/c/d.spec.ts,title=failing spec::tests/e2e/c/d.spec.ts',
    ]);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
