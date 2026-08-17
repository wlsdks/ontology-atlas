import { describe, expect, it } from 'vitest';

import {
  keepSessionsInFolder,
  type AcpSessionSummary,
} from '@/features/acp-session/model/acp-client';

/**
 * 지난 대화 목록은 **이 폴더 것만** 보여 준다.
 *
 * ## 왜 이 게이트가 있나 (2026-08-16 실측)
 *
 * `session/list` 에 `cwd` 를 넘겨도 어댑터는 그 폴더로 걸러 주지 않는다. 실제로
 * 돌려받은 것에는 앱에서 열지도 않은 다른 저장소들의 대화가 **제목까지** 들어
 * 있었다:
 *
 * ```
 * { cwd: "/Users/…/side-project/ontology-atlas", title: "디자인 시스템 수준 파악" }
 * { cwd: "/Users/…/workspaces/…/main-3",        title: "Buzz 오픈소스 분석 …" }
 * ```
 *
 * 그대로 화면에 뿌리면 Atlas 가 **사용자가 이 앱에서 연 적 없는 폴더의 작업
 * 제목**을 띄운다. 신뢰 헌장 ②(사용자 모르게 수집하는 것 0)와 로컬 우선 규칙
 * (볼트 밖을 훑지 않는다)이 정면으로 막는 일이고, 사용자가 화면을 보기 전까지
 * 아무도 모른다 — 코드는 멀쩡해 보이고 검사도 다 통과한다.
 *
 * **어댑터가 나중에 제대로 걸러 주게 되어도 이 검사는 남는다.** 남이 고쳐 줄
 * 것에 우리 약속을 걸지 않는다.
 */

function row(cwd: string, id = cwd): AcpSessionSummary {
  return { sessionId: id, cwd, title: `${id} 의 대화`, updatedAt: null };
}

const VAULT = '/Users/jinan/vault';

describe('지난 대화 목록 — 이 폴더 밖은 나가지 않는다', () => {
  it('다른 폴더의 대화는 버린다', () => {
    const kept = keepSessionsInFolder(
      [
        row(VAULT, 'here'),
        row('/Users/jinan/side-project/other', 'other'),
        row('/Users/jinan/work/secret-client', 'client'),
      ],
      VAULT,
    );
    expect(kept.map((s) => s.sessionId)).toEqual(['here']);
  });

  it('상위 폴더도 하위 폴더도 이 폴더가 아니다', () => {
    /*
     * 접두사로 비교하면 `/Users/jinan/vault` 가 `/Users/jinan/vault-2` 를
     * 통과시킨다. 그리고 하위 폴더의 대화는 **그 하위 폴더에서 연 것**이지
     * 이 볼트에서 연 것이 아니다 — 우리가 띄운 세션은 언제나 볼트 루트가 cwd 다.
     */
    const kept = keepSessionsInFolder(
      [row(VAULT, 'here'), row('/Users/jinan/vault-2', 'sibling'), row(`${VAULT}/docs`, 'child'), row('/Users/jinan', 'parent')],
      VAULT,
    );
    expect(kept.map((s) => s.sessionId)).toEqual(['here']);
  });

  it('끝의 슬래시는 같은 폴더다', () => {
    expect(keepSessionsInFolder([row(`${VAULT}/`, 'a')], VAULT)).toHaveLength(1);
    expect(keepSessionsInFolder([row(VAULT, 'a')], `${VAULT}/`)).toHaveLength(1);
  });

  it('기준 폴더가 없으면 **아무것도** 안 보여 준다', () => {
    // 「모르면 다 보여 준다」가 정확히 이 사고의 모양이다. 모르면 안 보여 준다.
    expect(keepSessionsInFolder([row(VAULT, 'a')], '')).toEqual([]);
    expect(keepSessionsInFolder([row(VAULT, 'a')], '   ')).toEqual([]);
  });

  it('폴더를 모르는 줄은 버린다', () => {
    const bad = { sessionId: 'x', cwd: undefined, title: null, updatedAt: null };
    expect(keepSessionsInFolder([bad as unknown as AcpSessionSummary], VAULT)).toEqual([]);
  });

  it('실측에서 실제로 돌아온 목록을 그대로 넣어 본다', () => {
    /*
     * 지어낸 입력만으로는 이 게이트가 진짜 사고를 막는지 알 수 없다. 2026-08-16
     * 프로브가 받은 그 줄들을 그대로 쓴다.
     */
    const measured: AcpSessionSummary[] = [
      { sessionId: 'cbc05282', cwd: '/Users/jinan/orca/workspaces/ontology-atlas/main-3', title: 'Buzz 오픈소스 분석 및 Claude 통합 연구', updatedAt: '2026-08-16T06:02:05.323Z' },
      { sessionId: '4d4488f6', cwd: '/Users/jinan/orca/workspaces/ontology-atlas/main-3/docs/ontology', title: '이 폴더의 온톨로지가 …', updatedAt: '2026-08-16T05:52:03.576Z' },
      { sessionId: 'cf8805fa', cwd: '/Users/jinan/side-project/ontology-atlas', title: '디자인 시스템 수준 파악', updatedAt: '2026-08-16T05:20:18.126Z' },
    ];
    const kept = keepSessionsInFolder(
      measured,
      '/Users/jinan/orca/workspaces/ontology-atlas/main-3/docs/ontology',
    );
    expect(kept.map((s) => s.sessionId)).toEqual(['4d4488f6']);
    // 열지 않은 폴더의 제목이 하나라도 남으면 그게 결함이다.
    expect(kept.some((s) => s.title?.includes('디자인 시스템'))).toBe(false);
  });
});
