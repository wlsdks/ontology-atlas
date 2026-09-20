import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import enMessages from '../../../../messages/en.json';
import { AcpPermissionCard } from './AcpPermissionCard';
import type { TaskMeaningReviewController } from '../model/use-task-meaning-review';

const KO = koMessages.acpChat.permission;

/**
 * This card is where **the most expensive single decision** in this product happens:
 * the agent wants to touch something outside the folder, and the person decides
 * whether to allow it.
 *
 * Measured 2026-08-17: the card showed only **where** and nowhere **what it was
 * trying to do**. Reading `/etc/hosts` and deleting it looked identical on screen.
 * The value was arriving as `toolKind` and the screen was not reading it.
 */

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

/** The measured shape the adapter sends along with 「Keep allowing」. */
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
    // The old copy asserted "the whole folder containing the path above". That scope
    // is not ours to decide, so when it is unknown, allowing once is what is offered.
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
    expect(screen.getByTestId('task-review-task').tagName).toBe('DETAILS');
    expect(document.getElementById('acp-permission-body')).toHaveClass('sr-only');
    fireEvent.click(screen.getByTestId('task-review-action-scope').querySelector('summary')!);
    expect(screen.getByTestId('task-review-action-scope')).toHaveTextContent(koMessages.acpChat.permission.ontologyWriteUnverifiedBody);
    fireEvent.click(screen.getByTestId('task-review-task').querySelector('summary')!);
    expect(screen.getByTestId('task-review-outcome')).toHaveTextContent('환불 자격 조건을 바꿔줘');
    expect(screen.getByText(koMessages.acpChat.permission.taskReview.nonGoalsUnstructured)).toBeVisible();
    expect(screen.getByTestId('task-review-summary')).toHaveTextContent('capabilities/refund');
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

  it('작업 검토는 증거 머리말에서 시작하고 다음 Tab이 작업 공개로 간다', () => {
    const { view } = taskCard();
    render(view);
    expect(document.activeElement).toBe(screen.getByTestId('task-review-heading'));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    const disclosure = screen.getByTestId('task-review-task').querySelector('summary');
    disclosure?.focus();
    expect(document.activeElement).toBe(disclosure);
    expect(document.activeElement).not.toBe(screen.getByTestId('acp-permission-allow'));
  });

  /*
   * Measured on the rendered tab (2026-09-20): with no comparison basis it stated the same fact
   * five times — the standing sentence, the reason, and `Before · unavailable` once per meaning
   * unit. Three copies of an unchanging line pushed apart the three proposed values a person came
   * here to read, and the tab overflowed by 54px because of them.
   */
  it('비교할 이전 값이 없다는 말은 한 번만 하고, 제안값 사이에 끼어들지 않는다', () => {
    const { view } = taskCard();
    render(view);
    fireEvent.click(screen.getByTestId('task-review-depth-compare'));
    const compare = screen.getByTestId('task-review-compare');
    const taskReview = koMessages.acpChat.permission.taskReview;

    // Said once, at the top, as the promise it is.
    expect(compare).toHaveTextContent(taskReview.beforeUnavailable);
    expect(compare.textContent!.split(taskReview.beforeUnavailable).length - 1).toBe(1);
    // Never again beside each unit.
    expect(compare).not.toHaveTextContent(taskReview.beforeUnknown);

    // Every proposed value is still here, and still marked as proposed rather than current.
    expect(compare).toHaveTextContent('Refund only after capture.');
    expect(compare.textContent!.split(taskReview.after).length - 1).toBeGreaterThan(1);
  });

  it('서 있는 문장은 원인을 대지 않는다 — 원인은 아는 쪽이 말한다', () => {
    /*
     * The standing sentence used to assert a missing historical snapshot while the reason list,
     * rendered right under it, said the request shape is not comparable. Two causes for one
     * absence, and only the specific one was true. The sentence now carries the half that always
     * holds — values are not invented — and leaves the cause to `taskReview.reason.*`.
     *
     * ⚠️ That the reason line is drawn is not checked here: this card's fixture reports no
     * `unavailable` reasons, so the list is empty in jsdom. It is in the rendered evidence
     * (`unsupported_request`, compare tab, 2026-09-20).
     */
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

  /*
   * Measured in the rendered Details tab (2026-09-20), on the row reporting the write guard:
   * `expected_mtime  1727000000000`. That number is the write condition — the file is written only
   * if it has not changed since that moment — and thirteen digits answer nothing a person came
   * here to ask.
   */
  it('쓰기 조건의 시각은 사람이 읽을 수 있게 나오고, 정확한 값은 그대로 남는다', () => {
    const { view } = taskCard();
    render(view);
    fireEvent.click(screen.getByTestId('task-review-depth-details'));
    const details = screen.getByTestId('task-review-details');
    fireEvent.click(within(details).getByText(koMessages.acpChat.permission.taskReview.provenance));

    const row = within(details).getByText('expected_mtime').nextElementSibling!;
    // The epoch is no longer what a person reads…
    expect(row.textContent).not.toBe('100');
    // …it is a time, and it is the same instant the request named.
    expect(row.textContent).toContain('1970');
    // …and the exact millisecond is still reachable for an agent or a terminal reader.
    expect(row.getAttribute('title')).toBe('100');
  });

  /*
   * Measured on the rendered card (2026-09-20): this grid drew four label/value pairs and the
   * value column held exactly one distinct value across all four — "unknown" — because `code`,
   * `merge` and `deployment` were written as the literal `'unknown'` key and could never say
   * anything else. Four facts drawn, one carried. The claim they stood in for is a sentence on
   * the same card, and it is the stronger one: allowing does not grant those things, which is not
   * the same as their state being unavailable.
   */
  it('상태가 움직이는 줄만 그리고, 나머지 셋은 문장이 계속 이름을 부른다', () => {
    const { view, resolve } = taskCard();
    render(view);
    expect(screen.getByTestId('task-review-authority-meaning')).toHaveTextContent('알 수 없음');
    for (const authority of ['code', 'merge', 'deployment']) {
      expect(
        screen.queryByTestId(`task-review-authority-${authority}`),
        `${authority} 줄은 늘 「알 수 없음」만 말할 수 있어 그려지지 않는다`,
      ).toBeNull();
    }
    // Nothing was lost: the standing sentence still names all four and says what Allow does not do.
    const card = screen.getByTestId('acp-permission-card');
    expect(card).toHaveTextContent(koMessages.acpChat.permission.taskReview.allowScope);
    for (const word of ['의미', '코드 검증', '병합', '배포']) {
      expect(card.textContent, `${word}를 이제 아무 데서도 말하지 않는다`).toContain(word);
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
    expect(screen.getByTestId('task-review-authority-meaning')).toHaveTextContent('알 수 없음');
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
    expect(screen.getByText(koMessages.acpChat.permission.taskReview.interventionHint)).toHaveTextContent('대신 보내지도');
    expect(screen.getByText(koMessages.acpChat.permission.taskReview.interventionHint)).toHaveTextContent('저장되지 않아요');
  });
});

describe('금고 서버가 스스로 물을 때 — 카드가 그 문장을 그대로 보여준다', () => {
  /*
   * Wire capture, 2026-08-24. The vault's MCP server pauses each write through
   * `elicitation/create`; `codex-acp` forwards it as `session/request_permission` with **no
   * `toolCall.title`** and `kind: "other"`, putting the question in `toolCall.content[]`:
   *
   *   "Create concept wire-probe. Apply this change to the vault?"
   *
   * The screen was not reading that field, so the card printed 「the tool did not say what it wants
   * to do」 and 「cannot tell what it wants to do」, one under the other — two lines, no information.
   */
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


/**
 * Measured in the installed app, 2026-08-25: right after pressing 「make a map from my code」, this
 * card warned that the agent wanted to touch something **outside this folder** — which was the
 * person's own project, the thing they had just asked for. Since maps live inside projects, code
 * reads are outside the vault by construction, so that warning now fires on the intended path. A
 * warning that cries wolf teaches people to click through it.
 */
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
    // Neutral card, same as inside the project: no amber alarm for the person's own folder.
    expect(screen.getByTestId('acp-permission-card').className).not.toContain('amber');
  });

  it('정말 다른 곳은 예전 경고 그대로다 — 주의가 필요한 쪽', () => {
    render(card('read', '/Users/dana/.ssh/id_rsa', [], VAULT));
    expect(screen.getByText(koMessages.acpChat.permission.title)).toBeInTheDocument();
  });
});

/**
 * Owner, 2026-08-25: *"the colours are bad and the inside layout is poor."*
 *
 * Every non-write request was painted warning amber, including the one whose sentence says *this is
 * your own project, nothing has happened yet*. A frame that shouts while the words reassure teaches
 * people the amber means nothing — the cry-wolf failure the copy fix addressed, left standing in the
 * paint.
 */
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

/**
 * ⚠️ Written because the app appeared not to respond to 「keep allowing」 while driving it by hand
 * (2026-08-25). No test covered whether that button returns anything, so there was nothing to
 * distinguish a broken control from clicks that never reached the window — and the two failures had
 * landed one pixel apart. A claim of "reproduced" was made and then withdrawn.
 *
 * These hold the wiring so the next such report can be answered in a second: each control returns
 * **its own option id**, and rejection returns null rather than a stale id.
 */
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

/**
 * ⚠️ **The card has to be answerable in three seconds** (owner, installed app at 1512×982,
 * 2026-09-06: *"can this design be improved? look at references… something is lacking"*).
 *
 * The measured screen: one fixed title — 「Review the proposed change」 — a fixed body sentence, an
 * operation heading, and then the request itself: the slug in mono, the frontmatter key in mono,
 * the argument beside it. Every line true, none of them the answer to *what will change, in which
 * file*. `relation_notes` was one JSON string until that morning and one text block after it; both
 * shapes ask a person to parse a value at a checkpoint that has the agent stopped.
 *
 * This is the case the redesign was built against — eight reasons written into one document — and
 * it is checked here rather than only in the app because this card renders **only** under an ACP
 * runtime, so it has no route to screenshot. The three claims are the three the owner has to be
 * able to trust: the title says the change, the eight sentences are eight rows, and the two answers
 * are outside the scroller no matter how long the change is.
 */
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
    ).toBe('ontology-atlas 문서에 연결 이유 8개를 적습니다');
  });

  it('문장 여덟 개는 줄 여덟 개로 읽힌다 — JSON 을 읽으라고 하지 않는다', () => {
    render(writeCard());
    const rows = screen.getAllByTestId('ontology-change-review-entry-row');
    expect(rows).toHaveLength(8);
    expect(rows[0]).toHaveTextContent('domains/graph-modeling');
    expect(rows[7]).toHaveTextContent('elements/vault-session 와 이어지는 이유 8.');

    const text = screen.getByTestId('acp-permission-card').textContent ?? '';
    expect(text, '괄호와 따옴표를 사람이 풀어 읽게 하면 결정이 아니라 해독이 된다').not.toContain('{"');
    // The document the bytes land in stays on screen exactly as it will be addressed.
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
    // The wider grant never appears beside a semantic write.
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
    // The gate is the person: Allow is still offered.
    expect(screen.getByTestId('acp-permission-allow')).toBeTruthy();
  });

  /** One missing frontmatter field, as the validator hands it over. */
  const missing = (field: string) => ({
    code: `missing-field:${field}`,
    message: `\`${field}:\` is missing. The page name a person reads.`,
    detail: { key: 'missing-field', values: { field } },
  });

  it('says every listed finding in the reader\'s language, not only the first', () => {
    /*
     * Measured on the rendered card (2026-09-20): four rows, one English sentence on the
     * first, three bare machine codes under it. The sentences existed the whole time under
     * `library.wiki.problem.*`; the card was printing the validator's copy for machines.
     */
    render(cardWithVerdict({ ok: false, problems: [missing('title'), missing('created_by')] }));
    const block = screen.getByTestId('acp-permission-page-verdict');
    expect(block.textContent).toContain('파일 맨 위 정보칸에 title 줄이 없어요.');
    expect(block.textContent).toContain('파일 맨 위 정보칸에 created_by 줄이 없어요.');
    // The validator's English copy is for machines and does not reach a Korean screen.
    expect(block.textContent).not.toContain('is missing. The page name a person reads.');
  });

  it('counts what it did not list, so the header is never larger than the list', () => {
    const problems = ['title', 'created_by', 'compiled_at', 'sources', 'summary', 'kind'].map(missing);
    render(cardWithVerdict({ ok: false, problems }));
    const block = screen.getByTestId('acp-permission-page-verdict');
    expect(block.textContent).toContain('6건');
    // Four are listed; the two it withheld are stated rather than dropped.
    expect(block.textContent).toContain('파일 맨 위 정보칸에 sources 줄이 없어요.');
    expect(block.textContent).not.toContain('파일 맨 위 정보칸에 summary 줄이 없어요.');
    expect(block.textContent).toContain('그 밖에 2건');
  });

  it('says nothing about a rest that does not exist', () => {
    render(cardWithVerdict({ ok: false, problems: [missing('title')] }));
    expect(screen.getByTestId('acp-permission-page-verdict').textContent).not.toContain('그 밖에');
  });
});
