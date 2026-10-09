#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FAMILIES = Object.freeze([
  '--text-',
  '--leading-',
  '--radius-',
  '--shadow-',
  '--elevation-',
  '--motion-',
  '--color-',
  '--control-h-',
  '--topology-',
]);

export const OTHER_FAMILY = 'other';

const IMPORT_LINE = /^@import "\.\/(styles\/[^"]+\.css)";/gm;
const DECLARATION = /--[A-Za-z0-9_-]+(?=\s*:)/y;
const QUIET_CONTEXT = /^(?::root|@theme\b.*|@layer\b.*)$/;

export function familyOf(name) {
  return FAMILIES.find((prefix) => name.startsWith(prefix)) ?? OTHER_FAMILY;
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function lineIndex(css) {
  const starts = [0];
  for (let i = 0; i < css.length; i += 1) if (css[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}

function skipTrivia(css, from) {
  let i = from;
  for (;;) {
    while (i < css.length && /\s/.test(css[i])) i += 1;
    if (!css.startsWith('/*', i)) return i;
    const close = css.indexOf('*/', i + 2);
    i = close === -1 ? css.length : close + 2;
  }
}

function skipString(css, from) {
  const quote = css[from];
  let i = from + 1;
  while (i < css.length && css[i] !== quote) i += css[i] === '\\' ? 2 : 1;
  return i + 1;
}

function readUntil(css, from, stops) {
  let i = from;
  let depth = 0;
  let text = '';
  while (i < css.length) {
    const ch = css[i];
    if (css.startsWith('/*', i)) {
      const close = css.indexOf('*/', i + 2);
      i = close === -1 ? css.length : close + 2;
      text += ' ';
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i);
      text += css.slice(i, end);
      i = end;
      continue;
    }
    if (depth === 0 && stops.includes(ch)) return { text, end: i, stop: ch };
    if (ch === '(' || ch === '[') depth += 1;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    text += ch;
    i += 1;
  }
  return { text, end: i, stop: null };
}

export function parseCustomProperties(css, file) {
  const lineAt = lineIndex(css);
  const out = [];
  const stack = [];
  let i = 0;
  while (i < css.length) {
    i = skipTrivia(css, i);
    if (i >= css.length) break;
    const ch = css[i];
    if (ch === '}') {
      stack.pop();
      i += 1;
      continue;
    }
    if (ch === ';') {
      i += 1;
      continue;
    }
    DECLARATION.lastIndex = i;
    const declared = DECLARATION.exec(css);
    if (declared) {
      const name = declared[0];
      const colon = css.indexOf(':', i + name.length);
      const value = readUntil(css, colon + 1, [';', '}']);
      out.push({
        name,
        value: collapse(value.text),
        file,
        line: lineAt(i),
        family: familyOf(name),
        context: stack.filter((entry) => !QUIET_CONTEXT.test(entry)).join(' > '),
      });
      i = value.end;
      continue;
    }
    const prelude = readUntil(css, i, ['{', ';', '}']);
    if (prelude.stop === '{') stack.push(collapse(prelude.text));
    i = prelude.stop === '}' ? prelude.end : prelude.end + 1;
  }
  return out;
}

export function listStyleFiles(root) {
  const entry = readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  const imported = [...entry.matchAll(IMPORT_LINE)].map((match) => `app/${match[1]}`);
  const present = readdirSync(path.join(root, 'app/styles'))
    .filter((name) => name.endsWith('.css'))
    .sort()
    .map((name) => `app/styles/${name}`);
  return [...imported, ...present.filter((file) => !imported.includes(file))];
}

export function collectTokens(root = process.cwd()) {
  return listStyleFiles(root).flatMap((file) =>
    parseCustomProperties(readFileSync(path.join(root, file), 'utf8'), file),
  );
}

export function normalizePrefix(prefix) {
  if (!prefix) return '';
  return prefix.startsWith('--') ? prefix : `--${prefix}`;
}

export function filterTokens(tokens, prefix) {
  const wanted = normalizePrefix(prefix);
  return wanted ? tokens.filter((token) => token.name.startsWith(wanted)) : tokens;
}

export function groupTokens(tokens) {
  const order = [...FAMILIES, OTHER_FAMILY];
  const groups = new Map(order.map((family) => [family, []]));
  for (const token of tokens) groups.get(token.family).push(token);
  return [...groups].filter(([, members]) => members.length > 0);
}

export function formatLine(token) {
  const where = `${token.file}:${token.line}`;
  const scope = token.context ? `  [${token.context}]` : '';
  return `${token.name}: ${token.value}  ${where}${scope}`;
}

export function formatText(tokens) {
  return groupTokens(tokens)
    .map(([family, members]) => [`${family} (${members.length})`, ...members.map(formatLine)].join('\n'))
    .join('\n\n');
}

export function parseArgs(argv) {
  const args = { prefix: '', json: false, help: false, unknown: [] };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--prefix=')) args.prefix = arg.slice('--prefix='.length);
    else args.unknown.push(arg);
  }
  return args;
}

export const USAGE = 'usage: pnpm design:tokens -- [--prefix=<name>] [--json]';

export function run(argv, io = { log: console.log, error: console.error }, root = process.cwd()) {
  const args = parseArgs(argv);
  if (args.help) {
    io.log(USAGE);
    return 0;
  }
  if (args.unknown.length > 0) {
    io.error(`[design-tokens] unknown argument ${args.unknown.join(' ')}\n${USAGE}`);
    return 2;
  }
  const tokens = filterTokens(collectTokens(root), args.prefix);
  if (tokens.length === 0) {
    io.error(`[design-tokens] no custom property starts with ${normalizePrefix(args.prefix) || 'anything'}`);
    return 1;
  }
  io.log(args.json ? JSON.stringify(tokens, null, 2) : formatText(tokens));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = run(process.argv.slice(2));
}
