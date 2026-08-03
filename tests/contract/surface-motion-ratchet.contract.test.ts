import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { censusAppearingSurfaces, censusHardCuts, MOTION_MECHANISMS } from './lib/surface-motion-census';

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
 * ## 오늘의 전수 — 13
 * ════════════════════════════════════════════════════════════════════
 *
 * | 부류 | 수 | 무엇인가 |
 * |---|---:|---|
 * | **인라인 오버레이** | 11 | 이름 없는 `<div className="… fixed/absolute … z-N">`. 드롭다운 메뉴·팝오버·자동완성·서랍·토스트. **구 등록부에게는 통째로 안 보이던 부류다** |
 * | **명명 표면** | 2 | `TopologyV2ContextMenu`(우클릭 메뉴) · `DeltaPreviewModal`(스크림 모달) |
 *
 * 인라인 11이 이 라운드의 진짜 발견이다. 구 게이트는 **표면 접미사를 가진
 * 컴포넌트**만 알았고, 이 앱의 하드컷 다수는 그런 이름을 갖지 않은 채 부모 안에
 * 직접 그려진다. 등록부 시절 「전수 20 중 10」이라 적힌 수는 그 부류를 한 번도
 * 세지 않은 수였다.
 *
 * ### 왜 0 이 아니라 13 에서 시작하나
 *
 * `/gate-probe` 1단계: **룰을 켜기 전에 위반을 전수 측정한다.** 13을 한 PR 로
 * 갚으려면 열세 자리의 렌더 게이트를 각각 퇴장 창 동안 붙들게 고쳐야 하고
 * (`useSurfaceSwap`/`useHeldValue` 가 자리마다 다르다), 그건 이 PR 이 아니라
 * 디자인 패스다. 안 치운 채 0 을 요구하면 첫날부터 빨갛고, 빨간 게이트는 곧
 * 꺼지거나 무시된다 — 이 저장소가 `shadow-[` 로 lint 를 144 → 548 로 띄운 그
 * 전례다.
 *
 * **이 수는 내려가기만 한다.** 그리고 이제 새 하드컷은 **어디에 놓아도** 다음
 * 실행에서 저절로 잡힌다 — 등록부에 줄을 더해야 보이던 종전과 반대다.
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
const BASELINE_HARD_CUTS = 13;

/**
 * **열 수 있는 표면의 전수** — 나가는 길의 유무와 무관하게 조건부로 나타나는 것.
 *
 * 하드컷의 분모이고, 동시에 `tests/e2e/a11y-open-surfaces.spec.ts` 가 「5/19 를
 * 잰다」고 말할 때의 19다. 리터럴인 이유는 위와 같다.
 */
const BASELINE_APPEARING_SURFACES = 19;

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
    // 파일 하나도 안 읽고 0을 돌려주는 탐지기와 「위반 없음」을 가른다.
    expect(census.length, '한 건도 못 셌다면 스캐너나 경로가 깨진 것이다').toBeGreaterThan(0);
    expect(
      new Set(census.map((c) => c.file)).size,
      '전부 한 파일에서 나왔다면 스캔 범위가 무너진 것이다',
    ).toBeGreaterThan(3);
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
