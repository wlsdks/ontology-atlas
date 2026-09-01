// Lightweight frontmatter parser — supports only the `---\n...\n---\n` block.
// Recognises all of the following without a gray-matter dependency:
//   key: value                          (scalar)
//   key: [a, b]                         (inline list)
//   key: { x: 1, y: 2 }                 (inline object)
//   key:\n  - item1\n  - item2          (block list)
//   key:\n  child: 1\n  other: 2        (block object)
//
// Behaves identically to src/shared/lib/parse-frontmatter.ts. Unified as an ESM
// module so the build script and the runtime cannot drift apart.

const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assignParsedKey(target, key, value, diagnostics, line) {
  if (UNSAFE_OBJECT_KEYS.has(key)) {
    diagnostics.push({
      code: "malformed-frontmatter-line",
      line,
      message: `Frontmatter line ${line} uses unsafe object key \`${key}\`.`,
    });
    return false;
  }
  target[key] = value;
  return true;
}

export function parseFrontmatter(input) {
  // Newline and encoding normalisation — **on the read path only** (measured
  // 2026-07-28).
  //
  // CRLF: splitting on `\n` leaves a `\r` at the end of every line, and the block
  // list regex's `.` does not match `\r` while `$` only matches end-of-string →
  // no match → the list comes back empty. Scalars survive because `.trim()` rescues
  // them, so the symptom appears as **"the nodes are there but every relation
  // vanished"**, with 0 warnings.
  //
  // BOM: `raw.startsWith('---')` is false for `\uFEFF---` → the whole frontmatter
  // block falls through into the body and `kind:` disappears, so **the document
  // vanishes from the graph as a node entirely**.
  //
  // Both are produced by the default editor of a population `surfaces.md` records as
  // explicitly supported (Windows Chromium). The 4-way contract test only guarantees
  // the four parsers *agree*, and it was passing because **all four were wrong in the
  // same way.**
  const raw = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter = {};
  const diagnostics = [];
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx === -1) {
      const trimmed = line.trim();
      if (/^\s+-\s+/.test(line)) {
        diagnostics.push({
          code: "malformed-frontmatter-line",
          line: i + 2,
          message: `Frontmatter list item on line ${i + 2} has no parent key.`,
        });
      } else if (trimmed && !trimmed.startsWith("#")) {
        diagnostics.push({
          code: "malformed-frontmatter-line",
          line: i + 2,
          message: `Frontmatter line ${i + 2} must use key: value syntax.`,
        });
      }
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    // **Check for a block scalar before judging the value.** The value of
    // `definition: |` is `"|"`, not an empty string, so putting this inside the
    // empty-value branch would make it unreachable.
    const scalarIndicator = /^[|>][-+]?$/.exec(value);
    if (scalarIndicator) {
      const read = readBlockScalar(lines, i + 1, scalarIndicator[0]);
      assignParsedKey(frontmatter, key, read.value, diagnostics, i + 2);
      i = read.next - 1;
      continue;
    }
    if (value === "") {

      const lookahead = peekIndentedKind(lines, i + 1);
      if (lookahead === "list") {
        const items = [];
        let j = i + 1;
        while (j < lines.length) {
          const dashMatch = lines[j].match(/^\s*-\s+(.+)$/);
          if (!dashMatch) break;
          items.push(unquote(dashMatch[1].trim()));
          j += 1;
        }
        assignParsedKey(frontmatter, key, items, diagnostics, i + 2);
        i = j - 1;
        continue;
      }
      if (lookahead === "object") {
        const obj = {};
        let j = i + 1;
        while (j < lines.length) {
          const m = lines[j].match(/^(\s+)([^\s:][^:]*):\s*(.*)$/);
          if (!m) break;
          const childKey = m[2].trim();
          if (!childKey) break;
          assignParsedKey(obj, childKey, parseScalar(m[3].trim()), diagnostics, j + 2);
          j += 1;
        }
        assignParsedKey(frontmatter, key, obj, diagnostics, i + 2);
        i = j - 1;
        continue;
      }
      assignParsedKey(frontmatter, key, "", diagnostics, i + 2);
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = splitTopLevel(value.slice(1, -1), ",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      assignParsedKey(frontmatter, key, items, diagnostics, i + 2);
      continue;
    }
    if (value.startsWith("{") && value.endsWith("}")) {
      const inner = value.slice(1, -1).trim();
      const obj = {};
      if (inner) {
        for (const part of splitTopLevel(inner, ",")) {
          const cIdx = part.indexOf(":");
          if (cIdx === -1) continue;
          const k = part.slice(0, cIdx).trim();
          const v = part.slice(cIdx + 1).trim();
          if (!k) continue;
          assignParsedKey(obj, k, parseScalar(v), diagnostics, i + 2);
        }
      }
      assignParsedKey(frontmatter, key, obj, diagnostics, i + 2);
      continue;
    }
    pushQuotedScalarDiagnostic(diagnostics, key, i + 2, value);
    assignParsedKey(frontmatter, key, parseTopLevelScalar(value), diagnostics, i + 2);
  }
  const result = { frontmatter, body };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}

/**
 * Reports a scalar that **opens a quote the value never closes as its last
 * character** — `display_ko: "Agents" destination`, found in this repository's own
 * vault on 2026-08-31.
 *
 * `unquote` strips a wrapping pair only when the first and last characters are
 * the same quote, so a value that opens a quote it never closes falls through to
 * its lenient tail, which
 * removes the opening quote and keeps the rest verbatim, so every reader renders
 * `Agents" destination`. Nothing else noticed: the key parses, the node loads, and
 * `validate` answered `0 issues` while the map, the lists and the app title all
 * showed the broken text.
 *
 * Top-level scalars only. Inline list and object members reach `unquote` through
 * the quote-aware `splitTopLevel`, and a block scalar carries no quoting at all.
 *
 * @param {string} value raw text after `key:`
 * @returns {"trailing" | "unterminated" | null}
 */
function quotedScalarFault(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'") return null;
  // **Match the renderer, not YAML.** `unquote` strips a wrapping pair whenever
  // the last character is the same quote, so `'Owner's guide'` and
  // `"He said "hi" today"` render exactly as written. Only a value that never
  // closes is a fault; anything else would fail a vault that reads correctly.
  if (closesWithQuote(trimmed, quote)) return null;
  for (let i = 1; i < trimmed.length; i += 1) {
    // The same escape rule `unquote` reverses, so a `\\"` is not a closer.
    if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
      i += 1;
      continue;
    }
    if (trimmed[i] === quote) return "trailing";
  }
  return "unterminated";
}

/** Whether the last character closes the opening quote rather than being escaped. */
function closesWithQuote(trimmed, quote) {
  if (trimmed.length < 2 || trimmed[trimmed.length - 1] !== quote) return false;
  let backslashes = 0;
  for (let i = trimmed.length - 2; i >= 0 && trimmed[i] === '\\'; i -= 1) backslashes += 1;
  return backslashes % 2 === 0;
}

function pushQuotedScalarDiagnostic(diagnostics, key, line, value) {
  const fault = quotedScalarFault(value);
  if (!fault) return;
  const trimmed = value.trim();
  const suggestion = trimmed.split(trimmed[0]).join("").replace(/\s+/g, " ").trim();
  const fix = suggestion ? `: \`${key}: ${suggestion}\`` : "";
  diagnostics.push({
    code: "malformed-quoted-scalar",
    line,
    message:
      `Frontmatter line ${line} \`${key}:\` ` +
      (fault === "trailing"
        ? "closes its quote before the end of the value, so the rest is read as literal text"
        : "opens a quote the value never closes, so the quote is read as literal text") +
      `. Close the quote or remove it${fix}`,
  });
}

function peekIndentedKind(lines, start) {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s*-\s+/.test(next)) return "list";
  if (/^\s+[^\s:][^:]*:\s*\S?/.test(next)) return "object";
  return null;
}

function parseScalar(value) {
  const v = unquote(value);
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

/*
 * Top-level scalars are typed like nested ones (2026-09-01 review). The
 * serializer writes booleans and numbers unquoted, so reading them back as
 * strings inverted any consumer branching on the field after one round trip —
 * `draft: false` came back as the truthy string 'false', with the type
 * depending on nesting depth in the same file. A quoted scalar stays a string:
 * quoting is how an author forces text.
 */
function parseTopLevelScalar(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (
    (quote === '"' || quote === "'") &&
    trimmed.length >= 2 &&
    trimmed[trimmed.length - 1] === quote
  ) {
    return unquote(value);
  }
  return parseScalar(value);
}

function unquote(value) {
  const trimmed = value.trim();
  // Unescape **only** when stripping wrapping quotes. The serializer writes `"`
  // escaped, and not reversing it here adds a backslash layer on every save
  // (measured over 3 round trips: 1 → 2 → 4). An unquoted value is literal text
  // rather than escape syntax, so it is left alone.
  const quote = trimmed.length >= 2 ? trimmed[0] : "";
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const inner = trimmed.slice(1, -1).replace(new RegExp(`\\\\(${quote}|\\\\)`, "g"), "$1");
    // Inside double quotes, `\n`/`\t` are newlines and tabs the serializer folded.
    // Single quotes stay literal with no escapes, per YAML.
    return quote === '"' ? inner.replace(/\\n/g, "\n").replace(/\\t/g, "\t") : inner;
  }
  return value.replace(/^["']|["']$/g, "");
}

// Quote-aware separator splitting (fix measured 2026-07-28).
//
// This used to split inline lists and objects on every comma, so a comma inside a
// value split it and the tail of `labels: { ko: "map, search" }` silently vanished.
// A separator inside quotes is data, not a separator.
function splitTopLevel(input, separator) {
  const parts = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === "\\" && i + 1 < input.length) {
        current += ch + input[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/**
 * Consumes a block scalar (`|`, `>`, and their chomping variants) as the value.
 *
 * **Why it is needed (measured while dogfooding, 2026-07-29).** Without it the
 * indicator is stored as the value (`definition: "|"`) and the indented body lines
 * that follow spill into the top-level loop. That loop `.trim()`s keys, erasing the
 * indentation, so a line such as `kind: element` inside a description
 * **overwrote that node's kind** — a document changing its own type through its own
 * description, with 0 warnings.
 */
function readBlockScalar(lines, start, indicator) {
  const fold = indicator.startsWith('>');
  const chomp = indicator.includes('-') ? 'strip' : indicator.includes('+') ? 'keep' : 'clip';
  const collected = [];
  let j = start;
  let baseIndent = null;
  while (j < lines.length) {
    const line = lines[j];
    if (line.trim() === '') {
      collected.push('');
      j += 1;
      continue;
    }
    const indent = line.length - line.replace(/^\s+/, '').length;
    if (indent === 0) break;
    if (baseIndent === null) baseIndent = indent;
    if (indent < baseIndent) break;
    collected.push(line.slice(baseIndent));
    j += 1;
  }
  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
  let text;
  if (fold) {
    // Folded scalar: a blank line becomes a newline, consecutive lines join with one space.
    text = collected
      .reduce((acc, cur) => {
        if (cur === '') return acc.concat('');
        const last = acc[acc.length - 1];
        if (acc.length === 0 || last === '') return acc.concat(cur);
        acc[acc.length - 1] = `${last} ${cur}`;
        return acc;
      }, [])
      .join('\n');
  } else {
    text = collected.join('\n');
  }
  if (chomp === 'keep') text += '\n';
  return { value: text, next: j };
}
