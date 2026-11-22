const XML_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** `&amp;` and friends, plus numeric references, back to characters. */
export function decodeXmlText(text: string): string {
  return String(text).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

/** The character data of every `<tag>` element in order, tags themselves dropped. */
export function textOf(xml: string): string {
  return decodeXmlText(xml.replace(/<[^<>]*>/g, ''));
}

/* One-pass index scans: a lazy `<a>[\s\S]*?</a>` rescans from every unclosed tag. */
function tagStart(xml: string, name: string, from: number): number {
  let at = xml.indexOf(`<${name}`, from);
  while (at >= 0 && /\w/.test(xml[at + name.length + 1] ?? '')) at = xml.indexOf(`<${name}`, at + 1);
  return at;
}

export function elementSpans(xml: string, name: string): string[] {
  const close = `</${name}>`;
  const spans: string[] = [];
  for (let from = 0; ; ) {
    const start = tagStart(xml, name, from);
    const end = start < 0 ? -1 : xml.indexOf(close, start);
    if (end < 0) return spans;
    spans.push(xml.slice(start, end + close.length));
    from = end + close.length;
  }
}

export function between(xml: string, open: string, close: string): string[] {
  const found: string[] = [];
  for (let from = 0; ; ) {
    const start = xml.indexOf(open, from);
    const end = start < 0 ? -1 : xml.indexOf(close, start + open.length);
    if (end < 0) return found;
    found.push(xml.slice(start + open.length, end));
    from = end + close.length;
  }
}

export function openTags(xml: string, name: string): string[] {
  const tags: string[] = [];
  for (let from = 0; ; ) {
    const start = tagStart(xml, name, from);
    const end = start < 0 ? -1 : xml.indexOf('>', start);
    if (end < 0) return tags;
    tags.push(xml.slice(start, end));
    from = end + 1;
  }
}

export function attributePair(tag: string, first: string, second: string): [string, string] | null {
  const head = new RegExp(`\\b${first}="([^"]*)"`).exec(tag);
  const tail = head && new RegExp(`\\b${second}="([^"]+)"`).exec(tag.slice(head.index + head[0].length));
  return head && tail ? [head[1] ?? '', tail[1] ?? ''] : null;
}

export function sheetRows(xml: string): { number: string; body: string }[] {
  const rows: { number: string; body: string }[] = [];
  for (let from = 0; ; ) {
    const start = tagStart(xml, 'row', from);
    const tagEnd = start < 0 ? -1 : xml.indexOf('>', start);
    if (tagEnd < 0) return rows;
    const number = /\br="(\d+)"/.exec(xml.slice(start, tagEnd))?.[1];
    const close = number === undefined ? tagEnd : xml.indexOf('</row>', tagEnd + 1);
    if (close < 0) return rows;
    if (number !== undefined) rows.push({ number, body: xml.slice(tagEnd + 1, close) });
    from = number === undefined ? tagEnd + 1 : close + '</row>'.length;
  }
}

export function rowCells(xml: string): { attrs: string; body: string }[] {
  const cells: { attrs: string; body: string }[] = [];
  let closeMayFollow = true;
  for (let from = 0; ; ) {
    const start = tagStart(xml, 'c', from);
    const tagEnd = start < 0 ? -1 : xml.indexOf('>', start);
    if (tagEnd < 0) return cells;
    const attrs = xml.slice(start + 2, tagEnd);
    const close = closeMayFollow ? xml.indexOf('</c>', tagEnd + 1) : -1;
    if (close >= 0) {
      cells.push({ attrs, body: xml.slice(tagEnd + 1, close) });
      from = close + '</c>'.length;
      continue;
    }
    closeMayFollow = false;
    if (attrs.endsWith('/')) cells.push({ attrs: attrs.slice(0, -1), body: '' });
    from = tagEnd + 1;
  }
}

export function withoutElements(html: string, name: string): string {
  const open = new RegExp(`<${name}\\b`, 'gi');
  const close = new RegExp(`</${name}>`, 'gi');
  let kept = '';
  for (let from = 0; ; ) {
    open.lastIndex = from;
    const start = open.exec(html);
    if (start) close.lastIndex = start.index;
    const end = start && close.exec(html);
    if (!start || !end) return kept + html.slice(from);
    kept += html.slice(from, start.index);
    from = end.index + end[0].length;
  }
}
