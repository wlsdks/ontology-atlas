// Who this repository says it is. Project identity from package manifests,
// `configure.ac`, or the README H1; the domain candidates a README's H2 sections
// suggest; and the ontology nodes an existing vault already contributes.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import {
  AUTOTOOLS_IDENTITY_FILES,
  AUTOTOOLS_IDENTITY_MAX_BYTES,
  AUTOTOOLS_IDENTITY_MAX_LENGTH,
  PYTHON_PROJECT_MAX_BYTES,
  PYTHON_SETUP_MAX_BYTES,
  STARTER_ONTOLOGY_SLUGS,
} from './constants.mjs';
import { cleanHeadingLabel, humanize, isHeadingAdornment, slugify } from './text.mjs';
import {
  packageContractPathIssue,
  pathResolvesInsideRoot,
  pushSkippedOnce,
} from './scan-guards.mjs';
import {
  extractPythonPyprojectPackageContract,
  extractPythonSetupPackageContract,
} from './package-contracts.mjs';

function extractStaticAutotoolsIdentity(text) {
  const match = String(text).match(
    /^\s*AC_INIT\s*\(\s*(\[[^\]\r\n]{1,160}\]|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')\s*(?=,|\))/m,
  );
  if (!match) return '';
  const literal = match[1];
  const identity = literal.slice(1, -1).trim();
  if (
    !identity ||
    identity.length > AUTOTOOLS_IDENTITY_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(identity) ||
    /[`$\\]/.test(identity) ||
    /\b(?:m4_[A-Za-z0-9_]+|esyscmd|syscmd|eval|include|ifdef|ifelse)\s*\(/i.test(identity)
  ) {
    return '';
  }
  return identity;
}

function detectAutotoolsIdentity(rootPath, skipped = []) {
  for (const source of AUTOTOOLS_IDENTITY_FILES) {
    const path = join(rootPath, source);
    if (!existsSync(path)) continue;
    try {
      const pathStat = statSync(path);
      if (!pathStat.isFile()) continue;
      if (!pathResolvesInsideRoot(rootPath, path)) {
        pushSkippedOnce(skipped, {
          path,
          reason: `project-identity-skip: ${source} resolves outside repository root`,
        });
        continue;
      }
      if (pathStat.size > AUTOTOOLS_IDENTITY_MAX_BYTES) {
        pushSkippedOnce(skipped, {
          path,
          reason: `project-identity-skip: ${source} exceeds ${AUTOTOOLS_IDENTITY_MAX_BYTES} bytes`,
        });
        continue;
      }
      const identity = extractStaticAutotoolsIdentity(readFileSync(path, 'utf-8'));
      const slug = identity ? slugify(identity.replace(/[_/]+/g, '-')) : '';
      if (identity && slug) {
        return { slug, title: identity, evidence: [source] };
      }
    } catch {
      // An unreadable or concurrently removed configure file is not identity evidence.
    }
  }
  return null;
}

export function detectProject(rootPath, skipped = []) {
  const autotoolsIdentity = detectAutotoolsIdentity(rootPath, skipped);
  if (autotoolsIdentity) return autotoolsIdentity;
  const pkgPath = join(rootPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const slugRaw = String(pkg.name || basename(rootPath));
      const slug = slugRaw.replace(/^@/, '').replace(/\//g, '-');
      // package.json `description` is explanatory prose, not an identity label.
      // Using it as `title` produced sentence-long project names (Muse exposed
      // this in dogfood). Prefer the README H1, then the package name.
      const title = detectReadmeH1(rootPath) || humanize(slug);
      return { slug, title };
    } catch (err) {
      skipped.push({
        path: pkgPath,
        reason: `package-json-parse-error: ${err.message}`,
      });
    }
  }
  const pyprojectPath = join(rootPath, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const issue = packageContractPathIssue(
        rootPath,
        pyprojectPath,
        'pyproject.toml',
        PYTHON_PROJECT_MAX_BYTES,
      );
      if (issue) {
        pushSkippedOnce(skipped, { path: pyprojectPath, reason: issue });
      } else {
        const contract = extractPythonPyprojectPackageContract(
          readFileSync(pyprojectPath, 'utf-8'),
        );
        if (contract.packageName) {
          const slug = slugify(contract.packageName.replace(/_/g, '-'));
          if (slug) {
            return {
              slug,
              title: detectReadmeH1(rootPath) || humanize(contract.packageName),
            };
          }
        }
      }
    } catch (err) {
      skipped.push({
        path: pyprojectPath,
        reason: `python-package-contract-read-error: ${err.message}`,
      });
    }
  }
  const setupPath = join(rootPath, 'setup.py');
  if (existsSync(setupPath)) {
    try {
      const issue = packageContractPathIssue(
        rootPath,
        setupPath,
        'setup.py',
        PYTHON_SETUP_MAX_BYTES,
      );
      if (issue) {
        pushSkippedOnce(skipped, { path: setupPath, reason: issue });
      } else {
        const contract = extractPythonSetupPackageContract(
          readFileSync(setupPath, 'utf-8'),
        );
        if (contract.packageName) {
          const slug = slugify(contract.packageName.replace(/_/g, '-'));
          if (slug) {
            return {
              slug,
              title: detectReadmeH1(rootPath) || humanize(contract.packageName),
            };
          }
        }
      }
    } catch (err) {
      skipped.push({
        path: setupPath,
        reason: `python-package-contract-read-error: ${err.message}`,
      });
    }
  }
  const readmeTitle = detectReadmeH1(rootPath);
  if (readmeTitle) return { slug: basename(rootPath), title: readmeTitle };
  return { slug: basename(rootPath), title: humanize(basename(rootPath)) };
}

function detectReadmeH1(rootPath) {
  for (const cand of ['README.md', 'readme.md', 'README.rst', 'readme.rst', 'README']) {
    const path = join(rootPath, cand);
    if (!existsSync(path)) continue;
    try {
      const lines = readFileSync(path, 'utf-8').split(/\r?\n/);
      let fence = null;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
        if (fenceMatch) {
          const marker = fenceMatch[1][0];
          fence = fence === marker ? null : fence ?? marker;
          continue;
        }
        if (fence) continue;
        const nextLine = lines[lineIndex + 1]?.trim() ?? '';
        if (
          line.trim() &&
          isHeadingAdornment(nextLine) &&
          (cand.toLowerCase().endsWith('.rst') || nextLine.startsWith('='))
        ) {
          const title = cleanHeadingLabel(line);
          if (title) return title;
        }
        const markdownHeading = line.match(/^#\s+(.+?)\s*$/);
        if (markdownHeading) {
          const title = cleanHeadingLabel(markdownHeading[1]);
          if (title) return title;
        }
        const htmlHeading = line.match(/<h1\b[^>]*>(.*?)<\/h1>/i);
        if (htmlHeading) {
          const title = cleanHeadingLabel(htmlHeading[1]);
          if (title) return title;
        }
      }
    } catch {
      // A missing/unreadable README is not fatal to repository analysis.
    }
  }
  return null;
}

export function detectExistingOntologyEvidence(rootPath, skipped = []) {
  const ontologyRoot = join(rootPath, 'docs', 'ontology');
  if (!existsSync(ontologyRoot) || !statSync(ontologyRoot).isDirectory()) {
    return [];
  }
  const rows = [];
  const seen = new Set();

  function visit(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      let stat;
      try {
        stat = statSync(path);
      } catch (err) {
        skipped.push({ path, reason: `ontology-stat-error: ${err.message}` });
        continue;
      }
      if (stat.isDirectory()) {
        visit(path);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      const evidence = readOntologyEvidence(rootPath, ontologyRoot, path);
      if (!evidence || seen.has(evidence.slug)) continue;
      seen.add(evidence.slug);
      rows.push(evidence);
    }
  }

  visit(ontologyRoot);
  return rows;
}

function readOntologyEvidence(rootPath, ontologyRoot, path) {
  let text;
  try {
    text = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  const frontmatter = parseSimpleFrontmatter(text);
  const kind = frontmatter.kind;
  if (kind !== 'domain' && kind !== 'capability') return null;
  const source = relative(rootPath, path);
  const slug = frontmatter.slug || relative(ontologyRoot, path).replace(/\.md$/i, '');
  if (STARTER_ONTOLOGY_SLUGS.has(slug)) return null;
  return { slug, kind, source, elements: frontmatter.elements ?? [] };
}

function parseSimpleFrontmatter(text) {
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = text.slice(4, end).trim();
  const frontmatter = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (!value) {
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j].match(/^\s+-\s+(.+)$/);
        if (!item) break;
        items.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
        j += 1;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        i = j - 1;
      }
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
  }
  return frontmatter;
}

export function detectDomainsFromReadme(rootPath) {
  const candidates = ['README.md', 'readme.md', 'README'];
  for (const cand of candidates) {
    const p = join(rootPath, cand);
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, 'utf-8');
      const lines = text.split(/\r?\n/);
      const domains = [];
      const seen = new Set();
      for (let i = 0; i < lines.length; i += 1) {
        const m = lines[i].match(/^##\s+(.+?)\s*$/);
        if (!m) continue;
        const title = m[1].trim();
        const normalizedTitle = title
          .replace(/^[^a-z0-9가-힣]+/i, '')
          .trim();
        // README H2 is a heuristic domain source. Skip headers that are almost
        // never real codebase domains and only add bootstrap noise: generic doc
        // sections, narrative / question-style headers ("Why It Exists"),
        // language-guide headers ("Korean Guide"), and sentence-like headers
        // ("Three views plus MCP, one vault").
        const wordCount = title.split(/\s+/).filter(Boolean).length;
        if (
          // generic doc sections (exact match)
          /^(usage|installation|getting started|quick start|license|contributing|requirements|features|setup|status|tech stack|architecture|folder map|routes|tests?|documentation|overview|development|deployment|changelog|roadmap|faq|demo|examples?|guides?|table of contents|toc|acknowledge?ments?|sponsors?)$/i.test(
            normalizedTitle,
          ) ||
          // operational / aggregate sections that describe the README, not a
          // product ownership boundary
          /\bin numbers$|^install\b|^core capabilities$|^providers? and (?:local|offline) (?:path|setup|mode)$|^verification$|^community(?:\s+(?:and|&)\s+support)?$/i.test(
            normalizedTitle,
          ) ||
          /^(?:documentation\s+(?:and|&)\s+community(?:\s+support|\s+(?:and|&)\s+support)|documentation\s+(?:and|&)\s+support)$/i.test(
            normalizedTitle,
          ) ||
          // narrative / question-style headers
          /^(why|what|how|when|where|who)\b/i.test(normalizedTitle) ||
          // language-guide / translation section headers
          /가이드|\bguide\b/i.test(normalizedTitle) ||
          // bare language-name headers ("## Korean", "## English") — a
          // translated-README section, same noise class as "## Korean Guide".
          // Measured 2026-07-30: the repo's own "## Korean" section counted as
          // a 6th domain candidate and drifted the verify census when the
          // section moved.
          /^(한국어|한글|english|日本語|中文|简体中文|繁體中文|español|français|deutsch|português|русский|italiano|türkçe)$/i.test(
            normalizedTitle,
          ) ||
          // sentence-like headers (clause separator or long phrase)
          title.includes(',') ||
          wordCount > 5
        ) {
          continue;
        }
        const rawSlug = slugify(title);
        if (!rawSlug) continue;
        const slug = `domains/${rawSlug}`;
        if (seen.has(slug)) continue;
        seen.add(slug);
        domains.push({
          slug,
          title,
          evidence: { source: cand, line: i + 1 },
        });
        if (domains.length >= 12) break; // sanity cap
      }
      return { domains, readmePath: p };
    } catch {
      // ignore
    }
  }
  return { domains: [], readmePath: null };
}
