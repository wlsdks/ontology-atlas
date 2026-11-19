import MarkdownIt from 'markdown-it';

const LINE_FEED = 10;
const SPACE = 32;
const TAB = 9;
const BACKTICK = 96;
const LESS_THAN = 60;
const EXCLAMATION = 33;
const QUESTION = 63;
const BYTE_ORDER_MARK = '\uFEFF';

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

// markdown-it's blockquote rule reads every lazy line that follows a quote, to
// the end of the container, before it parses the quote; a page of short quotes
// each followed by a lazy line costs quadratic time. The rule first runs with a
// bounded end. When the quote's parse stops before that end, it never read a line
// past it, so the result is the unbounded one; otherwise the attempt is undone,
// including the definitions it recorded, and the bound grows. Each quote
// remembers the largest bound it has reached, so an enclosing quote's retry does
// not repeat the probes of the quotes inside it.
const QUOTE_FIRST_SPAN = 4;
const QUOTE_SPAN_GROWTH = 4;
const quoteRule = parser.block.ruler.__rules__.find((rule) => rule.name === 'blockquote');
const unboundedQuote = quoteRule.fn;
function boundedQuote(state, startLine, endLine, silent) {
  if (silent) return unboundedQuote(state, startLine, endLine, true);
  state.quoteSpansReached ??= new Map();
  const quote = `${startLine}:${state.level}`;
  const tokenCount = state.tokens.length;
  const reached = state.quoteSpansReached.get(quote);
  for (let span = reached ? reached * QUOTE_SPAN_GROWTH : QUOTE_FIRST_SPAN; startLine + span < endLine; span *= QUOTE_SPAN_GROWTH) {
    const limit = startLine + span;
    const references = state.env.references;
    const attempt = Object.create(references ?? null);
    state.env.references = attempt;
    const matched = unboundedQuote(state, startLine, limit, false);
    state.env.references = references;
    if (!matched) return false;
    if (state.line < limit) {
      const added = Object.keys(attempt);
      if (added.length) {
        state.env.references ??= {};
        for (const label of added) state.env.references[label] = attempt[label];
      }
      return true;
    }
    state.tokens.length = tokenCount;
    state.quoteSpansReached.set(quote, span);
  }
  const matched = unboundedQuote(state, startLine, endLine, false);
  if (matched && state.line >= endLine) state.quoteSpansReached.set(quote, Math.max(reached ?? 0, endLine - startLine));
  return matched;
}
parser.block.ruler.at('blockquote', boundedQuote, { alt: quoteRule.alt });

// mdast drops every space and tab before a line ending, and a tab among them
// makes the break soft; markdown-it trims only spaces.
function lineEndingBreak(state) {
  const trailing = trailingSpaceCount(state.src, state.pos);
  const hasTab = state.src.slice(state.pos - trailing, state.pos).includes('\t');
  state.pending = state.pending.slice(0, state.pending.length - trailingSpaceCount(state.pending, state.pending.length));
  return trailing >= 2 && !hasTab ? 'hardbreak' : 'softbreak';
}

function isAsciiLetter(code) {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

// The first terminator at or after `start`, remembered per terminator so a run of
// openers that share one terminator, or have none, is scanned once.
function nextTerminator(state, terminator, start) {
  state.terminators ??= new Map();
  let known = state.terminators.get(terminator);
  if (!known || start < known.from || (known.at !== -1 && start > known.at)) {
    known = { from: start, at: state.src.indexOf(terminator, start) };
    state.terminators.set(terminator, known);
  }
  return known.at;
}

// Comments, processing instructions, CDATA and declarations. markdown-it stops
// recognising all four after one of them is left unterminated; mdast does not.
function specialHtml(state, silent) {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== LESS_THAN || pos + 2 >= state.posMax) return false;
  let start;
  let terminator;
  let end = -1;
  if (src.startsWith('<!-->', pos)) end = pos + 5;
  else if (src.startsWith('<!--->', pos)) end = pos + 6;
  else if (src.startsWith('<!--', pos)) [start, terminator] = [pos + 4, '-->'];
  else if (src.startsWith('<![CDATA[', pos)) [start, terminator] = [pos + 9, ']]>'];
  else if (src.charCodeAt(pos + 1) === QUESTION) [start, terminator] = [pos + 2, '?>'];
  else if (src.charCodeAt(pos + 1) === EXCLAMATION && isAsciiLetter(src.charCodeAt(pos + 2))) [start, terminator] = [pos + 3, '>'];
  else return false;
  if (terminator) {
    const at = nextTerminator(state, terminator, start);
    if (at === -1) return false;
    end = at + terminator.length;
  }
  if (!silent) state.push('html_inline', '', 0).content = src.slice(pos, end);
  state.pos = end;
  return true;
}
parser.inline.ruler.before('html_inline', 'html_special', specialHtml);

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

// A leading byte order mark is not text; offsets still count it, as callers slice
// the string they passed in.
function sourceLines(source) {
  const markLength = source.startsWith(BYTE_ORDER_MARK) ? 1 : 0;
  const text = source.slice(markLength);
  const normalized = text.replace(/\r\n?/g, '\n');
  const starts = lineStarts(normalized);
  const hasCarriageReturn = text.includes('\r');
  const textStarts = hasCarriageReturn
    ? [0, ...Array.from(text.matchAll(/\r\n?|\n/g), (match) => match.index + match[0].length)]
    : starts;
  const originalStarts = markLength ? textStarts.map((start) => start + markLength) : textStarts;
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
    let start = open.contentStart + open.markup.length;
    while (lines.normalized.charCodeAt(start) === SPACE || lines.normalized.charCodeAt(start) === TAB) start++;
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
