#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync, closeSync } from 'node:fs';
import path from 'node:path';
import { isCalendarDate, readLedgerSource } from './lib/record-ledgers.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^v\d+\.\d+\.\d+(?:-rc\.\d+)?$/;

export function safeSlug(value) {
  const slug = value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!slug) throw new Error('slug must contain an ASCII letter or number');
  return slug;
}

export function createRecord({ kind, date, slug, body, category, id = randomUUID(), version, title, changes, root = process.cwd() }) {
  if (!['decision', 'change', 'release'].includes(kind)) throw new Error('kind must be decision, change, or release');
  if (!isCalendarDate(date)) throw new Error('date must be a real YYYY-MM-DD calendar date');
  let directory; let relativePath; let content;
  if (kind === 'release') {
    if (!VERSION.test(version ?? '')) throw new Error('release version must be vX.Y.Z or vX.Y.Z-rc.N');
    if (!title?.trim() || title.includes('\n') || Buffer.byteLength(title.trim()) > 200) throw new Error('release title must fit one 200-byte line');
    const ids = Array.isArray(changes) ? changes : String(changes ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    if (ids.length === 0 || ids.some((value) => !UUID.test(value))) throw new Error('release changes must be an explicit list of UUIDv4 values');
    if (new Set(ids).size !== ids.length) throw new Error('release changes must not repeat an id');
    const changelogPath = path.join(root, 'docs/CHANGELOG.md');
    if (existsSync(changelogPath)) {
      readLedgerSource('docs/CHANGELOG.md', { root });
      const legacy = readFileSync(changelogPath, 'utf8');
      if (new RegExp(`^## \\d{4}-\\d{2}-\\d{2} · ${version.replaceAll('.', '\\.')}[:]`, 'm').test(legacy)) throw new Error(`release version ${version} already exists in the frozen changelog`);
      const changesDir = path.join(root, 'docs/records/changes');
      const known = new Set(existsSync(changesDir) ? readdirSync(changesDir).filter((name) => name.endsWith('.md')).map((name) => /^id:\s*(\S+)/m.exec(readFileSync(path.join(changesDir, name), 'utf8'))?.[1]).filter(Boolean) : []);
      const unknown = ids.find((value) => !known.has(value));
      if (unknown) throw new Error(`release references unknown change id ${unknown}`);
      const releasesDir = path.join(root, 'docs/records/releases');
      if (existsSync(releasesDir)) {
        const assigned = new Set(readdirSync(releasesDir).filter((name) => name.endsWith('.md')).flatMap((name) => [...readFileSync(path.join(releasesDir, name), 'utf8').matchAll(/^-\s+([0-9a-f-]+)\s*$/gim)].map((match) => match[1])));
        const duplicate = ids.find((value) => assigned.has(value));
        if (duplicate) throw new Error(`change ${duplicate} is already assigned to a release`);
      }
    }
    directory = 'docs/records/releases';
    relativePath = `${directory}/${version}.md`;
    content = `---\nversion: ${version}\ndate: ${date}\ntitle: ${title.trim()}\n---\n${ids.map((value) => `- ${value}`).join('\n')}\n`;
  } else {
    if (!body?.trim()) throw new Error('body is required');
    if (!UUID.test(id)) throw new Error('id must be a UUIDv4');
    if (kind === 'change') {
      if (!['Added', 'Changed', 'Fixed', 'Removed'].includes(category)) throw new Error('change category is required');
      if (body.trim().includes('\n') || Buffer.byteLength(body.trim()) > 900) throw new Error('change body must fit one 900-byte line');
    } else {
      const heading = new RegExp(`^## ${date} [—–-]+ \\S.+$`, 'm');
      const labels = [...body.matchAll(/^\*\*([^*]+)\*\*/gm)].map((match) => match[1]);
      const normalized = body.trim();
      if (!heading.test(normalized) || !normalized.startsWith(`## ${date}`) || labels.join('|') !== 'Why|Prior|Decision|Dissent|Falsifier|Owner') throw new Error('decision body must use the matching dated heading and six-field template');
      if (normalized.split('\n').length > 24 || Buffer.byteLength(normalized.slice(normalized.indexOf('\n') + 1).trim()) > 2000) throw new Error('decision body exceeds the 24-line or 2000-byte record cap');
      for (const label of labels) if (!new RegExp(`^\\*\\*${label}\\*\\*[:：]\\s*\\S`, 'm').test(normalized)) throw new Error(`decision field ${label} is empty`);
    }
    directory = kind === 'decision' ? 'docs/records/decisions' : 'docs/records/changes';
    relativePath = `${directory}/${date}-${safeSlug(slug)}-${id}.md`;
    const meta = [`id: ${id}`, `date: ${date}`, ...(kind === 'change' ? [`category: ${category}`] : [])].join('\n');
    content = `---\n${meta}\n---\n${body.trim()}\n`;
  }
  mkdirSync(path.join(root, directory), { recursive: true });
  const fd = openSync(path.join(root, relativePath), 'wx');
  try { writeFileSync(fd, content, 'utf8'); } finally { closeSync(fd); }
  return { path: relativePath, id, content };
}

function args(argv) {
  const out = {};
  for (const arg of argv) {
    if (arg === '--') continue;
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`expected --name=value, received ${arg}`);
    out[match[1]] = match[2];
  }
  if (out.body && out.input) throw new Error('use either --body or --input');
  if (out.input) out.body = readFileSync(out.input, 'utf8');
  if (out.changes) out.changes = out.changes.split(',').map((value) => value.trim()).filter(Boolean);
  return out;
}

export const usage = () => `Usage:
  node scripts/new-record.mjs --kind=decision --date=YYYY-MM-DD --slug=<slug> (--body=<text>|--input=<file>)
  node scripts/new-record.mjs --kind=change --date=YYYY-MM-DD --slug=<slug> --category=<category> (--body=<text>|--input=<file>)
  node scripts/new-record.mjs --kind=release --date=YYYY-MM-DD --version=vX.Y.Z --title=<title> --changes=<uuid,uuid>`;

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    const argv = process.argv.slice(2);
    if (argv.includes('--help') || argv.includes('-h')) { console.log(usage()); process.exit(0); }
    const result = createRecord(args(argv));
    console.log(`${result.path}\n${result.id}`);
  } catch (error) {
    console.error(`[new-record] ${error.message}`);
    process.exitCode = 1;
  }
}
