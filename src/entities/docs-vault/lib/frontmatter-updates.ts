import {
  normalizeVaultSource,
  readVaultSourceShape,
  restoreVaultSourceShape,
} from '@/shared/lib/parse-frontmatter';

/**
 * frontmatter 키/값 패치 — 원문의 나머지(본문·주석·키 순서)를 보존한 채
 * 지정한 키만 갈아끼운다.
 *
 * **왜 entity 인가**: 볼트에 쓰는 경로가 둘이 됐다 — 사람이 직접 고치는
 * 로컬 볼트(`docs-vault-local`)와 에이전트 제안을 적용하는 경로
 * (`vault-agent`). 같은 파일을 두 규칙으로 쓰면 git diff 에 두 가지 서식이
 * 섞이고, 둘 중 하나만 고쳐진 버그가 반쪽만 나타난다. FSD 상 feature 끼리는
 * 값을 주고받을 수 없으므로(방향 위반) 공통 규칙은 한 단계 아래로 내린다.
 */

export type FrontmatterUpdateValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, string | number | boolean>
  | null;

export function applyFrontmatterUpdates(
  source: string,
  updates: Record<string, FrontmatterUpdateValue>,
): string {
  // BOM/CRLF 원본도 같은 규칙으로 읽고, 저장할 때 원래 모양으로 되돌린다
  // (`replaceVaultBody` 와 같은 계약). CRLF 를 정규화하지 않으면 키 줄 끝에
  // `\r` 이 남아 `key in updates` 매칭이 빗나가고, 갱신 대신 **같은 키가 하나
  // 더 붙는다**. BOM 이면 frontmatter 블록 자체를 못 찾아 전부 새로 쓴다.
  const shape = readVaultSourceShape(source);
  const raw = normalizeVaultSource(source);
  let fmLines: string[] = [];
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      fmLines = raw.slice(4, end).split('\n');
      // 모든 선행 개행 제거 — serializer 가 `---\n...\n---\n\n` 로 구분자를
      // 보태므로 body 는 선두 개행 없이 시작해야 중복 방지.
      body = raw.slice(end + 4).replace(/^(\r?\n)+/, '');
    }
  }
  const updatedKeys = new Set<string>();
  const nextLines: string[] = [];
  // 방금 갈아치운(또는 지운) 키의 블록 스타일 잔여 줄(`  - item`)을 삼키는
  // 중인가. YAML 은 같은 배열을 inline(`key: [a, b]`)으로도 블록(`key:` +
  // `  - a`)으로도 쓸 수 있는데, 이 함수는 키 줄만 치환하므로 블록 스타일
  // 키를 만나면 새 inline 값 아래에 옛 항목 줄이 그대로 남아 있었다
  // (`capabilities: [a, b]` 다음 줄에 `  - a`). 우리 파서는 그 줄을 무시해서
  // 화면상으로는 멀쩡해 보였지만, 디스크의 파일은 표준 YAML 로 읽히지 않고
  // git diff 에는 유령 줄이 남는다 — 볼트가 진실원인 제품에서 이건 결함이다.
  // 스타터가 바로 블록 스타일(`capabilities:` + `  - …`)이라 첫 사용자
  // 경로에서 재현된다(흐름 점검 2026-07-26 관찰 확인).
  let swallowingBlock = false;
  for (const line of fmLines) {
    // 들여쓴 줄은 직전 키에 딸린 블록 값 — 그 키를 치환했으면 함께 지운다.
    if (/^\s+\S/.test(line)) {
      // 유지하는 키의 블록 값은 그대로 둔다 (`  child: 1` 을 최상위 키로
      // 오인해 치환하던 문제도 여기서 함께 막힌다).
      if (!swallowingBlock) nextLines.push(line);
      continue;
    }
    swallowingBlock = false;
    const idx = line.indexOf(':');
    if (idx === -1) {
      nextLines.push(line);
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!(key in updates)) {
      nextLines.push(line);
      continue;
    }
    updatedKeys.add(key);
    swallowingBlock = true;
    const value = updates[key];
    if (value === null) continue; // delete
    nextLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  // 새 키 append
  for (const [key, value] of Object.entries(updates)) {
    if (updatedKeys.has(key)) continue;
    if (value === null) continue;
    nextLines.push(`${key}: ${serializeFrontmatterValue(value)}`);
  }
  // frontmatter 비어있으면 섹션 자체 생략
  if (nextLines.every((l) => l.trim() === '')) {
    return restoreVaultSourceShape(body, shape);
  }
  return restoreVaultSourceShape(
    `---\n${nextLines.join('\n')}\n---\n\n${body}`,
    shape,
  );
}

function serializeFrontmatterValue(
  v: Exclude<FrontmatterUpdateValue, null>,
): string {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    // inline 1-depth object — `{ x: 100, y: 200 }`. parseFrontmatter 가 같은
    // 형식 round-trip 인식 (parser.test.mjs 'inline object' case).
    const entries = Object.entries(v).map(([k, val]) => {
      let serialized: string;
      if (typeof val === 'boolean') serialized = val ? 'true' : 'false';
      else if (typeof val === 'number') serialized = String(val);
      else serialized = needsQuote(val) ? `"${val.replace(/"/g, '\\"')}"` : val;
      return `${k}: ${serialized}`;
    });
    return `{ ${entries.join(', ')} }`;
  }
  return needsQuote(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function needsQuote(s: string): boolean {
  // 우리 파서가 감당 못 하는 문자들 (쉼표, 콜론, 대괄호, 시작 따옴표)
  return /[:,\[\]"]|^\s|\s$/.test(s);
}
