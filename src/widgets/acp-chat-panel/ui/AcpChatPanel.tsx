'use client';

import { ArrowUp, ChevronRight, History, Square, SquarePen, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';

import { Chip, IconButton, RowButton, Select, Surface, Textarea } from '@/shared/ui';
import { Tooltip, TooltipProvider } from '@/shared/ui/tooltip';
import { formatDate } from '@/shared/lib/format-date';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useHeldValue } from '@/shared/lib/use-presence';
import {
  COMPOSER_MIN_ROWS,
  composerGrowth,
  composerMaxRows,
  snapScrollTop,
} from '@/shared/lib/composer-growth';
import { cn } from '@/shared/lib/cn';
import { useAcpSession, type AcpEvent } from '@/features/acp-session/model/use-acp-session';
import { readAcpTrouble } from '@/features/acp-session/model/acp-trouble';
import {
  matchSlashCommands,
  slashQuery,
  type AcpSlashCommand,
} from '@/features/acp-session/model/slash-commands';
import { claudeLoginRepairCommand } from '@/features/acp-session/model/claude-login-repair';
import { modeCopyKey } from '@/features/acp-session/model/mode-copy';
import { withoutErrorEcho } from '@/features/acp-session/model/error-echo';
import type { ChatSuggestion } from '@/features/acp-session/model/chat-suggestions';
import { linkSlugs } from '@/features/acp-session/model/link-slugs';
import { readToolTargets } from '@/features/acp-session/model/tool-targets';

import { VAULT_MCP_SERVER_NAME } from '@/features/acp-session/model/vault-mcp-server';

import { AcpPermissionCard } from './AcpPermissionCard';
import { groupEvents } from './group-events';
import { toolLabel } from './tool-label';

/**
 * 대화 안의 마크다운 — **대화 밀도**로 맞춘 값 한 벌.
 *
 * 문서 화면(`ProjectDetailPage`)에도 같은 성격의 문자열이 있지만 그건 본문
 * 페이지용이라 한 단 크고 제목 여백이 세 배다. 셋째 소비처가 생기면 그때
 * 공용으로 올린다 — 지금 둘은 **정말 다른 밀도**라 합치면 한쪽이 망가진다.
 */
const CHAT_MARKDOWN = [
  'break-keep text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_p]:mb-2',
  '[&_ul]:my-2 [&_ul]:pl-[18px] [&_ol]:my-2 [&_ol]:pl-[18px]',
  '[&_li]:mb-1 [&_li]:list-disc [&_li]:pl-0.5 [&_li::marker]:text-[color:var(--color-text-quaternary)]',
  '[&_code]:rounded-micro [&_code]:border [&_code]:border-[color:var(--color-border-soft)]',
  '[&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-label [&_code]:text-[color:var(--color-text-tertiary)]',
  '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:border',
  '[&_pre]:border-[color:var(--color-border-soft)] [&_pre]:bg-[color:var(--color-overlay-1)] [&_pre]:p-2.5',
  '[&_pre_code]:border-0 [&_pre_code]:p-0',
  '[&_strong]:font-[var(--font-weight-strong)] [&_strong]:text-[color:var(--color-text-primary)]',
  '[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-body-lg [&_h1]:font-[var(--font-weight-strong)] [&_h1]:text-[color:var(--color-text-primary)]',
  '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-body-lg [&_h2]:font-[var(--font-weight-strong)] [&_h2]:text-[color:var(--color-text-primary)]',
  '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-body [&_h3]:font-[var(--font-weight-strong)] [&_h3]:text-[color:var(--color-text-primary)]',
  '[&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline-offset-2',
].join(' ');

/**
 * 앱 안에서 사용자의 코딩 에이전트와 나누는 대화.
 *
 * ## 이 화면이 하는 일 하나
 *
 * **지금 보고 있는 볼트에 대해, 이미 쓰고 있는 에이전트에게 그 자리에서 묻는다.**
 * 그래서 새로 마련할 것이 없다 — 키도, 설정 파일도, 터미널 왕복도.
 *
 * ## 주목 순서
 *
 * 권한 카드 > 대화 > 작성 칸. 권한 카드가 떠 있는 동안 에이전트는 멈춰 있으므로
 * 그것이 이 화면에서 가장 급한 것이다. 그래서 목록 **위**가 아니라 작성 칸
 * **바로 위**에 둔다 — 눈과 손이 이미 가 있는 자리다.
 *
 * ## 생각과 말을 구별한다
 *
 * 에이전트의 「생각」은 답이 아니다. 같은 무게로 그리면 사용자가 중간 과정을
 * 결론으로 읽는다. 그래서 흐리고 작게 둔다 — 숨기지는 않는다(무슨 일이 일어나는지
 * 보이는 것이 기다림을 견디게 한다).
 */
/**
 *  메뉴에 한 번에 보여 줄 개수. 실측으로 47개가 오는데 그걸 다 늘어놓으면
 * 고르는 목록이 아니라 스크롤 벽이 된다. 더 좁히려면 계속 치면 된다.
 */
const SLASH_MENU_LIMIT = 8;

export function AcpChatPanel({
  runtimeId,
  runtimeLabel,
  vaultRoot,
  mcpServers,
  runtimes = [],
  onRuntimeChange,
  prefillRequest,
  suggestions = [],
  knownSlugs,
  onHoverSlug,
  onTurnActiveChange,
  onClose,
}: {
  runtimeId: string;
  runtimeLabel: string;
  vaultRoot: string | null;
  mcpServers?: unknown[];
  /**
   * 지금 고를 수 있는 실행기들 — **관문이 있는 것만** 담겨 온다
   * (`isGuardedRuntime`). 하나뿐이면 고를 것이 없으므로 이름만 그린다.
   */
  runtimes?: ReadonlyArray<{ id: string; label: string }>;
  onRuntimeChange?: (runtimeId: string) => void;
  /**
   * 바깥(지도의 노드·주소)에서 건너온 **문장 하나**. 앉기만 하고 보내지
   * 않는다 — 사용자가 고쳐 보내거나 지울 수 있어야 한다.
   */
  prefillRequest?: { text: string; nonce: number } | null;
  /**
   * 「무엇을 물어보지」에 대한 답 — **이 폴더의 지금 상태**에서 뽑은 것
   * (`useChatSuggestions`). 빈 대화일 때만 그린다: 대화가 시작되면 사용자는
   * 이미 무엇을 물어볼지 아는 상태이고, 그때부터 이 칸은 자리만 먹는다.
   *
   * 볼트를 여기서 직접 읽지 않고 **받는다** — 그러면 이 패널이
   * `LocalVaultProvider` 없이는 못 서게 되고, 그건 이 위젯이 지금까지 지켜
   * 온 성질이 아니다(`vaultRoot` · `runtimes` 도 전부 받아 온다).
   */
  suggestions?: readonly ChatSuggestion[];
  /**
   * 이 볼트에 **실재하는** 노드 이름들. 에이전트의 답에서 이 이름들만 집어
   * 지도와 이어 준다 — 아무 `a/b` 나 링크로 만들면 파일 경로와 URL 까지
   * 링크가 되고, 눌러도 아무 데도 안 가는 링크를 한 번 만난 사람은 나머지도
   * 안 누른다 (`link-slugs.ts`).
   */
  knownSlugs?: ReadonlySet<string>;
  /**
   * 그 이름에 마우스를 올렸다(벗어나면 `null`). 지도가 **마우스로 올렸을 때와
   * 똑같이** 그 노드를 밝힌다. 렌더를 돌리지 않으려고 부르는 쪽이 ref 에
   * 담는다 — 큰 그래프에서 호버마다 렌더하면 끈적해진다.
   */
  onHoverSlug?: (slug: string | null) => void;
  /**
   * 한 차례가 **돌기 시작했다/끝났다**. 볼트에 무엇을 적을지는 화면(뷰)의
   * 일이라(이 패널은 `LocalVaultProvider` 없이도 서야 한다) 여기서는 사실만
   * 알린다. 오늘의 소비처는 「에이전트가 자기 이름을 볼트에 등록」이다 —
   * `views/home/lib/acp-agent-heartbeat.ts`.
   */
  onTurnActiveChange?: (active: boolean) => void;
  onClose?: () => void;
}) {
  const t = useTranslations('acpChat');
  const {
    status,
    events,
    slashCommands,
    error,
    diagnostics,
    pending,
    sessions,
    choices,
    chooseModel,
    chooseMode,
    start,
    send,
    cancel,
    switchSession,
  } = useAcpSession({ runtimeId, vaultRoot, mcpServers });
  /*
   * 차례가 도는 동안만 알린다. 세션이 열려 있는 내내 알리면 화면이 「에이전트
   * 활동 중」을 아무 일도 없을 때 켜게 된다 — 이 패널이 이미 지키는 규율과
   * 같다(*"전송 전에 「읽음」으로 찍으면 화면이 아직 일어나지 않은 일을 말하는
   * 것"*). 패널이 사라질 때도 꺼 준다.
   */
  const turnActive = status === 'thinking';
  useEffect(() => {
    onTurnActiveChange?.(turnActive);
  }, [turnActive, onTurnActiveChange]);
  useEffect(
    () => () => {
      onTurnActiveChange?.(false);
    },
    [onTurnActiveChange],
  );

  /** 어댑터가 준 것을 사람이 읽는 갈래로 옮긴다 — 못 알아보면 `unknown`. */
  const trouble = error ? readAcpTrouble(error) : null;
  const [draft, setDraft] = useState('');
  /*
   * `/` 로 고르는 중인가. 첫 글자가 `/` 이고 아직 공백이 없을 때만이다 —
   * 인자를 치기 시작했으면 고르는 단계가 지났다(`slash-commands.ts`).
   */
  /**
   * 목록을 **손으로 닫았나.** 바깥을 눌러 닫은 뒤에도 작성 칸의 글자는 그대로라,
   * 이 기억이 없으면 다음 렌더에서 곧바로 다시 열린다(2026-08-17 소유자 지적:
   * *"바닥 클릭하면 닫혀야하는데 안닫힘"*). 글자가 바뀌면 다시 여는 것이 맞으므로
   * 그때 이 기억을 지운다.
   */
  const [slashDismissed, setSlashDismissed] = useState(false);
  /** 키보드로 짚고 있는 줄. 목록이 바뀌면 첫 줄로 돌아간다. */
  const [slashActive, setSlashActive] = useState(0);
  const slashMatches = useMemo(() => {
    if (slashDismissed) return [];
    const query = slashQuery(draft);
    return query === null ? [] : matchSlashCommands(slashCommands, query).slice(0, SLASH_MENU_LIMIT);
  }, [draft, slashCommands, slashDismissed]);
  const slashOpen = slashMatches.length > 0;
  /**
   * 바깥을 누르면 닫는다 (2026-08-17 소유자 지적: *"바닥 클릭하면 닫혀야하는데
   * 안닫힘"*).
   *
   * `mousedown` 으로 듣는 이유: `click` 은 눌렀다 뗀 뒤에 오는데, 그 사이에
   * 작성 칸이 초점을 잃으며 화면이 한 번 흔들린다. 목록 자신을 누른 것은
   * 세어 주지 않는다 — 그건 고르는 동작이라 `chooseSlashCommand` 가 닫는다.
   */
  const slashMenuRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!slashOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (slashMenuRef.current?.contains(target ?? null)) return;
      if (inputRef.current?.contains(target ?? null)) return;
      setSlashDismissed(true);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [slashOpen]);

  const chooseSlashCommand = useCallback(
    (name: string) => {
      setDraft(`/${name} `);
      setSlashDismissed(true);
      inputRef.current?.focus();
    },
    [],
  );
  /* 목록이 바뀌면 짚는 자리를 첫 줄로 되돌린다 — 남아 있으면 없는 줄을 짚는다. */
  useEffect(() => {
    setSlashActive(0);
  }, [slashMatches.length]);

  const [historyOpen, setHistoryOpen] = useState(false);
  /** 작성 칸에 손이 가 있나 — 단축키 안내를 그때만 띄운다. */
  const [composerFocused, setComposerFocused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  /**
   * 자람을 재는 **오프스크린 미러**. 보이는 칸의 높이를 `''` 로 되돌려
   * `scrollHeight` 를 읽는 흔한 방법은 매 프레임 상자를 접었다 펴므로 자람이
   * 전이가 아니라 계단이 된다. 미러는 같은 타이포·같은 폭이라 같은 줄 나눔이
   * 나오고, 보이는 상자는 한 번도 되돌려지지 않는다.
   */
  const mirrorRef = useRef<HTMLTextAreaElement | null>(null);
  /** 이 패널 자체 — 작성 칸의 상한을 **이 칸의 높이**에서 구하려고 잰다. */
  const panelRef = useRef<HTMLElement | null>(null);

  /**
   * 바깥에서 건너온 문장을 작성 칸에 **앉힌다.**
   *
   * 효과가 아니라 렌더 중 조정으로 받는다(리액트의 "prop 이 바뀌면 state 를
   * 맞추기" 패턴) — 효과로 받으면 한 프레임은 빈 칸이 그려지고, 그 한 프레임이
   * 정확히 「눌렀는데 늦게 반응한다」로 보인다. 옆 패널이 쓰는 문법과 같다.
   */
  const prefillNonce = prefillRequest?.nonce ?? null;
  const prefillText = prefillRequest?.text ?? null;
  const [seenPrefillNonce, setSeenPrefillNonce] = useState<number | null>(null);
  if (prefillNonce !== null && prefillText && prefillNonce !== seenPrefillNonce) {
    setSeenPrefillNonce(prefillNonce);
    setDraft(prefillText);
  }
  /*
   * 퇴장 애니메이션이 도는 동안에도 그릴 것이 있어야 한다 — `pending` 이
   * null 로 바뀌는 순간 내용이 사라지면 **빈 상자**가 사라지는 애니메이션을
   * 하게 된다. 키는 요청의 파일 경로다(같은 카드인지 가르는 값).
   */
  const pendingHeld = useHeldValue(pending, pending?.request.filePath ?? null);

  useEffect(() => {
    void start();
  }, [start]);

  /*
   * 떠 있는 목록은 **Esc 로 닫힌다.** 실물에서 Esc 를 눌렀는데 목록이 그대로
   * 남아 있었다(2026-08-16 검수) — 이 앱의 다른 표면은 전부 그 키로 닫히므로,
   * 여기만 안 닫히면 사용자가 배운 것이 틀린 것이 된다. 뒤의 막을 누르는 길은
   * 그대로 있고, 이건 손을 안 옮기는 두 번째 길이다.
   */
  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 이 표면이 닫히는 것으로 끝난다 — 뒤의 패널까지 같이 닫지 않는다.
      event.stopPropagation();
      setHistoryOpen(false);
    };
    // 캡처 단계에서 받는다. 위쪽에 있는 「한 단계씩 닫기」가 먼저 잡으면
    // 이 목록 대신 패널이 닫힌다.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [historyOpen]);

  // 새 말이 오면 아래로 따라간다. 사용자가 위로 올려 읽는 중이면 방해하지
  // 않는다 — 바닥 근처일 때만 따라간다.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    if (nearBottom) list.scrollTop = list.scrollHeight;
  }, [events, pending]);

  /**
   * 작성 칸이 **글을 따라 자란다** (2026-08-16 소유자 지시: *"입력하고 나면
   * 이렇게 길어지는 것도 구현해야 함"*).
   *
   * 줄 수가 고정이면 세 줄짜리 부탁을 쓰는 사람은 자기가 쓴 것의 3분의 2를
   * 못 본 채 보내기를 누른다. 산수는 옆 패널이 이미 푼 것을 그대로 쓴다
   * (`shared/lib/composer-growth` — 높이는 **정수 줄**이라 윗변에 글자가 반으로
   * 잘리는 자리가 없다). 자람은 `transform` 이 아니라 실제 높이로 간다 —
   * 아래의 고를 것과 보내기가 같이 밀려나야 「칸이 자랐다」로 읽힌다.
   */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    mirror.value = draft;
    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const growth = composerGrowth(
      {
        lineHeight,
        paddingBlock: Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
        borderBlock:
          Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
        contentHeight: mirror.scrollHeight,
      },
      /*
       * 상한을 **이 패널의 높이에서** 구한다. 기본값 6줄은 좁은 띠를 기준으로
       * 정한 수라 세로로 긴 이 칸에는 인색했다(소유자: *"어느 정도까지는
       * 길어지면 좋겠는데"*). 그렇다고 큰 수를 박으면 창을 줄였을 때 작성 칸이
       * 대화를 통째로 밀어낸다 — 비율이 답이다.
       */
      composerMaxRows(panelRef.current?.clientHeight ?? 0, lineHeight),
    );
    // 잴 수 없는 상태(SSR·jsdom·폰트 로드 전)에서는 손대지 않는다 — 0px 로
    // 접히는 것보다 `rows` 기본값이 언제나 낫다.
    if (!growth) return;
    input.style.height = `${growth.height}px`;
    input.scrollTop = snapScrollTop(input.scrollTop, lineHeight);
  }, [draft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || status === 'thinking') return;
    setDraft('');
    void send(text);
  }, [draft, send, status]);

      {/*
        고를 거리 — **온 것만 그린다.** 실측: codex 는 모델 33개를 내놓고,
        claude 는 모델을 아예 안 내놓는다(`session/set_model` 이 「그런 메서드
        없음」). 그래서 개수를 짐작해 자리를 미리 잡아 두지 않는다: 없는 도구에
        빈 드롭다운을 남겨 두면 그건 「곧 됩니다」와 같은 거짓말이다.

        ⚠️ 모드 목록에는 **권한 확인을 건너뛰는 것들이 빠져 있고**, 아직 재 보지
        않은 것은 「확인 안 됨」으로 표시된다. 이 화면이 「폴더 밖은 먼저
        물어본다」고 약속하는데 그 약속을 드롭다운 한 번으로 무르거나, 모르는 것을
        안전한 것처럼 보이면 약속이 아니다.
      */}
  const choicesRow =
    choices.models.length > 0 || choices.modes.length > 0 ? (
        /*
         * 고를 거리는 **한 줄에 균등하게** 놓는다 (2026-08-16 소유자 실보고:
         * *"제대로 보이지도 않고 위치도 이상하고"*).
         *
         * 종전엔 `flex-wrap` 이라 각자 내용만큼만 넓어졌고, 좁아진 트리거가
         * 목록까지 좁게 만들어 고를 것들이 잘렸다. 격자로 두면 폭이 자리에서
         * 정해지고 개수가 하나든 둘이든 줄이 흔들리지 않는다 — 이 저장소의
         * 「치수는 우리가 정하지 내용물이 정하지 않는다」 규율 그대로다.
         */
        <div
          data-testid="acp-chat-choices"
          className={cn(
            'grid shrink-0 gap-2',
            choices.models.length > 0 && choices.modes.length > 0
              ? 'grid-cols-2'
              : 'grid-cols-1',
          )}
        >
          {choices.models.length > 0 ? (
            <Select
              ariaLabel={t('model')}
              size="md"
              value={choices.currentModelId ?? ''}
              onChange={(value) => void chooseModel(value)}
              options={choices.models.map((model) => ({ value: model.id, label: model.name }))}
              data-testid="acp-chat-model"
              className="min-w-0"
            />
          ) : null}
          {choices.modes.length > 0 ? (
            <Select
              ariaLabel={t('mode')}
              size="md"
              value={choices.currentModeId ?? ''}
              onChange={(value) => void chooseMode(value)}
              options={choices.modes.map((mode) => {
                const unverified = choices.unverifiedModeIds.includes(mode.id);
                /*
                 * 이름과 설명은 **아는 것만** 사람 말로 옮긴다 (2026-08-17 소유자
                 * 지적: 이름이 전부 영어이고, 정작 고를 만한 둘에는 설명이 아예
                 * 없었다). 모르는 모드는 어댑터가 준 이름 그대로 두고 설명을 안
                 * 붙인다 — 지어 붙인 한 줄은 우리가 확인하지 않은 약속이 된다.
                 * 판정과 근거 표: `mode-copy.ts`.
                 *
                 * 「확인 안 됨」은 **다른 축**이다. 이름을 아는 것과 폴더 밖 작업
                 * 전에 묻는지 재 본 것은 별개라, 둘을 함께 보여 준다.
                 */
                const copyKey = modeCopyKey(mode.id);
                const name = copyKey ? t(`modeName.${copyKey}`) : mode.name;
                const hint = copyKey ? t(`modeHint.${copyKey}`) : undefined;
                return {
                  value: mode.id,
                  label: unverified ? t('modeUnverified', { name }) : name,
                  description: unverified
                    ? [hint, t('modeUnverifiedHint')].filter(Boolean).join(' ')
                    : hint,
                };
              })}
              data-testid="acp-chat-mode"
              className="min-w-0"
            />
          ) : null}
        </div>
      ) : null;

  const busy = status === 'thinking';
  const canType = status === 'ready' || status === 'thinking';

  return (
    <section
      ref={panelRef}
      data-testid="acp-chat-panel"
      data-acp-status={status}
      /*
       * ⚠️ `flex-1` 이 없어서 이 화면 전체가 위로 뭉쳐 있었다 (2026-08-16 소유자
       * 실보고: *"입력하는 곳이 왜 위에 붙어 있는지도 이상하고"*).
       *
       * 구조는 처음부터 채팅이었다 — 머리 / 늘어나는 기록 / 바닥의 작성 칸.
       * 그런데 이 `<section>` 이 부모 flex 의 자식인데 자기 몫을 주장하지 않아
       * **내용만큼만** 커졌고, 기록이 비어 있으면 그 높이가 0 이라 작성 칸이
       * 곧바로 머리 밑에 붙었다. 아래 텅 빈 자리는 패널의 남은 높이였다.
       *
       * 채팅에서 작성 칸이 바닥에 있는 것은 취향이 아니라 **손이 가는 자리**이고,
       * 그 위가 비어 있어야 대화가 쌓일 곳이 보인다.
       */
      className="relative flex h-full min-h-0 flex-1 flex-col gap-3"
      aria-label={t('ariaLabel', { runtime: runtimeLabel })}
    >
      <header className="flex items-center justify-between gap-2">
        {/*
          쓸 수 있는 도구가 둘 이상이면 **이름 자리가 곧 고르는 자리**가 된다 —
          이름을 보여 주려고 이미 쓰고 있는 자리이므로 새 크롬이 안 생긴다.
          하나뿐이면 고를 것이 없으니 글자로 둔다(선택지 하나짜리 드롭다운은
          고르는 척만 하는 것이다).
        */}
        {runtimes.length > 1 && onRuntimeChange ? (
          <Select
            ariaLabel={t('runtimePicker')}
            size="md"
            value={runtimeId}
            onChange={onRuntimeChange}
            options={runtimes.map((r) => ({ value: r.id, label: r.label }))}
            data-testid="acp-chat-runtime"
            className="min-w-0"
          />
        ) : (
          <p className="min-w-0 truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
            {runtimeLabel}
          </p>
        )}
        <span className="flex shrink-0 items-center gap-2">
          <span
            data-acp-status-badge={status}
            className={badgeClass({
              shape: 'micro',
              className:
                'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]',
            })}
          >
            {t(`status.${status}`)}
          </span>
          {/*
            지난 대화가 **있을 때만** 문을 낸다 — 처음 쓰는 사람에게 늘 비어
            있는 목록 버튼을 보여 줄 이유가 없다.
          */}
          {/*
            아이콘만 있는 버튼은 **이름이 안 보인다.** `title` 이 붙어 있긴 하나
            macOS 웹뷰의 기본 툴팁은 한참 기다려야 뜨고, 그동안 사용자는 이게
            뭐 하는 버튼인지 모른다(소유자: *"마우스 올리면 툴팁이 떠야 이게
            뭐하는건지 이해 가능할듯"*). 저장소에 이미 있는 툴팁을 쓴다.

            크기도 한 단 올린다 — 이 셋은 이 패널의 주 크롬이라 `md`(32px)로는
            눌러야 할 것으로 안 읽힌다.
          */}
          <TooltipProvider delayDuration={200}>
            {sessions.length > 0 ? (
              <Tooltip content={t('history')} withProvider={false} side="bottom">
                <IconButton
                  size="lg"
                  label={t('history')}
                  data-testid="acp-chat-history"
                  aria-expanded={historyOpen}
                  onClick={() => setHistoryOpen((open) => !open)}
                >
                  <History size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </Tooltip>
            ) : null}
            <Tooltip content={t('newChat')} withProvider={false} side="bottom">
              <IconButton
                size="lg"
                label={t('newChat')}
                data-testid="acp-chat-new"
                disabled={status === 'starting'}
                onClick={() => {
                  setHistoryOpen(false);
                  void switchSession(null);
                }}
              >
                <SquarePen size={ICON_SIZE.md} aria-hidden />
              </IconButton>
            </Tooltip>
            {onClose ? (
              <Tooltip content={t('close')} withProvider={false} side="bottom">
                <IconButton
                  size="lg"
                  label={t('close')}
                  data-testid="acp-chat-close"
                  onClick={onClose}
                >
                  <X size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </Tooltip>
            ) : null}
          </TooltipProvider>
        </span>
      </header>

      <div
        ref={listRef}
        data-testid="acp-chat-transcript"
        /*
         * 기록의 간격은 **한 단계 크다** (2026-08-16 여백 감사).
         * 읽는 글이 12.5 → 14px 로 올라갔는데 줄 사이는 8px 그대로여서, 말과
         * 말이 한 덩어리로 뭉쳤다. 글자가 커지면 그 사이도 같이 커져야 한다 —
         * 간격은 절대값이 아니라 **글자에 대한 비율**로 읽힌다.
         */
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
      >
        {events.length === 0 && status !== 'starting' ? (
          // 빈 대화의 안내는 **기록이 쌓일 그 자리 한가운데**에 둔다. 위쪽에
          // 붙여 두면 그것이 첫 번째 말풍선처럼 읽히고, 정작 대화가 시작될
          // 자리는 비어 보인다.
          <div className="m-auto grid max-w-[34ch] gap-3">
            <p
              data-testid="acp-chat-empty"
              className="break-keep text-center text-label leading-prose text-[color:var(--color-text-quaternary)]"
            >
              {t('emptyHint')}
            </p>
            {/*
              「무엇을 물어보지」에 대한 답은 **이 폴더의 지금 상태**에서 나온다
              (2026-08-17). 예시 문장을 박아 두는 흔한 방식은 추천이 아니라
              장식이다 — 어느 앱에나 붙일 수 있고, 눌러 보면 내 폴더와 상관없는
              답이 나와서 추천을 한 번 더 믿지 않게 된다. 어떤 사실이 있을 때
              무엇을 권하는지는 `chat-suggestions.ts` 가 갖는다.
            */}
            {suggestions.length > 0 ? (
              <div className="grid gap-1.5" data-testid="acp-chat-suggestions">
                <p className="text-center text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {t('suggest.heading')}
                </p>
                {suggestions.map((s) => (
                  /*
                    한 줄 전체가 눌리는 것은 `RowButton` 이다 (2026-08-17,
                    설치된 앱을 열어 보고 고침). 처음에는 `Chip` 에
                    `w-full justify-start text-left` 를 손으로 붙였는데,
                    그건 `row` 모양이 이미 갖고 있는 값을 베낀 것이다 —
                    `design-build` 가 «className 에 모양을 넘기면 프리미티브가
                    있으나 마나가 된다» 고 경고한 바로 그 자리다.

                    화면에서도 티가 났다: 테두리 있는 전폭 상자가 되어서
                    바로 아래 작성 칸과 같은 모양으로 읽혔다 — 누르는 것이
                    아니라 또 하나의 입력칸처럼.
                  */
                  <RowButton
                    key={s.kind}
                    size="md"
                    tone="secondary"
                    hoverInk="strong"
                    hoverSurface="lift"
                    /* 쉴 때도 면을 준다. 테두리를 주면 바로 아래 작성 칸과
                       같은 모양이 되고(실측), 아무것도 안 주면 그냥 글자로
                       읽힌다 — 둘 다 실물에서 확인했다. 목록 행이 쓰는
                       `overlay-1` 을 그대로 쓴다: 새 값 0개. */
                    className="rounded-chip bg-[color:var(--color-overlay-1)] px-2.5 py-1.5"
                    data-testid={`acp-chat-suggestion-${s.kind}`}
                    onClick={() => setDraft(t(`suggest.${s.kind}.prompt`, s.params))}
                  >
                    <span className="min-w-0 break-keep">
                      {t(`suggest.${s.kind}.label`, s.params)}
                    </span>
                  </RowButton>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {/*
          어댑터는 실패를 **메시지로도** 보내고 RPC 도 거절한다. 그대로 두면
          같은 실패가 두 번 보이고, 영문 원문이 아래 평문 카드보다 **먼저**
          읽힌다(2026-08-17 설치된 앱 실측). 지우는 조건은 `error-echo.ts` 가
          갖고, 그 조건은 「이미 떠 있는 오류 원문 안에 통째로 든 마지막 한 줄」
          뿐이다 — 에이전트의 말을 화면이 지우는 일이니 넓히지 않는다.
        */}
        {groupEvents(withoutErrorEcho(events, error)).map((item, index) => {
          if (item.kind === 'toolGroup')
            return (
              <ToolGroup
                key={item.id}
                events={item.events}
                knownSlugs={knownSlugs}
                onHoverSlug={onHoverSlug}
              />
            );
          /*
           * 사용자의 말 앞에 실선 하나 — **차례가 바뀐 자리**다. 첫 차례
           * 위에는 긋지 않는다(위에 아무것도 없는데 경계를 그으면 그건 경계가
           * 아니라 장식이다).
           */
          const turnStart = item.event.kind === 'user' && index > 0;
          return (
            <div
              key={item.event.id}
              data-turn-start={turnStart ? 'true' : undefined}
              className={cn(
                'flex flex-col',
                turnStart &&
                  'mt-2 border-t border-[color:var(--color-divider)] pt-3',
              )}
            >
              <TranscriptEntry
                event={item.event}
                knownSlugs={knownSlugs}
                onHoverSlug={onHoverSlug}
              />
            </div>
          );
        })}
      </div>

      {/*
        오류는 **사람의 말 한 문장 + 다음에 할 일**이다.

        ⚠️ 종전에는 어댑터가 준 것을 그대로 붙였다(2026-08-16 소유자 화면):
        `문제가 생겼어요: {"code":-32603,"message":"Internal error: Failed to
        authenticate: OAuth session expired…"}`. 소유자: *"이렇게 보여주면
        사용자가 어떻게 알겠어."* 그 줄에는 무슨 일이 났는지도, 뭘 해야 하는지도
        사람의 말로는 없다.

        원문은 버리지 않고 **접어 둔다** — 같은 일이 반복될 때 알려 줄 것이
        필요하고, 어댑터가 남긴 말(stderr)도 그때 같이 나온다.
      */}
      {error ? (
        <div
          data-testid="acp-chat-error"
          data-trouble={trouble?.kind}
          role="alert"
          className="break-keep rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] p-[var(--card-pad)]"
        >
          <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-status-danger)]">
            {t(`trouble.${trouble?.kind ?? 'unknown'}.title`)}
          </p>
          <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {t(`trouble.${trouble?.kind ?? 'unknown'}.hint`)}
          </p>
          <details className="mt-2">
            <summary
              data-testid="acp-chat-error-details"
              className={controlClass({
                shape: 'link',
                size: 'sm',
                tone: 'muted',
                hoverInk: 'strong',
                className: 'list-none',
              })}
            >
              {t('trouble.details')}
            </summary>
            {/*
              로그인이 낡은 갈래에는 **고치는 한 줄**을 먼저 준다. 종전 안내
              (「터미널에서 다시 로그인하세요」)는 이 경우 막다른 길이었다 —
              앱은 Claude 를 전용 설정 폴더로 띄우고, 로그인은 그 폴더마다
              따로이기 때문이다. 근거와 실측: `claude-login-repair.ts`.
            */}
            {trouble?.kind === 'auth' ? (
              <p
                data-testid="acp-chat-auth-repair"
                className="mt-1.5 whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] px-2 py-1.5 font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]"
              >
                {claudeLoginRepairCommand()}
              </p>
            ) : null}
            <p className="mt-1.5 whitespace-pre-wrap break-all font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
              {error}
            </p>
            {diagnostics.length > 0 ? (
              <>
                <p className="mt-2 text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {t('trouble.diagnosticsLabel')}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-all font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
                  {diagnostics.join('\n')}
                </p>
              </>
            ) : null}
          </details>
        </div>
      ) : null}

      {/*
        `{pending ? … : null}` 로만 그리면 카드가 한 프레임에 툭 나타나고 툭
        사라진다(등장 래칫이 이걸 잡았다). 이 카드는 **에이전트를 멈춰 세우는
        것**이라 화면에서 가장 급한 표면인데, 예고 없이 나타나면 사용자는
        무엇이 바뀌었는지 못 따라간다.

        `origin` 이 아래인 이유: 이 카드는 작성 칸 바로 위에서 자란다 — 눈과
        손이 이미 가 있는 자리에서 태어나야 한다.
      */}
      <Surface open={Boolean(pending)} origin="bottom center" motion="overlay">
        {pendingHeld ? <AcpPermissionCard pending={pendingHeld} /> : null}
      </Surface>

      {/*
        작성 칸 — **상자 하나 안에 다 들어간다** (2026-08-16 소유자 실보고:
        *"디자인도 이게 더 일반적인가? 대부분 이런 형태 아닌가"*).

        종전엔 입력 상자가 있고 그 **밖에** 넓은 「보내기」 알약이 따로 있었다.
        그러면 보내기가 대화 화면의 주인공처럼 크게 자리를 먹는데, 정작 주인공은
        대화다. 지금 형태는 상자 하나가 「여기가 쓰는 자리」를 말하고, 그 안
        아래줄에 **고를 것(왼쪽)과 보내기(오른쪽)** 가 앉는다.

        보내기는 **원형 아이콘**이다. 글자 「보내기」를 지운 이유는 화살표가 이미
        그 뜻이고, 상자 안에서 폭을 덜 먹기 때문이다. 이름은 툴팁과 접근성
        이름이 진다 — 아이콘만 있는 컨트롤의 규칙 그대로다.

        상자 안에 상자를 만들지 않으려고 작성 칸은 `frame="bare"` 다.
      */}
      <div
        data-testid="acp-chat-composer"
        className="relative shrink-0 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] transition-colors focus-within:border-[color:var(--color-indigo-a46)]"
      >
        {/*
          단축키 안내는 **비어 있을 때만** — 글자가 들어오면 사라진다(겹침 방지).
        */}
        {composerFocused && draft.length === 0 ? (
          <span
            data-testid="acp-chat-hint"
            className={badgeClass({
              shape: 'micro',
              className:
                'pointer-events-none absolute right-3 top-3 bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
            })}
          >
            {t('composerHint')}
          </span>
        ) : null}
        {/*
          미러가 실제 칸과 **같은 폭**이어야 줄 나눔이 같다. 그래서 둘을 같은
          `relative` 상자에 넣는다 — 바깥 상자에 붙이면 안쪽 여백만큼 미러가
          넓어져서 한 줄 늦게 자란다.
        */}
        {/*
          `/` 를 치면 **에이전트가 이 폴더에서 찾은 명령들**을 보여 준다
          (2026-08-17 소유자 문의). 어댑터는 이미 세션 중에 목록을 보내고
          있었는데(`available_commands_update`) 우리가 그 줄을 통째로 버리고
          있었다 — 실측 47개.

          목록을 지어내지 않는다: 아무것도 안 오면 `/` 를 쳐도 아무 일도 안
          일어난다. 볼트 폴더가 곧 작업 폴더라, 볼트에 스킬을 두면 그대로
          여기 뜬다 — 「아틀라스 전용」은 그 길로 온다.
        */}
        {slashOpen ? (
          <ul
            ref={slashMenuRef}
            data-testid="acp-chat-slash-menu"
            role="listbox"
            aria-label={t('composerLabel')}
            className="max-h-56 shrink-0 overflow-y-auto rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-1"
          >
            {slashMatches.map((command: AcpSlashCommand, index: number) => {
              const active = index === slashActive;
              return (
                <li key={command.name} role="option" aria-selected={active}>
                  {/*
                    ⚠️ 호버 축은 **옵트인**이다 (`design-build`). 안 켜면 마우스를
                    올려도 아무 일이 없어서 어느 줄인지 구별이 안 된다 — 소유자가
                    정확히 그것을 지적했다(2026-08-17). 키보드로 짚은 줄
                    (`active`)과 마우스가 올라간 줄이 **같은 표시**를 쓰도록
                    `active` 축을 함께 준다.
                  */}
                  <RowButton
                    active={active}
                    hoverSurface="lift"
                    hoverInk="strong"
                    onMouseEnter={() => setSlashActive(index)}
                    onClick={() => chooseSlashCommand(command.name)}
                    className="w-full gap-2"
                  >
                    <span className="shrink-0 font-mono text-label">/{command.name}</span>
                    {command.description ? (
                      <span className="min-w-0 flex-1 truncate text-left text-label text-[color:var(--color-text-quaternary)]">
                        {command.description}
                      </span>
                    ) : null}
                  </RowButton>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="relative">
          <Textarea
            ref={inputRef}
            aria-label={t('composerLabel')}
            placeholder={t('composerPlaceholder')}
            frame="bare"
            className="w-full"
            rows={COMPOSER_MIN_ROWS}
            value={draft}
            disabled={!canType}
            style={{
              // 자람은 **표면 이동**이다 — 앱 공통 램프를 그대로 탄다.
              transitionProperty: 'height',
              transitionDuration: 'var(--motion-base)',
              transitionTimingFunction: 'var(--motion-ease)',
            }}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            onChange={(e) => {
              setDraft(e.target.value);
              // 다시 치기 시작하면 손으로 닫은 기억을 지운다 — 안 그러면 이
              // 세션 내내 목록이 안 열린다.
              setSlashDismissed(false);
            }}
            onKeyDown={(e) => {
              /*
               * 목록이 열려 있으면 **목록이 키를 먼저 갖는다** (2026-08-17
               * 소유자 지적: *"키보드로 이동이 안된다"*). 목록이 없을 때의
               * Enter 동작(보내기)은 아래 그대로다.
               */
              if (slashOpen) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const step = e.key === 'ArrowDown' ? 1 : -1;
                  setSlashActive(
                    (prev) => (prev + step + slashMatches.length) % slashMatches.length,
                  );
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  chooseSlashCommand(slashMatches[slashActive]?.name ?? slashMatches[0].name);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSlashDismissed(true);
                  return;
                }
              }
              if (e.key !== 'Enter') return;
              /*
               * Enter 로 보내고 ⇧Enter 로 줄을 바꾼다 — 채팅의 관례이고, 사람이
               * 이미 손에 익힌 것이다. ⌘/Ctrl+Enter 도 계속 받는다.
               */
              if (e.shiftKey) return;
              e.preventDefault();
              submit();
            }}
          />
          {/*
            `invisible`(visibility: hidden)이지 `opacity-0` 이 아니다 — 투명한
            원소는 여전히 그려지는 원소라 겹침 감사에 잡히고 캐럿이 칠해질
            여지도 남는다. 레이아웃은 그대로 도니 `scrollHeight` 는 같다.
          */}
          <Textarea
            ref={mirrorRef}
            aria-hidden
            tabIndex={-1}
            readOnly
            aria-label={t('composerLabel')}
            frame="bare"
            rows={1}
            data-testid="acp-chat-composer-mirror"
            className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2">{choicesRow}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {busy ? (
              <Chip size="md" tone="secondary" data-testid="acp-chat-stop" onClick={cancel}>
                <Square size={ICON_SIZE.sm} aria-hidden />
                {t('stop')}
              </Chip>
            ) : null}
            <Tooltip content={t('send')} side="top">
              <button
                type="button"
                aria-label={t('send')}
                data-testid="acp-chat-send"
                disabled={!canType || busy || draft.trim().length === 0}
                onClick={submit}
                className={controlClass({
                  /*
                   * 원형은 값 층의 `pill` 이 낸다(`rounded-full`) — 손으로 적지
                   * 않는다. 채움·잉크·호버는 `onAccent` 한 톤이 다 낸다:
                   * 채운 인디고 위에 `accent` 잉크를 얹으면 합성 대비가
                   * AA 미달이고, 그 짝은 lint 가 막는다(실제로 막혔다).
                   * 여기 남는 것은 **이 자리에서만 맞는 것** — 정사각으로
                   * 만들어 원이 되게 하는 폭과 가운데 정렬뿐이다.
                   */
                  shape: 'pill',
                  size: 'md',
                  tone: 'onAccent',
                  className: 'w-8 justify-center px-0',
                })}
              >
                <ArrowUp size={ICON_SIZE.md} aria-hidden />
              </button>
            </Tooltip>
          </span>
        </div>
      </div>

      {/*
        지난 대화 목록 — **떠 있는 것**이다.

        ⚠️ **z-index 를 쓰지 않는다.** 처음엔 `--z-map-popover` 를 썼는데 그런
        토큰은 **없다** — 없는 변수를 참조하면 CSS 가 그 선언을 통째로 버려서
        아무 에러 없이 층위가 사라진다(이 저장소가 「아무도 안 쓰는 토큰은
        규격이 아니라 틀린 정보다」라고 적어 둔 그 함정이다).
        대신 이 블록을 패널의 **맨 끝**에 둔다 — 같은 층에서는 나중에 그린 것이
        위에 온다. 새 토큰도, 사다리 변경도 필요 없다.

        ⚠️ 종전에는 이것을 flex 자식으로 뒀다. 그래서 열면 대화가 아래로
        **밀려났고**, 목록이 대화의 일부처럼 보였다(소유자: *"이렇게 같이 나와서
        구분도 안 되고"*). 떠 있어야 할 것을 흐름에 두면 그건 팝오버가 아니라
        그냥 또 하나의 줄이다.

        그래서 패널 기준으로 **절대 위치**에 놓고, 뒤에 막을 깔아 「이건 위에
        떠 있고 아무 데나 누르면 닫힌다」를 눈으로 말한다.

        ⚠️ 여기 담기는 것은 **이 폴더의 대화뿐**이다(`keepSessionsInFolder`).
      */}
      {historyOpen && sessions.length > 0 ? (
        <button
          type="button"
          /*
           * ⚠️ 이 막의 이름은 **목록을 닫는 것**이다 (2026-08-16 검수에서 적발).
           * 종전에는 패널 닫기와 같은 키(`close`)를 써서, 화면을 못 보는
           * 사용자에게 「대화를 끝냅니다」라고 말하고 목록만 닫았다.
           */
          aria-label={t('closeHistory')}
          data-testid="acp-chat-history-scrim"
          onClick={() => setHistoryOpen(false)}
          className="absolute inset-0 cursor-default bg-[color:var(--color-overlay-1)]"
        />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-11 flex justify-end">
        <Surface
          open={historyOpen && sessions.length > 0}
          origin="top right"
          motion="overlay"
          className="pointer-events-auto w-[min(320px,100%)]"
        >
          <div className="overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]">
            {/*
              이름이 있어야 무엇의 목록인지 알 수 있다.

              ⚠️ 종전에는 대문자 아이브로우 규격(`font-mono` + `uppercase` +
              넓은 자간)이었다. 그 규격은 라틴 문자를 전제한다 — 한글에는
              대문자가 없어서 `uppercase` 는 아무 일도 안 하고, 넓은 자간만
              남아 **「지난」과 「대화」가 다른 두 낱말처럼** 벌어져 보였다
              (2026-08-16 소유자 화면). 그냥 라벨로 둔다.

              개수를 옆에 두는 이유: 목록이 스크롤되면 몇 개인지가 안 보인다.
            */}
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
              <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
                {t('history')}
              </p>
              <span
                className={badgeClass({
                  shape: 'micro',
                  className:
                    'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-quaternary)]',
                })}
              >
                {sessions.length}
              </span>
            </div>
            <ul data-testid="acp-chat-history-list" className="grid max-h-64 gap-0.5 overflow-y-auto p-1">
              {sessions.map((session) => (
                <li key={session.sessionId}>
                  <RowButton
                    data-testid="acp-chat-history-item"
                    data-session-id={session.sessionId}
                    onClick={() => {
                      setHistoryOpen(false);
                      void switchSession(session.sessionId);
                    }}
                    /*
                     * 마우스가 지나가는 줄이 **반응해야** 어디를 누르는지 알 수
                     * 있다(소유자: *"마우스 올리면 각 영역에 호버 효과 있으면"*).
                     * 면과 글자를 함께 올린다 — 면만 밝히면 어느 줄인지는 알아도
                     * 그 줄의 제목이 여전히 뒤로 물러나 있다.
                     */
                    hoverSurface="lift"
                    hoverInk="strong"
                    className="w-full"
                  >
                    <span className="grid min-w-0 flex-1 gap-0.5 text-left">
                      <span className="truncate text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
                        {session.title ?? t('untitled')}
                      </span>
                      {/*
                        언제 한 대화인지는 **이미 받아 온 값**이다. 안 보여 주면
                        제목만 비슷한 대화들 사이에서 고를 근거가 없다.
                      */}
                      {/*
                        ⚠️ 종전에는 날짜가 **있을 때만** 이 줄을 그렸다. 그러면
                        같은 목록 안에서 행 높이가 56px 과 38px 로 갈린다 — 이
                        저장소의 「치수는 우리가 정하지 내용물이 정하지 않는다」
                        규율이 정확히 그것을 금지한다(2026-08-16 검수).
                        날짜가 없어도 그 줄은 자리를 지킨다.
                      */}
                      <span className="truncate text-label leading-label text-[color:var(--color-text-quaternary)]">
                        {session.updatedAt ? formatDate(session.updatedAt) : '\u00A0'}
                      </span>
                    </span>
                  </RowButton>
                </li>
              ))}
            </ul>
          </div>
        </Surface>
      </div>
    </section>
  );
}

/**
 * 답이 온 뒤의 도구 줄 묶음 — **접어 두고, 눌러서 편다.**
 *
 * 기다리는 동안에는 펼쳐져 있었다(`groupEvents` 가 마지막 덩어리는 안 묶는다).
 * 답이 오면 그때부터는 답이 주인공이라 자리를 내준다. 숨기는 것이 아니라
 * **한 줄로 접는 것**이라, 무슨 일이 있었는지는 언제든 볼 수 있다.
 */
function ToolGroup({
  events,
  knownSlugs,
  onHoverSlug,
}: {
  events: Extract<AcpEvent, { kind: 'tool' }>[];
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
}) {
  const t = useTranslations('acpChat');
  const [open, setOpen] = useState(false);
  return (
    <div data-acp-entry="tool-group" data-tool-count={events.length}>
      <button
        type="button"
        data-testid="acp-chat-tool-group"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={controlClass({
          shape: 'link',
          size: 'md',
          tone: 'muted',
          hoverInk: 'secondary',
        })}
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className={open ? 'rotate-90 transition-transform' : 'transition-transform'}
        />
        {t('toolGroup', { count: events.length })}
      </button>
      {open ? (
        <div className="mt-1 grid gap-1 pl-4">
          {events.map((event) => (
            <TranscriptEntry
              key={event.id}
              event={event}
              knownSlugs={knownSlugs}
              onHoverSlug={onHoverSlug}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 에이전트의 답에서 **실재하는 노드 이름**에 표시를 달고, 마우스를 올리면
 * 지도가 그 노드를 밝히게 한다 (2026-08-17 소유자 지시).
 *
 * ## 마크다운의 **출력**에 단다 (2026-08-17 실측)
 *
 * 처음에는 `<SlugMarks><ReactMarkdown>{text}</ReactMarkdown></SlugMarks>` 로
 * 감쌌다. 그러면 워커가 `ReactMarkdown` 의 children — 즉 **아직 파싱 안 된
 * 마크다운 원문 문자열** — 을 조각내서 넘기고, 그 컴포넌트는 문자열이 아닌
 * children 을 받아 죽는다. 화면에는 대화 기록이 통째로 사라졌다.
 *
 * 그래서 `components` 로 붙인다: 글자를 담는 원소들이 **이미 파싱된** children
 * 을 받은 뒤 거기서 이름을 집는다. 마크다운 문법은 건드리지 않는다.
 *
 * 모양은 **점선 밑줄 하나**다. 새 색을 들이지 않는 이유는 이 지도에 이미 배울
 * 색이 충분해서고(인디고=선택 · 앰버=중심), 점선인 이유는 「누르는 링크」가
 * 아니라 「지도에 있는 것」이라는 다른 뜻이기 때문이다.
 */
function markChildren(
  children: ReactNode,
  known: ReadonlySet<string>,
  onHoverSlug: ((slug: string | null) => void) | undefined,
  key: string,
): ReactNode {
  if (typeof children === 'string') {
    const segments = linkSlugs(children, known);
    if (!segments.some((seg) => 'slug' in seg)) return children;
    return segments.map((seg, i) =>
      'slug' in seg ? (
        <span
          key={`${key}-${i}`}
          data-testid="acp-chat-slug"
          data-slug={seg.slug}
          className="cursor-default underline decoration-dotted decoration-[color:var(--color-border-strong)] underline-offset-2 hover:decoration-[color:var(--color-indigo-a46)]"
          onPointerEnter={() => onHoverSlug?.(seg.slug)}
          onPointerLeave={() => onHoverSlug?.(null)}
        >
          {seg.text}
        </span>
      ) : (
        seg.text
      ),
    );
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => markChildren(child, known, onHoverSlug, `${key}-${i}`));
  }
  return children;
}

/** 글자를 담는 마크다운 원소들 — 이 안에서만 이름을 집는다. */
const SLUG_MARKED_TAGS = ['p', 'li', 'td', 'th', 'code', 'strong', 'em'] as const;

function slugMarkComponents(
  known: ReadonlySet<string> | undefined,
  onHoverSlug: ((slug: string | null) => void) | undefined,
): Record<string, (props: { children?: ReactNode }) => ReactNode> | undefined {
  if (!known || known.size === 0) return undefined;
  const out: Record<string, (props: { children?: ReactNode }) => ReactNode> = {};
  for (const tag of SLUG_MARKED_TAGS) {
    out[tag] = ({ children, ...rest }) =>
      createElement(tag, rest, markChildren(children, known, onHoverSlug, tag));
  }
  return out;
}

function TranscriptEntry({
  event,
  knownSlugs,
  onHoverSlug,
}: {
  event: AcpEvent;
  knownSlugs?: ReadonlySet<string>;
  onHoverSlug?: (slug: string | null) => void;
}) {
  const t = useTranslations('acpChat');

  if (event.kind === 'user') {
    /*
     * **한 차례가 여기서 시작한다** (2026-08-16 소유자: *"내가 한 질문과
     * 답변도 구분 잘 되어야하고"*).
     *
     * 종전에도 오른쪽 정렬 + 인디고 틴트로 갈라 두긴 했다. 그런데 답변이 길면
     * 스크롤 중에 「어디서부터 이 질문의 답인지」가 흐려진다 — 갈라야 하는
     * 것은 말풍선 하나가 아니라 **차례의 경계**다.
     *
     * 그래서 셋을 준다: 위쪽 여백(다음 차례와 떨어뜨린다) · 테두리(면이 아니라
     * 물체로 보이게) · 첫 차례가 아니면 그 위에 실선 하나. 색을 더 진하게
     * 하지 않은 이유는 인디고가 이 앱에서 「선택됨」을 뜻하기 때문이다.
     */
    return (
      <p
        data-acp-entry="user"
        className="mt-1 max-w-[85%] self-end break-keep rounded-card border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a12)] px-3 py-2 text-body-lg leading-body-lg text-[color:var(--color-text-primary)]"
      >
        {event.text}
      </p>
    );
  }
  if (event.kind === 'agent') {
    /*
     * 에이전트는 **마크다운으로 답한다** — 실물에서 백틱과 목록이 글자 그대로
     * 나오고 있었다(`` `connect_project_source` `` 가 백틱째로). 이 저장소에는
     * 이미 렌더러가 있는데(문서함·프로젝트 상세) 이 화면만 안 쓰고 있었다.
     *
     * 문서 화면의 그 값을 그대로 가져오지 않는다 — 거기는 본문 페이지라
     * `text-body-lg` 에 제목 여백이 크고, 420px 패널에서는 한 문단이 화면을
     * 다 먹는다. 여기는 **대화 밀도**다.
     */
    return (
      <div data-acp-entry="agent" className={CHAT_MARKDOWN}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={slugMarkComponents(knownSlugs, onHoverSlug)}
        >
          {event.text}
        </ReactMarkdown>
      </div>
    );
  }
  if (event.kind === 'thought') {
    return (
      <p
        data-acp-entry="thought"
        className="whitespace-pre-wrap break-keep text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {event.text}
      </p>
    );
  }
  if (event.kind === 'tool') {
    /*
     * 함수 이름이 아니라 **일어난 일**을 적는다. 우리가 꽂아 준 도구는 뜻을
     * 알고(`toolLabel`), 남의 도구는 이름만 보여 준다 — 모르는 것을 그럴듯하게
     * 지어내면 실제로 한 일과 어긋나는 날 화면이 거짓말을 한다.
     */
    const label = toolLabel(event.title, VAULT_MCP_SERVER_NAME);
    const done = event.status === 'completed';
    const toolTargets = knownSlugs ? readToolTargets(event.rawInput, knownSlugs) : [];
    return (
      <p
        data-acp-entry="tool"
        data-tool-kind={event.toolKind}
        data-tool-status={event.status}
        data-tool-label={label.kind}
        className="flex items-center gap-1.5 break-all text-label leading-label text-[color:var(--color-text-quaternary)]"
      >
        {/* 끝난 것과 도는 것을 **점 하나**로 가른다 — 배지를 또 달면 대화보다
            도구 줄이 더 시끄러워진다. */}
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            done
              ? 'bg-[color:var(--color-text-quaternary)]'
              : 'bg-[color:var(--color-indigo-accent)]',
          )}
        />
        {label.kind === 'known' ? t(`tool.${label.text}`) : label.text}
        {/*
          **어느 노드를 만졌나** (2026-08-17). 이 줄이 「개념을 읽었어요」라고만
          하고 대상을 안 말하면, 나중에 기록을 읽어도 무슨 일이 있었는지 알 수
          없고 지도와 이을 것도 없다. 값은 `rawInput` 으로 오고 있었다.

          같은 점선 밑줄을 쓴다 — 답변 속 이름과 같은 뜻(지도에 있는 것)이라
          다른 모양을 줄 이유가 없다.
        */}
        {toolTargets.length > 0 ? (
          <span className="min-w-0 truncate text-[color:var(--color-text-tertiary)]">
            {toolTargets.map((slug, i) => (
              <span key={slug}>
                {i === 0 ? ' · ' : ', '}
                <span
                  data-testid="acp-chat-slug"
                  data-slug={slug}
                  className="cursor-default underline decoration-dotted decoration-[color:var(--color-border-strong)] underline-offset-2 hover:decoration-[color:var(--color-indigo-a46)]"
                  onPointerEnter={() => onHoverSlug?.(slug)}
                  onPointerLeave={() => onHoverSlug?.(null)}
                >
                  {slug}
                </span>
              </span>
            ))}
          </span>
        ) : null}
      </p>
    );
  }
  /*
   * 알림 줄에 남는 것은 **사용자에게 하는 말 하나**뿐이다 (2026-08-16 검수).
   *
   * 종전에는 여기로 진단이 다 흘러들어서 대화 한가운데에 이런 것이 대문자
   * 고정폭으로 찍혔다: `UNPARSABLE:{"JSONRPC":"2.0","ID":7,…` · `SEND-FAILED: …`.
   * 사람이 읽을 것이 아니고 읽어도 할 일이 없다 — 그것들은 이제 오류 블록의
   * 「자세히」로 간다.
   *
   * 남은 하나(`gate-off`)는 진단이 아니라 **약속에 관한 사실**이다: 이 대화에서는
   * 폴더 밖을 건드릴 때 대신 물어봐 주지 못한다. 조용히 접어 두면 화면이 지키지
   * 못할 약속을 계속 하게 된다.
   */
  return (
    <p
      data-acp-entry="notice"
      data-notice={event.text}
      className="break-keep rounded-chip border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a08)] px-2.5 py-1.5 text-label leading-prose text-[color:var(--color-text-secondary)]"
    >
      {t(event.text === 'died-mid-turn' ? 'notice.diedMidTurn' : 'notice.gateOff')}
    </p>
  );
}
