export function graphDbShellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

export function splitShellWords(input) {
  const tokens = [];
  let current = '';
  let hasToken = false;
  let quote = null;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      hasToken = true;
      continue;
    }
    if (character === '\\' && index + 1 < input.length) {
      index += 1;
      current += input[index];
      hasToken = true;
      continue;
    }
    if (/\s/.test(character)) {
      if (hasToken) tokens.push(current);
      current = '';
      hasToken = false;
      continue;
    }
    current += character;
    hasToken = true;
  }
  if (quote) return [];
  if (hasToken) tokens.push(current);
  return tokens;
}
