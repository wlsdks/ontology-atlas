import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  censusAppearingSurfaces,
  censusHardCuts,
  MOTION_MECHANISMS,
  walkTsx,
} from './lib/surface-motion-census';

/**
 * 등장·퇴장 래칫 — **하드컷 표면은 늘어날 수 없다.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 — 이 게이트는 빈 목록 위에서 돌고 있었다
 * ════════════════════════════════════════════════════════════════════
 *
 * 전날 이 파일은 `HARD_CUT_REGISTRY` **하나만** 순회했고, 그 등록부가 비어 있었다.
 * 그래서 「하드컷 표면 0」은 제품에 대한 참이 아니라 **빈 목록에 대한 참**이었다.
 * 소유자가 실측으로 증명했다 — 새 패널 파일에 `{open && <div className="fixed …">}`
 * 를 넣고 돌렸더니 **5 passed**, 초록이었다.
 *
 * 그때 남아 있던 「탐지기 프로브」는 판정 **함수**가 산다는 것만 증명했다. 그건
 * 필요조건이지 충분조건이 아니다: 함수가 살아 있어도 **아무도 그 함수에 제품을
 * 먹이지 않으면** 게이트는 없는 것과 같다. 이 라운드가 그 입력을 바꾼다 —
 * 목록이 아니라 `src/`·`app/` **전수**가 입력이다(`lib/surface-motion-census.ts`).
 *
 * ### 그런데 「전수로 바꾼다」가 곧 정답은 아니었다 — 오탐부터 쟀다
 *
 * 구 등록부 머리말이 경고한 그대로다: *「부모가 조건부로 그린다」만 결함이고,
 * 항상 렌더되는 것·부모가 이미 애니메이션하는 것은 아니다.* 접미사로 세면
 * 과다 계수가 되고, 안 고쳐도 되는 자리를 결함으로 세면 다음 사람이 필요 없는
 * 곳에 나가는 길을 붙인다 — 그건 강제가 아니라 소음이다.
 *
 * 그래서 켜기 전에 **오탐 census 를 실측**했고, 판별식을 셋 넣어 내렸다:
 *
 * | 판별식 | 무엇이 걸러지나 | 실측 |
 * |---|---|---|
 * | **호출 자리만 본다** | 「항상 렌더된다」가 구조적으로 제외된다 | — |
 * | **대안 가지가 무언가 그리면 «교체»** | 「부모가 이미 애니메이션한다」가 기계적으로 걸러진다 | 3자리 (`AgentGlobalScopePanel` · `VaultAgentSetupPanel` · `ProjectQuickEditPanel`) |
 * | **못 눌리는 루트는 표면이 아니다** | 호버 판독물·투어 앵커 | 오탐률 약 40% → **11건 중 1건** |
 *
 * 오탐 넷이 **탐지기 자신의 결함**이었고 값이 아니라 해석이 틀린 것이었다:
 *
 * | 오탐 | 원인 | 고침 |
 * |---|---|---|
 * | 표면 5종 | 배럴(`index.ts`)을 실물 정의 파일로 읽었다 | 재수출을 따라간다 |
 * | `Tooltip` | 기제 목록에 Radix 퇴장(`animate-out`)이 없었다 | 목록에 등재 |
 * | 호버 카드 2 | 루트가 `pointer-events-none` — 모션 예산이 0ms 를 **허용**하는 부류다 | 표면에서 제외 |
 * | 투어 앵커 | `aria-hidden` + 못 눌림 | 같음 |
 *
 * 반대로 **거짓 음성도 하나 나왔다**: `DeltaPreviewModal`(진짜 하드컷 모달)이
 * 「교체」로 분류돼 통째로 빠져 있었다. 원인은 여는 태그를 중괄호 깊이 없이 끊어
 * `onSave={() => {` 의 `=>` 를 태그 끝으로 읽은 것 — **컨트롤 래칫 머리말이 이미
 * 적어 둔 그 함정**이다. 판별을 JSX 워킹에서 괄호 깊이 스캔으로 바꿔 고쳤다.
 * 잴 원소를 틀리면 수치가 나와도 틀린 수치다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 (같은 날, 두 번째) — 13 을 갚았다. 0 이다.
 * ════════════════════════════════════════════════════════════════════
 *
 * 아침의 전수는 13(인라인 11 + 명명 2)이었고, 그날 안에 열세 자리를 전부
 * `<Surface>` 로 옮겼다. 자리별 표는 PR 본문에 있다. 값진 것은 **왜 하루 만에
 * 가능했나** 인데, 답이 이 저장소가 두 번째로 배우는 그것이다:
 *
 * > 없던 것은 규율이 아니라 **자산**이었다.
 *
 * 열세 자리 중 열 자리는 `<Surface open={…} origin="…">` 한 줄이 끝이었다.
 * 나머지 셋만 실제 설계가 필요했고, 그 셋이 프리미티브의 구멍을 드러냈다:
 *
 * | 막힌 것 | 왜 | 무엇을 더했나 |
 * |---|---|---|
 * | 전면 상세 · 문서함 서랍 · 공방 미리보기 | 화면을 덮는 큰 표면인데 프리미티브에는 **이동+스케일 문법 한 벌뿐**이었다. `globals.css` 는 밝기 전용(`map-overlay-in/out`)을 이미 갖고 있었는데 `Surface` 가 그걸 못 입혔다 | `motion="overlay"` 축 |
 * | 메뉴·대화상자 9자리 | 루트의 `role`/`aria-label`/`id` 를 넘길 데가 없어, 감싸면 **접근성 이름을 잃는** 교환이 됐다 | `role`·`id`·`aria-*`·`style`·`ref`·`onClick` 통과 |
 *
 * 전면 상세는 특히 **한쪽 날개만 달려 있었다** — `map-overlay-in` 을 손으로
 * 붙여 등장은 180ms 인데 퇴장 클래스는 없어서, 닫으면 전체 화면이 1프레임에
 * 사라졌다. 값 lint 를 무결점 통과하는 부류(전이가 아예 없는 원소는 리터럴도
 * 없다) 그대로다.
 *
 * ### 갚으면서 **게이트 자신의 결함 둘**이 나왔다
 *
 * 1. **갚을수록 분모가 줄었다.** 전환하면 호출 자리가
 *    `{cond && <div className="fixed … z-50">}` → `<Surface open={cond}>` 로
 *    바뀌는데, 종전 탐지기는 **조건부 호출 자리**만 봐서 그 표면이 통째로
 *    시야에서 사라진다. 실측: 13을 갚자 등장 표면 전수가 **19 → 8**. 「위반
 *    0」과 「안 보고 있음」이 다시 구별되지 않는 그 상태다. → 탐지기 ⓪
 *    (`<Surface open=`)을 넣었고, 포지셔너/정의 중복은 `EXIT_DELEGATED` 로
 *    지웠다. 고친 뒤 전수 **20** — 종전 19에 없던 것은 엣지 패널이다
 *    (`<Surface>` 는 표면 접미사가 없어 ①이 못 봤고 `<div>` 가 아니라 ②도
 *    못 봤다. **이미 전환된 표면은 처음부터 분모 밖이었다**).
 * 2. **프로브 ①이 「위반이 있다」를 요구했다.** `census.length > 0` 이라
 *    부채를 다 갚는 순간 빨개진다 — 게이트가 자기를 고치는 것을 막는 모양이다.
 *    프로브의 일은 「위반이 있다」가 아니라 **「제품을 실제로 먹는다」**이므로,
 *    스캔한 파일 수와 **등장 표면 전수**(하드컷이 0이어도 20)로 겨눈다.
 *
 * ### 이 수는 이제 0 이고, 새 하드컷은 어디에 놓아도 잡힌다
 *
 * 0 은 「빈 목록에 대한 참」이 아니다 — 아래 프로브 다섯이 매 실행마다 픽스처
 * 셋을 실제로 잡아 보이고, 전수 스캔이 파일 수와 분모로 살아 있음을 증명한다.
 */

/**
 * **리터럴이다 — 센서스에서 파생하지 않는다.**
 *
 * 종전 `BASELINE = HARD_CUT_REGISTRY.length` 가 「늘지 않는다」를 **원리적으로
 * 실패 불가**로 만들었다(줄을 더하면 기준선도 같이 올라간다). 컨트롤 래칫이
 * 그 결함을 물려받지 않으려고 두 기준선을 리터럴로 못박았고, 여기도 같다 —
 * 새 하드컷을 등재하려면 이 숫자를 **손으로** 올려야 하고 그 diff 가 곧 「왜」를
 * 적을 자리다.
 */
const BASELINE_HARD_CUTS = 0;

/**
 * **열 수 있는 표면의 전수** — 나가는 길의 유무와 무관하게 조건부로 나타나는 것.
 *
 * 하드컷의 분모이고, 동시에 `tests/e2e/a11y-open-surfaces.spec.ts` 가 「5/20 을
 * 잰다」고 말할 때의 20이다. 리터럴인 이유는 위와 같다.
 */
/*
 * 20 → 22 (2026-08-04, 「내 에이전트 연결」 단계 진행형).
 * 늘어난 둘은 **접힘 두 갈래**다: 단계 본문(`AgentSetupStep`)과 「잘 안 되나요?」
 * 서랍. 둘 다 처음부터 `<Surface>` 로 태어나 하드컷은 그대로 0 이다 — 분모가
 * 느는 것 자체는 결함이 아니고, 여기 손으로 올린 diff 가 「무엇이 늘었나」를
 * 적는 자리다.
 *
 * 22 → 20 (2026-08-04 저녁, 같은 두 갈래의 문법 교정).
 * 소유자가 설치 앱에서 잡았다 — *"버벅이면서 이상하게 열리는데?"*. 그 둘은
 * **흐름 안 접기**인데 떠 있는 표면의 문법(`Surface` chrome: 스케일+페이드,
 * 퇴장 창 동안 레이아웃 점유)을 입고 있었다. 프레임 실측: 1→3단계 전환에서
 * 아래 형제가 +254px/1프레임 → 140ms 뒤 −352px/1프레임(전환 프레임 0장).
 * 목록 행 펼침 문법(`.ai-row-disclosure` + `useRowDisclosure`)으로 옮겼고,
 * 상자를 늘 그려 두는 그 문법에서는 조건부 «등장 표면» 자체가 아니게 되어
 * 분모에서 빠진다 — 나가는 길은 높이 전이가 지고, 그 계약은
 * `AgentSetupStep.test.tsx` 가 고정한다(프로브: 문법을 벗기면 ①·②, 떠 있는
 * 문법을 되입히면 ③ 이 빨개진다).
 */
/*
 * 20 → 21 (2026-08-08): 에디터 `@` 멘션의 **관계 고르기 2단계**. 이 수는
 * `a11y-open-surfaces.spec.ts` 의 분모와 짝이므로 둘을 같이 올린다 — 한쪽만
 * 올리면 그 파일의 자기 대조가 먼저 터진다(그게 이 짝의 존재 이유다).
 */
/*
 * 25 → 26 (2026-08-16): 앱 안 대화의 **지난 대화 목록**. 머리의 목록 버튼에서
 * 자라는 팝오버라 처음부터 `<Surface origin="top right">` 로 태어났고 하드컷은
 * 그대로 0 이다.
 *
 * ⚠️ 이 표면은 **브라우저 훑기로는 못 연다** — 데스크톱에서 실행기를 찾고
 * 세션이 선 뒤에야 생기는 자리다. 그래서 짝인 `a11y-open-surfaces.spec.ts`
 * 분모도 같이 올리되, 그쪽 목록에 넣을 수 없는 이유를 거기 적는다(권한 카드가
 * 2026-08-16 에 같은 이유로 간 길이다).
 */
const BASELINE_APPEARING_SURFACES = 26;

const SELF = 'tests/contract/surface-motion-ratchet.contract.test.ts';
const FIXTURES = 'tests/fixtures/surface-motion';

const census = censusHardCuts(process.cwd());

describe('등장·퇴장 래칫 — 소스 전수', () => {
  it('하드컷이 늘지 않는다 — 새 표면은 나가는 길을 지고 태어난다', () => {
    expect(
      census.length,
      `조건부로 나타나는데 나가는 길이 없는 표면이 ${BASELINE_HARD_CUTS} → ${census.length} 로 늘었다.\n` +
        `\`<Surface open={…}>\` 로 감싸면 퇴장 창 · 퇴장 클래스 · inert · 포커스 복귀가 기본으로 딸려 온다.\n` +
        `정말 갚을 수 없는 부채라면 BASELINE_HARD_CUTS 를 손으로 올리고 그 diff 에 «왜» 를 적어라.\n` +
        census.map((c) => `  [${c.kind}] ${c.what} — ${c.at.join(' · ')}`).join('\n'),
    ).toBeLessThanOrEqual(BASELINE_HARD_CUTS);
  });

  it('갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      census.length,
      `하드컷이 ${BASELINE_HARD_CUTS} → ${census.length} 로 줄었다. 이 파일의 BASELINE_HARD_CUTS 도 ` +
        `${census.length} 로 내려라. 안 내리면 그 차이가 다시 나빠질 여유로 남는다.`,
    ).toBeGreaterThanOrEqual(BASELINE_HARD_CUTS);
  });

  it('기준선이 **리터럴**이다 — 센서스에서 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    expect(
      /const BASELINE_HARD_CUTS = \d+;/.test(readFileSync(SELF, 'utf8')),
      'BASELINE_HARD_CUTS 를 `census.length` 로 두면 멈춤쇠가 양방향으로 헐거워진다(구 등록부의 실제 결함).',
    ).toBe(true);
  });
});

/**
 * **탐지기 프로브** — `/gate-probe` 규율.
 *
 * 위 세 단언은 「오늘의 수」 위에서만 돈다. 그러면 탐지기가 조용히 죽어도 —
 * 정규식 하나가 아무것도 안 잡게 되어도 — 전부 초록이다. 그 상태와 「위반이
 * 없다」는 화면에서 구별되지 않는다. 여기서 판정을 **양방향으로** 겨눈다.
 *
 * ⚠️ 이 라운드의 존재 이유가 정확히 이것이므로, 프로브는 「함수가 산다」가 아니라
 * **「제품 전수를 실제로 먹고 있다」**까지 확인한다.
 */
describe('탐지기 프로브 — 이 게이트가 실제로 무엇을 잡는가', () => {
  const addOne = (fixture: string) => censusHardCuts(process.cwd(), ['src', 'app'], [`${FIXTURES}/${fixture}`]);

  it('① 소스 전수를 실제로 먹는다 — 빈 집합 위에서 놀지 않는다', () => {
    /*
     * ⚠️ **이 단언은 2026-08-04 에 겨냥을 바꿨다.** 종전에는
     * `census.length > 0` — 「하드컷이 하나는 있어야 탐지기가 산 것」이었다.
     * 부채가 13이던 날에는 성립했지만, 그건 **게이트가 자기를 다 갚는 것을
     * 막는 모양**이다: 0 이 되는 순간 빨개진다.
     *
     * 프로브의 일은 「위반이 있다」가 아니라 **「제품을 실제로 먹는다」**다.
     * 그래서 하드컷 수와 무관한 둘로 겨눈다 — 스캔한 파일 수와, 하드컷이
     * 0이어도 20인 **등장 표면 전수**. 파일 하나도 안 읽고 0을 돌려주는
     * 탐지기는 둘 다 통과하지 못한다.
     */
    const scanned = [...walkTsx(join(process.cwd(), 'src')), ...walkTsx(join(process.cwd(), 'app'))];
    expect(scanned.length, '스캐너가 제품 트리를 못 걸었다면 모든 수가 거짓이다').toBeGreaterThan(200);

    const appearing = censusAppearingSurfaces(process.cwd());
    expect(appearing.length, '등장 표면이 0이면 스캐너나 경로가 깨진 것이다').toBeGreaterThan(0);
    expect(
      new Set(appearing.map((c) => c.file)).size,
      '전부 한 파일에서 나왔다면 스캔 범위가 무너진 것이다',
    ).toBeGreaterThan(3);
  });

  it('①-b 전환된 표면이 분모에서 사라지지 않는다 — 갚을수록 눈이 머는 결함', () => {
    /*
     * 실측(2026-08-04): 13건을 `<Surface>` 로 옮기자 등장 표면 전수가
     * **19 → 8** 로 내려앉았다. 탐지기가 조건부 호출 자리만 봐서, 전환된
     * 표면(`<Surface open={cond}>`)이 통째로 시야 밖으로 나간 것이다.
     * 그러면 「하드컷 0」은 다시 **안 보고 있음**과 구별되지 않는다.
     */
    const appearing = censusAppearingSurfaces(process.cwd());
    const converted = appearing.filter((c) => c.what === '<Surface>');
    expect(
      converted.length,
      '`<Surface>` 로 전환한 표면이 한 건도 안 세어졌다 — 탐지기 ⓪ 가 죽었다',
    ).toBeGreaterThan(10);
    expect(
      new Set(converted.map((c) => c.file)).size,
      '전환된 표면이 한 파일에만 있다면 스캔이 무너진 것이다',
    ).toBeGreaterThan(5);
  });

  it('② 소유자가 심었던 그 모양 — 이름 없는 인라인 오버레이를 잡는다', () => {
    const fixture = `${FIXTURES}/InlineOverlay.tsx.fixture`;
    expect(existsSync(fixture), '프로브 픽스처가 사라지면 탐지기 증명도 사라진다').toBe(true);
    const withProbe = addOne('InlineOverlay.tsx.fixture');
    expect(
      withProbe.length,
      '`{open && <div className="fixed … z-50">}` 를 못 잡았다. 이게 구 게이트가 초록이던 바로 그 모양이다.',
    ).toBe(census.length + 1);
    expect(withProbe.some((c) => c.file.endsWith('InlineOverlay.tsx.fixture') && c.kind === 'inline')).toBe(true);
  });

  it('③ 부모가 조건부로 그리는 명명 표면을 잡는다', () => {
    const withProbe = addOne('NamedHardCutHost.tsx.fixture');
    expect(withProbe.length).toBe(census.length + 1);
    expect(withProbe.some((c) => c.what === 'ProbeSurfacePanel' && c.kind === 'named')).toBe(true);
  });

  it('④ 내용 교체는 세지 않는다 — 이 판별식이 죽으면 게이트가 소음이 된다', () => {
    const withProbe = addOne('ContentSwap.tsx.fixture');
    expect(
      withProbe.length,
      '이미 마운트된 컨테이너 안의 내용 교체를 하드컷으로 셌다. 그러면 고칠 것 없는 자리에 ' +
        '나가는 길을 붙이라고 요구하기 시작한다 — 실물 세 자리가 이 부류다.',
    ).toBe(census.length);
  });

  it('⑤ 기제를 갖춘 표면은 놓아준다 — 전환한 것이 되돌아가면 여기서 걸린다', () => {
    const converted = [
      'src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx',
      'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx',
      'src/widgets/project-drawer/ui/ProjectDrawer.tsx',
      'src/widgets/search-palette/ui/SearchPalette.tsx',
    ];
    for (const file of converted) {
      expect(existsSync(file), `${file} 이 사라졌다 — 회귀 가드도 같이 죽는다`).toBe(true);
      expect(
        MOTION_MECHANISMS.some((m) => readFileSync(file, 'utf8').includes(m)),
        `${file} 에서 등장/퇴장 기제가 사라졌다 — 센서스가 13 안이어도 이건 회귀다`,
      ).toBe(true);
      expect(census.some((c) => c.file === file && c.kind === 'named')).toBe(false);
    }
  });

  it('⑦ 열 수 있는 표면의 **분모**가 조용히 늘지 않는다 — 접근성 측정 목록의 입력', () => {
    /*
     * 이 수는 하드컷 센서스의 분모이자 `tests/e2e/a11y-open-surfaces.spec.ts` 가
     * 「5/19 를 잰다」고 말할 때의 19다. 새 표면이 들어오면 여기가 먼저 빨개지고,
     * 그때 **그 표면을 열어 재고 있나** 를 함께 묻는다. 분모가 없으면 「열린 표면
     * 위반 0」은 몇 개를 안 열었는지 모르는 채로 하는 말이 된다.
     */
    const appearing = censusAppearingSurfaces(process.cwd());
    expect(
      appearing.length,
      `조건부로 나타나는 표면이 ${BASELINE_APPEARING_SURFACES} → ${appearing.length} 로 늘었다.\n` +
        `새 표면을 더했으면 a11y-open-surfaces.spec.ts 의 OPENERS 에 그것을 여는 길이 있는지 보고,\n` +
        `그 뒤 이 리터럴을 손으로 올려라 — 분모가 조용히 커지면 「5/19」가 「5/30」이 되어 있어도 아무도 모른다.\n` +
        appearing.map((c) => `  [${c.kind}] ${c.what} — ${c.at[0]}`).join('\n'),
    ).toBeLessThanOrEqual(BASELINE_APPEARING_SURFACES);
    expect(appearing.length, '하드컷은 등장 표면의 부분집합이다').toBeGreaterThanOrEqual(census.length);
  });

  it('⑥ 기제 목록이 살아 있다 — 목록이 비면 모든 표면이 하드컷이 된다', () => {
    expect(MOTION_MECHANISMS.length).toBeGreaterThan(3);
    // 등장 전용 클래스는 기제가 아니다 — 나가는 길이 없는 것이 이 게이트가 세는 부채다.
    expect(MOTION_MECHANISMS).not.toContain('map-overlay-in');
    expect(MOTION_MECHANISMS).not.toContain('animate-in');
  });
});
