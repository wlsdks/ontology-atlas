'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePanelPresence } from '@/shared/lib/use-presence';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Bell,
  Bot,
  ChevronRight,
  Copy,
  Check,
  Expand,
  Footprints,
  HardDrive,
  Layers,
  MessageSquare,
  Monitor,
  Settings,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { LocaleSwitch } from '@/features/locale-switch';
import { useAgentServer, useLocalVault } from '@/features/docs-vault-local';
import { useGuideAutoStart, useGuideReplay, writeGuideAutoStart } from '@/features/guided-tour';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  openTauriVaultInFinder,
} from '@/shared/lib/tauri-vault-fs';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { useDialogFocusTrap } from '@/shared/lib/use-dialog-focus-trap';
import { cn } from '@/shared/lib/cn';
import { Chip, IconButton, RowButton } from '@/shared/ui/controls';
import { subscribeSettingsViewIntent } from '@/shared/lib/settings-view-intent';

import {
  buildRouteFocusHref,
  rememberRouteFocusIntent,
} from '@/shared/ui/route-focus-manager';
import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';
import { CanvasBackgroundPicker, GlyphSetPicker } from './AppearancePickers';
import { FootprintSettings } from './FootprintSettings';
import { ExpandSettings } from './ExpandSettings';
import { AgentActivitySettings } from './AgentActivitySettings';
import { SegmentSwitch, SettingsGroup, SettingsRow } from './settings-primitives';
import { useFrameMeter, writeFrameMeter } from '@/shared/lib/appearance-preferences';
import { BlockImportModule } from '@/features/ontology-blocks';
import { AiConnectionPanel } from './AiConnectionPanel';
import { useAiConnection } from '../model/use-ai-connection';
import { AGENT_GRAPH_WORKFLOW_HREF } from '@/shared/config';

/**
 * 단일 설정 표면 (설정 통합 2026-07-24, 소유자 지시) — 이전엔 설정이 두 곳에
 * 흩어져 있었다: ① 나브레일 톱니의 "지도 설정" 팝오버(TopologyV2SettingsGear —
 * 언어·보기 모드·INDEX 기본 상태·vault 바꾸기), ② 각 페이지 헤더 "설정" 필의
 * 5탭 "앱 설정" 모달(3탭이 사실상 링크 한 줄 + 거대한 빈 여백). 이 위젯이
 * 이제 유일한 설정의 집이다: 탭 폐지, 단일 컬럼 시트, "그룹 헤더 + 즉시 조작
 * 행" 문법(Toss 공개 발표 — 한 화면에 한 가지, 위계의 단순화).
 *
 * - [화면] 언어 · (호스트 주입 시) 보기 모드 · INDEX 기본 상태. 지도 화면
 *   상태(HomePage state)는 `screenControls` optional prop 으로 주입 — 미주입
 *   페이지(빌더 등)에서는 해당 행이 렌더되지 않는다.
 * - [작업공간] 현재 vault 이름/상태 1행 + 폴더 열기/바꾸기 + 문서함 링크.
 *   구 vault 탭의 LocalVaultPicker 표면 중 **경로 복사·Finder 열기**는 #72 에서
 *   이 그룹으로 복원됐다 — B2 병합 당시 "/docs vault 필이 담당" 이라고 적었지만
 *   실제로는 어느 표면도 그 컴포넌트를 렌더하지 않아 데스크톱에서 통째로
 *   유실돼 있었다(opus5 검수 2026-07-25).
 * - [내 에이전트 연결] `VaultAgentSetupPanel` — 밖의 도구(Claude Code · Codex ·
 *   Cursor · Antigravity)가 이 폴더를 읽게 하는 설정 파일. MCP 증명 장문·상태
 *   카드 그리드·판정 순서 문서는 「고급 · 자세한 검증」 접기 뒤에 있다.
 * - [앱 안 에이전트] (#80) 키 등록/연결 확인/보낸 기록. 새 라우트 0개 —
 *   설정의 집은 여기 하나다.
 *
 * ## 드릴인 복도를 없앴다 (2026-08-02, 디자인 카운슬 A-3)
 *
 * 위 둘은 한때 「AI 에이전트」라는 **한 LNB 절 안의 요약 2행**이었고, 각 행이
 * 서브뷰로 드릴인했다. 그 복도 판을 실측하니 698×617 중 잉크가 108px,
 * **빈칸 82.5%** 에 설정 항목은 0개였다 — 아무것도 고를 수 없는 칸이 한 절을
 * 통째로 쓰고 있었다. 게다가 드릴인하면 LNB 180px 이 통째로 사라져, 방금
 * 고른 목록을 잃은 채 뒤로가기 계단이 하나 생겼다.
 *
 * 그래서 **복도를 지우고 두 목적지를 LNB 로 승격**한다(6행 → 7행). 서브뷰
 * 전환 2 → 0, 뒤로가기 1 → 0, LNB 는 상시. 「AI」로 시작하는 이름 셋이 첫
 * 글자로 안 갈렸던 것도 여기서 끝난다 — 「내」 vs 「앱 안」.
 *
 * P3 결함⑥ 계약 유지 — `open`/`onOpenChange` optional controlled prop, ⌘K 는
 * 팔레트에 양보(settings demote), Escape 는 이 다이얼로그가 소유하고
 * stopPropagation 으로 지도 Esc 래더에 새지 않는다.
 */

/**
 * LNB 항목 — 왼쪽 목록의 순서와 묶음이 곧 이 배열이다.
 *
 * 「지도 배경」·「발자국」이 「화면」 밑이 아니라 **같은 단**에 있는 이유: 값이 각각
 * 4개·8개라 화면 절에 접어 넣으면 그 절이 나머지를 삼킨다. LNB 는 절을 늘리는
 * 비용이 거의 없다는 것이 드릴인 대비 장점이고, 그래서 늘렸다.
 *
 * ## 왜 묶음과 아이콘이 있나 (실측 2026-07-29)
 *
 * 아이콘 없는 글자만의 목록은 항목 폭 163px 에 글자가 **19~51px** 뿐이었다 —
 * 가로의 70%가 비고, 세로도 505px 중 329px(65%)이 빈 칸이었다. 그 공백은 여백이
 * 아니라 **정보가 없는 것**이다.
 *
 * 아이콘은 장식이 아니라 **훑기 채널**이다(반복해 여는 목록에서 글자를 읽기 전에
 * 자리를 기억하게 한다). 묶음 제목은 다섯 항목이 왜 그 순서인지를 말한다 —
 * 앞 셋은 보이는 것, 뒤 둘은 이 앱이 무엇과 이어져 있는가다.
 *
 * ## 치수는 크롬에서 빌려오지 않는다 (2026-08-02, 소유자 *"이 LNB버튼도 작고"*)
 *
 * 종전 항목은 `px-2.5 py-1.5` → 높이 **32px**, 아이콘 **14px** 이었다. 32px 은
 * 나브레일 유틸리티 타일(`--app-nav-rail-tile-height`)의 값이고, 14px 은 이
 * 시트 어디에도 근거가 없는 값이다. 즉 **지도 위에 떠서 화면을 양보하는 도구
 * 막대**의 치수를 «일부러 들어와서 읽고 고르는 목적지» 가 빌려 쓰고 있었다 —
 * 「스케일 고정 계약」이 스스로 사정거리를 워크벤치 크롬으로 한정하는 바로 그
 * 이유가 여기에 반대로 적용됐다(`design.md`, `GatewayNav` 예외의 논리와 같다).
 *
 * 그래서 값을 **이 시트 안에서** 끌어온다. 새 토큰은 만들지 않는다:
 *
 * - `px-3 py-2` — 오른쪽 칸 `SettingsRow` 와 **같은 패딩**이다. 세로 인셋이
 *   같아지면서 높이 36px 이 파생되고, 가로 인셋이 같아지면서 왼쪽 목록과
 *   오른쪽 행의 글자 시작선이 같은 리듬을 탄다.
 * - `text-body-lg`(14px) — 이 목록은 시트가 열렸을 때 **먼저 고르게 하는
 *   자리**(주목 승자)다. 오른쪽 행 라벨(12.5px)보다 한 단 위여야 «어디로
 *   갈까»와 «무엇을 바꿀까»가 한 무게로 경쟁하지 않는다.
 * - 아이콘 16px — 14px 은 글자(14px)와 같아서 훑기 채널로 서지 못했다.
 */
const SETTINGS_GROUPS = [
  // 「확장」이 배경과 발자국 **사이**인 이유(소유자 2026-08-01: *"발자국 위에
  // 하나 넣어주면 될듯"*): 앞의 둘은 지도가 무엇으로 그려지는가(바닥·글리프)고
  // 「확장」은 그 위에서 무엇이 열리는가다. 발자국은 다 그린 뒤 남는 흔적이라
  // 맨 뒤가 맞다.
  // 「알림」이 발자국 **뒤**인 이유: 앞의 넷은 지도가 어떻게 그려지는가(바닥 ·
  // 글리프 · 펼침 · 흔적)의 순서이고, 알림은 그 위에 앱이 말을 얹는 층이라
  // 마지막이다. 「이어진 것」으로 내리지 않는 이유는 렌더 분기 주석에.
  { key: 'look', items: ['screen', 'background', 'expand', 'footprint', 'notify'] },
  // 「내 에이전트 연결」·「앱 안 에이전트」가 여기 **나란히** 있는 이유: 둘은
  // 같은 절의 두 요약 행이 아니라 서로 다른 목적지다. 하나는 밖의 도구가 이
  // 폴더를 읽게 하는 **설정 파일**이고, 하나는 앱 안에서 말을 거는 **키**다.
  // 이름의 첫 글자가 갈리는 것이 그 차이를 나르는 채널이다.
  { key: 'connect', items: ['workspace', 'agent', 'ai'] },
] as const;

type SettingsSection = (typeof SETTINGS_GROUPS)[number]['items'][number];

/** 절 → 아이콘. 아이콘은 항목당 하나씩 고정이라 이 표가 단일 출처다. */
const SECTION_ICON: Record<SettingsSection, typeof Monitor> = {
  screen: Monitor,
  background: Layers,
  // 네 방향으로 벌어지는 화살표 — 이 목록에서 유일하게 «바깥으로 퍼지는»
  // 실루엣이라 사각(Monitor)·겹친 판(Layers)·발자국·드라이브·봇 어느 것과도
  // 안 섞인다(아이콘은 장식이 아니라 훑기 채널이다, 위 주석).
  expand: Expand,
  footprint: Footprints,
  // 종 — 이 목록에서 유일한 «울리는» 실루엣이다. 말풍선(ai)과 헷갈릴 자리가
  // 아닌 이유: 말풍선은 «내가 말을 건다», 종은 «앱이 나를 부른다» 이고 외곽선도
  // 사각 대 삼각이라 훑기에서 갈린다.
  notify: Bell,
  workspace: HardDrive,
  // 밖의 도구 = 로봇, 앱 안의 대화 = 말풍선. 실루엣이 갈려야 훑기 채널이 선다
  // (이름의 첫 글자를 가른 것과 같은 이유다).
  agent: Bot,
  ai: MessageSquare,
};
type SettingsTriggerVariant = 'header-pill' | 'rail-tile' | 'chrome-tile';

const SETTINGS_LOCALE_FOCUS_KEY = 'ontology-atlas:settings-locale-focus';
const SETTINGS_LOCALE_FOCUS_MAX_AGE_MS = 10_000;

/**
 * 인디고 강조 칩의 **테두리와 호버** — 값 층이 안 내는 두 층이다.
 *
 * `tone: 'accentOnTint'` 는 글자색만 낸다(그게 램프가 소유하는 것이다). 테두리 틴트와
 * 호버 색은 아직 램프 밖이라 세 자리가 같은 문자열을 손으로 들고 있었다.
 * 한 벌로 묶어 갈림을 없앤다 — 램프가 이 층을 갖게 되면 지울 자리도 하나다.
 */
const INDIGO_ACTION_CHIP =
  'shrink-0 border-[color:var(--color-indigo-line-a32)] hover:border-[color:var(--color-indigo-line-a45)] hover:bg-[color:var(--color-indigo-line-a13)]';
// 값의 단일 출처는 `@/shared/config` 다 — 여기 다시 적으면 시트 쪽과
// 갈라진다(그게 2026-08-01 에 실제로 일어난 일이다). 이 파일은 쓰기만 하고
// 기존 소비처를 위해 이름만 다시 내보낸다.
export { AGENT_GRAPH_WORKFLOW_HREF };

interface SettingsLocaleFocusIntent {
  locale: string;
  triggerVariant: SettingsTriggerVariant;
  createdAt: number;
}

function rememberSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
) {
  try {
    const intent: SettingsLocaleFocusIntent = {
      locale,
      triggerVariant,
      createdAt: Date.now(),
    };
    window.sessionStorage.setItem(SETTINGS_LOCALE_FOCUS_KEY, JSON.stringify(intent));
  } catch {
    // sessionStorage unavailable — navigation still proceeds without restoration.
  }
}

function consumeSettingsLocaleFocus(
  locale: string,
  triggerVariant: SettingsTriggerVariant,
): boolean {
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_LOCALE_FOCUS_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as Partial<SettingsLocaleFocusIntent>;
    const age = Date.now() - Number(intent.createdAt);
    if (!Number.isFinite(age) || age < 0 || age > SETTINGS_LOCALE_FOCUS_MAX_AGE_MS) {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
      return false;
    }
    if (intent.locale !== locale || intent.triggerVariant !== triggerVariant) return false;
    window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    return true;
  } catch {
    try {
      window.sessionStorage.removeItem(SETTINGS_LOCALE_FOCUS_KEY);
    } catch {
      // sessionStorage unavailable — leave no in-memory focus contract behind.
    }
    return false;
  }
}

export interface AppSettingsScreenControls {
  audiencePlain: boolean;
  onAudiencePlainChange: (next: boolean) => void;
  indexCollapsed: boolean;
  onIndexCollapsedChange: (next: boolean) => void;
}

export interface AppSettingsMenuProps {
  mode: 'static' | 'local';
  /** controlled open state. 미지정 시 self-managed(기존 동작). */
  open?: boolean;
  /** controlled 모드에서 open 이 바뀔 때마다 호출 — 호출자가 실제 state 를 갱신한다. */
  onOpenChange?: (next: boolean) => void;
  /**
   * 지도(HomePage) 전용 화면 상태 주입 — 보기 모드(개발/일반)와 INDEX 기본
   * 상태. 주입한 페이지에서만 [화면] 그룹에 해당 행이 나타난다.
   */
  screenControls?: AppSettingsScreenControls;
  /**
   * 트리거 표면 계약. `header-pill`(기본) = 페이지 헤더의 "설정" 필.
   * `rail-tile` = 나브레일 하단 유틸 타일(활동·발자취와 같은
   * `--app-nav-rail-tile-*` 지오메트리). `chrome-tile` = <lg 상단 유틸리티
   * 레인의 `--chrome-tile-size` 타일. 구 TopologyV2SettingsGear 의 트리거
   * 문법을 그대로 승계한다 — 팝오버 대신 이 시트가 열리는 것만 다르다.
   */
  triggerVariant?: SettingsTriggerVariant;
}

/** AI 에이전트 첫 접촉 증명 패킷 — 사람이 읽는 카드 대신 에이전트에 그대로
 *  붙여넣는 typed handoff. 구 5탭 시절 mcpAgents 탭의 정적 교육 카드 그리드가
 *  하던 말이 전부 이 패킷 안에 있다(표면은 죽고 handoff 는 산다). */
const MCP_FIRST_CALLS_PACKET = [
  'Ontology Atlas MCP first-contact proof packet',
  '',
  'Direct MCP proof inside the current agent session:',
  '1. codex mcp list',
  '2. tools/list -> read toolCount from connection_info for the current number; finalize_project_meaning and query_ontology must be present',
  '3. query_ontology({"operation":"agent_brief"})',
  '4. query_ontology({"operation":"workspace_brief"})',
  '5. query_ontology({"operation":"health"})',
  '',
  'If direct MCP tools are missing, this is CLI fallback proof only:',
  'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
  '',
  'Stale client cache hint:',
  'If the client still says 23 tools or query_ontology is not callable, reload/restart the agent or refresh cached MCP tools.',
  '',
  'Project ontology indexing checkpoint (side effect 0):',
  'Replace [codebase-root] with the current checkout path before running project indexing.',
  'index_project({"rootPath":"[codebase-root]"})',
  'node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2',
  '',
  'Meaning gate: report the business/product domain and capability first, then cite code index rows as implementation evidence.',
  'Business evidence: include meaningGate.businessOntology.evidence rows from README and docs/ontology.',
  'Review queue: include meaningGate.implementationEvidence.reviewRequiredRows so humans can name folders that still lack product meaning.',
  'Do not promote source folders to capabilities when existing ontology evidence maps them through matching slugs or capability elements.',
].join('\n');

export function AppSettingsMenu({
  mode,
  open: openProp,
  onOpenChange,
  screenControls,
  triggerVariant = 'header-pill',
}: AppSettingsMenuProps) {
  const t = useTranslations('nav.settingsMenu');
  // #72 — 경로 복사/Finder 문구는 구 LocalVaultPicker 가 쓰던 키를 그대로
  // 재사용한다(문구 중복 생성 없이 표면만 옮긴다).
  const tPicker = useTranslations('featuresMisc.localVaultPicker');
  const locale = useLocale();
  const { state: copyState, copy } = useCopyFeedback();
  const router = useRouter();
  const localVault = useLocalVault();
  // 번들 MCP 서버 유무 — 설정 패널의 원클릭 성립 여부.
  const agentServer = useAgentServer();
  // 지금 화면이 등록한 "안내 다시 열기" — 등록이 없는 화면에서는 행 자체가
  // 없다(빈 행/비활성 버튼을 남기지 않는다).
  const replayGuide = useGuideReplay();
  const guideAutoStart = useGuideAutoStart();
  const frameMeter = useFrameMeter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) onOpenChange?.(next);
      else setInternalOpen(next);
    },
    [isControlled, onOpenChange],
  );
  /** 지금 보고 있는 LNB 절. 시트를 닫아도 유지된다(세션 한정) — 다시 열면 하던 자리다. */
  const [section, setSection] = useState<SettingsSection>('screen');
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const panelRef = useDialogFocusTrap<HTMLDivElement>({
    open,
    initialFocus: 'container',
    // closePanel owns the return target so ⌘K can intentionally yield focus
    // to the command palette without the modal cleanup stealing it back.
    restoreFocus: false,
    // 도크는 비모달이다 — 지도를 보며 값을 맞추는 표면이라 지도로 Tab 해 나갈
    // 수 있어야 한다. 초점을 가두면 키보드 사용자만 그 지도에 못 간다.
  });
  const titleId = useId();
  const isDesktopRuntime = isTauriVaultRuntime();

  const isLocalVaultLoaded = localVault.status === 'loaded';
  // #72 — 데스크톱에서만 절대 경로를 알 수 있다(웹 FSA 핸들엔 경로가 없다).
  const vaultRootPath =
    isLocalVaultLoaded && localVault.handle
      ? (getTauriVaultRootPath(localVault.handle) ?? null)
      : null;

  const showVaultManagement = localVault.status !== 'unsupported';
  const vaultBusy = localVault.status === 'opening' || localVault.status === 'loading';
  const localVaultValidationSummary = (() => {
    if (localVault.status !== 'loaded' || !localVault.manifest) return null;
    const summary = summarizeVaultValidation(
      localVault.manifest.docs.map((doc) => ({
        slug: doc.slug,
        frontmatter: doc.frontmatter,
      })),
    );
    if (summary.errorCount === 0 && summary.warningCount === 0) return null;
    return { errorCount: summary.errorCount, warningCount: summary.warningCount };
  })();

  // 설치 앱의 local vault 가 활성 상태여도 제품에 내장된 현재 runbook 을 연다.
  // source=server 는 사용자 vault README 와 같은 slug fallback 으로 조용히
  // 바뀌는 일을 막되, 저장된 local source 선호 자체는 덮어쓰지 않는다.
  const handleOpenWorkflowGuide = () => {
    setOpen(false);
    rememberRouteFocusIntent(AGENT_GRAPH_WORKFLOW_HREF);
    router.push(buildRouteFocusHref(AGENT_GRAPH_WORKFLOW_HREF));
  };
  const vaultHref =
    mode === 'local' ? '/docs/' : isDesktopRuntime ? '/docs/?intent=local' : '/download/';
  const vaultNavigationHref = buildRouteFocusHref(vaultHref);
  const vaultBody = mode === 'local' ? t('vaultBodyLocal') : t('vaultBodyStatic');
  const vaultCta = mode === 'local' ? t('vaultCtaLocal') : t('vaultCtaStatic');
  const handleVaultNavigate = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    rememberRouteFocusIntent(vaultHref);
  };

  // [앱 안 에이전트] (#80) — 시트가 닫혀 있으면 키체인도 감사 로그도 읽지
  // 않는다(조용한 조회 0).
  const aiConnection = useAiConnection({
    enabled: open,
    vaultHandle: isLocalVaultLoaded ? (localVault.handle ?? null) : null,
  });

  // P3 결함⑥ — controlled 모드에서 이 `<details>` 는 React state 가 곧
  // 진실원이어야 한다. 매 렌더마다 DOM `open` 을 React 값으로 되맞춰 race 를
  // 구조적으로 없앤다 (uncontrolled 모드에서도 같은 값이면 no-op).
  /**
   * 퇴장 presence (2026-07-28 프레임 실측). 이 시트는 등장에 8프레임(134ms,
   * 피크 2.15)을 쓰고 **퇴장은 단 1프레임**이었다 — 그 한 프레임의 델타가
   * 등장 피크의 **4.7배**(10.03). `settingsPanelIn` 은 있는데 짝이 없었다:
   * 들어온 길로 나가지 않는다.
   *
   * 포커스 반환·스크롤 잠금·Esc 핸들러는 계속 `open` 을 보므로 동작은 그대로고,
   * 늘어나는 것은 **그림뿐**이다 — 그래서 나가는 동안 `inert` + `aria-hidden`
   * 으로 보조기술과 포인터에게서 즉시 사라진다(모달이 둘로 읽히지 않게).
   */
  const settingsPresence = usePanelPresence(open);
  const settingsMounted = settingsPresence.mounted;
  const settingsExiting = settingsPresence.exiting;

  useEffect(() => {
    if (detailsRef.current) detailsRef.current.open = open;
  }, [open]);

  useEffect(() => {
    if (!consumeSettingsLocaleFocus(locale, triggerVariant)) return undefined;
    const timer = window.setTimeout(() => {
      triggerRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [locale, triggerVariant]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (event: MouseEvent) => {
      const details = detailsRef.current;
      const overlay = overlayRef.current;
      const target = event.target as Node;
      // 오버레이는 portal(body 직속)이라 details.contains 만으로는 시트 내부
      // 클릭을 "바깥"으로 오판한다 — 둘 다 검사.
      if (details?.contains(target) || overlay?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open, setOpen]);

  const closePanel = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      window.setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };
  /** 요청받은 절로 데려가고 **그 목록 항목에 초점**을 둔다 — 어디에 왔는지가 목록에 남는다. */
  const focusSection = (next: SettingsSection) => {
    setSection(next);
    window.setTimeout(() => {
      navRef.current
        ?.querySelector<HTMLButtonElement>(`[data-testid="app-settings-nav-${next}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  };

  // 다른 표면이 "설정의 그 자리" 를 열어 달라고 보낸 요청. 지도 오른쪽 도크의
  // 「설정에서 키 등록」이 이 경로로 들어온다 — 사용자에게 톱니 위치를 말로
  // 알려주는 대신 문을 준다.
  //
  // 이 위젯은 화면 폭에 따라 두 트리거(레일 타일 lg+ · 크롬 타일 <lg)로 두 번
  // 마운트되지만 **보이는 쪽만** 응답한다. 시트는 portal 이라 숨은 인스턴스까지
  // 응답하면 같은 시트가 두 겹으로 열린다. 브레이크포인트를 여기 복제하지 않고
  // 실제 렌더 여부(`offsetParent`)로 판정한다 — 폭 계약이 바뀌어도 이 코드는
  // 갈라지지 않는다.
  useEffect(
    () =>
      subscribeSettingsViewIntent((next) => {
        const trigger = triggerRef.current;
        if (!trigger || trigger.offsetParent === null) return;
        setOpen(true);
        // 서브뷰가 사라졌으므로 요청은 그대로 **LNB 절**로 착지한다 —
        // `'ai'`/`'agent'` 라는 이름은 그대로라 부르는 쪽은 아무것도 안 바뀐다.
        focusSection(next);
      }),
    [setOpen],
  );

  return (
    <details
      ref={detailsRef}
      open={open}
      className="group relative shrink-0"
      onKeyDown={(event) => {
        // Guardian B2 — transient 상호배제: ⌘K(팔레트)가 열리면 설정은
        // demote (동시 스택 금지, design.md popup-soup 계약). 포커스 반환
        // 없이 닫아 팔레트가 포커스를 가져가게 한다.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          closePanel(false);
          return;
        }
        if (event.key !== 'Escape') return;
        event.preventDefault();
        // 지도 Esc 래더(window keydown)가 같은 keypress 에 이중으로 반응하지
        // 않도록 이 다이얼로그가 Escape 를 소유한다 — "one overlay owns one
        // Escape" (구 설정 기어와 같은 계약). 드릴인 서브뷰가 없어졌으므로
        // 사다리는 한 칸이다: 이 시트가 닫힌다.
        event.stopPropagation();
        closePanel();
      }}
    >
      <summary
        ref={triggerRef}
        aria-label={t('triggerAria')}
        aria-expanded={open}
        title={t('triggerTitle')}
        data-testid="app-settings-trigger"
        data-trigger-variant={triggerVariant}
        onClick={(event) => {
          event.preventDefault();
          setOpen(!open);
        }}
        className={cn(
          'cursor-pointer list-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset [&::-webkit-details-marker]:hidden',
          triggerVariant === 'rail-tile'
            ? // 나브레일 유틸리티 타일 계약 — 활동(AppNavRail)·발자취
              // (GitStatusTile)와 같은 지오메트리·상태 안무.
              'flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] active:translate-y-px active:bg-[color:var(--color-overlay-3)]'
            : triggerVariant === 'chrome-tile'
              ? // <lg 상단 유틸리티 레인의 ChromeTile 계약 — 같은 행 타일들과
                // 높이·radius·표면 일치.
                'flex size-[var(--chrome-tile-size)] items-center justify-center rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--chrome-surface)] text-[color:var(--color-text-tertiary)] shadow-[var(--chrome-shadow)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
              : 'inline-flex h-8 items-center justify-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] px-2 text-[color:var(--color-text-tertiary)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]',
        )}
      >
        <Settings
          size={triggerVariant === 'header-pill' ? 14 : undefined}
          aria-hidden
          className={
            triggerVariant === 'rail-tile'
              ? 'h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]'
              : triggerVariant === 'chrome-tile'
                ? 'size-[var(--topology-chrome-icon-size)]'
                : undefined
          }
        />
        {triggerVariant === 'header-pill' ? (
          <span className="hidden font-mono text-label uppercase tracking-[0.08em] sm:inline">
            {t('settingsLabel')}
          </span>
        ) : null}
      </summary>
      {/* `open ||` 가 먼저다 — 여는 순간은 **같은 커밋**에 포털이 서야
          자동 포커스/포커스 트랩이 첫 렌더에서 패널을 찾는다(effect 로 미루면
          한 커밋 늦어 초점이 새어나간다). 뒤의 presence 는 **닫는 쪽만**
          늘린다. */}
      {(open || settingsMounted) && typeof document !== 'undefined'
        ? createPortal(
      <div
        ref={overlayRef}
        /*
         * **우측 도크 — 모달이 아니다** (카운슬 처방 2026-07-29, 소유자 지시).
         *
         * 종전엔 화면 가운데 모달 + scrim 이었다. 그런데 이 시트의 「지도 배경」·
         * 「발자국」 절은 *"바꾸면 지도가 즉시 반영된다"* 가 계약인데, 정작 그
         * 지도를 자기가 가렸다 — 설정을 만지는 동안 결과를 볼 수 없었다.
         *
         * ## 자리와 성질이 세 번 바뀌었다 — 여기가 종점이다
         *
         * ① 가운데 모달(원래) → ② 우측 비모달 도크 → ③ 가운데 비모달 →
         * ④ **가운데 모달 + 딤**(소유자 2026-07-30, Claude 데스크톱 설정 참조).
         *
         * ②로 간 이유는 *"설정 창이 지도 가리는거"* 였다 — 「지도 배경」·「발자국」
         * 절이 *"바꾸면 지도가 즉시 반영된다"* 를 약속하는데 정작 그 지도를 자기가
         * 가렸다. 그래서 scrim 을 없애 지도를 살려 뒀다.
         *
         * **그 이유가 사라졌다.** 두 절은 이미 **패널 안에 실시간 미리보기**를
         * 갖고 있다 — `FootprintSettings` 의 `FootprintPreview` 는 지도와 **같은
         * 렌더러**로 그리고, 배경 스와치는 실제 `--canvas-bg-*` 토큰으로 그린다.
         * 즉 값을 만지는 동안 결과를 보는 문제는 **지도가 아니라 미리보기가**
         * 풀고 있었고, 도크는 이미 풀린 문제를 위해 위치를 희생하고 있었다.
         *
         * 그래서 딤을 되살린다. 겹침이 사라지므로 INDEX 를 접는 곁가지 결합도
         * 필요 없다(한 번 넣었다가 되돌렸다 — 딤이 하는 일을 두 번 하는 배선이었다).
         *
         * ⚠️ **딤이 있으면 `aria-modal` 이 참이 된다.** ②③ 동안 그 속성을 걸지
         * 않은 것은 규율이 아니라 **사실**이었다 — 바깥이 살아 있는데 없는 셈
         * 치라고 말하면 거짓이다. 지금은 실제로 차단하므로 다시 건다. 초점 트랩도
         * 같은 이유로 복귀한다.
         *
         * portal(body 직속)은 그대로 — 트리거가 어느 크롬 컨테이너에 앉아
         * 있어도 그 stacking context 에 갇히지 않는다.
         */
        className={`${settingsExiting ? 'app-settings-scrim-out' : 'app-settings-scrim-in'} fixed inset-0 z-40 flex items-center justify-center overflow-hidden bg-[color:var(--color-backdrop-medium)] p-3 sm:p-6`}
        aria-hidden={settingsExiting || undefined}
        inert={settingsExiting || undefined}
        data-testid="app-settings-overlay"
      >
        <div
          ref={panelRef}
          role="dialog"
          // 뒤를 딤으로 덮어 실제로 차단하므로 `aria-modal` 은 **참이다**.
          // 비모달 도크였던 동안에는 이걸 걸지 않았다 — 그때는 바깥이 살아
          // 있었고, 살아 있는데 "없는 셈 치라"고 말하면 거짓이었다.
          aria-modal="true"
          aria-labelledby={titleId}
          data-surface-role="settings-dock"
          tabIndex={-1}
          /*
           * **고정 크기다** (소유자 확정 2026-07-29: *"가로 세로 적당한 크기여야하고
           * 고정 사이즈여야함"*). 종전엔 높이가 내용 길이를 따라가서, 절을 바꿀 때마다
           * 창이 늘었다 줄었다 했다 — 발자국 절에서는 납작한 가로 띠가, 작업 공간
           * 절에서는 세로로 긴 창이 됐다. 설정 창은 **머무는 자리**라 그 흔들림이
           * 그대로 "정돈 안 됨"으로 읽힌다.
           *
           * 크기는 앱 최소 창(1040×720) 안에 자기 여백을 두고 들어가야 하고,
           * 좁은 화면에서는 뷰포트에 맞춰 줄어든다(그때만 크기가 변한다). 내용이
           * 넘치면 **오른쪽 칸이 스크롤**하지, 창이 자라지 않는다.
           *
           * ## 높이 640 → 672 (2026-08-02, 소유자 *"뭔가 답답해 설정내부"*)
           *
           * 640 일 때 가장 붐비는 「화면」 절이 **41px 잘려 있었다**(내용 626 /
           * 보이는 칸 585). 동시에 14인치 실측 뷰포트(1512×806)에서 이 패널
           * 바깥의 **118px 이 그대로 비어 있었다** — 잘린 상자와 남는 자리가
           * 같은 화면에 있었던 것이고, 그게 «답답» 의 기계적 형태다.
           *
           * 672 는 취향이 아니라 **파생값**이다: 최소 창 720 에서 오버레이
           * 여백(`p-3`, 위아래 12px)을 뺀 696 안에, 그 여백을 **한 벌 더**
           * 남기고 들어가는 최대 높이다(696 − 24 = 672). 그보다 크면 최소
           * 창에서 자기가 선언한 거터를 스스로 먹는다. 폭 880 은 그대로 —
           * 넓히면 라벨과 컨트롤 사이 빈 구간(실측 최대 541px)만 더 벌어진다.
           */
          className={`${settingsExiting ? 'app-settings-panel-out' : 'app-settings-panel-in'} flex h-[672px] max-h-[calc(100dvh-1.5rem)] w-[880px] focus:outline-none max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-body shadow-[var(--shadow-elevation-3)]`}
          data-testid="app-settings-popover"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {/* 뒤로가기 버튼이 없다 — 갈 뒤가 없다. 모든 목적지가 LNB 에
                  상시 있으므로 제목은 언제나 이 시트의 이름 하나다. */}
              <Settings
                size={15}
                aria-hidden
                className="shrink-0 text-[color:var(--color-indigo-accent)]"
              />
              <h2
                id={titleId}
                className="truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
              >
                {t('title')}
              </h2>
            </div>
            {/* 정사각 아이콘 컨트롤이라 `IconButton` 이 제자리다 — 접근 이름은
                타입이 강제하고, 크기(h-7 w-7)·톤(3차)은 램프가 낸다. 테두리가
                빠진 것은 이 전환의 대가다: 실측 36개의 아이콘 컨트롤에서 뽑은
                모양에 테두리가 없다(`control-class.ts`). 호버·포커스는 규율대로
                소비처가 낸다. */}
            <IconButton
              label={t('closeLabel')}
              onClick={() => closePanel()}
              className="hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset"
            >
              <X size={13} aria-hidden />
            </IconButton>
          </div>

          {
            /*
             * LNB 2단 — 왼쪽 목록, 오른쪽 내용. 소유자 지시(2026-07-29, 재확인):
             * *"다른 서비스 보면 LNB가 있는 팝업창 형태로 많이 구성하잖아.. 우리도
             * 그렇게 해달라고"*. 앞선 드릴인 안(카운슬 권고)은 뒤집혔다 — 절이
             * 다섯이라 드릴인은 매번 뒤로 나갔다 다시 들어가야 하고, 그건 값 몇
             * 개를 비교하며 고르는 일에 맞지 않는다. 2026-08-02 에 마지막 두
             * 드릴인(에이전트 연결 · 앱 안 에이전트)도 이 목록으로 올라오면서
             * **이 시트에 서브뷰는 남아 있지 않다**.
             */
            <div key="root" className="flex min-h-0 flex-1" data-testid="app-settings-body">
              <nav
                ref={navRef}
                aria-label={t('title')}
                data-testid="app-settings-nav"
                className="flex w-[180px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[color:var(--color-border-soft)] p-2"
              >
                {SETTINGS_GROUPS.map((group) => (
                  <div key={group.key} className="mb-3 last:mb-0">
                    <p className="px-2.5 pb-1 font-mono text-label uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                      {t(`sectionGroup.${group.key}`)}
                    </p>
                    {group.items.map((item) => {
                      const active = item === section;
                      const Icon = SECTION_ICON[item];
                      return (
                        <button
                          key={item}
                          type="button"
                          data-testid={`app-settings-nav-${item}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => setSection(item)}
                          className={`flex w-full items-center gap-2.5 rounded-card px-3 py-2 text-left text-body-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] ${
                            active
                              ? 'bg-[color:var(--color-indigo-line-a13)] text-[color:var(--color-indigo-text-soft)]'
                              : 'text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]'
                          }`}
                        >
                          <Icon size={16} aria-hidden className="shrink-0" />
                          {t(`section.${item}`)}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>

              <div
                // 20px 여백은 macOS 설정 창 레이아웃 가이드의 값이다.
                className="grid min-h-0 min-w-0 flex-1 content-start gap-4 overflow-y-auto p-5"
                data-testid={`app-settings-pane-${section}`}
              >
                {section === 'screen' ? (
                  <>
                  {/* 절 제목을 다시 쓰지 않는다 — 왼쪽 목록이 이미 이 칸의 이름이다. */}
                  <SettingsGroup>
                <SettingsRow
                  label={t('languageTitle')}
                  control={
                    <LocaleSwitch
                      onSwitchStart={(nextLocale) =>
                        rememberSettingsLocaleFocus(nextLocale, triggerVariant)
                      }
                    />
                  }
                />
                {screenControls ? (
                  <>
                    <SettingsRow
                      label={t('viewModeLabel')}
                      caption={t('viewModeCaption')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('viewModeLabel')}
                          testId="app-settings-view-mode"
                          value={screenControls.audiencePlain}
                          onChange={screenControls.onAudiencePlainChange}
                          options={[
                            { value: false, label: t('viewModeDev') },
                            { value: true, label: t('viewModePlain') },
                          ]}
                        />
                      }
                    />
                    <SettingsRow
                      label={t('indexDefaultLabel')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('indexDefaultLabel')}
                          testId="app-settings-index-default"
                          value={screenControls.indexCollapsed}
                          onChange={screenControls.onIndexCollapsedChange}
                          options={[
                            { value: false, label: t('indexDefaultExpanded') },
                            { value: true, label: t('indexDefaultCollapsed') },
                          ]}
                        />
                      }
                    />
                  </>
                ) : null}
                {/* 아이콘 세트는 지도 밖(INDEX·공방·상세 글리프)에도 적용되므로
                    지도 서브뷰가 아니라 여기 남는다. */}
                <GlyphSetPicker />
                {/* 화면 안내 다시 보기 (2026-07-26) — 안내는 목적지마다 한 번만
                    자동으로 뜨므로 되돌아올 길이 필요하다. 화면마다 도움말
                    버튼을 새로 만들면 화면별 크롬 수가 갈리므로(#65 계열),
                    모든 화면에 이미 있는 이 메뉴 한 곳으로 모은다. 안내를 열기
                    전에 이 팝오버를 먼저 닫는다 — 안내 카드가 설정 위에 겹치면
                    transient 스택 금지 계약 위반이다. */}
                {/*
                  자동 표시 스위치 — 안내 자체를 지우지 않는다. 끄면 저절로 안 뜰
                  뿐이고, 아래 「다시 보기」와 지도의 나침반 타일로는 그대로 열린다.
                  소유자: *"처음만 나오면 되거든? 아니면 클릭했을때나"*.
                */}
                <SettingsRow
                  testId="app-settings-guide-auto-start"
                  label={t('guideAutoStartLabel')}
                  caption={t('guideAutoStartCaption')}
                  control={
                    <SegmentSwitch
                      ariaLabel={t('guideAutoStartLabel')}
                      testId="app-settings-guide-auto-start-switch"
                      value={guideAutoStart}
                      onChange={writeGuideAutoStart}
                      options={[
                        { value: true, label: t('guideAutoStartOn') },
                        { value: false, label: t('guideAutoStartOff') },
                      ]}
                    />
                  }
                />
                {replayGuide ? (
                  <SettingsRow
                    testId="app-settings-replay-guide"
                    label={t('replayGuideLabel')}
                    caption={t('replayGuideCaption')}
                    control={
                      <Chip
                        size="lg"
                        tone="secondary"
                        data-testid="app-settings-replay-guide-button"
                        onClick={() => {
                          closePanel(false);
                          replayGuide();
                        }}
                        className="border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] font-medium hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                      >
                        {t('replayGuideAction')}
                      </Chip>
                    }
                  />
                ) : null}
                  </SettingsGroup>
                  </>
                ) : section === 'notify' ? (
                  /*
                   * 「알림」이 자기 칸을 갖는 이유 (2026-08-02, 소유자 지적).
                   *
                   * 이 셋은 어제까지 「화면」 절의 **바닥**에 있었고, 그 자리를
                   * 정당화한 주석은 *"둘 다 화면이 무엇을 말하는가의 설정이다"*
                   * 였다. 그 문장은 맞다 — 그리고 그게 바로 **자기 절이어야 하는
                   * 근거**다. 「화면」의 나머지 여섯(언어 · 뷰 모드 · INDEX 기본 ·
                   * 글리프 세트 · 가이드 둘)은 «지도를 어떻게 그리는가»이고, 이
                   * 셋은 «앱이 나에게 무엇을 알리는가»다.
                   *
                   * 부피로도 그렇다 — 실측: 「화면」이 컨트롤 여섯에 더해 이 셋
                   * (행 3개 + 칩 6개)을 함께 지고 있었다. 「받을 알림」 6칩은 접힌
                   * 세부가 아니라 **주 컨트롤**이라, 한 절의 절반을 다른 주제가
                   * 차지하고 있던 셈이다. 빼내도 「화면」에는 여섯이 남는다.
                   *
                   * 「이어진 것」이 아니라 「보이는 것」에 두는 이유: 「작업 중
                   * 표시」는 문자 그대로 **지도 위에** 뜨고, 알림도 앱이 나에게
                   * 보여주는 것이다. 「이어진 것」은 «밖의 무엇과 연결되는가»의
                   * 자리라 성격이 다르다.
                   */
                  <AgentActivitySettings />
                ) : section === 'background' ? (
                  <>
                  <CanvasBackgroundPicker />
                  {/* 프레임 계기 — 지도가 실제로 몇 프레임을 내주는지 우하단 계기
                      스택에 띄운다. **기본은 꺼짐**이고, 꺼져 있으면 측정 루프도
                      돌지 않는다(성능을 갉아먹는 성능계는 거짓말쟁이다).
                      이 자리인 이유: 「지도」 칸이 캔버스가 어떻게 그려지는지를
                      모아 둔 곳이고, 계기는 그 캔버스 위에 뜬다. */}
                  <SettingsGroup>
                    <SettingsRow
                      testId="app-settings-frame-meter"
                      label={t('frameMeterLabel')}
                      caption={t('frameMeterCaption')}
                      control={
                        <SegmentSwitch
                          ariaLabel={t('frameMeterLabel')}
                          value={frameMeter}
                          onChange={writeFrameMeter}
                          options={[
                            { value: false, label: t('frameMeterOff') },
                            { value: true, label: t('frameMeterOn') },
                          ]}
                          testId="app-settings-frame-meter-switch"
                        />
                      }
                    />
                  </SettingsGroup>
                  </>
                ) : section === 'expand' ? (
                  <ExpandSettings />
                ) : section === 'footprint' ? (
                  <FootprintSettings />
                ) : section === 'workspace' ? (
                    <>
                  <SettingsGroup>
                {showVaultManagement ? (
                  <SettingsRow
                    testId="app-settings-workspace-folder"
                    label={t('workspaceFolderLabel')}
                    caption={
                      localVault.status === 'error'
                        ? (localVault.errorMessage ?? t('workspaceFolderErrorFallback'))
                        : localVault.status === 'permission-needed'
                          ? t('workspaceFolderPermissionCaption')
                          : isLocalVaultLoaded
                            ? localVaultValidationSummary
                              ? t('workspaceFolderDocCountIssues', {
                                  count: localVault.manifest?.docs.length ?? 0,
                                  errors: localVaultValidationSummary.errorCount,
                                  warnings: localVaultValidationSummary.warningCount,
                                })
                              : t('workspaceFolderDocCount', {
                                  count: localVault.manifest?.docs.length ?? 0,
                                })
                            : undefined
                    }
                    captionTone={
                      localVault.status === 'error'
                        ? 'danger'
                        : localVault.status === 'permission-needed'
                          ? 'warning'
                          : 'neutral'
                    }
                    control={
                      <>
                        <span
                          className={cn(
                            'max-w-[10rem] truncate text-body',
                            isLocalVaultLoaded
                              ? 'text-[color:var(--color-text-primary)]'
                              : 'text-[color:var(--color-text-quaternary)]',
                          )}
                        >
                          {isLocalVaultLoaded && localVault.handle
                            ? localVault.handle.name
                            : localVault.status === 'permission-needed'
                              ? (localVault.handle?.name ?? t('workspaceFolderEmpty'))
                              : t('workspaceFolderEmpty')}
                        </span>
                        {localVault.status === 'permission-needed' ? (
                          <Chip
                            size="lg"
                            tone="warning"
                            onClick={() => localVault.requestPermission()}
                            className="shrink-0 border-[color:var(--color-amber-source-a35)] hover:bg-[color:var(--color-amber-source-a12)]"
                          >
                            {t('workspaceFolderPermissionAction')}
                          </Chip>
                        ) : (
                          <Chip
                            size="lg"
                            tone="accentOnTint"
                            onClick={() => void localVault.open()}
                            disabled={vaultBusy}
                            data-testid="app-settings-open-folder"
                            className={INDIGO_ACTION_CHIP}
                          >
                            {vaultBusy
                              ? t('workspaceFolderOpening')
                              : isLocalVaultLoaded || localVault.status === 'error'
                                ? t('workspaceFolderChange')
                                : t('workspaceFolderOpen')}
                          </Chip>
                        )}
                      </>
                    }
                  />
                ) : null}
                {/* #72 — 선택한 vault 의 **절대 경로** + 복사/Finder 열기.
                    B2 병합(5164f68d7)에서 `VaultToolsMenu` 가 삭제되며 이 표면을
                    담당하던 `LocalVaultPicker` 가 아무 데도 마운트되지 않는
                    고아가 됐고, 데스크톱 사용자는 "이 vault 가 디스크 어디에
                    있나" 를 확인할 방법을 잃었다(에이전트에 경로를 붙여넣는
                    고빈도 경로). 설정 시트의 [작업공간] 그룹이 이미 폴더 열기/
                    바꾸기를 담당하므로 여기가 제자리다. 데스크톱에서 경로가
                    실제로 알려질 때만 렌더한다 — 웹에서는 조용히 없다. */}
                {vaultRootPath ? (
                  <SettingsRow
                    testId="app-settings-vault-path"
                    label={tPicker('copyPathTooltip')}
                    caption={vaultRootPath}
                    control={
                      <>
                        <Chip
                          size="lg"
                          data-testid="app-settings-copy-vault-path"
                          onClick={() => void copy(vaultRootPath)}
                          aria-label={tPicker('copyPathAriaLabel', { path: vaultRootPath })}
                          className="shrink-0 hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
                        >
                          {copyState === 'copied'
                            ? tPicker('copyPathCopied')
                            : copyState === 'failed'
                              ? tPicker('copyPathFailed')
                              : tPicker('copyPathTooltip')}
                        </Chip>
                        <Chip
                          size="lg"
                          tone="accentOnTint"
                          data-testid="app-settings-reveal-vault-path"
                          onClick={() => void openTauriVaultInFinder(vaultRootPath)}
                          aria-label={tPicker('revealPathAriaLabel', { path: vaultRootPath })}
                          className={INDIGO_ACTION_CHIP}
                        >
                          {tPicker('revealPathLabel')}
                        </Chip>
                      </>
                    }
                  />
                ) : null}
                {/* 최근 작업공간 — vault 가 안 열려 있을 때만(복구 경로).
                    로드 중엔 "바꾸기"(OS 픽커)가 고빈도 경로다. */}
                {showVaultManagement &&
                !isLocalVaultLoaded &&
                localVault.recentVaults.length > 0
                  ? localVault.recentVaults.map((record) => (
                      <div
                        key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                        className="flex min-h-11 items-center gap-2 px-3 py-1.5"
                        data-testid="app-settings-recent-vault"
                      >
                        {/* 목록의 한 줄 전체가 눌리는 것 = `row`(실측 39).
                            `disabled:opacity-60` 을 지운 이유는 값 층이 이미
                            비활성 어포던스를 싣기 때문이다 — 두 벌이면 하나는
                            언젠가 빠진다. */}
                        <RowButton
                          size="sm"
                          onClick={() => void localVault.openRecent(record)}
                          disabled={vaultBusy}
                          aria-label={t('workspaceRecentOpenAria', { name: record.name })}
                          title={record.desktopRootPath ?? record.name}
                          className="min-w-0 flex-1 hover:bg-[color:var(--color-overlay-2)]"
                        >
                          <HardDrive
                            size={12}
                            aria-hidden
                            className="shrink-0 text-[color:var(--color-indigo-accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-body text-[color:var(--color-text-secondary)]">
                              {record.name}
                            </span>
                            {record.desktopRootPath ? (
                              <span className="block truncate font-mono text-label text-[color:var(--color-text-quaternary)]">
                                {record.desktopRootPath}
                              </span>
                            ) : null}
                          </span>
                        </RowButton>
                        <IconButton
                          size="sm"
                          tone="muted"
                          onClick={() => void localVault.forgetRecent(record)}
                          label={t('workspaceRecentForgetAria', { name: record.name })}
                          className="hover:bg-[color:var(--color-danger-a10)] hover:text-[color:var(--color-status-danger)]"
                        >
                          <X size={12} aria-hidden />
                        </IconButton>
                      </div>
                    ))
                  : null}
                <Link
                  href={vaultNavigationHref}
                  onClick={handleVaultNavigate}
                  className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-[color:var(--color-overlay-2)]"
                >
                  <span className="min-w-0">
                    <span className="block text-body text-[color:var(--color-text-secondary)]">
                      {t('vaultTitle')}
                    </span>
                    <span className="mt-0.5 block break-keep text-label leading-4 text-[color:var(--color-text-quaternary)]">
                      {vaultBody}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-body text-[color:var(--color-indigo-accent)]">
                    {vaultCta}
                    <ChevronRight size={13} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
                  </span>
                </Link>
                  </SettingsGroup>
                    {/*
                      「다른 폴더에서 노드 가져오기」 (2026-08-02, INDEX 바닥에서
                      이관 — 소유자: *"이건 뭐임? 이 문구가 왜 있는거지..? 필요없는건가"*).

                      여기가 맞는 이유: 이 일은 **이 폴더에 무엇이 들어오나**이고,
                      그게 이 절의 주제다. 지도를 읽는 화면에 상시 버튼으로 둘 일이
                      아니다 — 평생 한두 번 쓴다.

                      이름도 바꿨다. 종전 「블록 가져오기」의 「블록」은 이 앱 어디에도
                      정의가 없어서, 처음 보는 사람에게는 무엇을 여는 버튼인지 알 길이
                      없었다.

                      모듈은 자립형이라 vault 가 로드된 상태에서만 스스로 렌더한다.
                    */}
                    <BlockImportModule />
                    </>

                ) : section === 'agent' ? (
                  isLocalVaultLoaded ? (
                    <VaultAgentSetupPanel
                      canEditCurrent={isLocalVaultLoaded}
                      localVault={localVault}
                      serverAvailability={agentServer}
                      validationSummary={localVaultValidationSummary}
                      onOpenWorkflowGuide={handleOpenWorkflowGuide}
                    />
                  ) : (
                    <>
                      <div className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
                        <p className="text-body font-medium text-[color:var(--color-text-secondary)]">
                          {t('agentStatusNoVault')}
                        </p>
                        <p className="mt-1 break-keep text-label leading-4 text-[color:var(--color-text-tertiary)]">
                          {t('agentNoVaultHint')}
                        </p>
                      </div>
                      <div className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
                        <p className="text-body font-medium text-[color:var(--color-text-secondary)]">
                          {t('mcpProofTitle')}
                        </p>
                        <p className="mt-1 break-keep text-label leading-4 text-[color:var(--color-text-tertiary)]">
                          {t('mcpProofBody')}
                        </p>
                        <Chip
                          tone="accentOnTint"
                          onClick={() => void copy(MCP_FIRST_CALLS_PACKET)}
                          className={`mt-2 w-full justify-center font-mono ${INDIGO_ACTION_CHIP} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset`}
                        >
                          {copyState === 'copied' ? (
                            <Check size={12} aria-hidden />
                          ) : (
                            <Copy size={12} aria-hidden />
                          )}
                          {copyState === 'copied' ? t('mcpProofCopied') : t('mcpProofCopy')}
                        </Chip>
                      </div>
                    </>
                  )
                ) : (
                  <AiConnectionPanel
                    connection={aiConnection}
                    vaultRootPath={vaultRootPath}
                    downloadHref={buildRouteFocusHref('/download/')}
                    onDownloadNavigate={() => rememberRouteFocusIntent('/download/')}
                  />
                )}
              </div>
            </div>
          }
        </div>
      </div>,
          document.body,
        )
        : null}
    </details>
  );
}
