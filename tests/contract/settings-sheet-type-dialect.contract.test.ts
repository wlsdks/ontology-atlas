import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 설정 시트의 타입 방언은 **하나**다 (2026-08-02, 소유자 지적 3건).
 *
 * ## 무엇이 있었나 — 절별 폰트 센서스(실측, 1512×806, 다크)
 *
 * | 절 | 12.5px | 11px | **9.5px** |
 * |---|---|---|---|
 * | 화면 | 10 | 5 | 0 |
 * | 작업 공간 | 5 | 1 | 0 |
 * | AI 에이전트 | 4 | 3 | 0 |
 * | **확장** | **0** | 4 | **10** |
 * | 발자국 | 0 | 4 | 1 |
 * | 지도 배경 | 3 | 2 | 4 |
 *
 * 같은 시트, 같은 종류의 내용(라벨 + 컨트롤 + 한 줄 설명)인데 절에 따라
 * **램프 한 단이 통째로 밀려** 있었다. 소유자가 본 것이 그것이다 —
 * *"이는 버튼도 너무 작고? 뭔가 설정 자체가좀 작아"* (「확장」 절을 가리키며).
 *
 * 원인은 취향이 아니라 상속이다. `Slider`/`Choice` 는 `FootprintSettings` 의
 * **접힌 세부** 안에서 태어나 그 자리의 작은 치수를 갖고 있었고, 공용
 * 프리미티브로 승격되며 `ExpandSettings` 의 **주 결정 컨트롤**이 될 때 그
 * 치수를 그대로 데려왔다. 아무도 "확장 절은 작게" 라고 정하지 않았다.
 *
 * ## 이 파일이 잠그는 규격
 *
 * | 무엇 | 스텝 |
 * |---|---|
 * | 행·컨트롤 라벨, 누르는 글자 | `text-body` (12.5px) |
 * | 한 줄 설명·보조 캡션·수치 읽기 | `text-label` (11px) |
 * | `text-caption` (9.5px) | **루트 시트에서는 쓰지 않는다** |
 *
 * 9.5px 을 뺀 근거는 램프의 **정의**다 — `--text-caption` 은 "마이크로 라벨·
 * 범례·타임스탬프" 의 단이다(`app/globals.css`). 라디오 버튼의 이름은 그 셋 중
 * 무엇도 아니다.
 *
 * ## 사정거리 — 왜 드릴인 서브뷰는 빼나
 *
 * `VaultAgentSetupPanel`(55건) · `AiConnectionPanel`(27건)은 이 규칙 **밖**이다.
 * 둘은 루트 시트가 아니라 드릴인 목적지이고, 그 안의 `text-caption` 대부분은
 * 램프 정의에 맞는 쓰임이다(`font-mono uppercase tracking` 아이브로우, 경로
 * 코드, 단계 번호 배지). 그것까지 한 룰로 묶으면 82건짜리 소음이 되고, 소음은
 * 강제가 아니라 기존 신호를 덮는다(`design.md` "룰을 켜기 전 반드시 측정한다").
 * 켤 때의 실측: **루트 6파일 위반 13건 → 치환 후 0건.**
 */

const UI = "src/widgets/app-settings-menu/ui";

/** 루트 시트를 구성하는 파일 — LNB + 여섯 칸. 드릴인 서브뷰는 사정거리 밖. */
const ROOT_SHEET_FILES = [
  "AppSettingsMenu.tsx",
  "settings-primitives.tsx",
  "AppearancePickers.tsx",
  "ExpandSettings.tsx",
  "FootprintSettings.tsx",
  "AgentActivitySettings.tsx",
] as const;

/**
 * 주석을 뺀 소스. 이 파일이 세는 것은 **화면에 나가는 클래스**지 그것을 설명하는
 * 문장이 아니다 — 주석을 안 빼면 "이 규격을 문서화한 주석" 자체가 위반으로
 * 잡혀서, 규격을 적을수록 게이트가 빨개지는 뒤집힌 유인이 생긴다.
 */
function sourceWithoutComments(file: string): string {
  return readFileSync(`${UI}/${file}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("설정 루트 시트 — 타입 방언은 하나다", () => {
  it("루트 시트 어디에도 `text-caption`(9.5px) 이 없다", () => {
    const offenders = ROOT_SHEET_FILES.flatMap((file) => {
      const source = sourceWithoutComments(file);
      return source.includes("text-caption") ? [file] : [];
    });
    expect(
      offenders,
      `9.5px 은 "마이크로 라벨·범례·타임스탬프" 의 단이다. 설정 행의 라벨·설명·` +
        `버튼 글자는 그 셋이 아니다 — 설명은 text-label(11px), 누르는 글자는 ` +
        `text-body(12.5px).`,
    ).toEqual([]);
  });

  /**
   * 공회전 차단 — 파일 목록이 오타/이동으로 비면 위 시험은 «위반 0» 을 영원히
   * 보고한다. 실제로 무엇인가를 읽었고, 그것이 타입 램프를 쓰는 파일인지 본다.
   */
  it("게이트가 빈 집합 위에서 돌지 않는다", () => {
    for (const file of ROOT_SHEET_FILES) {
      const source = sourceWithoutComments(file);
      expect(source.length, `${file} 을 못 읽었다`).toBeGreaterThan(200);
      expect(source, `${file} 이 타입 램프를 안 쓴다 — 목록이 낡았다`).toMatch(
        /text-(body|label|title|body-lg)/,
      );
    }
  });
});

describe("한 시트 안에서 «값 하나 고르기» 는 한 규격이다", () => {
  /**
   * `Choice` 의 라디오 칩과 `SegmentSwitch` 의 세그먼트는 둘 다 "값 하나 고르기"
   * 다. 다를 이유가 없는데 달랐다 — 24px/9.5px 대 32px/12.5px. 칩이 자기 라벨
   * (11px)보다 작아서 **누르는 것이 화면에서 가장 작은 글자**였다(위계 역전).
   *
   * `AgentActivitySettings` 의 알림 칩은 이미 32px/12.5px 이었다 — 이 시트의 더
   * 새 코드가 이미 옳은 값을 골라 뒀고, `Choice` 만 옛 자리의 치수를 들고 있었다.
   */
  it("라디오 칩 · 세그먼트 · 알림 칩이 같은 높이·같은 단을 쓴다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const activity = sourceWithoutComments("AgentActivitySettings.tsx");

    // Choice 의 옵션 버튼
    expect(primitives).toMatch(/flex h-8 items-center rounded-chip border px-3 text-body/);
    // SegmentSwitch 의 세그먼트
    expect(primitives).toMatch(/flex h-8 items-center justify-center rounded-chip px-2/);
    // 알림 칩 (이미 옳았던 쪽 — 되돌아가면 여기서 걸린다)
    expect(activity).toMatch(/h-8 items-center rounded-chip[^'"`]*text-body/);
  });

  /**
   * **WCAG 2.5.8 (AA, Target Size Minimum) 여유.** 종전 칩은 24px 정각이라
   * 최소치에 여유 0으로 걸쳐 있었고, 「고리」·「기둥」은 폭 38.4px 이었다.
   * `h-8`(32px)은 그 위로 8px 을 남긴다. `--touch-target-min`(44px) 은
   * `pointer: coarse` 한정 계약이라 이 데스크톱 시트에 직접 걸지 않지만,
   * 세로 인셋(`py-2` + `min-h-11`)이 행 전체를 44px 로 세워 터치에서도 행이
   * 목표를 만족한다.
   */
  it("칩 행이 44px 미만으로 눌리지 않는다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    // Choice / Slider 의 행 컨테이너
    const rows = primitives.match(/flex min-h-11 items-center gap-3 px-1 py-2/g) ?? [];
    expect(rows.length, "Choice·Slider 두 행 문법이 같은 최소 높이를 안 쓴다").toBe(2);
  });
});

describe("LNB 는 크롬 치수를 빌려오지 않는다", () => {
  /**
   * 종전 LNB 항목은 `px-2.5 py-1.5` → 32px, 아이콘 14px 이었다. 32px 은
   * **나브레일 유틸리티 타일**(`--app-nav-rail-tile-height`)의 값이다. 즉 지도
   * 위에 떠서 화면을 양보하는 도구 막대의 치수를, «일부러 들어와서 읽고 고르는
   * 목적지» 가 빌려 쓰고 있었다.
   *
   * 「스케일 고정 계약」은 스스로 사정거리를 **워크벤치 크롬**으로 한정한다
   * (`design.md`) — 관문 크롬(`GatewayNav`)을 뺀 것과 같은 논리가 여기에도
   * 적용된다. 그래서 값을 이 시트 안에서 끌어온다: 오른쪽 칸 `SettingsRow` 와
   * **같은 패딩**(`px-3 py-2`), 그리고 오른쪽 행 라벨보다 한 단 위(`text-body-lg`).
   * 새 토큰은 만들지 않는다 — 소비처가 하나뿐인데 변수를 만들면 참조 대상이
   * 둘로 늘어 어디가 규격인지 흐려진다(같은 문단이 남긴 규율).
   */
  it("LNB 항목이 오른쪽 칸 행과 같은 인셋을 쓰고 한 단 위 글자를 쓴다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    expect(menu, "LNB 항목이 크롬 치수(px-2.5 py-1.5 / text-body)로 되돌아갔다").toMatch(
      /flex w-full items-center gap-2\.5 rounded-(?:lg|card) px-3 py-2 text-left text-body-lg/,
    );
  });

  it("LNB 아이콘이 글자보다 크다 — 훑기 채널로 선다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    // 14px 이면 글자(text-body-lg = 14px)와 같아져 채널이 서지 않는다.
    expect(menu).toMatch(/<Icon size=\{16\}/);
  });

  /** `SettingsRow` 가 인셋의 단일 출처다 — 여기가 바뀌면 위 계약의 근거가 사라진다. */
  it("오른쪽 칸 행의 인셋이 LNB 가 맞춘 그 값이다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    expect(primitives).toMatch(/flex min-h-12 items-center justify-between gap-3 px-3 py-2/);
  });
});

describe("패널은 최소 창 안에서 자기 거터를 먹지 않는다", () => {
  /**
   * 고정 크기 계약(소유자 2026-07-29)은 그대로다. 바뀐 것은 높이 하나이고,
   * 그 값은 취향이 아니라 **파생값**이다 — Tauri 최소 창 높이 720 에서
   * 오버레이 여백(`p-3`, 위아래 12px)을 뺀 696 안에, 그 여백을 한 벌 더 남기고
   * 들어가는 최대 높이(696 − 24 = 672).
   *
   * 640 이던 동안 가장 붐비는 「화면」 절이 41px 잘려 있었고, 동시에 14인치
   * 뷰포트(1512×806)에서 패널 바깥 118px 이 비어 있었다 — 잘린 상자와 남는
   * 자리가 같은 화면에 있는 것이 소유자가 말한 *"답답해"* 의 기계적 형태다.
   */
  it("패널 높이가 최소 창 − 오버레이 거터 2벌 을 넘지 않는다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    const height = Number(/h-\[(\d+)px\] max-h-\[calc\(100dvh-1\.5rem\)\]/.exec(menu)?.[1]);
    expect(Number.isFinite(height), "패널 고정 높이를 못 찾았다").toBe(true);

    const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    const minHeight: number = tauri.app.windows[0].minHeight;
    const OVERLAY_GUTTER = 12; // 오버레이의 `p-3`
    expect(minHeight, "최소 창 높이 계약이 사라졌다").toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(minHeight - OVERLAY_GUTTER * 4);
    // 그리고 이전 값(640)보다는 커야 한다 — 안 그러면 이 변경이 되돌려진 것이다.
    expect(height).toBeGreaterThan(640);
  });
});
