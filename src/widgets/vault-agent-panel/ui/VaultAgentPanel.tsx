'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { VaultManifest } from '@/entities/docs-vault';
import type { KnowledgeProjectInsight } from '@/entities/knowledge-graph';
import {
  buildFirstWords,
  COMPOSER_MIN_ROWS,
  composerGrowth,
  composerTopIsHidden,
  snapScrollTop,
  type ScreenContextSnapshot,
} from '@/features/vault-agent';
import { useVaultConceptFacts } from '@/features/vault-ontology';
import {
  hostOfBaseUrl,
  isLocalEndpointReady,
  readLocalEndpoint,
  subscribeLocalEndpointChange,
  type LocalEndpointSettings,
} from '@/shared/lib/local-endpoint';
import { useHeldValue } from '@/shared/lib/use-presence';
import { Surface } from '@/shared/ui';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import { LLM_AUDIT_LOG_RELATIVE_PATH } from '@/shared/lib/llm-audit-log';
import { requestSettingsView } from '@/shared/lib/settings-view-intent';
import { gitHistory, isGitBridgeAvailable } from '@/shared/lib/tauri-git';
import { isLlmChatBridgeAvailable } from '@/shared/lib/tauri-llm';
import {
  SECRET_PROVIDER_HOSTS,
  LOCAL_PROVIDER,
  SECRET_PROVIDERS,
  secretStatus,
  subscribeSecretChange,
  type ConnectionProvider,
} from '@/shared/lib/tauri-secrets';

import { useVaultAgent } from '../model/use-vault-agent';
import { AgentFirstWords } from './AgentFirstWords';
import { AgentHandoffPacket } from './AgentHandoffCard';
import { AgentLockedComposer, AgentLockedState } from './AgentLockedState';
import { AgentProposalCard } from './AgentProposalCard';
import { AgentPromptText } from './AgentPromptDisclosure';
import { AgentScopeSheet } from './AgentScopeSheet';
import { AgentTranscript } from './AgentTranscript';
import { josa } from '@/shared/lib/ko-josa';

/**
 * 에이전트 패널 — 지도 오른쪽에 자리를 내주는 세로 도크.
 *
 * ## 리플로우가 왜 이렇게 되어 있나
 *
 * 패널은 `<main>` 의 flex row 안에서 **폭만** 애니메이션한다. 폭 애니메이션
 * 하나가 두 컬럼(지도 flex-1 · 패널 고정폭)을 같은 프레임에 함께 움직이므로,
 * 지도 축소와 패널 진입이 **같은 시작·같은 곡선**이 된다 — 따로 맞춘 두
 * 애니메이션이 아니라 물리적으로 하나다. 그래야 "지도를 뺏겼다" 가 아니라
 * "자리를 내줬다" 로 읽힌다.
 *
 * ## 닫힘 = 중단
 *
 * 패널을 닫으면 진행 중 호출도 같은 경로로 끊긴다. 백그라운드 계속은 없다.
 */
export function VaultAgentPanel({
  open,
  onClose,
  vaultPath,
  insight,
  manifest,
  screenContext,
  vaultIsGit,
  canWrite,
  onFocusNode,
  onOpenFolder,
  downloadHref,
  prefillRequest,
}: {
  open: boolean;
  onClose: () => void;
  vaultPath: string | null;
  insight: KnowledgeProjectInsight | null;
  manifest: VaultManifest | null;
  screenContext: ScreenContextSnapshot;
  vaultIsGit: boolean;
  canWrite: boolean;
  onFocusNode: (slug: string) => void;
  /** 폴더가 없을 때 이 패널이 직접 열 수 있는 경로 — 없으면 그 상태에 문이 없다. */
  onOpenFolder?: () => void;
  downloadHref: string;
  /**
   * 바깥에서 건너온 첫 마디(S7) — 큐 행이나 노드 상세에서 「에이전트에게 말로
   * 시키기」를 누르면 그 행의 문맥이 실린 문장이 여기로 온다. **프리필이지
   * 전송이 아니다.** `nonce` 는 같은 문장을 다시 보내도 다시 앉게 하는 값이다.
   */
  prefillRequest?: { text: string; nonce: number } | null;
}) {
  const t = useTranslations('vaultAgentPanel');
  const locale = useLocale();
  const [draft, setDraft] = useState('');
  const [scopeAccepted, setScopeAccepted] = useState(false);
  /**
   * 입력칸 아래 곁가지 두 개 — 「지침 보기」와 「터미널에서 이어가기」. **한
   * 번에 하나만** 열린다.
   *
   * 왜 하나인가: 둘 다 테두리 있는 띠로 상주하던 구 배치는 패널 바닥에 네 개의
   * 띠(지침 · 입력칸 · 경계 문장 · 인계 카드)를 쌓았고, 그중 주인공(입력칸)이
   * 두 번째 줄에 있었다. 곁가지는 **떠날 때·의심될 때**만 필요한 것들이라
   * 상주할 이유가 없다 — 여닫는 자리를 한 줄로 접고, 열리는 영역도 하나로
   * 제한한다(겹쳐 열리는 임시 표면 0).
   */
  const [meta, setMeta] = useState<'prompt' | 'handoff' | null>(null);
  /**
   * 곁가지가 **접히는 길**을 갖는다. 여는 것은 사용자가 누른 일이고, 닫는 것도
   * 같은 사건인데 종전에는 `{meta ? … : null}` 이라 열림은 리플로우로 자라고
   * 닫힘만 1프레임에 사라졌다 — 같은 입력의 두 방향이 다른 문법이면 결함이다.
   *
   * `meta` 는 원시값이라 `useHeldValue` 에 키를 따로 줄 필요가 없다(객체였다면
   * 필수다 — 키 없는 객체는 렌더마다 정체성이 바뀌어 React #301 을 낸다).
   */
  const heldMeta = useHeldValue(meta);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * 자람을 재는 **오프스크린 미러**. 보이는 입력칸의 높이를 `''` 로 되돌려
   * `scrollHeight` 를 읽는 흔한 패턴은 매 프레임 상자를 0 으로 접었다 펴므로
   * 자람이 전이가 아니라 계단이 된다. 미러는 같은 타이포·같은 폭이라 같은
   * 값을 주고, 보이는 상자는 한 번도 되돌려지지 않는다.
   */
  const mirrorRef = useRef<HTMLTextAreaElement>(null);
  /** 상한(6줄)에 닿아 **실제로 위가 가려졌는가** — 그때만 상단 페이드. */
  const [composerHidesTop, setComposerHidesTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bridgeAvailable = isLlmChatBridgeAvailable();
  /** 첫 마디가 지목할 빈칸의 근거 — 「할 일」 큐가 읽는 것과 같은 사실 map. */
  const conceptFacts = useVaultConceptFacts();
  /**
   * 어느 벤더의 키가 이 컴퓨터에 있는지. 등록 순서(= `secrets.rs` 허용목록
   * 순서)로 첫 번째를 쓴다 — 모델 피커도 벤더 피커도 만들지 않는다.
   * 전체 키는 어떤 경로로도 오지 않으므로 여기서 아는 것은 "있다" 뿐이다.
   */
  const [provider, setProvider] = useState<ConnectionProvider | null>(null);
  /**
   * 「주소로 연결」 갈래의 설정 — 주소와 고른 모델. 키체인이 아니라
   * localStorage 에 살고(비밀이 아니다), 설정 시트에서 바뀌면 신호가 온다.
   */
  const [localEndpoint, setLocalEndpoint] = useState<LocalEndpointSettings | null>(null);
  /**
   * 키를 넣고 **돌아오는 길**. 설정 시트에서 키가 저장되면 그 순간 신호가 오고
   * 여기서 다시 조회한다 — 새로고침을 요구하지 않는다(요구하면 결함이다).
   * 조회 자체는 아래 effect 하나가 소유하고, 이 값은 그 effect 를 다시 돌리는
   * 방아쇠일 뿐이다.
   */
  const [secretNonce, setSecretNonce] = useState(0);
  useEffect(() => {
    if (!open || !bridgeAvailable) return undefined;
    const bump = () => setSecretNonce((value) => value + 1);
    const offSecret = subscribeSecretChange(bump);
    const offLocal = subscribeLocalEndpointChange(bump);
    return () => {
      offSecret();
      offLocal();
    };
  }, [open, bridgeAvailable]);
  useEffect(() => {
    if (!open || !bridgeAvailable) return;
    let cancelled = false;
    void (async () => {
      /**
       * **주소 갈래가 먼저다.** 순서를 이렇게 둔 이유: 이 갈래는 주소를 적고
       * 연결을 확인하고 목록에서 모델까지 고른 사람만 도달하는 상태라(키를
       * 붙여넣는 것보다 한 단계 더 명시적이다), 그걸 해 두고도 옛 키가 계속
       * 쓰이면 사용자가 방금 한 일이 아무 일도 아니게 된다. 어느 쪽이 살아
       * 있는지는 패널 푸터가 제공자 이름과 호스트로 계속 말한다.
       */
      const local = readLocalEndpoint();
      if (isLocalEndpointReady(local)) {
        if (!cancelled) {
          setLocalEndpoint(local);
          setProvider(LOCAL_PROVIDER);
        }
        return;
      }
      if (!cancelled) setLocalEndpoint(null);
      for (const candidate of SECRET_PROVIDERS) {
        const status = await secretStatus(candidate);
        if (cancelled) return;
        if (status?.stored) {
          setProvider(candidate);
          return;
        }
      }
      if (!cancelled) setProvider(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bridgeAvailable, secretNonce]);

  /**
   * 세션 사이의 이어짐 — 이 폴더의 최근 커밋 제목. **대화를 저장하지 않고도**
   * 새 대화가 지난 작업을 이어받는 근거다(쓰기는 전부 frontmatter + git 에
   * 남았다). 패널이 열릴 때와 적용이 끝났을 때만 읽는다: 배경 폴링은 사용자가
   * 시키지 않은 일이고, git 이 아니면 브리지가 정직하게 빈 값을 준다.
   */
  const [recentChanges, setRecentChanges] = useState<readonly string[]>([]);

  const screenContextWithHistory = useMemo<ScreenContextSnapshot>(
    () => ({ ...screenContext, recentChanges }),
    [screenContext, recentChanges],
  );

  /**
   * 이 대화가 실제로 가는 곳. 명명 벤더는 코드에 박힌 공식 호스트이고, 주소
   * 갈래는 사용자가 적은 주소의 호스트다 — 감사 줄에 남는 값과 **같은 문법**
   * 이라 화면과 기록이 같은 것을 말한다.
   */
  const providerHost =
    provider === LOCAL_PROVIDER
      ? hostOfBaseUrl(localEndpoint?.baseUrl ?? '')
      : provider
        ? SECRET_PROVIDER_HOSTS[provider]
        : '';

  /**
   * 절대 경로만으로 보낼 준비가 되지 않는다. 데스크톱 복원 중에는
   * handle/절대 경로가 manifest보다 먼저 살아날 수 있다. 그 프레임의
   * 화면은 번들 샘플인데 경로를 바로 쓰면 에이전트는 숨은 로컬
   * 폴더에 감사 로그를 남겨 화면·근거·기록의 볼트가 갈라진다. manifest가
   * 없으면 읽을 볼트가 없는 것이므로 기존 no-folder 상태로 정직하게 내린다.
   */
  const readableVaultPath = manifest ? vaultPath : null;

  const agent = useVaultAgent({
    provider,
    localEndpoint,
    vaultPath: readableVaultPath,
    insight,
    manifest,
    screenContext: screenContextWithHistory,
    locale,
    vaultIsGit,
    projectInstructions: null,
    snapshotLabel: t('snapshotLabel'),
    notices: {
      roundCap: t('notice.roundCap'),
      noToolCall: ({ round, cap }) => t('notice.noToolCall', { round, cap }),
      aborted: t('notice.aborted'),
      networkFailed: t('notice.networkFailed'),
      timedOut: t('notice.timedOut'),
      rateLimited: t('notice.rateLimited'),
      rejected: t('notice.rejected'),
      auditBlocked: t('notice.auditBlocked'),
      providerRefused: t('notice.providerRefused'),
      failed: t('notice.failed'),
    },
    proposalLabels: {
      createFile: (path) => t('proposal.createFile', { path }),
      modifyFile: (path) => t('proposal.modifyFile', { path }),
      addRelation: ({ from, to, type }) =>
        t('proposal.addRelation', { from, to, type }),
    },
  });

  // 닫힘 = 중단. 열려 있지 않으면 진행 중인 것도 함께 끝난다.
  const { stop } = agent;
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /**
   * 이력을 읽는 시점은 둘뿐이다: 패널이 열릴 때, 그리고 **적용이 반영된
   * 뒤**(다음 대화가 방금 한 일을 알아야 "이어진다" 가 참이 된다). 배경
   * 폴링은 사용자가 시키지 않은 일이라 하지 않는다.
   */
  const appliedTally = agent.sessionSummary.concepts + agent.sessionSummary.relations;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 읽을 수 없는 상태(닫힘·폴더 없음·git 아님)는 **빈 이력**이지 오류가
      // 아니다. 그때는 그 블록만 문맥에서 빠진다.
      if (!open || !readableVaultPath || !isGitBridgeAvailable()) {
        if (!cancelled) setRecentChanges((current) => (current.length === 0 ? current : []));
        return;
      }
      try {
        const commits = await gitHistory(readableVaultPath, 5);
        if (cancelled) return;
        setRecentChanges(
          (commits ?? []).map((commit) => `${commit.subject} (${commit.relativeTime})`),
        );
      } catch {
        // git 이력을 못 읽는 것도 대화의 실패가 아니다 — 그 줄만 없이 간다.
        if (!cancelled) setRecentChanges([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, readableVaultPath, appliedTally]);

  /**
   * 프리필된 문장을 **처음부터 읽히게** 놓는다 — 캐럿은 문장 끝(이어서
   * 쓸 자리), 시야는 첫 줄.
   *
   * 구 구현은 `input.select()` 였다. 전체 선택은 "다음 타건이 이 문장을
   * 지운다" 는 뜻인데, 사용자는 방금 이 문장을 **고르려고** 눌렀다 — 의도와
   * 반대다. 게다가 select 는 선택 끝(마지막 줄)으로 스크롤해서, 2줄 고정
   * 상자에 3줄이 들어온 순간 한 프레임에 `scrollTop` 을 9px 로 밀어 넣었다.
   * 줄 높이가 20px 이라 9는 배수가 아니고, 그래서 윗변에 글리프가 반으로
   * 잘린 줄이 걸렸다(실측: 420프레임 중 f231, 16.7ms).
   *
   * `scrollTop` 은 언제나 줄 격자에 붙인다. 이건 모션이 아니라 **정렬**이라
   * reduced-motion 에서도 그대로 산다.
   */
  const seatDraft = useCallback((input: HTMLTextAreaElement) => {
    input.focus();
    const end = input.value.length;
    // jsdom·구형 WebView 에 없을 수 있는 API 는 있을 때만 부른다.
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
    const lineHeight = Number.parseFloat(window.getComputedStyle(input).lineHeight);
    input.scrollTop = snapScrollTop(0, lineHeight);
  }, []);

  /**
   * 칩 → 프리필. **누른 그 프레임**에 문장이 앉는다. 전송은 언제나 [보내기]다.
   *
   * 자리 앉히기는 `requestAnimationFrame` 뒤로 미룬다 — `setDraft` 직후에는
   * React 가 아직 값을 써 넣지 않아 캐럿이 옛 값(빈 문자열) 기준으로 잡힌다.
   */
  const prefill = useCallback(
    (text: string) => {
      setDraft(text);
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      window.requestAnimationFrame(() => {
        const current = inputRef.current;
        if (current) seatDraft(current);
      });
    },
    [seatDraft],
  );

  /**
   * 바깥에서 건너온 첫 마디(S7).
   *
   * 효과가 아니라 **렌더 중 조정**으로 받는다(React 의 "prop 이 바뀔 때 state
   * 를 맞추기" 패턴): 효과로 받으면 화면이 한 번 낡은 값으로 그려졌다가 다시
   * 그려지고, 그 한 프레임이 정확히 "눌렀는데 늦게 반응한다" 로 보인다.
   * `nonce` 가 바뀔 때만 앉으므로 같은 문장을 다시 눌러도 다시 앉고, 사용자가
   * 고쳐 쓰던 초안을 렌더마다 덮지도 않는다.
   */
  const prefillNonce = prefillRequest?.nonce ?? null;
  const prefillText = prefillRequest?.text ?? null;
  const [seenPrefillNonce, setSeenPrefillNonce] = useState<number | null>(null);
  if (prefillNonce !== null && prefillText && prefillNonce !== seenPrefillNonce) {
    setSeenPrefillNonce(prefillNonce);
    setDraft(prefillText);
  }
  // 포커스·캐럿은 DOM 조작이라 렌더 뒤에 한다 — 그때는 값이 이미 들어와 있다.
  useEffect(() => {
    if (seenPrefillNonce === null) return;
    const input = inputRef.current;
    if (!input) return;
    seatDraft(input);
  }, [seenPrefillNonce, seatDraft]);

  /**
   * 컴포저 자람 — 2줄에서 시작해 6줄까지 **내용을 따라** 자란다.
   *
   * 구 구현은 `rows={2}` 고정이라 세 줄짜리 문장이 들어와도 상자가 그대로였고
   * (420프레임 전체에서 높이 58px 고정, 프레임간 픽셀 diff 평균 0.013),
   * 사용자는 자기가 방금 고른 문장의 3분의 1만 볼 수 있었다.
   *
   * 높이는 `transform` 이 아니라 **실제 `height`** 로 간다 — 형제(보내기
   * 버튼·곁가지 줄)가 같이 자리를 내줘야 "이 칸이 자랐다" 로 읽히고,
   * transform 은 자리를 안 만든다. 곡선은 표면 이동 램프(`--motion-base`)
   * 하나이고 스프링은 쓰지 않는다: 재타기팅이 없는데 baseline 을 넘어서면
   * 읽는 중에 글자가 흔들린다.
   */
  useLayoutEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    if (!input || !mirror) return;
    mirror.value = draft;
    const style = window.getComputedStyle(input);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const growth = composerGrowth({
      lineHeight,
      paddingBlock:
        Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom),
      borderBlock:
        Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth),
      contentHeight: mirror.scrollHeight,
    });
    // 잴 수 없는 상태(SSR·jsdom·폰트 로드 전)에서는 손대지 않는다 — 0px 로
    // 접히는 것보다 `rows` 기본값이 언제나 낫다.
    if (!growth) return;
    input.style.height = `${growth.height}px`;
    input.scrollTop = snapScrollTop(input.scrollTop, lineHeight);
    setComposerHidesTop(composerTopIsHidden(growth.overflowing, input.scrollTop));
    // `scopeAccepted`/`provider` 는 입력칸이 **마운트되는** 순간이다 — 그때
    // 한 번 재야 첫 그림부터 맞는 높이로 선다.
  }, [draft, open, scopeAccepted, provider]);

  // 새 내용은 아래로만 자란다 — 스크롤 앵커 하단 고정.
  useEffect(() => {
    const node = scrollRef.current;
    // jsdom 에는 scrollTo 가 없다 — 없는 API 를 부르지 않고 그냥 넘어간다.
    if (!node || typeof node.scrollTo !== 'function') return;
    node.scrollTo({ top: node.scrollHeight });
  }, [agent.turns, agent.proposal]);

  const ready = bridgeAvailable && Boolean(provider) && Boolean(readableVaultPath);
  const canSend = ready && scopeAccepted && !agent.running && draft.trim().length > 0;

  /**
   * 이 패널이 지금 어느 상태인가 — 한 값으로 접는다. 같은 박스가 다른 상태가
   * 되는 것이므로, 이 값이 바뀔 때만 크로스페이드가 한 번 돈다.
   */
  const stage = !bridgeAvailable
    ? 'web'
    : !readableVaultPath
      ? 'no-folder'
      : !provider
        ? 'no-key'
        : !scopeAccepted
          ? 'scope'
          : 'chat';
  /**
   * 첫 마디 — **로컬 계산이다. 모델을 부르지 않는다.**
   *
   * 재료는 전부 이미 화면에 있다: 지금 보고 있는 개념(화면 문맥), 이 폴더에서
   * 뜻·소속이 빈 개념(「할 일」 큐와 **같은 판정**), 그리고 언제나 물을 수 있는
   * 지도 질문. 그래서 제안은 공짜(로컬)고 실행만 옵트인이다 — "보내기 전에는
   * 아무것도 나가지 않는다" 가 첫 마디 설계의 제약이 아니라 근거가 된다.
   */
  const firstWordsChips = useMemo(
    () =>
      buildFirstWords(
        {
          nodes: insight?.nodes ?? [],
          docFacts: conceptFacts,
          focusedRef: screenContext.focusedSlug,
        },
        {
          missingDefinition: (title) => t('firstWords.missingDefinition', { title }),
          missingDomain: (title) => t('firstWords.missingDomain', { title }),
          missingRelations: (title) => t('firstWords.missingRelations', { title }),
          mapReview: t('firstWords.mapReview'),
          emptyVault: t('firstWords.emptyVault'),
        },
      ),
    [insight, conceptFacts, screenContext.focusedSlug, t],
  );

  function submit() {
    if (!canSend) return;
    const text = draft.trim();
    // 누른 그 프레임에 입력칸이 비고 말풍선이 앉는다 — 네트워크를 기다리지
    // 않는다. `send` 는 동기 상태 전이 후 비동기로 이어진다.
    setDraft('');
    void agent.send(text);
  }

  return (
    <aside
      data-testid="vault-agent-panel"
      data-agent-panel-state={open ? 'open' : 'closed'}
      data-agent-panel-reflow-token="--agent-panel-reflow-duration"
      aria-label={t('title')}
      aria-hidden={!open}
      // 폭 하나가 두 컬럼을 함께 움직인다 — 지도 축소와 패널 진입이 같은
      // 곡선, 같은 시작. `--agent-panel-reflow-duration` 이 그 하나의 값.
      style={{
        width: open ? 'var(--agent-panel-width)' : '0px',
        transitionProperty: 'width',
        transitionDuration: 'var(--agent-panel-reflow-duration)',
        transitionTimingFunction: 'var(--topology-motion-ease-out)',
      }}
      className="relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
    >
      <div
        className="flex h-full w-[var(--agent-panel-width)] flex-col"
        // 열리는 동안에도 지도 조작을 막지 않는다 — 블로킹 표면이 아니다.
        inert={!open ? true : undefined}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
              {t('title')}
            </p>
            {/* 부제 자리는 하나다 — 진전이 생기면 같은 줄의 **글자만** 바뀐다.
                자리·크기가 그대로라 레이아웃이 튀지 않고, 숫자 굴림 같은
                장식도 붙이지 않는다(진전은 알림이 아니라 사실이다). */}
            <p
              data-testid="vault-agent-panel-subtitle"
              className="truncate text-label tracking-label text-[color:var(--color-text-quaternary)]"
            >
              {appliedTally > 0
                ? t('sessionSummary', {
                    concepts: agent.sessionSummary.concepts,
                    relations: agent.sessionSummary.relations,
                  })
                : t('subtitle')}
            </p>
          </div>
          <button
            type="button"
            data-testid="vault-agent-panel-close"
            onClick={onClose}
            aria-label={t('close')}
            className={controlClass({ shape: "icon", tone: "muted", className: "size-[var(--overlay-close-size)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]" })}
          >
            <X aria-hidden="true" size={ICON_SIZE.lg} />
          </button>
        </header>

        <div
          ref={scrollRef}
          data-agent-panel-stage={stage}
          // 이 스크롤러 자체를 세로 flex 로 둔다 — 잠긴 상태의 입력칸 자리가
          // 실제 입력칸과 **같은 위치**(패널 바닥)에 서려면 아래 래퍼가 남는
          // 높이를 받아야 하고, `min-h-full` 은 스크롤 컨테이너 안에서 신뢰할 수
          // 없다.
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
        >
          {/* 같은 박스가 다른 상태가 된다 — 상태 이름을 key 로 두어 짧은
              크로스페이드(--motion-base)가 한 번만 돌게 한다. 새 화면이 나타난
              것처럼 보이면 "여기가 열렸다" 가 아니라 "다른 데로 갔다" 로 읽힌다. */}
          <div key={stage} className="agent-panel-stage-swap flex grow flex-col">
          {!bridgeAvailable ? (
            // 브라우저에는 키를 둘 곳도 보낼 경로도 없다 — 설정으로 보내는 것이
            // 아니라 앱으로 보낸다(정직 강등).
            <AgentLockedState
              title={t('degraded.webTitle')}
              body={t('degraded.webBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !readableVaultPath ? (
            <AgentLockedState
              title={t('degraded.noVaultTitle')}
              body={t('degraded.noVaultBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !provider ? (
            // 소유자 판정 반전(2026-07-26) — 구 구조는 "왼쪽 아래 설정(톱니)의
            // 「AI 연결」에서…" 라고 **말로** 길을 알려줬다. 화면이 데려다 줄 수
            // 있는 자리를 사람에게 찾게 만드는 것은 안내가 아니라 숙제다.
            <AgentLockedState
              title={t('degraded.noKeyTitle')}
              body={t('degraded.noKeyBody')}
              consent={t('locked.consentPromise')}
              examplesTitle={t('locked.examplesTitle')}
              chips={firstWordsChips}
            />
          ) : !scopeAccepted ? (
            <>
              {/* 동의 카드도 바닥에 선다 — [알겠어요]가 곧 [보내기]가 설
                  자리다. 같은 자리에서 다음 컨트롤이 열리면 "여기가 열렸다"
                  가 되고, 위에 떠 있다가 아래에 입력칸이 생기면 "다른 게
                  나타났다" 가 된다. */}
              <div aria-hidden="true" className="min-h-0 shrink grow" />
              <AgentScopeSheet
              provider={t(`provider.${provider}`)}
              host={providerHost}
              auditPath={LLM_AUDIT_LOG_RELATIVE_PATH}
              labels={{
                title: t('scope.title'),
                body: ({ provider: name, host }) => t('scope.body', { provider: name, host }),
                liveRows: t('scope.liveRows'),
                consent: t('scope.consent'),
                recorded: (path) => t('scope.recorded', { path }),
                accept: t('scope.accept'),
                cancel: t('scope.cancel'),
              }}
                onAccept={() => setScopeAccepted(true)}
                onCancel={onClose}
              />
            </>
          ) : (
            <>
              {/* 대화는 **아래에서 자란다** — 짧을 때 남는 높이를 위로 민다.
                  구 배치는 첫 턴을 위에 붙이고 입력칸까지 400~640px 를 비워
                  두었는데, 그 여백은 답과 손 사이를 갈라놓기만 했다.
                  `justify-end` 대신 스페이서를 쓰는 이유: 내용이 넘칠 때
                  `justify-end` 는 스크롤 컨테이너의 위쪽을 잘라먹는다(첫 턴이
                  스크롤 위로 사라진다). 스페이서는 shrink 되므로 넘치면
                  조용히 0 이 된다. */}
              <div aria-hidden="true" className="min-h-0 shrink grow" />
              <AgentTranscript
                turns={agent.turns}
                providerLabel={t(`provider.${provider}`)}
                elapsedSeconds={agent.elapsedSeconds}
                onFocusNode={onFocusNode}
                onPrefill={prefill}
                labels={{
                  nextStepTitle: t('nextStep.title'),
                  retryTitle: t('retry.title'),
                  regroundTitle: ({ round, cap }) => t('reground.title', { round, cap }),
                  you: t('you'),
                  lookingAt: (title) => t('screenContext.lookingAt', { title, josa: josa(title, 'object') }),
                  wholeMap: t('screenContext.wholeMap'),
                  unsupported: t('unsupported'),
                  uncited: t('uncited'),
                  charsLabel: (chars) => t('charsLabel', { chars }),
                  thinking: t('thinking'),
                  thinkingSeconds: (seconds) => t('thinkingSeconds', { seconds }),
                  footer: ({ provider: name, rounds }) => t('footer', { provider: name, rounds }),
                  footerDetail: ({ chars }) => t('footerDetail', { chars }),
                }}
                renderProposal={() => null}
              />
              {agent.proposal ? (
                <AgentProposalCard
                  proposal={agent.proposal}
                  canWrite={canWrite}
                  vaultIsGit={vaultIsGit}
                  expandedByDefault={!agent.hasAppliedOnce}
                  onApply={() => void agent.apply()}
                  onCancel={agent.cancelProposal}
                  onCopy={agent.copyProposal}
                  onToggleChange={agent.toggleChange}
                  onToggleSnapshot={agent.toggleSnapshot}
                  onFocusNode={onFocusNode}
                  labels={{
                    title: (count) => t('proposal.title', { count }),
                    readOnlyTitle: t('proposal.readOnlyTitle'),
                    volume: ({ files, added, removed }) =>
                      t('proposal.volume', { files, added, removed }),
                    apply: (count) => t('proposal.apply', { count }),
                    applying: t('proposal.applying'),
                    cancel: t('proposal.cancel'),
                    copy: t('proposal.copy'),
                    copied: t('proposal.copied'),
                    snapshot: t('proposal.snapshot'),
                    snapshotUnavailable: t('proposal.snapshotUnavailable'),
                    applied: (sha) => t('proposal.applied', { sha }),
                    appliedNoSnapshot: t('proposal.appliedNoSnapshot'),
                    cancelled: t('proposal.cancelled'),
                    conflict: t('proposal.conflict'),
                    unreadWarning: t('proposal.unreadWarning'),
                    showOnMap: t('proposal.showOnMap'),
                    expandHint: t('proposal.expandHint'),
                  }}
                />
              ) : null}
              {/* 빈 대화 — 백지를 내밀지 않는다. 이 폴더의 실제 상태에서 뽑은
                  문장 셋이 먼저 앉아 있고, 누르면 입력칸으로 내려온다. 로컬
                  계산이라 대기가 없으므로 골격과 **같은 프레임**에 도착한다. */}
              {agent.turns.length === 0 ? (
                <AgentFirstWords
                  chips={firstWordsChips}
                  title={t('firstWords.title')}
                  hint={t('firstWords.hint')}
                  onPrefill={prefill}
                />
              ) : null}
            </>
          )}
          </div>
        </div>

        {/* 잠긴 상태의 입력칸 자리 — 실제 입력칸과 **같은 띠**(패널 바닥, 같은
            구분선)에 선다. 두 상태가 같은 자리를 쓰므로 키가 들어오는 순간이
            "여기가 열렸다" 로 읽힌다. 상태마다 안내와 목적지만 다르다. */}
        {stage === 'web' ? (
          <AgentLockedComposer
            testId="vault-agent-download-link"
            hint={t('placeholderFirst')}
            actionLabel={t('degraded.download')}
            actionHref={downloadHref}
          />
        ) : stage === 'no-folder' ? (
          <AgentLockedComposer
            testId="vault-agent-open-folder"
            hint={t('placeholderFirst')}
            actionLabel={t('degraded.noVaultAction')}
            onAction={onOpenFolder}
          />
        ) : stage === 'no-key' ? (
          <AgentLockedComposer
            testId="vault-agent-open-settings"
            hint={t('placeholderFirst')}
            actionLabel={t('degraded.noKeyAction')}
            onAction={() => requestSettingsView('ai')}
          />
        ) : null}

        {ready && scopeAccepted ? (
          // 한 번의 상태 변화는 **한 곡선**으로 온다. 스테이지(내용)와 이 띠
          // (입력칸)는 같은 사건이 낳은 두 부분인데, 구 구현은 스테이지만
          // 크로스페이드하고 이 띠는 하드컷이었다 — 같은 입력이 서로 다른
          // 곡선으로 도착하면 두 사건으로 읽힌다. 새 duration 0(같은 클래스
          // 재사용), 시작 어긋남 0(같은 렌더).
          <footer
            key={stage}
            className="agent-panel-stage-swap shrink-0 border-t border-[color:var(--color-border-soft)] p-2.5"
          >
            {/* 버튼은 `items-end` — 텍스트 입력의 주 행동은 아래에 고정한다
                (Apple HIG: 직접 조작의 목적지는 움직이지 않는다). 칸이 자라면
                버튼이 그 아래 끝을 따라가므로 세로 정렬도 함께 맞는다. */}
            <div className="flex items-end gap-2">
              <div className="relative min-w-0 flex-1">
              <textarea
                ref={inputRef}
                data-testid="vault-agent-input"
                data-composer-hides-top={composerHidesTop ? 'true' : 'false'}
                value={draft}
                rows={COMPOSER_MIN_ROWS}
                disabled={agent.running}
                onScroll={(event) => {
                  const input = event.currentTarget;
                  setComposerHidesTop(
                    input.scrollHeight > input.clientHeight && input.scrollTop > 0,
                  );
                }}
                style={{
                  // 자람은 **표면 이동**이다 — 앱 공통 램프를 그대로 탄다.
                  // 새 토큰 0 · 새 duration 0.
                  transitionProperty: 'height',
                  transitionDuration: 'var(--motion-base)',
                  transitionTimingFunction: 'var(--motion-ease)',
                  // 넘침 신호는 상한에 닿아 **위가 실제로 가려졌을 때만**.
                  // 자라는 동안에는 없는 넘침을 광고하지 않는다.
                  maskImage: composerHidesTop
                    ? 'linear-gradient(to bottom, transparent 0, #000 var(--leading-body))'
                    : undefined,
                }}
                // 아직 아무 말도 안 한 사람에게 "이어서 말하기" 는 이어갈 것이
                // 없는 문장이다. 첫 마디용 자리표시는 잠긴 상태의 띠가 쓰는
                // 문구와 **같은 키**라, 키가 들어오는 순간 같은 자리에 같은
                // 글자가 남는다("여기가 열렸다").
                placeholder={
                  agent.turns.length === 0 ? t('placeholderFirst') : t('placeholder')
                }
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                className={`${COMPOSER_BOX_CLASS} block w-full text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)] disabled:opacity-60`}
              />
              {/* 자람을 재는 미러. **같은 클래스 = 같은 타이포·같은 폭**이라
                  같은 줄 나눔이 나온다. 화면 밖으로 치우지 않고 같은 자리에
                  두는 이유: 폭(패딩·보더 포함)이 실제 칸과 같아야 줄 수가 같다.

                  `invisible`(visibility: hidden)이지 `opacity-0` 이 아니다 —
                  투명한 원소는 여전히 그려지는 원소라 겹침 감사에 잡히고,
                  캐럿·선택이 칠해질 여지도 남는다. 레이아웃은 그대로 도니
                  `scrollHeight` 는 똑같이 나온다. */}
              <textarea
                ref={mirrorRef}
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                data-testid="vault-agent-input-mirror"
                className={`${COMPOSER_BOX_CLASS} pointer-events-none invisible absolute left-0 top-0 h-0 w-full overflow-hidden`}
              />
              </div>
              {agent.running ? (
                <button
                  type="button"
                  data-testid="vault-agent-stop"
                  onClick={agent.stop}
                  /* 중지/보내기는 서로를 대체하는 **한 자리**라 같은 단으로
                     간다. `px-3` 은 램프에서 `lg` 의 인셋이고 `lg` 의 짝은
                     `text-body` 다 — 손으로 쓴 `px-3`+`text-label` 은 두 단을
                     가로지른 조합이었다. */
                  className={controlClass({
                    shape: 'chip',
                    size: 'lg',
                    tone: 'strong',
                    className:
                      'shrink-0 justify-center font-[var(--font-weight-emphasis)] tracking-body hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                  })}
                >
                  {t('stop')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="vault-agent-send"
                  disabled={!canSend}
                  onClick={submit}
                  className={controlClass({
                    shape: 'chip',
                    size: 'lg',
                    tone: 'onAccent',
                    className:
                      'shrink-0 justify-center tracking-body hover:bg-[color:var(--color-indigo-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
                  })}
                >
                  {t('send')}
                </button>
              )}
            </div>

            {/* 곁가지 한 줄 — 여닫는 자리만 상주하고, 내용은 열었을 때만 온다.
                두 버튼은 서로를 닫는다: 겹쳐 열리는 임시 표면을 만들지 않는다. */}
            <div className="mt-2 flex items-center gap-2">
              <MetaToggle
                testId="agent-meta-prompt"
                open={meta === 'prompt'}
                label={t('promptDisclosure.summary')}
                onToggle={() => setMeta((current) => (current === 'prompt' ? null : 'prompt'))}
              />
              {readableVaultPath ? (
                <>
                  <span
                    aria-hidden="true"
                    className="text-label text-[color:var(--color-text-quaternary)]"
                  >
                    ·
                  </span>
                  <MetaToggle
                    testId="agent-meta-handoff"
                    open={meta === 'handoff'}
                    label={t('handoffSummary')}
                    onToggle={() =>
                      setMeta((current) => (current === 'handoff' ? null : 'handoff'))
                    }
                  />
                </>
              ) : null}
            </div>

            {/* `origin` 은 트리거 방향이다 — 이 상자를 여는 토글은 바로 위
                왼쪽에 있고, 상자는 그 아래에서 자란다. 중앙에서 태어나면 누른
                자리와 태어난 자리가 어긋난다(모션석 반려 사유).
                내용은 `heldMeta` 로 붙든다: `meta` 가 null 이 되는 순간 자식이
                비면 상자가 «빈 채로» 접힌다. */}
            <Surface
              open={meta !== null}
              origin="top left"
              data-testid="agent-meta-disclosure"
              className="mt-2 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-2.5"
            >
              {heldMeta === 'prompt' ? (
                <AgentPromptText
                  systemPrompt={agent.systemPrompt}
                  note={t('promptDisclosure.note')}
                />
              ) : readableVaultPath ? (
                // 경계 문장은 **넘기는 자리**에서만 값을 한다 — 대화 내내
                // 입력칸 아래 상주하며 두 줄을 먹던 문장이 여기로 내려왔다.
                <AgentHandoffPacket
                  vaultPath={readableVaultPath}
                  focusedSlug={screenContext.focusedSlug}
                  labels={{
                    boundary: t('boundary'),
                    note: t('handoffNote'),
                    copy: t('handoffCopy'),
                    copied: t('handoffCopied'),
                  }}
                />
              ) : null}
            </Surface>
          </footer>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * 입력칸과 미러가 **함께** 쓰는 상자 규격. 하나의 문자열이라 둘의 타이포가
 * 갈라질 자리가 없다 — 갈라지면 미러가 다른 줄 수를 재고 상자가 틀린 높이로
 * 선다(값이 두 곳에 적히면 이미 드리프트가 시작된 것).
 */
const COMPOSER_BOX_CLASS = fieldClass({ multiline: true, size: 'md' });

/**
 * 곁가지를 여는 한 줄짜리 컨트롤. 테두리도 배경도 없다 — 이 줄이 입력칸과
 * 같은 무게로 보이면 바닥이 다시 "띠 여러 개" 가 된다.
 */
function MetaToggle({
  testId,
  open,
  label,
  onToggle,
}: {
  testId: string;
  open: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-expanded={open}
      onClick={onToggle}
      className={[
        'rounded-chip text-label tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
        open
          ? 'text-[color:var(--color-text-primary)]'
          : 'text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
