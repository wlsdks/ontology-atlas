/**
 * 도구 호출 한 줄을 **사람이 읽는 말**로 바꾼다.
 *
 * ## 왜 필요한가 (2026-08-16)
 *
 * 실물에서 대화 기록이 이렇게 나왔다:
 *
 * ```
 * 작업  mcp__atlas-vault__list_concepts
 * 작업  mcp__atlas-vault__add_concept
 * 실행  Terminal
 * ```
 *
 * 이건 함수 이름이지 일어난 일이 아니다. 이 저장소의 디자인 규칙이 이미
 * 그것을 금지한다 — *"전문용어는 쉬운 말로. `영향받음 N` → 「이 노드를 쓰는 곳
 * N」"*. 화면이 「무슨 일이 일어나는지 보이는 것」으로 기다림을 견디게 하려면
 * 그 줄이 읽혀야 한다.
 *
 * ## 무엇을 아는 대로만 말한다
 *
 * **우리가 꽂아 준 서버의 도구는 우리가 안다** — 이름을 우리가 정했으니까.
 * 그건 뜻으로 옮긴다. 남의 도구는 **모른다**: 이름에서 서버 접두사만 벗겨
 * 그대로 보여 준다. 「파일을 읽습니다」처럼 그럴듯하게 지어내면, 실제로 그
 * 도구가 무엇을 했는지와 어긋나는 날 화면이 거짓말을 하게 된다.
 */

/** 우리가 꽂아 준 볼트 서버의 도구 이름 → 그 도구가 하는 일. */
const VAULT_TOOL_KEYS: Readonly<Record<string, string>> = {
  connection_info: 'connect',
  list_concepts: 'read',
  list_kinds: 'read',
  get_concept: 'read',
  find_backlinks: 'read',
  find_neighbors: 'read',
  find_path: 'read',
  query_ontology: 'read',
  validate_vault: 'check',
  add_concept: 'addNode',
  patch_concept: 'editNode',
  rename_concept: 'renameNode',
  merge_concepts: 'mergeNodes',
  add_relation: 'addRelation',
  add_relations: 'addRelation',
  startup: 'connect',
};

export interface ToolLabel {
  /** 사람이 읽는 말. i18n 키이거나(`kind` 가 `known`) 원문이다. */
  text: string;
  /** `known` = 우리가 뜻을 아는 도구 · `raw` = 이름만 보여 준다. */
  kind: 'known' | 'raw';
}

/**
 * `mcp__atlas-vault__add_concept` → `{ kind: 'known', text: 'addNode' }`
 * `mcp__other__do_thing`          → `{ kind: 'raw',   text: 'do_thing' }`
 * `Terminal`                      → `{ kind: 'raw',   text: 'Terminal' }`
 */
export function toolLabel(title: string, vaultServerName: string): ToolLabel {
  const trimmed = title.trim();
  if (!trimmed) return { kind: 'raw', text: '' };

  const ourPrefix = `mcp__${vaultServerName}__`;
  if (trimmed.startsWith(ourPrefix)) {
    const bare = trimmed.slice(ourPrefix.length);
    const known = VAULT_TOOL_KEYS[bare];
    if (known) return { kind: 'known', text: known };
    // 우리 서버인데 이 목록에 없다 — 도구가 늘었다는 뜻이다. 지어내지 않고
    // 이름만 보여 준다(그 이름은 우리가 정한 것이라 그래도 읽을 만하다).
    return { kind: 'raw', text: bare };
  }

  // 남의 MCP 도구: `mcp__<서버>__<도구>` 에서 서버 접두사만 벗긴다.
  const foreign = /^mcp__[^_]+(?:_[^_]+)*?__(.+)$/.exec(trimmed);
  if (foreign) return { kind: 'raw', text: foreign[1] };

  return { kind: 'raw', text: trimmed };
}
