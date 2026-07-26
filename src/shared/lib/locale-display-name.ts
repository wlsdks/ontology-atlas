/**
 * 화면 언어로 부르는 이름 — `display_<locale>` 해석의 단일 규칙.
 *
 * 왜 필요했나: 지도 팝오버는 `내 프로젝트`, 문서함 빠른 검색은 `My project`.
 * 같은 세션, 같은 문서인데 두 이름으로 읽혔다(2026-07-26 실측). 그래프 쪽은
 * `derivationToInsight` 가 `display_<locale>` 을 이미 해석하고 있었지만, 문서
 * 목록 표면들은 canonical `title` 을 그대로 그렸기 때문이다. 규칙이 두 벌이면
 * 이런 어긋남은 표면이 늘어날 때마다 다시 생긴다.
 *
 * 계약(AGENTS.md): `title` 은 검색/매칭의 단일 진실원이라 바뀌지 않는다.
 * 표시 이름은 **그리기 전용**이다 — 이 함수는 매칭에 쓰지 않는다
 * (매칭은 `shared/lib/node-name-match` 가 담당하고, 그쪽은 title 과 표시
 * 이름을 모두 후보로 넣는다).
 */

/** `display_ko:` 처럼 `display_` 뒤 2글자 로케일 키만 수집한다. */
export function readDisplayLocales(
  frontmatter: Record<string, unknown> | null | undefined,
): Record<string, string> | undefined {
  if (!frontmatter) return undefined;
  let out: Record<string, string> | undefined;
  for (const [key, value] of Object.entries(frontmatter)) {
    const match = /^display_([a-z]{2})$/.exec(key);
    if (!match || typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    (out ??= {})[match[1]] = trimmed;
  }
  return out;
}

/**
 * 이 화면 언어에서 이 문서를 부르는 이름. `display_<locale>` 이 있으면 그것,
 * 없으면 넘겨받은 fallback(대개 canonical title) 그대로 — 없는 이름을 지어
 * 내지 않는다.
 */
export function resolveLocaleDisplayName(
  frontmatter: Record<string, unknown> | null | undefined,
  locale: string | undefined,
  fallback: string,
): string {
  if (!locale) return fallback;
  const localized = readDisplayLocales(frontmatter)?.[locale];
  return localized ?? fallback;
}
