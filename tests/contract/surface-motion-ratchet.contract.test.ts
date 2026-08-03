import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * 등장·퇴장 래칫 — **하드컷 표면은 늘어날 수 없다.**
 *
 * ## 전수 (2026-08-03)
 *
 * 조건부로 나타나는 표면 **20개 중 10개가 하드컷**이었고, 그 10개는 무작위가
 * 아니라 **전부 「인라인 패널」 계열**이었다:
 *
 * | 계열 | 개수 | 등장/퇴장 |
 * |---|---:|---|
 * | 모달(scrim + `aria-modal`) | 9 | 대부분 있음 |
 * | **인라인 패널** | 11 | **전부 없음** |
 *
 * (손으로 센 첫 집계는 10이었고 **이 게이트가 11로 정정했다** — 컨트롤 래칫이
 * 419를 417로 정정한 것과 같다. 세는 일은 사람이 하면 틀린다.)
 *
 * 이유가 분명하다 — 모달은 `AgentConnectSheet` 의 `AnimatePresence` 패턴을 베낄
 * 수 있었고 인라인 패널은 **베낄 패턴이 없었다.** 규율이 아니라 자산의 문제였고,
 * 그래서 `Surface` 를 놓았다(`src/shared/ui/surface.tsx`).
 *
 * ## ⚠️ 첫 판은 파일명으로 셌고, 그건 과다 계수였다 (같은 날 정정)
 *
 * 접미사(`Panel`/`Sheet`/…)로 세면 **조건부로 나타나지 않는 것까지** 잡힌다.
 * 실제로 첫 11개를 부모 렌더 게이트까지 따라가 보니 셋으로 갈렸다:
 *
 * | 부류 | 예 | 결함인가 |
 * |---|---|---|
 * | 부모가 조건부로 그린다 | `TopologyV2EdgePanel` · `ProjectQuickEditPanel` | **그렇다** |
 * | 항상 렌더된다(라우트 내용·인라인) | `AtlasGitPanel` · `WebManualConnectPanel` | 아니다 |
 * | 부모가 이미 애니메이션한다 | `AiConnectionPanel`(설정 시트 안) | 아니다 |
 *
 * 「11개가 하드컷」은 그래서 **틀린 수**였다. 안 고쳐도 되는 것을 결함으로 세면
 * 다음 사람이 필요 없는 자리에 `Surface` 를 감싸고, 그건 노이즈다.
 *
 * 그래서 **등록부로 바꿨다** — 이 저장소가 `DEGRADED_SURFACES` 에서 쓰는 것과
 * 같은 패턴이다. 각 줄이 「이건 조건부로 나타나는데 등장/퇴장이 없다」를 **주장**
 * 하고, 그 주장에 이유가 붙는다. 파일명으로 자동 수집하는 편리함을 잃는 대신,
 * 수가 무엇을 뜻하는지가 분명해진다.
 *
 * ## 왜 lint 가 아니라 래칫인가
 *
 * 각각이 **자기 렌더 게이트의 모델을 퇴장 창 동안 붙들어야** 해서 기계적이지
 * 않다(`useSurfaceSwap` 이 그 일을 한다). 오늘 강제되는 것은 하나다 —
 * **등록부가 늘지 않는다.**
 *
 * ## 빈 등록부 (2026-08-03) — 그리고 그때 게이트가 죽지 않게 하는 법
 *
 * 남아 있던 두 줄이 이렇게 정리됐다:
 *
 * | 파일 | 판정 |
 * |---|---|
 * | `TopologyV2DetailPanel` | **고쳤다.** 부모가 계산해 내려주던 `presence` prop 을 걷고 패널이 자기 `<Surface>` 를 진다. 퇴장 창의 주인이 파일 안으로 들어왔다 |
 * | `VaultAgentPanel` | **오등재였다.** 부모의 삼항은 `llmBridgeAvailable`(= `isTauri()`) 이라 세션 중에 뒤집히지 않는 **환경 게이트**이고, 열고 닫기는 이미 폭 리플로우(`--agent-panel-reflow-duration`)로 애니메이션한다. 게다가 `Surface` 로 감싸면 닫을 때 언마운트되어 **전송 범위 동의와 대화 기록이 날아간다** — 고치는 게 아니라 회귀다. 위 표의 «부모가 이미 애니메이션한다» 부류. 다만 그 파일 **안**에 진짜 하드컷이 하나 있었다(곁가지 공개 상자, `{meta ? … : null}`) — 그건 `<Surface>` 로 갚았다 |
 *
 * ⚠️ **등록부가 0 이 되면 위의 세 테스트는 전부 공집합 위에서 돈다.** 그때부터
 * "초록"은 «탐지기가 통과시켰다» 가 아니라 «탐지기가 아무것도 안 봤다» 는 뜻이고,
 * 둘은 화면에서 구별되지 않는다(`/gate-probe` 가 매번 묻는 그 질문).
 *
 * 그래서 아래 「탐지기 프로브」가 **상주**한다 — 등록부와 무관하게 판정 함수
 * 자체를 양방향으로 겨눈다: 기제가 없는 픽스처는 잡아야 하고, 기제가 있는 실제
 * 파일은 놓아줘야 한다. 이 프로브가 초록이면 «등록부가 비었을 뿐 탐지기는 산다»
 * 가 참이 된다.
 */

/**
 * **부모가 조건부로 그리는데 등장/퇴장이 없는 표면.** 각 줄이 주장이고, 그
 * 주장은 부모의 렌더 게이트를 열어 확인한 것이다.
 *
 * 여기 없는데 하드컷인 표면을 발견하면 **줄을 더하는 게 아니라 고친다** — 이
 * 등록부는 부채 목록이지 허가 목록이 아니다.
 */
type Registry = ReadonlyArray<readonly [file: string, why: string]>;

const HARD_CUT_REGISTRY: Registry = [
  // 비어 있다 (2026-08-03). 마지막 두 줄이 어떻게 사라졌는지는 아래 「빈 등록부」 절.
];

/**
 * **리터럴 0 이다 — 파생값이 아니다.**
 *
 * 종전엔 `= HARD_CUT_REGISTRY.length` 였고, 그러면 아래 "늘지 않는다" 테스트가
 * **원리적으로 실패할 수 없다**: 줄을 더하면 baseline 도 같이 올라간다. 지우는
 * 쪽만 자동으로 따라 내려오면 되는데 더하는 쪽까지 따라 올라가서, 래칫의 멈춤쇠가
 * 양방향으로 헐거웠다. 0 에 도달한 김에 못을 박는다 — 새 하드컷을 등재하려면
 * 이 숫자를 **손으로** 올려야 하고, 그 diff 가 곧 «왜» 를 적을 자리다.
 */
const BASELINE_HARD_CUT_SURFACES = 0;

/** 등록부가 실재하는 파일만 가리키는지 볼 때 쓴다. */
const SURFACE_SUFFIXES = ['Panel', 'Sheet', 'Modal', 'Drawer', 'Popover', 'Dialog'];

/**
 * 표면에 등장/퇴장을 주는 **인정되는 기제**. 새 기제를 도입하면 여기 등재한다.
 *
 * ⚠️ 판정은 소스 **문자열 포함**이라 주석도 코드로 읽힌다 — 프로브를 돌리다
 * 실제로 두 번 걸렸다(픽스처의 «쓰지 마라» 경고문, 그리고 패널의 JSDoc). 이
 * 탐지기는 «기제의 이름이 이 파일에 등장하는가» 까지만 안다. 그 위의 «정말
 * 나가는 길이 있는가» 는 그 표면의 단위 테스트가 진다.
 */
const MOTION_MECHANISMS = ['AnimatePresence', 'usePanelPresence', 'useSurfaceSwap', '<Surface'];

/**
 * 등록부를 **인자로 받는다** — 빈 등록부 위에서도 탐지기 자체를 겨눠 볼 수
 * 있어야 하기 때문이다(아래 「탐지기 프로브」).
 */
function stillHardCut(registry: Registry = HARD_CUT_REGISTRY): string[] {
  return registry
    .filter(([file]) => {
      const source = readFileSync(file, 'utf8');
      return !MOTION_MECHANISMS.some((m) => source.includes(m));
    })
    .map(([file]) => file);
}

describe('등장·퇴장 래칫', () => {
  const hardCut = stillHardCut();

  it('등록부의 파일이 전부 실재한다 — 없는 파일을 세면 수가 거짓이 된다', () => {
    for (const [file] of HARD_CUT_REGISTRY) {
      expect(existsSync(file), `${file} 이 없다 — 옮겼거나 지웠으면 등록부도 고친다`).toBe(true);
      const base = file.split('/').pop()!.replace('.tsx', '');
      expect(
        SURFACE_SUFFIXES.some((s) => base.endsWith(s)),
        `${base} 는 표면 접미사 관례를 안 따른다`,
      ).toBe(true);
    }
  });

  it('등록부가 늘지 않는다 — 새 표면은 Surface 로 감싼다', () => {
    expect(
      HARD_CUT_REGISTRY.length,
      '새 하드컷을 등록부에 더하지 마라. `<Surface open={…}>` 로 감싸면 퇴장 창 · 퇴장 클래스 · ' +
        'inert · 포커스 복귀가 기본으로 딸려 온다. 정말 갚을 수 없는 부채라면 ' +
        '`BASELINE_HARD_CUT_SURFACES` 를 손으로 올리고 그 diff 에 «왜» 를 적어라.',
    ).toBeLessThanOrEqual(BASELINE_HARD_CUT_SURFACES);
  });

  it('고쳤으면 등록부에서 지운다 — 여유를 무료로 두지 않는다', () => {
    expect(
      hardCut.length,
      `등록부에 있는데 이미 등장/퇴장을 갖춘 파일이 있다. 부채를 갚았으면 줄을 지워라:\n` +
        HARD_CUT_REGISTRY.filter(([f]) => !hardCut.includes(f))
          .map(([f]) => `  ${f}`)
          .join('\n'),
    ).toBe(HARD_CUT_REGISTRY.length);
  });
});

/**
 * **등록부가 비어도 탐지기는 산다** — `/gate-probe` 규율.
 *
 * 위 세 테스트는 이제 공집합 위에서 돌아 «통과» 와 «아무것도 안 봄» 이 구별되지
 * 않는다. 여기서 판정 함수를 **양방향으로** 겨눈다.
 *
 * ②의 대상이 픽스처가 아니라 **실물 두 개**인 것은 의도다: 이 프로브가 곧 그
 * 둘의 회귀 가드가 된다. `<Surface>` 를 걷어내면 등록부가 비어 있어도 여기서
 * 빨개진다 — 그게 없으면 «고쳤다» 는 사실을 아무도 안 지킨다.
 */
describe('탐지기 프로브 — 등록부가 비어도 이 게이트는 산다', () => {
  const HARD_CUT_FIXTURE = 'tests/fixtures/surface-motion/HardCutPanel.tsx.fixture';
  const CONVERTED = [
    'src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx',
    'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx',
  ];

  it('① 기제가 없는 파일을 실제로 잡는다', () => {
    expect(existsSync(HARD_CUT_FIXTURE), '프로브 픽스처가 사라지면 탐지기 증명도 사라진다').toBe(
      true,
    );
    expect(stillHardCut([[HARD_CUT_FIXTURE, '프로브 — 일부러 하드컷']])).toEqual([
      HARD_CUT_FIXTURE,
    ]);
  });

  it('② 기제가 있는 파일은 놓아준다 — 전환한 둘이 되돌아가면 여기서 걸린다', () => {
    for (const file of CONVERTED) {
      expect(
        stillHardCut([[file, '프로브 — 이미 전환된 표면']]),
        `${file} 에서 등장/퇴장 기제가 사라졌다 — 등록부가 비어 있어도 이건 회귀다`,
      ).toEqual([]);
    }
  });
});
