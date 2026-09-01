// The semantic evidence packet: which repository documents are worth quoting,
// what they say, and how far they can be trusted. Discovery of candidate
// documents, per-document heading/excerpt extraction, and the risk scan that
// downgrades trust when a document reads like marketing or a template.

import { readFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import {
  CARGO_MANIFEST_MAX_BYTES,
  NODE_PACKAGE_MANIFEST_MAX_BYTES,
  PYTHON_PROJECT_MAX_BYTES,
  PYTHON_SETUP_MAX_BYTES,
  SEMANTIC_DISCOVERY_MAX_ENTRIES,
  SEMANTIC_DISCOVERY_MAX_FILES,
  SEMANTIC_DISCOVERY_ROOTS,
  SEMANTIC_DISCOVERY_SKIP_DIRS,
  SEMANTIC_EVIDENCE_MAX_BYTES,
  SEMANTIC_EVIDENCE_MAX_DOCUMENTS,
  SEMANTIC_EVIDENCE_MAX_EXCERPT,
  SEMANTIC_EVIDENCE_MAX_HEADINGS,
  SEMANTIC_EVIDENCE_SEEDS,
  WORKSPACE_FOLDERS,
  WORKSPACE_SEMANTIC_EVIDENCE_MAX_MEMBERS,
} from './constants.mjs';
import {
  cleanHeadingLabel,
  headingLevelForAdornment,
  humanize,
  isHeadingAdornment,
} from './text.mjs';
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

const SEMANTIC_REVIEW_REQUIRED_MAX_ITEMS = 4;
const SEMANTIC_REVIEW_REQUIRED_MAX_EXCERPT = 400;
const SEMANTIC_REVIEW_REQUIRED_MAX_TOTAL_EXCERPT = 800;
const HOSTILE_SEMANTIC_RISK_FLAGS = new Set([
  'instruction-injection',
  'ontology-write-instruction',
]);
const POLICY_SEMANTIC_RISK_FLAGS = new Set([
  'future-state-claim',
  'negated-claim',
  'deprecated-state',
]);

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
      const text = readFileSync(path, 'utf-8');
      const extracted = source === 'Cargo.toml'
        ? extractCargoPackageContract(text)
        : source === 'setup.py'
          ? extractPythonSetupPackageContract(text)
          : source === 'pyproject.toml'
            ? extractPythonPyprojectPackageContract(text)
          : nodePackageContract
            ? extractNodePackageContract(text)
          : extractSemanticDocument(text);
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
        _riskText: extracted.riskText,
        _score: pathScore + semanticContentScore(extracted),
      });
    } catch (err) {
      skipped.push({
        path,
        reason: `semantic-evidence-read-error: ${err.message}`,
      });
    }
  }
  const ranked = rows.sort(
    (a, b) => b._score - a._score || a.source.localeCompare(b.source),
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
    return {
      source: row.source,
      role: row.role,
      title: row.title,
      headings: row.headings,
      excerpt: row.excerpt,
      trust: semanticEvidenceTrust(riskFlags),
      riskFlags,
      ...(row._reviewRequiredEvidence?.length > 0
        ? { reviewRequiredEvidence: row._reviewRequiredEvidence }
        : {}),
    };
  });
}

function scanSemanticEvidenceRisks({
  headings = [],
  excerpt = '',
  _riskText = '',
}) {
  const text = `${headings.join('\n')}\n${excerpt}\n${_riskText}`;
  const risks = [];
  if (
    /\b(?:ignore|disregard|override)\b.{0,80}\b(?:previous|prior|system|developer|agent|instructions?)\b/is.test(text) ||
    /\b(?:system|developer)\s+prompt\b/i.test(text)
  ) {
    risks.push('instruction-injection');
  }
  if (
    /\b(?:call|invoke|execute|run)\s+(?:the\s+)?(?:add_concepts?|patch_concept|add_relations?|rename_concept)\b/i.test(text)
  ) {
    risks.push('ontology-write-instruction');
  }
  if (
    /\b(?:roadmap|planned|planning to|will support|future state|coming soon|not yet)\b/i.test(text) ||
    /(?:향후|추후|예정|계획 중)/.test(text)
  ) {
    risks.push('future-state-claim');
  }
  if (
    /\b(?:does not|do not|not a|not yet|never supports?|out of scope|non-goal)\b/i.test(text) ||
    /(?:지원하지 않|범위가 아니|제공하지 않)/.test(text)
  ) {
    risks.push('negated-claim');
  }
  if (
    /\b(?:deprecated|legacy|no longer|removed)\b/i.test(text) ||
    /(?:폐기|더 이상|제거됨)/.test(text)
  ) {
    risks.push('deprecated-state');
  }
  return risks;
}

function semanticEvidenceTrust(riskFlags) {
  if (
    riskFlags.includes('instruction-injection') ||
    riskFlags.includes('ontology-write-instruction')
  ) {
    return 'untrusted-instruction';
  }
  if (riskFlags.length > 0) return 'claim-review-required';
  return 'candidate-evidence';
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
  function walkBudgetReached(dir) {
    if (entriesSeen < SEMANTIC_DISCOVERY_MAX_ENTRIES) return false;
    pushSkippedOnce(skipped, {
      path: dir,
      reason: `semantic-evidence-skip: ${relative(rootPath, dir)} reached ${SEMANTIC_DISCOVERY_MAX_ENTRIES} entry walk budget`,
    });
    return true;
  }
  function visit(dir) {
    if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES || walkBudgetReached(dir)) return;
    const realDirectory = realpathSync(dir);
    if (visitedDirectories.has(realDirectory)) {
      pushSkippedOnce(skipped, {
        path: dir,
        reason: `semantic-evidence-skip: ${relative(rootPath, dir)} repeats a visited directory`,
      });
      return;
    }
    visitedDirectories.add(realDirectory);
    for (const entry of readdirSync(dir).sort()) {
      if (filesSeen >= SEMANTIC_DISCOVERY_MAX_FILES || walkBudgetReached(dir)) return;
      entriesSeen += 1;
      const path = join(dir, entry);
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

function classifySemanticEvidencePath(source) {
  const normalized = source.toLowerCase();
  if (/(?:^|\/)(?:readme|features?|capabilit(?:y|ies)|feature-catalog)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-capabilities', pathScore: 70 };
  }
  if (/(?:^|\/)(?:product|strategy|vision|mission|direction|principles?)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-contract', pathScore: 65 };
  }
  if (/(?:^|\/)(?:architecture|system-map|system_map|system|domain-map)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'architecture', pathScore: 60 };
  }
  if (/(?:^|\/)glossary(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-contract', pathScore: 50 };
  }
  if (/(?:^|\/)(?:introduction|overview|about)(?:[._/-]|$)/.test(normalized)) {
    return { role: 'product-contract', pathScore: 45 };
  }
  return null;
}

function semanticContentScore({ title, headings, excerpt }) {
  const text = `${title ?? ''}\n${headings.join('\n')}\n${excerpt}`.toLowerCase();
  let score = 0;
  for (const pattern of [
    /\bproduct goal\b/,
    /\buser need\b/,
    /\bmission\b/,
    /\bcapabilit(?:y|ies)\b/,
    /\bkey features\b/,
    /\bresponsibilit(?:y|ies)\b/,
    /\bdomain\b/,
    /한 줄 정의/,
    /제품 목표/,
    /기능 정의/,
  ]) {
    if (pattern.test(text)) score += 12;
  }
  if (/\b(?:backlog|roadmap|implementation plan|research findings|competitor)\b/.test(text)) {
    score -= 20;
  }
  return score;
}

function extractSemanticDocument(text) {
  const lines = text.split(/\r?\n/);
  let title = null;
  let fence = null;
  let rstLiteralBlock = false;
  let frontmatter = lines[0]?.trim() === '---';
  const rootSection = {
    heading: null,
    parent: null,
    lineIndex: -1,
    prose: [],
    excluded: false,
    isDocumentTitle: false,
  };
  const sections = [rootSection];
  const headingStack = [rootSection];
  let currentSection = rootSection;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const line = rawLine.trim();
    if (rstLiteralBlock) {
      if (!line || /^\s/.test(rawLine)) continue;
      rstLiteralBlock = false;
    }
    if (frontmatter) {
      if (lineIndex > 0 && line === '---') frontmatter = false;
      continue;
    }
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : fence ?? marker;
      continue;
    }
    if (fence) continue;
    if (/^\.\.\s+(?:code-block|sourcecode|literalinclude)::/i.test(line)) {
      rstLiteralBlock = true;
      continue;
    }
    const nextLine = lines[lineIndex + 1]?.trim() ?? '';
    const setextOrRstHeading =
      line && isHeadingAdornment(nextLine)
        ? {
            level: headingLevelForAdornment(nextLine, Boolean(title)),
            value: line,
          }
        : null;
    const markdownHeading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    const htmlHeading = line.match(/<h([1-3])\b[^>]*>(.*?)<\/h\1>/i);
    if (setextOrRstHeading || markdownHeading || htmlHeading) {
      const level = setextOrRstHeading
        ? setextOrRstHeading.level
        : markdownHeading
        ? markdownHeading[1].length
        : Number(htmlHeading[1]);
      const headingValue = (setextOrRstHeading
        ? setextOrRstHeading.value
        : markdownHeading
          ? markdownHeading[2]
          : htmlHeading[2])
        .replace(/<[^>]+>/g, '')
        .replace(/\[(.*?)\]\([^)]*\)/g, '$1');
      const value = (markdownHeading
        ? headingValue.replace(/\s+#+\s*$/, '')
        : headingValue)
        .trim();
      if (!value) continue;
      const isDocumentTitle = level === 1 && !title;
      if (isDocumentTitle) title = value;
      while (
        headingStack.length > 1 &&
        headingStack[headingStack.length - 1].heading.level >= level
      ) {
        headingStack.pop();
      }
      const parent = headingStack[headingStack.length - 1];
      currentSection = {
        heading: { level, value },
        parent,
        lineIndex,
        prose: [],
        isDocumentTitle,
        excluded:
          parent.excluded || isExcludedSemanticSection(value),
      };
      sections.push(currentSection);
      headingStack.push(currentSection);
      if (setextOrRstHeading) lineIndex += 1;
      continue;
    }
    if (
      !line ||
      /^\.\.\s+\S+::/.test(line) ||
      /^<!--/.test(line) ||
      /^<\/?(?:p|div|img|a)\b/i.test(line) ||
      /^!\[/.test(line) ||
      /^[-*_]{3,}$/.test(line) ||
      /shields\.io/.test(line)
    ) {
      continue;
    }
    if (isDecorativeSemanticLine(line)) continue;
    const cleaned = line
      .replace(/^>\s*/, '')
      .replace(/^[-*]\s+/, '')
      .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|middot|amp|lt|gt);/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) currentSection.prose.push({ lineIndex, text: cleaned });
  }

  const eligibleSections = sections.filter(
    (section) => !section.excluded && section.prose.length > 0,
  );
  const namedPreferredSections = eligibleSections.filter(
    (section) => semanticSectionHasNamedCategory(section),
  );
  const candidateSections = namedPreferredSections.length > 0
    ? [
      ...eligibleSections.filter(
        (section) =>
          semanticSectionCategory(section) === 'purpose' &&
          !semanticSectionHasNamedCategory(section),
      ),
      ...namedPreferredSections,
    ]
    : eligibleSections;
  const selectedSections = [];
  const selectedSectionSet = new Set();
  for (const category of ['purpose', 'architecture', 'ability']) {
    const section = candidateSections.find(
      (candidate) => semanticSectionCategory(candidate) === category,
    );
    if (!section) continue;
    selectedSections.push(section);
    selectedSectionSet.add(section);
  }
  for (
    const section of [...candidateSections].sort(
      (a, b) =>
        semanticSectionPriority(b) - semanticSectionPriority(a) ||
        a.lineIndex - b.lineIndex,
    )
  ) {
    if (selectedSections.length >= SEMANTIC_EVIDENCE_MAX_HEADINGS + 1) break;
    if (selectedSectionSet.has(section)) continue;
    selectedSections.push(section);
    selectedSectionSet.add(section);
  }

  const orderedSections = [...selectedSections].sort(
    (a, b) => a.lineIndex - b.lineIndex,
  );
  const completeSectionTextRows = semanticSectionTextRows(orderedSections);
  const completeHeadings = semanticHeadingSelection(sections, orderedSections);
  const completeExcerpt = buildSemanticExcerpt(completeSectionTextRows);
  const completeRiskFlags = scanSemanticEvidenceRisks({
    headings: completeHeadings,
    excerpt: completeExcerpt,
  });
  if (
    completeRiskFlags.some((flag) => HOSTILE_SEMANTIC_RISK_FLAGS.has(flag)) ||
    !completeRiskFlags.some((flag) => POLICY_SEMANTIC_RISK_FLAGS.has(flag))
  ) {
    return {
      title,
      headings: completeHeadings,
      excerpt: completeExcerpt,
    };
  }

  const reviewRequiredEvidence = [];
  const reviewedRows = new Set();
  const safeSections = orderedSections.map((section) => ({
    ...section,
    prose: [...section.prose],
  }));
  let reviewExcerptLength = 0;
  let reviewSplitFits = true;
  while (reviewSplitFits) {
    const nonEmptySafeSections = safeSections.filter(
      (section) => section.prose.length > 0,
    );
    if (nonEmptySafeSections.length === 0) break;
    const safeSelection = buildSemanticExcerptSelection(
      semanticSectionTextRows(nonEmptySafeSections),
    );
    const safeHeadings = semanticHeadingSelection(
      sections,
      nonEmptySafeSections,
      true,
    );
    const visibleRiskFlags = scanSemanticEvidenceRisks({
      headings: safeHeadings,
      excerpt: safeSelection.excerpt,
    });
    if (visibleRiskFlags.some((flag) => HOSTILE_SEMANTIC_RISK_FLAGS.has(flag))) {
      reviewSplitFits = false;
      break;
    }
    if (!visibleRiskFlags.some((flag) => POLICY_SEMANTIC_RISK_FLAGS.has(flag))) {
      if (reviewRequiredEvidence.length === 0 || !safeSelection.excerpt) break;
      return {
        title,
        headings: safeHeadings,
        excerpt: safeSelection.excerpt,
        reviewRequiredEvidence: reviewRequiredEvidence.sort(
          (a, b) => a.startLine - b.startLine,
        ),
      };
    }

    const newlyRiskyRows = new Set();
    for (const { section, text } of safeSelection.sectionSelections) {
      for (const { row, visibleText } of visibleSemanticProseRows(section, text)) {
        const visiblePolicyRisks = scanSemanticEvidenceRisks({
          headings: section.heading ? [section.heading.value] : [],
          excerpt: visibleText,
        }).filter((flag) => POLICY_SEMANTIC_RISK_FLAGS.has(flag));
        if (visiblePolicyRisks.length === 0 || reviewedRows.has(row)) continue;
        const exactRiskFlags = scanSemanticEvidenceRisks({
          headings: section.heading ? [section.heading.value] : [],
          excerpt: row.text,
        }).filter((flag) => POLICY_SEMANTIC_RISK_FLAGS.has(flag));
        reviewExcerptLength += row.text.length;
        if (
          reviewRequiredEvidence.length >= SEMANTIC_REVIEW_REQUIRED_MAX_ITEMS ||
          row.text.length > SEMANTIC_REVIEW_REQUIRED_MAX_EXCERPT ||
          reviewExcerptLength > SEMANTIC_REVIEW_REQUIRED_MAX_TOTAL_EXCERPT
        ) {
          reviewSplitFits = false;
          break;
        }
        reviewedRows.add(row);
        newlyRiskyRows.add(row);
        reviewRequiredEvidence.push({
          heading: section.heading?.value ?? title ?? 'Document prelude',
          startLine: row.lineIndex + 1,
          endLine: row.lineIndex + 1,
          excerpt: row.text,
          riskFlags: exactRiskFlags,
        });
      }
      if (!reviewSplitFits) break;
    }
    if (!reviewSplitFits || newlyRiskyRows.size === 0) break;
    for (const section of safeSections) {
      section.prose = section.prose.filter((row) => !newlyRiskyRows.has(row));
    }
  }

  return {
    title,
    headings: completeHeadings,
    excerpt: completeExcerpt,
  };
}

function semanticSectionTextRows(sections) {
  return sections.map((section) => ({
    section,
    text: section.prose.map((row) => row.text).join(' '),
  }));
}

function buildSemanticExcerpt(sectionTextRows) {
  return buildSemanticExcerptSelection(sectionTextRows).excerpt;
}

function buildSemanticExcerptSelection(sectionTextRows) {
  const proseBudget = Math.max(
    0,
    SEMANTIC_EVIDENCE_MAX_EXCERPT - Math.max(0, sectionTextRows.length - 1),
  );
  const baseLength = sectionTextRows.length > 0
    ? Math.floor(proseBudget / sectionTextRows.length)
    : 0;
  const selectedLengths = new Map(
    sectionTextRows.map(({ section, text }) => [
      section,
      Math.min(baseLength, text.length),
    ]),
  );
  let remainingBudget = proseBudget;
  for (const length of selectedLengths.values()) remainingBudget -= length;
  for (const { section, text } of [...sectionTextRows].sort(
    (a, b) =>
      semanticSectionPriority(b.section) - semanticSectionPriority(a.section) ||
      a.section.lineIndex - b.section.lineIndex,
  )) {
    if (remainingBudget <= 0) break;
    const selectedLength = selectedLengths.get(section) ?? 0;
    const extraLength = Math.min(
      Math.max(0, text.length - selectedLength),
      remainingBudget,
    );
    selectedLengths.set(section, selectedLength + extraLength);
    remainingBudget -= extraLength;
  }
  const sectionSelections = sectionTextRows
    .map(({ section, text }) => {
      return {
        section,
        text: truncateSemanticExcerptAtBoundary(
          text,
          selectedLengths.get(section) ?? 0,
        ),
      };
    })
    .filter(({ text }) => Boolean(text));
  const excerpt = sectionSelections
    .map(({ text }) => text)
    .join(' ')
    .slice(0, SEMANTIC_EVIDENCE_MAX_EXCERPT)
    .trim();

  return { excerpt, sectionSelections };
}

function visibleSemanticProseRows(section, selectedText) {
  const visible = [];
  let offset = 0;
  for (const row of section.prose) {
    if (offset >= selectedText.length) break;
    const visibleLength = Math.min(row.text.length, selectedText.length - offset);
    if (visibleLength > 0) {
      visible.push({ row, visibleText: row.text.slice(0, visibleLength) });
    }
    offset += row.text.length + 1;
  }
  return visible;
}

function semanticHeadingSelection(allSections, selectedSections, selectedTitleOnly = false) {
  const titleSection = (selectedTitleOnly ? selectedSections : allSections).find(
    (section) => section.heading?.level === 1 && !section.excluded,
  );
  const prioritizedHeadingSections = [
    ...(titleSection ? [titleSection] : []),
    ...selectedSections.filter((section) => section.heading),
  ];
  const headingSelection = [];
  const seenHeadingSections = new Set();
  for (const section of prioritizedHeadingSections) {
    if (seenHeadingSections.has(section)) continue;
    seenHeadingSections.add(section);
    headingSelection.push(section);
  }
  const headings = headingSelection
    .slice(0, SEMANTIC_EVIDENCE_MAX_HEADINGS)
    .sort((a, b) => a.lineIndex - b.lineIndex)
    .map((section) => section.heading.value);

  return headings;
}

function truncateSemanticExcerptAtBoundary(text, maxLength) {
  if (text.length <= maxLength) return text;
  if (maxLength <= 0) return '';
  const sentence = [...text.matchAll(/[.!?]+(?=\s|$)/g)]
    .findLast((match) => match.index + match[0].length <= maxLength);
  if (sentence) {
    return text.slice(0, sentence.index + sentence[0].length).trimEnd();
  }
  const bounded = text.slice(0, maxLength);
  const lastWordBoundary = bounded.lastIndexOf(' ');
  return (lastWordBoundary > 0 ? bounded.slice(0, lastWordBoundary) : bounded).trimEnd();
}

function normalizeSemanticHeading(value) {
  return cleanHeadingLabel(value)
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExcludedSemanticSection(value) {
  const heading = normalizeSemanticHeading(value);
  return (
    /\b(?:sponsors?|sponsorship|backers?|funding|fundraisers?|donations?|donate)\b/i.test(
      heading,
    ) || /^(?:table of contents|contents?|toc)$/i.test(heading)
  );
}

function isDecorativeSemanticLine(value) {
  const line = String(value)
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .trim();
  if (!line) return true;
  if (/^(?:featured\s+)?(?:sponsors?|backers?|funding|donations?|donate)\b/i.test(line)) {
    return true;
  }
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(line)) return true;
  const remaining = line
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!?\[[^\]]*\]\[[^\]]*\]/g, '')
    .replace(/<a\b[^>]*>.*?<\/a>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[|]/g, '')
    .replace(/[`*_~]/g, '')
    .trim();
  return remaining.length === 0;
}

function semanticSectionPriority(section) {
  return {
    purpose: 3,
    architecture: 2,
    ability: 1,
  }[semanticSectionCategory(section)] ?? 0;
}

function semanticSectionCategory(section) {
  const namedCategory = semanticHeadingCategory(section.heading?.value ?? '');
  if (namedCategory) return namedCategory;
  const heading = normalizeSemanticHeading(section.heading?.value ?? '');
  if (!heading || section.isDocumentTitle) return 'purpose';
  return null;
}

function semanticSectionHasNamedCategory(section) {
  return Boolean(section.heading && semanticHeadingCategory(section.heading.value));
}

function semanticHeadingCategory(value) {
  const heading = normalizeSemanticHeading(value);
  if (
    /\b(?:purpose|mission|vision|introduction|overview|about|user need|product goal|problem statement)\b/i.test(
      heading,
    )
  ) {
    return 'purpose';
  }
  if (
    /\b(?:architecture|responsibilit(?:y|ies)|design|structure|how it works|system map|workflow|boundar(?:y|ies))\b/i.test(
      heading,
    )
  ) {
    return 'architecture';
  }
  if (
    /\b(?:features?|capabilit(?:y|ies)|functionality|use cases?|what it does|supported)\b/i.test(
      heading,
    )
  ) {
    return 'ability';
  }
  return null;
}
