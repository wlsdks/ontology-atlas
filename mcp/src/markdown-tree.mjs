import MarkdownIt from 'markdown-it';

const LINE_FEED = 10;
const SPACE = 32;
const TAB = 9;
const BACKTICK = 96;

// The preset's nesting limit (20) keeps each bracket's look-ahead bounded;
// deeper containers and inline spans are not descended into.
const parser = new MarkdownIt('commonmark', { html: true });

function trailingSpaceCount(text, end) {
  let index = end;
  while (index > 0 && (text.charCodeAt(index - 1) === SPACE || text.charCodeAt(index - 1) === TAB)) index--;
  return end - index;
}

// When a block closes, its first line's container prefix is still applied, so
// bMarks + tShift is where the block's own content starts on that line.
const BlockState = parser.block.State;
parser.block.State = class extends BlockState {
  push(type, tag, nesting) {
    const token = super.push(type, tag, nesting);
    this.openTokens ??= [];
    if (nesting === 1) this.openTokens.push(token);
    if (nesting === -1) {
      const open = this.openTokens.pop();
      const line = open.map[0];
      open.contentStart = this.bMarks[line] + this.tShift[line];
    }
    return token;
  }
};

// mdast drops every space and tab before a line ending, and a tab among them
// makes the break soft; markdown-it trims only spaces.
function lineEndingBreak(state) {
  const trailing = trailingSpaceCount(state.src, state.pos);
  const hasTab = state.src.slice(state.pos - trailing, state.pos).includes('\t');
  state.pending = state.pending.slice(0, state.pending.length - trailingSpaceCount(state.pending, state.pending.length));
  return trailing >= 2 && !hasTab ? 'hardbreak' : 'softbreak';
}

const InlineState = parser.inline.State;
parser.inline.State = class extends InlineState {
  push(type, tag, nesting) {
    const isLineEnding = (type === 'softbreak' || type === 'hardbreak') && this.src.charCodeAt(this.pos) === LINE_FEED;
    const token = super.push(isLineEnding ? lineEndingBreak(this) : type, tag, nesting);
    token.contentOffset = this.pos;
    return token;
  }
};

function lineStarts(text) {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) starts.push(index + 1);
  return starts;
}

function sourceLines(source) {
  const normalized = source.replace(/\r\n?/g, '\n');
  const starts = lineStarts(normalized);
  const hasCarriageReturn = source.includes('\r');
  const originalStarts = hasCarriageReturn
    ? [0, ...Array.from(source.matchAll(/\r\n?|\n/g), (match) => match.index + match[0].length)]
    : starts;
  const lineEnd = (line) => (line + 1 < starts.length ? starts[line + 1] - 1 : normalized.length);
  const original = (line, offset) => originalStarts[line] + offset - starts[line];
  return {
    normalized,
    hasCarriageReturn,
    lineEnd,
    original,
    lineBreak: (line) => (hasCarriageReturn ? source.slice(original(line, lineEnd(line)), originalStarts[line + 1]) : '\n'),
  };
}

// markdown-it hands inline rules the block's content with each line's container
// prefix removed, so a content offset is found from the end of its source line.
// Offsets must be asked for in increasing order.
function inlineLocator(inline, open, lines) {
  const [firstLine] = inline.map;
  if (open.markup?.[0] === '#') {
    const start = lines.normalized.indexOf(inline.content, open.contentStart + open.markup.length);
    return (offset) => ({ line: firstLine, offset: start + offset });
  }
  const segments = inline.content.split('\n');
  const lastLine = firstLine + segments.length - 1;
  const lastEnd = lines.lineEnd(lastLine) - trailingSpaceCount(lines.normalized, lines.lineEnd(lastLine));
  let segment = 0;
  let segmentStart = 0;
  return (offset) => {
    while (segment < segments.length - 1 && offset > segmentStart + segments[segment].length) {
      segmentStart += segments[segment].length + 1;
      segment++;
    }
    const line = firstLine + segment;
    const end = line === lastLine ? lastEnd : lines.lineEnd(line);
    return { line, offset: end - (segmentStart + segments[segment].length - offset) };
  };
}

function codeSpanValue(token, content, locate, lines) {
  const opener = token.markup.length;
  let start = token.contentOffset + opener;
  let close = start;
  for (;;) {
    close = content.indexOf('`', close);
    let runEnd = close + 1;
    while (content.charCodeAt(runEnd) === BACKTICK) runEnd++;
    if (runEnd - close === opener) break;
    close = runEnd;
  }
  let end = close;
  const padding = (index) => content[index] === ' ' || content[index] === '\n';
  if (padding(start) && padding(end - 1) && /[^ \n]/.test(content.slice(start, end))) {
    start++;
    end--;
  }
  const raw = content.slice(start, end);
  if (!lines.hasCarriageReturn || !raw.includes('\n')) return raw;
  let value = '';
  let from = 0;
  for (let index = raw.indexOf('\n'); index !== -1; index = raw.indexOf('\n', from)) {
    value += raw.slice(from, index) + lines.lineBreak(locate(start + index).line);
    from = index + 1;
  }
  return value + raw.slice(from);
}

function appendText(parent, value) {
  const last = parent.children.at(-1);
  if (last?.type === 'text') last.value += value;
  else if (value) parent.children.push({ type: 'text', value });
}

const INLINE_PARENT = { em_open: 'emphasis', strong_open: 'strong', link_open: 'link' };

function inlineTree(inline, open, lines) {
  const locate = inlineLocator(inline, open, lines);
  const root = { children: [] };
  const stack = [root];
  for (const token of inline.children) {
    const parent = stack.at(-1);
    if (token.type === 'text') appendText(parent, token.content);
    else if (token.type === 'softbreak') appendText(parent, lines.lineBreak(locate(token.contentOffset).line));
    else if (token.type === 'hardbreak') parent.children.push({ type: 'break' });
    else if (token.type === 'code_inline') parent.children.push({ type: 'inlineCode', value: codeSpanValue(token, inline.content, locate, lines) });
    else if (token.type === 'image') parent.children.push({ type: 'image' });
    else if (token.type === 'html_inline') {
      const start = locate(token.contentOffset);
      const last = locate(token.contentOffset + token.content.length - 1);
      parent.children.push({
        type: 'html',
        position: {
          start: { offset: lines.original(start.line, start.offset) },
          end: { offset: lines.original(last.line, last.offset) + 1 },
        },
      });
    } else if (INLINE_PARENT[token.type]) {
      const node = { type: INLINE_PARENT[token.type], children: [] };
      parent.children.push(node);
      stack.push(node);
    } else if (token.nesting === -1) stack.pop();
  }
  return root.children;
}

function blockPosition(open, lines) {
  const firstLine = open.map[0];
  const lastLine = open.map[1] - 1;
  return {
    start: { line: firstLine + 1, offset: lines.original(firstLine, open.contentStart) },
    end: { offset: lines.original(lastLine, lines.lineEnd(lastLine)) },
  };
}

const CONTAINER = {
  bullet_list_open: () => ({ type: 'list', ordered: false, children: [] }),
  ordered_list_open: () => ({ type: 'list', ordered: true, children: [] }),
  blockquote_open: () => ({ type: 'blockquote', children: [] }),
};

/**
 * Parses CommonMark into the part of an mdast tree the survey and the vault
 * readers walk, with mdast's types, text values and source offsets. Link
 * definitions are not nodes; inline HTML carries only its position.
 * Linear in the source: markdown-it is, and the tree is one pass over its tokens.
 */
export function markdownTree(source) {
  const lines = sourceLines(source);
  const tokens = parser.parse(lines.normalized, {});
  const root = { type: 'root', children: [] };
  const stack = [root];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const parent = stack.at(-1);
    if (token.type === 'paragraph_open' || token.type === 'heading_open') {
      const node = token.type === 'heading_open'
        ? { type: 'heading', depth: Number(token.tag.slice(1)) }
        : { type: 'paragraph' };
      node.position = blockPosition(token, lines);
      node.children = inlineTree(tokens[index + 1], token, lines);
      parent.children.push(node);
      index += 2;
    } else if (token.type === 'list_item_open') {
      const node = { type: 'listItem', children: [], position: { start: { offset: lines.original(token.map[0], token.contentStart) } } };
      parent.children.push(node);
      stack.push(node);
    } else if (CONTAINER[token.type]) {
      const node = CONTAINER[token.type]();
      parent.children.push(node);
      stack.push(node);
    } else if (token.nesting === -1) {
      stack.pop();
    } else if (token.type === 'html_block') {
      parent.children.push({ type: 'html', value: token.content.replace(/\n$/, ''), position: { start: { line: token.map[0] + 1 } } });
    } else if (token.type === 'fence' || token.type === 'code_block') {
      parent.children.push({ type: 'code' });
    } else if (token.type === 'hr') {
      parent.children.push({ type: 'thematicBreak' });
    }
  }
  return root;
}
