# Grading packet — 2026-08-31-gb-r4-fixed

Each answer below is identified only by an opaque id, and the order is shuffled.
Which side wrote which answer is withheld until the grades are saved.

Score each answer on four axes and one count. Full definitions are in
`docs/benchmark/rubric.md`, section "Lifecycle matrix scoring". In short:

| Axis | Out of | What full marks means |
|---|---:|---|
| Correct | **3** | Everything the question asked for is present and accurate, with no false claim. |
| Citations | **2** | Every path and concept it cites exists, and each supports the claim made from it. |
| Boundary | **2** | Names the responsibility that owns the work **and** what is outside it. |
| Next step | **2** | A second agent could act on it without coming back to ask. |
| Unsupported | count | Statements the source and vault do not support. A count, never averaged in. |

Always write a score with its maximum: `2 / 3`, never `2`.

The question each answer was given is shown, because the same question was put
to both sides and grading without it is impossible.

## C01  (question G1)

**Answer**: The existing Purchase responsibility should own the discount-rule change, specifically its Checkout capability, because Purchase owns turning a reviewed cart into a confirmed order and Checkout owns purchase authorization/confirmation. Inventory Sync is a related capability only at the availability boundary: Checkout depends on it for trustworthy sellable stock, but no evidence shows discounts should alter inventory reconciliation. Read `src/features/checkout/index.ts` first, then `src/features/inventory-sync/index.ts` to preserve that boundary. `src/widgets/cart-summary/index.ts` is a possible presentation path, but Atlas does not assign it to this responsibility, so it is not a confirmed implementation target.

**Evidence given**:
- Atlas: `domains/purchase` owns order confirmation; `domains/inventory` owns sellable stock.
- Atlas: `capabilities/checkout` includes turning a reviewed cart into a confirmed order and excludes inventory reconciliation.
- Atlas declares Checkout → Inventory Sync with rationale: Checkout requires trustworthy sellable availability before confirming a purchase.
- Atlas records `src/features/checkout/index.ts` as the Checkout entrypoint and `src/features/inventory-sync/index.ts` as the Inventory Sync entrypoint.
- Source inspection found only marker exports in those files: `checkoutFeature = 'purchase completion'` and `inventorySyncFeature = 'stock reconciliation'`.
- The repository contains `src/widgets/cart-summary/index.ts`, exporting only `cartSummaryWidget = 'cart summary'`; Atlas records no ownership relation for it.
- No test files were found, and `package.json` declares no scripts or dependencies.

**Next step proposed**: Start design/implementation investigation at `src/features/checkout/index.ts`; define the rule’s observable pricing behavior and tests before changing code. Consult Inventory Sync only if the rule changes availability semantics, and establish Cart Summary ownership before treating it as an implementation target.

**Stated as unknown**:
- Discount eligibility, calculation order, stacking, rounding, currency, persistence, and failure behavior are unspecified.
- It is unknown whether the rule applies during cart review, checkout authorization, order confirmation, or presentation.
- Atlas source currentness is unmeasured and competency meaning is not authored; its paths are recorded anchors, not runtime-behavior proof.
- No pricing capability, discount capability, rule engine, order model, or confirmed Cart Summary ownership is recorded.
- No focused or full test command is recorded, and no tests are present.
- Dependency impact completeness remains unknown; Atlas records no source-backed impact receipts.

## C02  (question B2)

**Answer**: Permission evaluation belongs in Access Control, specifically `capabilities/workspace-authorization`, anchored at `packages/policy`; it should not be implemented as Coordination behavior. Coordination may depend on or consume authorization decisions while publishing, distributing, or acknowledging incident decisions.

**Evidence given**:
- `domains/access-control` explicitly says Access Control owns permission evaluation and excludes incident decision content.
- `capabilities/workspace-authorization` evaluates whether a member may read, coordinate, or administer an incident; it includes workspace permission decisions and excludes publishing or acknowledging decisions.
- `domains/coordination` owns decision state—publishing and acknowledging incident decisions—while member authority belongs to Access Control.
- `capabilities/decision-broadcast` explicitly excludes workspace permission evaluation and member authority.
- `capabilities/acknowledgement-tracking` explicitly excludes evaluating who may read or administer the workspace and declares a dependency on Workspace Authorization because the console must respect workspace authority.
- The recorded implementation anchor for Workspace Authorization is `packages/policy`; the source currently contains only package manifests identifying `@relay/policy`, `@relay/realtime`, and `@relay/web`, not behavior implementations.

**Next step proposed**: The receiving agent should verify that concrete permission logic is implemented behind `@relay/policy`/`packages/policy`, that coordination code only requests or consumes its authorization result, and that focused tests cover both allowed and denied read/coordinate/administer cases with exact observable outcomes. It must also establish current source evidence first: Atlas reports the project source as unbound/not measured, task navigation blocked, and runtime/transitive impact unknown.

**Stated as unknown**:
- No permission-evaluation implementation or tests are present in the currently visible source files; only package manifests exist.
- Atlas records product-level dependencies, but these do not prove runtime call direction or a complete blast radius.
- Project meaning competency evidence is not authored, so structural ontology readiness is not semantic qualification.

## C03  (question G1)

**Answer**: The existing Purchase responsibility should own the change, through the Checkout capability. A discount rule concerns the reviewed-cart-to-confirmed-order boundary; Inventory owns stock reconciliation, not purchase confirmation. The directly touched capability is Checkout. Inventory Sync is an adjacent dependency to understand, but Atlas does not establish that it must change.

**Evidence given**:
- Atlas defines domains/purchase as turning a reviewed cart into a confirmed order and owning order confirmation.
- Atlas defines capabilities/checkout as authorizing a purchase and producing an order confirmation; it includes converting a reviewed cart into a confirmed order.
- Checkout declares a dependency on capabilities/inventory-sync for trustworthy sellable availability.
- Atlas defines Inventory Sync as stock reconciliation and explicitly excludes purchase confirmation.
- Read src/features/checkout/index.ts first; it is the canonical path recorded for Checkout. Read src/features/inventory-sync/index.ts second to understand the declared dependency boundary.
- The current source is only a greenfield fixture: checkout and inventory-sync each export a descriptive string. No tests or rule implementation are present.

**Next step proposed**: Start design work at src/features/checkout/index.ts, then inspect src/features/inventory-sync/index.ts only for availability-boundary implications. Before implementing, obtain requirements for discount semantics and add focused tests because none are recorded or present.

**Stated as unknown**:
- What qualifies for a discount and whether rules operate on items, carts, orders, customers, or promotions.
- How discounts are calculated, rounded, capped, prioritized, combined, or rejected.
- When the rule runs relative to authorization, inventory validation, and order confirmation.
- Whether discounts affect inventory availability; therefore Inventory Sync impact remains unknown.
- Whether src/widgets/cart-summary/index.ts should display discount results; Atlas does not assign it an ownership role.
- Expected APIs, persistence, error behavior, and regression outputs.
- Atlas source currentness is unmeasured and the project source is unbound; its recorded paths are handoff anchors, not proof of runtime behavior.

## C04  (question G2)

**Answer**: No. Inventory reconciliation should remain in the Inventory Sync capability/domain, not move into Checkout. Checkout authorizes a purchase and produces an order confirmation; it explicitly excludes inventory reconciliation. Inventory Sync reconciles storefront availability with warehouse stock and explicitly excludes purchase confirmation.

**Evidence given**:
- Atlas records `capabilities/checkout --depends_on--> capabilities/inventory-sync`.
- Recorded rationale: “Checkout depends on trustworthy sellable availability before it confirms a purchase.”
- The source anchors preserve separate entrypoints: `src/features/checkout/index.ts` exports `checkoutFeature = 'purchase completion'`, while `src/features/inventory-sync/index.ts` exports `inventorySyncFeature = 'stock reconciliation'`. This supports separation but does not prove runtime behavior.

**Next step proposed**: Verify the dependency at runtime by inspecting or adding tests near both recorded source anchors: confirm checkout consumes trustworthy sellable availability before confirmation, including a positive case with available stock and a negative case where unavailable or stale stock prevents confirmation. No exact test path or runner is recorded, so discover the project test setup first.

**Stated as unknown**:
- Atlas reports source currentness as not measured because the project source is unbound.
- No focused test path, test manifest, or runner is recorded.
- The declared dependency has a rationale, but its runtime behavior and completeness remain unverified.
- Project competency meaning is recorded as invalid because competency answers have not been authored.

## C05  (question B2)

**Answer**: Permission evaluation belongs in Access Control, specifically Workspace Authorization at `packages/policy`, not in Coordination. Coordination owns publishing, distributing, and acknowledging decision state. Explicitly outside Coordination are workspace permission evaluation and member authority, including deciding who may read, coordinate, or administer an incident.

**Evidence given**:
- Atlas: Access Control owns permission evaluation and excludes incident decision content.
- Atlas: Workspace Authorization includes workspace permission decisions and excludes publishing or acknowledging incident decisions.
- Atlas: Coordination owns decision state; member authority belongs to Access Control.
- Atlas records Acknowledgement Tracking as depending on Workspace Authorization because the receiving console must respect workspace authority.
- Source system map says the policy package evaluates workspace permissions; the web console presents the timeline and realtime distributes updates.

**Next step proposed**: The receiving agent should verify that the web/coordination path consults `@relay/policy` before exposing or changing acknowledgement and decision state, with positive and denial tests for read, coordinate, and administer permissions. Treat this as unverified until actual integration code and tests exist.

**Stated as unknown**:
- Atlas marks source currentness as unmeasured and runtime/transitive impact as unknown.
- The repository currently contains only package manifests for the recorded anchors; no implementation or test files prove the authorization integration.

## C06  (question G1)

**Answer**: The existing Purchase responsibility should own the change, specifically its Checkout capability, because Purchase owns turning a reviewed cart into a confirmed order. The change also touches Inventory Sync only at the existing availability dependency boundary; Atlas does not establish that discount calculation belongs to Inventory. Read `src/features/checkout/index.ts` first, followed by `src/features/inventory-sync/index.ts` to verify the dependency contract.

**Evidence given**:
- `domains/purchase`: owns order confirmation and contains `capabilities/checkout`.
- `capabilities/checkout`: includes turning a reviewed cart into a confirmed order and points to `src/features/checkout/index.ts`.
- Checkout declares a dependency on `capabilities/inventory-sync`: trustworthy sellable availability is required before purchase confirmation.
- `capabilities/inventory-sync`: owns stock reconciliation, excludes purchase confirmation, and points to `src/features/inventory-sync/index.ts`.
- The current source anchors contain only feature-name exports: `checkoutFeature = 'purchase completion'` and `inventorySyncFeature = 'stock reconciliation'`.
- Atlas validation passes, but source currentness is unavailable and runtime behavior is explicitly unmeasured.

**Next step proposed**: Define the discount rule’s observable contract, then inspect or create Checkout-focused tests near the checkout anchor before choosing an implementation shape.

**Stated as unknown**:
- What kind of discount is intended and when it is applied.
- Eligibility, precedence, stacking, rounding, currency, tax, and failure behavior.
- Whether discounts affect inventory availability or reservation calculations.
- The actual checkout execution path beyond the named entrypoint.
- No focused test path, runner, or verification command is recorded.
- Impact completeness remains unknown because Atlas has no current source measurement.

## C07  (question B1)

**Answer**: An acknowledgement-state change belongs to the Coordination domain. The primary capability is Acknowledgement Tracking; adjacent capabilities are Decision Broadcast in Coordination and Workspace Authorization in Access Control. Read `apps/web/package.json` first, then `packages/policy/package.json`, and then `packages/realtime/package.json`. The relationships to Workspace Authorization and Decision Broadcast remain declared product dependencies, not proven runtime or transitive impact.

**Evidence given**:
- Atlas defines Coordination as owning publication and acknowledgement of incident decisions, while member authority belongs to Access Control.
- Acknowledgement Tracking records `apps/web` and depends on Workspace Authorization at `packages/policy`.
- Decision Broadcast records `packages/realtime` and declares that acknowledgement state is meaningful only after publication.
- The repository contains only package manifests at those implementation anchors; they identify `@relay/web`, `@relay/policy`, and `@relay/realtime` but contain no executable behavior or imports proving runtime propagation.
- Atlas reports impact as `declared_with_rationale`, `sourceBacked: false`, and `completeness: unknown`; its source currentness is unmeasured.

**Next step proposed**: Inspect actual implementation and tests when they become available under the three recorded anchors; no files were edited.

**Stated as unknown**:
- The exact symbols or handlers that mutate acknowledgement state are not present in this repository snapshot.
- Runtime blast radius, transitive effects, and executable test coverage remain unmeasured.

## C08  (question G2)

**Answer**: No. Inventory reconciliation should remain in Inventory Sync, not move into Checkout. Checkout’s boundary includes converting a reviewed cart into a confirmed order and explicitly excludes inventory reconciliation. Inventory Sync includes reconciling sellable storefront availability with warehouse stock and excludes purchase confirmation.

**Evidence given**:
- Atlas records `capabilities/checkout --depends_on--> capabilities/inventory-sync`.
- Recorded reason: “Checkout depends on trustworthy sellable availability before it confirms a purchase.”
- The source anchors remain separate: `src/features/checkout/index.ts` identifies purchase completion, while `src/features/inventory-sync/index.ts` identifies stock reconciliation.

**Next step proposed**: Verify the dependency contract from both recorded anchors, then add or locate focused tests showing that checkout consumes trustworthy availability without performing reconciliation itself. Atlas records no exact test path or runner, and none is currently present in the repository.

**Stated as unknown**:
- Atlas reports source currentness as not measured, so the recorded relationship is meaning-level guidance rather than runtime proof.
- The repository currently contains only minimal feature constants and no discovered tests or test script.

## C09  (question G2)

**Answer**: No. Inventory reconciliation should remain in Inventory Sync, not move into Checkout. Checkout owns reviewed-cart-to-confirmed-order behavior and explicitly excludes inventory reconciliation; Inventory Sync owns sellable-stock reconciliation and explicitly excludes purchase confirmation.

**Evidence given**:
- Recorded relationship: capabilities/checkout depends_on capabilities/inventory-sync.
- Recorded reason: “Checkout depends on trustworthy sellable availability before it confirms a purchase.”
- Source anchors remain separate: src/features/checkout/index.ts identifies “purchase completion,” while src/features/inventory-sync/index.ts identifies “stock reconciliation.”

**Next step proposed**: Verify behavior across both recorded entrypoints, then inspect or add focused tests proving that checkout consumes trustworthy availability without performing reconciliation itself. Atlas records no exact test path, and the repository currently exposes no test files or test runner.

**Stated as unknown**:
- Atlas marks source currentness as not measured and dependency completeness as unknown; the recorded relationship is meaning-level guidance, not runtime proof.

## C10  (question B1)

**Answer**: An acknowledgement-state change belongs primarily to the Coordination domain. The directly involved capabilities are Acknowledgement Tracking and Decision Broadcast. Workspace Authorization, in the separate Access Control domain, is a boundary dependency because acknowledgement display must respect workspace authority. Read `apps/web/package.json` first, followed by `packages/realtime/package.json`, then `packages/policy/package.json`. The Decision Broadcast → Acknowledgement Tracking relationship—and, more generally, the declared dependency edges—remains a recorded product dependency with rationale, not proof of runtime or transitive impact.

**Evidence given**:
- Atlas defines Coordination as owning publication and acknowledgement of incident decisions, while member authority belongs to Access Control.
- Acknowledgement Tracking records `apps/web` as its implementation anchor and depends on Workspace Authorization.
- Decision Broadcast records `packages/realtime` and declares a dependency on Acknowledgement Tracking because acknowledgement is meaningful only after publication.
- Workspace Authorization records `packages/policy` and explicitly excludes publishing or acknowledging decisions.
- Source inspection found only package manifests at those anchors; they identify `@relay/web`, `@relay/realtime`, and `@relay/policy` but contain no runtime implementation or dependency evidence.
- Atlas reports impact as `declared_with_rationale`, `sourceBacked: false`, and completeness `unknown`; source currentness is also unmeasured.

**Next step proposed**: Inspect runtime code and tests if they are added or available beyond these manifest-only anchors before claiming behavioral or blast-radius impact.

**Stated as unknown**:
- The actual acknowledgement state-change implementation and focused tests are not recorded.
- Runtime execution paths, transitive impact, and complete blast radius remain unmeasured.

## C11  (question B2)

**Answer**: Permission evaluation belongs in Access Control, specifically the Workspace Authorization capability anchored at `packages/policy`. Coordination should consume that authority, not own or implement it.

**Evidence given**:
- Access Control explicitly owns permission evaluation and incident workspace authority.
- Workspace Authorization evaluates whether a member may read, coordinate, or administer an incident.
- Coordination owns publishing, acknowledgement, and decision state; member authority is explicitly outside it.
- Decision Broadcast excludes workspace permission evaluation and member authority; Acknowledgement Tracking excludes evaluating who may read or administer the workspace.
- The ontology records that Acknowledgement Tracking depends on Workspace Authorization because the web console must respect workspace authority.
- `docs/SYSTEM-MAP.md` assigns permission evaluation to the policy package, timeline distribution to realtime, and presentation to the web console.

**Next step proposed**: The receiving agent should verify that `packages/policy` exposes and implements authorization, while coordination code only invokes it at publication/acknowledgement boundaries. Add or locate positive and negative permission tests with exact allow/deny outcomes. Currently the repository contains only package manifests and no implementation or tests, so runtime behavior, integration direction, and transitive impact remain unverified.

**Stated as unknown**:
- Atlas reports source currentness as not measured and project meaning as incomplete.
- No exact implementation entry point, authorization API, coordination call site, or focused test is recorded.
- The declared capability dependency is a product relationship, not proof of runtime or blast-radius completeness.

## C12  (question B1)

**Answer**: Acknowledgement-state changes belong to the Coordination domain. The primary capability is Acknowledgement Tracking; related capabilities are Decision Broadcast upstream and Workspace Authorization across the Access Control boundary. Read apps/web first, then packages/realtime and packages/policy. The declared capability dependencies—especially Decision Broadcast → Acknowledgement Tracking, and also Acknowledgement Tracking → Workspace Authorization—remain recorded product relationships, not proven runtime or transitive impact.

**Evidence given**:
- Atlas defines Coordination as owning publication and acknowledgement of incident decisions, while member authority belongs to Access Control.
- Acknowledgement Tracking is anchored at apps/web and includes acknowledgement state in the incident workspace.
- Decision Broadcast is anchored at packages/realtime and declares a rationale-backed dependency on Acknowledgement Tracking.
- Workspace Authorization is anchored at packages/policy and is a rationale-backed dependency of Acknowledgement Tracking.
- Source inspection found only package manifests at those anchors; README.md and docs/SYSTEM-MAP.md describe responsibilities but provide no runtime call or import evidence.

**Next step proposed**: For implementation work, start with apps/web/package.json, then packages/realtime/package.json and packages/policy/package.json; runtime impact requires additional executable source or test evidence.

**Stated as unknown**:
- Atlas reports source currentness as not measured/source unbound and dependency completeness as unknown.
- No implementation code or focused tests are present at the recorded anchors, so runtime blast radius cannot be established.

