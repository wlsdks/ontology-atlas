#!/usr/bin/env node
/**
 * Maps every file under `mcp/src` to exactly one family and writes `tests/differential/families.json`.
 *
 *   node scripts/mcp/differential/write-families.mjs           # write
 *   node scripts/mcp/differential/write-families.mjs --check   # fail when the file is stale or a file is unmapped
 *
 * Families are the slices of `docs/specs/2026-11-27-mcp-server-in-rust.md`; a test file belongs to
 * the family of the module it tests. The first rule that matches a path wins, so list narrow rules
 * before broad ones.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FAMILIES = Object.freeze([
  'shell',
  'safety',
  'vault-read',
  'graph',
  'git',
  'imports',
  'evidence',
  'survey',
  'meaning',
  'writes',
  'library',
]);

/** [pattern on the path below mcp/src, family] */
const RULES = [
  // safety: confinement, consent, audit lines, atomic writes, hostile-input gates
  [/^infer-imports\/confinement\//, 'safety'],
  [/^evidence-search\/credential-names/, 'safety'],
  [/^server\/write-consent/, 'safety'],
  [/^server\/write-log/, 'safety'],
  [/^server\/map-analysis-/, 'safety'],
  [/^vault\/documents\/(slug-paths|file-snapshot|text-read-pacing)/, 'safety'],
  [/^vault\/sidecar\//, 'safety'],
  [/^vault\/writes\/(atomic-writes|all-or-nothing)/, 'safety'],
  [/^tools\/writes\/write-gates/, 'safety'],
  [/^vault\/documents\/vault-confinement/, 'safety'],
  // git and staleness
  [/^git\/hardened-git/, 'shell'],
  [/^git\//, 'git'],
  [/^drift\//, 'git'],
  [/^tools\/git/, 'git'],
  // imports and architecture
  [/^infer-imports/, 'imports'],
  [/^architecture\//, 'imports'],
  [/^tools\/repo-analysis\/(infer-imports|inspect-architecture|architecture-profile-selection|import-review-rules)/, 'imports'],
  // evidence search and agent brief
  [/^evidence-search\//, 'evidence'],
  [/^agent-brief\//, 'evidence'],
  [/^tools\/agent-brief\//, 'evidence'],
  [/^ontology-engine\/briefs\//, 'evidence'],
  // repository survey
  [/^analyze[./-]/, 'survey'],
  [/^analyze\//, 'survey'],
  [/^analysis-history\//, 'survey'],
  [/^rust-feature-evidence/, 'survey'],
  [/^tools\/repo-analysis/, 'survey'],
  // meaning findings and construction depth
  [/^meaning\//, 'meaning'],
  [/^construction\//, 'meaning'],
  [/^tools\/construction/, 'meaning'],
  [/^tools\/validate-/, 'meaning'],
  [/^validate[./-]/, 'meaning'],
  // library, wiki, project source
  [/^library\//, 'library'],
  [/^project-source\//, 'library'],
  [/^project-meaning\//, 'library'],
  [/^tools\/(project-source|connect-consent|constellations|absorb)/, 'library'],
  [/^vault\/absorb/, 'library'],
  // vault writes
  [/^tools\/lifecycle/, 'writes'],
  [/^tools\/writes\//, 'writes'],
  [/^vault\/writes\//, 'writes'],
  // graph
  [/^ontology-engine/, 'graph'],
  [/^ontology-compiler/, 'graph'],
  [/^tools\/(graph|query-ontology-args)/, 'graph'],
  // vault documents and plain reads
  [/^(parser|schema|query|suggestions|markdown-tree)[./-]/, 'vault-read'],
  [/^vault\//, 'vault-read'],
  [/^tools\/(read|vault-nodes|relation-keys|result-attachments|query-vault-load)/, 'vault-read'],
  [/^server\/compiled-cache/, 'vault-read'],
  // the shell: protocol loop, registry, surface, instructions
  [/^server\//, 'shell'],
  [/^compare-(text|code-points)[./]/, 'shell'],
  [/^(index|javascript-server|server-version)[./]/, 'shell'],
  [/^(integration|json-rpc-lines|startup-imports|call-tool-script|package-metadata-script|source-dependencies-script|containment-parent|verify-script)[./-]/, 'shell'],
];

export function familyOf(relative) {
  for (const [pattern, family] of RULES) if (pattern.test(relative)) return family;
  return null;
}

export function buildFamilies(repoRoot) {
  const listed = execFileSync('git', ['ls-files', 'mcp/src'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();
  const files = {};
  const unmapped = [];
  for (const file of listed) {
    const family = familyOf(file.slice('mcp/src/'.length));
    if (family) files[file] = family;
    else unmapped.push(file);
  }
  return { files, unmapped };
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const { files, unmapped } = buildFamilies(repoRoot);
  const counts = Object.fromEntries(FAMILIES.map((name) => [name, 0]));
  for (const family of Object.values(files)) counts[family] += 1;
  const document = {
    generatedBy: 'node scripts/mcp/differential/write-families.mjs',
    unmapped: unmapped.length,
    counts,
    files,
  };
  const target = path.join(repoRoot, 'tests', 'differential', 'families.json');
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      current = '';
    }
    if (unmapped.length > 0 || current !== `${JSON.stringify(document, null, 2)}\n`) {
      console.error(unmapped.length > 0 ? `unmapped files: ${unmapped.join(', ')}` : 'tests/differential/families.json is stale');
      process.exit(1);
    }
    console.log(`families.json current; ${Object.keys(files).length} files, unmapped 0`);
    return;
  }
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`${Object.keys(files).length} files mapped, unmapped ${unmapped.length}`);
  for (const file of unmapped) console.log(`  unmapped: ${file}`);
  process.exit(unmapped.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
