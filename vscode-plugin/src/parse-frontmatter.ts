/**
 * Vault frontmatter parser — TypeScript port of `scripts/lib/parse-frontmatter.mjs`.
 *
 * Same lenient-by-design behavior as the rest of the suite (`src/shared/lib`,
 * `mcp/src/parser.mjs`, `cli/src/lib`, `scripts/lib`). The 5-way contract test
 * at `tests/contract/parse-frontmatter.contract.test.ts` blocks drift between
 * all five copies.
 *
 * Supports:
 *   key: value                        (scalar)
 *   key: [a, b]                       (inline list)
 *   key: { x: 1, y: 2 }               (inline object)
 *   key:\n  - item1\n  - item2        (block list)
 *   key:\n  child: 1\n  other: 2      (block object)
 *
 * Returns `{ frontmatter: {}, body: raw }` when the YAML block is malformed
 * (no opening `---`, no closing `---`). Never throws.
 */

export interface ParsedFrontmatter {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter: Record<string, unknown> = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (value === '') {
      const lookahead = peekIndentedKind(lines, i + 1);
      if (lookahead === 'list') {
        const items: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const dashMatch = lines[j].match(/^\s+-\s+(.+)$/);
          if (!dashMatch) break;
          items.push(unquote(dashMatch[1].trim()));
          j += 1;
        }
        frontmatter[key] = items;
        i = j - 1;
        continue;
      }
      if (lookahead === 'object') {
        const obj: Record<string, unknown> = {};
        let j = i + 1;
        while (j < lines.length) {
          const m = lines[j].match(/^(\s+)([^\s:][^:]*):\s*(.*)$/);
          if (!m) break;
          const childKey = m[2].trim();
          if (!childKey) break;
          obj[childKey] = parseScalar(m[3].trim());
          j += 1;
        }
        frontmatter[key] = obj;
        i = j - 1;
        continue;
      }
      frontmatter[key] = '';
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      continue;
    }
    if (value.startsWith('{') && value.endsWith('}')) {
      const inner = value.slice(1, -1).trim();
      const obj: Record<string, unknown> = {};
      if (inner) {
        for (const part of inner.split(',')) {
          const cIdx = part.indexOf(':');
          if (cIdx === -1) continue;
          const k = part.slice(0, cIdx).trim();
          const v = part.slice(cIdx + 1).trim();
          if (!k) continue;
          obj[k] = parseScalar(v);
        }
      }
      frontmatter[key] = obj;
      continue;
    }
    frontmatter[key] = unquote(value);
  }
  return { frontmatter, body };
}

function peekIndentedKind(
  lines: readonly string[],
  start: number,
): 'list' | 'object' | null {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s+-\s+/.test(next)) return 'list';
  if (/^\s+[^\s:][^:]*:\s*\S?/.test(next)) return 'object';
  return null;
}

function parseScalar(value: string): unknown {
  const v = unquote(value);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function unquote(value: string): string {
  return value.replace(/^["']|["']$/g, '');
}
