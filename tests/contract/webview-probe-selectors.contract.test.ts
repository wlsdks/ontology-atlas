import { describe, expect, it } from "vitest";

import { collectProbeSelectors, findDeadSelectors, readProbeSources } from "./lib/probe-selectors";

/**
 * WebView probe selectors ↔ the real UI (audit, 2026-07-25).
 *
 * ## Why it is needed — the same accident happened three times
 *
 * Desktop verification collects evidence through JS probes — the files under
 * `src-tauri/src/webview_verify/` plus the scripts still templated inside
 * `src-tauri/src/lib.rs` — that find UI with `document.querySelector`. But
 * **deleting UI does not delete the probes.**
 *
 * The 2026-07 map rebuild removed the Sigma renderer while the probes kept poking
 * at `.sigma-mouse` and `[data-testid="sigma-topology-viewport"]`, leaving two gates
 * (`desktop:verify-topology-frame-profile` and `:focus-noop`) **silently rotted into
 * a state no code could ever make pass**. The gates the project treats as
 * "installed-app proof" were dead.
 *
 * Three cases of the same family in this wave alone — the `desktop:check` ENOENT
 * crash (#64), `package:check` dying silently, and this. One shared cause: **a gate
 * not wired into CI rots, and you go on saying "proven" without knowing.** So this
 * test checks not the gate itself but **whether what the gate points at is still
 * alive**, in CI. It runs without an installed app, so it is always on.
 *
 * ## What it checks
 *
 * Every `data-testid` the Rust probes query that exists nowhere in `src/` or
 * `app/`. Deleting UI without deleting its probe is caught here immediately.
 *
 * ## Why there is an allowlist
 *
 * Probes also perform **optional evidence collection** — record it if present,
 * record its absence otherwise (graceful degradation). Such a selector pointing at
 * removed UI does not break the gate, so it is not an immediate defect — but it is
 * **noise that will eventually be misread**, so it is surfaced in a list and left as
 * cleanup. A growing list is itself a signal.
 */

/**
 * Optional evidence selectors that point at removed UI but **do not hard-fail**.
 *
 * Being listed here means "to be cleaned up", not "this is fine". Before adding an
 * entry, confirm the probe really degrades gracefully (it records a `reason` when
 * absent and the contract does not reject).
 */
const KNOWN_STALE_OPTIONAL = new Set([
  "topology-top-left-chrome-group",
]);

describe("WebView 프로브 셀렉터 계약", () => {
  const probeSources = readProbeSources(process.cwd());
  const selectors = collectProbeSelectors(probeSources);

  it("프로브가 실제로 testid 를 조회한다 (파서 자체가 죽지 않았는지)", () => {
    // If the parser returns 0, this whole test passes meaninglessly — that trap is blocked here.
    expect(selectors.length).toBeGreaterThan(10);
  });

  it("프로브가 찾는 testid 가 전부 살아 있는 UI 를 가리킨다", () => {
    const dead = findDeadSelectors(selectors, process.cwd());
    const unexpected = dead.filter((id) => !KNOWN_STALE_OPTIONAL.has(id));

    expect(
      unexpected,
      [
        "Rust WebView 프로브가 존재하지 않는 data-testid 를 조회한다.",
        "UI 를 지웠다면 프로브도 같이 고쳐라 — 안 그러면 게이트가 조용히 영구 실패한다.",
        `죽은 셀렉터: ${unexpected.join(", ")}`,
      ].join("\n"),
    ).toEqual([]);
  });

  it("allowlist 가 실제로 죽은 것만 담고 있다 (되살아난 항목은 빼라)", () => {
    // If the UI came back but the allowlist entry remains, the next deletion is silent.
    const dead = new Set(findDeadSelectors(selectors, process.cwd()));
    const revived = [...KNOWN_STALE_OPTIONAL].filter((id) => !dead.has(id));
    expect(revived, `allowlist 에서 제거할 항목: ${revived.join(", ")}`).toEqual([]);
  });

  it("Sigma 시대 셀렉터가 프로브에 남아 있지 않다 (이번 회귀 고정)", () => {
    // The two that actually killed a gate cannot return, not even via the allowlist.
    expect(probeSources).not.toContain(".sigma-mouse");
    expect(probeSources).not.toContain("canvas.sigma-nodes");
    expect(probeSources).not.toContain("sigma-topology-viewport");
  });
});
