// frontmatter 파서 — src/shared/lib/parse-frontmatter.ts 와 capability 동기화.
// Node ESM. gray-matter 의존 없이 순수 JS.
//
// 지원 형식:
//   key: value                          (scalar — string/number/boolean)
//   key: [a, b]                         (inline list)
//   key: { x: 1, y: 2 }                 (inline object)
//   key:\n  - item1\n  - item2          (block list)
//   key:\n  child: 1\n  other: 2        (block object)

// These frontmatter keys are graph edges, not arbitrary metadata. A scalar or
// object at one of these keys used to survive parsing and then disappear from
// the compiler because collectNeighborRefs only consumes arrays.
const GRAPH_ARRAY_KEYS = new Set([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'depends_on',
  'relates',
  'contains',
  'describes',
  'broader',
]);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assignParsedKey(target, key, value, diagnostics, line) {
  if (UNSAFE_OBJECT_KEYS.has(key)) {
    diagnostics.push({
      code: 'malformed-frontmatter-line',
      line,
      message: `Frontmatter line ${line} uses unsafe object key \`${key}\`.`,
    });
    return false;
  }
  target[key] = value;
  return true;
}

export function parseFrontmatter(input) {
  // 줄바꿈·인코딩 정규화 — **읽기 경로에서만** (2026-07-28 실측).
  //
  // CRLF: 줄을 `\n` 으로 쪼개면 각 줄 끝에 `\r` 이 남는데, 블록 리스트
  // 정규식의 `.` 는 `\r` 을 안 먹고 `$` 는 문자열 끝만 본다 → 매치 실패 →
  // 리스트가 빈 배열. 스칼라는 `.trim()` 이 구제해서 살아남으므로, 증상이
  // **"노드는 보이는데 관계만 전부 사라진다"** 는 형태로 나타난다. 경고 0.
  //
  // BOM: `raw.startsWith('---')` 가 `\uFEFF---` 에서 false → frontmatter 블록
  // 전체가 본문으로 넘어가고 `kind:` 가 사라진다. 즉 **그 문서가 그래프에서
  // 노드 자체로 사라진다**.
  //
  // 둘 다 `surfaces.md` 가 명시 지원한다고 적은 인구(Windows Chromium)의
  // 기본 편집기가 만드는 것이다. 4-way 계약 테스트는 네 파서의 *일치*만
  // 보장하는데 **넷이 똑같이 틀려서** 통과하고 있었다.
  const raw = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!raw.startsWith('---')) return { frontmatter: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  const block = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\r?\n/, '');
  const frontmatter = {};
  const diagnostics = [];
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx === -1) {
      const trimmed = line.trim();
      if (/^\s+-\s+/.test(line)) {
        diagnostics.push({
          code: 'malformed-frontmatter-line',
          line: i + 2,
          message: `Frontmatter list item on line ${i + 2} has no parent key.`,
        });
      } else if (trimmed && !trimmed.startsWith('#')) {
        diagnostics.push({
          code: 'malformed-frontmatter-line',
          line: i + 2,
          message: `Frontmatter line ${i + 2} must use key: value syntax.`,
        });
      }
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    // **블록 스칼라를 값 판정보다 먼저 본다.** `definition: |` 의 값은 빈
    // 문자열이 아니라 `"|"` 라, 빈 값 분기 안에 두면 절대 도달하지 않는다.
    const scalarIndicator = /^[|>][-+]?$/.exec(value);
    if (scalarIndicator) {
      const read = readBlockScalar(lines, i + 1, scalarIndicator[0]);
      if (assignParsedKey(frontmatter, key, read.value, diagnostics, i + 2)) {
        pushGraphArrayDiagnostic(diagnostics, key, i + 2, read.value);
      }
      i = read.next - 1;
      continue;
    }
    if (value === '') {

      const lookahead = peekIndentedKind(lines, i + 1);
      if (lookahead === 'list') {
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
      if (lookahead === 'object') {
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
        if (assignParsedKey(frontmatter, key, obj, diagnostics, i + 2)) {
          pushGraphArrayDiagnostic(diagnostics, key, i + 2, obj);
        }
        i = j - 1;
        continue;
      }
      if (assignParsedKey(frontmatter, key, '', diagnostics, i + 2)) {
        pushGraphArrayDiagnostic(diagnostics, key, i + 2, '');
      }
      continue;
    }
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = splitTopLevel(value.slice(1, -1), ',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      if (assignParsedKey(frontmatter, key, items, diagnostics, i + 2)) {
        pushGraphArrayDiagnostic(diagnostics, key, i + 2, items);
      }
      continue;
    }
    if (value.startsWith('{') && value.endsWith('}')) {
      const inner = value.slice(1, -1).trim();
      const obj = {};
      if (inner) {
        for (const part of splitTopLevel(inner, ',')) {
          const cIdx = part.indexOf(':');
          if (cIdx === -1) continue;
          const k = part.slice(0, cIdx).trim();
          const v = part.slice(cIdx + 1).trim();
          if (!k) continue;
          assignParsedKey(obj, k, parseScalar(v), diagnostics, i + 2);
        }
      }
      if (assignParsedKey(frontmatter, key, obj, diagnostics, i + 2)) {
        pushGraphArrayDiagnostic(diagnostics, key, i + 2, obj);
      }
      continue;
    }
    const scalar = unquote(value);
    if (assignParsedKey(frontmatter, key, scalar, diagnostics, i + 2)) {
      pushGraphArrayDiagnostic(diagnostics, key, i + 2, scalar);
    }
  }
  const result = { frontmatter, body };
  if (diagnostics.length > 0) result.diagnostics = diagnostics;
  return result;
}

function pushGraphArrayDiagnostic(diagnostics, key, line, value) {
  if (!GRAPH_ARRAY_KEYS.has(key) || Array.isArray(value)) return;
  diagnostics.push({
    code: 'malformed-frontmatter-line',
    line,
    message: `Frontmatter line ${line} graph relation \`${key}:\` must be an array.`,
  });
}

function peekIndentedKind(lines, start) {
  if (start >= lines.length) return null;
  const next = lines[start];
  if (/^\s*-\s+/.test(next)) return 'list';
  if (/^\s+[^\s:][^:]*:\s*\S?/.test(next)) return 'object';
  return null;
}

function parseScalar(value) {
  const v = unquote(value);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

function unquote(value) {
  const trimmed = value.trim();
  // 감싼 따옴표를 벗길 때만 **언이스케이프도 함께** 한다. serializer 가
  // `"` → `\\"` 로 쓰는데 여기서 되돌리지 않으면, 저장할 때마다 백슬래시가
  // 한 겹씩 더 붙는다(실측 3회 왕복: 1개 → 2개 → 4개). 인용부호 없는 값은
  // 이스케이프 문법이 아니라 원문이므로 건드리지 않는다.
  const quote = trimmed.length >= 2 ? trimmed[0] : '';
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    const inner = trimmed.slice(1, -1).replace(new RegExp(`\\\\(${quote}|\\\\)`, 'g'), '$1');
    /*
     * 큰따옴표 안의 `\n` 은 **줄바꿈이다** (2026-08-16).
     *
     * 쓰는 쪽이 줄바꿈을 그대로 내보내면 그 한 글자가 frontmatter 블록을
     * 통째로 부순다 — 다음 줄이 새 키로 읽히거나 `---` 를 만나 본문이 시작된다
     * (실측: `note⏎kind: element` 가 **노드의 종류를 바꿨다**). 그래서 쓰는
     * 쪽은 큰따옴표 안에 `\n` 으로 적고, 읽는 쪽인 여기서 되돌린다.
     *
     * 작은따옴표는 손대지 않는다 — YAML 에서 그건 이스케이프가 없는 문자열이다.
     */
    return quote === '"' ? inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t') : inner;
  }
  return value.replace(/^["']|["']$/g, '');
}

// 따옴표를 아는 구분자 분리 (2026-07-28 실측 수정).
//
// 종전에는 인라인 리스트/객체를 무조건 `split(',')` 했다. 값 안의 콤마에서
// 쪼개져 `labels: { ko: "지도, 검색" }` 의 뒷조각이 조용히 사라졌다.
// 따옴표 안의 구분자는 데이터이지 구분자가 아니다.
function splitTopLevel(input, separator) {
  const parts = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === '\\' && i + 1 < input.length) {
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
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}


// frontmatter 작성 — Project frontmatter 를 raw markdown 으로 직렬화.
// null 값은 key 삭제, undefined 는 skip.
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
  return lines.join('\n');
}

function serializeValue(v) {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (typeof s === 'string' && needsQuote(s) ? `"${escapeQuoted(s)}"` : String(s))).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    // inline object
    const entries = Object.entries(v).map(
      ([k, val]) => `${k}: ${serializeValue(val)}`,
    );
    return `{ ${entries.join(', ')} }`;
  }
  return needsQuote(v) ? `"${escapeQuoted(v)}"` : v;
}

// 인용 안의 이스케이프 — `unquote` 의 정확한 짝이다.
//
// 역슬래시를 먼저 이스케이프한다. 안 하면 값 안의 `\\` 가 읽을 때 한 겹
// 벗겨져 왕복이 안 닫힌다(따옴표만 이스케이프하던 종전에는 따옴표 쪽이
// 반대 방향으로 새어서 저장할 때마다 백슬래시가 배가됐다).

/*
 * 따옴표가 필요한 값인가 — **네 곳이 같은 답을 내야 한다.**
 *
 * ## 왜 규칙이 바뀌었나 (2026-08-16 검수, 재현됨)
 *
 * 줄바꿈이 빠져 있었다. 그 한 글자가 frontmatter 블록을 통째로 부순다:
 * `note\nkind: element` 는 **노드의 종류를 바꾸고**, `note\n---\nx: 1` 은
 * frontmatter 를 거기서 끝내 나머지 키를 본문으로 떨어뜨린다. 그리고 아무
 * 경고도 안 난다.
 *
 * 따옴표만으로는 안 된다 — 줄이 이미 끊겼기 때문이다. 그래서 쓰는 쪽이
 * `\n` 으로 **이스케이프**하고 읽는 쪽이 되돌린다(`unquote`).
 *
 * 작은따옴표도 규칙에 들어왔다. `unquote` 는 짝이 안 맞는 따옴표를 양 끝에서
 * 벗기므로, `'지도'` 같은 값이 따옴표 없이 쓰이면 되읽을 때 `지도` 가 된다.
 */
function needsQuote(s) {
  return /[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s);
}

/** 따옴표 안에 안전하게 담기도록 만든다 — 줄바꿈은 `\n` 으로 접는다. */
function escapeQuoted(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

// 본문 + frontmatter 합쳐서 markdown 생성.
//
// body 의 leading newlines 는 strip 한다. 외부 .md 를 import 할 때
// parseFrontmatter 가 closing `---\n` 뒤의 첫 newline 만 strip 하므로,
// frontmatter 와 body 사이에 빈 줄을 한 줄 둔 일반적인 markdown 입력
// (`---\n\n# Title`) 의 body 가 `\n# Title` 로 들어와 `---\n\n` 와
// 합쳐지면 빈 줄 두 개가 된다. 여기서 strip 해서 항상 한 줄만 유지.
export function buildMarkdown({ frontmatter, body = '' }) {
  const fmBlock = serializeFrontmatter(frontmatter);
  const cleanBody = body ? body.replace(/^\n+/, '') : '';
  return `---\n${fmBlock}\n---\n\n${cleanBody}`;
}

/**
 * 블록 스칼라(`|`, `>` 와 그 chomping 변형)를 값으로 삼킨다.
 *
 * **왜 필요한가 (2026-07-29 도그푸딩 실측).** 이걸 모르면 지시자가 값으로
 * 저장되고(`definition: "|"`), 이어지는 들여쓴 본문 줄들이 최상위 루프로
 * 흘러간다. 그 루프는 키를 `.trim()` 하므로 들여쓰기가 지워지고, 설명문 안의
 * `kind: element` 같은 한 줄이 **그 노드의 종류를 덮어썼다.** 문서가 자기
 * 설명으로 자기 타입을 바꾸는 것이다. 경고는 0이었다.
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
    // 접힌 스칼라: 빈 줄은 줄바꿈, 이어지는 줄은 공백 하나로 합친다.
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
 * 여러 줄 문자열은 **블록 스칼라로 쓴다** (2026-07-29 도그푸딩).
 *
 * 파서가 `|`/`>` 를 읽을 수 있게 고치자마자, 쓰기 쪽이 그걸 못 쓴다는 것이
 * 드러났다: 여러 줄 값을 큰따옴표 하나로 감싸면서 **줄바꿈을 그대로** 흘려
 * 보냈다. 우리 파서는 줄 단위로 읽으므로 둘째 줄부터는 최상위 키가 된다 —
 * 실측: `definition` 이 첫 줄만 남고 `Note:` 라는 없는 키가 생겼다.
 *
 * 즉 **자기가 쓴 파일을 자기가 못 읽는** 상태였다. `import` 가 사용자의 md 를
 * 볼트로 옮기는 유일한 경로라 그 손실은 영구적이다.
 */
function serializeMultiline(key, text) {
  const body = text
    .split('\n')
    .map((line) => (line === '' ? '' : `  ${line}`))
    .join('\n');
  // `|-` (strip) — 마지막 줄바꿈을 더하지 않는다. 파서의 기본 clip 과 짝이
  // 맞아 왕복해도 값이 자라지 않는다.
  return `${key}: |-\n${body}`;
}
