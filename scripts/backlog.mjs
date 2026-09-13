import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const RECORD_DIR = 'docs/records/backlog';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TASK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const STATUS = /^(ready|in_progress|blocked|hold|done|cancelled)(?:\([^\r\n|]+\))?$/;
const KEYS = ['id', 'date', 'task', 'status', 'parents', 'worktree'];
const fail = (message) => { throw new Error(`[backlog] ${message}`); };

export function parseRecord(raw, file) {
  const match = /^---\n([\s\S]+?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, '\n'));
  if (!match) fail(`${file}: expected metadata and evidence body`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const field = /^([a-z]+): (.+)$/.exec(line);
    if (!field || !KEYS.includes(field[1]) || Object.hasOwn(meta, field[1])) fail(`${file}: unknown or duplicate metadata field`);
    try { meta[field[1]] = JSON.parse(field[2]); } catch { fail(`${file}: metadata values must be JSON strings or arrays`); }
  }
  if (Object.keys(meta).length !== KEYS.length) fail(`${file}: missing metadata`);
  if (KEYS.filter((key) => key !== 'parents').some((key) => typeof meta[key] !== 'string')) fail(`${file}: scalar metadata must be strings`);
  if (!UUID.test(meta.id ?? '')) fail(`${file}: invalid UUIDv4`);
  if (!TASK.test(meta.task ?? '') || !STATUS.test(meta.status ?? '')) fail(`${file}: invalid task or status`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date ?? '') || Number.isNaN(Date.parse(`${meta.date}T00:00:00Z`)) || new Date(`${meta.date}T00:00:00Z`).toISOString().slice(0, 10) !== meta.date) fail(`${file}: invalid calendar date`);
  if (!Array.isArray(meta.parents) || meta.parents.some((id) => typeof id !== 'string' || !UUID.test(id)) || new Set(meta.parents).size !== meta.parents.length) fail(`${file}: parents must be unique UUIDv4 values`);
  if (typeof meta.worktree !== 'string' || !meta.worktree.trim() || meta.worktree.length > 240 || /[\r\n]/.test(meta.worktree)) fail(`${file}: worktree must identify this execution in one line`);
  if (!match[2].trim()) fail(`${file}: evidence or reason is required`);
  const slug = meta.task.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (basename(file) !== `${meta.date}-${slug}-${meta.id}.md`) fail(`${file}: filename must match its date, task and UUID`);
  return { ...meta, body: match[2].trim(), file };
}

export function readBacklog(root = process.cwd()) {
  const dir = join(root, RECORD_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.md')).sort() : [];
  const records = files.map((file) => parseRecord(readFileSync(join(dir, file), 'utf8'), `${RECORD_DIR}/${file}`));
  const byId = new Map();
  for (const record of records) {
    if (byId.has(record.id)) fail(`duplicate record ${record.id}`);
    byId.set(record.id, record);
  }
  const visiting = new Set(); const visited = new Set(); const superseded = new Set();
  const visit = (record) => {
    if (visiting.has(record.id)) fail(`${record.file}: cyclic history`);
    if (visited.has(record.id)) return;
    visiting.add(record.id);
    for (const id of record.parents) {
      const parent = byId.get(id);
      if (!parent || parent.task !== record.task) fail(`${record.file}: missing or foreign-task parent ${id}`);
      if (parent.date > record.date) fail(`${record.file}: date predates parent ${id}`);
      visit(parent); superseded.add(id);
    }
    visiting.delete(record.id); visited.add(record.id);
  };
  records.forEach(visit);
  const taskNames = [...new Set(records.map((record) => record.task))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const tasks = taskNames.map((task) => {
    const heads = records.filter((record) => record.task === task && !superseded.has(record.id));
    return { task, state: heads.length === 1 ? 'current' : 'needs_reconciliation', status: heads.length === 1 ? heads[0].status : null, heads };
  });
  return { records, tasks };
}

export function createBacklogRecord({ task, status, parents = [], worktree, body, date = new Date().toISOString().slice(0, 10), id = randomUUID(), root = process.cwd() }) {
  const snapshot = readBacklog(root);
  if (snapshot.records.some((record) => record.id === id)) fail(`duplicate record ${id}`);
  const current = snapshot.tasks.find((item) => item.task === task);
  const expected = (current?.heads ?? []).map((head) => head.id).sort();
  if (JSON.stringify([...parents].sort()) !== JSON.stringify(expected)) fail(`stale/incomplete parents for ${task}; read the task and explicitly reference every current head: ${expected.join(',') || '(none)'}`);
  const slug = String(task).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const file = `${RECORD_DIR}/${date}-${slug}-${id}.md`;
  const meta = { id, date, task, status, parents, worktree };
  const content = `---\n${KEYS.map((key) => `${key}: ${JSON.stringify(meta[key])}`).join('\n')}\n---\n${String(body ?? '').trim()}\n`;
  parseRecord(content, file);
  mkdirSync(join(root, RECORD_DIR), { recursive: true });
  const fd = openSync(join(root, file), 'wx');
  try { writeFileSync(fd, content, 'utf8'); } finally { closeSync(fd); }
  return { file, id };
}

export function renderBacklog(result) {
  const rows = result.tasks.map((item) => `| ${item.task} | ${item.status ?? 'needs_reconciliation'} | ${item.heads.map((head) => `[${head.id}](${head.file})`).join(', ')} |`);
  return `# Current backlog\n\n| Task | Status | Current records |\n|---|---|---|\n${rows.join('\n')}\n`;
}

export function checkImmutableRecords(root = process.cwd(), base = 'origin/main') {
  // A branch may revise its own unmerged records. Published records may only be
  // superseded by new files. The branch-base diff also catches remote rewrites.
  const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const entries = execFileSync('git', ['diff', '--name-status', '--no-renames', mergeBase, '--', RECORD_DIR], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const changed = entries.filter((line) => !line.startsWith('A\t'));
  if (changed.length) fail(`published records are immutable; append a new record instead:\n${changed.join('\n')}`);
}

export function main(argv, root = process.cwd()) {
  const args = {};
  for (const arg of argv.filter((value) => value !== '--')) {
    if (arg === '--help') { console.log('pnpm backlog [--json] [--task=ID] [--check] [--base=REF]\npnpm backlog --append --task=ID --status=STATUS --parents=UUID,UUID --worktree=LABEL --input=FILE'); return 0; }
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (!match || !['json','task','check','base','append','status','parents','worktree','input'].includes(match[1]) || Object.hasOwn(args,match[1])) fail(`unknown or repeated argument: ${arg}`);
    const flag = ['json', 'check', 'append'].includes(match[1]);
    if ((flag && match[2] !== undefined) || (!flag && (match[2] === undefined || (match[2] === '' && match[1] !== 'parents')))) fail(`invalid argument form: ${arg}`);
    args[match[1]] = match[2] ?? true;
  }
  if (args.base && !args.check) fail('base requires --check');
  if (args.append) {
    if (!args.input || !args.task || !args.status || !args.worktree || args.check || args.base) fail('append requires task, status, worktree and input');
    const record = createBacklogRecord({ root, task:args.task, status:args.status, worktree:args.worktree, parents:args.parents ? String(args.parents).split(',').filter(Boolean) : [], body:readFileSync(resolve(String(args.input)), 'utf8') });
    console.log(JSON.stringify(record)); return 0;
  }
  if (args.status || args.parents || args.worktree || args.input) fail('write fields require --append');
  const result = readBacklog(root);
  if (!result.records.length) fail('no backlog records found');
  if (args.check) {
    if (args.task) fail('check must cover every task');
    const conflicts = result.tasks.filter((task) => task.state !== 'current');
    if (conflicts.length) fail(`reconcile task heads before landing: ${conflicts.map((task) => task.task).join(', ')}`);
    checkImmutableRecords(root, args.base ?? 'origin/main');
    if (!args.json) { console.log(`[backlog] ${result.records.length} records; ${result.tasks.length} tasks; no unresolved heads or rewritten published records`); return 0; }
  }
  if (args.task) {
    const task = result.tasks.find((item) => item.task === args.task);
    if (!task) fail(`unknown task ${args.task}`);
    console.log(JSON.stringify(task, null, 2));
  } else console.log(args.json ? JSON.stringify(result, null, 2) : renderBacklog(result));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
