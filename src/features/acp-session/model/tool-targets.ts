/**
 * **Which node a tool touched.**
 *
 * ## Why (2026-08-17)
 *
 * 도구 줄은 「개념을 읽었어요」라고만 적고 **어느 개념인지는 말하지 않았다.**
 * 그러니 대화 기록을 나중에 읽어도 무슨 일이 있었는지 알 수 없고, 지도와 이을
 * 것도 없다. 값은 오고 있었다. 초기 `tool_call` 또는 streamed input을 완성한
 * `tool_call_update`가 `rawInput`을 싣고, 세션 훅이 둘을 한 도구 행으로 합친다.
 *
 * ## The argument names were chosen by counting
 *
 * Measured frequency of the argument names carrying a slug in our MCP source:
 * `slug` 74 · `from` 40 · `to` 40 · `newSlug` 6 · `oldSlug` 5 · `targetSlug` 2 · `intoSlug` 2 ·
 * `fromSlug` 2. The list was not assembled by guessing.
 *
 * ## And only known names survive
 *
 * The same rule as `link-slugs.ts`. `newSlug` is a name not yet in the vault and is naturally filtered
 * out — which is correct. A marker pointing at something that does not exist goes nowhere when
 * pressed, and someone who meets one stops pressing the rest.
 */

/**
 * The argument names that carry a slug. **The written order is the order on screen** — `from`/`to`
 * are a relation's direction and must not be reversed.
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
 * The per-row ceiling. A tool row is the conversation's background, not its subject — grown long, it
 * gets noisier than the answer that actually needs reading.
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
