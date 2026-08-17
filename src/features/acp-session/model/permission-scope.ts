/**
 * 「계속 허용」이 **무엇을 허용하는가** — 어댑터가 선언한 그대로.
 *
 * ## 왜 (2026-08-17)
 *
 * 권한 카드의 셋째 버튼이 *"위 경로가 있는 폴더 전체를 이번 대화 내내 허용"*
 * 이라고 **단정**하고 있었다. 그런데 그 범위를 정하는 것은 우리가 아니라
 * 어댑터다. 어댑터는 `_meta.permission.changes[].targets[]` 로 그것을 말해
 * 주고, 실측에서 그 값은 **폴더가 아니라 도구**였다:
 *
 * ```
 * { type: 'tool', toolName: 'mcp__atlas-vault__add_concept' }
 * ```
 *
 * 폴더를 허용한다고 적어 놓고 실제로는 도구를 허용하면, 사용자는 **자기가 준
 * 적 없는 권한을 준 줄 알거나 그 반대로 안다.** 이 제품에서 가장 값비싼
 * 결정에서 화면이 틀린 말을 하는 것이다.
 *
 * ## 규율
 *
 * **어댑터가 선언한 것만 말한다.** 경로에서 폴더를 우리가 계산해 적지 않는다 —
 * 그건 어댑터의 규칙을 짐작하는 것이고, 짐작이 틀리면 카드가 거짓말을 한다.
 * 아무것도 안 주면 아무것도 단정하지 않는다.
 *
 * 종류가 섞여 있어도 「모른다」다. 한 문장으로 정직하게 적을 수 없는 것을
 * 억지로 한 문장으로 만들면, 그 문장이 둘 중 하나에 대해 틀린다.
 */

export type PermissionScope =
  | { kind: 'tool'; names: string[] }
  | { kind: 'directory'; names: string[] }
  | { kind: 'unknown'; names: [] };

const UNKNOWN: PermissionScope = { kind: 'unknown', names: [] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * @param options `session/request_permission` 의 `options` 배열 그대로.
 *   **「계속 허용」 선택지의 `_meta` 만 본다** — 다른 선택지의 것을 읽으면
 *   누르지도 않은 버튼의 범위를 설명하게 된다.
 */
export function permissionScope(options: readonly unknown[]): PermissionScope {
  if (!Array.isArray(options)) return UNKNOWN;
  const always = options.find((o) => asRecord(o).kind === 'allow_always');
  if (!always) return UNKNOWN;

  const changes = asRecord(asRecord(asRecord(always)._meta).permission).changes;
  if (!Array.isArray(changes)) return UNKNOWN;

  const tools: string[] = [];
  const directories: string[] = [];
  let sawUnknownType = false;

  for (const change of changes) {
    const targets = asRecord(change).targets;
    if (!Array.isArray(targets)) continue;
    for (const target of targets) {
      const t = asRecord(target);
      if (t.type === 'tool' && typeof t.toolName === 'string' && t.toolName.trim()) {
        tools.push(t.toolName);
      } else if (t.type === 'directory' && typeof t.path === 'string' && t.path.trim()) {
        directories.push(t.path);
      } else {
        // 모르는 종류를 조용히 버리면, 카드가 「도구 하나만 허용」이라고 하는
        // 동안 그 옆에서 다른 것이 같이 허용된다.
        sawUnknownType = true;
      }
    }
  }

  if (sawUnknownType) return UNKNOWN;
  if (tools.length > 0 && directories.length > 0) return UNKNOWN;
  if (tools.length > 0) return { kind: 'tool', names: tools };
  if (directories.length > 0) return { kind: 'directory', names: directories };
  return UNKNOWN;
}
