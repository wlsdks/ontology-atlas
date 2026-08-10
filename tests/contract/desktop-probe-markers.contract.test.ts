import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **설치된 앱을 검증하는 프로브가 「없는 것」을 기다리지 않는다** (2026-08-11).
 *
 * ## 왜 (실측)
 *
 * `src-tauri/src/lib.rs` 는 WebView 안에 JS 프로브를 심어 설치된 앱의 화면을 검증한다.
 * 그 프로브가 찾는 `data-testid` 를 전수로 세어 보니 **94개 중 57개가 제품에 없었다** —
 * Sigma 시절 DOM(`sigma-*` · `data-skeleton-card` · `topology-node-popover-*` ·
 * `topology-path-*`)을 기다리고 있었다. 그 렌더러는 캔버스 지도로 바뀌며 제거됐다.
 *
 * 실제로 돌려 보면 이렇게 끝난다:
 *
 * ```
 * [desktop-app-verify] WebView content verification failed:
 *   WebView did not attempt the Relief card drag verification
 *   (waiting for selectable domain:views card)
 * ```
 *
 * **CI 참조는 0개였다.** 아무도 안 돌리는데 돌리면 반드시 실패하는 검증 — 이 저장소가
 * 「유령 게이트」라고 부르는 것이고, 있다고 믿는 것이 없는 것보다 나쁘다.
 *
 * ## 이 계약이 하는 일
 *
 * 프로브가 찾는 표식이 **제품에 있거나, 은퇴 목록에 있거나** 둘 중 하나여야 한다.
 * 은퇴 목록의 수는 **줄기만 한다**(래칫) — 그래서 남은 고고학이 눈에 보이고, 새 프로브가
 * 없는 표식을 기다리기 시작하면 그날 빨개진다.
 *
 * 왜 한 번에 다 지우지 않았나: 프로브 본문이 1,000줄이 넘는 Rust 안의 주입 JS 라
 * 지우려면 컴파일까지 묶어야 한다. 그건 별 건으로 잇는다 — 대신 **오늘 상한을 박아**
 * 되돌아가지 못하게 한다.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * 프로브가 찾는 표식 중 **제품에서 이미 사라진 것**의 상한. 2026-08-11 실측 **57**.
 *
 * ⚠️ 처음 손으로 셌을 때는 53이었다. 차이는 **세는 정의**다 — 그때는 `grep -rl` 로
 * 파일 종류를 안 가리고 훑었고(생성된 JSON·문구 카탈로그까지 포함), 이 스캐너는
 * `.ts/.tsx/.css` 만 본다. 상한은 **이 스캐너가 재는 값**이어야 한다. 두 숫자 중
 * 편한 쪽을 고르면 그 순간부터 게이트가 자기가 안 재는 것을 근거로 통과한다.
 */
const RETIRED_MARKER_CAP = 57;

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

const probeSource = readFileSync(join(REPO_ROOT, "src-tauri/src/lib.rs"), "utf8");

const huntedMarkers = [
  ...new Set([...probeSource.matchAll(/data-testid="([a-z0-9-]+)"/g)].map(([, id]) => id)),
].sort();

const missing = huntedMarkers.filter((id) => !productSource.includes(id));

describe("데스크톱 검증 프로브 표식 계약", () => {
  it("프로브가 표식을 실제로 찾고 있다 — 빈손으로 통과하지 않는다", () => {
    expect(
      huntedMarkers.length,
      `프로브가 찾는 표식을 ${huntedMarkers.length}개만 뽑았다 — 스캐너가 헛돈다`,
    ).toBeGreaterThan(40);
    expect(productSource.length, "제품 소스를 못 읽었다").toBeGreaterThan(100_000);
  });

  /**
   * ⚠️ **줄어들면 상한도 같이 내린다.** 안 내리면 치운 만큼이 다시 여유가 된다 —
   * 이 저장소의 래칫 규율이다.
   */
  it("없는 표식을 기다리는 프로브가 늘지 않는다", () => {
    expect(
      missing.length,
      `프로브가 제품에 없는 표식 ${missing.length}개를 기다린다(상한 ${RETIRED_MARKER_CAP}). ` +
        `늘었다면 새 프로브가 이미 사라진 DOM 을 겨냥한 것이다:\n${missing.join(" ")}`,
    ).toBeLessThanOrEqual(RETIRED_MARKER_CAP);
  });

  /**
   * **은퇴한 검증을 부르는 npm 스크립트가 없다.** 스크립트가 남아 있으면 다음 사람이
   * 그것을 돌려 보고 「앱이 깨졌다」고 읽는다 — 실제로는 검증이 깨진 것이다.
   */
  it("죽은 플래그를 넘기는 스크립트가 없다", () => {
    const pkg = readFileSync(join(REPO_ROOT, "package.json"), "utf8");
    const deadFlags = [
      "--verify-topology-drag",
      "--verify-topology-selected-relation",
      "--verify-topology-focus-noop",
      "--verify-topology-frame-profile",
      "--verify-topology-node-popover",
    ];
    const offenders = deadFlags.filter((flag) => pkg.includes(flag));
    expect(
      offenders,
      `package.json 이 은퇴한 검증 플래그를 넘긴다: ${offenders.join(", ")} — ` +
        `그 프로브는 제거된 Sigma DOM 을 기다리므로 반드시 실패한다.`,
    ).toEqual([]);
  });
});
