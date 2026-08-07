import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 「화면 안내 자동 표시」 스위치의 **사정거리**를 잠근다.
 *
 * 안내는 **일곱 번** 뜬다 — 폴더 유도 시트 하나(`vault-guide-auto-open`) ·
 * 지도 투어 하나(`HomePage`) · 목적지 다섯(한 컴포넌트 `DestinationGuide` 가
 * 맡는다). 소유자가 성가셔한 이유가 정확히 그것이라(개별로는 한 번씩인데 합이
 * 매번), **한 곳만 게이트하면 스위치가 반만 듣는다**.
 *
 * 2026-08-07 워크스루가 그 합을 실제로 걸어서 확인했다: 첫 방문에서 폴더 시트를
 * 「다음에」로 닫으면 **같은 화면에서** 투어가 이어받고, 목적지로 가면 또 뜬다.
 * (그 이어받기 자체는 `vault-guide-auto-open.ts` 가 의도로 적어 둔 순서다 —
 * 여기서 판정하지 않는다. 이 계약은 «스위치가 그 일곱을 다 덮는가» 만 본다.)
 *
 * 왜 소스를 읽는가: `DestinationGuide` 쪽은 렌더 테스트가 실제 발화를 막는지
 * 확인하지만, 지도 쪽 자동 시작은 `HomePage`(1만 줄 규모, 볼트·카메라·레이아웃이
 * 모두 살아 있어야 도달)의 effect 안에 있어 같은 방식으로 못 밟는다. 실제로
 * 프로브로 확인했다 — 지도 게이트를 지워도 가이드 렌더 테스트 91개가 전부
 * 통과한다. 그 사각지대를 덮는 것이 이 테스트의 유일한 일이다.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** 자동 시작을 소유한 파일 = 스위치를 읽어야 하는 파일. 목록이 곧 사정거리다. */
const AUTO_START_SITES = [
  "src/views/home/ui/HomePage.tsx",
  "src/features/guided-tour/ui/DestinationGuide.tsx",
  /**
   * 폴더 유도 시트 — **세 번째 지점인데 등재돼 있지 않았다** (2026-08-07).
   *
   * 이 파일이야말로 2026-08-02 에 «스위치가 반만 듣던» 사고가 난 자리다(소유자:
   * *"계속나와서 불편하네 테스트할때"* — 설정에서 안내를 껐는데 폴더 없는 첫
   * 화면에서는 시트가 그대로 떴다). 그때 `readGuideAutoStart()` 를 읽게 고쳤지만
   * **이 목록에는 안 들어왔다.** 즉 누가 그 한 줄을 지워도 게이트는 초록이고
   * 같은 불만이 그대로 돌아온다.
   *
   * 워크스루로 찾았다 — 첫 방문에서 폴더 시트 → 지도 투어 → 목적지 안내를
   * 연달아 만나고, 그 셋 중 하나만 스위치 밖이었다.
   */
  "src/features/first-run-starter/model/vault-guide-auto-open.ts",
] as const;

/** 스위치를 **정의**하는 곳. 소비처가 아니므로 위 목록에 들어가지 않는다. */
const SWITCH_DEFINITION = "src/shared/lib/guide-auto-start.ts";

describe("화면 안내 자동 표시 — 스위치가 모든 발화 지점을 덮는다", () => {
  it.each(AUTO_START_SITES)("%s 가 스위치를 읽는다", (path) => {
    expect(read(path), `${path} 의 자동 시작이 스위치를 안 본다 — 스위치가 반만 듣는다`).toContain(
      "readGuideAutoStart()",
    );
  });

  /**
   * 새 자동 시작 지점이 생기면 위 목록도 같이 늘어야 한다.
   *
   * ⚠️ **종전 검사는 새 지점을 원리적으로 발견할 수 없었다** (2026-08-07).
   * `AUTO_START_SITES.filter(...)` — 즉 **등재 목록 자신을** 걸러서 그 길이와
   * 비교했다. 목록 밖에 있는 파일은 애초에 후보에 들어오지 않으므로, 무엇을
   * 새로 만들어도 이 단언은 늘 통과한다. 실제로 그 사각에서 세 번째 지점
   * (`vault-guide-auto-open.ts`)이 등재되지 않은 채 살아 있었다.
   *
   * 게다가 판별 기준이 `watchGuidedTourAutoStartCancel`(투어 전용 기제)이라,
   * 그 기제를 안 쓰는 자동 열기는 기준 자체에 안 걸린다.
   *
   * 그래서 **트리를 직접 훑어** 스위치를 읽는 파일 전부를 찾고 목록과 대조한다.
   * 「목록이 곧 사정거리」인데 그 목록이 손으로 관리되면 사정거리도 손으로
   * 줄어든다 — 이 저장소가 아이콘 래칫에서 이미 낸 값이다.
   */
  it("등록되지 않은 자동 시작 지점이 없다", () => {
    const found: string[] = [];
    const walk = (rel: string) => {
      for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(child);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
        if (child === SWITCH_DEFINITION) continue; // 정의는 소비처가 아니다
        if (read(child).includes("readGuideAutoStart()")) found.push(child);
      }
    };
    walk("src");

    // 공회전 차단 — 스캐너가 0개를 찾고 «어긋난 것 없음» 으로 통과하면 안 된다.
    expect(found.length, "스위치를 읽는 파일을 하나도 못 찾았다 — 스캔이 깨졌다").toBeGreaterThan(1);

    const registered = new Set<string>(AUTO_START_SITES);
    const unregistered = found.filter((p) => !registered.has(p));
    expect(
      unregistered,
      `등재되지 않은 자동 시작 지점: ${unregistered.join(", ")} — ` +
        `스위치를 읽는 파일이 늘었으면 AUTO_START_SITES 에도 넣는다`,
    ).toEqual([]);

    const stale = [...registered].filter((p) => !found.includes(p));
    expect(
      stale,
      `등재됐는데 스위치를 안 읽는 파일: ${stale.join(", ")} — ` +
        `자동 시작을 지웠으면 목록에서도 빼고, 안 지웠으면 그 파일이 스위치를 잃은 것이다`,
    ).toEqual([]);
  });

  /**
   * 끄는 것은 **삭제가 아니다.** 부르는 길(설정 › 다시 보기 · 지도 나침반)은
   * 스위치와 무관하게 살아 있어야 한다 — 소유자: *"아니면 클릭했을때나"*.
   */
  it("부르는 길은 스위치 뒤에 숨지 않는다", () => {
    const settings = read("src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx");
    const replayRow = settings.slice(settings.indexOf("app-settings-replay-guide"));
    expect(replayRow.slice(0, 900)).not.toContain("guideAutoStart");
  });
});
