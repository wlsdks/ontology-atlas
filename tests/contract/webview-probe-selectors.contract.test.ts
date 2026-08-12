import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { collectProbeSelectors, findDeadSelectors } from "./lib/probe-selectors";

/**
 * WebView 프로브 셀렉터 ↔ 실제 UI 계약 (감사 2026-07-25).
 *
 * ## 왜 필요한가 — 같은 사고가 세 번 났다
 *
 * 데스크톱 검증은 `src-tauri/src/lib.rs` 안의 JS 프로브가 `document.querySelector`
 * 로 UI 를 찾아 증거를 수집한다. 그런데 **UI 를 지울 때 프로브는 같이 안 지워진다.**
 *
 * 2026-07 지도 재구성으로 Sigma 렌더러가 삭제됐는데 프로브는 `.sigma-mouse` 와
 * `[data-testid="sigma-topology-viewport"]` 를 계속 찔렀고, 두 게이트
 * (`desktop:verify-topology-frame-profile` · `:focus-noop`)가 **어떤 코드
 * 상태에서도 통과할 수 없는 상태로 조용히 썩어 있었다.** 프로젝트가
 * "installed-app proof" 로 삼는 게이트가 죽어 있었다는 뜻이다.
 *
 * 같은 계열이 이번 웨이브에만 세 번이다 — `desktop:check` ENOENT 크래시(#64),
 * `package:check` 조용한 사망, 그리고 이것. 공통 원인은 하나: **CI 에 물리지
 * 않은 게이트는 썩고, 썩은 걸 모른 채 "증명했다" 고 말하게 된다.** 그래서 이
 * 테스트는 게이트 자체가 아니라 **게이트가 가리키는 대상이 살아 있는지**를
 * CI 에서 검사한다. 설치 앱이 없어도 돌기 때문에 항상 켜져 있다.
 *
 * ## 무엇을 검사하나
 *
 * Rust 프로브가 조회하는 `data-testid` 중 `src/`·`app/` 어디에도 없는 것을
 * 찾는다. UI 를 지우면서 프로브를 안 지우면 여기서 즉시 잡힌다.
 *
 * ## 왜 allowlist 가 있나
 *
 * 프로브는 "있으면 기록, 없으면 그 사실을 기록" 하는 **선택적 증거 수집**도
 * 한다(graceful degrade). 그런 셀렉터는 사라진 UI 를 가리켜도 게이트를
 * 깨뜨리지 않으므로 즉시 결함은 아니다 — 다만 **잡음이고 언젠가 오독을 부르므로**
 * 목록으로 드러내 두고 정리 대상으로 남긴다. 목록이 늘어나면 그 자체가 신호다.
 */

const RUST_ENTRY = join(process.cwd(), "src-tauri", "src", "lib.rs");

/**
 * 사라진 UI 를 가리키지만 **hard-fail 하지 않는** 선택적 증거 셀렉터.
 *
 * 여기 있다는 것은 "정리 대상" 이라는 뜻이지 "괜찮다" 는 뜻이 아니다. 새 항목을
 * 추가하려면 그 프로브가 정말 graceful degrade 인지(= 없을 때 `reason` 을 세우고
 * 계약이 반려하지 않는지) 먼저 확인해야 한다.
 */
const KNOWN_STALE_OPTIONAL = new Set([
  "topology-top-left-chrome-group",
]);

describe("WebView 프로브 셀렉터 계약", () => {
  const rust = readFileSync(RUST_ENTRY, "utf8");
  const selectors = collectProbeSelectors(rust);

  it("프로브가 실제로 testid 를 조회한다 (파서 자체가 죽지 않았는지)", () => {
    // 파서가 0개를 돌려주면 이 테스트 전체가 무의미하게 통과한다 — 그 함정을 막는다.
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
    // UI 가 돌아왔는데 allowlist 에 남아 있으면, 다음에 또 지웠을 때 침묵한다.
    const dead = new Set(findDeadSelectors(selectors, process.cwd()));
    const revived = [...KNOWN_STALE_OPTIONAL].filter((id) => !dead.has(id));
    expect(revived, `allowlist 에서 제거할 항목: ${revived.join(", ")}`).toEqual([]);
  });

  it("Sigma 시대 셀렉터가 프로브에 남아 있지 않다 (이번 회귀 고정)", () => {
    // 실제로 게이트를 죽였던 두 개는 allowlist 로도 못 돌아온다.
    expect(rust).not.toContain(".sigma-mouse");
    expect(rust).not.toContain("canvas.sigma-nodes");
    expect(rust).not.toContain("sigma-topology-viewport");
  });
});
