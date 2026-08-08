'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  FileText,
  Link2,
  Menu,
  Package,
  PanelLeft,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  OntologyStarterCta,
  VaultConflictError,
  buildOntologyStarterAgentVerifyPrompt,
  useLocalVault,
} from '@/features/docs-vault-local';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { copyText } from '@/shared/lib/copy-text';
import { useTypingShortcuts } from '@/shared/lib/use-typing-shortcut';
import { usePrevious } from '@/shared/lib/use-previous';
import { cn } from '@/shared/lib/cn';
import { useDocumentTitle } from '@/shared/lib/use-document-title';
import {
  createTauriVaultHandle,
  getTauriVaultRootPath,
  isTauriVaultRuntime,
} from '@/shared/lib/tauri-vault-fs';
import {
  Chip,
  IconButton,
  RouteLoadingFallback,
  SimilarNodeWarning,
  Surface,
  controlClass,
  useToast,
} from '@/shared/ui';
import {
  findSimilarNodeByTitle,
  type SimilarNodeMatch,
} from '@/shared/lib/similar-node-title';
// 추출된 page-local helpers.
import { buildDocsVaultPopoutHtml } from '../lib/popout-template';
import { useAdvancedMenu } from '../lib/use-advanced-menu';
import { useDocsVaultPersistence } from '../lib/use-docs-vault-persistence';
import { useDocsVaultScrollSpy } from '../lib/use-scroll-spy';
import { useBackToTop } from '../lib/use-back-to-top';
import { shouldShowOutlineRail } from '../lib/outline-rail';
import { usePaletteState } from '../lib/use-palette-state';
import { replaceDocsVaultUrlState } from '../lib/url-state';
import {
  parseDocsTreeGroup,
  parseDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
} from '@/widgets/docs-vault/lib/tree-order';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  resolveDocsVaultSlugAlias,
  resolveDocsVaultCollection,
  resolveInitialDocsCollection,
  shouldDeferDocsVaultDefaultSelection,
  shouldShowSampleWelcomeNote,
  type DocsVaultCollection,
} from '../lib/docs-vault-collection';
import {
  buildDocsVaultHref,
  buildNewNodeDoc,
  buildOntologyDeeplinkForDoc,
  buildTopologyDeeplinkForDoc,
  deriveOntologyFromVault,
  type VaultManifest,
} from '@/entities/docs-vault';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { DocsVaultBacklinks } from '@/widgets/docs-vault/ui/DocsVaultBacklinks';
import { DocsVaultEditor } from '@/widgets/docs-vault/ui/DocsVaultEditor';
import { DocsVaultUnifiedPalette } from '@/widgets/docs-vault/ui/DocsVaultUnifiedPalette';
import { DocsVaultViewer } from '@/widgets/docs-vault/ui/DocsVaultViewer';
import {
  ONTOLOGY_ATLAS_REPO_BLOB_BASE,
  DOCS_VAULT_REPO_ROOT,
} from '@/widgets/docs-vault';
import type { VaultCommand } from '@/widgets/docs-vault/model/command';
import {
  PINNED_DOCS_STORAGE_PREFIX,
} from '@/widgets/docs-vault/lib/pinned-docs';
import { useDocsBodyIndex } from '@/widgets/docs-vault/lib/use-docs-body-index';
import {
  migrateLegacyRecentDocs,
  pushRecentDoc,
  RECENT_DOCS_STORAGE_PREFIX,
} from '@/widgets/docs-vault/lib/recent-docs';

const subscribeDesktopRuntime = () => () => undefined;
const readDesktopRuntime = () => isTauriVaultRuntime();
const readServerDesktopRuntime = () => false;

/** slug "capabilities/foo" → { dir: "capabilities/", name: "foo" }. 루트
 *  slug 는 dir "". ehead 의 mono 파일명 렌더 전용 pure helper. */
function splitVaultSlugPath(slug: string): { dir: string; name: string } {
  const parts = slug.split('/');
  const name = parts.pop() ?? slug;
  return { dir: parts.length > 0 ? `${parts.join('/')}/` : '', name };
}

// view 파싱 / persistence helpers — 다른 도메인의 view 와 collision 회피용
// `DocsVault*` 네임스페이스. 본 파일 안에선 짧은 별칭으로 alias.
import { DocMetaBar } from "./parts/DocMetaBar";
import { DesktopVaultWelcome } from "./parts/DesktopVaultWelcome";
import {
  DocFrontmatterBlock,
  type DocFrontmatterPatch,
} from "./parts/DocFrontmatterBlock";
import { DocsSidebarBody } from "./parts/DocsSidebarBody";
import { useAgentFilesModel } from "../lib/use-agent-files";
import { useSkillParity } from "../lib/use-skill-parity";
import { buildSkillParityHandoff } from "../lib/skill-parity-handoff";
import type { SkillParityRow } from "../lib/skill-parity";
import { DocReadingOutlineRail } from "./parts/DocReadingOutlineRail";
import { BackToTopButton } from "./parts/BackToTopButton";
import { SampleNotice } from "./parts/SampleNotice";
import { SampleWelcomeNote } from "./parts/SampleWelcomeNote";
import { EmptyState } from "./parts/EmptyState";
import { DocsHeaderTile } from "./parts/DocsHeaderTile";
import { DocsVaultVaultChip } from "./parts/DocsVaultVaultChip";
import { DocsVaultAuditModal } from "./parts/DocsVaultAuditModal";
import { DocsVaultTabStrip } from "./parts/DocsVaultTabStrip";
import { NewDocKindDialog, type NewDocKind } from "./parts/NewDocKindDialog";
import { useOpenDocTabs } from "../lib/use-open-doc-tabs";
import { resolveVaultChipIdentity } from "../lib/vault-chip-identity";
import {
  DOGFOOD_VAULT_PATH,
  DOGFOOD_VAULT_PATH_CANDIDATES,
  hasDogfoodVaultPath,
  resolveDogfoodVaultPath,
} from "../lib/dogfood-vault-path";
import {
  parseDocsVaultView as parseView,
  parseDocsVaultSource,
  isDocsVaultLocalSourceDisabled,
  persistEditorSave,
  readStoredListCollapsed,
  readStoredSource,
  scheduleStateSync,
  shouldShowDogfoodVaultHint,
  shouldShowDesktopVaultWelcome,
  shouldSwitchToDogfoodVault,
  shouldHonorLocalIntent,
  shouldPreferLocalOnLanding,
  storeListCollapsed,
  storeSource,
  type DocsVaultSource as Source,
  type DocsVaultView,
} from "../lib/persistence";
import type { LocalFsHandleRecord } from "@/entities/local-fs-handle";
import { resolveLocaleDisplayName } from '@/shared/lib/locale-display-name';
import {
  buildOntologyInsightsReturnHref,
  parseInsightsReturnMarker,
} from "@/entities/knowledge-graph";
import { resolveStaticVaultSource } from '@/entities/docs-vault';

function DocsVaultContent() {
  const t = useTranslations('docsVault');
  const locale = useLocale();
  const siteT = useTranslations('metadata');
  const tSkillParity = useTranslations('skillParity');
  const searchParams = useSearchParams();
  const querySlug = searchParams?.get('slug') ?? null;
  const queryView = parseView(searchParams?.get('view'));
  const querySource = parseDocsVaultSource(searchParams?.get('source'));
  const querySample =
    searchParams?.get('sample') === 'dogfood' ? 'dogfood' : null;
  const queryDogfood = searchParams?.get('dogfood') ?? null;
  // 목록 순서 — URL 이 진실원. 모르는 값은 에러가 아니라 기본값이다.
  const queryTreeSort = parseDocsTreeSort(searchParams?.get('sort'));
  const queryTreeGroup = parseDocsTreeGroup(searchParams?.get('group'));
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams?.get('via'),
  );
  const insightsReviewId = insightsReturnTab
    ? searchParams?.get('review') ?? null
    : null;
  const projectsListHref = '/projects/';
  // UX 감사 (2026-07): '/' 는 하드 내비게이션 시 vault 복원 전이라 랜딩으로
  // 떨어지는 막다른 길이었다 — 크럼은 항상 지도 허브로 직행.
  const workspaceHref = insightsReturnTab
    ? buildOntologyInsightsReturnHref(insightsReturnTab, insightsReviewId)
    : '/topology';
  const getDocHref = useCallback(
    (slug: string, hash?: string) =>
      buildDocsVaultHref({
        slug,
        hash,
        via: insightsReturnTab
          ? `insights:${insightsReturnTab}`
          : null,
        reviewId: insightsReviewId,
      }),
    [insightsReturnTab, insightsReviewId],
  );
  const getProjectHref = useCallback(
    (slug: string) => `/?p=${encodeURIComponent(slug)}`,
    [],
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(querySlug);
  // 통합 팔레트 하나로 3 단축키 수렴. openWith 가 truthy 이면 open,
  // 값은 초기 쿼리 (`>` 명령, `#` 태그, `` 기본).
  // R12 #26 step — palette state 는 usePaletteState hook 에서 캡슐화.
  const { paletteQuery, setPaletteQuery, paletteOpen } = usePaletteState();
  const [view, setView] = useState<DocsVaultView>(queryView);
  // B2 병합 — 문서함 헤더의 vault 도구 드롭다운(VaultToolsMenu)이 설정 메뉴로
  // 이관되면서 이 latch 는 더 이상 보이는 메뉴를 열지 않는다. 다른 transient
  // surface 들이 여전히 setAdvancedOpen(false) 로 "다른 팝오버 닫기" 계약을
  // poke 하므로 setter 만 유지한다(hook effect 는 open=false 라 무동작). AI agent
  // 도구는 이제 AppSettingsMenu 의 vault / mcpAgents 탭이 소유한다.
  const { setOpen: setAdvancedOpen } = useAdvancedMenu();
  // VaultChip 팝오버(경로·폴더수·local badge·vault 바꾸기) — gear 메뉴와 같은
  // outside-click/Escape 계약을 재사용(useAdvancedMenu 두 번째 소비처).
  const {
    open: vaultChipOpen,
    setOpen: setVaultChipOpen,
    ref: vaultChipMenuRef,
  } = useAdvancedMenu();
  const localIntentAutoOpenRef = useRef(false);
  const [highlightQuery, setHighlightQuery] = useState<string | undefined>(
    undefined,
  );
  const [editing, setEditing] = useState(false);
  // Toss D1 정리(2026-07) — 샘플 진입 안내 노트를 사용자가 실제 문서를
  // 골라(handleSelect) 스스로 닫았는지. `shouldShowSampleWelcomeNote` 가
  // 이 값과 source/딥링크 여부를 합쳐 최종 표시를 판정한다.
  const [sampleWelcomeDismissed, setSampleWelcomeDismissed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [docCollection, setDocCollection] =
    useState<DocsVaultCollection>('guides');
  const [treeSort, setTreeSort] = useState<DocsTreeSort>(queryTreeSort);
  const [treeGroup, setTreeGroup] = useState<DocsTreeGroup>(queryTreeGroup);
  // ?intent=local — landing CTA "내 마크다운 폴더 열기" 의 진입 query.
  // source 초기값을 'local' 로 박아 처음부터 picker UI 가 우측 sidebar 에
  // 보이게 (eval B4 finding — 이전엔 picker 가 4-단계 깊숙이 묻혀 있었음).
  const [source, setSource] = useState<Source>(querySource ?? 'server');
  const [staticSampleOverride, setStaticSampleOverride] = useState<
    'dogfood' | null
  >(querySample);
  // SSR의 안전한 기본값(server)에서 시작한 뒤 저장된 source를 읽는 동안에는
  // 기본 README를 선택하지 않는다. 로컬 딥링크로 앱을 다시 열 때 server
  // manifest가 먼저 렌더되어 직전 문서를 덮어쓰는 레이스를 막는다.
  const [sourcePreferenceHydrated, setSourcePreferenceHydrated] =
    useState(false);
  // #15 설정 위치 통일 — 지도·인사이트·프로젝트와 동일하게 lg+ 는 나브레일
  // 하단 rail-tile 톱니가 설정을 연다. <lg 는 헤더의 chrome-tile 이 담당
  // (레일이 숨는 폭). 둘 다 uncontrolled.
  const navRailSettingsSlot = useMemo(
    () => (
      <AppSettingsMenu
        mode={source === 'local' ? 'local' : 'static'}
        triggerVariant="rail-tile"
      />
    ),
    [source],
  );
  useNavRailSettingsSlot(navRailSettingsSlot);
  const isDesktopRuntime = useSyncExternalStore(
    subscribeDesktopRuntime,
    readDesktopRuntime,
    readServerDesktopRuntime,
  );
  // ?intent=local 진입 시: source 'local' + advanced panel 펼침. SSR 시점엔
  // searchParams 가 stale 일 수 있어 mount 후 직접 window.location 에서 read.
  // landing 의 '내 마크다운 폴더 열기' CTA 가 dead-end 안 되도록.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (querySource) return;
    const intent = new URLSearchParams(window.location.search).get('intent');
    if (shouldHonorLocalIntent(intent, isDesktopRuntime)) {
      window.queueMicrotask(() => {
        localIntentAutoOpenRef.current = true;
        setSource('local');
        setSourcePreferenceHydrated(true);
        setAdvancedOpen(false);
      });
    }
    // mount 1회만 — 사용자가 직접 닫은 후 reload 시 다시 안 열리게.
    // setAdvancedOpen 은 useAdvancedMenu 의 useCallback wrap 결과라 ref-stable
    // 이지만 ESLint 가 destructured method 의 stability 추적 못 해 명시.
  }, [isDesktopRuntime, querySource, setAdvancedOpen]);
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  // 문서 목록 aside 접힘 — design-prescription.md ③-4: 접힘은 width 0(레일
  // 삭제), localStorage persist(작업공간 취향, 세션·새로고침 넘어 유지).
  const [docListCollapsed, setDocListCollapsedState] = useState(false);
  useEffect(() => {
    scheduleStateSync(() => setDocListCollapsedState(readStoredListCollapsed()));
  }, []);
  const toggleDocListCollapsed = useCallback(() => {
    setDocListCollapsedState((collapsed) => {
      const next = !collapsed;
      storeListCollapsed(next);
      return next;
    });
  }, []);
  const localVault = useLocalVault();
  const localVaultStatus = localVault.status;
  // IDB 핸들 복원 **시도가 종결됐는가** — status 와 달리 「아직 모른다」와
  // 「없는 게 확정이다」를 가른다. 랜딩 소스 판정(C5)의 유일한 출발 신호.
  const localVaultRestoreAttempted = localVault.restoreAttempted;
  const openLocalVault = localVault.open;
  const openRecentLocalVault = localVault.openRecent;
  const localVaultRootPath = localVault.handle
    ? getTauriVaultRootPath(localVault.handle) ?? localVault.handle.name ?? null
    : null;
  const toast = useToast();
  const handleOpenDogfoodVault = useCallback(() => {
    const now = Date.now();
    void resolveDogfoodVaultPath().then((rootPath) => {
      const handle = createTauriVaultHandle(rootPath);
      const record: LocalFsHandleRecord = {
        id: rootPath,
        handle,
        desktopRootPath: rootPath,
        name: handle.name,
        createdAt: now,
        lastAccessedAt: now,
      };
      return openRecentLocalVault(record);
    });
  }, [openRecentLocalVault]);
  const localSourceDisabled = isDocsVaultLocalSourceDisabled({
    isDesktopRuntime,
    localVaultStatus: localVault.status,
  });

  useEffect(() => {
    // 경로가 설정 안 된 빌드(공개 배포)에서는 아무 일도 하지 않는다 —
    // 없는 경로를 여는 시늉보다 조용한 편이 정직하다.
    if (
      hasDogfoodVaultPath() &&
      shouldSwitchToDogfoodVault({
        dogfood: queryDogfood,
        isDesktopRuntime,
        source,
        localVaultStatus,
        currentRootPath: localVaultRootPath,
        dogfoodRootPath: DOGFOOD_VAULT_PATH,
        dogfoodRootPaths: DOGFOOD_VAULT_PATH_CANDIDATES,
      })
    ) {
      handleOpenDogfoodVault();
    }
  }, [
    handleOpenDogfoodVault,
    isDesktopRuntime,
    localVaultRootPath,
    localVaultStatus,
    queryDogfood,
    source,
  ]);

  // R11 #16 step 5 — pinned/recent persistence 는 useDocsVaultPersistence hook
  // 에서 캡슐화. setter 들은 view 의 다양한 mutation 사이트 (delete/new-doc 등)
  // 가 직접 호출하므로 외부 노출.
  const {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin: handleTogglePin,
  } = useDocsVaultPersistence({ source, localVault });

  // R11 #14 — vault frontmatter validation 요약. local 모드일 때만 manifest
  // docs 의 parsed frontmatter 를 보고 missing-kind / empty-kind / unknown-kind
  // 검출. error 0 / warning 0 이면 picker 가 chip 안 그림.
  // R11 #16 step 4 — replaceUrlState 는 src/views/docs-vault/lib/url-state.ts
  // 의 module-level 순수 함수로 추출. useCallback wrap 제거 + 호출 사이트
  // 의 deps 에서도 빠짐 (module reference 는 자동 stable).
  const replaceUrlState = replaceDocsVaultUrlState;

  const handleViewChange = useCallback(
    (next: DocsVaultView) => {
      setView(next);
      replaceUrlState({ view: next });
      setAdvancedOpen(false);
    },
    [replaceUrlState, setAdvancedOpen],
  );

  const handleOpenAgentGraphWorkflowGuide = useCallback(() => {
    const slug = 'AGENT-GRAPH-WORKFLOW';
    setSource('server');
    setStaticSampleOverride('dogfood');
    setSelectedSlug(slug);
    setRecentSlugs(pushRecentDoc('server', slug));
    setView('doc');
    replaceUrlState({
      source: 'server',
      sample: 'dogfood',
      slug,
      view: 'doc',
      intent: null,
    });
    setAdvancedOpen(false);
  }, [replaceUrlState, setAdvancedOpen, setRecentSlugs]);

  useEffect(() => {
    migrateLegacyRecentDocs();
    if (querySource) {
      scheduleStateSync(() => {
        setSource(querySource);
        setSourcePreferenceHydrated(true);
      });
      return;
    }
    // ?intent=local 은 설치 앱 안에서만 local source 로 해석한다. hosted
    // browser 에서는 웹을 홍보/다운로드 surface 로 유지하고 로컬 vault 작업을
    // 열지 않는다.
    if (typeof window !== 'undefined') {
      const intent = new URLSearchParams(window.location.search).get('intent');
      if (shouldHonorLocalIntent(intent, isDesktopRuntime)) {
        scheduleStateSync(() => setSourcePreferenceHydrated(true));
        return;
      }
    }
    scheduleStateSync(() => {
      setSource(readStoredSource());
      setSourcePreferenceHydrated(true);
    });
  }, [isDesktopRuntime, querySource]);

  // C5 — when a local vault is live, landing on 문서함 must NOT silently flip to
  // the Sample (`server`) source just because that was the last stored
  // preference. Users read that flip as "내 데이터가 사라졌다". The local vault
  // restores asynchronously from IndexedDB, so we watch for it and, ONCE per
  // mount (before any manual source switch), prefer `local`. Not persisted, so
  // we don't overwrite an intentional stored preference on disk.
  //
  // ⚠️ **랜딩 판정은 복원 시도가 끝나는 순간 단 한 번으로 종결된다** (2026-08-08).
  // 종전엔 「한 번 쏘면 소진」인 원샷 ref 였는데, 그 설계에는 두 구멍이 있었다:
  //
  // ① 저장 취향이 로컬인 부팅에서는 쏠 일이 없어 ref 가 장전된 채 남았고, 그
  //    장전된 한 발이 **사용자의 첫 「샘플」 전환을 그 자리에서 로컬로
  //    되튕겼다**(실기기: 클릭 후 300ms·1800ms 모두 로컬 — 첫 전환이 조용히
  //    무시됨). 랜딩 가드가 사용자의 선택을 잡아먹은 것이다.
  // ② 판정 시점이 열려 있어서, 아래 스코프 정리·「없는 문서」 판정·기본 선택이
  //    「랜딩 전환이 아직 올 수 있는가」를 알 방법이 없었다 — 그래서 부팅의
  //    샘플 창이 「정착」으로 관측됐다(그 결과는 스코프 정리 effect 주석 참조).
  //
  // `restoreAttempted` 는 IDB 복원 시도가 **종결된 뒤에만** 참이 되므로
  // (use-local-vault: load 완료 후 set), 이 시점의 status 는 최종값이고 판정은
  // 한 번으로 충분하다. ref 가 아니라 **상태**인 이유: ref 는 판정이 「전환
  // 없음」으로 끝났을 때 재렌더를 만들지 않아, 이 값에 기대는 아래 소비자들이
  // 영영 깨어나지 못한다.
  const [landingSourceResolved, setLandingSourceResolved] = useState(false);
  useEffect(() => {
    if (landingSourceResolved) return;
    if (!sourcePreferenceHydrated || !localVaultRestoreAttempted) return;
    setLandingSourceResolved(true);
    if (shouldPreferLocalOnLanding(localVaultStatus, source, querySource)) {
      setSource('local');
    }
  }, [
    landingSourceResolved,
    sourcePreferenceHydrated,
    localVaultRestoreAttempted,
    localVaultStatus,
    querySource,
    source,
  ]);
  /**
   * **볼트 스코프가 정착했는가** — 부팅이 끝나 「지금 보이는 볼트」가 사용자의
   * 의도와 일치한다고 말할 수 있는 최초 시점 이후인가. 세 소비자가 같은 술어를
   * 쓴다: 스코프 전환 정리 · 「없는 문서」 배너 · 기본 문서 선택. 셋 중 하나라도
   * 이보다 이른 시점에 판정하면 부팅의 샘플 창을 실재로 오인한다(2026-08-08 —
   * 세 소비자가 각자 다른 술어를 쓰다 딥링크가 걷혔다).
   */
  const vaultScopeSettled =
    sourcePreferenceHydrated &&
    landingSourceResolved &&
    (source === 'server' || localVaultStatus === 'loaded');

  // 문서함 점검 중앙 모달 — design-prescription.md ③-5: 로드마다 모달이 뜨면
  // modality 위반이므로 open 상태는 persist 하지 않고 항상 닫힌 채 시작한다.
  // 토글 자체는 순수 컴포넌트 state 로 세션 내에서만 유지.
  const [contractOpen, setContractOpen] = useState(false);
  const openContract = useCallback(() => {
    // transient 단일 규칙 — 모달을 열면 다른 L2 팝오버(gear·VaultChip·⌘K)
    // 를 닫는다. 문서정보 인스펙터는 사용자가 열어 둔 영속 패널이라 예외
    // (클릭=안전 — implementation-contract.md §4 "모달 계약").
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setContractOpen(true);
  }, [setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  const closeContract = useCallback(() => setContractOpen(false), []);

  // URL 복사 feedback — 최근에 복사된 slug 를 잠깐 기억하고 2초 뒤 reset.
  /**
   * 복사 확인은 **토스트가 진다** (2026-07-28).
   *
   * 종전에는 문서 정보 인스펙터의 체크 아이콘이 유일한 피드백이었다. 그
   * 패널을 걷어내면서 ⌘K 팔레트의 「링크 복사」가 **아무 반응 없는 명령**이
   * 될 뻔했다 — 표면을 지울 때 그 표면에만 살던 피드백이 함께 사라지는 것이
   * 축소의 가장 흔한 사고다.
   *
   * 이 화면이 이미 쓰는 토스트 문법(`handleCopyAgentVerifyPrompt`)을 그대로
   * 따른다 — 실패도 말한다. 클립보드 권한은 조용히 거절될 수 있고, 그때
   * 침묵하면 사용자는 복사됐다고 믿는다.
   */
  const handleCopyUrl = useCallback(
    async (slug: string) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      url.searchParams.set('slug', slug);
      let copied = false;
      try {
        await navigator.clipboard.writeText(url.toString());
        copied = true;
      } catch {
        copied = false;
      }
      toast.show(
        copied ? t('linkCopied') : t('linkCopyFailed'),
        copied ? 'success' : 'error',
      );
    },
    [t, toast],
  );
  const handleCopyAgentVerifyPrompt = useCallback(async () => {
    /*
     * 경로를 아는 빌더를 쓴다. 종전 상수는 폴더를 `.` 로 박아 둬서, 에이전트를
     * **다른 작업 폴더에서 열면 그 `.` 이 남의 폴더를 가리켰다** — 사실과
     * 분리된 복사는 복사가 아니라 오답이다.
     */
    const copied = await copyText(
      buildOntologyStarterAgentVerifyPrompt(
        (localVault.handle ? getTauriVaultRootPath(localVault.handle) : null) ?? '.',
      ),
    );
    toast.show(
      copied ? t('dialog.agentVerifyPromptCopied') : t('dialog.agentVerifyPromptCopyFailed'),
      copied ? 'success' : 'error',
    );
    /*
     * ⚠️ `localVault.handle` 이 의존성에 있어야 한다 (2026-08-06 `exhaustive-deps`
     * 감사). 이 콜백은 **볼트의 절대 경로**를 프롬프트에 박아 복사한다 — 빠지면
     * 폴더를 갈아탄 뒤에도 **옛 볼트 경로**를 복사한다. `DocsVaultEditor` 의
     * `vaultScope` 누락과 같은 부류(닫힌 값이 사용자에게 나가는 자리)다.
     */
  }, [localVault.handle, t, toast]);

  // 스크롤 스파이 — 본문 스크롤 따라 outline 의 active heading 추적.
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocsVaultScrollSpy(selectedSlug, source);
  // 맨 위로 버튼 표시 임계 + 클릭 동작 — 같은 스크롤 컨테이너를 구독하지만
  // 관심사가 달라 스크롤스파이와 분리된 훅.
  const backToTop = useBackToTop(articleScrollRef, selectedSlug);

  // Hosted browser 에서는 local vault 작업을 열지 않는다. 기존 브라우저
  // 세션이 local source 를 저장해 둔 경우에도 promo/read-only surface 로 복귀.
  useEffect(() => {
    // P1b — FSA 미지원일 때만 server 로 복귀 (웹 세션 local 은 이제 유효).
    if (source === 'local' && localVaultStatus === 'unsupported') {
      scheduleStateSync(() => {
        setSource('server');
        storeSource('server');
      });
    }
  }, [source, localVaultStatus]);

  useEffect(() => {
    if (
      source === 'local' &&
      localVaultStatus === 'loaded' &&
      localIntentAutoOpenRef.current
    ) {
      localIntentAutoOpenRef.current = false;
      setAdvancedOpen(false);
    }
  }, [source, localVaultStatus, setAdvancedOpen]);

  const handleSourceChange = useCallback((next: Source) => {
    setSource(next);
    setStaticSampleOverride(null);
    storeSource(next);
    // 소스 전환 시 선택 해제 — 동일 slug 가 다른 볼트에 있을 가능성 적음.
    setSelectedSlug(null);
    setActiveTag(null);
    // 샘플 모드로 (재)진입할 때마다 안내 노트를 다시 보여준다 — 이전 세션에서
    // 닫았더라도 "샘플 vs 내 vault" 전환은 방향 감각을 다시 짚어줄 가치가 있다.
    if (next === 'server') setSampleWelcomeDismissed(false);
    replaceUrlState(
      next === 'server'
        ? { slug: null, view, intent: null, source: null, sample: null }
        : { slug: null, view, source: null, sample: null },
    );
    // Local 로 전환 시 Obsidian 스타일 welcome 화면에서 직접 선택하게 한다.
    // native picker 는 사용자가 "폴더 열기" 를 눌렀을 때만 열린다.
    if (next === 'local' && isDesktopRuntime && localVault.status !== 'loaded') {
      localIntentAutoOpenRef.current = true;
      setAdvancedOpen(false);
    }
  }, [isDesktopRuntime, replaceUrlState, view, localVault.status, setAdvancedOpen]);

  const showDesktopWelcome = shouldShowDesktopVaultWelcome({
    isDesktopRuntime,
    source,
    localVaultStatus,
    hasLocalManifest: Boolean(localVault.manifest),
  });
  const showDogfoodHint = hasDogfoodVaultPath() && shouldShowDogfoodVaultHint({
    dogfood: queryDogfood,
    isDesktopRuntime,
    source,
    hasLocalManifest: Boolean(localVault.manifest),
  });
  const isLocalSourceLoaded =
    source === 'local' &&
    localVault.status === 'loaded' &&
    Boolean(localVault.manifest);

  const vaultChipIdentity = resolveVaultChipIdentity({
    source,
    isLocalSourceLoaded,
    localFolderName: localVault.handle?.name ?? null,
  });


  // 현재 활성 매니페스트 — source 에 따라 분기. 로컬은 loaded 이전엔 null.
  // static 폴백은 사용자가 고른 샘플(도그푸드 / 예시 쇼핑몰)을 따른다 —
  // 번들 매니페스트를 직접 읽으면 "예시 비즈니스 보기" 선택이 문서함에서만
  // 조용히 무시돼 지도와 다른 볼트를 보여주게 된다.
  const preferredStaticVault = useStaticVaultSource();
  const staticVault = staticSampleOverride
    ? resolveStaticVaultSource(staticSampleOverride)
    : preferredStaticVault;
  const manifest: VaultManifest =
    isLocalSourceLoaded && localVault.manifest
      ? localVault.manifest
      : staticVault.manifest;
  const ontologyDerivation = useMemo(
    () => deriveOntologyFromVault(manifest),
    [manifest],
  );

  // Viewer content resolver — 로컬은 파일 핸들로 읽기, 서버는 기본 fetch.
  // R+ 사용자 보고: `?intent=local` 진입 시 source='local' 강제 set 후
  // vault 미선택 (handles 0) 단계에서 viewer 가 fh 없는 slug 를 요청해
  // "no file handle for 'FEATURES'" 에러 노출. handles 가 empty 면 server
  // fetch fallback — 사용자가 picker 클릭 전까지 demo content 노출.
  const getDocContent = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    if (source !== 'local') return undefined;
    if (localVault.fileHandles.size === 0) return undefined;
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const fh = handles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      const file = await fh.getFile();
      return file.text();
    };
  }, [source, localVault.fileHandles]);

  // 로컬 볼트 이미지 resolver — 상대 경로 → blob URL. 서버 볼트엔 undefined.
  const resolveImage = useMemo<
    ((path: string) => Promise<string | null>) | undefined
  >(() => {
    if (source !== 'local') return undefined;
    const handles = localVault.imageHandles;
    return async (path: string) => {
      const fh = handles.get(path);
      if (!fh) return null;
      const file = await fh.getFile();
      return URL.createObjectURL(file);
    };
  }, [source, localVault.imageHandles]);

  // 편집은 로컬 볼트일 때만 (vault handle 이 있어야 disk 에 patch 가능).
  const canEditCurrent = isLocalSourceLoaded;
  const editResolver = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    // 편집용 resolver — 뷰어 resolver 와 동일하지만 명시적 분리.
    if (!canEditCurrent) return undefined;
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const fh = handles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      const file = await fh.getFile();
      return file.text();
    };
  }, [canEditCurrent, localVault.fileHandles]);
  // 편집 종료 조건 — 뷰어로 돌아가거나 source 바뀔 때.
  useEffect(() => {
    if (!canEditCurrent) scheduleStateSync(() => setEditing(false));
  }, [canEditCurrent]);
  useEffect(() => {
    scheduleStateSync(() => setEditing(false));
  }, [selectedSlug]);
  useEffect(() => {
  }, [selectedSlug]);

  const handleDeleteCurrent = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    const slug = selectedSlug;
    const title =
      manifest.docs.find((d) => d.slug === slug)?.title ?? slug;
    if (typeof window === 'undefined') return;
    const ok = window.confirm(t('dialog.deleteConfirm', { title, slug }));
    if (!ok) return;
    try {
      await localVault.deleteDoc(slug);
      // 삭제 성공 — selection/pinned/recent 정리
      setSelectedSlug(null);
      setEditing(false);
      setRecentSlugs((list) => list.filter((s) => s !== slug));
      setPinnedSlugs((list) => {
        const next = list.filter((s) => s !== slug);
        if (next.length !== list.length) {
          // 실제 제거된 경우에만 localStorage 동기화
          try {
            window.localStorage.setItem(
              `${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`,
              JSON.stringify(next),
            );
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    } catch (err) {
      window.alert(
        t('dialog.deleteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, setPinnedSlugs, setRecentSlugs, t]);

  const handleScaffoldOntologyStarter = useCallback(async () => {
    // #73 — 화면 언어로 만든 볼트는 그 언어로 읽히게 한다.
    const result = await localVault.scaffoldOntology(locale);
    setSelectedSlug('README');
    setRecentSlugs(pushRecentDoc(recentKey, 'README'));
    replaceUrlState({ slug: 'README', view: 'doc' });
    setView('doc');
    setAdvancedOpen(false);
    toast.show(
      // #70 — 개념 수와 설정 파일 수를 **따로** 말한다. 예전엔 둘을 합친
      // `created` 라 "시작 문서 8개" 인데 실제 온톨로지 개념은 5개였다.
      t('dialog.ontologyStarterDone', {
        concepts: result.markdownCreated,
        configs: result.agentConfigCreated,
        skipped: result.skipped,
      }),
      'success',
    );
    return result;
  }, [
    locale,
    localVault,
    recentKey,
    replaceUrlState,
    setAdvancedOpen,
    setRecentSlugs,
    t,
    toast,
  ]);

  const handleInsertToc = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    if (typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const headings = doc.headings.filter(
      (h) => h.depth >= 2 && h.depth <= 3,
    );
    if (headings.length === 0) {
      window.alert(t('dialog.noHeadings'));
      return;
    }
    // TOC markdown — h2 는 * indent 없음, h3 는 2-space indent.
    const tocLines = headings.map((h) => {
      const indent = h.depth === 3 ? '  ' : '';
      return `${indent}- [${h.text}](#${h.slug})`;
    });
    const tocBlock = [
      '<!-- toc:start -->',
      `## ${t('dialog.tocHeading')}`,
      '',
      ...tocLines,
      '<!-- toc:end -->',
    ].join('\n');
    const fh = localVault.fileHandles.get(selectedSlug);
    if (!fh) {
      window.alert(t('dialog.notLocalFile'));
      return;
    }
    try {
      const file = await fh.getFile();
      const raw = await file.text();
      // frontmatter 끝 찾기
      let insertAfter = 0;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) insertAfter = end + 4;
        while (raw[insertAfter] === '\n') insertAfter += 1;
      }
      // 기존 toc 블록이 있으면 제거
      const stripped = raw.replace(
        /<!-- toc:start -->[\s\S]*?<!-- toc:end -->\n?/,
        '',
      );
      // stripped 에서 insertAfter 재계산 (지워진 만큼 보정 필요하지만, 보통
      // toc 가 맨 앞이라 그대로 써도 안전)
      const head = stripped.slice(0, insertAfter);
      const body = stripped.slice(insertAfter);
      const next = `${head}${tocBlock}\n\n${body}`;
      await localVault.saveDoc(selectedSlug, next, {
        expectedMtime: file.lastModified,
      });
    } catch (err) {
      window.alert(
        t('dialog.tocFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, t]);

  const handleExportDocHtml = useCallback(() => {
    if (!selectedSlug || typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const article = document.querySelector('[data-docs-viewer]');
    if (!article) {
      window.alert(t('dialog.notRendered'));
      return;
    }
    const html = buildDocsVaultPopoutHtml(doc.title, article.outerHTML);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = doc.slug.replace(/\//g, '-');
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [selectedSlug, manifest, t]);

  const handleRenameCurrent = useCallback(async () => {
    if (!canEditCurrent || !selectedSlug) return;
    if (typeof window === 'undefined') return;
    const input = window.prompt(t('dialog.renamePrompt'), selectedSlug);
    if (!input) return;
    const nextSlug = input
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.md$/, '');
    if (!nextSlug || nextSlug === selectedSlug) return;
    if (manifest.docs.some((d) => d.slug === nextSlug)) {
      window.alert(t('dialog.renameAlreadyExists', { slug: nextSlug }));
      return;
    }
    try {
      await localVault.renameDoc(selectedSlug, nextSlug, {
        rewriteBacklinks: true,
      });
      // selection + recent/pinned 마이그레이트
      const prev = selectedSlug;
      setSelectedSlug(nextSlug);
      setRecentSlugs((list) => {
        const mapped = list.map((s) => (s === prev ? nextSlug : s));
        try {
          window.localStorage.setItem(
            `${RECENT_DOCS_STORAGE_PREFIX}${recentKey}`,
            JSON.stringify(mapped),
          );
        } catch {
          /* ignore */
        }
        return mapped;
      });
      setPinnedSlugs((list) => {
        const mapped = list.map((s) => (s === prev ? nextSlug : s));
        try {
          window.localStorage.setItem(
            `${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`,
            JSON.stringify(mapped),
          );
        } catch {
          /* ignore */
        }
        return mapped;
      });
    } catch (err) {
      window.alert(
        t('dialog.renameFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, setPinnedSlugs, setRecentSlugs, t]);

  // P5c — "새 문서" 는 kind 선택이 먼저 온다(도메인/역량/요소/문서). generic
  // `title:` 템플릿을 없애 "이 vault 의 문서는 노드다" 를 생성 순간에 강제
  // (.qa-scratch/docs-identity-2026-07/verdict.md 더하기③). kind 클릭 →
  // 제목 prompt → buildNewNodeDoc 이 kind 별 폴더 + normalized frontmatter 로
  // 직렬화 — 빌더/토폴로지 새 노드 생성과 동일 함수(entities/docs-vault).
  const [newDocKindDialogOpen, setNewDocKindDialogOpen] = useState(false);
  const handleOpenNewDocDialog = useCallback(() => {
    if (!canEditCurrent) return;
    // transient 단일 규칙 — 이 모달을 열면 다른 L2 팝오버(gear 드롭다운·
    // VaultChip·⌘K)를 닫는다(openContract 와 같은 계약).
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setNewDocKindDialogOpen(true);
  }, [canEditCurrent, setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  // design-council B2 rank4 — GUI 근접 중복 감지. slug 완전 충돌(위 renameAlreadyExists,
  // 손댐 없음)과는 별개의 더 이른 신호 — "제목이 비슷한 kind-일치 노드가 이미
  // 있어요"를 실제 생성 전에 비차단으로 보여준다. 생성 로직 자체는
  // commitCreateDoc 으로 뽑아 "그래도 새로 만들기" 경로와 공유.
  const [pendingSimilarDoc, setPendingSimilarDoc] = useState<{
    slug: string;
    markdown: string;
    match: SimilarNodeMatch;
  } | null>(null);
  const commitCreateDoc = useCallback(
    async (slug: string, markdown: string) => {
      try {
        await localVault.createDoc(slug, markdown);
        // 방금 만든 문서를 자동 선택 + 편집 모드 진입
        setSelectedSlug(slug);
        setRecentSlugs(pushRecentDoc(recentKey, slug));
        setEditing(true);
        replaceUrlState({ slug, view: 'doc' });
      } catch (err) {
        window.alert(
          t('dialog.createFailed', { message: err instanceof Error ? err.message : String(err) }),
        );
      }
    },
    [localVault, recentKey, replaceUrlState, setRecentSlugs, t],
  );
  const handleCreateNewDocWithKind = useCallback(
    async (kind: NewDocKind) => {
      setNewDocKindDialogOpen(false);
      if (typeof window === 'undefined') return;
      const title = window.prompt(t('dialog.newDocTitlePrompt'));
      if (!title || !title.trim()) return;
      let slug: string;
      let markdown: string;
      try {
        ({ slug, markdown } = buildNewNodeDoc({ title, kind }));
      } catch {
        window.alert(t('dialog.invalidSlug'));
        return;
      }
      if (manifest.docs.some((d) => d.slug === slug)) {
        window.alert(t('dialog.renameAlreadyExists', { slug }));
        return;
      }
      const candidates = manifest.docs.map((d) => ({
        slug: d.slug,
        title: d.title,
        kind: String((d.frontmatter as Record<string, unknown> | undefined)?.kind ?? ''),
      }));
      const match = findSimilarNodeByTitle(title, kind, candidates);
      if (match) {
        // 비차단 — 생성을 막지 않는다, 선택지만 보여준다(human-sovereign).
        setPendingSimilarDoc({ slug, markdown, match });
        return;
      }
      await commitCreateDoc(slug, markdown);
    },
    [manifest, commitCreateDoc, t],
  );
  const openPendingSimilarDoc = useCallback(() => {
    if (!pendingSimilarDoc) return;
    const targetSlug = pendingSimilarDoc.match.slug;
    setPendingSimilarDoc(null);
    setSelectedSlug(targetSlug);
    setEditing(false);
    replaceUrlState({ slug: targetSlug, view: 'doc' });
  }, [pendingSimilarDoc, replaceUrlState]);
  const createPendingDocAnyway = useCallback(() => {
    if (!pendingSimilarDoc) return;
    const { slug, markdown } = pendingSimilarDoc;
    setPendingSimilarDoc(null);
    void commitCreateDoc(slug, markdown);
  }, [pendingSimilarDoc, commitCreateDoc]);

  // 마운트 1 회 — 초기 URL 값이 없을 때 localStorage 선호값으로 보강.
  // useRef 로 '실행 여부' 를 가두고 dep 는 컴포넌트 stable 값들만 명시.
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams?.has('view')) setView(queryView);
    });
  }, [searchParams, queryView]);

  // URL ↔ state 동기화: URL 쿼리가 변할 때만 local state 로 흘려보낸다.
  // 반대 방향 (state → URL) 은 user 인터랙션에서 router.push 로 이미 처리.
  // usePrevious 로 직전 URL 값과 비교해 "URL 이 변했을 때" 만 액션 실행.
  // dep array 에 모든 reactive 값 (current+prev URL, 그리고 비교 대상 state) 포함.
  const normalizedQuerySlug = useMemo(
    () => resolveDocsVaultSlugAlias(querySlug, manifest.docs),
    [manifest.docs, querySlug],
  );
  const showSampleWelcomeNote = shouldShowSampleWelcomeNote({
    source,
    normalizedQuerySlug,
    dismissed: sampleWelcomeDismissed,
  });
  const prevQuerySlug = usePrevious(normalizedQuerySlug);
  useEffect(() => {
    if (prevQuerySlug !== normalizedQuerySlug && normalizedQuerySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(normalizedQuerySlug));
    }
  }, [normalizedQuerySlug, prevQuerySlug, selectedSlug]);
  const prevQueryView = usePrevious(queryView);
  useEffect(() => {
    if (prevQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [prevQueryView, queryView, view]);
  // 뒤로가기·공유 링크·에이전트가 넘긴 URL 로 순서가 바뀌면 화면이 따라간다.
  const prevQueryTreeSort = usePrevious(queryTreeSort);
  useEffect(() => {
    if (prevQueryTreeSort !== queryTreeSort && queryTreeSort !== treeSort) {
      scheduleStateSync(() => setTreeSort(queryTreeSort));
    }
  }, [prevQueryTreeSort, queryTreeSort, treeSort]);
  const prevQueryTreeGroup = usePrevious(queryTreeGroup);
  useEffect(() => {
    if (prevQueryTreeGroup !== queryTreeGroup && queryTreeGroup !== treeGroup) {
      scheduleStateSync(() => setTreeGroup(queryTreeGroup));
    }
  }, [prevQueryTreeGroup, queryTreeGroup, treeGroup]);

  const docsBySlug = useMemo(() => {
    const map = new Map<string, (typeof manifest.docs)[number]>();
    for (const d of manifest.docs) map.set(d.slug, d);
    return map;
  }, [manifest]);
  const vaultSlugs = useMemo(
    () => new Set(manifest.docs.map((d) => d.slug)),
    [manifest],
  );
  // frontmatter 참조는 맨슬러그(ai-agent-partner)로 쓰지만 doc.slug 는 경로형
  // (ontology/domains/ai-agent-partner)이다. 맨슬러그·frontmatter.slug·경로
  // 꼬리 세 표기를 실제 네비게이션 slug 로 해소한다(경로형 우선, frontmatter
  // 맨슬러그가 꼬리보다 authoritative). 미해소 참조는 링크로 만들지 않는다.
  const refSlugResolver = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of manifest.docs) map.set(d.slug, d.slug);
    for (const d of manifest.docs) {
      const fmSlug =
        typeof d.frontmatter?.slug === "string" ? d.frontmatter.slug.trim() : "";
      if (fmSlug && !map.has(fmSlug)) map.set(fmSlug, d.slug);
    }
    for (const d of manifest.docs) {
      const tail = d.slug.split("/").pop() ?? "";
      if (tail && !map.has(tail)) map.set(tail, d.slug);
    }
    return map;
  }, [manifest]);
  // 열린 문서 탭 워킹셋 — docs-chrome-round 슬라이스 B. sourceKey 는
  // useDocsVaultPersistence 의 recentKey 를 그대로 재사용해 vault 별 분리
  // 규약을 새로 만들지 않는다('server' | `local:<handle.name>`). 활성
  // 진실원은 여전히 selectedSlug/URL — 이 훅은 열린 목록만 소유한다.
  const {
    tabs: openDocTabs,
    hydrated: openDocTabsHydrated,
    restoredActiveSlug,
    rememberActiveSlug,
    openTab: openDocTab,
    closeTab: closeDocTabInWorkingSet,
  } = useOpenDocTabs({ sourceKey: recentKey, validSlugs: vaultSlugs });
  // URL 딥링크가 없으면 vault별 탭 저장소의 마지막 활성 문서를 한 번 복원한다.
  // sourceKey 전환 직후 기본 README가 먼저 열려 lastActivatedAt을 덮어쓰지
  // 않도록 hydration과 복원 대상을 모두 확인한 뒤 selectedSlug를 옮긴다.
  const [restoredDocTabsSourceKey, setRestoredDocTabsSourceKey] =
    useState<string | null>(null);
  const pendingRestoredActiveSlug =
    openDocTabsHydrated &&
    restoredDocTabsSourceKey !== recentKey &&
    !normalizedQuerySlug
      ? restoredActiveSlug
      : null;
  useEffect(() => {
    if (!openDocTabsHydrated || restoredDocTabsSourceKey === recentKey) {
      return;
    }
    scheduleStateSync(() => {
      setRestoredDocTabsSourceKey(recentKey);
      if (!normalizedQuerySlug && restoredActiveSlug) {
        setSelectedSlug(restoredActiveSlug);
        replaceUrlState({ slug: restoredActiveSlug });
      }
    });
  }, [
    openDocTabsHydrated,
    normalizedQuerySlug,
    recentKey,
    replaceUrlState,
    restoredActiveSlug,
    restoredDocTabsSourceKey,
  ]);
  // 문서 선택 부수효과로 탭을 연다 — sidebar/검색/딥링크 등
  // selectedSlug 를 바꾸는 모든 경로가 여기 한 곳으로 수렴해 각 호출부를
  // 개별 계측할 필요가 없다(handleSelect 자체도 결국 selectedSlug 를 바꾼다).
  useEffect(() => {
    if (!openDocTabsHydrated) return;
    if (
      pendingRestoredActiveSlug &&
      selectedSlug !== pendingRestoredActiveSlug
    ) {
      return;
    }
    if (!selectedSlug) return;
    const doc = docsBySlug.get(selectedSlug);
    if (!doc) return;
    openDocTab(selectedSlug, resolveLocaleDisplayName(doc.frontmatter, locale, doc.title));
  }, [
    selectedSlug,
    docsBySlug,
    locale,
    openDocTab,
    openDocTabsHydrated,
    pendingRestoredActiveSlug,
  ]);
  const selectedDoc = selectedSlug ? (docsBySlug.get(selectedSlug) ?? null) : null;
  /**
   * URL 이 요청한 문서가 **이 문서함에 없다** — 한 번만 말하고 사라진다.
   *
   * ## 왜 파생값이 아니라 상태인가 (2026-08-01 수리)
   *
   * 처음엔 `normalizedQuerySlug` 에서 바로 파생했다. 그랬더니 **볼 때마다
   * 다시 떴다** — 소유자가 앱에서 잡았다(*"문서함에 이건 왜나오지?"*). 원인은
   * 배너가 아니라 **URL 이 계속 거짓말한 것**이다: 못 찾은 슬러그가 주소에
   * 그대로 남아 있어서, 문서함에 들어올 때마다 같은 판정이 다시 참이 됐다.
   * 게다가 그 슬러그를 요청한 사람은 아무도 없었다 — 다른 볼트를 보던 시절의
   * 잔재가 주소에 눌어붙어 있었을 뿐이다.
   *
   * 그래서 둘을 같이 고친다:
   *
   * 1. **주소를 실제 연 문서로 바로잡는다**(아래 기본 선택 effect). 종전엔
   *    `?slug=` 가 있으면 URL 을 일부러 안 고쳤는데, 그 배려가 곧 거짓말의
   *    수명이었다.
   * 2. **배너는 그 순간을 붙잡아 상태로 들고 있는다.** 주소가 고쳐지면 파생
   *    조건은 즉시 거짓이 되므로, 파생값이면 사람이 읽기도 전에 사라진다.
   *
   * 결과: 진짜 깨진 딥링크·핸드오프 링크에는 **한 번** 뜨고, 낡은 주소로는
   * 다시 뜨지 않는다. 사용자가 문서를 직접 고르면 닫힌다.
   */
  const [missingQuerySlug, setMissingQuerySlug] = useState<string | null>(null);
  useEffect(() => {
    if (!normalizedQuerySlug || docsBySlug.size === 0) return;
    if (docsBySlug.has(normalizedQuerySlug)) {
      // 문서가 나타났으면 잡아 둔 판정을 걷는다 — 부팅 중 샘플 창에서 내렸던
      // 「없다」가 로컬 볼트 도착으로 거짓이 된 경우다(2026-08-08).
      setMissingQuerySlug((prev) => (prev === normalizedQuerySlug ? null : prev));
      return;
    }
    // 볼트가 아직 안 실린 동안(`docsBySlug` 가 빈 동안)과 부팅이 아직 어느
    // 볼트를 보여줄지 못 정한 동안(`vaultScopeSettled` 전)은 "없다" 가 아니라
    // "아직 모른다" 다 — 그 구간에서 말하면 깜빡임이거나, 더 나쁘게는 로컬
    // 볼트에 실재하는 문서를 샘플 매니페스트 기준으로 "없다" 고 선고하는
    // 오판이 된다(2026-08-08 실기기 — 그 선고가 딥링크를 걷어냈다).
    if (!vaultScopeSettled) return;
    setMissingQuerySlug((prev) => prev ?? normalizedQuerySlug);
  }, [normalizedQuerySlug, docsBySlug, vaultScopeSettled]);

  /**
   * **볼트가 바뀌면 볼트 전용 주소 상태를 걷어낸다** — 이게 근본 수리다.
   *
   * `?slug=` 는 **한 볼트 안에서만 뜻이 있는 이름**인데 주소는 볼트를 모른다.
   * 그래서 사용자가 폴더를 바꾸거나 샘플↔내 볼트를 오가면 그 이름은 의미를
   * 잃는데, 아무도 걷어내지 않아 주소에 눌어붙었다. 그 다음부터 문서함은
   * 들어올 때마다 "요청한 문서가 없다" 를 다시 판정했고 — 정작 **그것을 요청한
   * 사람은 아무도 없었다.**
   *
   * 배너를 조건부로 만드는 것은 증상 치료다(그 판정이 계속 참인 채로 남는다).
   * 이름이 의미를 잃는 **그 순간에 지우는 것**이 원인 치료다. 그러면:
   *
   * - 낡은 슬러그가 볼트 경계를 넘어 살아남지 못한다 → 소음이 구조적으로 0
   * - 배너는 제 일만 한다 — **밖에서 온 링크**(딥링크·에이전트 핸드오프·북마크)가
   *   진짜로 깨졌을 때 한 번
   * - 주소가 열려 있지 않은 문서를 가리키지 않는다
   *
   * 첫 마운트는 건너뛴다 — 그때의 `?slug=` 는 잔재가 아니라 **누군가 준 것**이다.
   */
  /**
   * ⚠️ **`recentKey` 는 이 판정의 범위가 아니다.** 그 키는 저장 namespace 용이라
   * 샘플 둘(도그푸드 · 예시 쇼핑몰)을 `'server'` 하나로 뭉뚱그린다. 그대로 쓰면
   * **샘플↔샘플 전환이 범위 변화로 안 잡혀서**, 고치려던 그 소음이 그 축에만
   * 그대로 남는다(2026-08-01 사냥에서 지적됐고 재현됐다).
   *
   * 그렇다고 `recentKey` 자체를 넓히지는 않는다 — 그건 핀·최근·열린 탭의 저장
   * 자리를 옮기는 일이라, 고치는 대신 사용자의 기존 목록을 고아로 만든다.
   * 정리 판정에만 정확한 범위를 쓴다.
   */
  const vaultScope = source === 'local' ? recentKey : `sample:${staticVault.source}`;
  /**
   * ⚠️ **정착(settle) 전의 스코프 변화는 볼트 전환이 아니라 부팅이다** (2026-08-08).
   *
   * 이 정리는 「사용자가 볼트를 바꾼 순간」에만 돌아야 하는데, 콜드 로드에서
   * 저장된 소스 취향이 hydration 되며 `sample:… → local:…` 로 넘어가는 것도
   * 스코프 변화로 잡혔다. 그래서 **방금 누군가 준 `?slug=` 딥링크가 부팅
   * 도중에 잔재로 오인되어 지워졌고**, 그 뒤 탭 복원이 「URL 없음」을 보고
   * 마지막에 본 문서를 앉히며 주소까지 덮었다 — 요청한 문서 대신 남의 마지막
   * 화면이 열리는, 에이전트 핸드오프 링크의 급소다(2026-08-08 실사용 검수:
   * `?slug=domains/typed-api` 요청 → `capabilities/temporal-graph` 로 덮임).
   *
   * 바로 위 주석이 스스로 *"첫 마운트의 `?slug=` 는 잔재가 아니라 누군가 준
   * 것"* 이라 적어 뒀는데, 그 보호가 첫 실행(run)에만 걸리고 **부팅 중
   * hydration 전환**에는 안 닿았던 것이다. 그래서 기준선을 「첫 실행」이 아니라
   * **「정착된 첫 스코프」**로 옮긴다 — 정착 후의 스코프 변화만이 진짜 볼트
   * 전환이다.
   *
   * **2026-08-08 2차 검수 — 그 「정착」의 정의가 틀려서 같은 사고가 남아
   * 있었다.** 첫 수리의 술어는 `source === 'server'` 를 즉시 정착으로 쳤는데,
   * 저장 취향이 샘플인 부팅에서는 로컬 볼트 복원이 끝나는 순간 랜딩 자동
   * 전환(C5)이 소스를 뒤집는다 — 즉 그 「서버 정착」은 몇백 ms 짜리 가짜였고,
   * 뒤집히는 순간이 다시 「볼트 전환」으로 읽혀 딥링크가 걷혔다. 지금의
   * `vaultScopeSettled`(위에서 정의)는 **랜딩 판정 종결**(`landingSourceResolved`)
   * 을 포함하므로 그 창이 정착으로 관측되지 않는다. e2e:
   * `docs-deeplink.spec.ts` 「샘플을 먼저 쓰던 프로필…」이 replaceState 전수
   * 기록으로 「딥링크를 잃은 호출 0건」까지 잰다.
   */
  const vaultScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vaultScopeSettled) return;
    const previous = vaultScopeRef.current;
    vaultScopeRef.current = vaultScope;
    if (previous === null || previous === vaultScope) return;
    setMissingQuerySlug(null);
    replaceUrlState({ slug: null });
  }, [vaultScope, vaultScopeSettled, replaceUrlState]);
  // 트리·탭·검색·지도가 한 문서를 같은 이름으로 부른다. 파일 경로는 바로
  // 아랫줄 caption 이 계속 보여주므로 파일 정체성은 잃지 않는다.
  const selectedDocDisplayTitle = selectedDoc
    ? resolveLocaleDisplayName(selectedDoc.frontmatter, locale, selectedDoc.title)
    : "";
  // 이 문서를 지도에서 열 **주소가 있는가**. null 이면 그래프에 자리가 없는
  // 문서이고, 그때는 「지도에서 열기」를 렌더하지 않는다(죽은 CTA 0).
  // 같은 판정을 `DocMetaBar` 도 쓴다 — 두 자리가 서로 다른 말을 하지 않게
  // 판정 함수를 공유한다.
  const mapDeeplinkForSelectedDoc = selectedDoc
    ? buildTopologyDeeplinkForDoc(selectedDoc) ?? buildOntologyDeeplinkForDoc(selectedDoc)
    : null;
  // P5b — frontmatter 판정 액션의 domain select 후보. vault 의 `kind: domain`
  // 문서만 — capability/element 를 잘못된 domain 에 지정했을 때 raw YAML
  // 손편집 없이 그 자리에서 고치는 게 목적(verdict 더하기①).
  const domainOptions = useMemo(
    () =>
      manifest.docs
        .filter((d) => d.frontmatter?.kind === 'domain')
        .map((d) => ({
          slug: d.slug,
          title:
            (typeof d.frontmatter?.title === 'string' && d.frontmatter.title.trim()) ||
            d.title,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [manifest],
  );
  const handlePatchDocFrontmatter = useCallback(
    async (patch: DocFrontmatterPatch) => {
      if (!selectedDoc) return;
      try {
        // DocFrontmatterPatch 는 kind/domain/title 만 갖는 좁은 shape —
        // updateFrontmatter 의 index-signature 파라미터와 구조적으로 호환
        // (모든 값이 string | null) 되지만 TS 는 index signature 부재를
        // 별도로 요구해 cast 필요.
        await localVault.updateFrontmatter(
          selectedDoc.slug,
          patch as Record<string, string | null>,
          { expectedMtime: selectedDoc.mtime },
        );
      } catch (err) {
        if (err instanceof VaultConflictError) {
          toast.show(t('dialog.vaultConflict'), 'error');
        }
        throw err;
      }
    },
    [selectedDoc, localVault, toast, t],
  );
  // 클라이언트 사이드 동적 타이틀 — 정적 export metadata 는 slug 단위로 미리
  // 빌드할 수 없으므로(vault 는 사용자 로컬 폴더) 선택된 문서 타이틀을 여기서
  // 반영. layout.tsx 의 서버 템플릿(`%s · siteName`)과 동일한 구성.
  useDocumentTitle(
    selectedDoc ? `${selectedDocDisplayTitle} · ${siteT('siteName')}` : null,
  );
  const collectionDocs = useMemo(
    () => filterDocsByCollection(manifest.docs, docCollection),
    [docCollection, manifest.docs],
  );
  const collectionTags = useMemo(
    () => buildTagIndexForDocs(collectionDocs),
    [collectionDocs],
  );
  const collectionTagCounts = useMemo(
    () =>
      Object.entries(collectionTags).map(([tag, slugs]) => ({
        tag,
        count: slugs.length,
      })),
    [collectionTags],
  );
  const collectionManifest = useMemo<VaultManifest>(
    () => ({
      ...manifest,
      docs: collectionDocs,
      tags: collectionTags,
    }),
    [collectionDocs, collectionTags, manifest],
  );
  const collectionDocSlugs = useMemo(
    () => new Set(collectionDocs.map((doc) => doc.slug)),
    [collectionDocs],
  );
  // 팔레트 본문 전문 검색 인덱스 — 본문 소스는 viewer 와 동일 (로컬:
  // FileSystemFileHandle lazy read, static: 번들 content.json + fetch).
  // mtime 키 캐시라 폴링 diff 재빌드 후엔 변경 문서만 재독한다.
  const { bodyIndex: docsBodyIndex, indexing: docsBodyIndexing } =
    useDocsBodyIndex({ docs: collectionDocs, getDocContent });
  const collectionCounts = useMemo<Record<DocsVaultCollection, number>>(
    () => ({
      all: manifest.docs.length,
      guides: filterDocsByCollection(manifest.docs, 'guides').length,
      ontology: filterDocsByCollection(manifest.docs, 'ontology').length,
    }),
    [manifest.docs],
  );
  const collectionPinnedSlugs = useMemo(
    () => pinnedSlugs.filter((slug) => collectionDocSlugs.has(slug)),
    [collectionDocSlugs, pinnedSlugs],
  );
  const collectionRecentSlugs = useMemo(
    () => recentSlugs.filter((slug) => collectionDocSlugs.has(slug)),
    [collectionDocSlugs, recentSlugs],
  );

  // 첫 화면이 **자기가 가진 것을 보여준다** (2026-07-28 실측 결함 — 볼트 필은
  // "문서 31개" 라 말하는데 목록은 0건이었다). 컬렉션 기본값은 문서가 오기
  // 전에 정해지므로, 문서가 처음 도착한 프레임에서 한 번만 재해석한다.
  //
  // **한 번만**인 것이 계약이다 — 매번 돌면 사용자가 일부러 고른 0건 컬렉션을
  // 화면이 되돌려 버린다(칩이 건수를 보여주므로 그 클릭은 의도적이다).
  const initialCollectionResolvedRef = useRef(false);
  useEffect(() => {
    if (initialCollectionResolvedRef.current) return;
    if (manifest.docs.length === 0) return;
    initialCollectionResolvedRef.current = true;
    const resolved = resolveInitialDocsCollection(manifest.docs);
    if (resolved !== docCollection) {
      scheduleStateSync(() => setDocCollection(resolved));
    }
  }, [docCollection, manifest.docs]);

  useEffect(() => {
    if (!selectedDoc) return;
    // '전체 문서' 뷰에서는 문서를 골라도 컬렉션을 좁히지 않는다 — 전체를
    // 보겠다는 사용자 의도를 문서 선택이 되돌리면 안 된다.
    if (docCollection === 'all') return;
    const nextCollection = resolveDocsVaultCollection(selectedDoc);
    if (nextCollection !== docCollection) {
      scheduleStateSync(() => setDocCollection(nextCollection));
    }
  }, [docCollection, selectedDoc]);

  const pickDefaultDocForCollection = useCallback(
    (collection: DocsVaultCollection): string | null => {
      const docs = filterDocsByCollection(manifest.docs, collection);
      const slugs = new Set(docs.map((doc) => doc.slug));
      const candidates = [
        ...pinnedSlugs,
        ...recentSlugs,
        collection !== 'ontology' ? 'README' : null,
        collection !== 'ontology' ? 'FEATURES' : null,
        collection !== 'ontology' ? 'PRODUCT-DIRECTION' : null,
        collection !== 'ontology' ? 'ARCHITECTURE' : null,
        docs[0]?.slug,
      ];
      return (
        candidates.find((slug): slug is string => typeof slug === 'string' && slugs.has(slug)) ??
        null
      );
    },
    [manifest.docs, pinnedSlugs, recentSlugs],
  );

  const handleTreeSortChange = useCallback(
    (next: DocsTreeSort) => {
      setTreeSort(next);
      replaceUrlState({ sort: next });
    },
    [replaceUrlState],
  );

  const handleTreeGroupChange = useCallback(
    (next: DocsTreeGroup) => {
      setTreeGroup(next);
      replaceUrlState({ group: next });
    },
    [replaceUrlState],
  );

  const handleCollectionChange = useCallback(
    (next: DocsVaultCollection) => {
      setDocCollection(next);
      setActiveTag(null);
      const nextSlugs = new Set(
        filterDocsByCollection(manifest.docs, next).map((doc) => doc.slug),
      );
      if (selectedSlug && nextSlugs.has(selectedSlug)) return;

      const nextSlug = pickDefaultDocForCollection(next);
      setSelectedSlug(nextSlug);
      replaceUrlState({ slug: nextSlug });
    },
    [manifest.docs, pickDefaultDocForCollection, replaceUrlState, selectedSlug],
  );

  useEffect(() => {
    if (!openDocTabsHydrated || pendingRestoredActiveSlug) return;
    if (selectedSlug && docsBySlug.has(selectedSlug)) return;
    if (
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug,
        selectedSlug,
        // 부팅이 어느 볼트를 보여줄지 정하기 전(랜딩 판정 미종결)에는 기본
        // 선택도 미룬다 — 샘플 창에서 고른 기본값이 곧 도착할 로컬 볼트의
        // 딥링크를 덮는다(2026-08-08). 세 소비자가 같은 술어를 쓴다.
        selectionReady: vaultScopeSettled,
      })
    ) {
      return;
    }

    // 첫 진입 default — `docs/README.md` 가 vault 에 없는 경우가 default
    // (`AGENTS.md` 자체가 canonical 가이드). 그래서 ARCHITECTURE 가 fallback
    // 으로 잡혀왔는데, 처음 들어온 사용자에게 *지금 쓸 수 있는 기능 목록*
    // (FEATURES) 이 ARCHITECTURE 보다 첫인상 가치가 크다. AGENTS.md 가
    // "features users can use right now, see docs/FEATURES.md" 로 직접 지목.
    const candidates = [
      ...collectionPinnedSlugs,
      ...collectionRecentSlugs,
      'README',
      'FEATURES',
      'PRODUCT-DIRECTION',
      'ARCHITECTURE',
      collectionDocs[0]?.slug,
    ];
    const nextSlug = candidates.find(
      (slug): slug is string => Boolean(slug) && collectionDocSlugs.has(slug),
    );
    if (!nextSlug) return;

    scheduleStateSync(() => {
      setSelectedSlug(nextSlug);
      /**
       * **주소는 열려 있는 문서를 가리킨다** (2026-08-01 수리).
       *
       * 종전엔 `?slug=` 가 있으면 URL 을 일부러 안 고쳤다. 요청을 보존하려는
       * 배려였는데, 요청한 문서를 열지 **못한** 경우에는 그 배려가 곧
       * **거짓말의 수명**이었다 — 화면은 A 를 열어 놓고 주소는 계속 B 를
       * 가리킨다. 그 주소를 복사해 공유하면 받는 사람도 같은 자리로 온다.
       */
      replaceUrlState({ slug: nextSlug });
    });
  }, [collectionDocSlugs, collectionDocs, collectionPinnedSlugs, collectionRecentSlugs, docsBySlug, normalizedQuerySlug, openDocTabsHydrated, pendingRestoredActiveSlug, replaceUrlState, selectedSlug, vaultScopeSettled]);

  const handleSelect = useCallback(
    (slug: string, query?: string) => {
      rememberActiveSlug(slug);
      setSelectedSlug(slug);
      setHighlightQuery(query);
      setRecentSlugs(pushRecentDoc(recentKey, slug));
      replaceUrlState({ slug });
      // 사용자가 직접 문서를 골랐으면 샘플 진입 안내 노트를 다시 밀어붙이지
      // 않는다(기본 선택 effect 는 이 함수를 거치지 않아 영향받지 않음).
      setSampleWelcomeDismissed(true);
    },
    [recentKey, rememberActiveSlug, replaceUrlState, setRecentSlugs],
  );

  // 탭 × 닫기 — implementation-contract.md §3 "close 규칙": 활성 탭을 닫으면
  // 인접 탭(왼쪽 우선, 없으면 오른쪽)으로 이동. 마지막 남은 탭을 닫으면 목록
  // 첫 문서 또는 README 로 폴백(기존 default-selection 후보 우선순위와
  // 동형 — README 를 첫 문서보다 우선한다).
  const handleCloseDocTab = useCallback(
    (slug: string) => {
      const nextActiveSlug = closeDocTabInWorkingSet(slug, selectedSlug);
      if (nextActiveSlug) {
        handleSelect(nextActiveSlug);
        return;
      }
      const fallbackSlug = collectionDocSlugs.has('README')
        ? 'README'
        : collectionDocs[0]?.slug;
      if (fallbackSlug) {
        handleSelect(fallbackSlug);
      } else {
        setSelectedSlug(null);
        replaceUrlState({ slug: null });
      }
    },
    [
      closeDocTabInWorkingSet,
      selectedSlug,
      handleSelect,
      collectionDocSlugs,
      collectionDocs,
      replaceUrlState,
    ],
  );

  useTypingShortcuts([
    {
      combo: { key: 'k', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'o', meta: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '' : null)),
    },
    {
      combo: { key: 'p', meta: true, shift: true },
      onFire: () => setPaletteQuery((q) => (q === null ? '> ' : null)),
    },
    {
      combo: { key: '/' },
      disabled: paletteOpen,
      onFire: () => setPaletteQuery(''),
    },
  ]);

  const backlinksDetail = selectedSlug
    ? (manifest.backlinksDetail?.[selectedSlug] ?? [])
    : [];
  const outlineHeadings = useMemo(() => {
    const headings =
      selectedDoc?.headings.filter((h) => h.depth >= 2 && h.depth <= 3) ?? [];
    const totals = new Map<string, number>();
    for (const heading of headings) {
      totals.set(heading.text, (totals.get(heading.text) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return headings.map((heading) => {
      const occurrence = (seen.get(heading.text) ?? 0) + 1;
      seen.set(heading.text, occurrence);
      return {
        ...heading,
        duplicate: (totals.get(heading.text) ?? 0) > 1,
        occurrence,
      };
    });
  }, [selectedDoc]);
  // 긴 문서(heading ≥ 임계)에서만 좌측 빈 띠에 상시 목차 레일 — 짧은 문서에서는
  // 노이즈가 되므로 표시하지 않는다 (po-pass.md §4 상태 계약).
  const showOutlineRail = shouldShowOutlineRail(outlineHeadings.length);
  // 목차 클릭 시 스크롤 점프 — 레일(DocReadingOutlineRail)과 인스펙터
  // (DocsVaultDocOutlinePanel) 양쪽이 같은 동작을 공유하므로 한 곳에서 정의.
  const handleHeadingNavigate = useCallback(
    (slug: string) => {
      document
        .getElementById(slug)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveHeadingSlug(slug);
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${window.location.search}#${slug}`,
        );
      }
    },
    [setActiveHeadingSlug],
  );

  // 전체 명령 목록 — ⌘⇧P 팔레트용. selection/source/editing 등에 따라
  // visible 동적 계산.
  const commands = useMemo<VaultCommand[]>(() => {
    const selectedDocExists = selectedSlug !== null;
    return [
      {
        id: 'palette',
        label: t('commands.openPalette'),
        icon: <Search size={ICON_SIZE.sm} aria-hidden />,
        shortcut: '⌘K',
        onRun: () => setPaletteQuery(''),
      },
      {
        id: 'palette-tags',
        label: t('commands.findTags'),
        icon: '#',
        shortcut: '⌘K #',
        onRun: () => setPaletteQuery('#'),
      },
      {
        id: 'view-doc',
        label: t('commands.viewDoc'),
        icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
        visible: view !== 'doc',
        onRun: () => handleViewChange('doc'),
      },
      {
        id: 'source-server',
        label: t('commands.sourceServer'),
        icon: <Package size={ICON_SIZE.sm} aria-hidden />,
        visible: source !== 'server',
        onRun: () => handleSourceChange('server'),
      },
      {
        id: 'source-local',
        label: t('commands.sourceLocal'),
        icon: <Save size={ICON_SIZE.sm} aria-hidden />,
        visible: source !== 'local' && localVault.isSupported,
        onRun: () => handleSourceChange('local'),
      },
      {
        id: 'pin-toggle',
        label: pinnedSet.has(selectedSlug ?? '') ? t('commands.unpinDoc') : t('commands.pinDoc'),
        icon: <Star size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists,
        onRun: () => selectedSlug && handleTogglePin(selectedSlug),
      },
      {
        id: 'copy-url',
        label: t('commands.copyUrl'),
        icon: <Link2 size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists,
        onRun: () => selectedSlug && void handleCopyUrl(selectedSlug),
      },
      {
        id: 'copy-agent-verify-prompt',
        label: t('commands.copyAgentVerifyPrompt'),
        icon: <Bot size={ICON_SIZE.sm} aria-hidden />,
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void handleCopyAgentVerifyPrompt(),
      },
      {
        id: 'print',
        label: t('commands.print'),
        icon: <Printer size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists && view === 'doc',
        onRun: () => {
          if (typeof window !== 'undefined') window.print();
        },
      },
      {
        id: 'edit',
        label: t('commands.edit'),
        icon: <Pencil size={ICON_SIZE.sm} aria-hidden />,
        visible: canEditCurrent && selectedDocExists && !editing,
        onRun: () => setEditing(true),
      },
      {
        id: 'new-doc',
        label: t('commands.newDoc'),
        icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
        visible: canEditCurrent,
        onRun: () => handleOpenNewDocDialog(),
      },
      {
        id: 'rename',
        label: t('commands.rename'),
        icon: '✎',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleRenameCurrent(),
      },
      {
        id: 'insert-toc',
        label: t('commands.insertToc'),
        icon: '≡',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleInsertToc(),
      },
      {
        id: 'delete',
        label: t('commands.deleteDoc'),
        icon: <Trash2 size={ICON_SIZE.sm} aria-hidden />,
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleDeleteCurrent(),
      },
      {
        id: 'export-doc-html',
        label: t('commands.exportDocHtml'),
        icon: <FileText size={ICON_SIZE.sm} aria-hidden />,
        visible: selectedDocExists && view === 'doc',
        onRun: () => handleExportDocHtml(),
      },
      {
        id: 'local-refresh',
        label: t('commands.localRefresh'),
        icon: '↻',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void localVault.refresh(),
      },
      {
        id: 'local-close',
        label: t('commands.localClose'),
        icon: '✖',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void localVault.close(),
      },
      {
        id: 'tag-clear',
        label: t('commands.clearTagFilter'),
        icon: '#',
        visible: activeTag !== null,
        onRun: () => setActiveTag(null),
      },
      {
        id: 'projects-list',
        label: t('commands.projectsList'),
        icon: '←',
        onRun: () => {
          if (typeof window !== 'undefined')
            window.location.href = projectsListHref;
        },
      },
    ];
  }, [
    view,
    source,
    selectedSlug,
    pinnedSet,
    canEditCurrent,
    editing,
    activeTag,
    projectsListHref,
    localVault,
    handleCopyUrl,
    handleCopyAgentVerifyPrompt,
    handleOpenNewDocDialog,
    handleDeleteCurrent,
    handleExportDocHtml,
    handleInsertToc,
    handleViewChange,
    handleRenameCurrent,
    handleSourceChange,
    handleTogglePin,
    setPaletteQuery,
    t,
  ]);

  // 좌측 사이드바 내부 내용 — aside 와 mobile drawer 양쪽에서 재사용.
  // onSelect 는 caller 가 mobile drawer 닫기와 wrapping.
  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setSourceTreeOpen(false);
    },
    [handleSelect],
  );
  // "에이전트 파일" 그룹 — 전체 manifest 기준(컬렉션 필터와 무관). vault 가
  // repo 루트를 포함할 때만 non-null (hook 내부 게이트), 읽기 전용 감지.
  const agentFiles = useAgentFilesModel(manifest, localVault.fileHandles);
  /**
   * 스킬 사본 일치 — **절대 경로가 있을 때만.** `localVaultRootPath` 는 웹에서
   * 핸들 이름으로 대체되므로 그걸 쓰면 웹에서 존재하지 않는 경로로 브리지를
   * 부르게 된다. 여기서는 진짜 절대 경로만 받는다.
   */
  const skillParityRoot =
    isDesktopRuntime && localVault.handle
      ? getTauriVaultRootPath(localVault.handle) ?? null
      : null;
  const skillParity = useSkillParity(skillParityRoot);
  const handleCopySkillParityHandoff = useCallback(
    (rows: SkillParityRow[]) => {
      if (!skillParityRoot) return;
      const text = buildSkillParityHandoff(rows, skillParityRoot);
      if (!text) return;
      void navigator.clipboard
        .writeText(text)
        .then(() => toast.show(tSkillParity("copied"), "success"))
        // 침묵은 성공처럼 읽힌다 — 실패도 말한다(#759 에서 배운 것).
        .catch(() => toast.show(tSkillParity("copyFailed"), "error"));
    },
    [toast, tSkillParity, skillParityRoot],
  );
  const handleVaultPillSwap = useCallback(() => {
    if (source !== 'local' && isDesktopRuntime) {
      handleSourceChange('local');
      return;
    }
    void openLocalVault();
  }, [source, isDesktopRuntime, handleSourceChange, openLocalVault]);

  const sidebarBody = (
    <DocsSidebarBody
      pinnedSlugs={collectionPinnedSlugs}
      recentSlugs={collectionRecentSlugs}
      selectedSlug={selectedSlug}
      docsBySlug={docsBySlug}
      activeTag={activeTag}
      manifest={collectionManifest}
      collection={docCollection}
      collectionCounts={collectionCounts}
      visibleDocSlugs={collectionDocSlugs}
      onSelect={handleSelectFromSidebar}
      onCollectionChange={handleCollectionChange}
      onTogglePin={handleTogglePin}
      onTagSelect={setActiveTag}
      // 막힌 어포던스를 **살아 있는 길**로 바꾼다 (2026-07-28 소유자 제보:
      // "새 문서 작성은 왜 없지?"). 종전에는 읽기 전용 샘플에서 `+` 가
      // 40% 불투명도로 비활성이고 이유는 **호버해야만** 나왔다 — 정보는
      // 있었지만 도달하지 않았고, 화면은 "그 기능이 없다" 로 읽혔다.
      //
      // 헌장의 강등 문법은 "왜 안 되는지 + **어디로 가면 되는지**" 다.
      // 그래서 이제 누르면 그것을 가능하게 하는 곳(내 폴더 열기)으로 간다.
      onCreateNewDoc={canEditCurrent ? handleOpenNewDocDialog : handleVaultPillSwap}
      canCreateNewDoc={canEditCurrent}
      sort={treeSort}
      group={treeGroup}
      onSortChange={handleTreeSortChange}
      onGroupChange={handleTreeGroupChange}
      agentFiles={agentFiles}
    />
  );

  // docs-vault-final skin — engraved vault census pill (crumbs row + phead).
  // [D-2] path: 실제로 로컬 폴더(데스크톱 dogfood 자동 로드 포함)가 열려
  // 있을 때만 진짜 경로를 보여준다. isLocalSourceLoaded 가 false 인 순수
  // static/server 샘플(빌드타임 매니페스트)에서는 DOGFOOD_VAULT_PATH 가
  // 빌드 머신의 개발자 절대 경로라 사용자에게 노출하면 오해 + 경로 누출.
  // 이 경우 "내장 샘플" 라벨로 대체 — local 모드에서만 실 경로 표시.
  const vaultPillPath =
    isLocalSourceLoaded && localVaultRootPath
      ? localVaultRootPath
      : isLocalSourceLoaded && localVault.handle
        ? localVault.handle.name
        : t('header.vaultPillSampleLabel');
  const vaultTopLevelFolderCount = manifest.tree.children?.filter(
    (child) => child.type === 'dir',
  ).length ?? 0;
  // B2 병합 — vault pill 의 "vault 바꾸기"는 고빈도 swap 만 남긴다(읽기/쓰기
  // 흐름의 일부). 예전엔 vault 도구 드롭다운을 열었지만, 이제 로컬은 네이티브
  // 폴더 재선택(openLocalVault)을, 데스크톱의 샘플→로컬 전환은 source 전환을
  // 직접 호출한다. 최근 vault·닫기·새로고침·권한 복구 등 나머지 관리 동작은
  // 설정 메뉴(AppSettingsMenu)의 vault 탭으로 이동했다.

  return (
    <div className="flex h-full w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      <div className="topology-ui-scale relative flex h-full min-w-0 flex-1 flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* 76px 크롬 그리드 (docs-chrome-round design-prescription.md ③-1) —
          브레드크럼 32px + 헤더 3존 44px = 76px, 토폴로지의
          --topology-index-top 클리어런스와 같은 발상(고정 그리드라야 뷰 전환
          시 콘텐츠 시작선이 흔들리지 않는다). lg+ 에서 헤더가 h-11 고정 단일
          행으로 그리드를 채운다 — <lg 는 기존 2행 wrap + 모바일 drawer 를
          그대로 유지(90px 폭 뷰포트에서 단일 행이 가로 스크롤을 만들기
          때문 — local-vault-picker.spec.ts 의 zero-overflow 계약). */}
      <div data-chrome-grid="44" className="flex-none">
      {/* #97 — 브레드크럼 행("워크스페이스 / 문서함") 삭제. 좌측 내비 레일이
          이미 "문서함" 을 하이라이트해 "여기가 어디" 를 답하고, "지도로" 복귀도
          레일의 map 목적지(→ /topology)가 소유하므로 이 행의 뒤로가기 링크는
          중복 내비였다. 세로 공간(32px)을 회수하고, 레일이 못 하는 유일한
          기능 — insights 리뷰에서 넘어온 문맥 복귀 — 만 헤더 zone-l 로 이관한다
          (아래 insightsReturnTab 백 칩). "문서함" 정체성은 sr-only h1 로 유지. */}
      {/* 헤더 3존 [zone-l identity] [zone-c 탭 예약, 슬라이스 B] [zone-r
          tools] — implementation-contract.md §1. macOS 다운로드 버튼은
          여기서 완전히 삭제(읽기 전용 샘플 배너 1곳 + /download 만 소유,
          design-prescription.md ②). "문서함" h1 은 sr-only 로만 유지
          (내비 레일 + 브레드크럼과의 3중 라벨 해소). */}
      {/* 태블릿 최상단 세로 압축 (소유자 실보고 2026-07-23) — 단일 행 전환을
          lg → md 로 내린다. 768 실측: zone-l(~230px) + zone-r(~343px) = 573px
          로 한 행(728px)에 여유 있게 들어가는데도 2행 wrap(총 ~90px)이었다.
          <md 는 기존 2행 wrap 유지(zero-overflow 계약). */}
      <header className="relative isolate flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-2 bg-[color:var(--color-panel)] px-3 py-2 md:h-11 md:min-h-0 md:flex-nowrap md:gap-2 md:px-4 md:py-0">
        <h1 className="sr-only">{t('header.title')}</h1>
        {/* 헤더 baseline — 탭 스트립의 "한 끗"(design-prescription.md §10.2
            ⑥): 활성 탭 아래에서만 이 1px 라인이 2px 인디고 언더라인으로
            치환돼야 하므로 header 자체의 border-b 대신 절대배치 라인으로
            분리했다. 음수 z-index(header 의 `isolate` 로 스코프)라 일반
            흐름 콘텐츠(zone-l/zone-c/zone-r) 가 항상 이 라인 위에 그려진다
            — 활성 탭의 불투명 --color-canvas 배경이 자연스럽게 이 라인을
            덮고, 그 위에 자체 2px bar 를 그리므로 이중선이 생기지 않는다. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-[color:var(--color-border-soft)]"
        />
        {/* zone-l — 목록 토글 + VaultChip.
            폭 계약: 목록이 펼쳐져 있으면 zone-l 오른쪽 끝이 **문서 pane 의
            왼쪽 모서리**와 정확히 맞물린다 → 탭 스트립이 자기가 여는 문서
            pane 위에 정렬된다(VS Code/옵시디언의 탭=pane 규칙). 계산:
            list-width − header padding(1rem) − zone gap(0.5rem). 이전에는
            내용(≈197px)보다 큰 max-w-300 캡까지 flex-1 로 늘어나 탭이 pane
            모서리보다 50px 오른쪽에서 시작했다(소유자 신고).
            목록이 접히면 정렬할 pane 경계가 없으므로 내용 폭으로 되돌린다. */}
        <div
          data-docs-header-zone="identity"
          className={cn(
            // md 단일 행 전환(태블릿 최상단 세로 압축) — w-full 강제는 <md 2행
            // wrap 시절의 잔재라 md 부터 내용 폭으로. 상주 목록 pane 정렬
            // 계약(lg:w-[calc...])은 pane 이 lg+ 전용이므로 그대로 lg 에서만.
            "flex w-full min-w-0 flex-none flex-wrap items-center gap-2 md:w-auto md:flex-nowrap md:gap-3",
            docListCollapsed
              ? "lg:w-auto"
              : "lg:w-[calc(var(--docs-list-width)-1.5rem)]",
          )}
        >
          {/* #97 — 삭제된 브레드크럼에서 유일하게 살릴 기능: insights 리뷰에서
              넘어온 문맥 복귀. 레일의 map 목적지가 커버 못 하는 경로라 헤더로
              이관한다. 일반 진입(비-insights)에서는 렌더하지 않는다 — 지도
              복귀는 좌측 레일이 소유. */}
          {insightsReturnTab ? (
            <Link
              href={workspaceHref}
              aria-label={t('header.backToReviewAriaLabel')}
              // 이 Link 는 바로 아래 「트리 열기」 칩과 나란히 선다. `<button>` 이
              // 아니라 래칫에는 안 잡히지만, 한쪽만 정규화하면 둘의 높이가 갈린다.
              className={controlClass({
                shape: 'chip',
                size: 'lg',
                className:
                  'flex-none justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]',
              })}
            >
              <ArrowLeft size={ICON_SIZE.md} aria-hidden />
              <span className="hidden sm:inline">{t('header.reviewBack')}</span>
            </Link>
          ) : null}
          <Chip
            size="lg"
            onClick={() => setSourceTreeOpen(true)}
            className="flex-none justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)] lg:hidden"
            aria-label={t('header.openTreeAriaLabel')}
            title={t('header.openTreeTitle')}
          >
            <Menu size={ICON_SIZE.md} aria-hidden />
            <span className="hidden sm:inline">{t('header.openTreeTitle')}</span>
          </Chip>
          <DocsHeaderTile
            icon={<PanelLeft size={ICON_SIZE.lg} aria-hidden />}
            title={docListCollapsed ? t('header.docListExpand') : t('header.docListCollapse')}
            active={docListCollapsed}
            aria-expanded={!docListCollapsed}
            onClick={toggleDocListCollapsed}
            className="hidden lg:inline-flex"
          />
          {/* 칩은 **고른 소스**를 말한다 — 폴더 미선택 로컬을 샘플로 그리면
              화면이 "내 폴더에 31개가 있다" 고 거짓말한다(`lib/vault-chip-identity`). */}
          <DocsVaultVaultChip
            label={
              vaultChipIdentity.kind === 'local'
                ? vaultChipIdentity.label
                : vaultChipIdentity.kind === 'local-pending'
                  ? t('header.vaultChipLocalPending')
                  : t('advanced.sourceServer')
            }
            docCount={vaultChipIdentity.showDocCount ? manifest.docs.length : null}
            folderCount={vaultTopLevelFolderCount}
            path={vaultPillPath}
            isLocalSourceLoaded={isLocalSourceLoaded}
            open={vaultChipOpen}
            onToggle={() =>
              setVaultChipOpen((open) => {
                const next = !open;
                if (next) setAdvancedOpen(false);
                return next;
              })
            }
            onSwap={() => {
              setVaultChipOpen(false);
              handleVaultPillSwap();
            }}
            isSample={source === 'server'}
            onUseSample={() => {
              setVaultChipOpen(false);
              handleSourceChange('server');
            }}
            localDisabled={localSourceDisabled}
            localDisabledReason={
              localSourceDisabled ? t('vaultStatus.unsupportedTooltip') : undefined
            }
            onOpenAudit={() => {
              setVaultChipOpen(false);
              openContract();
            }}
            menuRef={vaultChipMenuRef}
            toolsMovedHint={t('header.vaultToolsMovedHint')}
            t={t}
          />
        </div>
        {/* zone-c — 열린 문서 탭 스트립(슬라이스 B). `view==='doc'` 일 때만
            렌더(현재 유일한 view). 탭이 0개면 EmptyState 없이 그냥 빈 채로
            둔다(지시 ④ "플레이스홀더 금지"). `self-stretch` 로 헤더 전체
            높이를 채워야 활성 탭 배경이 baseline 을 완전히 덮는다. */}
        <div
          data-docs-header-zone="tabs"
          className="hidden min-w-0 flex-1 self-stretch lg:flex"
        >
          {view === 'doc' ? (
            <DocsVaultTabStrip
              tabs={openDocTabs}
              activeSlug={selectedSlug}
              onActivate={handleSelect}
              onClose={handleCloseDocTab}
              t={t}
            />
          ) : null}
        </div>
        {/* zone-r — 소스 pill → ⌘K → 점검 → 문서정보 → gear(local). 순서
            고정, 숨김/겹침 금지(implementation-contract.md §10.2 ①).
            검수 Pass A′ 결함 (2026-07-23) — 구 `lg:max-w-[340px]` 캡은 EN
            라벨(Sample/Local/SETTINGS)이 340px 를 넘으면 justify-end 정렬이
            내용물을 캡 왼쪽 밖으로 흘려 탭 스트립을 덮었다(1440 실측 28px).
            캡을 제거해 자연 폭을 갖게 하면 zone-c(flex-1 min-w-0 스크롤
            스트립)가 그만큼 줄어들 뿐 겹침이 구조적으로 불가능해진다. */}
        {/* md 단일 행 전환 — w-full 을 md 부터 풀고 ml-auto 로 우측 정렬
            (zone-c 탭 스트립은 lg+ 전용 flex-1 이라 md 구간엔 자연 공백이
            없다). lg 에선 zone-c 가 여백을 소유하므로 ml-auto 는 no-op. */}
        <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 md:ml-auto md:w-auto md:flex-nowrap">
          {/* ⚠️ **소스 라디오와 점검 타일이 여기 있었다** (2026-08-08 제거, 2안).
              오른쪽 끝의 「샘플 | 로컬」은 왼쪽 볼트 칩이 이미 말하고 있는 것을
              한 번 더 말했고(같은 사실, 두 곳), 바꾸는 길도 둘이었다 — 칩 메뉴와
              이 라디오. 소유자가 이 무리를 「헷갈린다」로 지목했다: 화면 전체의
              데이터 출처를 바꾸는 스위치 옆에 검색과 클립보드가 성격 구분 없이
              붙어 있었다.
              표시·전환·점검은 전부 볼트 칩 하나로 모았다(새 표면 0). 여기 남는
              것은 ⌘K 하나 — 그리고 레일이 숨는 `<lg` 에서만 설정 타일. */}
          <DocsHeaderTile
            icon={<Search size={ICON_SIZE.lg} aria-hidden />}
            title={t('header.paletteTooltip')}
            aria-label={t('header.paletteAriaLabel')}
            onClick={() => {
              setAdvancedOpen(false);
              setVaultChipOpen(false);
              setPaletteQuery('');
            }}
          />
          {/* B2 병합 — 문서함 헤더의 vault 도구 드롭다운(VaultToolsMenu)은 설정
              메뉴로 흡수됐다. AI agent 설정·수리·복사 패킷·검증 게이트는 이제
              AppSettingsMenu 의 vault / mcpAgents 탭이 소유한다. 헤더에는 그
              집으로 가는 설정 게어만 남긴다(신규 표면·신규 탭 0). 로컬 vault
              관리(picker)도 설정 vault 탭에서 열린다 — vault pill 은 고빈도
              swap 만 담당. #15 — lg+ 는 나브레일 하단 톱니가 담당하고, 레일이
              숨는 <lg 에서만 chrome-tile 로 노출한다. */}
          <div className="lg:hidden">
            <AppSettingsMenu
              mode={source === 'local' ? 'local' : 'static'}
              triggerVariant="chrome-tile"
            />
          </div>
        </div>
      </header>
      </div>
      <DocsVaultAuditModal
        skillParity={skillParity}
        onCopySkillParityHandoff={handleCopySkillParityHandoff}
        tSkillParity={tSkillParity}
        open={contractOpen}
        manifest={manifest}
        nodeCount={ontologyDerivation.nodes.length}
        edgeCount={ontologyDerivation.edges.length}
        graphHref={
          selectedDoc
            ? (buildOntologyDeeplinkForDoc(selectedDoc) ?? '/ontology/')
            : '/ontology/'
        }
        isLocalSourceLoaded={isLocalSourceLoaded}
        onClose={closeContract}
        t={t}
      />

      {/* Round 9 cut — local source 인데 vault 가 error / permission-needed
          상태일 때 명시 banner. 이전엔 silent 으로 server 매니페스트 (샘플
          docs) 가 표시돼 사용자가 자기 vault 가 죽었음을 모름. picker 토글로
          바로 fix 가능 (헤더 우측 gear). */}
      {source === 'local' &&
      (localVault.status === 'error' ||
        localVault.status === 'permission-needed') ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-4 py-2 text-body text-[color:var(--color-status-danger)]"
          role="status"
        >
          <span className="flex-1">
            {localVault.status === 'permission-needed'
              ? t('vaultStatus.permissionNeededBanner')
              : t('vaultStatus.errorBanner', {
                  message: localVault.errorMessage ?? '',
                })}
          </span>
          <button
            type="button"
            onClick={() =>
              localVault.status === 'permission-needed'
                ? localVault.requestPermission()
                : void openLocalVault()
            }
            className={controlClass({
              shape: 'chip',
              tone: 'danger',
              className: 'hover:bg-[color:var(--color-danger-a12)]',
            })}
          >
            {t('vaultStatus.openPicker')}
          </button>
        </div>
      ) : null}

      {/*
       * **요청한 문서가 이 문서함에 없으면 말한다** (2026-08-01 실측 수리).
       *
       * `?slug=` 가 안 풀리면 기본 선택 로직이 README/FEATURES 중 하나를 골라
       * 그냥 그린다. 그런데 URL 은 요청 슬러그를 그대로 달고 있고(위 기본 선택
       * effect 는 `normalizedQuerySlug` 가 있으면 URL 을 안 고친다), 화면 어디에도
       * 못 찾았다는 말이 없다.
       *
       * 실측된 결과: [에이전트 연결] 시트의 문서 링크를 누른 사람이 데모 쇼핑몰의
       * **「회원 탈퇴」** 문서 앞에 놓였다. 그 링크 자체도 고쳤지만(볼트를 지정하지
       * 않은 주소였다), **조용한 대체는 그 링크 하나의 문제가 아니다** — 볼트를
       * 바꾸거나 문서를 지운 뒤의 모든 딥링크·북마크·에이전트 핸드오프가 같은
       * 길로 온다.
       *
       * 이 저장소가 이미 한 번 배운 것과 같은 병이다: 바로 위 배너가
       * *"이전엔 silent 으로 … 사용자가 자기 vault 가 죽었음을 모름"* 이라고
       * 적어 둔 그 병.
       */}
      {missingQuerySlug ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-4 py-2 text-body text-[color:var(--color-status-warning)]"
          role="status"
          data-testid="docs-missing-slug-banner"
        >
          <span className="min-w-0 flex-1 truncate">
            {t('vaultStatus.missingSlugBanner', { slug: missingQuerySlug })}
          </span>
        </div>
      ) : null}

      {showDesktopWelcome ? (
        <DesktopVaultWelcome
          status={localVault.status}
          recentVaults={localVault.recentVaults}
          onOpen={() => void openLocalVault()}
          // 브라우저가 원리적으로 못 하는 일은 **액션을 그리지 않는다**.
          // 이 카드는 `createTauriVaultHandle` 로 저장소의 절대 경로를 여는데
          // 웹에는 그 런타임이 없다. 종전에는 웹에서도 그려졌고, 누르면
          // `Tauri vault runtime is not available.` 예외만 던진 뒤 **화면이
          // 글자 하나 안 바뀌었다**(2026-07-28 실측: 클릭 전후 본문 길이 동일).
          // 죽은 CTA 이고 `surfaces.md` 가 이름으로 금지한 것이다.
          //
          // 강등 카드를 새로 짓지 않는 이유: 이 카드 옆에 웹에서 되는 길
          // (폴더 열기 · 샘플 보기)이 나란히 있다. 못 하는 일을 설명하는
          // 것보다 되는 일을 남기는 것이 낫다(웹 BYOK 와 같은 선례).
          onOpenDogfoodPath={isDesktopRuntime ? handleOpenDogfoodVault : undefined}
          onOpenRecent={(record) => void localVault.openRecent(record)}
          onOpenSample={() => handleSourceChange('server')}
          showDogfoodHint={showDogfoodHint}
          t={t}
        />
      ) : (
        <>
          <div className="flex min-h-0 flex-1">
        {/* Source tree drawer — tree navigation is intentionally opt-in so the
            document/work surface stays primary on desktop and mobile. */}
        {/* 화면 전체를 덮는 서랍이라 **밝기 전용** 문법을 쓴다(`motion="overlay"`)
            — 큰 표면에 이동/스케일을 걸면 화면 자체가 흔들린 것으로 읽힌다.
            스크림과 서랍이 한 표면으로 같이 들어오고 같이 나간다. */}
        <Surface
          open={sourceTreeOpen}
          motion="overlay"
          className="fixed inset-0 z-40 flex"
        >
            <div
              className="absolute inset-0 bg-[color:var(--color-scrim-a50)]"
              onClick={() => setSourceTreeOpen(false)}
              aria-hidden
            />
            <aside className="relative flex w-[300px] max-w-[84vw] flex-col overflow-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-dock-side)] md:w-[340px]">
              <div className="flex h-12 flex-none items-center justify-between border-b border-[color:var(--color-border-soft)] px-3">
                <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {t('mobileDrawer.title')}
                </span>
                <IconButton
                  label={t('mobileDrawer.closeAriaLabel')}
                  onClick={() => setSourceTreeOpen(false)}
                  className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                >
                  <X size={ICON_SIZE.md} aria-hidden />
                </IconButton>
              </div>
              <div className="flex flex-1 flex-col overflow-auto">
                {sidebarBody}
              </div>
            </aside>
        </Surface>

        {/* Persistent left pane — --docs-list-width(280px) machined 파일
            트리 (docs-vault-final 2-pane spec). lg+ 에서 항상 보임; 그 아래
            폭에서는 위 drawer 로 대체 (menu 버튼이 lg:hidden). 접힘 =
            width 0(34px slim rail 삭제, design-prescription.md ③-4) — 재열기
            발견성은 zone-l 의 PanelLeft 타일(active 상태) + 탭 + ⌘K 3중
            담보이므로 접힘 힌트 레일이 따로 필요 없다. */}
        <aside
          // 목적지 안내(문서함 2장짜리)가 "왼쪽이 내 폴더 목록" 을 가리킬 때
          // 쓰는 앵커. 접혀 있으면(width 0) 앵커 해석이 실패해 안내가 한 장으로
          // 접힌다 — 없는 곳을 가리키지 않는다.
          data-testid="docs-vault-doc-list"
          aria-label={t('mobileDrawer.title')}
          aria-hidden={docListCollapsed}
          // aria-hidden 만으로는 width 0 뒤에 숨은 검색 input·트리 버튼이
          // 여전히 Tab 순서에 남는다(보이지 않는 곳으로 포커스가 사라지는
          // WCAG 결함 + aria-hidden 내부 포커스 모순). inert 로 포커스·포인터
          // 를 함께 차단한다 (React 19 boolean inert).
          inert={docListCollapsed}
          style={{ width: docListCollapsed ? 0 : 'var(--docs-list-width)' }}
          className={`hidden flex-none flex-col overflow-hidden bg-[color:var(--color-panel)] transition-[width] duration-[var(--motion-base)] ease-[var(--motion-ease)] lg:flex ${
            docListCollapsed ? '' : 'border-r border-[color:var(--color-border-soft)]'
          }`}
        >
          {sidebarBody}
        </aside>

        {/* 본문 + 우측 사이드 */}
        <main
          id="main"
      tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          /**
           * 설치 앱 실측용 마커 — `dot 디렉터리를 실제로 읽었는가`.
           *
           * 이 판정은 **데스크톱 능력**이라 브라우저 증명이 증명이 아니다
           * (`surfaces.md`). 그런데 판정을 보여 주는 자리는 「문서함 점검」 모달
           * 안이라 닫혀 있으면 DOM 에 없다 — 그래서 상시 존재하는 이 원소가
           * 요약을 싣는다. `-` 는 "이 표면에 그 능력이 없음"(웹)이고,
           * `0/0` 은 "능력은 있는데 스킬 트리가 없는 볼트"다. 둘은 다른 사실이라
           * 같은 값으로 뭉개지 않는다.
           */
          data-skill-parity={
            skillParity ? `${skillParity.rows.length}/${skillParity.disagreeing}` : "-"
          }
        >
          {selectedDoc ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 샘플 진입 안내 — Toss D1 정리(2026-07): 딥링크 없이 샘플
                  모드로 착지하면 이 노트가 (개발 문서 본문보다 먼저) 이
                  문서함이 무엇이고 어떻게 쓰는지 평문으로 짚어준다. 사용자가
                  실제 문서를 고르면(handleSelect) 사라진다. */}
              {!editing && showSampleWelcomeNote ? (
                <SampleWelcomeNote
                  canOpenLocalVault={!localSourceDisabled}
                  onOpenFolder={() => handleSourceChange('local')}
                  onDismiss={() => setSampleWelcomeDismissed(true)}
                />
              ) : null}
              {/* ehead — 표시명(title) + preview/edit seg + sync status
                  (docs-vault-final spec §우 에디터/프리뷰 헤더). Toss D2
                  정리(2026-07) — 이전엔 `dir/file.md` 내부 파일명만 mono 로
                  보여 비개발자에게 "README.md" 같은 raw 파일명이 1차
                  레이블이었다. title 을 1행 주 레이블로 올리고, 파일 경로는
                  2행 caption(secondary)으로 낮춘다 — 트리(`DocsVaultTree`)의
                  `title ?? name` 우선순위와 같은 계약을 여기도 일관 적용. */}
              <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--color-border-soft)] px-4 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {selectedDocDisplayTitle}
                  </span>
                  <span className="truncate font-mono text-caption text-[color:var(--color-text-quaternary)]">
                    <span>{splitVaultSlugPath(selectedDoc.slug).dir}</span>
                    {splitVaultSlugPath(selectedDoc.slug).name}.md
                  </span>
                </div>
                {/* #4 샘플 안내 — 읽기 전용인 이유 + 켜는 법. 종전엔 제목 위의
                    자기 띠(53px)였다. 말하는 사실이 **볼트** 의 것이라 문서마다
                    반복될 이유가 없고, 샘플 볼트에서는 이 줄의 오른쪽이 비어
                    있으므로 세로 픽셀 0으로 같은 말을 한다 (po-pass.md §1-3 의
                    판단은 그대로 — 지우지 않고 자리만 옮겼다). */}
                {!editing && !isLocalSourceLoaded ? (
                  <SampleNotice
                    canOpenLocalVault={!localSourceDisabled}
                    onOpenFolder={() => handleSourceChange('local')}
                  />
                ) : null}
                {canEditCurrent ? (
                  <div
                    role="tablist"
                    aria-label={`${t('editorHeader.previewTab')} / ${t('editorHeader.editTab')}`}
                    className="inline-flex flex-none items-stretch gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-0.5 shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
                  >
                    <Chip
                      role="tab"
                      aria-selected={!editing}
                      active={!editing}
                      tone={!editing ? 'strong' : 'muted'}
                      onClick={() => setEditing(false)}
                      className="font-mono hover:text-[color:var(--color-text-secondary)]"
                    >
                      {t('editorHeader.previewTab')}
                    </Chip>
                    <Chip
                      role="tab"
                      aria-selected={editing}
                      active={editing}
                      tone={editing ? 'strong' : 'muted'}
                      onClick={() => setEditing(true)}
                      className="font-mono hover:text-[color:var(--color-text-secondary)]"
                    >
                      {t('editorHeader.editTab')}
                    </Chip>
                  </div>
                ) : null}
                {/* 점은 **라벨의 불릿**이지 그 자체로 상태가 아니다
                    (2026-08-04). 종전엔 점만 항상 그려지고 문구는 로컬
                    볼트일 때만 붙어서, 샘플/서버 모드에서는 아무 뜻도 없는
                    인디고 점 하나가 떠 있었다 — 정보를 안 나르는 채색이다.
                    ⚠️ 이 줄은 **볼트 원본**이 로컬인지만 말한다. 이 문서가
                    지도에 있는지와는 무관하고, 그 판정은 `DocMetaBar` 가
                    한다. */}
                {isLocalSourceLoaded ? (
                  <span className="flex-none font-mono text-label text-[color:var(--color-text-quaternary)]">
                    <span
                      className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--color-indigo-accent)] align-middle"
                      aria-hidden
                    />
                    {t('editorHeader.localSynced')}
                  </span>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1">
                {/* relative 래퍼 — #1 목차 레일(빈 띠 절대 위치)과 #2 맨
                    위로(스크롤 컨테이너 밖에 얹혀 스크롤과 무관하게 같은
                    화면 위치 유지) 둘 다 이 래퍼를 기준으로 위치한다. 본문
                    max-w-760 은 아래 overflow-auto 컨테이너 안에서 그대로
                    mx-auto — 레일 때문에 줄지 않는다. */}
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                  {/* 목차는 이 레일 하나가 소유한다. 종전에는 문서 정보
                      인스펙터가 같은 목차를 한 벌 더 들고 있어서, 열리면 레일을
                      demote 하는 규칙이 필요했다 — 2026-07-28 에 그 패널을
                      걷어내면서 이중 노출 자체가 사라졌다. */}
                  {!editing && showOutlineRail ? (
                    <DocReadingOutlineRail
                      headings={outlineHeadings}
                      activeHeadingSlug={activeHeadingSlug}
                      onHeadingClick={handleHeadingNavigate}
                    />
                  ) : null}
                  <div
                    ref={articleScrollRef}
                    // <lg 스크롤 끝 예약고 — 이 컨테이너 하단이 고정 탭바 뒤로
                    // 17px 파고들어(768/834/600 실측 공통) 마지막 줄이 스크롤
                    // 끝에서 가려졌다. 탭바 예약고 + 12px 를 스크롤 콘텐츠
                    // 안쪽 패딩으로 확보 (겹침 소탕 2026-07-23).
                    className="min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]"
                  >
                    {editing && canEditCurrent && editResolver ? (
                      <DocsVaultEditor
                        key={`edit:${vaultScope}:${selectedDoc.slug}`}
                        vaultScope={vaultScope}
                        doc={selectedDoc}
                        getDocContent={editResolver}
                        onSave={(slug, content, expectedMtime) =>
                          // conflict 를 swallow 하지 않고 re-throw — 그래야 에디터가
                          // 버퍼를 dirty 로 유지해 다음 poll 의 clobber 를 막는다.
                          // (구버전은 여기서 return 으로 삼켜 phantom-clean → 데이터 손실)
                          persistEditorSave(
                            localVault.saveDoc,
                            { slug, content, expectedMtime },
                            () => toast.show(t('dialog.vaultConflict'), 'error'),
                          )
                        }
                        onClose={() => setEditing(false)}
                        allDocs={manifest.docs}
                      />
                    ) : (
                      <>
                        {/* 게이트가 여기서 사라진 이유 (2026-08-04): 종전엔
                            `kind` 가 비어 있으면 블록 자체를 안 그렸는데,
                            kind 없음/빔이 **노드가 지도에서 사라지는 가장 흔한
                            두 경로**라 설명이 가장 필요한 두 경우에만 화면이
                            침묵했다. 판정은 이제 컴포넌트가 갖는다 — 안내
                            문서에는 여전히 아무것도 안 그리고(validator 가
                            ontology 의도 없는 문서에는 이슈를 내지 않는다),
                            노드가 되려다 실패한 문서에는 축약 진단을 그린다.
                            판정이 한 곳에 있어야 둘이 어긋나지 않는다. */}
                        <DocFrontmatterBlock
                            key={selectedDoc.slug}
                            doc={selectedDoc}
                            canEdit={canEditCurrent}
                            domainOptions={domainOptions}
                            onPatch={handlePatchDocFrontmatter}
                            onNavigate={handleSelect}
                            resolveRef={(token) => refSlugResolver.get(token) ?? null}
                            // rank7 (design-council B5) — 마지막 편집 주체/
                            // 충돌 배지의 실데이터 출처. 둘 다 로컬 vault
                            // 싱글턴(`LocalVaultProvider`)이 실제로 관측한
                            // 값만 — 서버/샘플 볼트에선 heartbeat/자기쓰기
                            // 기록이 없으므로 컴포넌트가 알아서 아무것도
                            // 렌더하지 않는다.
                            agentActivityStatus={localVault.agentActivityStatus}
                            selfEditTimestamps={localVault.selfEditTimestamps}
                          />
                        <DocMetaBar doc={selectedDoc} />
                        <DocsVaultViewer
                          key={`${source}:${selectedDoc.slug}`}
                          doc={selectedDoc}
                          vaultSlugs={vaultSlugs}
                          onNavigate={handleSelect}
                          getDocContent={getDocContent}
                          getDocHref={getDocHref}
                          getProjectHref={getProjectHref}
                          highlightQuery={highlightQuery}
                          resolveImage={resolveImage}
                          {...(source === 'local'
                            ? {}
                            : {
                                bundledContent: staticVault.content,
                                repoBlobBase: ONTOLOGY_ATLAS_REPO_BLOB_BASE,
                                vaultRepoRoot: DOCS_VAULT_REPO_ROOT,
                              })}
                        />
                      </>
                    )}
                  </div>
                  {!editing ? (
                    <BackToTopButton
                      visible={backToTop.visible}
                      onClick={backToTop.scrollToTop}
                    />
                  ) : null}
                </div>
                {/* 우측 사이드: heading outline + 공유 + 파일 관리. 기본은 닫아
                    본문을 우선하고, 필요할 때만 헤더의 인스펙터 버튼으로 연다.
                    backlinks 는 여기 없음 — pane 하단 스트립이 단일 소스. */}
              </div>

              {/* 하단 backlinks 스트립 — pane 전체 폭에 앵커, 항상 보임
                  (docs-vault-final spec §하단 백링크 스트립). persona QA
                  (fix/persona-findings ③): "항상 보임" 스펙과 달리
                  backlinksDetail.length > 0 조건으로 실제 역참조가 없는
                  문서에서는 스트립 자체가 사라져 기능 발견성이 없었다 —
                  역참조 0 개도 빈 상태 문구로 보여 "여긴 아직 없다" 를
                  알 수 있게 한다. */}
              {!editing ? (
                /*
                 * **예약고는 이 바에도 걸린다** (2026-08-01 실측 수리).
                 *
                 * 종전엔 위 스크롤러(`articleScrollRef`)에만 걸려 있었다. 그런데
                 * 이 바는 그 스크롤러의 **형제 `flex-none`** 이라 스크롤러 안쪽
                 * 패딩이 구조적으로 닿지 않는다. 캐스케이드에 진 게 아니라
                 * **예약이 잘못된 상자에 걸려 있었다.**
                 *
                 * 결과는 가림을 넘어 **입력 탈취**였다 — 375·390·600·640·700·
                 * 768·834·900·1023(탭바가 있는 `<lg` 전 구간)에서
                 * `elementFromPoint(중심)` 이 `bottom-tab-get-app` 을 돌려주고,
                 * 실제로 누르면 `/download/` 로 갔다. 문서를 지도에서 열려던
                 * 사람이 다운로드 페이지에 도착한다.
                 *
                 * `max-lg:` 대신 **base + `lg:` 오버라이드**로 쓴다 — 어느 쪽이
                 * 이기는지가 클래스 순서에 달리지 않게.
                 */
                <div className="flex flex-none items-center gap-2 border-t border-[color:var(--color-border-soft)] px-4 pt-2.5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)] lg:pb-2.5">
                  {backlinksDetail.length > 0 ? (
                    <DocsVaultBacklinks
                      entries={backlinksDetail}
                      docsBySlug={docsBySlug}
                      onNavigate={handleSelect}
                      layout="strip"
                    />
                  ) : (
                    <p className="min-w-0 flex-1 truncate text-body text-[color:var(--color-text-quaternary)]">
                      {t('backlinksStrip.empty')}
                    </p>
                  )}
                  {/* 직접 간다 — `/ontology/?node=` 는 지도로 가는 **얇은
                      리다이렉트**(구 허브는 은퇴했다)라 한 홉이 낭비된다.
                      `?p=` 포커스 링크가 같은 곳에 바로 도착한다.

                      **`?? '/topology/'` 폴백은 죽은 CTA 였다** (2026-08-04 실측).
                      그래프에 노드가 없는 문서에서 두 빌더가 모두 null 이면 이
                      링크가 `/ko/topology/` 로 렌더됐다 — 누르면 지도가 열리되
                      **아무것도 안 잡힌다**. 「지도에서 열기」라고 써 있는데 열
                      대상이 없는 것은 강등이 아니라 함정이고, 죽은 CTA 0 은 이
                      저장소의 계약이다(`.claude/rules/surfaces.md`). 주소를 못
                      만들면 렌더하지 않는다 — 그 문서가 왜 지도에 없는지는 위
                      진단 블록이 이미 말한다. */}
                  {mapDeeplinkForSelectedDoc ? (
                    <Link
                      href={mapDeeplinkForSelectedDoc}
                      data-testid="docs-backlinks-open-in-map"
                      className={controlClass({ shape: "link", tone: "muted", className: "flex-none text-body hover:text-[color:var(--color-text-primary)]" })}
                    >
                      {t('backlinksStrip.openInOntology')}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : source === 'local' &&
            localVault.status === 'loaded' &&
            canEditCurrent &&
            manifest.docs.length === 0 ? (
            <div className="flex min-h-full items-center justify-center p-5">
              <div className="w-full max-w-3xl">
                <OntologyStarterCta
                  onScaffold={handleScaffoldOntologyStarter}
                  docCount={0}
                  vaultPath={
                    localVault.handle
                      ? getTauriVaultRootPath(localVault.handle)
                      : null
                  }
                />
              </div>
            </div>
          ) : (
            <EmptyState
              docCount={manifest.docs.length}
              onOpenAgentWorkflow={handleOpenAgentGraphWorkflowGuide}
              onOpenTree={() => setSourceTreeOpen(true)}
            />
          )}
        </main>
          </div>
        </>
      )}

      <AnimatePresence>
        {paletteOpen ? (
          <DocsVaultUnifiedPalette
            key="docs-unified-palette"
            onClose={() => setPaletteQuery(null)}
            docs={collectionDocs}
            recentSlugs={collectionRecentSlugs}
            pinnedSlugs={collectionPinnedSlugs}
            commands={commands}
            tagCounts={collectionTagCounts}
            onDocSelect={(slug, q) => handleSelect(slug, q)}
            onTagSelect={(tag) => setActiveTag(tag)}
            initialQuery={paletteQuery ?? ''}
            getDocHref={getDocHref}
            bodyIndex={docsBodyIndex}
            bodyIndexing={docsBodyIndexing}
          />
        ) : null}
      </AnimatePresence>

      {/* rank2 — NewDocKindDialog 가 framer motion 진입/퇴장 스프링을 쓰므로
          AnimatePresence 로 감싸야 닫힘 시 퇴장 애니메이션이 끝까지 재생된
          뒤 언마운트된다(그냥 조건부 렌더면 즉시 사라짐). */}
      <AnimatePresence>
        {newDocKindDialogOpen ? (
          <NewDocKindDialog
            onSelect={(kind) => void handleCreateNewDocWithKind(kind)}
            onClose={() => setNewDocKindDialogOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      {/* design-council B2 rank4 — 비차단 근접 중복 경고. 화면을 덮지 않는
          하단 고정 칩(scrim/backdrop 없음) — 뒤 콘텐츠 상호작용을 막지
          않는다. autoFocus 없음 — 어떤 입력 포커스도 훔치지 않는다. */}
      <AnimatePresence>
        {pendingSimilarDoc ? (
          <div
            key="pending-similar-doc"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
          >
            <div className="pointer-events-auto w-full max-w-[420px]">
              <SimilarNodeWarning
                message={t('dialog.similarNodeWarning', { title: pendingSimilarDoc.match.title })}
                openLabel={t('dialog.similarNodeOpen')}
                createAnywayLabel={t('dialog.similarNodeCreateAnyway')}
                onOpen={openPendingSimilarDoc}
                onCreateAnyway={createPendingDocAnyway}
              />
            </div>
          </div>
        ) : null}
      </AnimatePresence>
      </div>
    </div>
  );
}

export function DocsVaultPage() {
  // local-first 핵심 (`.claude/rules/local-first.md` §1) — vault picker 진입은
  // 인증 게이트 없음. 사용자 로컬 디스크가 진실원.
  return (
    // 이 안쪽 경계가 라우트 경계보다 가까워서, 프리렌더된 HTML 에 실제로
    // 구워지는 것은 여기 fallback 이다 — null 이면 배포된 문서함은 레일만
    // 남은 검은 화면으로 시작한다(감사 D1 과 같은 뿌리).
    <Suspense fallback={<RouteLoadingFallback />}>
      <DocsVaultContent />
    </Suspense>
  );
}
