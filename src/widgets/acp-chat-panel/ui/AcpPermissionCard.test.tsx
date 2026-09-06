import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import koMessages from '../../../../messages/ko.json';
import { AcpPermissionCard } from './AcpPermissionCard';

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
  function cardWithVerdict(verdict: { ok: boolean; problems: Array<{ code: string; message: string; line?: number }> } | null) {
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
    expect(block.textContent).toContain('문서 모양이 맞습니다');
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
});
