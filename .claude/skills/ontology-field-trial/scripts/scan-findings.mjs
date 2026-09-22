/**
 * What the write door would have said about a vault that already exists.
 *
 * `meaningFindings` runs inside the MCP writers, so it only ever speaks at the
 * moment a node is created. After a trial the vault is on disk and the findings
 * are gone — and "the rules are stricter now" is then an opinion. This replays
 * the same function over every node in a finished vault, so two runs can be
 * compared on the one number that says whether the door worked: how many nodes
 * it would still complain about.
 *
 * It also counts, per kind, how many bodies keep a section where the builder
 * admits what it did not check. That is the finding the sealed reader's seventh
 * question asks for from the other side, and the two should agree.
 *
 * ## Per-node and whole-vault findings
 *
 * `meaningFindings` judges one node from its own text. Three codes cannot be
 * decided that way — `starter-example-node` has to know whether a real node of
 * the same kind exists, and `dependency-unwitnessed` has to know what file the
 * node at the far end of an edge cites — so they run once over the collected
 * vault after the per-node loop. Without that second pass this scanner reported
 * a clean vault for exactly the defect the 2026-09-22 trials found: three
 * scaffold examples left standing in a finished map.
 *
 * usage: node scan-findings.mjs <vault> <repo-root>
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walk up from this script to the checkout that owns the writers being measured. */
function findRepositoryRoot() {
  let here = dirname(fileURLToPath(import.meta.url));
  while (here !== dirname(here)) {
    if (existsSync(join(here, 'mcp', 'src', 'meaning-findings.mjs'))) return here;
    here = dirname(here);
  }
  throw new Error('could not find mcp/src/meaning-findings.mjs above this script');
}

const repository = findRepositoryRoot();
const {
  dependencyWitnessFinding,
  meaningFindings,
  starterExampleFindings,
} = await import(join(repository, 'mcp', 'src', 'meaning-findings.mjs'));
const { parseFrontmatter } = await import(join(repository, 'mcp', 'src', 'parser.mjs'));

const [vaultArg, repoRootArg] = process.argv.slice(2);
if (!vaultArg || !repoRootArg) {
  console.error('usage: node scan-findings.mjs <vault> <repo-root>');
  process.exit(2);
}
const vault = resolve(vaultArg);
const repoRoot = resolve(repoRootArg);
if (!existsSync(vault)) {
  console.error(`scan-findings: no such vault: ${vault}`);
  process.exit(2);
}

/** Every markdown file under the vault, dot-folders left alone. */
function markdownFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const child = join(folder, entry.name);
    if (entry.isDirectory()) return markdownFiles(child);
    return entry.isFile() && entry.name.endsWith('.md') ? [child] : [];
  });
}

// A body may name its doubt under any of these headings; the writers accept all three.
const DOUBT_HEADINGS = /^##\s+(Uncertainty|Open questions|Confidence)\s*$/im;

const tally = {};
const examples = {};
const byKind = {};
let nodes = 0;
/** Every node as the whole-vault findings want it, collected during the walk. */
const collected = [];

function record(finding) {
  tally[finding.code] = (tally[finding.code] ?? 0) + 1;
  examples[finding.code] ??= [];
  if (examples[finding.code].length < 3) examples[finding.code].push(finding.slug);
}

for (const file of markdownFiles(vault)) {
  let parsed;
  try {
    parsed = parseFrontmatter(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  const frontmatter = parsed.frontmatter ?? {};
  if (typeof frontmatter.kind !== 'string' || !frontmatter.kind.trim()) continue;
  const kind = frontmatter.kind.trim();
  const slug = typeof frontmatter.slug === 'string' && frontmatter.slug
    ? frontmatter.slug
    : relative(vault, file).replace(/\.md$/, '');
  const body = parsed.body ?? '';
  nodes += 1;

  byKind[kind] ??= { nodes: 0, withDoubtSection: 0 };
  byKind[kind].nodes += 1;
  if (DOUBT_HEADINGS.test(body)) byKind[kind].withDoubtSection += 1;
  collected.push({ slug, kind, title: frontmatter.title, frontmatter, body });

  for (const finding of meaningFindings({
    kind,
    slug,
    frontmatter,
    body,
    repoRoot,
    bodyWritten: true,
    pathWritten: true,
  })) {
    record(finding);
  }
}

// The whole-vault half. One node's own text cannot answer either of these: a
// starter example is only a defect once a real sibling of its kind exists, and a
// declared dependency is only unwitnessed relative to the file the *target*
// cites. Both run here, over everything the walk collected.
for (const finding of starterExampleFindings(collected)) record(finding);

const evidencePathBySlug = new Map(
  collected
    .map((node) => [node.slug, typeof node.frontmatter?.path === 'string' ? node.frontmatter.path.trim() : ''])
    .filter(([, path]) => path),
);
for (const node of collected) {
  for (const finding of dependencyWitnessFinding({
    slug: node.slug,
    frontmatter: node.frontmatter,
    repoRoot,
    resolveTargetPath: (ref) => evidencePathBySlug.get(ref) ?? null,
  })) {
    record(finding);
  }
}

console.log(JSON.stringify({ vault, repoRoot, nodes, tally, examples, uncertaintyByKind: byKind }, null, 1));
