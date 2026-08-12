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
 * ## 2026-08-11 2차 — 프로브와 단언은 걷어냈고, 남은 것은 «리포터»다
 *
 * 검증 스크립트 11개를 전부 돌려 보니 **하나도 통과하지 못했다.** 실패 이유가 셋으로
 * 갈렸고 셋 다 게이트 쪽이 낡은 것이었다: ① 없어진 카드 DOM 을 기다림 ② 뷰포트를
 * 기준으로 재는데 제품은 **지도**를 기준으로 함(덮개 1448 vs 1512, 가운데 31.5 = 레일
 * 절반) ③ **한국어 문구를 그대로 못박음**(`"개념 추가"` · `"개념 이름"` · `"만들기"`)
 * — 이 저장소가 문서 게이트에서 이미 금지한 그 병이다.
 *
 * 그래서 계열 전체를 은퇴시켰다: Rust 프로브 **1,154줄** · 도달 불가 계약 단언
 * **1,962줄** · 스크립트 11개 · `desktop:check` 요구 11개.
 *
 * ⚠️ **같이 없어진 게이트 하나**: `script-vault-references.contract.test.ts` 는
 * package.json 의 딥링크가 가리키는 볼트 노드가 실재하는지 봤는데, 그 딥링크를 갖고
 * 있던 것이 바로 이 은퇴한 스크립트들이었다. 대상이 0이 되자 그 게이트의 공회전 차단
 * 단언이 먼저 터졌다 — **설계대로 동작한 것**이고(빈 집합에 도장을 안 찍는다), 그래서
 * 통과시키려 손대는 대신 지웠다. 대상이 없는 게이트는 이 저장소가 가장 싫어하는 모양이다.
 *
 * **남은 57개는 「리포터」다** — 표식을 조회해 값을 보고할 뿐, 그 값을 요구하는 단언이
 * 하나도 없다(아래 세 번째 시험이 그 사실을 잠근다). 지우는 것이 맞지만 거대한
 * 주입 JS 문자열 안이라 한 번에 손대면 배포 한 사이클마다 실수가 드러난다. 상한이
 * 늘지 못하게 막아 두고 줄여 나간다.
 *
 * ## 2026-08-12 3차 — 리포터를 걷어냈고, 상한은 0이다
 *
 * 57개 중 **56개를 실제로 지웠다** — 은퇴 표식을 조회하던 선언과, 그 선언에서만
 * 값이 오는 마커 필드 645개(전부 상수 false/""/0/[]였다)를 함께 걷어냈다.
 * 산 값이 섞인 표현식(`live || skeletonAttr`)은 산 쪽을 남겼다. 등가 증명:
 * 옛/새 프로브를 같은 DOM 두 벌(빈 DOM · 라이브 표식 합성 DOM)에 돌려 남은
 * 마커 580개 전부가 값까지 동일했다.
 *
 * 57번째(`ai-local-model-listbox`)는 **은퇴가 아니라 스캐너의 맹점**이었다:
 * Select 프리미티브가 `${dataTestid}-listbox` 로 **런타임에 조립**하는
 * 표식이라(`src/shared/ui/select.tsx`) 소스 문자열 검색에 안 걸릴 뿐,
 * `desktop:verify-ai-settings:ko` 가 매 실행 실제로 여는 목록이다. 소스를 훑는
 * 게이트는 표기 변종을 놓친다(design-gates.md 「스캐너가 표기 하나만 보면」) —
 * 그래서 아래 판정이 이 조립 규칙 하나를 알고, 조립 코드가 사라지면 이 표식은
 * 다시 「없음」으로 계산되어 래칫이 빨개진다.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * 프로브가 찾는 표식 중 **제품에서 이미 사라진 것**의 상한. 2026-08-11 실측 57,
 * 2026-08-12 정리 후 실측 **0**.
 *
 * ⚠️ 처음 손으로 셌을 때는 53이었다. 차이는 **세는 정의**다 — 그때는 `grep -rl` 로
 * 파일 종류를 안 가리고 훑었고(생성된 JSON·문구 카탈로그까지 포함), 이 스캐너는
 * `.ts/.tsx/.css` 만 본다. 상한은 **이 스캐너가 재는 값**이어야 한다. 두 숫자 중
 * 편한 쪽을 고르면 그 순간부터 게이트가 자기가 안 재는 것을 근거로 통과한다.
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

const probeSource = readFileSync(join(REPO_ROOT, "src-tauri/src/lib.rs"), "utf8");

const huntedMarkers = [
  ...new Set([...probeSource.matchAll(/data-testid="([a-z0-9-]+)"/g)].map(([, id]) => id)),
].sort();

/**
 * Select 프리미티브는 목록 표식을 런타임에 조립한다 —
 * `data-testid={dataTestid ? \`${dataTestid}-listbox\` : undefined}`
 * (`src/shared/ui/select.tsx`). 그래서 `X-listbox` 는 **조립 코드가 살아 있고**
 * 트리거 `X` 가 소스에 실재할 때만 「있음」으로 친다. 둘 중 하나라도 사라지면
 * 이 표식은 다시 「없음」으로 계산된다 — 규칙 자체가 죽으면 게이트가 빨개진다.
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
    // 2026-08-12 정리에서 은퇴 표식 56개를 지워 실측 37이 됐다. 이 바닥은
    // 「스캐너가 헛돌지 않는다」를 재는 것이므로 실측 아래로만 내린다.
    expect(
      huntedMarkers.length,
      `프로브가 찾는 표식을 ${huntedMarkers.length}개만 뽑았다 — 스캐너가 헛돈다`,
    ).toBeGreaterThan(30);
    expect(productSource.length, "제품 소스를 못 읽었다").toBeGreaterThan(100_000);
  });

  it("리스트박스 조립 규칙이 빈 집합 위에서 공회전하지 않는다", () => {
    // 이 특례가 실제로 판정하는 대상이 오늘 존재해야 한다: 프로브가
    // `ai-local-model-listbox` 를 찾고 있고, 그것이 소스 문자열이 아니라
    // 조립 규칙으로만 「있음」이 된다. 둘 중 하나라도 깨지면 특례를 지우거나
    // 다시 재야 한다.
    expect(huntedMarkers).toContain("ai-local-model-listbox");
    expect(productSource.includes("ai-local-model-listbox")).toBe(false);
    expect(presentInProduct("ai-local-model-listbox")).toBe(true);
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
  /**
   * **은퇴한 검증이 「단언」으로 되살아나지 않는다.** 리포터는 값을 보고할 뿐이지만
   * 계약이 그 값을 다시 요구하기 시작하면 그 순간 유령 게이트가 돌아온다.
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
