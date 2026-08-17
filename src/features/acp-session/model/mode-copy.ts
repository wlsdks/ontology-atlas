/**
 * 「작업 방식」 목록의 **사람 말** — 이름과 한 줄 설명.
 *
 * ## 왜 (2026-08-17 소유자 지적)
 *
 * 목록이 이랬다: `Auto · 확인 안 됨` / `Manual` / `Plan Mode` /
 * `Don't Ask · 확인 안 됨`. 이름은 전부 영어이고, 설명은 **우리가 아직 안 재
 * 본 둘에만** 붙어 있었다 — 정작 고를 만한 둘(`Manual` · `Plan Mode`)은 무엇이
 * 다른지 화면에 한 글자도 없었다.
 *
 * ## 이름은 어디서 오나
 *
 * 어댑터가 세션과 함께 내놓는다. 그 값은 실측으로 확인했다(어댑터 소스의 모드
 * 정의):
 *
 * | id | 어댑터 이름 | 어댑터 설명 |
 * |---|---|---|
 * | `default` | Manual | Standard behavior, prompts for dangerous operations |
 * | `plan` | Plan Mode | Planning mode, no actual tool execution |
 * | `auto` | Auto | Use a model classifier to approve/deny permission prompts |
 * | `dontAsk` | Don't Ask | Don't prompt for permissions, deny if not pre-approved |
 * | `acceptEdits` | Accept Edits | Auto-accept file edit operations |
 * | `bypassPermissions` | Bypass Permissions | Bypass all permission checks |
 * | `read-only` | Read-only | (codex) |
 *
 * 뒤의 둘은 화면에 아예 안 나온다 — 묻지 않고 통과시키는 것이라
 * `mode-safety.ts` 가 걸러낸다.
 *
 * ## 규율: 아는 것만 옮긴다
 *
 * 목록에 없는 id 는 **어댑터가 준 이름을 그대로** 쓰고 설명을 안 붙인다. 모르는
 * 모드에 그럴듯한 한 줄을 지어 붙이면, 그 줄이 곧 우리가 확인하지 않은 약속이
 * 된다. 「확인 안 됨」 표시는 이것과 **다른 축**이다 — 이름을 아는 것과 폴더 밖
 * 작업 전에 묻는지 재 본 것은 별개다.
 */

/** 이 id 들만 사람 말로 옮긴다 — 어댑터 소스에서 확인한 것. */
export const MEASURED_MODE_IDS = ['default', 'plan', 'auto', 'dontask', 'read-only'] as const;

export type MeasuredModeId = (typeof MEASURED_MODE_IDS)[number];

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

/**
 * 이 모드의 번역 열쇠 — 없으면 `null`(어댑터 이름을 그대로 쓴다).
 *
 * `modeName.<id>` 와 `modeHint.<id>` 두 열쇠를 쓴다. id 를 소문자로 맞추는 이유는
 * 어댑터마다 표기가 다르기 때문이다(`dontAsk` · `read-only`).
 */
export function modeCopyKey(modeId: unknown): MeasuredModeId | null {
  const key = normalize(modeId);
  return (MEASURED_MODE_IDS as readonly string[]).includes(key)
    ? (key as MeasuredModeId)
    : null;
}
