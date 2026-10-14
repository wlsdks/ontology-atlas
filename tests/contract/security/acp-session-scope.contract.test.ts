import { describe, expect, it } from 'vitest';

import {
  keepSessionsInFolder,
  type AcpSessionSummary,
} from '@/features/acp-session/model/acp-client';

/**
 * `session/list` ignores `cwd` and returns conversations from other folders, so the list is filtered
 * to this folder. The check stays even if the adapter starts filtering.
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
     * A prefix comparison lets `/Users/jinan/vault` admit `/Users/jinan/vault-2`. And a
     * conversation in a subfolder was **opened in that subfolder**, not in this vault —
     * sessions we start always have the vault root as cwd.
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
    // "When in doubt, show everything" is exactly the shape of this accident. When in
    // doubt, show nothing.
    expect(keepSessionsInFolder([row(VAULT, 'a')], '')).toEqual([]);
    expect(keepSessionsInFolder([row(VAULT, 'a')], '   ')).toEqual([]);
  });

  it('폴더를 모르는 줄은 버린다', () => {
    const bad = { sessionId: 'x', cwd: undefined, title: null, updatedAt: null };
    expect(keepSessionsInFolder([bad as unknown as AcpSessionSummary], VAULT)).toEqual([]);
  });

  it('실측에서 실제로 돌아온 목록을 그대로 넣어 본다', () => {
    /*
     * Rows are the exact ones the real probe received; invented input cannot show the gate blocks the
     * real case.
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
    // One surviving title from an unopened folder is the defect.
    expect(kept.some((s) => s.title?.includes('디자인 시스템'))).toBe(false);
  });
});
