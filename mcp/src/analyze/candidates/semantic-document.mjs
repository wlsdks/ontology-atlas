import { authoredMarkdownLines } from './authored-markdown.mjs';
import { SEMANTIC_EVIDENCE_MAX_HEADINGS } from '../analysis-limits-and-tables.mjs';
import { headingLevelForAdornment, isHeadingAdornment } from '../text.mjs';
import {
  HOSTILE_SEMANTIC_RISK_FLAGS,
  POLICY_SEMANTIC_RISK_FLAGS,
  scanSemanticEvidenceRisks,
} from './semantic-risk.mjs';
import {
  semanticSectionTextRows,
  buildSemanticExcerptSelection,
  visibleSemanticProseRows,
  semanticHeadingSelection,
  isExcludedSemanticSection,
  isDecorativeSemanticLine,
  semanticSectionPriority,
  semanticSectionCategory,
  semanticSectionHasNamedCategory,
} from './semantic-excerpt.mjs';

const SEMANTIC_REVIEW_REQUIRED_MAX_ITEMS = 4;
const SEMANTIC_REVIEW_REQUIRED_MAX_EXCERPT = 400;
const SEMANTIC_REVIEW_REQUIRED_MAX_TOTAL_EXCERPT = 800;

export function classifySemanticEvidencePath(source) {
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

export function semanticContentScore({ title, headings, excerpt }) {
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

const SEMANTIC_LINE_LIMIT = 2000;

export function extractSemanticDocument(text, source) {
  // A line is read up to its first 2,000 characters, so the per-line patterns below stay cheap on any file.
  const lines = (/\.rst$/i.test(source) ? text.split(/\r\n|\r|\n/) : authoredMarkdownLines(text))
    .map((line) => (line.length > SEMANTIC_LINE_LIMIT ? line.slice(0, SEMANTIC_LINE_LIMIT) : line));
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
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
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
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
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
  const completeSelection = buildSemanticExcerptSelection(completeSectionTextRows);
  const completeExcerpt = completeSelection.excerpt;
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
      firstOmittedLine: completeSelection.firstOmittedLine,
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
        firstOmittedLine: safeSelection.firstOmittedLine,
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
    firstOmittedLine: completeSelection.firstOmittedLine,
  };
}
