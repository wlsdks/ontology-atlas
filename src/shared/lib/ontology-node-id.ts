/**
 * Ontology 노드 id 형식 가드 — `<kind>:<tail>` (e.g. `capability:mcp-server`,
 * `domain:auth`, `element:src/features/auth`).
 *
 * `derive-ontology-from-vault.ts` 가 vault frontmatter `kind:` 가 있는 모든
 * doc 에 이 형식의 id 를 붙인다. 토폴로지 / 트리 / ego graph 가 같은 id 공간을
 * 공유. project slug (`ontology-atlas` 같이 `:` 없는 plain slug) 와 구분 시
 * 필요.
 *
 * 정의: 첫 segment 가 알려진 ontology kind 이고 그 뒤에 `:` 가 와야 한다.
 * 단순 substring 검사가 아니라 정확 prefix — `oh-my:something` 같은 false
 * positive 차단.
 */

const KIND_PREFIXES = [
  'project:',
  'domain:',
  'capability:',
  'element:',
  'document:',
  'unknown:',
] as const;

export function isOntologyNodeId(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  return KIND_PREFIXES.some((p) => id.startsWith(p) && id.length > p.length);
}
