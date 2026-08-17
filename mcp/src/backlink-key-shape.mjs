// 백링크 갱신이 보고하는 **값의 모양**.
//
// ## 왜 따로 있나 (2026-08-17 실측)
//
// `pnpm dogfood:verify` 가 빨간불이었다:
//
//   ✗ rename_concept … beforeKeys[1] before drift
//
// 재현해 보니 **동작은 맞았다** — 이름을 바꾸면 관계의 이유도 같이 따라간다:
//
//   before: { "capabilities/mcp-server":   "ACP 세션은 …" }
//   after : { "capabilities/mcp-server-x": "ACP 세션은 …" }
//
// 틀린 것은 게이트의 계약이었다. `before`/`after` 가 문자열이거나 문자열
// 배열이어야 한다고 못박아 뒀는데 `relation_notes` 는 **맵**이다.
//
// > **맞는 동작에 켜지는 게이트는, 꺼지는 게이트다.** 「못 잡는 게이트」와
// > 방향만 반대이고 결과는 같다 — 아무도 안 본다.
//
// 넓히되 **풀지는 않는다**: 문자열 · 문자열 배열 · **납작한 문자열 맵**까지.
// 중첩은 여전히 거절한다.

/** 값이 깨끗한 문자열인가 — 앞뒤 공백·빈 문자열·널 문자를 거절한다. */
export function isCleanNonBlankString(value) {
  return (
    typeof value === 'string'
    && value.length > 0
    && value.trim() === value
    && !value.includes('\u0000')
  );
}

/**
 * 백링크 키 변화가 나를 수 있는 값인가.
 *
 * 프론트매터의 관계 칸은 셋 중 하나다: 스칼라 참조(`domain:`) · 참조 배열
 * (`dependencies:`) · **이유 맵**(`relation_notes:`). 앞의 둘만 받으면 셋째를
 * 가진 노드의 rename 이 정상인데도 실패한다.
 */
export function isBacklinkKeyValue(value) {
  if (isCleanNonBlankString(value)) return true;
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => isCleanNonBlankString(item));
  }
  if (value && typeof value === 'object') {
    // 납작한 맵만 — 값이 또 객체나 배열이면 이 화면이 설명할 수 없는 모양이다.
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(
      ([key, entry]) => isCleanNonBlankString(key) && isCleanNonBlankString(entry),
    );
  }
  return false;
}
