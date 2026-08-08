/**
 * 게이트가 **볼트를 물린 채** 재기 위한 픽스처 볼트.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 어떤 볼트로 잴 것인가 — 이 라운드의 판정 (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * 후보가 셋이었고, 셋 다 값과 대가가 있다.
 *
 * | 후보 | 얻는 것 | 잃는 것 |
 * |---|---|---|
 * | 도그푸드 `docs/ontology/` | 가장 현실적 | **입력이 매주 움직인다** — `/ontology-sync` 가 노드를 더할 때마다 게이트가 흔들리고, 실패가 이번 변경 때문인지 볼트가 바뀐 탓인지 구별 안 됨. 100+ 파일을 OPFS 로 매 실행 씀 |
 * | 배포되는 샘플 `samples/storefront/` | 실제 첫 방문자가 보는 그 데이터 · 이미 저장소가 관리 | **볼트를 안 물려도 이미 그게 기본 데이터 소스다** — 물린 채 재면 같은 DOM 을 두 번 재는 셈. 그리고 이 볼트가 바로 밀집 행 결함을 숨긴 그 볼트다(교차 도메인 엣지 0) |
 * | 픽스처(여기) | 샘플이 구조적으로 못 내는 모양을 **의도적으로** 만든다 · 결정적 | **현실의 모양을 놓칠 수 있다** — 밀집 행이 정확히 그렇게 숨었다 |
 *
 * **고른 것: 픽스처. 단, 커버리지를 믿지 않고 단언한다.**
 *
 * 픽스처의 알려진 약점(모양을 놓친다)은 이 라운드가 고치려는 결함 그 자체다.
 * 그래서 이 볼트를 «현실적이니까 괜찮겠지» 로 쓰지 않는다 —
 * `a11y-vault-backed.spec.ts` 가 상태마다 **그 모양이 실제로 렌더됐다는 증거**를
 * 요구한다(교차 도메인 격자가 보인다 · 예시 링크가 세로로 쌓였다 · `<main>` 안
 * 요소 바닥). 커버리지가 단언된 픽스처는 **시끄럽게** 퇴화하고, 단언되지 않은
 * 현실 볼트는 **조용히** 퇴화한다. 그 차이가 이 선택의 전부다.
 *
 * 그리고 두 상태를 **둘 다** 잰다:
 *   - 볼트 없음 = 샘플 = 첫 방문자가 보는 화면 → 기존 `a11y-ratchet`/`contrast-ratchet`
 *   - 볼트 있음 = 이 픽스처 = 샘플이 못 내는 모양 → `a11y-vault-backed`
 *
 * ⚠️ **이 픽스처가 놓치는 것 (다음 사람에게 남기는 목록)**
 *   1. **분량의 극단** — 실제 볼트의 긴 본문·깊은 heading 트리·수백 노드.
 *      텍스트 맞춤/오버플로 결함은 여기서 안 난다(`overflow-sweep` 계열의 일).
 *   2. **여기서 안 쓰는 frontmatter 키** — `screenshots` · `evidence` ·
 *      `merged_uids` 등. 그 키가 그리는 자리는 여전히 미측정이다.
 *   3. **여러 프로젝트** — 지금은 하나다. 프로젝트 간 관계(`dependencies`)가
 *      그리는 「연결된 프로젝트」 카드는 빈 상태로만 렌더된다.
 *   4. **한국어 아닌 로케일** — `/en` 쪽 폭·줄바꿈.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 왜 이 모양인가
 * ════════════════════════════════════════════════════════════════════
 *
 * - **교차 도메인 엣지** — 주문→정산 3갈래, 주문→카탈로그 3갈래, 카탈로그→정산
 *   1갈래. 인사이트 「경계」 탭의 결합 격자는 이게 없으면 **칸 자체가 안 생긴다**
 *   (PR #918 이 그 자리를 처음 렌더했다). 쌍마다 예시가 여럿이어야 밀집 행이
 *   태어나므로 한 갈래로는 부족하다.
 * - **`relates` 를 쓴다** — 웹 파생기(`derive-ontology-from-vault`)가 역량의 교차
 *   엣지로 읽는 키가 그것이다. 역량에 `depends_on` 을 적으면 엣지가 **조용히
 *   0개**가 된다(#918 실측).
 * - **슬러그 `storefront`** — 정적 export 는 빌드 시점에 아는 슬러그만 라우트로
 *   낸다. 픽스처 프로젝트가 `/ko/project/<slug>/` 에서 열리려면 그중 하나여야
 *   한다.
 * - **요소 노드에 `path`** — 구현 근거 줄이 그려지는 조건이다.
 */

interface CapabilityOptions {
  readonly relates?: readonly string[];
  readonly dependencies?: readonly string[];
  readonly elements?: readonly string[];
  readonly desc?: string;
}

function capability(
  slug: string,
  title: string,
  domainSlug: string,
  { relates = [], dependencies = [], elements = [], desc = "" }: CapabilityOptions = {},
): string {
  return [
    "---",
    "kind: capability",
    `slug: capabilities/${slug}`,
    `title: ${title}`,
    `display_ko: ${title}`,
    `domain: domains/${domainSlug}`,
    ...(desc ? [`description: ${desc}`] : []),
    ...(relates.length ? ["relates:", ...relates.map((r) => `  - capabilities/${r}`)] : []),
    ...(dependencies.length
      ? ["dependencies:", ...dependencies.map((r) => `  - capabilities/${r}`)]
      : []),
    ...(elements.length ? ["elements:", ...elements.map((r) => `  - elements/${r}`)] : []),
    "---",
    "",
    `# ${title}`,
    "",
    desc || `${title} 역량.`,
    "",
  ].join("\n");
}

function element(slug: string, title: string, path: string): string {
  return [
    "---",
    "kind: element",
    `slug: elements/${slug}`,
    `title: ${title}`,
    `display_ko: ${title}`,
    `path: ${path}`,
    "---",
    "",
    `# ${title}`,
    "",
    `\`${path}\` 구현 요소.`,
    "",
  ].join("\n");
}

function domain(slug: string, title: string, capabilities: readonly string[]): string {
  return [
    "---",
    "kind: domain",
    `slug: domains/${slug}`,
    `title: ${title}`,
    `display_ko: ${title}`,
    "capabilities:",
    ...capabilities.map((c) => `  - capabilities/${c}`),
    "---",
    "",
    `# ${title}`,
    "",
    `${title} 도메인.`,
    "",
  ].join("\n");
}

export const FIXTURE_VAULT: Readonly<Record<string, string>> = {
  "storefront.md": [
    "---",
    "kind: project",
    "slug: storefront",
    "title: Online Store",
    "display_ko: 온라인 상점",
    "description: 주문·정산·카탈로그가 서로 어떻게 기대는지 보여주는 검사용 볼트.",
    "contains:",
    "  - domains/orders",
    "  - domains/settlement",
    "  - domains/catalog",
    "---",
    "",
    "# Online Store",
    "",
    "세 도메인이 서로를 가로질러 참조하는 볼트다.",
    "",
    "## 왜 이 볼트인가",
    "",
    "배포되는 샘플 볼트에는 교차 도메인 엣지가 없어, 그 엣지가 그리는 자리는",
    "어떤 게이트도 본 적이 없었다.",
    "",
  ].join("\n"),

  "domains/orders.md": domain("orders", "주문", ["checkout", "cart-pricing", "order-history"]),
  "domains/settlement.md": domain("settlement", "정산", [
    "invoice",
    "payout-ledger",
    "tax-report",
  ]),
  "domains/catalog.md": domain("catalog", "카탈로그", [
    "product-detail",
    "search-index",
    "inventory-sync",
  ]),

  "capabilities/checkout.md": capability("checkout", "결제 승인", "orders", {
    relates: ["invoice", "product-detail"],
    elements: ["checkout-service", "payment-gateway"],
    desc: "장바구니를 주문으로 확정하고 결제 승인을 받는다.",
  }),
  "capabilities/cart-pricing.md": capability("cart-pricing", "장바구니 가격 계산", "orders", {
    relates: ["payout-ledger", "search-index"],
    elements: ["pricing-engine"],
    desc: "할인·쿠폰·배송비를 합쳐 최종 금액을 만든다.",
  }),
  "capabilities/order-history.md": capability("order-history", "주문 내역", "orders", {
    relates: ["tax-report", "inventory-sync"],
    dependencies: ["checkout"],
    elements: ["order-repository"],
  }),
  "capabilities/invoice.md": capability("invoice", "청구서 발행", "settlement", {
    elements: ["invoice-renderer"],
    desc: "확정된 주문에서 청구서를 만든다.",
  }),
  "capabilities/payout-ledger.md": capability("payout-ledger", "정산 원장", "settlement", {
    dependencies: ["invoice"],
  }),
  "capabilities/tax-report.md": capability("tax-report", "세금 신고 자료", "settlement"),
  // ⚠️ **배포 샘플 볼트에 절대 없는 슬러그** — 딥링크 시험의 표적. `checkout`
  // 같은 쇼핑몰 어휘는 배포 샘플(sample-storefront, 112 노드)에도 있어서,
  // 「어느 볼트가 이 문서를 열었나」를 시험이 가를 수 없었다(2026-08-08 —
  // 부팅 경주 결함이 샘플 겹침 뒤에 숨어 초록이었다). 이 이름이 샘플에
  // 생기면 그 시험들이 다시 눈이 먼다 — 샘플에 넣지 말 것.
  "capabilities/deeplink-probe.md": capability("deeplink-probe", "딥링크 표적 문서", "settlement", {
    desc: "픽스처 볼트에만 존재해, 열린 문서가 어느 볼트에서 왔는지를 시험이 가른다.",
  }),
  "capabilities/product-detail.md": capability("product-detail", "상품 상세", "catalog", {
    relates: ["invoice"],
    elements: ["product-page"],
  }),
  "capabilities/search-index.md": capability("search-index", "검색 색인", "catalog"),
  "capabilities/inventory-sync.md": capability("inventory-sync", "재고 동기화", "catalog", {
    dependencies: ["product-detail"],
  }),

  "elements/checkout-service.md": element(
    "checkout-service",
    "결제 서비스",
    "src/features/checkout/service.ts",
  ),
  "elements/payment-gateway.md": element(
    "payment-gateway",
    "결제 게이트웨이 어댑터",
    "src/shared/lib/payment-gateway.ts",
  ),
  "elements/pricing-engine.md": element(
    "pricing-engine",
    "가격 계산 엔진",
    "src/entities/pricing/engine.ts",
  ),
  "elements/order-repository.md": element(
    "order-repository",
    "주문 저장소",
    "src/entities/order/repository.ts",
  ),
  "elements/invoice-renderer.md": element(
    "invoice-renderer",
    "청구서 렌더러",
    "src/features/invoice/renderer.tsx",
  ),
  "elements/product-page.md": element(
    "product-page",
    "상품 상세 페이지",
    "src/views/product/ui/ProductPage.tsx",
  ),
};

/** 픽스처가 실제로 담고 있는 노드 수 — 스펙이 「빈 볼트를 물렸다」와 구별할 때 쓴다. */
export const FIXTURE_VAULT_NODE_COUNT = Object.keys(FIXTURE_VAULT).length;
