#!/usr/bin/env node
// Creates a living document from its template.
//
//   pnpm doc:new -- --type=feature --area=library --slug=rounds [--title='Library rounds']
//
// It copies `docs/.templates/<type>.md`, fills the title, area and date, derives
// the path from the kind (`scripts/lib/doc-types.mjs`), creates the file
// exclusively and prints the path. It edits no index: the Library tree and
// `docs/README.md`'s folder table already cover a new document.
//
// Records are different: decisions, changes and releases are immutable UUID
// fragments written by `pnpm record:new`. These documents are living.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DOC_AREAS, DOC_TYPES, newDocPath } from './lib/doc-types.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`unknown argument: ${arg}`);
    args[match[1]] = match[2];
  }
  return args;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function yamlScalar(value) {
  return /^[\w .,()/'-]+$/.test(value) && !/^['"]/.test(value) ? value : JSON.stringify(value);
}

export function createDoc({ type, area, slug, title, date = today(), root = ROOT }) {
  const creatable = Object.keys(DOC_TYPES).filter((kind) => kind !== 'index');
  if (!creatable.includes(type)) throw new Error(`--type must be one of ${creatable.join(', ')}`);
  if (!DOC_AREAS.includes(area)) throw new Error(`--area must be one of ${DOC_AREAS.join(', ')}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) throw new Error('--slug must be lowercase-kebab ASCII');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('--date must be YYYY-MM-DD');
  const featuresDir = path.join(root, 'docs', 'features');
  const featureDirs = existsSync(featuresDir)
    ? readdirSync(featuresDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const relativePath = newDocPath(type, { slug, area, date, featureDirs });
  const docTitle = title?.trim() || slug.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  const template = readFileSync(path.join(root, 'docs', '.templates', `${type}.md`), 'utf8');
  const body = template
    .replace('title: {{title}}', `title: ${yamlScalar(docTitle)}`)
    .replaceAll('{{title}}', docTitle)
    .replaceAll('{{area}}', area)
    .replaceAll('{{date}}', date);
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  // `wx` refuses to overwrite, the same way `pnpm record:new` creates fragments.
  writeFileSync(absolute, body, { flag: 'wx' });
  return relativePath;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = parseArgs(process.argv.slice(2).filter((arg) => arg !== '--'));
    const created = createDoc(args);
    console.log(created);
    if (args.type === 'guide') {
      console.log('Register it in src/views/gateway-doc/model/guide-pages.ts, or set `gateway: false`.');
    }
  } catch (error) {
    console.error(`[doc:new] ${error.message}`);
    process.exit(1);
  }
}
