import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readProbeSources } from "./lib/probe-selectors";

/**
 * Every marker a desktop probe waits for must exist in the product or be on the retired list, whose
 * cap only falls. The Select primitive assembles `${dataTestid}-listbox` at runtime
 * (`src/shared/ui/fields/select.tsx`); the predicate knows it, so removing it turns the cap red.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * Cap on probe markers that no longer exist in the product. It must be what this scanner measures
 * (`.ts/.tsx/.css` only), not a count from a broader grep.
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

// `readProbeSources` concatenates `webview_verify/mod.rs` (the templated scripts)
// with every `src-tauri/src/webview_verify/*.js` probe file.
const probeSource = readProbeSources(REPO_ROOT);

const huntedMarkers = [
  ...new Set([...probeSource.matchAll(/data-testid="([a-z0-9-]+)"/g)].map(([, id]) => id)),
].sort();

/**
 * The Select primitive assembles its listbox marker at runtime —
 * `data-testid={dataTestid ? \`${dataTestid}-listbox\` : undefined}`
 * (`src/shared/ui/fields/select.tsx`). So `X-listbox` counts as present only while **the
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
    // Proves the scanner is not idling; only ever lowered to match a measurement.
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
      `The probes wait for ${missing.length} markers the product does not render (cap ${RETIRED_MARKER_CAP}). ` +
        `If this grew, a new probe targets DOM that is already gone:\n${missing.join(" ")}`,
    ).toBeLessThanOrEqual(RETIRED_MARKER_CAP);
  });

  /**
   * No npm script invokes a retired verification: a leftover script makes people read 'the app is
   * broken' when the verification is broken.
   */
  /**
   * A retired verification must not come back as an assertion: a reporter only reports a value, and
   * requiring it revives a ghost gate.
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
      `package.json passes retired verification flags: ${offenders.join(", ")}. ` +
        `Those probes wait for the removed Sigma DOM, so they always fail.`,
    ).toEqual([]);
  });
});
