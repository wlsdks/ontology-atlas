#!/usr/bin/env node
// Writes a deterministic generated vault for scale measurements.
// Usage: node scripts/perf/gen-scale-vault.mjs <dir> <files> <all|key>
//   all: every page is a node. key: a few thousand nodes over many plain documents.
// Bodies are one third English, one third Korean with particles attached to nouns, one third
// mixed; one page in ten is four times longer; rare terms sit in 0.2 to 0.5 % of pages.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EN = 'vault graph meaning evidence review relation boundary capability element domain agent session index parse render layout canvas release signing update frontmatter markdown history snapshot source import analysis freshness drift proposal approval library wiki passage outline search rank token locale message route panel inspector focus cluster layer watcher cache schema migration tokenizer latency throughput consistency recovery'.split(' ');
const KOREAN = JSON.parse(readFileSync(new URL('./scale-vault-words.json', import.meta.url), 'utf8'));
const KO = KOREAN.nouns;
const JOSA = KOREAN.particles;
const VERB = KOREAN.verbs;
const MIX = KOREAN.mixed;

/** Writes the vault and returns what it wrote. */
export function generateScaleVault(dir, fileCount, shape) {
  let seed = 987654321;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const uid = (text) => {
    const h = createHash('sha1').update(text).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  const words = (count, next) => Array.from({ length: count }, next).join(' ');
  const enSentence = () => {
    const s = words(9 + Math.floor(rnd() * 14), () => pick(EN));
    return `${s[0].toUpperCase()}${s.slice(1)}.`;
  };
  const koWord = () => {
    const r = rnd();
    if (r < 0.12) return pick(KO) + pick(KO) + pick(JOSA);
    if (r < 0.2) return pick(MIX) + pick(JOSA);
    return pick(KO) + pick(JOSA);
  };
  const mixWord = () => {
    const r = rnd();
    if (r < 0.4) return pick(EN);
    if (r < 0.55) return pick(MIX) + pick(JOSA);
    return pick(KO) + pick(JOSA);
  };
  const koSentence = () => `${words(5 + Math.floor(rnd() * 8), koWord)} ${pick(VERB)}.`;
  const mixSentence = () => `${words(6 + Math.floor(rnd() * 8), mixWord)} ${pick(VERB)}.`;
  const sentence = (lang) => [enSentence, koSentence, mixSentence][lang]();
  const para = (count, lang) => Array.from({ length: count }, () => sentence(lang)).join(' ');
  const quote = (text) => `"${text.replace(/"/g, '')}"`;
  const frontmatter = (fields) => {
    const lines = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (Array.isArray(value)) return `${key}: [${value.join(', ')}]`;
        if (typeof value === 'object') {
          return `${key}: { ${Object.entries(value).map(([a, b]) => `${a}: ${quote(b)}`).join(', ')} }`;
        }
        return `${key}: ${value}`;
      });
    return `---\n${lines.join('\n')}\n---\n\n`;
  };
  const sections = (lang) =>
    `${para(2, lang)}\n\n## Includes\n- ${sentence(lang)}\n- ${sentence(lang)}\n\n## Excludes\n- ${sentence(lang)}\n\n## Uncertainty\n- ${sentence(lang)}\n`;

  for (const folder of ['domains', 'capabilities', 'elements', 'wiki']) mkdirSync(join(dir, folder), { recursive: true });
  const key = shape === 'key';
  const domainCount = key ? Math.max(6, Math.round(fileCount / 2500)) : Math.max(6, Math.round(fileCount / 250));
  const capabilityCount = Math.round(fileCount * (key ? 0.025 : 0.25));
  const elementCount = Math.round(fileCount * (key ? 0.035 : 0.3));
  const documentCount = Math.max(0, fileCount - 1 - domainCount - capabilityCount - elementCount);
  const capabilityDomain = (i) => i % domainCount;
  const elementDomain = (i) => (i * 7) % domainCount;
  const domainCapabilities = Array.from({ length: domainCount }, () => []);
  const domainElements = Array.from({ length: domainCount }, () => []);
  for (let i = 0; i < capabilityCount; i++) domainCapabilities[capabilityDomain(i)].push(`capabilities/cap-${i}`);
  for (let i = 0; i < elementCount; i++) domainElements[elementDomain(i)].push(`elements/el-${i}`);

  let bytes = 0;
  const put = (relative, text) => {
    writeFileSync(join(dir, relative), text);
    bytes += Buffer.byteLength(text);
  };
  put('atlas.md', frontmatter({
    uid: uid('p'), slug: 'atlas', kind: 'project', title: 'Bench Atlas', display_en: 'Bench Atlas', display_ko: KOREAN.labels.project,
    domains: Array.from({ length: domainCount }, (_, i) => `domains/dom-${i}`),
  }) + sections(0));
  for (let d = 0; d < domainCount; d++) {
    put(`domains/dom-${d}.md`, frontmatter({
      uid: uid(`d${d}`), slug: `domains/dom-${d}`, kind: 'domain', title: `Domain ${d}`, display_en: `Domain ${d}`,
      display_ko: `${KOREAN.labels.domain} ${d}`, capabilities: domainCapabilities[d], elements: domainElements[d],
    }) + sections(d % 3));
  }
  for (let i = 0; i < capabilityCount; i++) {
    const elements = [`elements/el-${(i * 3) % elementCount}`, `elements/el-${(i * 3 + 1) % elementCount}`];
    const dependsOn = i > 0 ? [`capabilities/cap-${Math.floor(rnd() * i)}`] : [];
    const notes = Object.fromEntries([...elements, ...dependsOn].map((slug) => [slug, enSentence()]));
    put(`capabilities/cap-${i}.md`, frontmatter({
      uid: uid(`c${i}`), slug: `capabilities/cap-${i}`, kind: 'capability', title: `Capability ${i} ${EN[i % EN.length]}`,
      display_en: `Capability ${i}`, display_ko: `${KOREAN.labels.capability} ${i} ${KO[i % KO.length]}`, domain: `domains/dom-${capabilityDomain(i)}`,
      elements, depends_on: dependsOn, path: `src/features/f${i % 400}/model/use-${EN[i % EN.length]}-${i}.ts`,
      relation_notes: notes, created_by: '"agent:bench"',
    }) + sections(i % 3));
  }
  for (let i = 0; i < elementCount; i++) {
    put(`elements/el-${i}.md`, frontmatter({
      uid: uid(`e${i}`), slug: `elements/el-${i}`, kind: 'element', title: `Element ${i} ${EN[(i * 5) % EN.length]}`,
      display_en: `Element ${i}`, display_ko: `${KOREAN.labels.element} ${i} ${KO[(i * 5) % KO.length]}`, domain: `domains/dom-${elementDomain(i)}`,
      path: `src/entities/e${i % 300}/lib/${EN[(i * 5) % EN.length]}-${i}.ts`, created_by: '"agent:bench"',
    }) + sections(i % 3));
  }
  for (let i = 0; i < documentCount; i++) {
    const lang = i % 3;
    const scale = rnd() < 0.1 ? 4 : 1;
    const links = Array.from({ length: 4 }, () =>
      rnd() < 0.5 ? `[[capabilities/cap-${Math.floor(rnd() * capabilityCount)}]]` : `[[wiki/page-${Math.floor(rnd() * documentCount)}]]`);
    const rare = (i % 211 === 0 ? KOREAN.rare.every211 : '')
      + (i % 307 === 0 ? ' The zettelkasten note links here.' : '')
      + (i % 401 === 0 ? KOREAN.rare.every401 : '')
      + (i % 503 === 0 ? KOREAN.rare.every503 : '');
    const body = `# Page ${i}\n\n${para(4 * scale, lang)}${rare}\n\n## Background\n\n${para(6 * scale, lang)} See ${links[0]} and ${links[1]}.\n\n## Details\n\n${para(8 * scale, lang)}\n\n- ${sentence(lang)}\n- ${sentence(lang)}\n- ${sentence(lang)}\n\n## Related\n\n${para(3, lang)} Compare ${links[2]}; depends on ${links[3]}.\n`;
    put(`wiki/page-${i}.md`, frontmatter({
      uid: key ? undefined : uid(`w${i}`), slug: key ? undefined : `wiki/page-${i}`, kind: key ? undefined : 'document',
      title: `Page ${i} ${EN[(i * 11) % EN.length]} ${KO[(i * 13) % KO.length]}`,
      display_en: key ? undefined : `Page ${i}`, display_ko: key ? undefined : `${KOREAN.labels.page} ${i}`,
      tags: [`tag-${i % 40}`, `tag-${(i * 3) % 40}`],
    }) + body);
  }
  const files = 1 + domainCount + capabilityCount + elementCount + documentCount;
  return { files, nodes: key ? 1 + domainCount + capabilityCount + elementCount : files, bytes };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [dir, files, shape = 'all'] = process.argv.slice(2);
  if (!dir || !Number.isInteger(Number(files)) || !['all', 'key'].includes(shape)) {
    console.error('usage: node scripts/perf/gen-scale-vault.mjs <dir> <files> <all|key>');
    process.exit(2);
  }
  console.log(JSON.stringify({ dir, shape, ...generateScaleVault(dir, Number(files), shape) }));
}
