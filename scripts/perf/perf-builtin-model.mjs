#!/usr/bin/env node
// Measures the app's built-in bge-m3 model on this computer from local copies of the publisher's
// files; nothing is downloaded. Usage:
//   pnpm perf:builtin-model -- --model-dir=<folder holding pytorch_model.bin and tokenizer.json>
//        [--only=pins,prepare,fidelity,build,cpu,ollama] [--ollama=http://localhost:11434]
//        [--write-references]   (`--only= --write-references` writes only the references)
// The folder's files must match the pins (`pins` checks them). `prepare` converts them into a store
// under the OS temp folder and has a worker check them; `fidelity` compares f16 with fp32 on the
// labelled fixture in one process. `build` drives a model worker as the app does: time to the first
// vector, the repository's docs plus the fixture, questions, both processes' memory, and the worker's
// exit on release and at its idle limit. `cpu` sends one 32-passage batch to a worker on the CPU in
// f32. `ollama` compares the worker's vectors with Ollama's bge-m3 for every fixture passage and
// question; `--write-references` rewrites the vectors of the reference texts the app checks a fresh
// conversion against from Ollama's answers.
// Passages come from the app's index (`vault-index-bench passages`), the only splitter. Each Rust measurement runs in its own release
// process (LTO off, its own target folder), which starts itself again as the worker, and prints one
// JSON line; the first build takes minutes.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { batches, cratePassages, DEFAULT_OLLAMA, embedBatch, ollamaModels, ollamaVersion } from './meaning-quality.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = join(ROOT, 'tests/fixtures/meaning-search');
const REFERENCES = join(ROOT, 'src-tauri/src/llm/embed/builtin/reference-vectors.json');
const WORK = join(tmpdir(), 'atlas-perf-builtin-model');
const MODEL = 'bge-m3';
const STEPS = ['pins', 'prepare', 'fidelity', 'build', 'cpu', 'ollama'];
const RUST_TESTS = {
  pins: 'publisher_files_match_the_pins',
  prepare: 'prepare_from_the_publisher_files',
  fidelity: 'f16_matches_fp32_on_the_fixture',
  build: 'a_build_and_questions_on_this_computer',
  cpu: 'one_batch_on_the_cpu',
  ollama: 'vectors_for_the_fixture',
};
/** Short texts in both of the fixture's languages, kept in the reference file; a fresh conversion must reproduce their vectors. */
const PROBES = JSON.parse(readFileSync(REFERENCES, 'utf8')).probes.map((probe) => probe.text);
/** Measured against Ollama 0.35.1: 0.99998 on Metal in f16; a wrong tensor scores far lower. */
const REFERENCE_FLOOR = 0.999;

function parseArgs(argv) {
  const options = { modelDir: null, only: STEPS, ollama: DEFAULT_OLLAMA, writeReferences: false };
  for (const arg of argv) {
    if (arg === '--') continue;
    else if (arg.startsWith('--model-dir=')) options.modelDir = resolve(arg.slice(12));
    else if (arg.startsWith('--only=')) options.only = arg.slice(7).split(',').filter(Boolean);
    else if (arg.startsWith('--ollama=')) options.ollama = arg.slice(9).replace(/\/$/, '');
    else if (arg === '--write-references') options.writeReferences = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  const unknown = options.only.filter((step) => !STEPS.includes(step));
  if (unknown.length) throw new Error(`unknown step ${unknown.join(', ')}; steps are ${STEPS.join(', ')}`);
  return options;
}

/** The texts every measurement reads: fixture passages, fixture questions, and documentation passages. */
async function passageTexts(dir) {
  const texts = [];
  for await (const passage of cratePassages(dir)) texts.push(passage.text);
  return texts;
}

async function writeTexts() {
  const { files } = JSON.parse(readFileSync(join(FIXTURE, 'vault.json'), 'utf8'));
  const vault = mkdtempSync(join(tmpdir(), 'atlas-perf-builtin-model-fixture-'));
  let fixture;
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(vault, path)), { recursive: true });
      writeFileSync(join(vault, path), text);
    }
    fixture = await passageTexts(vault);
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
  const { questions } = JSON.parse(readFileSync(join(FIXTURE, 'questions.json'), 'utf8'));
  const docs = await passageTexts(join(ROOT, 'docs'));
  const texts = { fixture, questions: questions.map((q) => q.question.normalize('NFC')), docs, probes: PROBES };
  mkdirSync(WORK, { recursive: true });
  const path = join(WORK, 'texts.json');
  writeFileSync(path, JSON.stringify(texts));
  console.log(`texts: ${fixture.length} fixture passages, ${texts.questions.length} questions, ${docs.length} documentation passages`);
  return path;
}

function rustStep(step, env) {
  const result = spawnSync('cargo', [
    'test', '--release', '--manifest-path', join(ROOT, 'src-tauri/Cargo.toml'), '-p', 'ontology-atlas', '--lib', '--',
    '--ignored', '--nocapture', '--exact', `llm::embed::builtin::tests::measure::${RUST_TESTS[step]}`,
  ], {
    env: {
      ...process.env,
      ...env,
      CARGO_TARGET_DIR: join(ROOT, 'src-tauri/target/perf-builtin-model'),
      CARGO_PROFILE_RELEASE_LTO: 'false',
      CARGO_PROFILE_RELEASE_CODEGEN_UNITS: '16',
    },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = result.stdout.split('\n').filter((line) => line.startsWith('{'));
  for (const line of lines) console.log(`${step} ${line} load ${loadavg()[0].toFixed(1)}`);
  if (result.status !== 0) {
    const failure = `${result.stdout}\n${result.stderr}`.split('\n').filter((line) => /panicked|error|assert/.test(line));
    throw new Error(`${step} failed:\n${failure.slice(0, 12).join('\n')}`);
  }
}

async function ollamaVectors(base, texts) {
  const out = [];
  for (const batch of batches(texts)) out.push(...await embedBatch(base, MODEL, batch));
  return out;
}

const dot = (a, b) => a.reduce((sum, value, at) => sum + value * b[at], 0);

function summarise(name, ours, theirs) {
  const cosines = ours.map((vector, at) => dot(vector, theirs[at])).sort((a, b) => a - b);
  const mean = cosines.reduce((sum, value) => sum + value, 0) / cosines.length;
  console.log(`ollama ${JSON.stringify({ texts: name, n: cosines.length, min: +cosines[0].toFixed(6), mean: +mean.toFixed(6), below_0_99: cosines.filter((c) => c < 0.99).length, below_0_999: cosines.filter((c) => c < 0.999).length })}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const needsFiles = options.only.some((step) => ['pins', 'prepare', 'fidelity'].includes(step));
  if (needsFiles && !options.modelDir) throw new Error('--model-dir=<folder holding pytorch_model.bin and tokenizer.json> is required');
  const textsPath = await writeTexts();
  const env = {
    ATLAS_BGE_M3_DIR: options.modelDir ?? '',
    ATLAS_MEANING_TEXTS: textsPath,
    ATLAS_MEASURE_STORE: join(WORK, 'store'),
    ATLAS_VECTORS_OUT: join(WORK, 'vectors.json'),
  };

  const needsOllama = options.only.includes('ollama') || options.writeReferences;
  const version = needsOllama ? await ollamaVersion(options.ollama) : null;
  if (needsOllama && !(version && (await ollamaModels(options.ollama)).has(MODEL))) {
    throw new Error(`the ollama step and --write-references need Ollama with ${MODEL} at ${options.ollama}`);
  }
  if (options.writeReferences) {
    const vectors = await ollamaVectors(options.ollama, PROBES);
    const round = (value) => Math.round(value * 1e6) / 1e6;
    const probes = PROBES.map((text, at) => ({ text, vector: Array.from(vectors[at], round) }));
    writeFileSync(REFERENCES, `${JSON.stringify({ source: `Ollama ${version} ${MODEL}:latest`, floor: REFERENCE_FLOOR, probes })}\n`);
    console.log(`wrote ${probes.length} reference vectors from Ollama ${version}`);
  }

  for (const step of STEPS.filter((name) => options.only.includes(name))) {
    console.log(`${step}: running (load ${loadavg()[0].toFixed(1)})`);
    rustStep(step, env);
  }

  if (options.only.includes('ollama')) {
    const texts = JSON.parse(readFileSync(textsPath, 'utf8'));
    const ours = JSON.parse(readFileSync(env.ATLAS_VECTORS_OUT, 'utf8'));
    summarise('fixture passages', ours.fixture, await ollamaVectors(options.ollama, texts.fixture));
    summarise('fixture questions', ours.questions, await ollamaVectors(options.ollama, texts.questions));
    summarise('reference probes', ours.probes, await ollamaVectors(options.ollama, PROBES));
    console.log(`compared with Ollama ${version} ${MODEL}`);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
