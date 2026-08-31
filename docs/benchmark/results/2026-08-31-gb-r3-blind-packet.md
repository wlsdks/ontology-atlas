# Grading packet — 2026-08-31-gb-r3

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

## C01  (question B1)

**Answer**: An acknowledgement-state change belongs to the Coordination domain. The implicated capabilities are recording/publishing responder decisions and showing who has acknowledged them, with timeline presentation in the web console and update distribution through realtime. Read README.md first for the domain contract, then docs/SYSTEM-MAP.md for component ownership, followed by apps/web/package.json, packages/realtime/package.json, and packages/policy/package.json. Permission evaluation by the policy package is a recorded product dependency, but its runtime effect on acknowledgement changes is not proven because this repository contains only package manifests and product documentation, not implementation paths.

**Evidence given**:
- README.md: Coordination says responders publish decisions and see who has acknowledged them.
- README.md: Access Control says workspace owners decide who may read, coordinate, or administer an incident.
- docs/SYSTEM-MAP.md: the web console presents the incident timeline, realtime distributes timeline updates, and policy evaluates workspace permissions.
- apps/web/package.json, packages/realtime/package.json, and packages/policy/package.json identify the corresponding packages but expose no runtime implementation.

**Next step proposed**: If runtime source becomes available, trace the acknowledgement mutation from the web entry point through realtime publication and verify where policy authorization is enforced.

**Stated as unknown**:
- The acknowledgement data model, mutation handler, persistence mechanism, event schema, and concrete UI update path are absent.
- Whether policy checks gate acknowledgement writes, reads, broadcasts, or all three cannot be established from the available files.

## C02  (question G2)

**Answer**: No. Inventory reconciliation should remain in Inventory; Checkout/Purchase owns only turning a reviewed cart into a confirmed order. The recorded relationship is cross-boundary coordination: Checkout relies on trustworthy sellable-stock information maintained by Inventory. The reason is to prevent orders for unavailable stock while keeping purchase completion and inventory availability consistent enough to resolve exceptions before fulfillment.

**Evidence given**:
- docs/PRODUCT.md assigns order confirmation from a reviewed cart to Purchase and trustworthy sellable stock across storefront and warehouse to Inventory.
- README.md says merchants reconcile storefront and warehouse stock under Inventory, while Purchase handles cart-to-order completion.
- src/features/checkout/index.ts labels checkout as "purchase completion"; src/features/inventory-sync/index.ts separately labels inventory sync as "stock reconciliation".

**Next step proposed**: Verify the integration seam next: trace where Checkout reads, reserves, or validates Inventory availability, then confirm with an integration/contract test that reconciliation remains behind the Inventory boundary while Checkout consumes only the resulting availability decision.

**Stated as unknown**:
- The available files do not record a detailed API, reservation protocol, failure policy, or existing verification test for the Checkout–Inventory seam.

## C03  (question B2)

**Answer**: Permission evaluation belongs in Access Control, implemented by the policy package (`@relay/policy`), not in Coordination. Coordination owns responders publishing decisions and tracking acknowledgements. Workspace permission evaluation—and owner control over who may read, coordinate, or administer incidents—is explicitly outside Coordination.

**Evidence given**:
- `docs/SYSTEM-MAP.md` states: “The policy package evaluates workspace permissions.”
- `README.md` defines Coordination as publishing decisions and seeing acknowledgements.
- `README.md` separately defines Access Control as deciding who may read, coordinate, or administer an incident.
- `packages/policy/package.json` identifies the owning package as `@relay/policy`. 

**Next step proposed**: The receiving agent should verify the concrete `@relay/policy` API and its consumers, then confirm that Coordination calls that boundary without embedding permission rules. This checkout contains only package manifests and product documents, so implementation, call sites, and tests are not available to verify here.

**Stated as unknown**:
- The policy API, permission model, enforcement call sites, and tests are absent from the available files.
- The documents do not specify whether policy decisions are synchronous, cached, or enforced additionally at transport or UI boundaries.

## C04  (question B1)

**Answer**: Acknowledgement-state changes belong primarily to the Coordination domain. The directly involved capability is Acknowledgement Tracking; Decision Broadcast is a recorded dependent capability, and Workspace Authorization is a recorded prerequisite across the Access Control boundary. Read `apps/web` first, then `packages/realtime`, and consult `packages/policy` for the authorization boundary. In this repository those paths currently contain only package manifests, so `README.md` and `docs/SYSTEM-MAP.md` provide the available implementation-level context.

**Evidence given**:
- Atlas defines Coordination as owning decision state and containing Acknowledgement Tracking and Decision Broadcast.
- Atlas anchors Acknowledgement Tracking and the Web Console at `apps/web`.
- Atlas records `capabilities/decision-broadcast depends_on capabilities/acknowledgement-tracking`, with the rationale that acknowledgement is meaningful after publication.
- Atlas records `capabilities/acknowledgement-tracking depends_on capabilities/workspace-authorization`, with the rationale that acknowledgement display must respect workspace authority.
- Source inspection found acknowledgement behavior described in `README.md`, component responsibilities in `docs/SYSTEM-MAP.md`, and only name-only manifests under `apps/web`, `packages/realtime`, and `packages/policy`.
- Atlas explicitly marks dependency impact as declared with rationale but not source-backed, with unknown completeness; runtime and transitive impact remain unmeasured.

**Next step proposed**: Start implementation investigation at `apps/web`; trace any acknowledgement-state flow into `packages/realtime`, then inspect `packages/policy` only where authorization checks intersect that display or flow.

**Stated as unknown**:
- The recorded dependency from Decision Broadcast to Acknowledgement Tracking remains a product-level dependency, not proven runtime impact or a complete blast radius.
- The Acknowledgement Tracking dependency on Workspace Authorization is also declared ontology meaning rather than source-backed runtime execution.
- No acknowledgement implementation or exact test path is present in the inspected source snapshot.

## C05  (question G2)

**Answer**: No. Recorded project meaning keeps inventory reconciliation outside Checkout. Checkout authorizes a purchase and produces an order confirmation; Inventory Sync owns reconciling storefront availability with warehouse stock. Checkout depends on Inventory Sync, but does not absorb it.

**Evidence given**:
- Checkout boundary: includes turning a reviewed cart into a confirmed order; explicitly excludes inventory reconciliation.
- Inventory Sync boundary: includes sellable-stock reconciliation; explicitly excludes purchase confirmation.
- Recorded relationship: capabilities/checkout --depends_on--> capabilities/inventory-sync.
- Recorded reason: "Checkout depends on trustworthy sellable availability before it confirms a purchase."
- Source anchors remain separate: src/features/checkout/index.ts identifies purchase completion, while src/features/inventory-sync/index.ts identifies stock reconciliation.

**Next step proposed**: Read src/features/checkout/index.ts first, then src/features/inventory-sync/index.ts, and inspect nearby tests or callers to verify runtime interaction before changing the boundary. Atlas records no exact test path.

**Stated as unknown**:
- Runtime behavior is not measured by Atlas and the source anchors only name the features.
- No tests or callers are present in the recorded verification path, so dependency completeness remains unknown.
- Project competency answers have not been authored, so Atlas marks overall meaning currentness as invalid despite the explicit recorded boundary.

## C06  (question B1)

**Answer**: An acknowledgement-state change belongs to the Coordination domain. It involves the capability to publish incident decisions and see who has acknowledged them, with the web timeline as the presentation surface and realtime update distribution as the likely delivery capability. Read README.md first, then docs/SYSTEM-MAP.md, followed by apps/web/ and packages/realtime/; consult packages/policy/ if acknowledgement changes require permission checks. Policy involvement—and, more broadly, any concrete runtime propagation—is only a recorded product dependency, not proven runtime impact, because this repository contains package manifests and product documentation but no implementation source establishing call paths or state handling.

**Evidence given**:
- README.md defines Coordination as publishing decisions and seeing who has acknowledged them.
- README.md separately records Access Control: workspace owners govern read, coordinate, and administer permissions.
- docs/SYSTEM-MAP.md says the web console presents the incident timeline, packages/realtime distributes timeline updates, and packages/policy evaluates workspace permissions.
- apps/web/package.json, packages/realtime/package.json, and packages/policy/package.json identify the relevant packages, but no implementation files are present to prove runtime effects.

**Next step proposed**: Read implementation sources for apps/web and packages/realtime first if they become available; then verify whether acknowledgement mutations invoke packages/policy.

**Stated as unknown**:
- The acknowledgement state model, mutation entry point, persistence layer, and exact runtime consumers are not present.
- Whether policy evaluation actually runs on acknowledgement-state changes is not proven.

## C07  (question B2)

**Answer**: Permission evaluation belongs in the policy capability/package (`@relay/policy`), not in coordination. Coordination owns publishing responder decisions and tracking acknowledgements. Access control—including deciding and evaluating who may read, coordinate, or administer an incident—is explicitly outside coordination.

**Evidence given**:
- README.md defines Coordination as publishing decisions and showing acknowledgements.
- README.md defines Access Control separately as workspace-owner control over read, coordinate, and administer permissions.
- docs/SYSTEM-MAP.md explicitly states that the policy package evaluates workspace permissions.
- packages/policy/package.json identifies that package as `@relay/policy`; packages/realtime/package.json separately identifies the timeline-distribution package.

**Next step proposed**: The receiving agent should verify the current `@relay/policy` implementation or intended public API and identify its callers/integration points before changing code, especially whether the web console or realtime path must invoke it at a boundary.

**Stated as unknown**:
- The repository contains package manifests but no policy implementation source, so the concrete permission API and enforcement call sites cannot yet be confirmed.

## C08  (question B2)

**Answer**: Permission evaluation belongs in Access Control, implemented by the policy package—not in Coordination. Coordination is limited to publishing decisions and tracking acknowledgements; deciding who may read, coordinate, or administer an incident is explicitly outside it.

**Evidence given**:
- README.md defines Coordination as: responders publish decisions and see who has acknowledged them.
- README.md separately assigns permission decisions to Access Control and workspace owners.
- docs/SYSTEM-MAP.md states that packages/policy evaluates workspace permissions, while packages/realtime distributes timeline updates.

**Next step proposed**: The receiving agent should verify the @relay/policy package’s public contract and existing consumers, then ensure coordination/realtime calls that policy boundary rather than implementing authorization rules itself.

**Stated as unknown**:
- The available files do not define the policy API, permission model, enforcement call sites, or tests.

## C09  (question B1)

**Answer**: Acknowledgement state belongs to the Coordination domain. The relevant capabilities are coordinate (changing acknowledgement state) and read (viewing acknowledgements). Read README.md first for the domain and capability model, then docs/SYSTEM-MAP.md for component responsibilities; inspect apps/web and packages/realtime next if implementations are added. Realtime distribution is only a recorded product dependency: the system map says the realtime package distributes timeline updates, but the available source contains only package manifests, so no runtime impact from acknowledgement changes is proven.

**Evidence given**:
- README.md: Coordination says responders publish decisions and see who has acknowledged them.
- README.md: Access Control defines read, coordinate, and administer capabilities.
- docs/SYSTEM-MAP.md: The web console presents the incident timeline, and the realtime package distributes timeline updates.
- apps/web/package.json and packages/realtime/package.json contain package identities only; no acknowledgement-handling runtime code is present.

**Next step proposed**: Read README.md, docs/SYSTEM-MAP.md, apps/web, and packages/realtime in that order when tracing or implementing acknowledgement-state behavior.

**Stated as unknown**:
- Whether acknowledgement changes actually publish realtime timeline updates at runtime.
- The concrete permission checks, event schema, storage path, and UI update flow for acknowledgements.

## C10  (question G1)

**Answer**: Own the change in the existing Purchase responsibility, specifically the Checkout capability. Checkout owns converting a reviewed cart into a confirmed order. The only capability established as directly touched is Checkout; Inventory Sync is a declared dependency/adjacent capability to review because Checkout relies on trustworthy sellable availability, but the evidence does not establish that a discount rule must change inventory behavior.

**Evidence given**:
- Atlas: domains/purchase owns order confirmation; inventory owns sellable stock.
- Atlas: capabilities/checkout includes turning a reviewed cart into a confirmed order and excludes inventory reconciliation.
- Atlas: Checkout declares a dependency on capabilities/inventory-sync: trustworthy sellable availability is required before purchase confirmation.
- Read first: src/features/checkout/index.ts, the canonical Checkout entrypoint.
- Read second: src/features/inventory-sync/index.ts, as required by the Checkout handoff before changing its boundary.
- Then inspect src/widgets/cart-summary/index.ts if the rule affects reviewed-cart presentation or totals; this path is source-discovered, not an Atlas-declared capability anchor.
- Current source files contain only feature-identifying constants; README.md and docs/PRODUCT.md confirm the Purchase/Inventory boundary but define no discount behavior.
- No tests are present or recorded in the inspected repository paths.

**Next step proposed**: Before implementation, obtain the discount rule’s calculation, eligibility, timing, rounding, stacking, persistence, and display requirements; then inspect or create the Checkout implementation and tests within that confirmed scope.

**Stated as unknown**:
- What “discount rule” means: eligibility, percentage/fixed amount, scope, stacking, limits, or validity period.
- Whether the discount is applied before authorization, persisted on the order, or only displayed in the cart summary.
- Whether discounts affect inventory availability; no evidence establishes that they do.
- Money representation, currency handling, tax/shipping ordering, and rounding behavior.
- Expected failure behavior and required tests.
- Runtime behavior is unmeasured, Atlas source currentness is unavailable, and ontology competency meaning is not authored.

## C11  (question G2)

**Answer**: No. Inventory reconciliation should remain outside checkout. Checkout’s boundary is authorizing a reviewed purchase and producing confirmation; it explicitly excludes inventory reconciliation. Inventory Sync owns reconciling storefront availability with warehouse stock and explicitly excludes purchase confirmation.

**Evidence given**:
- Atlas records `capabilities/checkout --depends_on--> capabilities/inventory-sync`: “Checkout depends on trustworthy sellable availability before it confirms a purchase.”
- The responsibilities belong to separate recorded domains: checkout to `domains/purchase`, inventory sync to `domains/inventory`.
- Source anchors preserve the distinction: `src/features/checkout/index.ts` exports `purchase completion`; `src/features/inventory-sync/index.ts` exports `stock reconciliation`.
- No test or spec files were found in the repository.

**Next step proposed**: Verify behavior from `src/features/checkout/index.ts`, follow the dependency into `src/features/inventory-sync/index.ts`, then add or inspect integration tests proving reconciliation supplies trustworthy availability before checkout confirmation without transferring ownership into checkout.

**Stated as unknown**:
- Atlas reports source behavior as not measured and the project source as unbound.
- Runtime sequencing and enforcement remain unproven because the entrypoints are only labels and no tests are present.

## C12  (question B2)

**Answer**: Permission evaluation belongs in Access Control, specifically the Workspace Authorization capability anchored at `packages/policy`, not in Coordination. Coordination owns publishing, distributing, and acknowledging incident decisions; workspace permission evaluation and member authority are explicitly outside it.

**Evidence given**:
- Atlas: `domains/access-control` owns permission evaluation and excludes incident decision content.
- Atlas: `capabilities/workspace-authorization` evaluates whether members may read, coordinate, or administer an incident; it includes workspace permission decisions and excludes publishing or acknowledging decisions.
- Atlas: `domains/coordination` owns decision state, while member authority belongs to Access Control.
- Atlas: `capabilities/decision-broadcast` explicitly excludes workspace permission evaluation and member authority.
- Atlas records Acknowledgement Tracking as depending on Workspace Authorization because the web console must respect workspace authority while showing acknowledgement state.
- Source documentation agrees: `docs/SYSTEM-MAP.md` assigns permission evaluation to the policy package; `README.md` separates Coordination from Access Control.

**Next step proposed**: The receiving agent should inspect `packages/policy` as the authorization entry point, then verify that coordination consumers—starting with `packages/realtime` and acknowledgement handling in `apps/web`—consume authorization results without reimplementing permission rules. Locate or add verification around that integration boundary; no tests or implementation files are currently recorded beyond package manifests.

**Stated as unknown**:
- Atlas marks source currentness as unmeasured and runtime/transitive impact as unknown.
- No exact test path, runtime call path, or implementation beyond the package-level anchors exists in the inspected repository.

## C13  (question B1)

**Answer**: An acknowledgement-state change belongs primarily to the Coordination domain. The directly involved capability is Acknowledgement Tracking; Decision Broadcast is the related upstream Coordination capability, and Workspace Authorization is the cross-domain dependency in Access Control. Read `apps/web` first for acknowledgement display/state handling, then `packages/realtime` for decision distribution, and `packages/policy` for permission enforcement. In this repository those paths currently contain only package manifests, so no runtime propagation is proven. The declared dependency chain—Decision Broadcast → Acknowledgement Tracking → Workspace Authorization—remains recorded product meaning with rationale, not a source-backed or complete runtime impact assessment.

**Evidence given**:
- Atlas defines Coordination as owning publication and acknowledgement decision state, while member authority belongs to Access Control.
- Atlas records Acknowledgement Tracking at `apps/web`, Decision Broadcast at `packages/realtime`, and Workspace Authorization at `packages/policy`.
- Atlas states that Decision Broadcast depends on Acknowledgement Tracking because acknowledgement is meaningful only after publication.
- Atlas states that Acknowledgement Tracking depends on Workspace Authorization because the console must respect workspace authority while showing acknowledgement state.
- Source inspection found only `package.json` manifests at those anchors; `docs/SYSTEM-MAP.md` describes web presentation, realtime distribution, and policy permission evaluation but does not demonstrate runtime call paths.
- Atlas marks dependency impact as `declared_with_rationale`, `sourceBacked: false`, and completeness `unknown`; source currentness is also unmeasured.

**Next step proposed**: If runtime impact must be established, inspect or add the actual implementation and tests beneath `apps/web`, `packages/realtime`, and `packages/policy`; the present repository cannot prove it.

**Stated as unknown**:
- The concrete acknowledgement mutation handler and storage mechanism are absent or not represented in the available source tree.
- Runtime and transitive effects of acknowledgement changes remain unknown.
- Atlas competency evidence is not authored and its source binding/currentness is unavailable.

## C14  (question B1)

**Answer**: Acknowledgement-state changes primarily involve the Coordination domain and its Acknowledgement Tracking capability, alongside Decision Broadcast. Workspace Authorization in the Access Control domain is an adjacent capability because acknowledgement display must respect workspace permissions. Read `packages/realtime` first, then `apps/web`, and read `packages/policy` when checking authorization behavior. In this repository those paths currently contain only package manifests, so the ontology’s dependencies—Decision Broadcast → Acknowledgement Tracking and Acknowledgement Tracking → Workspace Authorization—remain recorded product relationships, not proven runtime or transitive impact.

**Evidence given**:
- Atlas defines Coordination as owning publication and acknowledgement of incident decisions; member authority belongs to Access Control.
- Atlas records `packages/realtime` for Decision Broadcast, `apps/web` for Acknowledgement Tracking, and `packages/policy` for Workspace Authorization.
- The Decision Broadcast handoff explicitly says to start with the realtime package and then check acknowledgement tracking.
- `docs/SYSTEM-MAP.md` says the web console presents the incident timeline, realtime distributes timeline updates, and policy evaluates workspace permissions.
- The three recorded source directories contain only `package.json` files naming their packages; no executable implementation or tests establish runtime call paths.
- Atlas reports dependency impact as `sourceBacked: false`, with `completeness: unknown`; source currentness is also `not_measured` because the project source is unbound.

**Next step proposed**: If runtime impact must be established, locate or add the actual realtime, web-console, and policy implementations and tests, then trace acknowledgement-state producers, consumers, and authorization checks from those sources.

**Stated as unknown**:
- Whether changing acknowledgement state actually executes code in the realtime or policy packages.
- The complete runtime and transitive blast radius.
- Exact test paths; Atlas records none and the repository currently contains no tests.

## C15  (question G1)

**Answer**: The existing Purchase responsibility should own the change, but only insofar as the discount participates in turning a reviewed cart into a confirmed order. It touches the Purchase capability and likely the cart-review presentation boundary. No source or product document supports assigning discount logic to Inventory. Read `docs/PRODUCT.md`, `README.md`, `src/features/checkout/index.ts`, and `src/widgets/cart-summary/index.ts` first. The repository contains no existing discount implementation or documented rule behavior.

**Evidence given**:
- `docs/PRODUCT.md` states: “Purchase owns order confirmation from a reviewed cart.”
- `README.md` states that Purchase owns turning a reviewed cart into a confirmed order and describes cart review, payment authorization, and order confirmation.
- `src/features/checkout/index.ts` identifies checkout as the `purchase completion` feature.
- `src/widgets/cart-summary/index.ts` is the only source path representing cart-summary presentation.
- Inventory is documented as owning trustworthy sellable stock and stock reconciliation; neither product documents nor `src/features/inventory-sync/index.ts` connect it to discounts.
- The inspected repository contains only checkout, cart-summary, inventory-sync, and theme-toggle stubs; no discount, pricing, promotion, totals, payment, tax, or order model is present.

**Next step proposed**: Clarify the discount contract before implementation, then begin design at the Purchase checkout boundary and cart-summary boundary; introduce any new pricing capability only if the clarified requirements justify it.

**Stated as unknown**:
- What kind of discount rule is intended: code-based, automatic, item-level, cart-level, percentage, fixed amount, or another form.
- Eligibility, validity dates, usage limits, stacking and precedence rules, rounding, currency behavior, and maximum-discount constraints.
- Whether discounts must be shown during cart review, persisted on the confirmed order, or revalidated during checkout.
- Required interactions with tax, shipping, payment authorization, refunds, and inventory reservation.
- Where cart totals and confirmed orders are modeled, because those implementations do not exist in the available source files.
- Expected APIs, storage, tests, failure behavior, and migration or compatibility requirements.

## C16  (question G1)

**Answer**: Purchase should own the discount-rule change because it owns turning a reviewed cart into a confirmed order. The change touches cart review/summary and purchase completion; it may also affect payment authorization and order confirmation if discounts change the authorized or recorded total, but the repository does not establish that behavior. Read `src/features/checkout/index.ts` first, followed by `src/widgets/cart-summary/index.ts`. Inventory is not an established owner or capability for this change unless the proposed rule depends on stock, which is unspecified.

**Evidence given**:
- `README.md`: Purchase owns turning a reviewed cart into a confirmed order; the documented flow includes cart review, payment authorization, and order confirmation.
- `docs/PRODUCT.md`: Purchase owns order confirmation from a reviewed cart, while Inventory owns trustworthy sellable stock.
- `src/features/checkout/index.ts`: identifies checkout as the `purchase completion` feature.
- `src/widgets/cart-summary/index.ts`: identifies the cart-summary UI path relevant to reviewing discounted cart totals.
- `src/features/inventory-sync/index.ts`: contains only stock-reconciliation responsibility; no discount behavior is present.
- The inspected source and product documents contain no existing discount implementation, pricing module, rule engine, tests, or detailed checkout behavior.

**Next step proposed**: Define the discount rule’s inputs, eligibility, calculation and rounding semantics, stacking policy, lifecycle timing, and required presentation before selecting concrete implementation points beyond checkout and cart summary.

**Stated as unknown**:
- Discount type and calculation formula.
- Eligibility criteria and whether rules can stack.
- Currency, rounding, tax, shipping, and refund interactions.
- Whether payment authorization and order records use pre-discount or discounted totals.
- Whether discounts depend on inventory or product data.
- Persistence, validation, API, UI, and audit requirements.
- Expected tests and acceptance criteria.

## C17  (question G2)

**Answer**: No. Recorded project meaning keeps inventory reconciliation outside checkout.

**Evidence given**:
- Boundary: Checkout authorizes a purchase and produces an order confirmation; it includes converting a reviewed cart into a confirmed order and explicitly excludes inventory reconciliation. Inventory Sync owns reconciliation of storefront availability with warehouse stock and excludes purchase confirmation.
- Relationship: capabilities/checkout depends_on capabilities/inventory-sync. Recorded reason: "Checkout depends on trustworthy sellable availability before it confirms a purchase."
- Source anchors confirm separate entrypoints: src/features/checkout/index.ts identifies purchase completion, while src/features/inventory-sync/index.ts identifies stock reconciliation.

**Next step proposed**: Read src/features/checkout/index.ts first, then src/features/inventory-sync/index.ts, and inspect or discover tests near both anchors before changing the boundary; Atlas records no exact test path.

**Stated as unknown**:
- Atlas marks source behavior as not measured and meaning competency answers as unauthored. The current source files only expose feature labels, so runtime behavior and dependency completeness remain unverified.

## C18  (question B2)

**Answer**: Permission evaluation belongs in Access Control, specifically the Workspace Authorization capability anchored at `packages/policy`, not in Coordination. Coordination owns incident decision state—publishing, distributing, and acknowledging decisions. Explicitly outside Coordination are workspace permission evaluation and member authority; conversely, Access Control does not own incident decision content.

**Evidence given**:
- Atlas `domains/coordination`: “Coordination owns decision state; member authority belongs to access control.”
- Atlas `domains/access-control`: “Access control owns permission evaluation; it does not own incident decision content.”
- Atlas `capabilities/workspace-authorization`: includes workspace permission decisions and excludes publishing or acknowledging incident decisions; its recorded path is `packages/policy`.
- Atlas `capabilities/decision-broadcast`: explicitly excludes workspace permission evaluation and member authority.
- Source inspection confirms `packages/policy/package.json` defines `@relay/policy`, but the repository contains no policy implementation or tests beyond that package manifest.

**Next step proposed**: The receiving agent should inspect or implement the authorization entry point under `packages/policy`, then verify with tests that read/coordinate/administer permission decisions stay there and that Coordination only consumes authorization outcomes while retaining ownership of decision publication and acknowledgement. Because Atlas reports source currentness as unmeasured and records no exact test path, the agent must discover or add those tests rather than infer runtime behavior from the package map.

**Stated as unknown**:
- No runtime permission-evaluation implementation is present in the inspected source.
- No exact test path or complete runtime/transitive impact is recorded.
- Atlas reports the project source as unbound/not measured, so the recorded paths are anchors rather than current behavior proof.

## C19  (question G1)

**Answer**: Purchase should own the discount-rule change because it owns turning a reviewed cart into a confirmed order. The explicitly supported capabilities it may touch are cart review and purchase completion; payment authorization and order confirmation are adjacent Purchase capabilities, but whether the rule changes them is unknown. Read `src/features/checkout/index.ts` first, followed by `src/widgets/cart-summary/index.ts`. There is no evidence that Inventory or interface preferences should own the rule.

**Evidence given**:
- `README.md`: Purchase owns turning a reviewed cart into a confirmed order; its flow includes cart review, payment authorization, and order confirmation.
- `docs/PRODUCT.md`: Purchase owns order confirmation from a reviewed cart, while Inventory owns trustworthy sellable stock.
- `src/features/checkout/index.ts`: identifies checkout as the `purchase completion` feature.
- `src/widgets/cart-summary/index.ts`: identifies the cart-summary widget, the only source path explicitly associated with reviewing cart information.
- `src/features/inventory-sync/index.ts`: concerns stock reconciliation, with no documented pricing or discount behavior.
- `src/features/theme-toggle/index.ts`: concerns interface preferences and is unrelated by the available evidence.

**Next step proposed**: Define the requested rule’s trigger, calculation basis, stacking/precedence, rounding, eligibility, display requirements, and effect on payment/order records; then trace those requirements through checkout and cart summary before changing code.

**Stated as unknown**:
- What kind of discount is intended: percentage, fixed amount, item-level, cart-level, coupon-based, automatic, or another form.
- Eligibility conditions, validity periods, usage limits, and whether discounts can stack.
- Whether discounts apply before or after taxes, shipping, fees, or other adjustments.
- Currency and rounding rules.
- Whether cart summary must display eligibility, labels, original prices, or discount breakdowns.
- Whether payment authorization and persisted order confirmation must use or record the discounted amount.
- Whether rejected or expired discounts need user-facing errors.
- Whether discount behavior has any inventory implications; the available documents do not establish one.
- No implementation logic, tests, domain types, persistence paths, or external pricing/payment integrations are present in the available source files.

## C20  (question G1)

**Answer**: Provisional owner: Checkout (`capabilities/checkout`) in the Purchase domain, but only if the discount rule participates in turning a reviewed cart into a confirmed order. The known capability surface is Checkout plus its declared dependency, Inventory Sync. Read `src/features/checkout/index.ts` first, followed by `src/features/inventory-sync/index.ts`.

**Evidence given**:
- Atlas defines Checkout as authorizing a purchase and producing an order confirmation; its boundary includes turning a reviewed cart into a confirmed order.
- Atlas explicitly excludes inventory reconciliation from Checkout and assigns that concern to the Inventory Sync dependency.
- Atlas records `src/features/checkout/index.ts` as Checkout’s canonical entrypoint and instructs readers to inspect the inventory capability next.
- The checkout source currently exposes only `checkoutFeature = 'purchase completion'`; the inventory source exposes only `inventorySyncFeature = 'stock reconciliation'`. No discount behavior or tests were found in the bounded source inventory.
- Atlas reports the dependency as declared with rationale but not source-backed, with unknown impact completeness.

**Next step proposed**: Clarify where the discount is computed and applied—before cart review, during purchase confirmation, or elsewhere—then inspect nearby callers/tests starting from `src/features/checkout/index.ts`; keep Inventory Sync in scope only where availability affects confirmation.

**Stated as unknown**:
- Whether the requested rule calculates, validates, displays, or merely applies a discount.
- Whether discounting occurs inside Checkout’s documented boundary or requires a responsibility not represented in the ontology.
- Runtime behavior is unmeasured because the Atlas project source is unbound.
- No exact test path is recorded, and no tests appeared in the bounded repository file inventory.
- The ontology’s competency assessment is not authored, so semantic coverage is incomplete.
- The declared Checkout → Inventory Sync impact is not verified by current source evidence.

## C21  (question G2)

**Answer**: No. Inventory reconciliation should remain in Inventory; Checkout/Purchase owns only turning a reviewed cart into a confirmed order. The recorded relationship is that purchase completion must stay consistent with inventory availability, not absorb reconciliation. The reason is to prevent orders for unavailable stock and let merchants resolve exceptions before fulfillment.

**Evidence given**:
- docs/PRODUCT.md assigns order confirmation from a reviewed cart to Purchase and trustworthy sellable stock to Inventory.
- README.md says Purchase confirms orders, while Inventory reconciles storefront and warehouse stock.
- src/features/checkout/index.ts labels checkout as "purchase completion"; src/features/inventory-sync/index.ts separately labels inventory sync as "stock reconciliation".

**Next step proposed**: Verify the integration boundary by tracing how checkout obtains an availability or reservation decision from inventory while reconciliation remains behind src/features/inventory-sync. Then check the relevant integration/contract tests; none are present in the supplied files, so runtime coupling is not yet verifiable here.

**Stated as unknown**:
- The supplied source and product documents do not record the concrete API, event, reservation protocol, or failure behavior between Checkout and Inventory.

## C22  (question G1)

**Answer**: The bounded existing owner is the Purchase responsibility (`domains/purchase`), through Checkout (`capabilities/checkout`), because Purchase owns turning a reviewed cart into a confirmed order. Checkout is the directly touched capability. Inventory Sync is an adjacent dependency to inspect, but Atlas assigns it sellable-stock reconciliation and explicitly excludes purchase confirmation, so no Inventory change is justified yet. Read `src/features/checkout/index.ts` first, then `src/features/inventory-sync/index.ts`; inspect `src/widgets/cart-summary/index.ts` only if the proposed rule changes the reviewed-cart summary or display.

**Evidence given**:
- Atlas defines Purchase as the responsibility for turning a reviewed cart into a confirmed order and says Purchase owns order confirmation.
- Atlas defines Checkout as authorizing a purchase and producing an order confirmation, with `src/features/checkout/index.ts` as its canonical entrypoint.
- Checkout declares a dependency on Inventory Sync because confirmation requires trustworthy sellable availability.
- Atlas defines Inventory Sync as stock reconciliation and explicitly excludes purchase confirmation.
- The inspected implementation files currently contain only feature-name constants; they do not reveal discount behavior. `docs/PRODUCT.md` confirms the Purchase/Inventory boundary but says nothing about discounts.

**Next step proposed**: Specify the discount rule’s trigger, calculation, application stage, and whether it changes stock eligibility or only order pricing; then trace the checkout entrypoint and nearby tests before selecting concrete code changes.

**Stated as unknown**:
- Whether the discount is calculated before cart review, during checkout, or after confirmation.
- Whether it affects pricing only, tax, payment authorization, inventory eligibility, or presentation.
- Whether `cart-summary` participates in calculation or only display.
- The concrete checkout and inventory runtime flow; the recorded source entrypoints are stubs.
- No exact test path is recorded or present in the inspected file list.
- Atlas source currentness is unmeasured and project competency meaning is not authored, so dependency completeness remains unknown.

## C23  (question B2)

**Answer**: Permission evaluation belongs in the Access Control domain, specifically the Workspace Authorization capability anchored at packages/policy—not in Coordination. Coordination owns incident decision state: publishing decisions and tracking acknowledgements. Member authority and workspace permission decisions are explicitly outside Coordination; conversely, Access Control does not own incident decision content.

**Evidence given**:
- Atlas domains/access-control: “Access control owns permission evaluation; it does not own incident decision content.”
- Atlas domains/coordination: “Coordination owns decision state; member authority belongs to access control.”
- Atlas capabilities/workspace-authorization places permission decisions in domains/access-control, includes workspace permission decisions, excludes publishing or acknowledging incident decisions, and records packages/policy as its implementation anchor.
- docs/SYSTEM-MAP.md says the policy package evaluates workspace permissions; README.md assigns read, coordinate, and administer authority to Access Control.
- Source inspection found only package manifests and documentation—no implementation or tests proving runtime behavior.

**Next step proposed**: The receiving agent should inspect or implement packages/policy and verify tests for read, coordinate, and administer permission decisions. It should also verify that Coordination merely consumes an authorization result at its boundary and retains ownership of publishing and acknowledgement behavior. Because Atlas reports source currentness as unmeasured/source-unbound and records no exact test path, runtime integration and transitive impact must remain unclaimed until verified.

**Stated as unknown**:
- No permission-evaluation implementation or tests are present in the inspected repository snapshot.
- The runtime call path between Coordination and packages/policy is not recorded or source-proven.
- Runtime and transitive impact remain unmeasured.

## C24  (question G2)

**Answer**: No. Inventory reconciliation should not move into checkout. The boundary is: Purchase/checkout owns turning a reviewed cart into a confirmed order; Inventory owns maintaining and reconciling trustworthy sellable stock across storefront and warehouse. The recorded relationship is consistency between purchase completion and inventory availability, so merchants can resolve stock exceptions before fulfillment—not ownership of reconciliation by checkout.

**Evidence given**:
- docs/PRODUCT.md: Purchase owns order confirmation from a reviewed cart; Inventory owns trustworthy sellable stock across storefront and warehouse.
- docs/PRODUCT.md: The product goal is to keep purchase completion and inventory availability consistent enough for merchants to resolve exceptions before fulfillment.
- README.md: Checkout covers cart review, payment authorization, and order confirmation; Inventory covers stock reconciliation across storefront and warehouse.
- src/features/checkout/index.ts names checkout as "purchase completion"; src/features/inventory-sync/index.ts separately names inventory sync as "stock reconciliation".

**Next step proposed**: Verify the proposal against the checkout and inventory-sync entry points and their tests/contracts: checkout may consume an inventory availability result, but reconciliation logic should remain under inventory-sync. If the required interaction is not encoded yet, define and test that interface before relocating any implementation.

**Stated as unknown**:
- The available files do not record a more specific API, event, or test suite for the checkout-to-inventory interaction.

