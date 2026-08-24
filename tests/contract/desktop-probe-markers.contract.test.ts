import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readProbeSources } from "./lib/probe-selectors";

/**
 * **The probes that verify the installed app must not wait for things that do not
 * exist** (2026-08-11).
 *
 * ## Why (measured)
 *
 * `src-tauri/src/lib.rs` injects JS probes into the WebView to verify the installed
 * app's screens. Counting every `data-testid` those probes look for found that
 * **57 of 94 do not exist in the product** — they were waiting on Sigma-era DOM
 * (`sigma-*` · `data-skeleton-card` · `topology-node-popover-*` ·
 * `topology-path-*`). That renderer was removed when the map became a canvas.
 *
 * Actually running it ends like this:
 *
 * ```
 * [desktop-app-verify] WebView content verification failed:
 *   WebView did not attempt the Relief card drag verification
 *   (waiting for selectable domain:views card)
 * ```
 *
 * **CI referenced it 0 times.** A verification nobody runs that always fails when
 * run — what this repository calls a ghost gate, and believing it exists is worse
 * than not having it.
 *
 * ## What this contract does
 *
 * Every marker a probe looks for must **either exist in the product or be on the
 * retired list**. The retired list's count **only falls** (a ratchet), so the
 * remaining archaeology stays visible and the day a new probe starts waiting on a
 * non-existent marker it turns red.
 *
 * ## 2026-08-11, second pass — probes and assertions removed; what is left are reporters
 *
 * Running all 11 verification scripts, **not one passed.** The failures split three
 * ways, all of them the gate being stale: ① waiting for card DOM that no longer
 * exists ② measuring against the viewport while the product measures against the
 * **map** (cover 1448 vs 1512, centre off by 31.5 = half the rail) ③ **pinning
 * Korean copy verbatim** (`"Add concept"` · `"Concept name"` · `"Create"`) — the disease
 * this repository already banned in its documentation gates.
 *
 * So the whole family was retired: **1,154 lines** of Rust probe · **1,962 lines**
 * of unreachable contract assertions · 11 scripts · 11 `desktop:check`
 * requirements.
 *
 * ⚠️ **One gate went with it**: `script-vault-references.contract.test.ts` checked
 * that the vault nodes package.json's deep links point at really exist, and those
 * deep links belonged to exactly these retired scripts. When its target reached 0
 * its own idling guard fired first — **working as designed** (it does not stamp an
 * empty set) — so it was deleted rather than tweaked into passing. A gate with no
 * target is the shape this repository likes least.
 *
 * **The remaining 57 are reporters** — they query a marker and report the value,
 * with no assertion requiring it (the third test below locks that fact in).
 * Deleting them is right, but they live inside a huge injected JS string, so
 * changing everything at once surfaces mistakes one release cycle at a time. The
 * cap is held from growing while they are reduced.
 *
 * ## 2026-08-12, third pass — reporters removed, cap is 0
 *
 * **56 of the 57 were actually deleted** — the declarations querying retired
 * markers, together with the 645 marker fields whose values came only from those
 * declarations (all constant false/""/0/[]). Expressions mixing a live value
 * (`live || skeletonAttr`) kept the live side. Equivalence proof: old and new
 * probes were run against two identical DOMs (an empty DOM and a synthetic DOM with
 * live markers) and all 580 remaining markers matched down to their values.
 *
 * The 57th (`ai-local-model-listbox`) was **not retired — it was a blind spot in
 * the scanner**: the Select primitive **assembles** that marker at runtime as
 * `${dataTestid}-listbox` (`src/shared/ui/select.tsx`), so a source text search
 * misses it, but `desktop:verify-ai-settings:ko` really opens that listbox on every
 * run. A gate that scans source misses notation variants (design-gates.md,
 * "When a scanner sees only one notation"). So the
 * predicate below knows this one assembly rule, and if the assembling code
 * disappears the marker counts as missing again and the ratchet turns red.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * Cap on probe markers that **no longer exist in the product**. Measured 57 on
 * 2026-08-11; **0** after the 2026-08-12 cleanup.
 *
 * ⚠️ The first hand count was 53. The difference is **the counting definition** —
 * that count used `grep -rl` across every file type (including generated JSON and
 * copy catalogues), while this scanner reads only `.ts/.tsx/.css`. The cap must be
 * **what this scanner measures**. Picking whichever of the two numbers is
 * convenient means the gate starts passing on the strength of something it does not
 * measure.
 */
const RETIRED_MARKER_CAP = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(path)) out.push(path);
  }
  return out;
}

const productSource = [...walk(join(REPO_ROOT, "src")), ...walk(join(REPO_ROOT, "app"))]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

// The probes moved from raw strings in `lib.rs` into real files on 2026-08-24;
// `readProbeSources` concatenates `lib.rs` (still holding the templated scripts)
// with every `src-tauri/src/webview_verify/*.js` probe file.
const probeSource = readProbeSources(REPO_ROOT);

const huntedMarkers = [
  ...new Set([...probeSource.matchAll(/data-testid="([a-z0-9-]+)"/g)].map(([, id]) => id)),
].sort();

/**
 * The Select primitive assembles its listbox marker at runtime —
 * `data-testid={dataTestid ? \`${dataTestid}-listbox\` : undefined}`
 * (`src/shared/ui/select.tsx`). So `X-listbox` counts as present only while **the
 * assembling code is alive** and the trigger `X` really exists in the source. If
 * either disappears the marker counts as missing again — when the rule itself dies,
 * the gate turns red.
 */
const LISTBOX_COMPOSITION = "`${dataTestid}-listbox`";
const presentInProduct = (id: string): boolean => {
  if (productSource.includes(id)) return true;
  const suffix = "-listbox";
  return (
    id.endsWith(suffix) &&
    productSource.includes(LISTBOX_COMPOSITION) &&
    productSource.includes(`data-testid="${id.slice(0, -suffix.length)}"`)
  );
};

const missing = huntedMarkers.filter((id) => !presentInProduct(id));

describe("데스크톱 검증 프로브 표식 계약", () => {
  it("프로브가 표식을 실제로 찾고 있다 — 빈손으로 통과하지 않는다", () => {
    // The 2026-08-12 cleanup deleted 56 retired markers, leaving a measured 37. This
    // floor exists to prove the scanner is not idling, so it is only ever lowered to
    // match a measurement.
    expect(
      huntedMarkers.length,
      `프로브가 찾는 표식을 ${huntedMarkers.length}개만 뽑았다 — 스캐너가 헛돈다`,
    ).toBeGreaterThan(30);
    expect(productSource.length, "제품 소스를 못 읽었다").toBeGreaterThan(100_000);
  });

  it("리스트박스 조립 규칙이 빈 집합 위에서 공회전하지 않는다", () => {
    // The target this special case judges must exist today: a probe looks for
    // `ai-local-model-listbox`, and it counts as present only through the assembly
    // rule, not as a source string. If either breaks, the special case must be deleted
    // or re-measured.
    expect(huntedMarkers).toContain("ai-local-model-listbox");
    expect(productSource.includes("ai-local-model-listbox")).toBe(false);
    expect(presentInProduct("ai-local-model-listbox")).toBe(true);
  });

  /**
   * ⚠️ **When the count falls, lower the cap with it.** Otherwise everything cleared
   * becomes headroom again — this repository's ratchet discipline.
   */
  it("없는 표식을 기다리는 프로브가 늘지 않는다", () => {
    expect(
      missing.length,
      `프로브가 제품에 없는 표식 ${missing.length}개를 기다린다(상한 ${RETIRED_MARKER_CAP}). ` +
        `늘었다면 새 프로브가 이미 사라진 DOM 을 겨냥한 것이다:\n${missing.join(" ")}`,
    ).toBeLessThanOrEqual(RETIRED_MARKER_CAP);
  });

  /**
   * **No npm script invokes a retired verification.** A leftover script makes the
   * next person run it and read "the app is broken" when it is the verification that
   * is broken.
   */
  /**
   * **A retired verification must not come back as an assertion.** A reporter only
   * reports a value, but the moment a contract starts requiring that value the ghost
   * gate is back.
   */
  it("계약이 은퇴한 토폴로지 요구를 되살리지 않는다", () => {
    const contract = readFileSync(join(REPO_ROOT, "scripts/lib/verify-macos/payload-contract.mjs"), "utf8");
    const revived = [...contract.matchAll(/require(Topology\w+)/g)].map(([, name]) => name);
    expect(
      [...new Set(revived)],
      `은퇴한 토폴로지 요구가 계약에 다시 나타났다: ${[...new Set(revived)].join(", ")}`,
    ).toEqual([]);
  });

  it("죽은 플래그를 넘기는 스크립트가 없다", () => {
    const pkg = readFileSync(join(REPO_ROOT, "package.json"), "utf8");
    const deadFlags = [
      "--verify-topology-drag",
      "--verify-topology-selected-relation",
      "--verify-topology-focus-noop",
      "--verify-topology-frame-profile",
      "--verify-topology-node-popover",
      "--verify-topology-focus-zoom",
      "--verify-topology-create-node",
    ];
    const offenders = deadFlags.filter((flag) => pkg.includes(flag));
    expect(
      offenders,
      `package.json 이 은퇴한 검증 플래그를 넘긴다: ${offenders.join(", ")} — ` +
        `그 프로브는 제거된 Sigma DOM 을 기다리므로 반드시 실패한다.`,
    ).toEqual([]);
  });
});
