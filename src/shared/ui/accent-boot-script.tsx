/**
 * Boot script that applies the accent palette **before the first paint** (2026-08-18).
 *
 * **Why an inline script.** The app's only accents are indigo (default) and ember
 * (alternative); the choice lives in localStorage
 * (`src/shared/lib/appearance-preferences.ts`) and CSS reads it as
 * `:root[data-accent="ember"]`. Setting that attribute from a React effect paints
 * **the first frame in the default** and then snaps to ember — a colour the user did
 * not pick, flashed once. So it is planted by a synchronous script that runs before
 * the render tree. This is the standard dark-mode-toggle technique, shorter here
 * because only one attribute changes.
 *
 * **Why its own file rather than inside `layout.tsx`.**
 * `tests/contract/json-ld-script-safety.contract.test.ts` blocks re-creating raw
 * script injection in files that use the central `JsonLd` boundary. That rule is
 * right: escaping responsibility has to stay in one place so data can never close
 * the boundary with `</script>`. This script follows the same grammar and gets its
 * own name and file.
 *
 * **Why this script cannot cause that accident.** No data enters it. Every string is
 * a constant with no interpolation — the absence of `${` in the body below is the
 * contract, and a contract test asserts it. A script that needs to take a value
 * requires a new escaping boundary like `JsonLd`, not an edit to this file.
 *
 * `appearance-preferences.ts` owns the key and the default. If the strings
 * hardcoded here drift from it,
 * `tests/contract/accent-palette-switch.contract.test.ts` fails — the symptom of a
 * drift is "the colour sometimes flashes once", which nobody files as a bug.
 */
const ACCENT_BOOT = [
  "try{",
  "var a=localStorage.getItem('ontology-atlas:accent:v1');",
  "if(a==='ember')document.documentElement.setAttribute('data-accent','ember');",
  "}catch(e){}",
].join("");

/**
 * **Where this script may live — three placements that each cost something**
 * (2026-08-18). A bare raw `<script>` in the layout tree failed in a different way
 * everywhere it was tried, and each failure arrived three hops away: a React
 * warning → the "N Issues" badge in the Next dev overlay → that badge caught by the
 * `hover-contrast` e2e spec, turning it red.
 *
 * ① Direct child of `<html>` — *"In HTML, `<script>` cannot be a child of `<html>`"*
 *    plus *"Cannot render a sync or defer `<script>` outside the main document"*.
 *    3–4 dev issues per route.
 * ② First child of `<body>` — quiet on server-rendered routes, but on a
 *    **client-rendered** route (the locale-less 404): *"Encountered a script tag
 *    while rendering React component — scripts inside React components are never
 *    executed when rendering on the client"*. It did not even run there.
 * ③ An explicit `<head>` — React's own prescription, but rendering `<head>` directly
 *    in this repo's root layout turns the not-found path into a **500** (measured on
 *    `/ko/this-route-does-not-exist/`): the price of taking a slot Next owns.
 *
 * **Generalisation**: where an inline boot script lives is a contract, not a
 * preference. And the signal for breaking it is not "the script does not run" but
 * **an unrelated gate turning red** — when an audit catches a control we never
 * built, suspect the dev overlay first.
 */
export function AccentBootScript() {
  /*
   * `async` here is **the marker that tells React 19 to hoist this into the
   * document**, not an instruction to defer. Per the HTML spec the attribute has no
   * effect on an inline script (it only means something for external ones), so this
   * still runs synchronously where it is parsed — hence no flash. React hoists it
   * into `<head>`, so wherever it sits in the render tree it lands in the document
   * once, in the right place.
   *
   * Drop that one word and React says exactly this: *"Cannot render a sync or defer
   * `<script>` outside the main document without knowing its order. Try adding
   * async="" or moving it into the root `<head>` tag."* This follows that
   * prescription verbatim.
   */
  return <script async dangerouslySetInnerHTML={{ __html: ACCENT_BOOT }} />;
}
