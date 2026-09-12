import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventoryFiles, balanceFiles, runPlaywrightCi } from './run-playwright-ci.mjs';

const report = (names) => ({ suites: [{ specs: names.map((file) => ({ file, tests: [{}] })) }] });
test('discovery rejects errors, empty subjects and unsupported paths', () => {
  assert.throws(() => inventoryFiles({ suites: [] }), /zero/);
  assert.throws(() => inventoryFiles({ errors: ['broken import'] }), /errors/);
  assert.throws(() => inventoryFiles(report(['../escape.spec.ts'])), /unsupported/);
  assert.deepEqual(inventoryFiles(report(['a.spec.ts', 'a.spec.ts'])), [{file:'a.spec.ts',tests:2}]);
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
  const history = JSON.parse(readFileSync(new URL('./data/playwright-file-durations.json',import.meta.url)));
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
    assert.equal(runPlaywrightCi(['--shard=1/1','--exclude=web-surface-smoke.spec.ts'],{cwd,spawn}),7);
    assert.ok(calls[1].includes('/a\\.spec\\.ts$'));
    assert.ok(!calls[1].some((arg)=>arg.includes('web-surface')));
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
