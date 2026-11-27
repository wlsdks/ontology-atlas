// Finds the repository documents worth quoting and builds the semantic evidence
// packet from them: bounded discovery, then one extracted, risk-scanned row per
// document.

import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import {
  join,
  basename,
  relative,
} from 'node:path';
import {
  CARGO_MANIFEST_MAX_BYTES,
  NODE_PACKAGE_MANIFEST_MAX_BYTES,
  PYTHON_PROJECT_MAX_BYTES,
  PYTHON_SETUP_MAX_BYTES,
  SEMANTIC_DISCOVERY_MAX_ENTRIES,
  SEMANTIC_DISCOVERY_MAX_FILES,
  SEMANTIC_EVIDENCE_MAX_BYTES,
  SEMANTIC_EVIDENCE_MAX_DOCUMENTS,
  WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS,
} from '../scan-limits.mjs';
import {
  SEMANTIC_DISCOVERY_ROOTS,
  SEMANTIC_DISCOVERY_SKIP_DIRS,
  SEMANTIC_EVIDENCE_SEEDS,
  WORKSPACE_FOLDERS,
} from '../scan-tables.mjs';
import { humanize } from '../text.mjs';
import {
  packageContractPathIssue,
  pathResolvesInsideRoot,
  pushSkippedOnce,
  resolveExistingSourceCase,
} from './scan-guards.mjs';
import {
  extractCargoPackageContract,
  extractNodePackageContract,
  extractPythonPyprojectPackageContract,
  extractPythonSetupPackageContract,
} from './package-contracts.mjs';
import { scanSemanticEvidenceRisks, semanticEvidenceTrust } from './semantic-risk.mjs';
import {
  classifySemanticEvidencePath,
  semanticContentScore,
  extractSemanticDocument,
} from './semantic-document.mjs';
import { compareText } from '../../compare-text.mjs';

export function collectSemanticEvidence(rootPath, skipped = []) {
  const candidates = discoverSemanticEvidenceCandidates(rootPath, skipped);
  const rows = [];
  for (const { source, role, pathScore } of candidates) {
    const path = join(rootPath, source);
    if (!existsSync(path)) continue;
    try {
      const nodePackageContract = source === 'package.json' || source.endsWith('/package.json');
      const packageContractMaxBytes = source === 'Cargo.toml'
        ? CARGO_MANIFEST_MAX_BYTES
        : source === 'setup.py'
          ? PYTHON_SETUP_MAX_BYTES
          : source === 'pyproject.toml'
            ? PYTHON_PROJECT_MAX_BYTES
            : nodePackageContract
              ? NODE_PACKAGE_MANIFEST_MAX_BYTES
          : null;
      if (packageContractMaxBytes !== null) {
        const issue = packageContractPathIssue(
          rootPath,
          path,
          source,
          packageContractMaxBytes,
        );
        if (issue) {
          pushSkippedOnce(skipped, {
            path,
            reason:
              nodePackageContract && issue.endsWith('resolves outside repository root')
                ? `semantic-evidence-skip: ${source} resolves outside repository root`
                : issue,
          });
          continue;
        }
      } else {
        if (!pathResolvesInsideRoot(rootPath, path)) {
          pushSkippedOnce(skipped, {
            path,
            reason: `semantic-evidence-skip: ${source} resolves outside repository root`,
          });
          continue;
        }
        if (statSync(path).size > SEMANTIC_EVIDENCE_MAX_BYTES) {
          pushSkippedOnce(skipped, {
            path,
            reason: `semantic-evidence-skip: ${source} exceeds ${SEMANTIC_EVIDENCE_MAX_BYTES} bytes`,
          });
          continue;
        }
      }
      const bytes = readFileSync(path);
      const text = bytes.toString('utf-8');
      const extracted = source === 'Cargo.toml'
        ? extractCargoPackageContract(text)
        : source === 'setup.py'
          ? extractPythonSetupPackageContract(text)
          : source === 'pyproject.toml'
            ? extractPythonPyprojectPackageContract(text)
          : nodePackageContract
            ? extractNodePackageContract(text)
          : extractSemanticDocument(text, source);
      if (extracted.skipReason) {
        if (
          !(
            source === 'package.json' &&
            skipped.some(
              (row) => row.path === path && /^package-json-parse-error:/.test(row.reason),
            )
          )
        ) {
          pushSkippedOnce(skipped, { path, reason: extracted.skipReason });
        }
        continue;
      }
      if (!extracted.excerpt && extracted.headings.length === 0) continue;
      rows.push({
        source,
        role,
        title: extracted.title || humanize(basename(source).replace(/\.md$/i, '')),
        headings: extracted.headings,
        excerpt: extracted.excerpt,
        _reviewRequiredEvidence: extracted.reviewRequiredEvidence,
        _excerptInfo: extracted.firstOmittedLine === undefined ? undefined : {
          scope: 'selected_prose',
          truncated: extracted.firstOmittedLine !== null,
          firstOmittedLine: extracted.firstOmittedLine,
          nextSourceRead: extracted.firstOmittedLine === null ? null : {
            path: source,
            startLine: extracted.firstOmittedLine,
            maxLines: 200,
            expectedSha256: createHash('sha256').update(bytes).digest('hex'),
          },
        },
        _riskText: extracted.riskText,
        _score: pathScore + semanticContentScore(extracted),
      });
    } catch (error) {
      skipped.push({
        path,
        reason: `semantic-evidence-read-error: ${error.message}`,
      });
    }
  }
  const ranked = rows.sort(
    (a, b) => b._score - a._score || compareText(a.source, b.source),
  );
  const selected = [];
  const selectedSources = new Set();
  // Preserve evidence-role diversity before filling remaining slots by score.
  // Otherwise a large feature catalog can crowd mission/strategy/architecture
  // evidence out of the bounded packet.
  for (const role of [
    'mission',
    'package-contract',
    'product-contract',
    'product-capabilities',
    'architecture',
    'agent-guidance',
  ]) {
    const row = ranked.find(
      (candidate) =>
        candidate.role === role && !selectedSources.has(candidate.source),
    );
    if (!row) continue;
    selected.push(row);
    selectedSources.add(row.source);
  }
  for (const row of ranked) {
    if (selected.length >= SEMANTIC_EVIDENCE_MAX_DOCUMENTS) break;
    if (selectedSources.has(row.source)) continue;
    selected.push(row);
    selectedSources.add(row.source);
  }
  return selected.map((row) => {
    const riskFlags = scanSemanticEvidenceRisks(row);
    if (row._excerptInfo?.truncated) riskFlags.push('excerpt-truncated');
    return {
      source: row.source,
      role: row.role,
      title: row.title,
      headings: row.headings,
      excerpt: row.excerpt,
      trust: semanticEvidenceTrust(riskFlags),
      riskFlags,
      ...(row._excerptInfo ? { excerptInfo: row._excerptInfo } : {}),
      ...(row._reviewRequiredEvidence?.length > 0
        ? { reviewRequiredEvidence: row._reviewRequiredEvidence }
        : {}),
    };
  });
}

function discoverSemanticEvidenceCandidates(rootPath, skipped = []) {
  const bySource = new Map();
  for (const [source, role] of SEMANTIC_EVIDENCE_SEEDS) {
    const resolvedSource = resolveExistingSourceCase(rootPath, source);
    if (!resolvedSource) continue;
    if (role === 'package-contract' && resolvedSource !== source) continue;
    bySource.set(resolvedSource, {
      source: resolvedSource,
      role,
      pathScore: 100,
    });
  }
  discoverWorkspaceSemanticEvidenceCandidates(rootPath, bySource, skipped);
  let filesSeen = 0;
  let entriesSeen = 0;
  const visitedDirectories = new Set();
  function walkBudgetReached(directory) {
    if (entriesSeen < SEMANTIC_DISCOVERY_MAX_ENTRIES) return false;
    pushSkippedOnce(skipped, {
      path: directory,
      reason: `semantic-evidence-skip: ${relative(rootPath, directory)} reached ${SEMANTIC_DISCOVERY_MAX_ENTRIES} entry walk budget`,
    });
    return true;
  }
  // Sorted depth-first walk: O(entries), capped by the file and entry budgets;
  // `visitedDirectories` (real paths) stops symlink loops.
  function visit(directory) {
    if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES || walkBudgetReached(directory)) return;
    const realDirectory = realpathSync(directory);
    if (visitedDirectories.has(realDirectory)) {
      pushSkippedOnce(skipped, {
        path: directory,
        reason: `semantic-evidence-skip: ${relative(rootPath, directory)} repeats a visited directory`,
      });
      return;
    }
    visitedDirectories.add(realDirectory);
    for (const entry of readdirSync(directory).sort()) {
      if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES || walkBudgetReached(directory)) return;
      entriesSeen += 1;
      const path = join(directory, entry);
      let resolvesInsideRoot = false;
      try {
        resolvesInsideRoot = pathResolvesInsideRoot(rootPath, path);
      } catch {
        pushSkippedOnce(skipped, {
          path,
          reason: `semantic-evidence-skip: ${relative(rootPath, path)} cannot resolve inside repository root`,
        });
        continue;
      }
      if (!resolvesInsideRoot) {
        pushSkippedOnce(skipped, {
          path,
          reason: `semantic-evidence-skip: ${relative(rootPath, path)} resolves outside repository root`,
        });
        continue;
      }
      const stat = statSync(path);
      if (stat.isDirectory()) {
        if (!SEMANTIC_DISCOVERY_SKIP_DIRS.has(entry.toLowerCase())) visit(path);
        continue;
      }
      if (!entry.toLowerCase().endsWith('.md')) continue;
      filesSeen += 1;
      const source = relative(rootPath, path);
      if (bySource.has(source)) continue;
      const classified = classifySemanticEvidencePath(source);
      if (classified) bySource.set(source, { source, ...classified });
    }
  }
  for (const rootName of SEMANTIC_DISCOVERY_ROOTS) {
    if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES) break;
    const discoveryRoot = join(rootPath, rootName);
    if (!existsSync(discoveryRoot)) continue;
    if (!pathResolvesInsideRoot(rootPath, discoveryRoot)) {
      pushSkippedOnce(skipped, {
        path: discoveryRoot,
        reason: `semantic-evidence-skip: ${rootName} resolves outside repository root`,
      });
      continue;
    }
    if (!statSync(discoveryRoot).isDirectory()) continue;
    visit(discoveryRoot);
  }
  return [...bySource.values()];
}

function discoverWorkspaceSemanticEvidenceCandidates(rootPath, bySource, skipped) {
  for (const folder of WORKSPACE_FOLDERS) {
    const workspaceRoot = join(rootPath, folder);
    if (!existsSync(workspaceRoot)) continue;
    let entries;
    try {
      entries = readdirSync(workspaceRoot).sort();
    } catch (error) {
      pushSkippedOnce(skipped, {
        path: workspaceRoot,
        reason: `semantic-evidence-read-error: ${error.message}`,
      });
      continue;
    }
    const eligible = entries.filter((entry) => {
      if (entry.startsWith('.')) return false;
      try {
        return statSync(join(workspaceRoot, entry)).isDirectory();
      } catch {
        return false;
      }
    });
    const considered = eligible.slice(0, WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS);
    if (eligible.length > considered.length) {
      pushSkippedOnce(skipped, {
        path: workspaceRoot,
        reason: `semantic-evidence-skip: ${folder} workspace members limited to ${WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS}`,
      });
    }
    for (const entry of considered) {
      const packageSource = `${folder}/${entry}/package.json`;
      const resolvedPackageSource = resolveExistingSourceCase(rootPath, packageSource);
      if (resolvedPackageSource === packageSource) {
        bySource.set(packageSource, {
          source: packageSource,
          role: 'package-contract',
          pathScore: 74,
        });
      }
      const readmeSource = `${folder}/${entry}/README.md`;
      const resolvedReadmeSource = resolveExistingSourceCase(rootPath, readmeSource);
      if (resolvedReadmeSource) {
        bySource.set(resolvedReadmeSource, {
          source: resolvedReadmeSource,
          role: 'product-capabilities',
          pathScore: 75,
        });
      }
    }
  }
}
