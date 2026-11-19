#!/usr/bin/env node
// Measures how fast Ollama on this computer prepares generated vaults for search by meaning, and
// how much memory it holds while doing so (search-by-meaning spec, acceptance criterion 4).
// Usage: pnpm perf:meaning [-- --files=10000 --files=50000 --shape=key --shape=all
//        --models=bge-m3,qwen3-embedding:0.6b --sample=1024 --queries=50 --num-ctx=2048 --keep]
// Vaults come from `gen-scale-vault.mjs`, the shapes `perf:vault-index` uses. Every file is split
// into passages with the desk harness's splitter; a fixed sample of passages is embedded in
// batches of at most 32 passages and 64 KiB, one request in flight, and the full preparation time
// is extrapolated from characters per second. Ollama's runner for the model is found by its model
// file and sampled every second for physical footprint (`vmmap --summary`) and resident size.
// The machine may be shared: every figure carries the load average it was taken at.
// Without Ollama only the passage counts are printed. Vaults live under the OS temp folder and are
// deleted unless --keep.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { cpus, loadavg, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { generateScaleVault } from './gen-scale-vault.mjs';
import { batches, DEFAULT_MODELS, DEFAULT_OLLAMA, ollamaModels, ollamaVersion, splitPassages } from './meaning-quality.mjs';

const run = promisify(execFile);
const WORK = join(tmpdir(), 'atlas-perf-meaning');
const MB = 1024 * 1024;
const PREP_LIMIT_MINUTES = 60;

function parseArgs(argv) {
  const options = { files: [], shapes: [], models: DEFAULT_MODELS, sample: 1024, queries: 50, numCtx: null, ollama: DEFAULT_OLLAMA, keep: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg.startsWith('--files=')) options.files.push(Number(arg.slice(8)));
    else if (arg.startsWith('--shape=')) options.shapes.push(arg.slice(8));
    else if (arg.startsWith('--models=')) options.models = arg.slice(9).split(',').filter(Boolean);
    else if (arg.startsWith('--sample=')) options.sample = Number(arg.slice(9));
    else if (arg.startsWith('--queries=')) options.queries = Number(arg.slice(10));
    else if (arg.startsWith('--num-ctx=')) options.numCtx = Number(arg.slice(10));
    else if (arg.startsWith('--ollama=')) options.ollama = arg.slice(9).replace(/\/$/, '');
    else if (arg === '--keep') options.keep = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!options.files.length) options.files = [10000, 50000];
  if (!options.shapes.length) options.shapes = ['key'];
  for (const value of [...options.files, options.sample, options.queries]) {
    if (!Number.isInteger(value) || value <= 0) throw new Error('--files, --sample and --queries take positive integers');
  }
  if (options.shapes.some((shape) => !['all', 'key'].includes(shape))) throw new Error('--shape is all or key');
  return options;
}

const load = () => loadavg()[0].toFixed(1);

function markdownFiles(dir) {
  const out = [];
  const visit = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.md')) out.push(path);
    }
  };
  visit(dir);
  return out.sort();
}

/** Passage and character counts for one vault, plus a seeded reservoir sample of passage texts. */
function survey(files, shape, sampleSize) {
  const dir = join(WORK, `${shape}-${files}`);
  if (!existsSync(join(dir, 'atlas.md'))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    generateScaleVault(dir, files, shape);
  }
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const sample = [];
  let passages = 0;
  let chars = 0;
  let bytes = 0;
  for (const path of markdownFiles(dir)) {
    const raw = readFileSync(path, 'utf8');
    bytes += Buffer.byteLength(raw);
    for (const passage of splitPassages(path.slice(dir.length + 1), raw)) {
      passages += 1;
      chars += passage.text.length;
      if (sample.length < sampleSize) sample.push(passage.text);
      else {
        const at = Math.floor(rnd() * passages);
        if (at < sampleSize) sample[at] = passage.text;
      }
    }
  }
  return { files, shape, dir, passages, chars, bytes, sample };
}

async function post(base, path, body, timeout = 120_000) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`${path} answered ${response.status} ${await response.text()}`);
  return response.json();
}

/** The runner process that holds this model's weights, found by the model file it was started with. */
async function runnerPids(base, model) {
  const shown = await post(base, '/api/show', { model });
  const blob = /^FROM (\S+)/m.exec(shown.modelfile ?? '')?.[1];
  if (!blob) return [];
  try {
    const { stdout } = await run('pgrep', ['-f', blob]);
    return stdout.split('\n').filter(Boolean).map(Number);
  } catch {
    return [];
  }
}

async function memoryOf(pid) {
  const out = { footprint: null, footprintPeak: null, rss: null };
  try {
    const { stdout } = await run('ps', ['-o', 'rss=', '-p', String(pid)]);
    out.rss = Number(stdout.trim()) * 1024;
  } catch { /* the process ended */ }
  if (process.platform !== 'darwin') return out;
  try {
    const { stdout } = await run('vmmap', ['--summary', String(pid)], { maxBuffer: 16 * MB });
    const size = (label) => {
      const match = new RegExp(`${label}:\\s+([\\d.]+)([KMG])`).exec(stdout);
      return match ? Number(match[1]) * { K: 1024, M: MB, G: 1024 * MB }[match[2]] : null;
    };
    out.footprint = size('Physical footprint');
    out.footprintPeak = size('Physical footprint \\(peak\\)');
  } catch { /* vmmap needs the same user; reported as unmeasured */ }
  return out;
}

/** Samples the model's runner every second until stopped; keeps the largest values seen. */
function memorySampler(pidsFor) {
  const peak = { footprint: 0, rss: 0, footprintPeak: 0, samples: 0 };
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      const pids = await pidsFor();
      let footprint = 0;
      let rss = 0;
      for (const pid of pids) {
        const memory = await memoryOf(pid);
        footprint += memory.footprint ?? 0;
        rss += memory.rss ?? 0;
        peak.footprintPeak = Math.max(peak.footprintPeak, memory.footprintPeak ?? 0);
      }
      if (pids.length) {
        peak.samples += 1;
        peak.footprint = Math.max(peak.footprint, footprint);
        peak.rss = Math.max(peak.rss, rss);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  })();
  return async () => {
    stopped = true;
    await loop;
    return peak;
  };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function measureModel(options, model, sample) {
  const extra = options.numCtx ? { options: { num_ctx: options.numCtx } } : {};
  const embed = (input) => post(options.ollama, '/api/embed', { model, input, truncate: true, keep_alive: '10m', ...extra });
  const coldStart = performance.now();
  await embed(['warm up']);
  const coldMs = performance.now() - coldStart;
  const pids = await runnerPids(options.ollama, model);
  const stop = memorySampler(async () => pids);
  const loadBefore = load();
  const started = performance.now();
  let done = 0;
  let chars = 0;
  for (const batch of batches(sample)) {
    const { embeddings } = await embed(batch);
    if (embeddings?.length !== batch.length) throw new Error(`${model}: expected ${batch.length} vectors`);
    done += batch.length;
    chars += batch.reduce((sum, text) => sum + text.length, 0);
  }
  const seconds = (performance.now() - started) / 1000;
  const memory = await stop();
  const queryMs = [];
  for (let i = 0; i < options.queries; i += 1) {
    const at = performance.now();
    await embed([`배송 지연 예측 ${i} what changed in release ${i}?`]);
    queryMs.push(performance.now() - at);
  }
  const ps = await fetch(`${options.ollama}/api/ps`).then((response) => response.json()).catch(() => ({ models: [] }));
  const loaded = ps.models?.find((entry) => entry.name === model || entry.name === `${model}:latest`);
  return {
    model, coldMs, passages: done, chars, seconds,
    passagesPerSecond: done / seconds, charsPerSecond: chars / seconds,
    load: `${loadBefore} → ${load()}`,
    runnerPids: pids, memory,
    ollamaReported: loaded ? { size: loaded.size, sizeVram: loaded.size_vram, contextLength: loaded.context_length } : null,
    queryP50: percentile(queryMs, 50), queryP95: percentile(queryMs, 95),
  };
}

const mb = (bytes) => (bytes ? `${(bytes / MB).toFixed(0)} MB` : 'unmeasured');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`machine: ${cpus()[0]?.model ?? 'unknown'}, ${cpus().length} cores, ${(totalmem() / 1024 / MB).toFixed(0)} GB; load ${loadavg().map((value) => value.toFixed(1)).join(' ')}`);
  const surveys = [];
  for (const shape of options.shapes) {
    for (const files of options.files) {
      const started = performance.now();
      const result = survey(files, shape, options.sample);
      surveys.push(result);
      console.log(`${shape}-${files}: ${result.passages} passages, ${(result.chars / 1e6).toFixed(1)} M characters from ${(result.bytes / MB).toFixed(0)} MB (${((performance.now() - started) / 1000).toFixed(1)} s to generate and split; load ${load()})`);
    }
  }

  const version = await ollamaVersion(options.ollama);
  if (!version) {
    console.log(`Ollama is not reachable at ${options.ollama}; throughput and memory were not measured.`);
  } else {
    console.log(`Ollama ${version} at ${options.ollama}${options.numCtx ? `, num_ctx ${options.numCtx}` : ''}`);
    const available = await ollamaModels(options.ollama);
    for (const shape of options.shapes) {
      const largest = surveys.filter((entry) => entry.shape === shape).sort((a, b) => b.files - a.files)[0];
      for (const model of options.models) {
        if (!available.has(model)) {
          console.log(`${model}: not in Ollama; skipped (pull it with \`ollama pull ${model}\`).`);
          continue;
        }
        const result = await measureModel(options, model, largest.sample);
        console.log(`\n${model}, ${shape} sample of ${result.passages} passages (load ${result.load})`);
        console.log(`  cold load ${(result.coldMs / 1000).toFixed(1)} s · ${result.passagesPerSecond.toFixed(1)} passages/s · ${(result.charsPerSecond / 1000).toFixed(1)} k characters/s`);
        console.log(`  one question: p50 ${result.queryP50.toFixed(0)} ms, p95 ${result.queryP95.toFixed(0)} ms (${options.queries} single-text requests, model loaded)`);
        console.log(`  runner ${result.runnerPids.join(', ') || 'not found'}: physical footprint peak ${mb(result.memory.footprint)} (vmmap's own peak ${mb(result.memory.footprintPeak)}), resident peak ${mb(result.memory.rss)} over ${result.memory.samples} samples`);
        if (result.ollamaReported) console.log(`  Ollama reports ${mb(result.ollamaReported.size)} loaded (${mb(result.ollamaReported.sizeVram)} in GPU memory), context ${result.ollamaReported.contextLength}`);
        for (const entry of surveys.filter((item) => item.shape === shape)) {
          const minutes = entry.chars / result.charsPerSecond / 60;
          const byCount = entry.passages / result.passagesPerSecond / 60;
          console.log(`  ${entry.files} files: about ${minutes.toFixed(0)} min to prepare ${entry.passages} passages (${byCount.toFixed(0)} min by passage count)${entry.files === 50000 ? ` · limit ${PREP_LIMIT_MINUTES} min ${minutes <= PREP_LIMIT_MINUTES ? 'met' : 'missed'}` : ''}`);
        }
      }
    }
  }
  if (!options.keep) rmSync(WORK, { recursive: true, force: true });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
