import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createBacklogRecord, readBacklog, checkImmutableRecords, main, RECORD_DIR } from './backlog.mjs';

const fixture = (fn) => {
 const root = mkdtempSync(join(tmpdir(),'atlas-backlog-'));
 try { fn(root); } finally { rmSync(root,{recursive:true,force:true}); }
};
const add = (root, task, parents=[],status='ready') => createBacklogRecord({root,task,parents,status,worktree:'fixture',body:'Observed evidence.',date:'2026-09-13'});

test('different executions create unique files and preserve all evidence',()=>fixture((root)=>{
 const a=add(root,'A'); const b=add(root,'B');
 assert.notEqual(a.file,b.file);assert.equal(readdirSync(join(root,RECORD_DIR)).length,2);
 assert.deepEqual(readBacklog(root).tasks.map((t)=>[t.task,t.status]),[['A','ready'],['B','ready']]);
 const before=readFileSync(join(root,a.file),'utf8');add(root,'A',[a.id],'done(verified)');
 assert.equal(readFileSync(join(root,a.file),'utf8'),before);
 assert.equal(readBacklog(root).tasks[0].status,'done(verified)');
 assert.throws(()=>add(root,'A',[a.id]),/stale\/incomplete/);
}));

test('divergent worktrees merge records without a Git conflict and expose competing heads',()=>fixture((root)=>{
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 const baseRecord=add(root,'A');git('add','.');git('commit','-m','baseline');const base=git('rev-parse','HEAD');
 git('switch','-c','left');const left=add(root,'A',[baseRecord.id],'done(left-evidence)');git('add','.');git('commit','-m','left');
 git('switch','-c','right',base);const right=add(root,'A',[baseRecord.id],'blocked(right-evidence)');git('add','.');git('commit','-m','right');
 git('merge','--no-edit','left');
 const current=readBacklog(root).tasks[0];assert.equal(current.state,'needs_reconciliation');assert.equal(current.status,null);assert.equal(current.heads.length,2);
 assert.throws(()=>main(['--check'],root),/reconcile task heads/);
 assert.throws(()=>add(root,'A',[left.id]),/incomplete/);
 add(root,'A',[right.id,left.id],'hold(owner-reconciliation)');assert.equal(readBacklog(root).tasks[0].state,'current');
 checkImmutableRecords(root,'main');
 writeFileSync(join(root,baseRecord.file),readFileSync(join(root,baseRecord.file),'utf8')+'Edited history.\n');
 assert.throws(()=>checkImmutableRecords(root,'main'),/immutable/);
}));

test('rejects malformed records, foreign parents, cycles and duplicate identities',()=>fixture((root)=>{
 const a=add(root,'A');const b=add(root,'B');const original=readFileSync(join(root,a.file),'utf8');
 const mutate=(fn,pattern)=>{writeFileSync(join(root,a.file),fn(original));assert.throws(()=>readBacklog(root),pattern);writeFileSync(join(root,a.file),original);};
 mutate(s=>s.replace('parents: []',`parents: ["${b.id}"]`),/foreign-task/);
 mutate(s=>s.replace('parents: []',`parents: ["${a.id}"]`),/cyclic/);
 mutate(s=>s.replace('status: "ready"','status: "unknown"'),/status/);
 mutate(s=>s.replace('task: "A"','task: true'),/strings/);
 mutate(s=>s.replace('date: "2026-09-13"','date: "2026-02-30"'),/calendar/);
 mutate(s=>s.replace('parents: []','parents: []\nparents: []'),/duplicate/);
 const extra=join(root,RECORD_DIR,`2026-09-13-c-${a.id}.md`);writeFileSync(extra,original.replace('task: "A"','task: "C"'));assert.throws(()=>readBacklog(root),/duplicate record/);rmSync(extra);
 assert.throws(()=>createBacklogRecord({root,task:'C',status:'ready',worktree:'fixture',body:''}),/evidence/);
}));

test('CLI rejects ambiguous flags and empty inventories',()=>fixture((root)=>{
 for(const args of [['--task'],['--task='],['--base=main'],['--json=false'],['--append=false'],['--unknown'],['--json','--json']]) assert.throws(()=>main(args,root));
 assert.throws(()=>main(['--check'],root),/no backlog records/);
 add(root,'A');assert.throws(()=>main(['--task=missing'],root),/unknown task/);
 assert.throws(()=>main(['--check','--task=A'],root),/every task/);
}));

test('the initial import preserves every task status from the historical snapshot', () => {
  const snapshot = readFileSync('docs/BACKLOG-SNAPSHOT-2026-09-13.md', 'utf8');
  const expected = new Map();
  for (const line of snapshot.split('\n').filter((line) => line.startsWith('| '))) {
    const cells = line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    for (const index of [0, 1]) {
      if (/^[A-Z][A-Z0-9]*(?:\.[0-9]+)*$/.test(cells[index] ?? '') && /^(ready|in_progress|done|hold|blocked)(\(|$)/.test(cells[index + 1] ?? '')) {
        assert.equal(expected.has(cells[index]), false, 'ambiguous baseline task');
        expected.set(cells[index], cells[index + 1]);
        break;
      }
    }
  }
  assert.ok(expected.size > 0);
  const imported = readBacklog().records.filter((record) => record.worktree === 'baseline-import');
  assert.equal(imported.length, expected.size);
  for (const record of imported) assert.equal(record.status, expected.get(record.task));
});
