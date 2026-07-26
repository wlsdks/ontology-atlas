/**
 * 이 세션이 **지금 무엇을 할 수 있는가** — 「할 일」 큐의 배치와 행동 라벨을
 * 정하는 세 가지 사실.
 *
 * 왜 역할이 아니라 능력인가: 이 제품에는 계정이 없다(local-first 영구 계약).
 * 그래서 "누구인가" 는 알 방법이 없고, 알아낼 필요도 없다 — 필요한 건
 * "지금 이 화면에서 끝까지 갈 수 있는 일이 무엇인가" 뿐이다. 앱은 그걸 이미
 * 안다:
 *
 * 1. **볼트에 쓸 수 있나** — 내 폴더를 연 세션인가(샘플은 읽기 전용).
 * 2. **에이전트가 관측되나** — 이 폴더에서 에이전트가 일한 기록이 있나.
 * 3. **이 개념에 문서가 있나** — 행마다 다르므로 여기 담지 않고
 *    `isEvidenceOnlyConcept` / `resolveNodeDocument` 가 행 단위로 답한다.
 *
 * 프로필·역할·뷰어 모드를 저장하기 시작하면 그건 이름만 다른 로그인이다 —
 * 그 순간 이 파일은 잘못된 방향으로 자란 것이므로 되돌린다.
 */

export interface SessionAbilities {
  /** ① 내 폴더가 열려 있어 프론트매터를 그 자리에서 고칠 수 있다. */
  canWriteVault: boolean;
  /** ② 이 폴더에서 에이전트가 일한 기록이 있다(heartbeat 파일 실측). */
  agentObserved: boolean;
}

export interface SessionAbilityInput {
  /** 'local' = 사용자 폴더, 'static' = 번들 샘플. */
  dataSourceMode: "local" | "static";
  /** `useLocalVault().status`. */
  vaultStatus: string;
  /**
   * `useLocalVault().isReloadingSameVault` — 같은 폴더를 다시 읽는 중.
   *
   * 왜 필요한가: 저장 직후 재스캔 동안 status 가 'loading' 이 되는데, 그걸
   * "쓸 수 없게 됐다" 로 읽으면 묶음 순서가 잠깐 뒤집힌다. 순서가 뒤집히면
   * 큐가 통째로 다시 그려지고, 방금 저장한 행의 확인 줄이 그 프레임에
   * 사라진다(2026-07-26 실측: 확인 줄이 한 번도 안 보였다). 폴더를 다시 읽는
   * 동안 쓰기 권한이 사라지는 것은 아니다.
   */
  reloadingSameVault?: boolean;
  /** `useLocalVault().agentActivityStatus` — 없으면 미관측. */
  agentActivity?: { exists: boolean; valid: boolean } | null;
}

/**
 * 세 사실 중 세션 단위 둘을 뽑는다. 공방(`OntologyStudioPage`)이 쓰기 가능
 * 판정에 쓰는 식과 **같은 식**이다 — 한 앱 안에서 "쓸 수 있다" 의 뜻이 표면마다
 * 갈라지면 한쪽은 폼을 내밀고 다른 쪽은 복사 버튼을 내민다.
 */
export function resolveSessionAbilities(input: SessionAbilityInput): SessionAbilities {
  return {
    canWriteVault:
      input.dataSourceMode === "local" &&
      (input.vaultStatus === "loaded" || input.reloadingSameVault === true),
    // `stale` 은 보지 않는다 — heartbeat 는 몇 분이면 낡지만, 그 폴더에
    // 에이전트가 물려 있다는 사실 자체는 낡지 않는다. 여기서 필요한 판정은
    // "지금 일하는 중인가" 가 아니라 "넘길 상대가 있는가" 다.
    agentObserved: Boolean(input.agentActivity?.exists && input.agentActivity?.valid),
  };
}
