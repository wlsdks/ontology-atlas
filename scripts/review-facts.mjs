#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rules as securityRules } from './lib/check-rules/security.mjs';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.rs']);
const EXPORT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs']);
const TEST_ROOTS = ['src/', 'scripts/', 'mcp/src/', 'cli/src/'];
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];
const SECURITY_MATCHES = securityRules.find((rule) => rule.command.includes('security-surfaces')).matches;

export function parseArgs(argv) {
  const options = { base: 'origin/main', head: 'HEAD', json: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--json') options.json = true;
    else if (arg.startsWith('--base=')) options.base = arg.slice(7);
    else if (arg.startsWith('--head=')) options.head = arg.slice(7);
  }
  return options;
}

function gitRunner(cwd, env) {
  return (args, { allowFail = false } = {}) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    if (result.status !== 0) {
      if (allowFail) return null;
      throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr).trim()}`);
    }
    return result.stdout;
  };
}

function lineCount(text) {
  if (text == null || text === '') return 0;
  const lines = text.split('\n');
  return text.endsWith('\n') ? lines.length - 1 : lines.length;
}

export function exportedNames(text) {
  const names = new Set();
  if (!text) return names;
  const declaration = /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of text.matchAll(declaration)) names.add(match[1]);
  for (const match of text.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim().replace(/^type\s+/, '');
      if (!trimmed) continue;
      const alias = /\bas\s+([\w$]+)$/.exec(trimmed);
      names.add(alias ? alias[1] : trimmed);
    }
  }
  return names;
}

function depMap(text) {
  try {
    const json = JSON.parse(text);
    const out = new Map();
    for (const field of DEP_FIELDS) {
      for (const [name, version] of Object.entries(json[field] ?? {})) out.set(`${field}:${name}`, version);
    }
    return out;
  } catch {
    return new Map();
  }
}

export function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#');
}

function parseUnifiedDiff(text) {
  const byFile = new Map();
  let current = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = { added: [], removed: [] };
      const match = / b\/(.+)$/.exec(line);
      byFile.set(match ? match[1] : line, current);
    } else if (!current || line.startsWith('+++') || line.startsWith('---')) {
      continue;
    } else if (line.startsWith('+')) current.added.push(line.slice(1));
    else if (line.startsWith('-')) current.removed.push(line.slice(1));
  }
  return byFile;
}

function isTestFile(path) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function siblingTests(cwd, path) {
  const dir = dirname(path);
  const abs = resolve(cwd, dir);
  if (!existsSync(abs)) return [];
  const file = basename(path);
  const stem = file.slice(0, file.length - extname(file).length);
  const out = [];
  for (const entry of readdirSync(abs)) {
    if (!isTestFile(entry) || entry === file) continue;
    const candidate = posix.join(dir, entry);
    if (entry.startsWith(stem)) {
      out.push(candidate);
      continue;
    }
    let body = '';
    try { body = readFileSync(join(abs, entry), 'utf8'); } catch { continue; }
    const importRe = new RegExp(`from\\s+['"][^'"]*/${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.[a-z]+)?['"]`);
    if (importRe.test(body)) out.push(candidate);
  }
  return out;
}

export function collectFacts({ base = 'origin/main', head = 'HEAD', cwd = process.cwd(), env = process.env } = {}) {
  const git = gitRunner(cwd, env);
  const mergeBase = git(['merge-base', base, head]).trim();
  const statusLines = git(['diff', '--name-status', '-M', `${mergeBase}`, head]).split('\n').filter(Boolean);
  const numstat = new Map();
  for (const line of git(['diff', '--numstat', '-M', mergeBase, head]).split('\n').filter(Boolean)) {
    const [added, removed, ...rest] = line.split('\t');
    let path = rest.join('\t');
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
    if (brace) path = `${brace[1]}${brace[3]}${brace[4]}`.replace('//', '/');
    else if (path.includes(' => ')) path = path.split(' => ')[1];
    numstat.set(path, { added: Number(added) || 0, removed: Number(removed) || 0 });
  }
  const diffs = parseUnifiedDiff(git(['diff', '-M', '--unified=0', mergeBase, head]));
  const show = (rev, path) => (path ? git(['show', `${rev}:${path}`], { allowFail: true }) : null);

  const facts = { base, head, files: [], exports: [], dependencies: [], untested: [], comments: [], security: [] };
  const changed = new Set();

  for (const line of statusLines) {
    const [rawStatus, first, second] = line.split('\t');
    const status = rawStatus[0];
    const path = second ?? first;
    const oldPath = status === 'R' || status === 'C' ? first : status === 'A' ? null : first;
    changed.add(path);
    const before = show(mergeBase, oldPath);
    const after = status === 'D' ? null : show(head, path);
    const stat = numstat.get(path) ?? { added: 0, removed: 0 };
    const linesBefore = lineCount(before);
    const linesAfter = lineCount(after);
    const ext = extname(path);
    const marks = [];
    if (SOURCE_EXT.has(ext) && linesAfter > 800) marks.push('>800');
    if (linesAfter > linesBefore && before != null) marks.push('grew');
    facts.files.push({ path, status, added: stat.added, removed: stat.removed, linesBefore, linesAfter, marks });

    if (EXPORT_EXT.has(ext)) {
      const was = exportedNames(before);
      const now = exportedNames(after);
      const added = [...now].filter((name) => !was.has(name));
      const removed = [...was].filter((name) => !now.has(name));
      if (added.length || removed.length) facts.exports.push({ path, added, removed });
    }

    if (basename(path) === 'package.json') {
      const was = depMap(before ?? '{}');
      const now = depMap(after ?? '{}');
      for (const [key, version] of now) {
        const [field, name] = key.split(/:(.+)/);
        if (!was.has(key)) facts.dependencies.push({ path, kind: 'added', field, name, to: version });
        else if (was.get(key) !== version) facts.dependencies.push({ path, kind: 'changed', field, name, from: was.get(key), to: version });
      }
      for (const [key, version] of was) {
        const [field, name] = key.split(/:(.+)/);
        if (!now.has(key)) facts.dependencies.push({ path, kind: 'removed', field, name, from: version });
      }
    }

    const diff = diffs.get(path);
    if (/^\.github\/workflows\/.+\.ya?ml$/.test(path) && diff) {
      for (const added of diff.added) {
        const match = /^\s*-?\s*uses:\s*['"]?([^'"\s#]+)/.exec(added);
        if (!match || match[1].startsWith('./')) continue;
        const ref = match[1].split('@')[1] ?? '';
        if (!/^[0-9a-f]{40}$/.test(ref)) facts.dependencies.push({ path, kind: 'unpinned-action', name: match[1] });
      }
    }

    if (diff) {
      const removedComments = diff.removed.filter(isCommentLine).length;
      if (removedComments > 0) facts.comments.push({ path, removed: removedComments });
    }

    if (SECURITY_MATCHES.some((re) => re.test(path))) facts.security.push(path);
  }

  for (const file of facts.files) {
    if (file.status === 'D' || isTestFile(file.path)) continue;
    if (!TEST_ROOTS.some((root) => file.path.startsWith(root))) continue;
    if (!SOURCE_EXT.has(extname(file.path))) continue;
    const tests = siblingTests(cwd, file.path).filter((test) => !changed.has(test));
    if (tests.length) facts.untested.push({ path: file.path, tests });
  }
  return facts;
}

export function formatFacts(facts) {
  const out = [`review facts for ${facts.base}...${facts.head}`];
  const section = (title, lines) => {
    if (!lines.length) return;
    out.push('', `${title}:`, ...lines.map((line) => `  ${line}`));
  };
  section('files', facts.files.map((f) => {
    const marks = f.marks.length ? ` ${f.marks.join(' ')}` : '';
    return `${f.status} ${f.path} +${f.added}/-${f.removed} ${f.linesBefore}→${f.linesAfter}${marks}`;
  }));
  section('exports', facts.exports.map((e) => {
    const parts = [];
    if (e.added.length) parts.push(`+ ${e.added.join(', ')}`);
    if (e.removed.length) parts.push(`- ${e.removed.join(', ')}`);
    return `${e.path}: ${parts.join('; ')}`;
  }));
  section('dependencies', facts.dependencies.map((d) => {
    if (d.kind === 'unpinned-action') return `${d.path}: uses ${d.name} is not pinned to a 40-hex SHA`;
    if (d.kind === 'added') return `${d.path}: + ${d.field} ${d.name}@${d.to}`;
    if (d.kind === 'removed') return `${d.path}: - ${d.field} ${d.name}@${d.from}`;
    return `${d.path}: ~ ${d.field} ${d.name} ${d.from} -> ${d.to}`;
  }));
  section('untested', facts.untested.map((u) => `${u.path}: ${u.tests.join(', ')} not in the diff`));
  section('comments', facts.comments.map((c) => `${c.path}: ${c.removed} comment lines removed`));
  section('security', facts.security);
  const limit = 60;
  if (out.length > limit) {
    const hidden = out.length - (limit - 1);
    return [...out.slice(0, limit - 1), `... ${hidden} more lines; use --json for all`].join('\n');
  }
  return out.join('\n');
}

export function main({ argv = process.argv.slice(2), cwd = process.cwd(), env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const options = parseArgs(argv);
  try {
    const facts = collectFacts({ ...options, cwd, env });
    stdout.write(`${options.json ? JSON.stringify(facts, null, 2) : formatFacts(facts)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`[review-facts] ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
