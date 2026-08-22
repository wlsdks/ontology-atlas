/**
 * 도구가 **어느 노드를 만졌나**.
 *
 * ## 왜 (2026-08-17)
 *
 * 도구 줄은 「개념을 읽었어요」라고만 적고 **어느 개념인지는 말하지 않았다.**
 * 그러니 대화 기록을 나중에 읽어도 무슨 일이 있었는지 알 수 없고, 지도와 이을
 * 것도 없다. 값은 오고 있었다. 초기 `tool_call` 또는 streamed input을 완성한
 * `tool_call_update`가 `rawInput`을 싣고, 세션 훅이 둘을 한 도구 행으로 합친다.
 *
 * ## 인자 이름은 세어서 골랐다
 *
 * 우리 MCP 소스에서 슬러그를 나르는 인자 이름의 실측 빈도:
 * `slug` 74 · `from` 40 · `to` 40 · `newSlug` 6 · `oldSlug` 5 ·
 * `targetSlug` 2 · `intoSlug` 2 · `fromSlug` 2. 짐작으로 목록을 만들지 않았다.
 *
 * ## 그리고 아는 이름만 남긴다
 *
 * `link-slugs.ts` 와 같은 규율이다. `newSlug` 는 아직 볼트에 없는 이름이라
 * 자연히 걸러진다 — 그게 맞다. 없는 것을 가리키는 표시를 만들면 눌러도 아무
 * 데도 안 가고, 그런 것을 한 번 만난 사람은 나머지도 안 누른다.
 */

/**
 * 슬러그를 나르는 인자 이름들. **적힌 순서가 화면에 나오는 순서**다 —
 * `from`/`to` 는 관계의 방향이라 뒤집히면 안 된다.
 */
const SLUG_ARG_KEYS = [
  'slug',
  'from',
  'to',
  'oldSlug',
  'newSlug',
  'fromSlug',
  'intoSlug',
  'targetSlug',
] as const;

/**
 * 한 줄에 보여 주는 상한. 도구 줄은 대화의 배경이지 주인공이 아니다 —
 * 여기가 길어지면 정작 읽어야 할 답보다 시끄러워진다.
 */
export const TOOL_TARGET_LIMIT = 3;

export function readToolTargets(
  rawInput: unknown,
  known: ReadonlySet<string>,
): string[] {
  if (known.size === 0) return [];
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) return [];
  const input = rawInput as Record<string, unknown>;
  const out: string[] = [];
  for (const key of SLUG_ARG_KEYS) {
    const value = input[key];
    if (typeof value !== 'string') continue;
    if (!known.has(value)) continue;
    if (out.includes(value)) continue;
    out.push(value);
    if (out.length >= TOOL_TARGET_LIMIT) break;
  }
  return out;
}
