/**
 * 「작업 방식」 목록의 안전 판정 — **아는 것과 모르는 것을 가른다.**
 *
 * ## 왜 (2026-08-17)
 *
 * 종전 판정은 거부목록 한 줄이었다:
 *
 * ```
 * modes.filter((m) => !GATE_REMOVING_MODES.has(m.id))
 * ```
 *
 * 이름을 적어 둔 것만 숨긴다. 그러니 **어댑터가 새 모드를 더하면 우리가 모르는
 * 채로 사용자에게 보이고, 고를 수 있다.** 그 모드가 관문을 없애는 것이면
 * 사용자는 한 번의 선택으로 이 화면의 약속을 무르게 되고, 화면은 아무 말도
 * 안 한다. **안전 장치가 모르는 것을 안전한 것처럼 다루면 그건 장치가 아니다.**
 *
 * 지금 당장의 문제이기도 하다: 어댑터 버전을 올리는 중이고
 * (`claude-agent-acp` 0.68→0.69 · `codex-acp` 1.3→1.4), 우리 관문 실측은
 * **옛 버전에서** 한 것이다.
 *
 * ## 셋으로 가른다
 *
 * - **재 봐서 관문을 없애는 것** → 아예 안 보여 준다(종전 그대로).
 * - **재 봐서 괜찮은 것** → 그냥 보여 준다.
 * - **아직 안 재 본 것** → 보여 주되 **모른다고 말한다.** 숨기지 않는 이유는
 *   멀쩡한 새 모드를 막는 것도 거짓말이기 때문이다. 권한 카드가 이미 같은
 *   규율을 쓴다(모르면 모른다고, 그리고 안전한 쪽을 권한다).
 */

/**
 * 판정에 필요한 최소한만 요구한다 — `id` 로만 가른다. 그래서 부르는 쪽의
 * 더 넓은 타입(`AcpChoice`)을 그대로 넣고 그대로 돌려받을 수 있다.
 */
export interface AcpModeChoice {
  id: string;
}

/**
 * **재 봐서 관문을 없애는** 모드들. 가르는 기준은 「엄격한가」가 아니라
 * **「묻지 않고 통과시키는가」**다 — 거절로 닫히는 모드(`dontAsk`)는 안전한
 * 쪽으로 실패하므로 여기 없다.
 */
const GATE_REMOVING = new Set([
  'bypasspermissions',
  'acceptedits',
  'agent-full-access',
  /*
   * `agent` 도 여기다. 이름만 보면 「보통 모드」 같지만 실측(2026-08-16)이
   * `src-tauri/src/acp.rs` 에 적혀 있다: codex 를 기본값(`agent`)으로 띄웠더니
   * *"작업 폴더 밖에 파일을 쓰면서 권한 요청이 0회"* 였다.
   */
  'agent',
]);

/** **재 봐서 관문이 남는** 모드들. 이 목록에 없으면 「모른다」다. */
const VERIFIED_SAFE = new Set(['default', 'read-only', 'readonly', 'plan', 'ask']);

const normalize = (id: unknown): string =>
  typeof id === 'string' ? id.trim().toLowerCase() : '';

export interface ModePartition<T extends AcpModeChoice = AcpModeChoice> {
  /** 화면에 내놓는 것들 — 잰 것과 못 잰 것이 함께 있다. */
  offered: T[];
  /** 그중 **아직 안 재 본** 것들의 id. 화면이 이 사실을 말해야 한다. */
  unverified: string[];
  /** 모양이 깨져 버린 항목 수 — 조용히 사라지지 않게 세어 둔다. */
  dropped: number;
}

export function partitionModes<T extends AcpModeChoice>(
  modes: readonly T[],
): ModePartition<T> {
  const offered: T[] = [];
  const unverified: string[] = [];
  let dropped = 0;
  for (const mode of Array.isArray(modes) ? modes : []) {
    const key = normalize(mode?.id);
    if (key.length === 0) {
      dropped += 1;
      continue;
    }
    if (GATE_REMOVING.has(key)) continue;
    offered.push(mode);
    if (!VERIFIED_SAFE.has(key)) unverified.push(mode.id);
  }
  return { offered, unverified, dropped };
}
