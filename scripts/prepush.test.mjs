import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

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
