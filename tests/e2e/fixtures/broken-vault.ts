/**
 * 결함 볼트 픽스처 — **게이트가 빈 집합 위에서 놀지 못하게 하는 데이터**.
 *
 * ## 왜 이 파일이 `tests/e2e/fixtures/` 에 승격됐나
 *
 * dogfood 볼트와 샘플 볼트는 **이슈가 0** 이다. 그래서 "검사 결과를 화면이
 * 말하는가" 를 재는 모든 게이트가 지금까지 **한 번도 빨개져 본 적이 없었다** —
 * 통과가 아니라 *볼 것이 없었던 것*이다. 2026-08-04 실측이 그 대가를 보여줬다:
 * 오류 5개가 있는 폴더에서 준비도 미터가 100% 인디고(위험 세그먼트 0px)였고,
 * 파일 옆 진단은 경고만 보여 주고 오류는 감추고 있었으며, 지도에 없는 문서가
 * 「지도 근거」라고 말했다. 세 결함 모두 **정상 볼트에서는 존재할 수 없다.**
 *
 * 그래서 결함을 데이터로 고정한다. 검사 코드마다 정확히 한 건씩 — 어느 처방을
 * 되돌려도 그 한 건이 화면에서 사라지므로 게이트가 그 자리에서 터진다.
 *
 * ## 정확한 기댓값 (UI fast path = `validateVaultDocFrontmatter` + `summarizeVaultValidation`)
 *
 * **오류 5 · 경고 4**. 아래 주석의 번호가 그 내역이다. `unclosed-frontmatter`
 * 와 `parse-zero-keys` 는 담지 않는다 — 파서가 lenient 라 fast path 가 원리적으로
 * 못 보고, 그건 CLI(`validateVaultDocument`)의 몫이다.
 *
 * 소비처: `tests/e2e/vault-truth-telling.spec.ts`.
 */
export const BROKEN_VAULT: Record<string, string> = {
  // ── 정상 앵커 — 그래프에 실재하는 노드가 있어야 "지도에 있다/없다" 가 갈린다 ──
  "project.md": [
    "---",
    "kind: project",
    "slug: shop",
    "title: 우리 가게",
    "uid: 11111111-1111-4111-8111-111111111111",
    "contains:",
    "  - orders",
    "---",
    "",
    "# 우리 가게",
    "",
  ].join("\n"),

  // 경고① non-canonical-graph-array — `contains:` 가 정렬돼 있지 않다.
  "domains/orders.md": [
    "---",
    "kind: domain",
    "slug: orders",
    "title: 주문",
    "uid: 22222222-2222-4222-8222-222222222222",
    "contains:",
    "  - payment",
    "  - checkout",
    "---",
    "",
    "# 주문",
    "",
  ].join("\n"),

  // 오류① missing-uid + 경고② missing-expected-field(domain)
  "capabilities/checkout.md": [
    "---",
    "kind: capability",
    "slug: checkout",
    "title: 결제하기",
    "---",
    "",
    "# 결제하기",
    "",
  ].join("\n"),

  // 오류② invalid-uid — slug 에서 파생한 값은 UUIDv4 가 아니다.
  "capabilities/payment.md": [
    "---",
    "kind: capability",
    "slug: payment",
    "title: 결제 수단",
    "domain: orders",
    "uid: payment-capability",
    "---",
    "",
    "# 결제 수단",
    "",
  ].join("\n"),

  // 오류③ empty-kind — `kind:` 는 있는데 값이 없다. 노드가 지도에서 사라지는
  // 가장 흔한 두 경로 중 하나.
  "elements/ghost.md": [
    "---",
    "kind:",
    "slug: ghost",
    "title: 유령 모듈",
    "domain: orders",
    "uid: 33333333-3333-4333-8333-333333333333",
    "---",
    "",
    "# 유령 모듈",
    "",
  ].join("\n"),

  // 경고③ unknown-kind
  "elements/legacy.md": [
    "---",
    "kind: widget",
    "slug: legacy",
    "title: 레거시 위젯",
    "domain: orders",
    "uid: 44444444-4444-4444-8444-444444444444",
    "---",
    "",
    "# 레거시 위젯",
    "",
  ].join("\n"),

  // 경고④ missing-kind — kind 가 아예 없는데 ontology 시그널(`domain:`)은 있다.
  // 사라지는 두 번째 경로.
  "notes/handover.md": [
    "---",
    "slug: handover",
    "title: 인수인계 메모",
    "domain: orders",
    "---",
    "",
    "# 인수인계 메모",
    "",
  ].join("\n"),

  // 오류④⑤ duplicate-uid — 두 노드가 같은 정체성을 주장한다(양쪽 다 오류).
  "elements/twin-a.md": [
    "---",
    "kind: element",
    "slug: twin-a",
    "title: 쌍둥이 A",
    "domain: orders",
    "uid: 55555555-5555-4555-8555-555555555555",
    "---",
    "",
    "# 쌍둥이 A",
    "",
  ].join("\n"),
  "elements/twin-b.md": [
    "---",
    "kind: element",
    "slug: twin-b",
    "title: 쌍둥이 B",
    "domain: orders",
    "uid: 55555555-5555-4555-8555-555555555555",
    "---",
    "",
    "# 쌍둥이 B",
    "",
  ].join("\n"),
};

/**
 * 같은 모양의 **정상** 볼트 — 같은 노드 수, 같은 관계, 이슈 0.
 *
 * 결함 볼트만으로는 게이트를 못 믿는다. "빨개지는가" 와 "초록이 되는가" 는
 * 서로 다른 질문이고, 둘 다 물어야 탐지기가 항상-빨강이 아님을 안다.
 */
export const HEALTHY_VAULT: Record<string, string> = {
  "project.md": [
    "---",
    "kind: project",
    "slug: shop",
    "title: 우리 가게",
    "uid: 11111111-1111-4111-8111-111111111111",
    "contains:",
    "  - orders",
    "---",
    "",
    "# 우리 가게",
    "",
  ].join("\n"),
  "domains/orders.md": [
    "---",
    "kind: domain",
    "slug: orders",
    "title: 주문",
    "uid: 22222222-2222-4222-8222-222222222222",
    "contains:",
    "  - checkout",
    "  - payment",
    "---",
    "",
    "# 주문",
    "",
  ].join("\n"),
  "capabilities/checkout.md": [
    "---",
    "kind: capability",
    "slug: checkout",
    "title: 결제하기",
    "domain: orders",
    "uid: 66666666-6666-4666-8666-666666666666",
    "---",
    "",
    "# 결제하기",
    "",
  ].join("\n"),
  "capabilities/payment.md": [
    "---",
    "kind: capability",
    "slug: payment",
    "title: 결제 수단",
    "domain: orders",
    "uid: 77777777-7777-4777-8777-777777777777",
    "---",
    "",
    "# 결제 수단",
    "",
  ].join("\n"),
  "elements/ghost.md": [
    "---",
    "kind: element",
    "slug: ghost",
    "title: 유령 모듈",
    "domain: orders",
    "uid: 33333333-3333-4333-8333-333333333333",
    "---",
    "",
    "# 유령 모듈",
    "",
  ].join("\n"),
  "elements/legacy.md": [
    "---",
    "kind: element",
    "slug: legacy",
    "title: 레거시 위젯",
    "domain: orders",
    "uid: 44444444-4444-4444-8444-444444444444",
    "---",
    "",
    "# 레거시 위젯",
    "",
  ].join("\n"),
  "notes/handover.md": [
    "---",
    "kind: document",
    "slug: handover",
    "title: 인수인계 메모",
    "domain: orders",
    "uid: 88888888-8888-4888-8888-888888888888",
    "---",
    "",
    "# 인수인계 메모",
    "",
  ].join("\n"),
  "elements/twin-a.md": [
    "---",
    "kind: element",
    "slug: twin-a",
    "title: 쌍둥이 A",
    "domain: orders",
    "uid: 55555555-5555-4555-8555-555555555555",
    "---",
    "",
    "# 쌍둥이 A",
    "",
  ].join("\n"),
  "elements/twin-b.md": [
    "---",
    "kind: element",
    "slug: twin-b",
    "title: 쌍둥이 B",
    "domain: orders",
    "uid: 99999999-9999-4999-8999-999999999999",
    "---",
    "",
    "# 쌍둥이 B",
    "",
  ].join("\n"),
};
