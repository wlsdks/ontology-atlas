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
    // **블록 스칼라를 값 판정보다 먼저 본다.** `definition: |` 의 값은 빈
    // 문자열이 아니라 `"|"` 라, 빈 값 분기 안에 두면 절대 도달하지 않는다.
    const scalarIndicator = /^[|>][-+]?$/.exec(value);
    if (scalarIndicator) {
      const read = readBlockScalar(lines, i + 1, scalarIndicator[0]);
      frontmatter[key] = read.value;
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
      frontmatter[key] = splitTopLevel(value.slice(1, -1), ",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
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
          obj[k] = parseScalar(v);
        }
      }
      frontmatter[key] = obj;
      continue;
    }
    frontmatter[key] = unquote(value);
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
  // 감싼 따옴표를 벗길 때만 **언이스케이프도 함께** 한다. serializer 가
  // `"` 를 이스케이프해 쓰는데 여기서 되돌리지 않으면, 저장할 때마다
  // 백슬래시가 한 겹씩 더 붙는다(실측 3회 왕복: 1개 → 2개 → 4개).
  // 인용부호 없는 값은 이스케이프 문법이 아니라 원문이므로 건드리지 않는다.
  const quote = trimmed.length >= 2 ? trimmed[0] : "";
  if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
    return trimmed.slice(1, -1).replace(new RegExp(`\\\\(${quote}|\\\\)`, "g"), "$1");
  }
  return value.replace(/^["']|["']$/g, "");
}

// 따옴표를 아는 구분자 분리 (2026-07-28 실측 수정).
//
// 종전에는 인라인 리스트/객체를 무조건 콤마로 쪼갰다. 값 안의 콤마에서
// 쪼개져 `labels: { ko: "지도, 검색" }` 의 뒷조각이 조용히 사라졌다.
// 따옴표 안의 구분자는 데이터이지 구분자가 아니다.
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
