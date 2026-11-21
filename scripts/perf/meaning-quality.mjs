#!/usr/bin/env node
// Measures the Wiki question desk's recall on the labelled meaning-search fixture, word only and
// word plus meaning (search-by-meaning spec, acceptance criterion 1).
// Usage: pnpm perf:meaning-quality [-- --models=bge-m3,qwen3-embedding:0.6b] [--ollama=http://localhost:11434]
//        [--json=<file>] [--verbose] [--write-vault=<dir>] [--no-cache] [--no-query-prefix]
// The word side runs the desk's own ranking (`question-desk.ts`, `source-passage.ts`) under Node's type
// stripping, as `LibraryQuestionDesk.tsx` calls it. The meaning side embeds passages and questions
// through Ollama's `/api/embed` on this computer and fuses both rankings by reciprocal rank (k = 60)
// into the desk's 8 claims and 8 source passages. Without Ollama only the word side runs.
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
const RRF_K = 60;
const TOP = 8;

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
async function importDesk() {
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
      return next(url, context);
    }`;
  register(`data:text/javascript,${encodeURIComponent(hooks)}`);
  const desk = await import(pathToFileURL(join(ROOT, 'src/features/library/lib/questions/question-desk.ts')).href);
  const passage = await import(pathToFileURL(join(ROOT, 'src/shared/lib/library/source-passage.ts')).href);
  const frontmatter = await import(pathToFileURL(join(ROOT, 'src/shared/lib/vault-document/parse-frontmatter.ts')).href);
  return { ...desk, ...passage, ...frontmatter };
}

/** The same calls, in the same order, as `LibraryQuestionDesk.tsx` `search()`. */
function wordSearch(app, vault, question) {
  const wiki = app.findDeskClaims(question, vault.docs, vault.rawBySlug);
  const terms = app.questionTerms(question);
  const hits = [];
  for (const source of app.planDeskSourceReads(vault.sources)) {
    hits.push(...app.findDeskSourceHits(source.path, vault.unitsByPath.get(source.path), terms).hits);
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const claims = wiki.claims.map((claim) => {
    const path = `${claim.pageSlug}.md`;
    const line = vault.files[path].split(/\r?\n/).findIndex((text) => /^[-*] /.test(text.trim()) && text.trim().slice(2).trim() === claim.text) + 1;
    return { id: path, line };
  });
  return { claims, sources: hits.slice(0, TOP).map((hit) => ({ id: hit.path, line: Number(hit.anchor.slice(1)) })) };
}

async function loadVault(app) {
  const { files } = JSON.parse(readFileSync(join(FIXTURE, 'vault.json'), 'utf8'));
  const docs = [];
  const rawBySlug = new Map();
  const sources = [];
  const unitsByPath = new Map();
  for (const [path, raw] of Object.entries(files)) {
    if (path.startsWith('wiki/')) {
      const slug = path.replace(/\.md$/, '');
      const { frontmatter } = app.parseFrontmatter(raw);
      docs.push({ slug, title: String(frontmatter.title ?? slug), frontmatter });
      rawBySlug.set(slug, raw);
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
  return { files, docs, rawBySlug, sources, unitsByPath, passages };
}

/**
 * Reciprocal-rank fusion of the desk's word list with the meaning list into 8 leads. A meaning
 * passage that holds a word lead's line counts as the same lead ("both"); ties keep the better
 * single rank, then the word lead.
 */
export function fuse(wordItems, meaningItems) {
  const fused = wordItems.map((item, at) => ({ ...item, score: 1 / (RRF_K + at + 1), best: at + 1, word: true, meaning: false }));
  meaningItems.forEach((item, at) => {
    const score = 1 / (RRF_K + at + 1);
    const same = fused.find((lead) => lead.word && !lead.meaning && lead.id === item.id && lead.line >= item.start && lead.line <= item.end);
    if (same) {
      same.score += score;
      same.meaning = true;
      same.best = Math.min(same.best, at + 1);
    } else {
      fused.push({ id: item.id, line: item.start, score, best: at + 1, word: false, meaning: true });
    }
  });
  return fused.sort((a, b) => b.score - a.score || a.best - b.best || Number(b.word) - Number(a.word)).slice(0, TOP);
}

const recallOf = (gold, leads) => {
  const found = new Set(leads.map((lead) => lead.id));
  return gold.filter((id) => found.has(id)).length / gold.length;
};

/** 1 / the rank of the first gold file in the meaning lists merged by similarity; 0 past 16. */
const reciprocalRank = (gold, leads) => {
  const at = [...leads].sort((a, b) => b.similarity - a.similarity).findIndex((lead) => gold.includes(lead.id));
  return at < 0 ? 0 : 1 / (at + 1);
};

const SUBSETS = [
  ['overall', () => true],
  ['ko', (q) => q.set === 'ko'],
  ['en', (q) => q.set === 'en'],
  ['cross (paraphrase or language)', (q) => q.set === 'cross'],
  ['  cross-language only', (q) => q.kind === 'language'],
  ['  same-language paraphrase', (q) => q.kind === 'paraphrase'],
  ['exact-term', (q) => q.exactTerm],
];

function summarise(rows, field) {
  return Object.fromEntries(SUBSETS.map(([name, keep]) => {
    const picked = rows.filter((row) => keep(row.q));
    return [name, { n: picked.length, percent: (100 * picked.reduce((sum, row) => sum + row[field], 0)) / picked.length }];
  }));
}

const fmt = (value) => value.toFixed(1).padStart(6);
const signed = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`.padStart(6);

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
  const vault = await loadVault(app);
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

  const word = questions.map((q) => {
    const found = wordSearch(app, vault, q.question);
    return { q, found, word: recallOf(q.gold, [...found.claims, ...found.sources]) };
  });
  const report = { load: loadavg(), fixture: { files: Object.keys(vault.files).length, passages: vault.passages.length }, word: summarise(word, 'word'), models: {} };

  const version = await ollamaVersion(options.ollama);
  const available = version ? await ollamaModels(options.ollama) : new Set();
  if (!version) console.log(`Ollama is not reachable at ${options.ollama}; only the word-only side ran. Start Ollama to measure word plus meaning.`);
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
    const wikiPassages = [];
    const sourcePassages = [];
    vault.passages.forEach((passage, at) => {
      const entry = { id: passage.path, start: passage.start, end: passage.end, vector: passageRun.vectors[at] };
      if (passage.path.startsWith('wiki/') && vault.rawBySlug.has(passage.path.replace(/\.md$/, ''))) wikiPassages.push(entry);
      else if (passage.path.startsWith('sources/')) sourcePassages.push(entry);
    });
    const rank = (list, vector) => list.map((entry) => ({ ...entry, similarity: dot(entry.vector, vector) }))
      .sort((a, b) => b.similarity - a.similarity).slice(0, TOP);
    const rows = word.map((row, at) => {
      const vector = questionRun.vectors[at];
      const meaningWiki = rank(wikiPassages, vector);
      const meaningSources = rank(sourcePassages, vector);
      const leads = [...fuse(row.found.claims, meaningWiki), ...fuse(row.found.sources, meaningSources)];
      return {
        ...row,
        hybrid: recallOf(row.q.gold, leads),
        meaningOnly: recallOf(row.q.gold, [...meaningWiki, ...meaningSources]),
        reciprocalRank: reciprocalRank(row.q.gold, [...meaningWiki, ...meaningSources]),
      };
    });
    const embedded = passageRun.embedded + questionRun.embedded;
    const seconds = passageRun.seconds + questionRun.seconds;
    report.models[model] = {
      hybrid: summarise(rows, 'hybrid'),
      meaningOnly: summarise(rows, 'meaningOnly'),
      meaningMrr: summarise(rows, 'reciprocalRank'),
      embedded,
      seconds,
      perQuestion: rows.map((row) => ({ id: row.q.id, word: row.word, hybrid: row.hybrid, meaningOnly: row.meaningOnly, reciprocalRank: row.reciprocalRank })),
    };

    console.log(`\n${model} (${embedded ? `${embedded} texts embedded in ${seconds.toFixed(1)} s` : 'all vectors from cache'}; load ${loadavg()[0].toFixed(1)})`);
    console.log('subset                            n   word  hybrid      Δ  meaning');
    const hybrid = report.models[model].hybrid;
    const meaning = report.models[model].meaningOnly;
    for (const [name] of SUBSETS) {
      const w = report.word[name].percent;
      const h = hybrid[name].percent;
      console.log(`${name.padEnd(31)} ${String(report.word[name].n).padStart(3)} ${fmt(w)}  ${fmt(h)} ${signed(h - w)}   ${fmt(meaning[name].percent)}`);
    }
    const mrr = report.models[model].meaningMrr;
    console.log(`meaning-only MRR (×100): overall ${mrr.overall.percent.toFixed(1)} · cross ${mrr['cross (paraphrase or language)'].percent.toFixed(1)} · ko ${mrr.ko.percent.toFixed(1)} · en ${mrr.en.percent.toFixed(1)}`);
    const gain = (name) => hybrid[name].percent - report.word[name].percent;
    const verdict = {
      overall: gain('overall') >= 15,
      cross: gain('cross (paraphrase or language)') >= 30,
      exactTerm: gain('exact-term') >= -2,
    };
    report.models[model].ac1 = verdict;
    console.log(`AC1 bar (fixture part): overall +15 ${verdict.overall ? 'met' : 'missed'} · cross +30 ${verdict.cross ? 'met' : 'missed'} · exact-term at most -2 ${verdict.exactTerm ? 'met' : 'missed'}`);
    if (options.verbose) {
      for (const row of rows) if (row.word !== row.hybrid) console.log(`  ${row.q.id} word ${row.word.toFixed(2)} → hybrid ${row.hybrid.toFixed(2)}  ${row.q.question}`);
    }
  }

  if (!Object.keys(report.models).length) {
    console.log('\nword only (recall@8, %)');
    for (const [name] of SUBSETS) console.log(`${name.padEnd(31)} ${String(report.word[name].n).padStart(3)} ${fmt(report.word[name].percent)}`);
  }
  report.wordPerQuestion = word.map((row) => ({ id: row.q.id, word: row.word, claims: row.found.claims, sources: row.found.sources }));
  if (options.json) writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nrecall@8 = share of a question's gold files among the desk's 8 claims and 8 source passages. Load at end: ${loadavg().map((value) => value.toFixed(1)).join(' ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
