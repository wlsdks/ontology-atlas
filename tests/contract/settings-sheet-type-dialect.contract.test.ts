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
 * ## 사정거리 — 드릴인까지다 (2026-08-09 에 넓혔다)
 *
 * ⚠️ **처음에는 드릴인을 뺐고, 그 판단이 틀렸다.**
 *
 * 2026-08-02 에는 `VaultAgentSetupPanel` · `AiConnectionPanel` 을 사정거리 밖에
 * 뒀다. 근거는 *"그 안의 `text-caption` 대부분은 램프 정의에 맞는 쓰임(아이브로우 ·
 * 경로 코드 · 단계 배지)이라, 묶으면 82건짜리 소음이 된다"* 였다. **소음 걱정은
 * 옳았고 「대부분 정당하다」는 전제가 틀렸다.**
 *
 * 2026-08-09 에 소유자가 「내 에이전트 연결」을 가리켰다 —
 * *"왜이렇게 작아보이지? 우리 디자인 시스템에서 이런거 통일 안되어있나? 다른거 보면
 * 크잖아.. 다 너무 작아서 잘 안보임"*. 실측(1512×900, 볼트 연결 상태, 여덟 칸 전수):
 *
 * | 칸 | 12.5 | 11 | **9.5** |
 * |---|---|---|---|
 * | 화면 · 지도 배경 · 확장 · 발자국 · 알림 · 작업 공간 | 2~9 | 1~14 | **0** (여섯 칸 전부) |
 * | **내 에이전트 연결** | 2 | 12 | **10 / 24 = 42%** |
 *
 * 여섯 칸은 9.5px 이 하나도 없는데 이 칸만 **보이는 글자의 42%** 가 시트 바닥
 * 아래였다. 그리고 정당하다던 쓰임을 하나씩 열어 보니 아니었다:
 *
 * - `dt`(이름)이 9.5px 인데 그 `dd`(값)이 11px — **이름이 자기 값보다 작다.**
 *   2026-08-02 가 「확장」 절에서 이름 붙인 그 위계 뒤집힘과 같은 것이다
 * - API 키·URL 을 타이핑하는 `<input>` 이 `fieldClass` 를 부르면서 그 램프의
 *   기본값(`text-body-lg` 14px)을 **`text-caption` 으로 덮어썼다** — 자기 램프보다
 *   4.5px 아래
 * - 사용자가 글자 하나하나 확인해야 하는 설정 JSON `<pre>` 가 9.5px
 *
 * 그래서 사정거리를 드릴인과 그 하위까지 넓힌다. 체인:
 * `VaultAgentSetupPanel` → `AgentClientButtons` → `WebManualConnectPanel`.
 *
 * **소음은 면제를 좁혀서 막는다, 사정거리를 좁혀서가 아니다.** 허용되는 9.5px 은
 * **아이브로우 한 가지**뿐이다 — `uppercase` 가 같은 className 에 붙은 것. 그것이
 * 램프가 말하는 "마이크로 라벨" 이고, 판정이 한 줄 안에서 끝나므로 다음 사람이
 * 헷갈릴 여지도 없다. 넓힐 때의 실측: **위반 41건 → 치환 후 0건**(넘침 0 유지).
 */

const UI = "src/widgets/app-settings-menu/ui";

/** 루트 시트를 구성하는 파일 — LNB + 여섯 칸. */
const ROOT_SHEET_FILES = [
  "AppSettingsMenu.tsx",
  "settings-primitives.tsx",
  "AppearancePickers.tsx",
  "ExpandSettings.tsx",
  "FootprintSettings.tsx",
  "AgentActivitySettings.tsx",
] as const;

/**
 * 드릴인 목적지와 그 하위 — 2026-08-09 에 사정거리에 들어왔다(위 머리말).
 * 경로가 `UI` 밖으로 나가므로 저장소 루트 기준으로 적는다.
 */
const DRILL_IN_FILES = [
  `${UI}/VaultAgentSetupPanel.tsx`,
  `${UI}/AiConnectionPanel.tsx`,
  `${UI}/AgentSetupStep.tsx`,
  "src/features/docs-vault-local/ui/AgentClientButtons.tsx",
  "src/features/docs-vault-local/ui/WebManualConnectPanel.tsx",
] as const;

/**
 * 주석을 뺀 소스. 이 파일이 세는 것은 **화면에 나가는 클래스**지 그것을 설명하는
 * 문장이 아니다 — 주석을 안 빼면 "이 규격을 문서화한 주석" 자체가 위반으로
 * 잡혀서, 규격을 적을수록 게이트가 빨개지는 뒤집힌 유인이 생긴다.
 */
function sourceWithoutComments(file: string): string {
  return sourceAtPath(`${UI}/${file}`);
}

function sourceAtPath(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * 9.5px 을 쓴 줄. **면제는 없다.**
 *
 * ⚠️ 처음에는 «`uppercase` 가 붙은 아이브로우» 를 면제했고, 그것이 소유자 지적
 * 2차를 불렀다(2026-08-09). 근거로 든 것이 램프 정의("마이크로 라벨")와
 * `uppercase` 였는데 **한글에는 `uppercase` 가 아무 일도 하지 않는다** — 대문자
 * 마이크로 라벨이라는 타이포 장치가 성립하지 않고, 남는 것은 그냥 9.5px 흐린
 * 글자다. 실제로 그 면제를 타고 절 이름 네 자리(연결 파일 상태 · 에이전트가 이
 * 폴더를 쓰는 방식 · 확인 · 연결)가 9.5px 로 남았다.
 *
 * 결정적인 것은 **루트 시트가 같은 역할에 이미 11px 을 쓰고 있었다**는 사실이다
 * (`SETTINGS_SECTION_LABEL`). 아무도 쓰지 않는 규격을 위해 열어 둔 면제였으니,
 * 면제를 지우는 것이 규칙을 더 단순하게 만든다.
 */
function captionLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => line.includes("text-caption"))
    .map((line) => line.trim().slice(0, 100));
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
  /** 드릴인 목적지 — 루트와 **똑같은** 방언이다. 9.5px 면제는 없다(위 주석). */
  it("드릴인 목적지에도 9.5px 이 없다", () => {
    const offenders = DRILL_IN_FILES.flatMap((path) =>
      captionLines(sourceAtPath(path)).map((line) => `${path.split("/").pop()}: ${line}`),
    );
    expect(
      offenders,
      "드릴인 칸이 루트 시트보다 한 단 작아졌다. 이름은 text-body(12.5), " +
        "설명·값·경로는 text-label(11). 절 이름은 SETTINGS_SECTION_LABEL 을 쓴다.",
    ).toEqual([]);
  });

  /**
   * 절 이름은 **한 벌**이다 — 루트 시트의 그룹 헤더와 드릴인의 절 헤더가 같은 것.
   * 사본이 생기면 그중 하나가 다시 한 단 작아진다(그게 이번에 일어난 일이다).
   */
  it("절 이름 규격이 한 곳에 있고 소비처가 그것을 가리킨다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    expect(primitives, "SETTINGS_SECTION_LABEL 이 없다").toContain("SETTINGS_SECTION_LABEL");
    expect(primitives, "절 이름은 text-label(11) 이다").toMatch(
      /SETTINGS_SECTION_LABEL\s*=\s*\n?\s*'[^']*\btext-label\b/,
    );
    /*
     * 소비처가 값을 다시 적지 않고 가리키는가.
     *
     * ⚠️ **`toContain(이름)` 으로는 이것을 못 본다** — import 줄에 이름이 남아 있으면
     * 본문에서 손으로 값을 적어도 통과한다(프로브에서 실제로 통과했다). 그래서
     * **`className` 자리에서** 쓰이는지를 본다.
     */
    const setup = sourceWithoutComments("VaultAgentSetupPanel.tsx");
    expect(setup, "드릴인 절 이름이 규격을 className 으로 쓰지 않는다").toMatch(
      /className=\{[^}]*SETTINGS_SECTION_LABEL/,
    );
  });

  it("게이트가 빈 집합 위에서 돌지 않는다", () => {
    for (const path of DRILL_IN_FILES) {
      const source = sourceAtPath(path);
      expect(source.length, `${path} 을 못 읽었다`).toBeGreaterThan(200);
      expect(source, `${path} 이 타입 램프를 안 쓴다 — 목록이 낡았다`).toMatch(
        /text-(body|label|title|body-lg)/,
      );
    }
    // 체인이 살아 있는가 — 이 파일들이 정말 설정 시트에서 그려지나.
    expect(sourceAtPath(`${UI}/VaultAgentSetupPanel.tsx`)).toContain("AgentClientButtons");
    expect(sourceAtPath("src/features/docs-vault-local/ui/AgentClientButtons.tsx")).toContain(
      "WebManualConnectPanel",
    );
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
  /**
   * ⚠️ **소스의 클래스 문자열을 못박지 않는다** (2026-08-06 에 그것 때문에 깨졌다).
   *
   * 종전 이 단언은 `flex h-8 items-center rounded-chip border px-3 text-body` 를
   * 정규식으로 그대로 찾았다. 그 자리를 **값 층(`controlClass`)으로 옮기자**
   * 문자열이 사라져 빨개졌다 — 규격이 좋아지는 방향에서 검사가 터진 것이고,
   * 그러면 다음 사람은 검사 대신 **규격 쪽을 되돌린다**(`documentation.md`).
   *
   * 규격의 본체는 «어떻게 적혔나» 가 아니라 **«같은 높이·같은 단을 쓰나»** 다.
   * 그래서 소스에서 문법을 가리지 않고 **높이(`h-8`)와 타입 단(`text-body`)이
   * 실제로 서 있는지**만 본다 — 리터럴이든 `controlClass({ className })` 이든.
   */
  it("라디오 칩 · 세그먼트 · 알림 칩이 같은 높이·같은 단을 쓴다", () => {
    const primitives = sourceWithoutComments("settings-primitives.tsx");
    const activity = sourceWithoutComments("AgentActivitySettings.tsx");

    // 높이 — 셋 다 32px 한 단. `h-8` 이 세 자리에 서 있어야 한다.
    expect(primitives.match(/\bh-8\b/g)?.length ?? 0, "칩·세그먼트 둘 다 h-8 이어야 한다").toBeGreaterThanOrEqual(2);
    expect(activity).toMatch(/\bh-8\b/);

    // 타입 단 — 칩은 `text-body`(12.5). 세그먼트는 무게만 다르고 단은 같다.
    expect(primitives).toMatch(/\btext-body\b/);
    expect(activity).toMatch(/\btext-body\b/);

    /*
     * 램프 밖 높이가 끼어들지 않았는지. **`min-h-` 는 제외한다** — 행 컨테이너의
     * `min-h-11`(44px 터치 바닥)은 아래 「칩 행이 44px 미만으로 눌리지 않는다」가
     * 요구하는 값이라, 안 빼면 이 단언이 그 단언과 서로 싸운다(실제로 밟았다).
     */
    expect(primitives, "시트에 램프 밖 컨트롤 높이가 생겼다").not.toMatch(/(?<!min-)\bh-(7|9|10|11)\b/);
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
  /**
   * ⚠️ **소스의 클래스 문자열을 통째로 못박지 않는다** (2026-08-06 에 두 번째로 깨졌다).
   *
   * 종전 이 단언은 `flex w-full items-center gap-2.5 rounded-card px-3 py-2
   * text-left text-body-lg` 를 **한 덩어리 정규식**으로 찾았다. 그래서 그 자리를
   * 값 층(`controlClass({ shape: 'row' })`)으로 옮기자 — `flex w-full
   * items-center text-left` 는 모양이 내고 나머지만 `className` 에 남으므로 —
   * 문자열이 쪼개지며 빨개졌다.
   *
   * 규격의 본체는 «한 덩어리로 적혔나» 가 아니라 **«오른쪽 칸 행과 같은 인셋을
   * 쓰고 한 단 위 글자를 쓰나»** 다. 그래서 **값 단위로** 본다.
   */
  it("LNB 항목이 오른쪽 칸 행과 같은 인셋을 쓰고 한 단 위 글자를 쓴다", () => {
    const menu = sourceWithoutComments("AppSettingsMenu.tsx");
    /*
     * ⚠️ **파일 전체에서 값을 찾으면 안 된다** — 처음 그렇게 썼다가 프로브가
     * 아무것도 못 잡았다. `px-3 py-2` 는 이 파일의 **다른 자리**에도 있어서,
     * LNB 를 크롬 치수로 되돌려도 통과해 버렸다. **LNB 항목의 여는 태그로
     * 범위를 좁힌다.**
     */
    const from = menu.indexOf('data-testid={`app-settings-nav-${item}`}');
    /*
     * 여는 태그의 끝을 `>` 로 자르면 **`=>` 나 템플릿 안의 `>` 에서 끊긴다** —
     * 처음 그렇게 썼다가 정상 상태가 빨개졌다. 중괄호 깊이를 세어 **깊이 0 의
     * `>`** 만 끝으로 친다(이 저장소의 다른 스캐너와 같은 방식).
     */
    let depth = 0;
    let to = from;
    for (; to < menu.length; to += 1) {
      const ch = menu[to];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    const lnb = menu.slice(from, to);
    expect(lnb.length, "LNB 항목의 여는 태그를 못 찾았다 — 이 검사가 헛돈다").toBeGreaterThan(40);

    // 인셋 — 오른쪽 칸 행(`SettingsRow`)이 쓰는 `px-3 py-2` 와 같아야 한다.
    expect(lnb, "LNB 인셋이 크롬 치수(px-2.5 py-1.5)로 되돌아갔다").toMatch(/\bpx-3 py-2\b/);
    // 타입 — 오른쪽 칸의 `text-body` 보다 한 단 위.
    expect(lnb, "LNB 글자가 한 단 내려갔다").toMatch(/\btext-body-lg\b/);
    // 반경 — 크롬의 chip 이 아니라 card 계열.
    expect(lnb, "LNB 반경이 칩으로 되돌아갔다").toMatch(/\brounded-(?:lg|card)\b/);
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
