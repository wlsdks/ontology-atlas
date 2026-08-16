/**
 * 에이전트가 **무엇을 하려는지** — 권한 카드가 보여 줄 한 낱말.
 *
 * ## 왜 (2026-08-17 실측)
 *
 * 권한 카드가 경로를 mono 로 크게 보여 주는데, **읽으려는 건지 고치려는 건지
 * 지우려는 건지는 어디에도 없었다.** `/etc/hosts` 를 읽겠다와 고치겠다는 완전히
 * 다른 결정인데 화면이 똑같았다.
 *
 * 값은 오고 있었다 — `toolKind` 가 요청에 실려 오고, 그 필드 주석이 직접
 * *"화면이 아이콘/색을 고르는 타입 있는 사실"* 이라고 적어 뒀다. 화면이 안
 * 쓰고 있었을 뿐이다. 이 저장소가 오늘 여러 번 만난 모양이다: **계산은 되는데
 * 읽는 사람이 없다.**
 *
 * ## 모르면 모른다고 한다
 *
 * 어댑터마다 종류 이름이 다르고 아예 안 줄 수도 있다. 그때 「읽기」로 짐작하면
 * **가장 위험한 쪽으로 틀린다** — 사람이 안심하고 허용한다. 모르면 모른다고
 * 하고, 판단은 경로와 도구 이름에 맡긴다. 「기타」(`other`)도 마찬가지다:
 * 어댑터가 분류를 못 한 것과 「읽기」는 다른 말이다.
 */

export type PermissionIntent = 'read' | 'edit' | 'delete' | 'execute' | 'unknown';

/**
 * 어댑터가 쓰는 낱말 → 우리 갈래. 표를 넓힐 때는 **그 어댑터가 실제로 보내는
 * 값**을 확인하고 넣는다 — 짐작으로 넣으면 위험한 것이 안전한 것으로 읽힌다.
 */
const INTENT_BY_KIND: Readonly<Record<string, PermissionIntent>> = {
  read: 'read',
  fetch: 'read',
  search: 'read',
  edit: 'edit',
  write: 'edit',
  move: 'edit',
  delete: 'delete',
  execute: 'execute',
};

export function permissionIntent(toolKind: string | null | undefined): PermissionIntent {
  if (typeof toolKind !== 'string') return 'unknown';
  const key = toolKind.trim().toLowerCase();
  if (key.length === 0) return 'unknown';
  return INTENT_BY_KIND[key] ?? 'unknown';
}
