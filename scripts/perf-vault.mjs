#!/usr/bin/env node
// R11 #31 — 큰 vault 성능 audit. tmp dir 에 N .md 생성 후 parser + walk +
// validator 시간 측정. 사용자 codebase scale (수백~수천 .md) 에서 acceptable
// 한지 검증.
//
// 실행:
//   node scripts/perf-vault.mjs           # default N = [100, 500, 1000]
//   node scripts/perf-vault.mjs 2000      # custom N

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { parseFrontmatter } from "./lib/parse-frontmatter.mjs";

const KINDS = ['project', 'domain', 'capability', 'element', 'document'];
const FOLDERS = ['domains', 'capabilities', 'elements', 'projects'];

function genFrontmatter(i) {
  const kind = KINDS[i % KINDS.length];
  const folder = FOLDERS[i % FOLDERS.length];
  const slug = `${folder}/node-${i}`;
  const deps = [];
  if (i > 0) deps.push(`${folder}/node-${i - 1}`);
  if (i > 5) deps.push(`${folder}/node-${i - 5}`);
  const tags = [`tag-${i % 10}`, `tag-${(i + 1) % 10}`];

  const fm = [
    '---',
    `slug: ${slug}`,
    `kind: ${kind}`,
    `title: Node ${i}`,
    `domain: domain-${i % 6}`,
    `tags: [${tags.join(', ')}]`,
    deps.length > 0 ? `dependencies:\n${deps.map((d) => `  - ${d}`).join('\n')}` : '',
    '---',
    '',
    `# Node ${i}`,
    '',
    `이 노드는 자동 생성된 perf fixture. ${kind} 타입.`,
    '',
    'Lorem ipsum dolor sit amet consectetur adipiscing elit, ' +
      'sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    '',
  ]
    .filter(Boolean)
    .join('\n');
  return { slug, content: fm };
}

function generateVault(root, n) {
  for (const folder of FOLDERS) {
    mkdirSync(join(root, folder), { recursive: true });
  }
  for (let i = 0; i < n; i += 1) {
    const { slug, content } = genFrontmatter(i);
    writeFileSync(join(root, `${slug}.md`), content, 'utf-8');
  }
}

function walkMd(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    const entries = readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.endsWith('.md')) out.push(full);
    }
  }
  return out;
}

function measure(label, fn) {
  const t0 = performance.now();
  const result = fn();
  const t1 = performance.now();
  return { label, ms: t1 - t0, result };
}

function fmt(n) {
  return n.toFixed(2).padStart(8) + ' ms';
}

function runScale(n) {
  console.log(`\n=== N = ${n} .md files ===`);
  const root = mkdtempSync(join(tmpdir(), `perf-vault-${n}-`));
  try {
    const gen = measure('generate', () => generateVault(root, n));
    console.log(`  generate         : ${fmt(gen.ms)}`);

    const walk = measure('walk', () => walkMd(root));
    console.log(`  walkMd           : ${fmt(walk.ms)}  (${walk.result.length} files)`);

    const read = measure('read all', () =>
      walk.result.map((p) => readFileSync(p, 'utf-8')),
    );
    console.log(`  read all (utf-8) : ${fmt(read.ms)}`);

    const parse = measure('parse all', () =>
      read.result.map((raw) => parseFrontmatter(raw)),
    );
    console.log(`  parseFrontmatter : ${fmt(parse.ms)}`);

    const total = walk.ms + read.ms + parse.ms;
    console.log(`  ── total walk+read+parse: ${fmt(total)}  (${(total / n).toFixed(3)} ms/file)`);

    return {
      n,
      walk: walk.ms,
      read: read.ms,
      parse: parse.ms,
      total,
      perFile: total / n,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const arg = process.argv[2];
  const sizes = arg ? [Number(arg)] : [100, 500, 1000, 2000];

  console.log('[perf-vault] tmp vault scale audit — walk + read + parse');
  const results = sizes.map(runScale);

  console.log('\n=== Summary ===');
  console.log('   N   walk(ms)   read(ms)  parse(ms)  total(ms)  ms/file');
  for (const r of results) {
    console.log(
      `${String(r.n).padStart(5)}` +
        `${r.walk.toFixed(2).padStart(11)}` +
        `${r.read.toFixed(2).padStart(11)}` +
        `${r.parse.toFixed(2).padStart(11)}` +
        `${r.total.toFixed(2).padStart(11)}` +
        `${r.perFile.toFixed(3).padStart(9)}`,
    );
  }
}

main();
