/**
 * The fixture vault gates use to measure **with a vault mounted**.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Which vault to measure with — this round's verdict (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * There were three candidates, each with a benefit and a cost.
 *
 * | Candidate | Gains | Loses |
 * |---|---|---|
 * | dogfood `docs/ontology/` | most realistic | **the input moves weekly** — every node `/ontology-sync` adds shakes the gate, and a failure cannot be told apart from a vault change. Writes 100+ files to OPFS on every run |
 * | the shipped sample `samples/storefront/` | exactly the data a first visitor sees, already maintained by the repo | **it is already the default data source without mounting a vault** — measuring it mounted measures the same DOM twice. And it is the very vault that hid the dense-row defect (0 cross-domain edges) |
 * | a fixture (here) | **deliberately** produces shapes the sample structurally cannot, and is deterministic | **it can miss real-world shapes** — which is exactly how the dense rows hid |
 *
 * **Chosen: the fixture, but with coverage asserted rather than assumed.**
 *
 * The fixture's known weakness (missing shapes) is the very defect this round is
 * fixing, so this vault is not used on the basis of "it is realistic enough" —
 * `a11y-vault-backed.spec.ts` requires **evidence that the shape really rendered** for
 * each state (the cross-domain grid is visible, example links are stacked vertically,
 * the element floor inside `<main>`). A fixture with asserted coverage degrades
 * **loudly**; an unasserted real vault degrades **quietly**. That difference is the
 * whole of this choice.
 *
 * And **both** states are measured:
 *   - no vault = the sample = what a first visitor sees → the existing
 *     `a11y-ratchet` / `contrast-ratchet`
 *   - vault mounted = this fixture = shapes the sample cannot produce →
 *     `a11y-vault-backed`
 *
 * ⚠️ **What this fixture misses (a list for the next person)**
 *   1. **Extremes of volume** — a real vault's long bodies, deep heading trees,
 *      hundreds of nodes. Text-fit and overflow defects do not appear here (that is the
 *      `overflow-sweep` family's job).
 *   2. **frontmatter keys not used here** — `screenshots`, `evidence`, `merged_uids`
 *      and so on. The places those keys render remain unmeasured.
 *   3. **Multiple projects** — there is one today. The "connected projects" card that
 *      inter-project relations (`dependencies`) render only ever appears empty.
 *   4. **Non-Korean locales** — widths and wrapping on the `/en` side.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Why this shape
 * ════════════════════════════════════════════════════════════════════
 *
 * - **Cross-domain edges** — 3 from orders to settlement, 3 from orders to catalogue,
 *   1 from catalogue to settlement. Without them the coupling grid on the insights
 *   "boundaries" tab has **no cells at all** (PR #918 first rendered that site).
 *   Several examples per pair are needed for dense rows to appear, so one branch is
 *   not enough.
 * - **It uses `relates`** — that is the key the web deriver
 *   (`derive-ontology-from-vault`) reads as a capability's cross edge. Writing
 *   `depends_on` on a capability yields **silently zero edges** (measured in #918).
 * - **The slug `storefront`** — a static export emits routes only for slugs known at
 *   build time, so the fixture project must be one of them to open at
 *   `/ko/project/<slug>/`.
 * - **`path` on element nodes** — the condition for the implementation evidence line
 *   to render.
 */

interface CapabilityOptions {
  readonly relates?: readonly string[];
  readonly dependencies?: readonly string[];
  readonly elements?: readonly string[];
  readonly desc?: string;
}

/** A fixed UUIDv4 per slug — the fixture must pass the real writer's identity guard too. */
function fixtureUid(identity: string): string {
  const hex = createHash("sha256").update(identity).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function capability(
  slug: string,
  title: string,
  domainSlug: string,
  { relates = [], dependencies = [], elements = [], desc = "" }: CapabilityOptions = {},
): string {
  return [
    "---",
    `uid: ${fixtureUid(`capability:${slug}`)}`,
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
    `uid: ${fixtureUid(`element:${slug}`)}`,
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
    `uid: ${fixtureUid(`domain:${slug}`)}`,
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
    `uid: ${fixtureUid("project:storefront")}`,
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
  // ⚠️ **A slug that never exists in the shipped sample vault** — the target of the
  // deep-link tests. Storefront vocabulary such as `checkout` also exists in the shipped
  // sample (sample-storefront, 112 nodes), so the tests could not tell which vault
  // opened the document (2026-08-08 — a boot race defect hid behind that overlap and
  // stayed green). If this name ever appears in the sample those tests go blind again —
  // do not add it there.
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

/** How many nodes the fixture really contains — specs use it to tell this apart from mounting an empty vault. */
export const FIXTURE_VAULT_NODE_COUNT = Object.keys(FIXTURE_VAULT).length;
import { createHash } from "node:crypto";
