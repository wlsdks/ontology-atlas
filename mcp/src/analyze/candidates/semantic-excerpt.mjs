import {
  SEMANTIC_EVIDENCE_MAX_EXCERPT,
  SEMANTIC_EVIDENCE_MAX_HEADINGS,
} from '../analysis-limits-and-tables.mjs';
import { cleanHeadingLabel } from '../text.mjs';

export function semanticSectionTextRows(sections) {
  return sections.map((section) => ({
    section,
    text: section.prose.map((row) => row.text).join(' '),
  }));
}

export function buildSemanticExcerptSelection(sectionTextRows) {
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

  const returnedBySection = new Map(sectionSelections.map(({ section, text }) => [section, text.length]));
  let firstOmittedLine = null;
  for (const { section, text } of sectionTextRows) {
    const returned = returnedBySection.get(section) ?? 0;
    if (returned >= text.length) continue;
    let offset = 0;
    for (const row of section.prose) {
      if (offset + row.text.length > returned) {
        const line = row.lineIndex + 1;
        firstOmittedLine = firstOmittedLine === null ? line : Math.min(firstOmittedLine, line);
        break;
      }
      offset += row.text.length + 1;
    }
  }
  return { excerpt, sectionSelections, firstOmittedLine };
}

export function visibleSemanticProseRows(section, selectedText) {
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

export function semanticHeadingSelection(allSections, selectedSections, selectedTitleOnly = false) {
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

export function isExcludedSemanticSection(value) {
  const heading = normalizeSemanticHeading(value);
  return (
    /\b(?:sponsors?|sponsorship|backers?|funding|fundraisers?|donations?|donate)\b/i.test(
      heading,
    ) || /^(?:table of contents|contents?|toc)$/i.test(heading)
  );
}

export function isDecorativeSemanticLine(value) {
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

export function semanticSectionPriority(section) {
  return {
    purpose: 3,
    architecture: 2,
    ability: 1,
  }[semanticSectionCategory(section)] ?? 0;
}

export function semanticSectionCategory(section) {
  const namedCategory = semanticHeadingCategory(section.heading?.value ?? '');
  if (namedCategory) return namedCategory;
  const heading = normalizeSemanticHeading(section.heading?.value ?? '');
  if (!heading || section.isDocumentTitle) return 'purpose';
  return null;
}

export function semanticSectionHasNamedCategory(section) {
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
