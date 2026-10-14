import { describe, expect, it } from "vitest";

import { collectProbeSelectors, findDeadSelectors, readProbeSources } from "../lib/probe-selectors";

/**
 * Every `data-testid` the Rust probes query must exist in `src/` or `app/`: deleting UI does not
 * delete its probe, and a gate whose target is gone rots silently. Runs without an installed app, so
 * always on.
 */

/**
 * Optional evidence selectors that point at removed UI but **do not hard-fail**.
 *
 * Being listed here means "to be cleaned up", not "this is fine". Before adding an
 * entry, confirm the probe really degrades gracefully (it records a `reason` when
 * absent and the contract does not reject).
 */
const KNOWN_STALE_OPTIONAL = new Set<string>();

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
        "The Rust WebView probe queries a data-testid that does not exist.",
        "If the UI was removed, fix the probe with it; otherwise the gate fails silently and permanently.",
        `Dead selectors: ${unexpected.join(", ")}`,
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
