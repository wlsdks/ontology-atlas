export function extractRustFeatureAttributes(text) {
  const rows = [];
  let index = 0;
  let line = 1;
  while (index < text.length) {
    if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index + 2);
      if (end === -1) break;
      index = end;
      continue;
    }
    if (text.startsWith('/*', index)) {
      const consumed = consumeBlockComment(text, index);
      line += countNewlines(text.slice(index, consumed));
      index = consumed;
      continue;
    }
    const rawEnd = consumeRawString(text, index);
    if (rawEnd !== null) {
      line += countNewlines(text.slice(index, rawEnd));
      index = rawEnd;
      continue;
    }
    if (text[index] === '"') {
      const consumed = consumeQuoted(text, index, '"');
      line += countNewlines(text.slice(index, consumed));
      index = consumed;
      continue;
    }
    if (text.startsWith('#[', index) || text.startsWith('#![', index)) {
      const captured = captureAttribute(text, index);
      if (captured) {
        const parsed = parseFeatureAttribute(captured.text, line);
        if (parsed) rows.push(parsed);
        line += countNewlines(captured.text);
        index = captured.end;
        continue;
      }
    }
    if (text[index] === '\n') line += 1;
    index += 1;
  }
  return rows;
}

function captureAttribute(text, start) {
  let depth = 0;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text.startsWith('//', index)) {
      const end = text.indexOf('\n', index + 2);
      if (end === -1) return null;
      index = end;
      continue;
    }
    if (text.startsWith('/*', index)) {
      index = consumeBlockComment(text, index) - 1;
      continue;
    }
    const rawEnd = consumeRawString(text, index);
    if (rawEnd !== null) {
      index = rawEnd - 1;
      continue;
    }
    if (text[index] === '"') {
      index = consumeQuoted(text, index, '"') - 1;
      continue;
    }
    if (text[index] === '[') depth += 1;
    if (text[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        return { text: text.slice(start, index + 1), end: index + 1 };
      }
    }
  }
  return null;
}

function parseFeatureAttribute(attribute, line) {
  const match = attribute.match(/^#!?\[\s*(cfg|cfg_attr)\s*\(/s);
  if (!match) return null;
  const form = match[1];
  const open = attribute.indexOf('(', match.index ?? 0);
  const close = findMatchingParen(attribute, open);
  if (close === -1) return null;
  const body = attribute.slice(open + 1, close);
  const predicate = form === 'cfg_attr' ? splitTopLevel(body)[0] ?? '' : body;
  const normalized = predicate.replace(/\s+/g, ' ').trim();
  const features = [...normalized.matchAll(/\bfeature\s*=\s*"([^"\\\r\n]+)"/g)]
    .map((featureMatch) => featureMatch[1]);
  if (features.length === 0) {
    return /\bfeature\s*=/.test(normalized)
      ? {
          line,
          form,
          predicate: normalized,
          polarity: 'unknown',
          features: [],
          unsupportedReason: 'non-literal-feature-name',
        }
      : null;
  }
  const exactPositive = normalized.match(/^feature\s*=\s*"([^"\\\r\n]+)"$/);
  const exactNegative = normalized.match(
    /^not\s*\(\s*feature\s*=\s*"([^"\\\r\n]+)"\s*\)$/,
  );
  return {
    line,
    form,
    predicate: normalized,
    polarity: exactPositive ? 'positive' : exactNegative ? 'negative' : 'compound',
    features: [...new Set(features)],
    unsupportedReason: null,
  };
}

function findMatchingParen(value, open) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')' && --depth === 0) return index;
  }
  return -1;
}

function splitTopLevel(value) {
  const rows = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote === '"') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (quote) continue;
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      rows.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  rows.push(value.slice(start).trim());
  return rows;
}

function consumeBlockComment(text, start) {
  let depth = 1;
  let index = start + 2;
  while (index < text.length && depth > 0) {
    if (text.startsWith('/*', index)) {
      depth += 1;
      index += 2;
    } else if (text.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
    } else {
      index += 1;
    }
  }
  return index;
}

function consumeRawString(text, start) {
  const match = text.slice(start).match(/^(?:br|r)(#*)"/);
  if (!match) return null;
  const terminator = `"${match[1]}`;
  const end = text.indexOf(terminator, start + match[0].length);
  return end === -1 ? text.length : end + terminator.length;
}

function consumeQuoted(text, start, quote) {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (text[index] === '\\') {
      escaped = true;
      continue;
    }
    if (text[index] === quote) return index + 1;
  }
  return text.length;
}

function countNewlines(value) {
  return (value.match(/\n/g) ?? []).length;
}
