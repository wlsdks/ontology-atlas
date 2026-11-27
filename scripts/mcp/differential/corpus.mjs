// Reads the corpus: `tests/differential/corpus/<family>/<case>.jsonl`. The first line of a file is
// the case header, every following line is one step (a JSON-RPC request, a notification, a raw
// line, or a `$` directive); lines beginning with `#` are comments for the reader.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const HEADER_DEFAULTS = Object.freeze({
  vault: 'storefront',
  protocol: '2025-06-18',
  capabilities: {},
  handshake: true,
  env: {},
  elicit: 'none',
  cwd: 'case',
  mustNotExist: [],
});

export function corpusDirectory(repoRoot) {
  return path.join(repoRoot, 'tests', 'differential', 'corpus');
}

export function parseCaseFile(text, file) {
  const lines = text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
  if (lines.length === 0) throw new Error(`${file}: empty case`);
  const header = { ...HEADER_DEFAULTS, ...JSON.parse(lines[0]) };
  if (typeof header.case !== 'string') throw new Error(`${file}: the first line needs a "case" name`);
  const steps = lines.slice(1).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}: line ${index + 2} is not JSON (${error.message})`);
    }
  });
  return { header, steps };
}

/** @returns {{ family: string, name: string, file: string, header: object, steps: object[] }[]} */
export function loadCorpus(repoRoot, { family, caseName } = {}) {
  const root = corpusDirectory(repoRoot);
  if (!existsSync(root)) return [];
  const cases = [];
  for (const familyName of readdirSync(root).sort()) {
    if (family && familyName !== family) continue;
    const dir = path.join(root, familyName);
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.jsonl')).sort()) {
      const full = path.join(dir, file);
      const { header, steps } = parseCaseFile(readFileSync(full, 'utf8'), full);
      if (caseName && header.case !== caseName) continue;
      cases.push({ family: familyName, name: header.case, file: full, header, steps });
    }
  }
  return cases;
}

export function requestCount(caseDef) {
  return caseDef.steps.filter((step) => step.id !== undefined || step.raw !== undefined).length;
}
