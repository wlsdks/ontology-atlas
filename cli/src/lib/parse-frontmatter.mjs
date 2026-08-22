// Lightweight frontmatter parser — only `---\n...\n---\n` blocks. Recognises
// all of these without a gray-matter dependency:
//   key: value                          (scalar)
//   key: [a, b]                         (inline list)
//   key: { x: 1, y: 2 }                 (inline object)
//   key:\n  - item1\n  - item2          (block list)
//   key:\n  child: 1\n  other: 2        (block object)
//
// Behaves identically to src/shared/lib/parse-frontmatter.ts. It is one ESM
// module so the two entry points (build script vs runtime) cannot drift apart.

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
  // Normalise line endings and encoding — **on the read path only** (measured
  // 2026-07-28).
  //
  // CRLF: splitting on `\n` leaves a trailing `\r` on every line. The block-list
  // regex's `.` does not match `\r` and `$` only sees end-of-string, so the match
  // fails and the list comes back empty. Scalars survive because `.trim()`
  // rescues them, so the symptom reads as **"the nodes are there but every
  // relation is gone"**, with zero warnings.
  //
  // BOM: `raw.startsWith('---')` is false for `\uFEFF---`, so the whole
  // frontmatter block falls into the body and `kind:` disappears — **the document
  // vanishes from the graph as a node**.
  //
  // Both are produced by the default editor of a population
  // `.claude/rules/surfaces.md` declares as supported (Windows Chromium). The
  // 4-way contract test only guarantees the four parsers *agree*, and it was
  // passing because **all four were wrong the same way**.
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
    assignParsedKey(frontmatter, key, unquote(value), diagnostics, i + 2);
  }
  const result = { frontmatter, body };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
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

function unquote(value) {
  const trimmed = value.trim();
  // Unescape **only** while stripping the wrapping quotes. The serializer escapes
  // `"`, and not reversing it here adds one backslash layer per save (measured
  // over 3 round trips: 1 → 2 → 4). An unquoted value is literal text, not escape
  // syntax, so it is left alone.
  const quote = trimmed.length >= 2 ? trimmed[0] : "";
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const inner = trimmed.slice(1, -1).replace(new RegExp(`\\\\(${quote}|\\\\)`, "g"), "$1");
    // `\n` inside double quotes is a newline — unfold what the writer folded.
    return quote === '"' ? inner.replace(/\\n/g, "\n").replace(/\\t/g, "\t") : inner;
  }
  return value.replace(/^["']|["']$/g, "");
}

// Quote-aware separator split (fixed 2026-07-28, measured).
//
// Inline lists and objects used to be split on every comma, including commas
// inside a value, so the tail of `labels: { ko: "지도, 검색" }` silently
// disappeared. A separator inside quotes is data, not a separator.
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


// Frontmatter writer — serializes values back to raw markdown.
// tests/contract/frontmatter-writer.contract.test.ts blocks serializeFrontmatter
// / buildMarkdown drift against mcp/src/parser.mjs.
// A null value deletes the key; undefined is skipped.

export function serializeFrontmatter(fm) {
  const lines = [];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.includes("\n")) {
      lines.push(serializeMultiline(key, value));
      continue;
    }
    lines.push(`${key}: ${serializeValue(value)}`);
  }
  return lines.join("\n");
}

function serializeValue(v) {
  if (Array.isArray(v)) {
    return `[${v
      .map((s) =>
        typeof s === "string" && needsQuote(s)
          ? `"${escapeQuoted(s)}"`
          : String(s),
      )
      .join(", ")}]`;
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const entries = Object.entries(v).map(
      ([k, val]) => `${k}: ${serializeValue(val)}`,
    );
    return `{ ${entries.join(", ")} }`;
  }
  return needsQuote(v) ? `"${escapeQuoted(v)}"` : v;
}

// Escaping inside quotes — the exact inverse of `unquote`.
//
// Backslashes are escaped first. Otherwise a `\\` inside a value loses one layer
// on read and the round trip never closes (back when only quotes were escaped,
// the quote side leaked the other way and backslashes doubled on every save).
/*
 * Does this value need quoting — **five places must give the same answer.**
 *
 * **Why the rule changed** (review 2026-08-16, reproduced): the newline was
 * missing. That one character destroys the whole frontmatter block. A value
 * inside an array or object has to fit on one line and so cannot use block
 * syntax; an unescaped newline there makes the following line read as a new key.
 * The place it actually broke was `relation_notes: { slug: why }`
 * (`add_relation`'s `why`).
 *
 * Single quotes joined the rule too. `unquote` strips unmatched quotes from both
 * ends, so a value like `'지도'` written unquoted reads back as `지도`.
 */
function needsQuote(s) {
  return /[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s);
}

/** Make text safe to carry inside quotes — newlines fold to `\n`. */
function escapeQuoted(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

// Builds markdown from a body plus frontmatter.
//
// Leading newlines in the body are stripped. The parser removes only the first
// newline after the closing `---\n`, so ordinary markdown input (one blank line
// between frontmatter and body) combined with the `---\n\n` written here
// regressed into two blank lines. Normalising here keeps `import` and `add`
// producing the same shape.
export function buildMarkdown({ frontmatter, body = "" }) {
  const fmBlock = serializeFrontmatter(frontmatter);
  const cleanBody = body ? body.replace(/^\n+/, "") : "";
  return `---\n${fmBlock}\n---\n\n${cleanBody}`;
}

/**
 * Consumes a block scalar (`|`, `>` and their chomping variants) as the value.
 *
 * **Why it is needed** (dogfooding, measured 2026-07-29). Without it the
 * indicator is stored as the value (`definition: "|"`) and the indented body
 * lines that follow fall through to the top-level loop. That loop `.trim()`s the
 * key, erasing the indentation, so a line like `kind: element` inside prose
 * **overwrote the node's kind** — a document changing its own type from its own
 * description. Zero warnings.
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
    // Folded scalar: a blank line is a newline, consecutive lines join with one space.
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

/**
 * Multi-line strings are written **as block scalars** (dogfooding, 2026-07-29).
 *
 * The moment the parser could read `|`/`>`, it became clear the writer could not
 * produce them: it wrapped a multi-line value in one pair of double quotes and
 * **passed the newlines straight through**. Our parser reads line by line, so
 * everything from the second line on became a top-level key — measured:
 * `definition` kept only its first line and a phantom `Note:` key appeared.
 *
 * That is **being unable to read your own file**, and since `import` is the only
 * path that moves a user's markdown into the vault, the loss is permanent.
 */
function serializeMultiline(key, text) {
  const body = text
    .split('\n')
    .map((line) => (line === '' ? '' : `  ${line}`))
    .join('\n');
  // `|-` (strip) — adds no trailing newline. That pairs with the parser's default
  // clip, so the value does not grow across round trips.
  return `${key}: |-\n${body}`;
}
