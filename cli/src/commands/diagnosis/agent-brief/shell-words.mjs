

export function graphDbShellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:@-]+$/.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`;
}

export function splitShellWords(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (quote === "'" && input.slice(i, i + 4) === "'\\''") {
        current += "'";
        i += 3;
      } else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (quote) return [];
  if (current) tokens.push(current);
  return tokens;
}
