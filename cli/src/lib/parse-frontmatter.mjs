// 가벼운 frontmatter 파서 — `---\n...\n---\n` 블록만 지원.
// gray-matter 의존 없이도 다음 형태 모두 인식:
//   key: value                          (scalar)
//   key: [a, b]                         (inline list)
//   key: { x: 1, y: 2 }                 (inline object)
//   key:\n  - item1\n  - item2          (block list)
//   key:\n  child: 1\n  other: 2        (block object)
//
// src/shared/lib/parse-frontmatter.ts 와 동일 동작. 두 진입점 (빌드 스크립트
// vs 런타임) 의 parser drift 를 줄이기 위해 ESM 모듈로 단일화. 향후 #3 task
// 에서 ts 측도 이 모듈을 단일 진실원으로 흡수.

export function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    if (value === "") {
      const lookahead = peekIndentedKind(lines, i + 1);
      if (lookahead === "list") {
        const items = [];
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
      if (lookahead === "object") {
        const obj = {};
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
      frontmatter[key] = "";
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      frontmatter[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      continue;
    }
    if (value.startsWith("{") && value.endsWith("}")) {
      const inner = value.slice(1, -1).trim();
      const obj = {};
      if (inner) {
        for (const part of inner.split(",")) {
          const cIdx = part.indexOf(":");
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

function peekIndentedKind(lines, start) {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s+-\s+/.test(next)) return "list";
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
  return value.replace(/^["']|["']$/g, "");
}

// frontmatter 작성 — value 를 raw markdown 으로 직렬화. mcp/src/parser.mjs
// 의 serializeFrontmatter / buildMarkdown 와 contract 일관 (drift 차단은
// 별도 contract test 후속).
// null 값은 key 삭제, undefined 는 skip.

export function serializeFrontmatter(fm) {
  const lines = [];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) continue;
    lines.push(`${key}: ${serializeValue(value)}`);
  }
  return lines.join("\n");
}

function serializeValue(v) {
  if (Array.isArray(v)) {
    return `[${v
      .map((s) =>
        typeof s === "string" && needsQuote(s)
          ? `"${s.replace(/"/g, '\\"')}"`
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
  return needsQuote(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function needsQuote(s) {
  return /[:,\[\]"{}]|^\s|\s$/.test(s);
}

// 본문 + frontmatter 합쳐서 markdown 생성.
//
// body 의 leading newlines 는 strip — parser 가 closing `---\n` 뒤의 첫
// newline 만 떼는 동작 (frontmatter 와 본문 사이 빈 줄을 한 줄 둔 일반
// markdown 입력) 과 결합돼 `---\n\n` 와 합쳐지면 빈 줄 두 개로 늘어나는
// 회귀가 났다. 여기서 정규화해 import / add 가 같은 모양 만들도록.
export function buildMarkdown({ frontmatter, body = "" }) {
  const fmBlock = serializeFrontmatter(frontmatter);
  const cleanBody = body ? body.replace(/^\n+/, "") : "";
  return `---\n${fmBlock}\n---\n\n${cleanBody}`;
}
