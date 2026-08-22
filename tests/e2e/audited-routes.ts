/**
 * The single source for **which routes the accessibility and contrast ratchets must
 * sweep.**
 *
 * ## Why this file exists (2026-08-04)
 *
 * The two ratchets each carried a hand-written route array — `a11y-ratchet` 8,
 * `contrast-ratchet` 5 — while the authoritative inventory is derived from the
 * filesystem. Neither list recorded why it had that many, and in fact they were two
 * different subsets with no stated reason.
 *
 * That blind spot hid a defect: the 2026-08-03 round found ink on filled indigo at
 * **4.42:1** (below AA) on **the two 404 pages**, a place **neither ratchet had ever
 * looked at**. It is true that every baseline reached 0, but that 0 was "0 across 8
 * routes" — **a screen that was not measured is not a screen that passed.**
 *
 * So the lists were merged, and a missing route is recorded **not as absence but as
 * "excluded + reason"**. If a route that fell out silently is indistinguishable in
 * code from one deliberately excluded, the next person recreates the same blind
 * spot.
 *
 * ⚠️ **Adding a route means adding it here.** That is not left to human memory —
 * `tests/contract/audited-route-coverage.contract.test.ts` reads `app/[locale]/**`
 * directly and fails when a route is unclassified.
 */

/**
 * The URLs the ratchets actually open.
 *
 * Dynamic routes such as `[slug]` and `[segment]` are opened with **a value that
 * exists** — opening a non-existent slug falls through to 404 and measures the 404
 * rather than that route.
 *
 * ⚠️ **"Exists" means in the running data source, not in the build output.** Even
 * with `out/ko/project/<slug>/` present in the static export, if the vault the app
 * is reading at that moment (`samples/storefront/` when no vault is chosen) has no
 * such project, the screen is a degraded card or empty. The comments on the two
 * project lines below record what that cost, measured. `what-is-atlas` is emitted by
 * `src/views/gateway-doc/model/guide-pages.ts`, so it always exists regardless of
 * data source.
 */
export const AUDITED_ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  // ⚠️ The slug must exist in **the running data source, not the build output**
  // (corrected by measurement, 2026-08-04). The previous value was `ontology-atlas`
  // on the grounds that `out/ko/project/ontology-atlas/` exists in the static
  // export — but a route existing and that address rendering content are different
  // facts. Without a vault the app reads **`samples/storefront/`**, which has no
  // `ontology-atlas` project. So what the two URLs actually rendered was:
  //
  //   /ko/project/ontology-atlas/       → the "this project is not in the current
  //                                       folder" degraded card (40 elements in main)
  //   /ko/project/ontology-atlas/edit/  → "project not found", with
  //                                       **no `<main>` at all (0 elements)**
  //
  // In other words the two ratchets **never once saw** the project detail and edit
  // screens. Switching the slug to one present in the data source rendered 149 and
  // 227 elements respectively for the first time, and one axe violation
  // (`aria-valid-attr-value`) surfaced immediately.
  //
  // So this class cannot return silently, `a11y-ratchet` puts a **floor on the
  // element count inside `<main>`** per route — shell chrome alone yields 25 axe
  // rules and 6 contrast combinations, so the two previous collection guards would
  // pass a body of 0.
  "/ko/project/storefront/",
  "/ko/project/storefront/edit/",
  "/ko/project/new/",
  "/ko/project/fallback/",
  "/ko/git/",
  // Agents (added 2026-08-20, ledger 90). **Becoming a destination is what put it on
  // this list** — one of the real gains of the move: while this screen lived inside
  // the settings sheet, `audited-routes` being route-based meant **four gates could
  // not see it at all** (scroll padding, responsive overflow, cursor, Korean line
  // breaking) — measured by the workbench seat. Promotion switches all four on at
  // once.
  //
  // Measures the state with no tools installed — the web cannot spawn processes, so
  // it is the only state the ratchet can see, and it is also what a first-time
  // visitor sees.
  "/ko/agents/",
  "/ko/download/",
  "/ko/guide/",
  "/ko/guide/what-is-atlas/",
  "/ko/changelog/",
  // ── 404 ────────────────────────────────────────────────────────────────
  // Where the 2026-08-03 round found the AA failure — a screen the ratchets had
  // **never once** looked at.
  //
  // ⚠️ Corrected by measurement (2026-08-04 probe): not-found has two files
  // (`app/not-found.tsx` and `app/[locale]/not-found.tsx`) but **only the root one
  // ever renders.** Planting a low-contrast paragraph in the locale file and
  // measuring both URLs caught nothing; planting the same thing in the root file
  // turned **both URLs** red simultaneously. Exactly as the root file's own comment
  // predicted — with `output:'export'` plus Turbopack, `[locale]/not-found.tsx` may
  // never trigger. So `app/[locale]/not-found.tsx` is **unreachable code today** (a
  // separate round's problem).
  //
  // Both URLs are kept anyway: today that measures the same file twice, but the day
  // Next's not-found wiring changes and the locale file comes back, it stops that URL
  // silently introducing **a never-audited surface**. Three seconds of insurance.
  "/ko/this-route-does-not-exist/",
  "/this-route-does-not-exist/",
] as const;

/**
 * **Routes deliberately not measured, with the reason.**
 *
 * The key is the route pattern relative to `app/[locale]/` (the contract test above
 * matches on this key).
 */
export const EXCLUDED_ROUTES: Readonly<Record<string, string>> = {
  // A thin client-side redirect with **no screen of its own** — opening it shows the
  // destination, so measuring it measures the destination twice. The two legacy edit
  // addresses translate their query into the map's contextual workbench address. The
  // map's default state is covered by the list above, and the vault-backed relation
  // editing state is opened separately by `a11y-vault-backed.spec.ts`.
  "/ontology": "리다이렉트 → /topology?index=expanded — 목적지를 이미 잰다",
  "/ontology/edit": "호환 리다이렉트 → /topology contextual workbench — 목적지와 편집 상태를 이미 잰다",
  "/ontology/studio": "호환 리다이렉트 → /topology contextual workbench — 자기 화면이 없다",
};
