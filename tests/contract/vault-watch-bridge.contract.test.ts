import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **폴더 감시 브리지가 양쪽에 다 살아 있는지** 지키는 게이트.
 *
 * ## 왜 생겼나
 *
 * 2026-07-29 시연 영상 시나리오 판정에서 나온 실측: *"고치면 지도가 즉시
 * 따라온다"* 의 **즉시성 자체가 데스크톱 전용 능력**이다(앱 = OS 워처 500ms
 * 디바운스, 웹 = 적응형 폴링). 그 영상이 파는 능력인데, 능력 브리지 표
 * (`.claude/rules/surfaces.md`)에 **등재돼 있지 않았다** — 다섯 개만 있고
 * 이건 여섯 번째였다.
 *
 * 등재하지 않은 능력은 아무도 지키지 않는다. 워처가 조용히 끊겨도 앱은
 * 폴링 없이 **아무것도 안 하게** 되고(웹과 달리 앱에는 폴백이 없다), 그
 * 사이 영상은 계속 그 능력을 판다.
 *
 * ## 왜 `DEGRADED_SURFACES` 가 아닌가
 *
 * 그 등록부의 각 행은 *"브라우저는 원리적으로 이걸 못 한다 → 유일한 목적지는
 * `/download/`"* 를 주장한다. 폴더 감시는 그 주장이 **거짓**이다 — 웹도 결국
 * 따라오고, 다른 것은 *언제* 다. 넣으면 다음 감사자가 "웹은 파일 변화를 못
 * 본다"로 읽는다. 강등이 아니라 **지연**이라 축이 다르고, 축이 다르면 게이트도
 * 다르다.
 */

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("폴더 감시 브리지", () => {
  it("앱 쪽: Rust 워처가 디바운스와 함께 vault-changed 를 emit 한다", () => {
    const rust = read("src-tauri/src/lib.rs");
    expect(rust, "start_vault_watch 커맨드가 사라졌다").toContain("start_vault_watch");
    expect(rust, "vault-changed 이벤트 이름이 바뀌었다 — 프런트 리스너와 짝이 깨진다").toContain(
      "vault-changed",
    );
    expect(
      rust,
      "디바운서가 사라졌다. 에디터의 다중 write 가 그대로 새어 나와 매 저장마다 " +
        "전체 refresh 가 돈다 — 영상이 파는 '즉시'가 '깜빡임'이 된다.",
    ).toContain("new_debouncer");
  });

  it("프런트 쪽: 그 이벤트를 실제로 듣는 다리가 있다", () => {
    const bridge = read("src/features/docs-vault-local/model/TauriVaultWatchBridge.tsx");
    expect(bridge).toContain("start_vault_watch");
    expect(
      bridge,
      "리스너가 없으면 Rust 가 이벤트를 쏴도 화면은 아무 일도 하지 않는다 — " +
        "가장 조용한 종류의 고장이다.",
    ).toContain("vault-changed");
  });

  it("웹 쪽: 폴링 폴백이 살아 있다 — 웹이 '못 하는' 게 아니라 '늦는' 것이다", () => {
    const cadence = read("src/features/docs-vault-local/model/poll-cadence.test.ts");
    expect(
      cadence,
      "폴링 케이던스가 사라지면 웹은 파일 변화를 정말로 못 보게 된다. 그러면 " +
        "이 능력은 강등 축으로 넘어가고 DEGRADED_SURFACES 등재가 필요해진다.",
    ).toMatch(/burstMs|idleMs/);
  });

  it("등록부에 여섯 번째 브리지로 적혀 있다", () => {
    const rules = read(".claude/rules/surfaces.md");
    /**
     * ⚠️ **표의 `행`을 겨눈다 — 단어가 아니라.**
     *
     * 처음엔 `toContain("폴더 감시")` 였는데, 그 문자열이 바로 아래 산문 제목
     * ("폴더 감시는 「강등」이 아니라 「지연」이다")에도 있어서 **표에서 행을
     * 통째로 빼도 통과했다**(프로브 실측 2026-07-29). 게이트가 지키려던 것은
     * 설명이 아니라 **등재**인데, 설명만 있어도 만족되고 있었다.
     *
     * 그래서 행의 구조를 본다: 파이프로 시작하고 · 능력 이름을 담고 ·
     * 구현 파일을 가리키는 한 줄. 산문은 이 모양이 될 수 없다.
     */
    const bridgeRow = rules
      .split("\n")
      .find((line) => line.startsWith("|") && line.includes("폴더 감시"));
    expect(
      bridgeRow,
      "`.claude/rules/surfaces.md` 의 **능력 브리지 표**에 폴더 감시 행이 없다. " +
        "등재되지 않은 능력은 웹 강등도 검증되지 않고, 마케팅이 그것을 팔 때 " +
        "받쳐 줄 계약이 없다.",
    ).toBeDefined();
    expect(
      bridgeRow,
      "브리지 행이 구현을 안 가리킨다 — 표가 능력의 소재지를 잃으면 다음 사람이 " +
        "어디를 고쳐야 할지 모른다.",
    ).toContain("start_vault_watch");
    expect(
      rules,
      "강등(못 함)과 지연(늦음)의 구분이 표에서 사라졌다 — 그 구분이 이 브리지가 " +
        "DEGRADED_SURFACES 에 안 들어가는 유일한 이유다.",
    ).toMatch(/강등이 아니라 \*\*지연\*\*/);
  });
});
