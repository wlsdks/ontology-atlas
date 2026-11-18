/**
 * How deep a first map went, measured from the vault and the repository: the share
 * of product source lines whose unit a node `path:` touches, how many nodes say
 * they were outlined only, and the findings a newcomer would trip over (a relation
 * note about code nobody read, a dependency both ways, an entry file with no code,
 * one file for many nodes). Writes report the coverage line, validate_vault adds the
 * findings, and finalize_project_meaning refuses an `answered` these numbers do not
 * support. Every message names the call that repairs it.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';

import {
  UNIT_SOURCE_EXTENSIONS,
  collectSourceUnits,
  measureUnitCoverage,
  unitForPath,
} from '../analyze/source-units.mjs';

/** Wording a node uses for a subject it only outlined; read under `## Uncertainty` alone. */
const OUTLINED_ONLY = /\b(?:outlined only|only outlined|outline only|outlined,? (?:but )?(?:the )?(?:body |bodies )?(?:not read|unread)|bod(?:y|ies) (?:was |were |is |are )?(?:not read|unread)|unread|not opened)\b/i;

const UNTOUCHED_NAMED = 12;
const SHARED_PATH_LIMIT = 5;
const PATH_KINDS = new Set(['capability', 'element']);

/** The `## Uncertainty` section of a body, or '' when it has none. */
function uncertaintySection(body) {
  const match = /^##\s+Uncertainty\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(String(body ?? ''));
  return match ? match[1] : '';
}

/** Whether a node says, under `## Uncertainty`, that its subject was outlined and not read. */
export function saysOutlinedOnly(body) {
  return OUTLINED_ONLY.test(uncertaintySection(body));
}

function kindOf(doc) {
  return typeof doc?.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
}

function pathOf(doc) {
  const path = doc?.frontmatter?.path;
  return typeof path === 'string' && path.trim() ? path.trim().replace(/^\.\//, '') : null;
}

function refsOf(doc, keys) {
  const refs = [];
  for (const key of keys) {
    const value = doc?.frontmatter?.[key];
    if (Array.isArray(value)) refs.push(...value.filter((ref) => typeof ref === 'string' && ref.trim()).map((ref) => ref.trim()));
  }
  return refs;
}

const DEPENDENCY_KEYS = ['dependencies', 'depends_on'];

/** A ref as an exact slug, or the unique node whose slug ends with it. */
function slugResolver(docs) {
  const bySlug = new Set(docs.map((doc) => doc.slug));
  const byTail = new Map();
  for (const doc of docs) {
    const tail = doc.slug.split('/').pop();
    byTail.set(tail, byTail.has(tail) ? null : doc.slug);
  }
  return (ref) => (bySlug.has(ref) ? ref : byTail.get(ref) ?? null);
}

/** Every `depends_on` edge as [from, to] slugs that resolve. */
function dependencyEdges(docs) {
  const resolve = slugResolver(docs);
  const edges = [];
  for (const doc of docs) {
    for (const ref of refsOf(doc, DEPENDENCY_KEYS)) {
      const to = resolve(ref);
      if (to && to !== doc.slug) edges.push([doc.slug, to]);
    }
  }
  return edges;
}

/** The product units of a grounded repository, or null when it has none to measure. */
export function repositoryUnits(repoRoot, vaultRoot) {
  if (!repoRoot) return null;
  try {
    const collection = collectSourceUnits(repoRoot, { vaultRoot });
    return collection.units.length > 0 ? collection : null;
  } catch {
    return null;
  }
}

function formatLines(value) {
  return value.toLocaleString('en-US');
}

/**
 * Coverage of the product by node paths, plus how many capabilities and elements say
 * they were outlined only, with the one line a write reports.
 */
export function measureBuildDepth(docs, collection) {
  const capabilities = docs.filter((doc) => kindOf(doc) === 'capability');
  const outlined = docs
    .filter((doc) => PATH_KINDS.has(kindOf(doc)) && saysOutlinedOnly(doc.body))
    .map((doc) => doc.slug);
  const outlinedCapabilities = capabilities.filter((doc) => saysOutlinedOnly(doc.body)).map((doc) => doc.slug);
  const dependsOn = dependencyEdges(docs).length;
  const coverage = collection ? measureUnitCoverage(collection, docs.map(pathOf).filter(Boolean)) : null;
  const parts = [];
  if (coverage) {
    parts.push(`Coverage ${coverage.percent}%: node paths touch ${coverage.touchedUnits} of ${coverage.productUnits} product units (${formatLines(coverage.touchedLines)} of ${formatLines(coverage.productLines)} lines).`);
    if (coverage.untouched.length > 0) {
      const named = coverage.untouched.slice(0, UNTOUCHED_NAMED).map((unit) => `${unit.path} (${formatLines(unit.lines)})`);
      const more = coverage.untouched.length - named.length;
      parts.push(`Untouched: ${named.join(', ')}${more > 0 ? ` and ${more} more` : ''}. Add nodes whose path enters them, or name them in the project's ## Uncertainty.`);
    }
  }
  if (outlined.length > 0) {
    parts.push(`${outlinedCapabilities.length} of ${capabilities.length} capabilities and ${outlined.length - outlinedCapabilities.length} elements say outlined only.`);
  }
  return {
    coverage,
    capabilities: capabilities.length,
    outlined,
    outlinedCapabilities,
    dependsOn,
    line: parts.length > 0 ? parts.join(' ') : null,
  };
}

/* ---------------------------------------------------------------------------
 * validate_vault findings
 * ------------------------------------------------------------------------- */

const NOTE_KEYS = ['dependencies', 'depends_on', 'relates', 'elements', 'capabilities'];

function relationNoteFindings(docs) {
  const resolve = slugResolver(docs);
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const findings = [];
  for (const doc of docs) {
    const notes = doc?.frontmatter?.relation_notes;
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) continue;
    const related = new Set(refsOf(doc, NOTE_KEYS));
    for (const [ref, note] of Object.entries(notes)) {
      if (typeof note !== 'string' || !note.trim() || !related.has(ref)) continue;
      const target = bySlug.get(resolve(ref));
      if (!target) continue;
      const unread = [doc, target].filter((node) => saysOutlinedOnly(node.body)).map((node) => node.slug);
      if (unread.length === 0) continue;
      findings.push({
        slug: doc.slug,
        code: 'relation-note-on-unread',
        message: `The why on ${doc.slug} -> ${target.slug} states how they work together, but ${unread.join(' and ')} says it was outlined only. Read the entry function with analyze_repo_structure sourceReads (startLine, maxLines) and patch_concept what you find; if the read does not confirm the edge, remove_relation it.`,
      });
    }
  }
  return findings;
}

function twoWayDependencyFindings(docs) {
  const edges = new Set(dependencyEdges(docs).map(([from, to]) => `${from}\0${to}`));
  const findings = [];
  for (const key of edges) {
    const [from, to] = key.split('\0');
    if (from > to || !edges.has(`${to}\0${from}`)) continue;
    findings.push({
      slug: from,
      code: 'dependency-both-ways',
      message: `${from} and ${to} each depend on the other. A dependency runs from consumer to provider: a caller depends on the interface it calls, an implementation does not depend on its interface, and a composition root depends on what it wires. Keep the direction the code shows and remove_relation the other.`,
    });
  }
  return findings;
}

/** Comments, docstrings, imports and re-exports removed; what is left is code. */
function hasCode(text, path) {
  const ext = extname(path).toLowerCase();
  let rest = String(text);
  if (ext === '.py' || ext === '.rb') {
    rest = rest
      .replace(/("""|''')[\s\S]*?\1/g, '')
      .replace(/^\s*from\s+[\w.]+\s+import\s*\([^)]*\)/gm, '')
      .replace(/^__all__\s*\+?=\s*[[(][^\])]*[\])]/gm, '')
      .replace(/#.*$/gm, '');
  } else {
    rest = rest
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/^\s*(?:import|export)\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"];?/gm, '')
      .replace(/^\s*import\s*\([^)]*\)/gm, '');
  }
  const lines = rest.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const declarative = /^(?:import\s|from\s+[\w.]+\s+import\s|export\s+\*|export\s+(?:type\s+)?\{[^}]*\}\s*from\s|package\s+\w+|use\s+[\w:{}, *]+;|(?:pub\s+)?mod\s+\w+;|['"]use strict['"];?|module\.exports\s*=\s*require\(|[)\]};,]+$)/;
  return lines.some((line) => !declarative.test(line));
}

function readSmallSource(repoRoot, path) {
  if (!UNIT_SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) return null;
  try {
    const abs = join(repoRoot, path);
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > 256 * 1024) return null;
    return readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
}

/** Up to three product files near `path`, longest first: its unit's, then its folder's. */
function nearbyFiles(collection, path) {
  const unit = unitForPath(collection, path);
  const folder = dirname(path);
  const candidates = collection.files
    .filter((file) => file.class === 'product' && file.path !== path && file.lines > 0)
    .filter((file) => (unit && unit.files.includes(file)) || file.path.startsWith(`${folder}/`))
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  return candidates.slice(0, 3).map((file) => file.path);
}

function entryPathFindings(docs, repoRoot, collection) {
  const findings = [];
  const byPath = new Map();
  for (const doc of docs) {
    if (!PATH_KINDS.has(kindOf(doc))) continue;
    const path = pathOf(doc);
    if (!path) continue;
    byPath.set(path, [...(byPath.get(path) ?? []), doc.slug]);
    const text = readSmallSource(repoRoot, path);
    if (text === null || hasCode(text, path)) continue;
    const nearby = collection ? nearbyFiles(collection, path) : [];
    findings.push({
      slug: doc.slug,
      code: 'path-without-code',
      message: `path: ${path} holds no code (only comments, a docstring, imports or re-exports), so "where does this live" lands on nothing. Point path at the file the ability starts in${nearby.length > 0 ? `, such as ${nearby.join(', ')}` : ''}, with patch_concept.`,
    });
  }
  for (const [path, slugs] of byPath) {
    if (slugs.length <= SHARED_PATH_LIMIT) continue;
    const nearby = collection ? nearbyFiles(collection, path) : [];
    const listed = slugs.slice(0, 6).join(', ') + (slugs.length > 6 ? ` and ${slugs.length - 6} more` : '');
    for (const slug of slugs) {
      findings.push({
        slug,
        code: 'path-shared',
        message: `${slugs.length} nodes share path: ${path} (${listed}), so a drift check cannot tell them apart. Give each node the more specific file its ability enters through${nearby.length > 0 ? ` (for example ${nearby.join(', ')})` : ''} with patch_concept, and keep one element for this file's role.`,
      });
    }
  }
  return findings;
}

/** The validate_vault warnings this module owns; `repoRoot` null skips the file checks. */
export function buildDepthFindings(docs, { repoRoot, collection } = {}) {
  return [
    ...relationNoteFindings(docs),
    ...twoWayDependencyFindings(docs),
    ...(repoRoot ? entryPathFindings(docs, repoRoot, collection) : []),
  ];
}

/* ---------------------------------------------------------------------------
 * finalize_project_meaning
 * ------------------------------------------------------------------------- */

const ANSWERED_COVERAGE_PERCENT = 80;

/**
 * Why an `answered` competency row is not supported by the map, one reason per row,
 * each naming what is missing and the call that fixes it; empty when all hold.
 */
export function competencyDepthRefusals(questions, depth) {
  const status = new Map(questions.map((question) => [question.id, question.status]));
  const reasons = [];
  const partialHint = (id, gap) => `or mark ${id} partial with "- Gap: ${gap}"`;
  if (status.get('evidence') === 'answered' && depth.capabilities > 0
    && depth.outlinedCapabilities.length * 3 > depth.capabilities) {
    const named = depth.outlinedCapabilities.slice(0, 8).join(', ');
    reasons.push(`- evidence: ${depth.outlinedCapabilities.length} of ${depth.capabilities} capabilities say outlined only (${named}${depth.outlinedCapabilities.length > 8 ? ', …' : ''}), more than a third. Read each entry function with analyze_repo_structure sourceReads (startLine, maxLines) and patch_concept the body with what it does, ${partialHint('evidence', 'these abilities were outlined, not read')}.`);
  }
  if (depth.coverage && depth.coverage.percent < ANSWERED_COVERAGE_PERCENT) {
    const untouched = depth.coverage.untouched.slice(0, UNTOUCHED_NAMED).map((unit) => unit.path).join(', ');
    for (const id of ['domains', 'abilities']) {
      if (status.get(id) !== 'answered') continue;
      reasons.push(`- ${id}: node paths cover ${depth.coverage.percent}% of product source lines, below ${ANSWERED_COVERAGE_PERCENT}%. Untouched: ${untouched}. Add nodes for them with add_concepts (each with a path: inside the unit), ${partialHint(id, `untouched units ${untouched}`)}.`);
    }
  }
  if (status.get('impact') === 'answered' && depth.capabilities > 0 && depth.dependsOn * 2 < depth.capabilities) {
    reasons.push(`- impact: ${depth.dependsOn} depends_on edges for ${depth.capabilities} capabilities, below one per two. Add the dependencies the code shows with add_relations (each why naming the call), ${partialHint('impact', 'dependencies are recorded for only part of the map')}.`);
  }
  return reasons;
}
