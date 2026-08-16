import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { AcpPermissionCard } from './AcpPermissionCard';

/**
 * 이 카드는 이 제품에서 **가장 값비싼 한 번의 결정**이 일어나는 자리다:
 * 에이전트가 폴더 밖을 건드리려 하고, 사람이 허락할지 정한다.
 *
 * 2026-08-17 실측: 카드가 **어디**만 보여 주고 **무엇을 하려는지**는 어디에도
 * 없었다. `/etc/hosts` 를 읽겠다와 지우겠다가 화면에서 똑같았다. 값은
 * `toolKind` 로 오고 있었는데 화면이 안 읽었다.
 */

function card(
  toolKind: string | null,
  filePath: string | null = '/etc/hosts',
  extraOptions: Array<{ optionId: string; kind: string; name: string | null }> = [],
) {
  return (
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AcpPermissionCard
        pending={{
          request: {
            title: '무언가',
            toolName: 'Write',
            toolKind,
            filePath,
            options: [
              { optionId: 'reject', kind: 'reject_once', name: '거절' },
              { optionId: 'allow', kind: 'allow_once', name: '허용' },
              ...extraOptions,
            ],
          },
          resolve: vi.fn(),
        }}
      />
    </NextIntlClientProvider>
  );
}

/** 어댑터가 「계속 허용」에 딸려 보내는 실측 모양. */
const alwaysWith = (targets: unknown[]) => [
  {
    optionId: 'always',
    kind: 'allow_always',
    name: '항상',
    _meta: { permission: { changes: [{ targets }] } },
  },
];

describe('권한 카드 — 어디만이 아니라 무엇을 하려는지도 말한다', () => {
  it('고치려는 것과 읽으려는 것이 화면에서 다르다', () => {
    const { unmount } = render(card('edit'));
    const edit = screen.getByTestId('acp-permission-intent');
    expect(edit.getAttribute('data-intent')).toBe('edit');
    const editText = edit.textContent;
    unmount();

    render(card('read'));
    const read = screen.getByTestId('acp-permission-intent');
    expect(read.getAttribute('data-intent')).toBe('read');
    expect(
      read.textContent,
      '읽기와 고치기가 화면에서 같은 말이면 사람은 같은 결정을 내린다',
    ).not.toBe(editText);
  });

  it('지우려는 것을 그 말로 말한다 — 되돌리기가 가장 비싸다', () => {
    render(card('delete'));
    expect(screen.getByTestId('acp-permission-intent').getAttribute('data-intent')).toBe('delete');
  });

  it('모르면 **모른다고** 한다 — 읽기로 짐작하면 가장 위험한 쪽으로 틀린다', () => {
    render(card('something-the-adapter-invented'));
    expect(screen.getByTestId('acp-permission-intent').getAttribute('data-intent')).toBe('unknown');
  });

  it('경로는 그대로 남는다 — 무엇을 더한 것이지 무엇을 뺀 것이 아니다', () => {
    render(card('edit'));
    expect(screen.getByTestId('acp-permission-path').textContent).toBe('/etc/hosts');
  });

  it('경로를 모를 때도 무엇을 하려는지는 말한다', () => {
    render(card('execute', null));
    expect(screen.getByTestId('acp-permission-intent').getAttribute('data-intent')).toBe('execute');
  });
});

describe('계속 허용 — 어댑터가 말한 범위만 적는다', () => {
  it('도구 단위 허용이면 그 도구 이름을 화면에 적는다 (실측 모양)', () => {
    render(
      card('edit', '/etc/hosts', alwaysWith([
        { type: 'tool', toolName: 'mcp__atlas-vault__add_concept' },
      ])),
    );
    const scope = screen.getByTestId('acp-permission-scope');
    expect(scope.getAttribute('data-scope')).toBe('tool');
    expect(scope.textContent).toContain('mcp__atlas-vault__add_concept');
  });

  it('범위를 안 알려 주면 **폴더라고 단정하지 않는다**', () => {
    // 종전 문구는 "위 경로가 있는 폴더 전체" 라고 단정했다. 우리가 정하는
    // 범위가 아니므로, 모르면 한 번만 허용하는 쪽을 권한다.
    render(card('edit', '/etc/hosts', alwaysWith([])));
    const scope = screen.getByTestId('acp-permission-scope');
    expect(scope.getAttribute('data-scope')).toBe('unknown');
    expect(scope.textContent).not.toContain('폴더 전체');
  });

  it('계속 허용 선택지가 없으면 범위 줄도 없다 — 없는 결정을 설명하지 않는다', () => {
    render(card('edit'));
    expect(screen.queryByTestId('acp-permission-scope')).toBeNull();
  });
});
