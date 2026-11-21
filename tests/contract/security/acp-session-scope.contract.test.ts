import { describe, expect, it } from 'vitest';

import {
  keepSessionsInFolder,
  type AcpSessionSummary,
} from '@/features/acp-session/model/session-summaries';

/**
 * `session/list` ignores `cwd` and returns conversations from other folders, so the list is filtered
 * to this folder. The check stays even if the adapter starts filtering.
 */

function row(cwd: string, id = cwd): AcpSessionSummary {
  return { sessionId: id, cwd, title: `${id} 의 대화`, updatedAt: null };
}

const VAULT = '/Users/jinan/vault';

describe('past conversation list: nothing outside this folder leaves', () => {
  it('drops conversations of other folders', () => {
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

  it('neither a parent folder nor a subfolder is this folder', () => {
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

  it('a trailing slash is the same folder', () => {
    expect(keepSessionsInFolder([row(`${VAULT}/`, 'a')], VAULT)).toHaveLength(1);
    expect(keepSessionsInFolder([row(VAULT, 'a')], `${VAULT}/`)).toHaveLength(1);
  });

  it('shows **nothing** when there is no base folder', () => {
    // "When in doubt, show everything" is exactly the shape of this accident. When in
    // doubt, show nothing.
    expect(keepSessionsInFolder([row(VAULT, 'a')], '')).toEqual([]);
    expect(keepSessionsInFolder([row(VAULT, 'a')], '   ')).toEqual([]);
  });

  it('drops a line whose folder is unknown', () => {
    const bad = { sessionId: 'x', cwd: undefined, title: null, updatedAt: null };
    expect(keepSessionsInFolder([bad as unknown as AcpSessionSummary], VAULT)).toEqual([]);
  });

  it('feeds in the list exactly as it really came back from measurement', () => {
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
