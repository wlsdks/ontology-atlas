import { fromMarkdown } from 'mdast-util-from-markdown';

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

export function readReviewedEvidence(body) {
  const source = typeof body === 'string' ? body : '';
  const sections = new Map();
  let active = null;
  for (const node of fromMarkdown(source).children) {
    if (node.type === 'heading' && node.depth <= 2) {
      const name = inlineText(node.children).trim().toLowerCase();
      active = node.depth === 2 && !sections.has(name) ? [] : null;
      if (active) sections.set(name, active);
    } else if (active) {
      active.push(node);
    }
  }
  const evidence = sections.get('evidence') ?? [];
  const fields = evidence.filter((node) => node.type === 'list' && !node.ordered)
    .flatMap((list) => list.children)
    .flatMap((item) => {
      const first = item.children[0];
      if (first?.type !== 'paragraph' || first.children[1]?.type !== 'inlineCode') return [];
      const line = source.slice(item.position.start.offset, first.position.end.offset).split(/\r?\n/)[0];
      return [{ line, code: first.children[1].value }];
    });
  const boundary = (name) => paragraphs(sections.get(name) ?? [])
    .map((node) => inlineText(node.children)).filter(Boolean).join('\n');
  return {
    fields,
    paths: paragraphs(evidence).flatMap((node) => inlineLeaves(node.children)
      .filter((leaf) => leaf.type === 'inlineCode').map((leaf) => leaf.value)),
    includes: boundary('includes'),
    excludes: boundary('excludes'),
  };
}
