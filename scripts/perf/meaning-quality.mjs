#!/usr/bin/env node
// Measures where the Wiki question desk puts a question's answer in the one list it draws, on the
// labelled meaning-search fixture, words only and words plus meaning (search-by-meaning spec,
// acceptance criterion 1).
// Usage: pnpm perf:meaning-quality [-- --models=bge-m3,qwen3-embedding:0.6b] [--ollama=http://localhost:11434]
//        [--json=<file>] [--verbose] [--write-vault=<dir>] [--no-cache] [--no-query-prefix]
// The list comes from the desk's own `searchDesk` (`desk-search.ts`) under Node's type stripping,
// called as `LibraryQuestionDesk.tsx` calls it. The meaning side embeds passages and questions
// through Ollama's `/api/embed` on this computer and hands the nearest passages to it, as the app
// hands its own search's. Without Ollama only the words-only side runs.
// Passages come from the app's index itself (`vault-index-bench passages`), the only splitter.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE = join(ROOT, 'tests', 'fixtures', 'meaning-search');
const CACHE = join(tmpdir(), 'atlas-meaning-quality');

export const DEFAULT_OLLAMA = 'http://localhost:11434';
export const DEFAULT_MODELS = ['bge-m3', 'qwen3-embedding:0.6b'];
export const BATCH_PASSAGES = 32;
export const BATCH_BYTES = 64 * 1024;
/** Passages the desk asks search by meaning for: `VECTOR_SEARCH_LIMIT` in `use-vector-search.ts`. */
export const MEANING_LIMIT = 24;
/** Rows the desk shows before Show more: `FIRST_LEADS` in `DeskLeads.tsx`. */
export const FIRST_ROWS = 3;
/** A second cut, a screen's worth of rows once Show more is pressed. */
export const SCREEN_ROWS = 8;
/** Cited files a claim row offers a press for: `CITED_PRESSES` in `DeskLeadRow.tsx`. */
const CITED_PRESSES = 2;

/** Query wording each model's card asks for; documents are embedded as they are. */
const QUERY_PREFIX = {
  'qwen3-embedding': 'Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:',
  'snowflake-arctic-embed2': 'query: ',
  'nomic-embed-text-v2-moe': 'search_query: ',
};
const DOCUMENT_PREFIX = { 'nomic-embed-text-v2-moe': 'search_document: ' };
const family = (model) => model.split(':')[0];

const MANIFEST = join(ROOT, 'src-tauri', 'Cargo.toml');
const BENCH = join(ROOT, 'src-tauri', 'target', 'release', process.platform === 'win32' ? 'vault-index-bench.exe' : 'vault-index-bench');
let benchBuilt = false;

/** Every passage the app's index embeds for the Markdown files under `dir`: `{ path, start, end, heading, text }`. */
export async function* cratePassages(directory) {
  if (!benchBuilt) {
    execFileSync('cargo', ['build', '--release', '--quiet', '-p', 'vault-index', '--bin', 'vault-index-bench', '--features', 'index-dir-override', '--manifest-path', MANIFEST], { stdio: 'inherit' });
    benchBuilt = true;
  }
  const child = spawn(BENCH, ['passages', directory], { stdio: ['ignore', 'pipe', 'inherit'] });
  const closed = new Promise((done) => child.on('close', done));
  for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    if (line) yield JSON.parse(line);
  }
  const code = await closed;
  if (code !== 0) throw new Error(`vault-index-bench passages exited with ${code}`);
}

export async function ollamaVersion(base) {
  try {
    const response = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    return (await response.json()).version ?? 'unknown';
  } catch {
    return null;
  }
}

export async function ollamaModels(base) {
  const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  return new Set((body.models ?? []).flatMap((model) => [model.name, model.name.replace(/:latest$/, '')]));
}

/** One `/api/embed` request; every vector is checked finite, of one dimension, and L2-normalised. */
export async function embedBatch(base, model, inputs) {
  const response = await fetch(`${base}/api/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: inputs, truncate: true, keep_alive: '15m' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${model}: /api/embed answered ${response.status} ${await response.text()}`);
  const { embeddings } = await response.json();
  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) throw new Error(`${model}: expected ${inputs.length} vectors`);
  const dimension = embeddings[0]?.length;
  return embeddings.map((vector) => {
    if (vector.length !== dimension || !vector.every(Number.isFinite)) throw new Error(`${model}: malformed vector`);
    const norm = Math.hypot(...vector) || 1;
    return Float32Array.from(vector, (value) => value / norm);
  });
}

/** Batches of at most 32 passages and 64 KiB of text, one request in flight. */
export function batches(texts) {
  const out = [];
  let batch = [];
  let bytes = 0;
  for (const text of texts) {
    const size = Buffer.byteLength(text);
    if (batch.length && (batch.length >= BATCH_PASSAGES || bytes + size > BATCH_BYTES)) {
      out.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(text);
    bytes += size;
  }
  if (batch.length) out.push(batch);
  return out;
}

async function embedAll(base, model, texts, useCache) {
  const file = join(CACHE, `${model.replace(/[^a-z0-9.-]/gi, '_')}.json`);
  const cache = useCache && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const key = (text) => createHash('sha256').update(text).digest('hex');
  const missing = [...new Set(texts.filter((text) => !cache[key(text)]))];
  const started = performance.now();
  for (const batch of batches(missing)) {
    const vectors = await embedBatch(base, model, batch);
    batch.forEach((text, at) => { cache[key(text)] = Buffer.from(vectors[at].buffer).toString('base64'); });
  }
  const seconds = (performance.now() - started) / 1000;
  if (useCache) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(cache));
  }
  const decode = (text) => {
    const bytes = Buffer.from(cache[key(text)], 'base64');
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  };
  return { vectors: texts.map(decode), embedded: missing.length, seconds };
}

const dot = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
};

/** Lets Node import the app's TypeScript: `@/` aliases and extensionless relative imports. */
export async function importDesk() {
  const src = `${join(ROOT, 'src')}/`;
  const hooks = `
    import { existsSync, statSync } from 'node:fs';
    import { fileURLToPath, pathToFileURL } from 'node:url';
    const SRC = ${JSON.stringify(src)};
    const file = (path) => existsSync(path) && statSync(path).isFile();
    export async function resolve(specifier, context, next) {
      let target = null;
      if (specifier.startsWith('@/')) target = SRC + specifier.slice(2);
      else if (/^\\.\\.?\\//.test(specifier) && context.parentURL?.endsWith('.ts')) target = fileURLToPath(new URL(specifier, context.parentURL));
      if (target) for (const candidate of [target, target + '.ts', target + '/index.ts']) {
        if (file(candidate)) return next(pathToFileURL(candidate).href, context);
      }
      return next(specifier, context);
    }
    export async function load(url, context, next) {
      if (url.startsWith(${JSON.stringify(pathToFileURL(src).href)}) && url.endsWith('.ts')) return next(url, { ...context, format: 'module-typescript' });
      if (url.startsWith(${JSON.stringify(pathToFileURL(src).href)}) && url.endsWith('.json')) return next(url, { ...context, importAttributes: { type: 'json' } });
      return next(url, context);
    }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
  const desk = await import(pathToFileURL(join(ROOT, 'src/features/library/lib/questions/desk-search.ts')).href);
  const passage = await import(pathToFileURL(join(ROOT, 'src/shared/lib/library/source-units.ts')).href);
  const frontmatter = await import(pathToFileURL(join(ROOT, 'src/shared/lib/vault-document/parse-frontmatter.ts')).href);
  return { ...desk, ...passage, ...frontmatter };
}

/**
 * The desk's list for one question, from the same calls with the same arguments as
 * `LibraryQuestionDesk.tsx` `search()`: every planned source with units counts as read.
 * `meaningHits` is `null` when meaning takes no part. A row reaches the file it opens and, for a
 * claim, the cited files its presses open.
 */
export function deskRows(app, vault, question, meaningHits) {
  const plan = app.planDeskSourceReads(vault.sources);
  const sourceUnitsByPath = new Map(plan.flatMap((source) => {
    const units = vault.unitsByPath.get(source.path);
    return units?.length ? [[source.path, units]] : [];
  }));
  const { leads } = app.searchDesk({
    question, docs: vault.docs, claimsBySlug: vault.claimsBySlug,
    searchedSources: new Set(plan.map((source) => source.path)), sourceUnitsByPath, meaningHits,
  });
  return leads.map((lead) => ({
    files: lead.kind === 'claim'
      ? [`${lead.claim.pageSlug}.md`, ...lead.claim.citations.slice(0, CITED_PRESSES).map((citation) => citation.path)]
      : [lead.hit.path],
    reason: lead.reason,
    text: lead.kind === 'claim' ? lead.claim.text : lead.hit.text,
  }));
}

/**
 * The passages the app's search by meaning would return: the `limit` nearest by cosine, as
 * `{ path, lineStart, lineEnd, score }`, ties by path and line. The fixture holds only `wiki/` and
 * `sources/`, the folders the desk's prefixes name, so every passage is a candidate.
 */
export function nearestPassages(passages, vector, limit = MEANING_LIMIT) {
  return passages.map((passage) => ({ path: passage.path, lineStart: passage.start, lineEnd: passage.end, score: dot(passage.vector, vector) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.lineStart - b.lineStart)
    .slice(0, limit);
}

/** Where the gold files stand in the rows: all within the first 3, all within the first 8, and 1 / the first one's rank. */
export function placement(gold, rows) {
  const within = (count) => gold.every((file) => rows.slice(0, count).some((row) => row.files.includes(file)));
  const first = rows.findIndex((row) => row.files.some((file) => gold.includes(file)));
  return { first3: within(FIRST_ROWS) ? 1 : 0, first8: within(SCREEN_ROWS) ? 1 : 0, reciprocalRank: first < 0 ? 0 : 1 / (first + 1) };
}

async function readVaultFixture(app) {
  const { files } = JSON.parse(readFileSync(join(FIXTURE, 'vault.json'), 'utf8'));
  const docs = [];
  const claimsBySlug = new Map();
  const sources = [];
  const unitsByPath = new Map();
  for (const [path, raw] of Object.entries(files)) {
    if (path.startsWith('wiki/')) {
      const slug = path.replace(/\.md$/, '');
      const { frontmatter } = app.parseFrontmatter(raw);
      docs.push({ slug, title: String(frontmatter.title ?? slug), frontmatter });
      claimsBySlug.set(slug, app.deskPageClaims(raw));
    } else if (path.startsWith('sources/')) {
      const bytes = new TextEncoder().encode(raw);
      sources.push({ path, bytes: bytes.length, mtime: 0 });
      unitsByPath.set(path, app.sourceUnits(bytes, path).units);
    }
  }
  const directory = mkdtempSync(join(tmpdir(), 'atlas-meaning-quality-vault-'));
  const passages = [];
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), text);
    }
    for await (const passage of cratePassages(directory)) passages.push(passage);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  return { files, docs, claimsBySlug, sources, unitsByPath, passages };
}

/** 1 / the rank of the first gold file in the passages search by meaning returned; 0 when none is. */
const meaningReciprocalRank = (gold, hits) => {
  const at = hits.findIndex((hit) => gold.includes(hit.path));
  return at < 0 ? 0 : 1 / (at + 1);
};

export const SUBSETS = [
  ['overall', () => true],
  ['ko', (q) => q.set === 'ko'],
  ['en', (q) => q.set === 'en'],
  ['cross (paraphrase or language)', (q) => q.set === 'cross'],
  ['  cross-language only', (q) => q.kind === 'language'],
  ['  same-language paraphrase', (q) => q.kind === 'paraphrase'],
  ['exact-term', (q) => q.exactTerm],
];

const MEASURES = ['first3', 'first8', 'reciprocalRank'];

/** Per subset, the mean of each measure in percent. */
export function summarise(rows) {
  return Object.fromEntries(SUBSETS.map(([name, keep]) => {
    const picked = rows.filter((row) => keep(row.q));
    const mean = (measure) => (100 * picked.reduce((sum, row) => sum + row[measure], 0)) / (picked.length || 1);
    return [name, { n: picked.length, ...Object.fromEntries(MEASURES.map((measure) => [measure, mean(measure)])) }];
  }));
}

const fmt = (value) => value.toFixed(1).padStart(6);

function printTable(title, sides) {
  console.log(title);
  console.log(`${''.padEnd(35)}${sides.map(([label]) => `   ${label.padEnd(22)}`).join('')}`);
  console.log(`${'subset'.padEnd(31)}   n${sides.map(() => '   first 3 first 8    MRR').join('')}`);
  for (const [name] of SUBSETS) {
    const cells = sides.map(([, summary]) => `   ${fmt(summary[name].first3)}  ${fmt(summary[name].first8)} ${fmt(summary[name].reciprocalRank)}`);
    console.log(`${name.padEnd(31)} ${String(sides[0][1][name].n).padStart(3)}${cells.join('')}`);
  }
}

function parseArgs(argv) {
  const options = { models: DEFAULT_MODELS, ollama: DEFAULT_OLLAMA, json: null, verbose: false, writeVault: null, cache: true, queryPrefix: true };
  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg.startsWith('--models=')) options.models = arg.slice(9).split(',').filter(Boolean);
    else if (arg.startsWith('--ollama=')) options.ollama = arg.slice(9).replace(/\/$/, '');
    else if (arg.startsWith('--json=')) options.json = resolve(arg.slice(7));
    else if (arg.startsWith('--write-vault=')) options.writeVault = resolve(arg.slice(14));
    else if (arg === '--verbose') options.verbose = true;
    else if (arg === '--no-cache') options.cache = false;
    else if (arg === '--no-query-prefix') options.queryPrefix = false;
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = await importDesk();
  const vault = await readVaultFixture(app);
  const { questions } = JSON.parse(readFileSync(join(FIXTURE, 'questions.json'), 'utf8'));
  if (options.writeVault) {
    for (const [path, text] of Object.entries(vault.files)) {
      mkdirSync(dirname(join(options.writeVault, path)), { recursive: true });
      writeFileSync(join(options.writeVault, path), text);
    }
    console.log(`wrote ${Object.keys(vault.files).length} files to ${options.writeVault}`);
  }
  const wikiCount = vault.docs.length;
  console.log(`fixture: ${Object.keys(vault.files).length} files (${wikiCount} wiki pages, ${vault.sources.length} sources), ${vault.passages.length} passages, ${questions.length} questions`);
  console.log(`load average at start: ${loadavg().map((value) => value.toFixed(1)).join(' ')}`);

  const words = questions.map((q) => {
    const rows = deskRows(app, vault, q.question, null);
    return { q, rows, ...placement(q.gold, rows) };
  });
  const report = { load: loadavg(), fixture: { files: Object.keys(vault.files).length, passages: vault.passages.length }, words: summarise(words), models: {} };

  const version = await ollamaVersion(options.ollama);
  const available = version ? await ollamaModels(options.ollama) : new Set();
  if (!version) console.log(`Ollama is not reachable at ${options.ollama}; only the words-only side ran. Start Ollama to measure words plus meaning.`);
  else console.log(`Ollama ${version} at ${options.ollama}`);

  for (const model of version ? options.models : []) {
    if (!available.has(model)) {
      console.log(`${model}: not in Ollama; skipped (pull it with \`ollama pull ${model}\`).`);
      continue;
    }
    const documentPrefix = DOCUMENT_PREFIX[family(model)] ?? '';
    const queryPrefix = options.queryPrefix ? QUERY_PREFIX[family(model)] ?? '' : '';
    const passageRun = await embedAll(options.ollama, model, vault.passages.map((p) => documentPrefix + p.text), options.cache);
    const questionRun = await embedAll(options.ollama, model, questions.map((q) => queryPrefix + q.question.normalize('NFC')), options.cache);
    const passages = vault.passages.map((passage, at) => ({ ...passage, vector: passageRun.vectors[at] }));
    const both = questions.map((q, at) => {
      const hits = nearestPassages(passages, questionRun.vectors[at]);
      const rows = deskRows(app, vault, q.question, hits);
      return { q, rows, ...placement(q.gold, rows), meaningReciprocalRank: meaningReciprocalRank(q.gold, hits) };
    });
    const embedded = passageRun.embedded + questionRun.embedded;
    const seconds = passageRun.seconds + questionRun.seconds;
    const summary = summarise(both);
    const meaningMrr = summarise(both.map((row) => ({ q: row.q, first3: 0, first8: 0, reciprocalRank: row.meaningReciprocalRank })));
    report.models[model] = {
      wordsAndMeaning: summary,
      meaningMrr: Object.fromEntries(Object.entries(meaningMrr).map(([name, value]) => [name, value.reciprocalRank])),
      embedded,
      seconds,
      perQuestion: both.map((row, at) => ({
        id: row.q.id,
        words: { first3: words[at].first3, first8: words[at].first8, reciprocalRank: words[at].reciprocalRank },
        wordsAndMeaning: { first3: row.first3, first8: row.first8, reciprocalRank: row.reciprocalRank },
        rows: row.rows.slice(0, SCREEN_ROWS),
      })),
    };

    console.log('');
    printTable(`${model} (${embedded ? `${embedded} texts embedded in ${seconds.toFixed(1)} s` : 'all vectors from cache'}; load ${loadavg()[0].toFixed(1)})`,
      [['words', report.words], ['words + meaning', summary]]);
    console.log(`meaning list alone, MRR of the first gold passage among the ${MEANING_LIMIT} returned (×100): overall ${meaningMrr.overall.reciprocalRank.toFixed(1)} · cross ${meaningMrr['cross (paraphrase or language)'].reciprocalRank.toFixed(1)} · ko ${meaningMrr.ko.reciprocalRank.toFixed(1)} · en ${meaningMrr.en.reciprocalRank.toFixed(1)}`);
    if (options.verbose) {
      for (const row of both) {
        if (row.first3) continue;
        const rank = row.rows.findIndex((lead) => lead.files.some((file) => row.q.gold.includes(file))) + 1;
        console.log(`  ${row.q.id} first gold at ${rank || 'none'} of ${row.rows.length}  ${row.q.question}`);
        for (const lead of row.rows.slice(0, FIRST_ROWS)) console.log(`    ${lead.reason.padEnd(7)} ${lead.files[0]}  ${lead.text.slice(0, 90)}`);
      }
    }
  }

  if (!Object.keys(report.models).length) printTable('\nwords only', [['words', report.words]]);
  report.wordsPerQuestion = words.map((row) => ({ id: row.q.id, first3: row.first3, first8: row.first8, reciprocalRank: row.reciprocalRank, rows: row.rows.slice(0, SCREEN_ROWS) }));
  if (options.json) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nfirst 3 / first 8 = share of questions (%) with every gold file reached by the desk's first ${FIRST_ROWS} / ${SCREEN_ROWS} rows; MRR = mean of 1 / the rank of the first gold row (×100). Load at end: ${loadavg().map((value) => value.toFixed(1)).join(' ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
