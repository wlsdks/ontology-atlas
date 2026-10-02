import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import enMessages from '../../../../messages/en.json';
import { EXIT_WINDOW_MS } from '@/shared/lib/use-presence';
import { AcpPermissionCard } from './AcpPermissionCard';
import type { TaskMeaningReviewController } from '../model/use-task-meaning-review';

const KO = koMessages.acpChat.permission;

function card(
  toolKind: string | null,
  filePath: string | null = '/etc/hosts',
  extraOptions: Array<{ optionId: string; kind: string; name: string | null }> = [],
  vaultPath: string | null = null,
) {
  return (
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AcpPermissionCard
        pending={{
          request: {
            title: '무언가',
            toolCallId: 'tool-permission',
            toolName: 'Write',
            toolKind,
            filePath,
            rawInput: {},
            reviewKind: 'permission',
            options: [
              { optionId: 'reject', kind: 'reject_once', name: '거절' },
              { optionId: 'allow', kind: 'allow_once', name: '허용' },
              ...extraOptions,
            ],
          },
          resolve: vi.fn(),
        }}
        vaultPath={vaultPath}
      />
    </NextIntlClientProvider>
  );
}

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

describe('온톨로지 쓰기 검토 — 한 번의 정확한 결정만 제공한다', () => {
  it('typed change를 보여 주고 계속 허용은 숨긴다', () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AcpPermissionCard
          pending={{
            request: {
              title: 'mcp__atlas-vault__add_relation',
              toolCallId: 'tool-relation',
              toolName: 'mcp__atlas-vault__add_relation',
              toolKind: 'other',
              filePath: null,
              reviewKind: 'ontology-write',
              rawInput: {
                from: 'capabilities/contextual-editing',
                to: 'domains/graph-modeling',
                type: 'depends_on',
                why: '지도 안 편집이 graph modeling 계약을 따른다.',
              },
              options: [
                { optionId: 'reject', kind: 'reject_once', name: '거절' },
                { optionId: 'allow', kind: 'allow_once', name: '허용' },
                ...alwaysWith([
                  { type: 'tool', toolName: 'mcp__atlas-vault__add_relation' },
                ]),
              ],
            },
            resolve: vi.fn(),
          }}
        />
      </NextIntlClientProvider>,
    );

    const review = screen.getByTestId('acp-ontology-change-review');
    expect(review.textContent).toContain('capabilities/contextual-editing');
    expect(review.textContent).toContain('depends_on');
    expect(review.textContent).toContain('domains/graph-modeling');
    expect(screen.queryByTestId('acp-permission-allow-always')).toBeNull();
  });
});

describe('작업에 묶인 의미 검토 — 실행 권한과 의미 판단을 섞지 않는다', () => {
  function taskCard(
    resolve = vi.fn(),
    taskReview?: TaskMeaningReviewController,
    actions: { onRequestCorrection?: () => void; onDefer?: () => void } = {},
  ) {
    return {
      resolve,
      view: (
        <NextIntlClientProvider locale="ko" messages={koMessages}>
          <AcpPermissionCard
            taskReview={taskReview}
            vaultPath="/vault"
            {...actions}
            pending={{
              request: {
                requestId: 0,
                sessionId: 'session-1',
                title: 'mcp__atlas-vault__patch_concept',
                toolCallId: 'tool-task-review',
                toolName: 'mcp__atlas-vault__patch_concept',
                toolKind: 'other',
                filePath: null,
                reviewKind: 'ontology-write',
                rawInput: {
                  slug: 'capabilities/refund',
                  expected_mtime: 100,
                  frontmatter: {
                    title: 'Refund eligibility',
                    description: 'Review a bounded refund policy.',
                    status: 'proposed',
                    dependencies: ['capabilities/ledger'],
                    relates: ['capabilities/notifications'],
                    relation_notes: {
                      'capabilities/ledger': 'Refund eligibility depends on the recorded ledger state.',
                      'capabilities/notifications': 'Notification delivery remains a separate responsibility.',
                    },
                  },
                  body: '## Definition\n\nRefund eligibility for a captured payment.\n\n```md\n## Excludes\nThis heading is quoted data, not a section boundary.\n```\n\n## Includes\n\n- Refund only after capture.\n\n## Excludes\n\n- Do not retry a settled refund.\n\n## Uncertainty\n\nTransport delivery is unknown.\n',
                },
                options: [
                  { optionId: 'reject', kind: 'reject_once', name: '거절' },
                  { optionId: 'allow', kind: 'allow_once', name: '허용' },
                ],
              },
              origin: {
                sessionGeneration: 3,
                turn: { sessionId: 'session-1', vaultRoot: '/vault', userEventId: 'user-event-7', text: '환불 자격 조건을 바꿔줘' },
                task: { outcome: '환불 자격 조건을 바꿔줘', nonGoals: null, structure: 'unstructured' },
                taskBaseline: null,
              },
              resolve,
            }}
          />
        </NextIntlClientProvider>
      ),
    };
  }

  it('작업과 정확한 제안 범위를 먼저 보이고 의미 검토가 미완료라고 말한다', () => {
    const { view } = taskCard();
    render(view);
    expect(screen.getByTestId('task-review-outcome-compact')).toHaveTextContent('환불 자격 조건을 바꿔줘');
    expect(screen.getByTestId('task-review-outcome-compact').className).not.toContain('line-clamp');
    expect(screen.queryByTestId('task-review-task-toggle')).toBeNull();
    expect(document.getElementById('acp-permission-body')).toHaveClass('sr-only');
    expect(screen.queryByTestId('task-review-action-scope')).toBeNull();
    expect(screen.getByTestId('task-review-scope')).toHaveTextContent('capabilities/refund');
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('Refund eligibility');
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('Review a bounded refund policy.');
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('Refund only after capture.');
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('This heading is quoted data, not a section boundary.');
    expect(screen.getByTestId('task-review-summary')).not.toHaveTextContent('## Definition');
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('Transport delivery is unknown.');
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('Refund eligibility depends on the recorded ledger state.');
    expect(screen.getByTestId('task-review-coverage')).toHaveTextContent('미완료');
    expect(screen.getByTestId('task-review-coverage')).toHaveTextContent('6개 중 5개');
    expect(screen.getByTestId('task-review-coverage')).toHaveTextContent('생략 1개');
    expect(screen.queryByTestId('acp-ontology-change-review')).not.toBeInTheDocument();
    expect(screen.getByTestId('acp-permission-allow').className).toContain('atlas-touch-floor');
    expect(screen.getByTestId('acp-permission-allow').className).not.toContain('bg-[color:var(--color-indigo-accent)]');
  });

  it('opens the task review on its title, never on an answer', () => {
    const { view } = taskCard();
    render(view);
    expect(document.activeElement).toBe(document.getElementById('acp-permission-title'));
    for (const id of ['acp-permission-allow', 'acp-permission-reject', 'task-review-correct', 'task-review-defer']) {
      expect(document.activeElement).not.toBe(screen.queryByTestId(id));
    }
  });

  it('비교할 이전 값이 없다는 말은 한 번만 하고, 제안값 사이에 끼어들지 않는다', () => {
    const { view } = taskCard();
    render(view);
    fireEvent.click(screen.getByTestId('task-review-depth-compare'));
    const compare = screen.getByTestId('task-review-compare');
    const taskReview = koMessages.acpChat.permission.taskReview;

    expect(compare).toHaveTextContent(taskReview.beforeUnavailable);
    expect(compare.textContent!.split(taskReview.beforeUnavailable).length - 1).toBe(1);

    expect(compare).not.toHaveTextContent(taskReview.beforeUnknown);

    expect(compare).toHaveTextContent('Refund only after capture.');
    expect(compare.textContent!.split(taskReview.after).length - 1).toBeGreaterThan(1);
  });

  it('서 있는 문장은 원인을 대지 않는다 — 원인은 아는 쪽이 말한다', () => {

    for (const locale of [koMessages, enMessages]) {
      const sentence = locale.acpChat.permission.taskReview.beforeUnavailable;
      for (const cause of ['스냅샷', 'snapshot']) {
        expect(sentence, 'the standing sentence names a cause it cannot know').not.toContain(cause);
      }
    }
  });

  it('상세에서 전체 요청과 쓰기 조건·숫자 요청 id를 보존한다', () => {
    const { view } = taskCard();
    render(view);
    fireEvent.click(screen.getByTestId('task-review-depth-details'));
    expect(screen.getByTestId('acp-ontology-change-review')).toBeVisible();
    const details = screen.getByTestId('task-review-details');
    fireEvent.click(within(details).getByText(koMessages.acpChat.permission.taskReview.provenance));
    const requestId = within(details).getByText('0');
    expect(requestId).toHaveAttribute('data-request-id-type', 'number');
    expect(details).toHaveTextContent('expected_mtime');
  });

  it('쓰기 조건의 시각은 사람이 읽을 수 있게 나오고, 정확한 값은 그대로 남는다', () => {
    const { view } = taskCard();
    render(view);
    fireEvent.click(screen.getByTestId('task-review-depth-details'));
    const details = screen.getByTestId('task-review-details');
    fireEvent.click(within(details).getByText(koMessages.acpChat.permission.taskReview.provenance));

    const row = within(details).getByText('expected_mtime').nextElementSibling!;

    expect(row.textContent).not.toBe('100');

    expect(row.textContent).toContain('1970');

    expect(row.getAttribute('title')).toBe('100');
  });

  it('상태가 움직이는 줄만 그리고, 나머지 셋은 문장이 계속 이름을 부른다', () => {
    const { view, resolve } = taskCard();
    render(view);
    for (const authority of ['meaning', 'code', 'merge', 'deployment']) {
      expect(
        screen.queryByTestId(`task-review-authority-${authority}`),
        `the ${authority} row could only say unknown here, so it is not drawn`,
      ).toBeNull();
    }
    expect(screen.getByTestId('acp-permission-card').textContent).not.toContain(KO.taskReview.authority.unknown);
    const effect = screen.getByTestId('task-review-allow-scope');
    expect(effect).toHaveTextContent(KO.taskReview.allowEffectNamed.replace('{name}', 'refund'));
    for (const word of ['의미', '코드 검증', '병합', '배포']) {
      expect(effect.textContent, `${word} is no longer said anywhere`).toContain(word);
    }

    fireEvent.click(screen.getByTestId('acp-permission-allow'));
    expect(resolve).toHaveBeenCalledWith('allow');
    expect(screen.queryByText(/승인됨|검증됨|배포됨/)).not.toBeInTheDocument();
  });

  it('신뢰 비교를 보여 주고 의미 승인 중에도 거절은 남기며 쓰기 권한을 실행하지 않는다', async () => {
    let finish!: (value: boolean) => void;
    const markMeaningAccepted = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const controller: TaskMeaningReviewController = {
      status: 'ready', requestKey: 'opaque-request', reasons: [],
      items: [{
        id: 'claim:condition', claimId: 'body', field: 'body', facet: 'condition', kind: 'changed',
        before: { present: true, value: 'Refund only after settlement.' },
        after: { present: true, value: 'Refund only after capture.' },
        sourceRefs: [], counterevidence: [], unknowns: [], meaningImpact: 'review-required',
      }],
      coverage: { total: 1, inspected: 1, omitted: 0, complete: true },
      proposal: null,
      historicalBasis: { meaningBasis: 'meaning:before', sourceBasisId: 'source:before' },
      currentBasis: { meaningBasis: 'meaning:current', sourceBasisId: 'source:current' },
      meaningStatus: 'unreviewed', executionBlocked: false, actualReportedRoot: null,
      guardStatus: 'verified', markMeaningAccepted,
    };
    const { view, resolve } = taskCard(vi.fn(), controller);
    render(view);
    expect(screen.getByTestId('task-review-authority-meaning')).toHaveTextContent('검토 대기');
    fireEvent.click(screen.getByTestId('task-review-depth-compare'));
    const compare = screen.getByTestId('task-review-compare');
    expect(compare).toHaveTextContent('Refund only after settlement.');
    expect(compare).toHaveTextContent('Refund only after capture.');

    fireEvent.click(screen.getByTestId('task-review-depth-details'));
    expect(screen.getByText(koMessages.ontologyChangeReview.requestValuesRaw)).toBeVisible();
    expect(screen.queryByText(koMessages.ontologyChangeReview.afterValuesOnly)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ontology-change-review-field-toggle'));
    const acknowledgement = screen.getByRole('checkbox', { name: /요청 항목 1개 전체/ });
    await waitFor(() => expect(acknowledgement).not.toBeDisabled());
    fireEvent.click(acknowledgement);
    fireEvent.click(screen.getByTestId('task-review-accept-meaning'));
    expect(markMeaningAccepted).toHaveBeenCalledWith({ acknowledgeFullScope: true });
    expect(resolve).not.toHaveBeenCalled();
    expect(screen.getByTestId('acp-permission-allow')).toBeDisabled();
    expect(screen.getByTestId('acp-permission-reject')).not.toBeDisabled();
    finish(true);
    await waitFor(() => expect(screen.getByTestId('acp-permission-allow')).not.toBeDisabled());
  });

  it('근거를 불러오는 동안 허용은 막고 거절은 계속 제공한다', () => {
    const loading: TaskMeaningReviewController = {
      status: 'loading', requestKey: 'opaque-loading', reasons: [], items: [],
      coverage: { total: 0, inspected: 0, omitted: 0, complete: false },
      proposal: null, historicalBasis: null, currentBasis: null, meaningStatus: 'unknown',
      executionBlocked: false, actualReportedRoot: null, guardStatus: 'unknown',
      markMeaningAccepted: vi.fn(async () => false),
    };
    render(taskCard(vi.fn(), loading).view);
    expect(screen.getByTestId('acp-permission-allow')).toBeDisabled();
    expect(screen.getByTestId('acp-permission-reject')).not.toBeDisabled();
    expect(screen.queryByTestId('task-review-authority-meaning')).toBeNull();
  });

  it('관찰된 연결 루트가 다를 때만 쓰기와 의미 승인을 막고 정확한 두 루트를 말한다', () => {
    const mismatch: TaskMeaningReviewController = {
      status: 'unavailable', requestKey: 'opaque-mismatch', reasons: ['connection_root_mismatch'], items: [],
      coverage: { total: 0, inspected: 0, omitted: 0, complete: false },
      proposal: null, historicalBasis: null, currentBasis: null, meaningStatus: 'unknown',
      executionBlocked: true, actualReportedRoot: '/other-vault', guardStatus: 'unknown',
      markMeaningAccepted: vi.fn(async () => false),
    };
    render(taskCard(vi.fn(), mismatch).view);
    const warning = screen.getByTestId('task-review-root-mismatch');
    expect(warning).toHaveTextContent('/other-vault');
    expect(warning).toHaveTextContent('/vault');
    expect(screen.getByTestId('acp-permission-allow')).toBeDisabled();
    expect(screen.getByTestId('acp-permission-reject')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('task-review-depth-details'));
    expect(screen.queryByTestId('task-review-accept-meaning')).not.toBeInTheDocument();
  });

  it('수정과 대기는 쓰기 권한을 해결하지 않고 각 부모 동작만 요청한다', () => {
    const onRequestCorrection = vi.fn();
    const onDefer = vi.fn();
    const { view, resolve } = taskCard(vi.fn(), undefined, { onRequestCorrection, onDefer });
    render(view);
    fireEvent.click(screen.getByTestId('task-review-correct'));
    expect(onRequestCorrection).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('task-review-defer'));
    expect(onDefer).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
    const legend = screen.getByTestId('task-review-answer-legend');
    expect(legend).toHaveTextContent(KO.taskReview.correctEffect);
    expect(legend).toHaveTextContent(KO.taskReview.deferEffect);
    expect(KO.taskReview.correctEffect).toContain('대신 보내지도');
    expect(KO.taskReview.deferEffect).toContain('저장되지 않아요');
  });
});

describe('금고 서버가 스스로 물을 때 — 카드가 그 문장을 그대로 보여준다', () => {

  const ASK = 'Create concept wire-probe. Apply this change to the vault?';

  function consentCard() {
    return (
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AcpPermissionCard
          pending={{
            request: {
              title: ASK,
              toolCallId: 'elicitation-ontology-atlas',
              toolName: null,
              toolKind: 'other',
              filePath: null,
              rawInput: { serverName: 'ontology-atlas' },
              reviewKind: 'permission',
              options: [
                { optionId: 'accept', kind: 'allow_once', name: 'Accept' },
                { optionId: 'decline', kind: 'reject_once', name: 'Decline' },
              ],
            },
            resolve: vi.fn(),
          }}
        />
      </NextIntlClientProvider>
    );
  }

  it('묻는 문장을 읽을 크기로 세우고, 모른다는 말을 두 번 하지 않는다', () => {
    render(consentCard());
    expect(screen.getByTestId('acp-permission-ask').textContent).toBe(ASK);
    expect(
      screen.queryByTestId('acp-permission-intent'),
      '문장을 아는데도 「무엇을 하려는지 알 수 없어요」를 또 적었다',
    ).toBeNull();
    const text = screen.getByTestId('acp-permission-card').textContent ?? '';
    expect(text).not.toContain(KO.unknownTarget);
    expect(text).not.toContain(KO.intent.unknown);
  });

  it('폴더 밖을 건드린다고 말하지 않는다 — 이건 고른 폴더 안의 변경이다', () => {
    render(consentCard());
    const text = screen.getByTestId('acp-permission-card').textContent ?? '';
    expect(text).toContain(KO.consentTitle);
    expect(text).not.toContain(KO.title);
  });

  it('평범한 도구 호출은 예전 그대로 무엇을 하려는지 말한다', () => {
    render(card('delete'));
    expect(screen.getByTestId('acp-permission-intent').dataset.intent).toBe('delete');
    expect(screen.queryByTestId('acp-permission-ask')).toBeNull();
  });
});

describe('권한 카드 — 내 프로젝트 안과 전혀 다른 곳을 다르게 말한다', () => {
  const VAULT = '/Users/dana/my-product/atlas';

  it('내 프로젝트 안이면 그렇게 말한다', () => {
    render(card('read', '/Users/dana/my-product/src/orders.ts', [], VAULT));
    expect(screen.getByText(koMessages.acpChat.permission.insideProjectTitle)).toBeInTheDocument();
  });

  it('a write inside the open folder itself says so — not "code in your project" (live turn, 2026-09-06)', () => {
    render(card('edit', `${VAULT}/wiki/plan.md`, [], VAULT));
    expect(screen.getByText(koMessages.acpChat.permission.insideFolderTitle)).toBeInTheDocument();
    expect(screen.queryByText(koMessages.acpChat.permission.insideProjectTitle)).toBeNull();

    expect(screen.getByTestId('acp-permission-card').className).not.toContain('amber');
  });

  it('정말 다른 곳은 예전 경고 그대로다 — 주의가 필요한 쪽', () => {
    render(card('read', '/Users/dana/.ssh/id_rsa', [], VAULT));
    expect(screen.getByText(koMessages.acpChat.permission.title)).toBeInTheDocument();
  });
});

describe('권한 카드 색 — 경보는 벌어들인 자리에만 쓴다', () => {
  const VAULT = '/Users/dana/my-product/atlas';
  const panel = () => screen.getByTestId('acp-permission-card');

  it('내 프로젝트 안이면 경고색을 쓰지 않는다', () => {
    render(card('read', '/Users/dana/my-product/src/orders.ts', [], VAULT));
    expect(
      panel().className,
      '괜찮다고 말하면서 경고색으로 감싸면 그 색을 아무도 안 믿게 된다',
    ).not.toContain('amber');
  });

  it('정말 다른 곳이면 경고색을 쓴다 — 주의가 필요한 쪽', () => {
    render(card('read', '/Users/dana/.ssh/id_rsa', [], VAULT));
    expect(panel().className).toContain('amber');
  });
});

describe('권한 카드 — 세 버튼이 각자의 답을 돌려준다', () => {
  const options = [
    { optionId: 'reject', kind: 'reject_once', name: '거절' },
    { optionId: 'allow', kind: 'allow_once', name: '허용' },
    { optionId: 'always', kind: 'allow_always', name: '항상' },
  ];

  function withResolve() {
    const resolve = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AcpPermissionCard
          pending={{
            request: {
              title: '무언가',
              toolCallId: 'tool-permission',
              toolName: 'Read',
              toolKind: 'read',
              filePath: '/etc/hosts',
              rawInput: {},
              reviewKind: 'permission',
              options,
            },
            resolve,
          }}
        />
      </NextIntlClientProvider>,
    );
    return resolve;
  }

  it('「이번 대화 내내 허용」은 allow_always 의 id 를 돌려준다', () => {
    const resolve = withResolve();
    fireEvent.click(screen.getByTestId('acp-permission-allow-always'));
    expect(resolve).toHaveBeenCalledWith('always');
  });

  it('「이번만 허용」은 allow_once 의 id 를 돌려준다', () => {
    const resolve = withResolve();
    fireEvent.click(screen.getByTestId('acp-permission-allow'));
    expect(resolve).toHaveBeenCalledWith('allow');
  });

  it('「안 할래요」는 거절을 돌려준다 — 남의 id 를 흘리지 않는다', () => {
    const resolve = withResolve();
    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    expect(resolve).toHaveBeenCalledWith('reject');
  });
});

describe('온톨로지 쓰기 — 여덟 문장을 사람이 읽는 카드', () => {
  const TARGETS = [
    'domains/graph-modeling',
    'domains/agent-collaboration',
    'capabilities/contextual-editing',
    'capabilities/mcp-server',
    'capabilities/topology-map',
    'elements/acp-permission-card',
    'elements/ontology-change-review',
    'elements/vault-session',
  ];
  const NOTES = Object.fromEntries(
    TARGETS.map((target, index) => [target, `${target} 와 이어지는 이유 ${index + 1}.`]),
  );

  function writeCard() {
    return (
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AcpPermissionCard
          pending={{
            request: {
              title: 'mcp__atlas-vault__patch_concept',
              toolCallId: 'tool-patch',
              toolName: 'mcp__atlas-vault__patch_concept',
              toolKind: 'other',
              filePath: null,
              reviewKind: 'ontology-write',
              rawInput: {
                slug: 'projects/ontology-atlas',
                frontmatter: { relation_notes: NOTES },
              },
              options: [
                { optionId: 'reject', kind: 'reject_once', name: '거절' },
                { optionId: 'allow', kind: 'allow_once', name: '허용' },
              ],
            },
            resolve: vi.fn(),
          }}
        />
      </NextIntlClientProvider>
    );
  }

  it('제목이 어느 문서에 무엇을 몇 개 적는지 그 말로 말한다', () => {
    render(writeCard());
    expect(
      document.getElementById('acp-permission-title')?.textContent,
      '제목이 모든 요청에 똑같이 참이면 아무것도 답해 주지 않는다',
    ).toBe('ontology-atlas 문서에 연결 이유 8개를 적어요');
  });

  it('문장 여덟 개는 줄 여덟 개로 읽힌다 — JSON 을 읽으라고 하지 않는다', () => {
    render(writeCard());
    const rows = screen.getAllByTestId('ontology-change-review-entry-row');
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent('domains/graph-modeling');
    expect(rows[7]).toHaveTextContent('elements/vault-session 와 이어지는 이유 8.');

    const text = screen.getByTestId('acp-permission-card').textContent ?? '';
    expect(text, '괄호와 따옴표를 사람이 풀어 읽게 하면 결정이 아니라 해독이 된다').not.toContain('{"');

    expect(screen.getByText('projects/ontology-atlas')).toBeInTheDocument();
  });

  it('변경이 길어도 답할 두 버튼은 스크롤 바깥에 남는다', () => {
    render(writeCard());
    const card = screen.getByTestId('acp-permission-card');
    const scroller = screen.getByTestId('acp-permission-body-scroll');
    const reject = screen.getByTestId('acp-permission-reject');
    const allow = screen.getByTestId('acp-permission-allow');

    expect(scroller.className).toContain('overflow-y-auto');
    expect(scroller.contains(screen.getAllByTestId('ontology-change-review-entry-row')[0])).toBe(true);
    expect(scroller.contains(reject), '답이 스크롤 안에 있으면 긴 변경은 벽이 된다').toBe(false);
    expect(scroller.contains(allow)).toBe(false);
    expect(card.contains(reject)).toBe(true);
    expect(card.contains(allow)).toBe(true);
    expect(card.className).toContain('max-h-full');

    expect(screen.queryByTestId('acp-permission-allow-always')).toBeNull();
  });

  it('여는 순간 초점은 거절 쪽이다 — 아무 키나 눌러 허용에 닿지 않는다', () => {
    render(writeCard());
    expect(document.activeElement).toBe(screen.getByTestId('acp-permission-reject'));
  });
});

describe('권한 카드 — 쓰기 전에 문서 판정을 보여준다', () => {
  function cardWithVerdict(
    verdict: {
      ok: boolean;
      problems: Array<{
        code: string;
        message: string;
        line?: number;
        detail?: { key: string; values?: Record<string, string> };
      }>;
    } | null,
  ) {
    return (
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <AcpPermissionCard
          pending={{
            request: {
              title: 'wiki/plan.md 쓰기',
              toolCallId: 'tool-permission',
              toolName: 'Write',
              toolKind: 'edit',
              filePath: '/vault/wiki/plan.md',
              rawInput: {},
              reviewKind: 'permission',
              options: [
                { optionId: 'reject', kind: 'reject_once', name: '거절' },
                { optionId: 'allow', kind: 'allow_once', name: '허용' },
              ],
            },
            resolve: vi.fn(),
          }}
          vaultPath="/vault"
          writeVerdict={verdict}
        />
      </NextIntlClientProvider>
    );
  }

  it('says nothing when there is no verdict, rather than guessing', () => {
    render(cardWithVerdict(null));
    expect(screen.queryByTestId('acp-permission-page-verdict')).toBeNull();
  });

  it('a fitting page gets one quiet line and both buttons stay', () => {
    render(cardWithVerdict({ ok: true, problems: [] }));
    const block = screen.getByTestId('acp-permission-page-verdict');
    expect(block.getAttribute('data-ok')).toBe('true');
    expect(block.textContent).toContain('문서 모양이 맞아요');
    expect(screen.getByTestId('acp-permission-allow')).toBeTruthy();
    expect(screen.getByTestId('acp-permission-reject')).toBeTruthy();
  });

  it('a failing page lists its codes with the first message, before the person decides', () => {
    render(
      cardWithVerdict({
        ok: false,
        problems: [
          { code: 'uncited-fact', message: '인용 없는 사실', line: 12 },
          { code: 'citation-target-missing', message: '없는 파일' },
        ],
      }),
    );
    const block = screen.getByTestId('acp-permission-page-verdict');
    expect(block.getAttribute('data-ok')).toBe('false');
    expect(block.textContent).toContain('2건');
    expect(block.textContent).toContain('uncited-fact:12');
    expect(block.textContent).toContain('인용 없는 사실');
    expect(block.textContent).toContain('citation-target-missing');

    expect(screen.getByTestId('acp-permission-allow')).toBeTruthy();
  });

  const missing = (field: string) => ({
    code: `missing-field:${field}`,
    message: `\`${field}:\` is missing. The page name a person reads.`,
    detail: { key: 'missing-field', values: { field } },
  });

  it('says every listed finding in the reader\'s language, not only the first', () => {

    render(cardWithVerdict({ ok: false, problems: [missing('title'), missing('created_by')] }));
    const block = screen.getByTestId('acp-permission-page-verdict');
    expect(block.textContent).toContain('파일 맨 위 정보칸에 title 줄이 없어요.');
    expect(block.textContent).toContain('파일 맨 위 정보칸에 created_by 줄이 없어요.');

    expect(block.textContent).not.toContain('is missing. The page name a person reads.');
  });

  it('counts what it did not list, so the header is never larger than the list', () => {
    const problems = ['title', 'created_by', 'compiled_at', 'sources', 'summary', 'kind'].map(missing);
    render(cardWithVerdict({ ok: false, problems }));
    const block = screen.getByTestId('acp-permission-page-verdict');
    expect(block.textContent).toContain('6건');

    expect(block.textContent).toContain('파일 맨 위 정보칸에 sources 줄이 없어요.');
    expect(block.textContent).not.toContain('파일 맨 위 정보칸에 summary 줄이 없어요.');
    expect(block.textContent).toContain('그 밖에 2건');
  });

  it('says nothing about a rest that does not exist', () => {
    render(cardWithVerdict({ ok: false, problems: [missing('title')] }));
    expect(screen.getByTestId('acp-permission-page-verdict').textContent).not.toContain('그 밖에');
  });
});

describe('a one-field patch: the decision first, the evidence after', () => {
  const TASK = '이 폴더의 원문을 읽고 위키 문서를 써 줘. 형식은 아래 템플릿 그대로여야 해.\n\n폴더: /Users/probe/launch\n템플릿:\n## Summary\n## Facts';

  function titlePatch({
    resolve = vi.fn(),
    locale = 'ko',
    onRequestCorrection = vi.fn(),
    onDefer = vi.fn(),
    frontmatter = { title: 'Probe delivery pipeline' },
  }: {
    resolve?: (optionId: string | null) => void;
    locale?: 'ko' | 'en';
    onRequestCorrection?: () => void;
    onDefer?: () => void;
    frontmatter?: Record<string, unknown>;
  } = {}) {
    render(
      <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? koMessages : enMessages}>
        <AcpPermissionCard
          vaultPath="/vault"
          onRequestCorrection={onRequestCorrection}
          onDefer={onDefer}
          pending={{
            request: {
              requestId: 7,
              sessionId: 'session-1',
              title: 'mcp__atlas-vault__patch_concept',
              toolCallId: 'tool-title',
              toolName: 'mcp__atlas-vault__patch_concept',
              toolKind: 'other',
              filePath: null,
              reviewKind: 'ontology-write',
              rawInput: {
                slug: 'capabilities/probe-delivery',
                expected_mtime: 1_727_000_000_000,
                frontmatter,
              },
              options: [
                { optionId: 'reject', kind: 'reject_once', name: '거절' },
                { optionId: 'allow', kind: 'allow_once', name: '허용' },
              ],
            },
            origin: {
              sessionGeneration: 1,
              turn: { sessionId: 'session-1', vaultRoot: '/vault', userEventId: 'user-event-1', text: TASK },
              task: { outcome: TASK, nonGoals: null, structure: 'unstructured' },
              taskBaseline: null,
            },
            resolve,
          }}
        />
      </NextIntlClientProvider>,
    );
  }

  it('shows the new name and its document in the summary and draws no empty row', () => {
    titlePatch();
    expect(document.getElementById('acp-permission-title')?.textContent).toBe('probe-delivery 문서의 이름 항목을 고쳐요');
    expect(screen.getByTestId('task-review-scope')).toHaveTextContent('capabilities/probe-delivery');
    const value = screen.getByTestId('task-review-value');
    expect(value.getAttribute('data-field-key')).toBe('title');
    expect(value).toHaveTextContent('이름');
    expect(value).toHaveTextContent('Probe delivery pipeline');
    expect(screen.getByTestId('task-review-coverage')).toHaveTextContent(KO.taskReview.detailsPointer);
    expect(screen.queryByTestId('task-review-action-scope')).toBeNull();
    expect(screen.queryByTestId('task-review-authority-meaning')).toBeNull();
    const text = screen.getByTestId('acp-permission-card').textContent ?? '';
    expect(text).not.toContain(KO.taskReview.authority.unknown);
    expect(text).not.toContain('동작 범위');
    expect(screen.getByTestId('task-review-allow-scope')).toHaveTextContent(KO.taskReview.allowEffectNamed.replace('{name}', 'probe-delivery'));
  });

  it('shows the first paragraph of the task whole and counts the rest before unfolding it', () => {
    titlePatch();
    expect(screen.getByTestId('task-review-outcome-compact').textContent).toBe('이 폴더의 원문을 읽고 위키 문서를 써 줘. 형식은 아래 템플릿 그대로여야 해.');
    const toggle = screen.getByTestId('task-review-task-toggle');
    expect(toggle).toHaveTextContent('나머지 4줄 보기');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('task-review-outcome')).toHaveTextContent('폴더: /Users/probe/launch');
    expect(screen.getByText(KO.taskReview.nonGoalsUnstructured)).toBeInTheDocument();
  });

  it('pairs No thanks with Allow once at one size, with the rarer answers as smaller buttons above', () => {
    titlePatch();
    const reject = screen.getByTestId('acp-permission-reject');
    const allow = screen.getByTestId('acp-permission-allow');
    const correct = screen.getByTestId('task-review-correct');
    const defer = screen.getByTestId('task-review-defer');
    for (const main of [reject, allow]) {
      expect(main.className).toContain('h-10');
      expect(main.className).toContain('w-full');
    }
    for (const rare of [correct, defer]) {
      expect(rare.className).toContain('h-8');
      expect(rare.className).not.toContain('w-full');
    }
    for (const button of [reject, allow, correct, defer]) {
      expect(button.className, 'a borderless text-only answer does not read as a button').not.toContain('bg-transparent');
    }
    expect(allow.className).toContain('bg-[color:var(--color-indigo-brand)]');
    expect([reject, correct, defer].filter((button) => button.className.includes('bg-[color:var(--color-indigo-brand)]'))).toHaveLength(0);
    expect(reject.parentElement).toBe(allow.parentElement);
    expect(correct.parentElement).toBe(defer.parentElement);
    const order = [...screen.getByTestId('acp-permission-card').querySelectorAll('button[data-testid]')]
      .map((button) => button.getAttribute('data-testid'))
      .filter((id) => ['task-review-correct', 'task-review-defer', 'acp-permission-reject', 'acp-permission-allow'].includes(id ?? ''));
    expect(order).toEqual(['task-review-correct', 'task-review-defer', 'acp-permission-reject', 'acp-permission-allow']);
    expect(document.getElementById(correct.getAttribute('aria-describedby') ?? '')).toHaveTextContent(KO.taskReview.correctEffect);
    expect(document.getElementById(defer.getAttribute('aria-describedby') ?? '')).toHaveTextContent(KO.taskReview.deferEffect);
    expect(document.getElementById(allow.getAttribute('aria-describedby') ?? '')).toHaveTextContent(KO.taskReview.allowEffectNamed.replace('{name}', 'probe-delivery'));
  });

  it('draws a decline as done, not as danger', async () => {
    const resolve = vi.fn();
    titlePatch({ resolve });
    fireEvent.click(screen.getByTestId('acp-permission-reject'));
    expect(resolve).toHaveBeenCalledWith('reject');
    const receipt = await screen.findByTestId('acp-permission-answered');
    await waitFor(() => expect(receipt).toHaveAttribute('data-feedback', 'done'));
    expect(receipt).toHaveAttribute('data-answer', 'reject');
    expect(receipt.querySelector('[data-feedback-glyph="done"]')).not.toBeNull();
    expect(receipt).toHaveTextContent(KO.answered.rejectNamed.replace('{name}', 'probe-delivery'));
    expect(screen.getByTestId('acp-permission-card')).toHaveAttribute('inert');
    expect(screen.getByRole('status')).toHaveTextContent(KO.answered.rejectNamed.replace('{name}', 'probe-delivery'));
    const row = screen.getByTestId('acp-permission-allow').parentElement!;
    expect(row).toHaveAttribute('aria-hidden', 'true');
    expect(row.className).toContain('map-overlay-out');
    expect(row.className).toContain('row-start-1');
    expect(receipt.parentElement?.className).toContain('row-start-1');
    const rare = screen.getByTestId('task-review-rare-answers');
    expect(rare).toHaveAttribute('aria-hidden', 'true');
    expect(rare.className).toContain('map-overlay-out');
  });

  it('shows the receipt only once the answer row has faded out', () => {
    vi.useFakeTimers();
    try {
      titlePatch();
      fireEvent.click(screen.getByTestId('acp-permission-reject'));
      expect(screen.queryByTestId('acp-permission-answered')).toBeNull();
      act(() => { vi.advanceTimersByTime(EXIT_WINDOW_MS); });
      expect(screen.queryByTestId('acp-permission-answered')).toBeNull();
      act(() => { vi.advanceTimersByTime(EXIT_WINDOW_MS); });
      expect(screen.getByTestId('acp-permission-answered')).toHaveAttribute('data-feedback', 'done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when the answer fails to send, and keeps the answers', async () => {
    const resolve = vi.fn(() => {
      throw new Error('transport closed');
    });
    titlePatch({ resolve });
    fireEvent.click(screen.getByTestId('acp-permission-allow'));
    const receipt = await screen.findByTestId('acp-permission-answered');
    await waitFor(() => expect(receipt).toHaveAttribute('data-feedback', 'failed'));
    expect(receipt).toHaveTextContent(KO.answered.failed);
    expect(screen.getByTestId('acp-permission-card')).not.toHaveAttribute('inert');
    expect(screen.getByTestId('acp-permission-allow')).toBeInTheDocument();
    expect(screen.getByTestId('acp-permission-reject')).toBeInTheDocument();
  });

  it('keeps a failed answer failed after the feedback dwell, never turning it into a receipt', () => {
    vi.useFakeTimers();
    try {
      titlePatch({ resolve: vi.fn(() => { throw new Error('transport closed'); }) });
      fireEvent.click(screen.getByTestId('acp-permission-allow'));
      act(() => { vi.advanceTimersByTime(1_600); });
      const card = screen.getByTestId('acp-permission-card');
      expect(card).not.toHaveAttribute('inert');
      expect(screen.getByTestId('acp-permission-answered')).toHaveAttribute('data-feedback', 'failed');
      expect(card.textContent).toContain(KO.answered.failed);
      expect(card.textContent).not.toContain(KO.answered.allowNamed.replace('{name}', 'probe-delivery'));
      expect(screen.getByRole('status')).toHaveTextContent(KO.answered.failed);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps lists, line breaks, removals and empty values apart, and leaves no relation note out', () => {
    titlePatch({
      frontmatter: {
        relates: ['a', 'b'],
        depends_on: ['a\nb'],
        status: null,
        description: 'None',
        domains: [],
        display: '',
        relation_notes: { x: 'kept', y: null, z: { nested: 1 } },
      },
    });
    const value = (key: string) => screen.getAllByTestId('task-review-value').find((row) => row.getAttribute('data-field-key') === key)!;
    expect(value('relates').querySelectorAll('li')).toHaveLength(2);
    expect(value('depends_on').querySelectorAll('li')).toHaveLength(1);
    expect(value('depends_on').querySelector('li')?.textContent).toContain('a\nb');
    expect(value('status').querySelector('[data-value-kind="removed"]')).toHaveTextContent(koMessages.ontologyChangeReview.valueRemoved);
    expect(value('description').querySelector('[data-value-kind="text"]')).toHaveTextContent('None');
    expect(value('domains').querySelector('[data-value-kind="empty-list"]')).toHaveTextContent(koMessages.ontologyChangeReview.valueEmptyList);
    expect(value('display').querySelector('[data-value-kind="empty-text"]')).toHaveTextContent(koMessages.ontologyChangeReview.valueEmptyText);
    const summary = screen.getByTestId('task-review-summary');
    expect(summary).toHaveTextContent('relation_notes · x');
    expect(summary).toHaveTextContent('kept');
    expect(summary).toHaveTextContent('relation_notes · y');
    expect(summary).toHaveTextContent('relation_notes · z');
    expect(summary).toHaveTextContent('{"nested":1}');
    expect(screen.getByTestId('task-review-coverage')).toHaveTextContent(KO.taskReview.detailsPointer);
  });

  it('says the same facts in the same places in English', () => {
    titlePatch({ locale: 'en' });
    expect(document.getElementById('acp-permission-title')?.textContent).toBe('Changes the name of probe-delivery');
    expect(screen.getByTestId('task-review-value')).toHaveTextContent('Probe delivery pipeline');
    expect(screen.getByTestId('task-review-allow-scope')).toHaveTextContent('Runs this one write to “probe-delivery”.');
    expect(screen.getByTestId('task-review-task-toggle')).toHaveTextContent('Show the remaining 4 lines');
  });
});
