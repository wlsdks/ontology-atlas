import { markdownTree } from '../markdown-tree.mjs';

// O(n) AST walks exclude literal and quoted blocks from reviewed evidence.
function paragraphs(nodes) {
  const result = [];
  const pending = [...nodes].reverse();
  while (pending.length) {
    const node = pending.pop();
    if (node.type === 'paragraph') result.push(node);
    else if (node.type === 'list' || node.type === 'listItem') {
      for (let index = node.children.length - 1; index >= 0; index--) pending.push(node.children[index]);
    }
  }
  return result;
}

function inlineLeaves(nodes) {
  const result = [];
  const pending = [...nodes].reverse();
  while (pending.length) {
    const node = pending.pop();
    if (['text', 'inlineCode', 'break'].includes(node.type)) result.push(node);
    else if (['emphasis', 'strong', 'link', 'linkReference'].includes(node.type)) {
      for (let index = node.children.length - 1; index >= 0; index--) pending.push(node.children[index]);
    }
  }
  return result;
}

function inlineText(nodes) {
  return inlineLeaves(nodes).map((node) => node.type === 'break' ? '\n' : node.value).join('');
}

function authoredSections(body) {
  const source = typeof body === 'string' ? body : '';
  const blocks = markdownTree(source).children;
  const sections = new Map();
  const spans = new Map();
  let active = null;
  let span = null;
  for (const node of blocks) {
    if (node.type === 'heading' && node.depth <= 2) {
      if (span) span.end = node.position.start.offset;
      const name = inlineText(node.children).normalize('NFKC').trim().toLowerCase();
      active = node.depth === 2 && !sections.has(name) ? [] : null;
      span = active ? { start: node.position.end.offset, end: source.length } : null;
      if (active) {
        sections.set(name, active);
        spans.set(name, span);
      }
    } else if (active) {
      active.push(node);
    }
  }
  return { source, blocks, sections, spans };
}

function prose(nodes) {
  return paragraphs(nodes).map((node) => inlineText(node.children)).filter(Boolean).join('\n');
}

export function readRecordedSection(body, heading) {
  const { source, spans } = authoredSections(body);
  const span = spans.get(String(heading).normalize('NFKC').trim().toLowerCase());
  return span ? source.slice(span.start, span.end).trim() : '';
}

function legacyBoundaries(nodes, source) {
  const result = { includes: [], excludes: [] };
  const pending = nodes.map((node) => ({ node, bucket: null, label: false })).reverse();
  while (pending.length) {
    const { node, bucket, label } = pending.pop();
    if (node.type === 'paragraph' && bucket) {
      const text = inlineText(node.children);
      result[bucket].push(label ? text.slice(text.indexOf(':') + 1).trim() : text);
    } else if (node.type === 'list' || node.type === 'listItem') {
      const first = node.type === 'listItem' && node.children[0]?.type === 'paragraph' ? node.children[0] : null;
      const line = first ? source.slice(node.position.start.offset, first.position.end.offset).split(/\r?\n/)[0] : '';
      const match = line.match(/^[-*]\s*(?:\*\*)?(Included|Includes|Inclusions?|Excluded|Excludes|Exclusions?)(?:\*\*)?\s*:/iu);
      const ownBucket = match ? (/^inc/iu.test(match[1]) ? 'includes' : 'excludes') : bucket;
      for (let index = node.children.length - 1; index >= 0; index--) {
        pending.push({ node: node.children[index], bucket: ownBucket, label: Boolean(match && index === 0) });
      }
    }
  }
  return result;
}

export function readCapabilityClaim(body) {
  const { source, blocks, sections } = authoredSections(body);
  const section = (name) => prose(sections.get(name) ?? []);
  const combined = sections.get('inclusions / exclusions') ?? sections.get('inclusions/exclusions') ?? [];
  const legacy = legacyBoundaries(combined, source);
  const structured = ['definition', 'includes', 'inclusions', 'excludes', 'exclusions', 'inclusions / exclusions', 'inclusions/exclusions']
    .some((name) => sections.has(name));
  const firstParagraph = blocks.find((node) => node.type === 'paragraph' && inlineText(node.children).trim());
  return {
    definition: section('definition'),
    includes: [section('includes') || section('inclusions'), ...legacy.includes].filter(Boolean).join('\n'),
    excludes: [section('excludes') || section('exclusions'), ...legacy.excludes].filter(Boolean).join('\n'),
    excerpt: !structured && firstParagraph ? inlineText(firstParagraph.children) : '',
  };
}

export function readReviewedEvidence(body) {
  const { source, sections } = authoredSections(body);
  const evidence = sections.get('evidence') ?? [];
  const fields = evidence.filter((node) => node.type === 'list' && !node.ordered)
    .flatMap((list) => list.children)
    .flatMap((item) => {
      const first = item.children[0];
      if (first?.type !== 'paragraph' || first.children[1]?.type !== 'inlineCode') return [];
      const line = source.slice(item.position.start.offset, first.position.end.offset).split(/\r?\n/)[0];
      return [{ line, code: first.children[1].value }];
    });
  return {
    fields,
    paths: paragraphs(evidence).flatMap((node) => inlineLeaves(node.children)
      .filter((leaf) => leaf.type === 'inlineCode').map((leaf) => leaf.value)),
    includes: prose(sections.get('includes') ?? []),
    excludes: prose(sections.get('excludes') ?? []),
  };
}
