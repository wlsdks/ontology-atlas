'use client';

import dynamic from 'next/dynamic';
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
import { useTranslations } from 'next-intl';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  FilePlus,
  FolderCog,
  FolderOpen,
  HardDrive,
  Menu,
  Network,
  Package,
  PanelRight,
  PanelTop,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import {
  OntologyStarterCta,
  ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT,
  VaultConflictError,
  useLocalVault,
} from '@/features/docs-vault-local';
import { VaultToolsMenu } from '@/widgets/docs-vault';
import { copyText } from '@/shared/lib/copy-text';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { useTypingShortcuts } from '@/shared/lib/use-typing-shortcut';
import { usePrevious } from '@/shared/lib/use-previous';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
} from '@/shared/lib/tauri-vault-fs';
import {
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
} from '@/shared/lib/ontology-tree';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';
import { StaggeredFadeIn, Tooltip, useToast } from '@/shared/ui';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
// 추출된 page-local helpers.
import { buildDocsVaultPopoutHtml } from '../lib/popout-template';
import { useAdvancedMenu } from '../lib/use-advanced-menu';
import { useDocsVaultPersistence } from '../lib/use-docs-vault-persistence';
import { useDocsVaultScrollSpy } from '../lib/use-scroll-spy';
import { useFolderTopo } from '../lib/use-folder-topo';
import { usePaletteState } from '../lib/use-palette-state';
import { replaceDocsVaultUrlState } from '../lib/url-state';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  resolveDocsVaultCollection,
  type DocsVaultCollection,
} from '../lib/docs-vault-collection';
import {
  buildDocsVaultHref,
  buildOntologyDeeplinkForDoc,
  deriveOntologyFromVault,
  vaultManifest,
  type VaultManifest,
} from '@/entities/docs-vault';
import { DocsVaultEditor } from '@/widgets/docs-vault/ui/DocsVaultEditor';
import { DocsVaultProjectDepsBar } from '@/widgets/docs-vault/ui/DocsVaultProjectDepsBar';
import { DocsVaultUnifiedPalette } from '@/widgets/docs-vault/ui/DocsVaultUnifiedPalette';
import { DocsVaultViewer } from '@/widgets/docs-vault/ui/DocsVaultViewer';
import type { VaultCommand } from '@/widgets/docs-vault/model/command';
import {
  PINNED_DOCS_STORAGE_PREFIX,
} from '@/widgets/docs-vault/lib/pinned-docs';
import {
  migrateLegacyRecentDocs,
  pushRecentDoc,
  RECENT_DOCS_STORAGE_PREFIX,
} from '@/widgets/docs-vault/lib/recent-docs';

// DocsVaultFolderTopology 는 Sigma WebGL 을 top-level 모듈에서 초기화하므로
// SSR 에서 평가되면 WebGL2RenderingContext not defined 로 빌드 실패. 반드시
// dynamic + ssr:false.
const DocsVaultFolderTopology = dynamic(
  () =>
    import('@/widgets/docs-vault/ui/DocsVaultFolderTopology').then(
      (m) => m.DocsVaultFolderTopology,
    ),
  { ssr: false },
);

const serverManifest = vaultManifest as VaultManifest;

const subscribeDesktopRuntime = () => () => undefined;
const readDesktopRuntime = () => isTauriVaultRuntime();
const readServerDesktopRuntime = () => false;

// view 파싱 / persistence helpers — 다른 도메인의 view 와 collision 회피용
// `DocsVault*` 네임스페이스. 본 파일 안에선 짧은 별칭으로 alias.
import { DocMetaBar } from "./parts/DocMetaBar";
import { DocsSidebarBody } from "./parts/DocsSidebarBody";
import { DocsVaultDocOutlinePanel } from "./parts/DocsVaultDocOutlinePanel";
import { EmptyState } from "./parts/EmptyState";
import {
  parseDocsVaultView as parseView,
  isDocsVaultLocalSourceDisabled,
  persistEditorSave,
  readStoredContractOpen,
  readStoredSource,
  scheduleStateSync,
  shouldShowDesktopVaultWelcome,
  shouldHonorLocalIntent,
  storeContractOpen,
  storeSource,
  type DocsVaultSource as Source,
  type DocsVaultView,
} from "../lib/persistence";

const SOURCE_VAULT_RUNTIME_REPLAY_MARKERS = [
  "relation_name_parity",
  "pattern_walk/project_map",
] as const;

function DocsVaultSourceContractBar({
  open,
  manifest,
  nodeCount,
  edgeCount,
  graphHref,
  isLocalSourceLoaded,
  t,
}: {
  open: boolean;
  manifest: VaultManifest;
  nodeCount: number;
  edgeCount: number;
  graphHref: string;
  isLocalSourceLoaded: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const toast = useToast();
  const { state: gateCopyState, copy: copyGate } = useCopyFeedback(1500);
  const copiedGate = gateCopyState === "copied";
  const sourceLabel =
    isLocalSourceLoaded
      ? t('sourceContract.filesLocalValue', { count: manifest.docs.length })
      : t('sourceContract.filesSampleValue', { count: manifest.docs.length });
  const cells = [
    {
      key: 'files',
      icon: HardDrive,
      label: t('sourceContract.filesLabel'),
      value: sourceLabel,
      body: t('sourceContract.filesBody'),
      chip: t('sourceContract.filesChip'),
      href: '/docs/',
      cta: t('sourceContract.filesCta'),
    },
    {
      key: 'graph',
      icon: Network,
      label: t('sourceContract.graphLabel'),
      value: t('sourceContract.graphValue', {
        nodes: nodeCount,
        edges: edgeCount,
      }),
      body: t('sourceContract.graphBody'),
      chip: t('sourceContract.graphChip'),
      href: graphHref,
      cta: t('sourceContract.graphCta'),
    },
    {
      key: 'agent',
      icon: Bot,
      label: t('sourceContract.agentLabel'),
      value: t('sourceContract.agentValue', {
        count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
      }),
      body: t('sourceContract.agentBody'),
      chip: t('sourceContract.agentChip'),
      href: '/ontology/insights/',
      cta: t('sourceContract.agentCta'),
      copyText: AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
      copyCta: t('sourceContract.agentCopyGate'),
      copyAriaLabel: t('sourceContract.agentCopyGateAriaLabel'),
      copySuccess: t('sourceContract.agentCopyGateSuccess'),
      proofMarkers: SOURCE_VAULT_RUNTIME_REPLAY_MARKERS,
    },
  ] as const;

  async function handleCopyGate(text: string, successMessage: string) {
    const ok = await copyGate(text);
    toast.show(ok ? successMessage : t('sourceContract.copyFailed'), ok ? 'success' : 'error');
  }

  return (
    <section
      id="docs-source-contract"
      aria-hidden={!open}
      aria-label={t('sourceContract.ariaLabel')}
      className={
        open
          ? "absolute left-3 right-3 top-[calc(3.5rem+0.5rem)] z-40 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:rgba(16,17,21,0.96)] px-3 py-2 shadow-[0_24px_72px_rgba(0,0,0,0.42)] md:left-4 md:right-4 md:px-4"
          : "hidden"
      }
    >
      <StaggeredFadeIn className="grid gap-2 lg:grid-cols-3">
        {cells.map((cell) => {
          const Icon = cell.icon;
          return (
            <article
              key={cell.key}
              className="grid min-w-0 grid-cols-[34px_1fr_auto] items-start gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] px-2.5 py-2.5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.2)] bg-[color:rgba(94,106,210,0.06)] text-[color:rgba(205,212,255,0.9)]">
                <Icon size={14} aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.82)]">
                    {cell.label}
                  </span>
                  <span className="rounded-sm border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(94,106,210,0.06)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                    {cell.chip}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] font-semibold text-[color:var(--color-text-primary)]">
                  {cell.value}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[color:var(--color-text-tertiary)]">
                  {cell.body}
                </p>
                {'proofMarkers' in cell ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cell.proofMarkers.map((marker) => (
                      <span
                        key={marker}
                        className="rounded-sm border border-[color:rgba(139,151,255,0.16)] bg-[color:rgba(94,106,210,0.05)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]"
                      >
                        {marker}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Link
                  href={cell.href}
                  className="inline-flex h-7 items-center rounded-sm border border-[color:var(--color-divider)] px-2 text-[10.5px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.38)] hover:text-[color:var(--color-text-primary)]"
                >
                  {cell.cta}
                </Link>
                {'copyText' in cell ? (
                  <button
                    type="button"
                    aria-label={cell.copyAriaLabel}
                    onClick={() => void handleCopyGate(cell.copyText, cell.copySuccess)}
                    className="inline-flex h-6 items-center gap-1 rounded-sm border border-[color:rgba(139,151,255,0.18)] bg-[color:rgba(94,106,210,0.06)] px-1.5 font-mono text-[9px] uppercase tracking-[0.06em] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.38)] hover:text-[color:var(--color-text-primary)]"
                  >
                    {copiedGate ? <Check size={10} aria-hidden /> : <Clipboard size={10} aria-hidden />}
                    {cell.copyCta}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </StaggeredFadeIn>
    </section>
  );
}

function DesktopVaultWelcome({
  status,
  recentVaults,
  onOpen,
  onOpenRecent,
  onOpenSample,
  t,
}: {
  status: string;
  recentVaults: LocalFsHandleRecord[];
  onOpen: () => void;
  onOpenRecent: (record: LocalFsHandleRecord) => void;
  onOpenSample: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const busy = status === 'opening' || status === 'loading';
  const contractItems = [
    {
      icon: HardDrive,
      label: t('desktopWelcome.contractFilesLabel'),
      value: t('desktopWelcome.contractFilesValue'),
      body: t('desktopWelcome.contractFilesBody'),
    },
    {
      icon: Network,
      label: t('desktopWelcome.contractGraphLabel'),
      value: t('desktopWelcome.contractGraphValue'),
      body: t('desktopWelcome.contractGraphBody'),
    },
    {
      icon: Bot,
      label: t('desktopWelcome.contractAgentLabel'),
      value: t('desktopWelcome.contractAgentValue', {
        count: AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
      }),
      body: t('desktopWelcome.contractAgentBody'),
    },
  ] as const;

  return (
    <main id="main" className="flex min-h-0 flex-1 overflow-auto bg-[color:var(--color-canvas)]">
      <div className="mx-auto grid w-full max-w-6xl content-start gap-8 px-5 py-8 md:px-8 md:py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-12">
        <div className="grid min-w-0 gap-7">
          <section className="grid max-w-3xl gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {t('desktopWelcome.eyebrow')}
            </p>
            <h2 className="max-w-2xl text-[28px] font-semibold leading-tight text-[color:var(--color-text-primary)] md:text-[34px]">
              {t('desktopWelcome.title')}
            </h2>
            <p className="max-w-2xl text-[14px] leading-6 text-[color:var(--color-text-tertiary)]">
              {t('desktopWelcome.body')}
            </p>
          </section>

          <StaggeredFadeIn
            as="section"
            ariaLabel={t('desktopWelcome.contractAriaLabel')}
            className="grid overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] md:grid-cols-3"
          >
            {contractItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.label}
                  className={`min-w-0 px-4 py-3 ${
                    index > 0
                      ? 'border-t border-[color:var(--color-border-soft)] md:border-l md:border-t-0'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <Icon size={14} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-[12.5px] font-semibold text-[color:var(--color-text-primary)]">
                        {item.value}
                      </p>
                      <p className="mt-1.5 break-keep text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                        {item.body}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </StaggeredFadeIn>
        </div>

        <aside
          aria-label={t('desktopWelcome.actionsAriaLabel')}
          className="grid min-w-0 gap-5"
        >
          <section className="overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className="flex w-full items-start gap-3 bg-[color:rgba(94,106,210,0.09)] px-4 py-4 text-left transition-colors hover:bg-[color:rgba(94,106,210,0.14)] disabled:opacity-60"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:rgba(139,151,255,0.28)] text-[color:rgba(205,212,255,0.94)]">
                <FolderOpen size={17} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-[color:var(--color-text-primary)]">
                  {busy
                    ? status === 'opening'
                      ? t('desktopWelcome.openingTitle')
                      : t('desktopWelcome.loadingTitle')
                    : t('desktopWelcome.openTitle')}
                </span>
                <span className="mt-1 block text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t('desktopWelcome.openBody')}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpen}
              disabled={busy}
              className="flex w-full items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <FilePlus size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  {t('desktopWelcome.createTitle')}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t('desktopWelcome.createBody')}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenSample}
              className="flex w-full items-start gap-3 border-t border-[color:var(--color-border-soft)] px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-secondary)]">
                <Package size={15} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  {t('desktopWelcome.sampleTitle')}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t('desktopWelcome.sampleBody')}
                </span>
              </span>
            </button>
          </section>

          <section className="grid gap-2">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
              {t('desktopWelcome.recentTitle')}
            </h3>
            {recentVaults.length > 0 ? (
              <div className="grid overflow-hidden rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">
                {recentVaults.map((record, index) => (
                  <button
                    key={record.desktopRootPath ?? `${record.id}:${record.name}`}
                    type="button"
                    onClick={() => onOpenRecent(record)}
                    disabled={busy}
                    className={`grid min-w-0 grid-cols-[28px_1fr] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--color-overlay-1)] disabled:opacity-60 ${
                      index > 0 ? 'border-t border-[color:var(--color-border-soft)]' : ''
                    }`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
                      <HardDrive size={13} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-medium text-[color:var(--color-text-primary)]">
                        {record.name}
                      </span>
                      {record.desktopRootPath ? (
                        <span className="block truncate font-mono text-[9.5px] text-[color:var(--color-text-quaternary)]">
                          {record.desktopRootPath}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="border-t border-[color:var(--color-border-soft)] pt-2 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
                {t('desktopWelcome.recentEmpty')}
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function DocsVaultContent() {
  const t = useTranslations('docsVault');
  const searchParams = useSearchParams();
  const querySlug = searchParams?.get('slug') ?? null;
  const queryView = parseView(searchParams?.get('view'));
  const projectsListHref = '/projects/';
  const workspaceHref = '/';
  const getDocHref = useCallback(
    (slug: string, hash?: string) => buildDocsVaultHref({ slug, hash }),
    [],
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
  const {
    open: advancedOpen,
    setOpen: setAdvancedOpen,
    ref: advancedMenuRef,
  } = useAdvancedMenu();
  const localIntentAutoOpenRef = useRef(false);
  // R11 #16 step 3 — folder-topology build 흐름은 useFolderTopo hook 으로 캡슐화.
  const [highlightQuery, setHighlightQuery] = useState<string | undefined>(
    undefined,
  );
  const [editing, setEditing] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [docCollection, setDocCollection] =
    useState<DocsVaultCollection>('guides');
  // ?intent=local — landing CTA "내 마크다운 폴더 열기" 의 진입 query.
  // source 초기값을 'local' 로 박아 처음부터 picker UI 가 우측 sidebar 에
  // 보이게 (eval B4 finding — 이전엔 picker 가 4-단계 깊숙이 묻혀 있었음).
  const [source, setSource] = useState<Source>('server');
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
    const intent = new URLSearchParams(window.location.search).get('intent');
    if (shouldHonorLocalIntent(intent, isDesktopRuntime)) {
      window.queueMicrotask(() => {
        localIntentAutoOpenRef.current = true;
        setSource('local');
        setAdvancedOpen(false);
      });
    }
    // mount 1회만 — 사용자가 직접 닫은 후 reload 시 다시 안 열리게.
    // setAdvancedOpen 은 useAdvancedMenu 의 useCallback wrap 결과라 ref-stable
    // 이지만 ESLint 가 destructured method 의 stability 추적 못 해 명시.
  }, [isDesktopRuntime, setAdvancedOpen]);
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  const [docInspectorOpen, setDocInspectorOpen] = useState(false);
  const localVault = useLocalVault();
  const localVaultStatus = localVault.status;
  const openLocalVault = localVault.open;
  const toast = useToast();
  const localSourceDisabled = isDocsVaultLocalSourceDisabled({
    isDesktopRuntime,
    localVaultStatus: localVault.status,
  });

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
  const localVaultValidationSummary = useMemo(() => {
    if (source !== 'local' || !localVault.manifest) return null;
    const summary = summarizeVaultValidation(
      localVault.manifest.docs.map((d) => ({
        slug: d.slug,
        frontmatter: d.frontmatter,
      })),
    );
    if (summary.errorCount === 0 && summary.warningCount === 0) return null;
    return {
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
    };
  }, [source, localVault.manifest]);

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
    storeSource('server');
    setSelectedSlug(slug);
    setRecentSlugs(pushRecentDoc('server', slug));
    setView('doc');
    replaceUrlState({ slug, view: 'doc', intent: null });
    setAdvancedOpen(false);
  }, [replaceUrlState, setAdvancedOpen, setRecentSlugs]);

  useEffect(() => {
    migrateLegacyRecentDocs();
    // ?intent=local 은 설치 앱 안에서만 local source 로 해석한다. hosted
    // browser 에서는 웹을 홍보/다운로드 surface 로 유지하고 로컬 vault 작업을
    // 열지 않는다.
    if (typeof window !== 'undefined') {
      const intent = new URLSearchParams(window.location.search).get('intent');
      if (shouldHonorLocalIntent(intent, isDesktopRuntime)) return;
    }
    scheduleStateSync(() => setSource(readStoredSource()));
  }, [isDesktopRuntime]);

  // 상단 소스-계약 스트립(01 FILES · 02 GRAPH · 03 AGENT) 펼침/접기.
  // 기본 닫힘 — Source Vault 는 문서/검색/로컬 vault 행동이 첫 화면이어야
  // 한다. 필요할 때만 헤더의 개요 버튼으로 overlay 를 연다.
  const [contractOpen, setContractOpen] = useState(false);
  useEffect(() => {
    scheduleStateSync(() => setContractOpen(readStoredContractOpen()));
  }, []);
  const toggleContract = useCallback(() => {
    setContractOpen((open) => {
      const next = !open;
      storeContractOpen(next);
      return next;
    });
  }, []);

  // URL 복사 feedback — 최근에 복사된 slug 를 잠깐 기억하고 2초 뒤 reset.
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyUrl = useCallback(async (slug: string) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('slug', slug);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopiedSlug(slug);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      /* clipboard 권한 없음 — silent. */
    }
  }, []);
  const handleCopyAgentVerifyPrompt = useCallback(async () => {
    const copied = await copyText(ONTOLOGY_STARTER_AGENT_VERIFY_PROMPT);
    toast.show(
      copied ? t('dialog.agentVerifyPromptCopied') : t('dialog.agentVerifyPromptCopyFailed'),
      copied ? 'success' : 'error',
    );
  }, [t, toast]);
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  // 스크롤 스파이 — 본문 스크롤 따라 outline 의 active heading 추적.
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocsVaultScrollSpy(selectedSlug, source);

  // Hosted browser 에서는 local vault 작업을 열지 않는다. 기존 브라우저
  // 세션이 local source 를 저장해 둔 경우에도 promo/read-only surface 로 복귀.
  useEffect(() => {
    if (source === 'local' && (!isDesktopRuntime || localVaultStatus === 'unsupported')) {
      scheduleStateSync(() => {
        setSource('server');
        storeSource('server');
      });
    }
  }, [isDesktopRuntime, source, localVaultStatus]);

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
    storeSource(next);
    // 소스 전환 시 선택 해제 — 동일 slug 가 다른 볼트에 있을 가능성 적음.
    setSelectedSlug(null);
    setActiveTag(null);
    const nextView = next === 'server' && view === 'folder-topology' ? 'doc' : view;
    replaceUrlState(
      next === 'server'
        ? { slug: null, view: nextView, intent: null }
        : { slug: null, view: nextView },
    );
    if (next === 'server' && view === 'folder-topology') setView('doc');
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
  const isLocalSourceLoaded =
    source === 'local' &&
    localVault.status === 'loaded' &&
    Boolean(localVault.manifest);

  // 현재 활성 매니페스트 — source 에 따라 분기. 로컬은 loaded 이전엔 null.
  const manifest: VaultManifest =
    isLocalSourceLoaded && localVault.manifest
      ? localVault.manifest
      : serverManifest;
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
    scheduleStateSync(() => setDocInspectorOpen(false));
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

  const {
    folderTopo,
    folderTopoError,
    folderTopoStatus,
    buildFolderTopology,
  } = useFolderTopo({ source, view, manifest, localVault });

  /**
   * Folder-Topology 에서 "+ 프로젝트" 버튼 — 새 projects/{slug}.md 를
   * 기본 template 으로 생성하고 편집 모드로 진입.
   * category / status 는 vault 의 첫 정의를 default 로.
   */
  const handleCreateProject = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const input = window.prompt(t('dialog.createProjectPrompt'));
    if (!input) return;
    const slug = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) {
      window.alert(t('dialog.invalidSlug'));
      return;
    }
    const fullSlug = `projects/${slug}`;
    if (manifest.docs.some((d) => d.slug === fullSlug)) {
      window.alert(t('dialog.alreadyExists', { slug: fullSlug }));
      return;
    }
    const defaultCategory = folderTopo?.categories[0]?.slug ?? 'uncategorized';
    const defaultStatus = folderTopo?.statuses[0]?.slug ?? 'active';
    const name = slug
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const template = [
      '---',
      `name: ${name}`,
      `slug: ${slug}`,
      `category: ${defaultCategory}`,
      `status: ${defaultStatus}`,
      'isHub: false',
      'dependencies: []',
      'tags: []',
      '---',
      '',
      `# ${name}`,
      '',
      t('dialog.createProjectBodyPlaceholder'),
      '',
    ].join('\n');
    try {
      await localVault.createDoc(fullSlug, template);
      setSelectedSlug(fullSlug);
      setRecentSlugs(pushRecentDoc(recentKey, fullSlug));
      setEditing(true);
      replaceUrlState({ slug: fullSlug, view: 'doc' });
      setView('doc');
    } catch (err) {
      window.alert(
        t('dialog.createFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, manifest, folderTopo, localVault, recentKey, replaceUrlState, setRecentSlugs, t]);

  // Scaffold 실행 헬퍼 — confirm 거쳐 useLocalVault.scaffoldTopology.
  const handleScaffoldTopology = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const ok = window.confirm(t('dialog.scaffoldConfirm'));
    if (!ok) return;
    try {
      const result = await localVault.scaffoldTopology();
      window.alert(
        t('dialog.scaffoldDone', { created: result.created, skipped: result.skipped }),
      );
      // scaffold 후 README 를 자동 선택해 규격 인지 도움
      setSelectedSlug('README');
      setRecentSlugs(pushRecentDoc(recentKey, 'README'));
      replaceUrlState({ slug: 'README', view: 'folder-topology' });
      setView('folder-topology');
    } catch (err) {
      window.alert(
        t('dialog.scaffoldFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, localVault, recentKey, replaceUrlState, setRecentSlugs, t]);

  const handleScaffoldOntologyStarter = useCallback(async () => {
    const result = await localVault.scaffoldOntology();
    setSelectedSlug('README');
    setRecentSlugs(pushRecentDoc(recentKey, 'README'));
    replaceUrlState({ slug: 'README', view: 'doc' });
    setView('doc');
    setAdvancedOpen(false);
    toast.show(
      t('dialog.ontologyStarterDone', {
        created: result.created,
        skipped: result.skipped,
      }),
      'success',
    );
    return result;
  }, [
    localVault,
    recentKey,
    replaceUrlState,
    setAdvancedOpen,
    setRecentSlugs,
    t,
    toast,
  ]);

  const handleDailyNote = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    const slug = `daily/${iso}`;
    const selectAndRecord = (s: string) => {
      setSelectedSlug(s);
      setRecentSlugs(pushRecentDoc(recentKey, s));
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('slug', s);
        window.history.replaceState({}, '', url.toString());
      }
    };
    if (manifest.docs.some((doc) => doc.slug === slug)) {
      selectAndRecord(slug);
      return;
    }
    const template = [
      '---',
      `title: ${iso}`,
      'tags: [daily]',
      '---',
      '',
      `# ${iso}`,
      '',
      `## ${t('dialog.dailyNoteTasksHeading')}`,
      '',
      '- ',
      '',
      `## ${t('dialog.dailyNoteMemoHeading')}`,
      '',
      '',
    ].join('\n');
    try {
      await localVault.createDoc(slug, template);
      selectAndRecord(slug);
      setEditing(true);
    } catch (err) {
      window.alert(
        t('dialog.dailyNoteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, manifest, localVault, recentKey, setRecentSlugs, t]);

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

  const handleImportVault = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'application/json,.json';
    const chosen: File | null = await new Promise((resolve) => {
      picker.onchange = () => {
        resolve(picker.files?.[0] ?? null);
      };
      picker.click();
    });
    if (!chosen) return;
    let bundle: {
      raws?: Record<string, string>;
      manifest?: { docs?: Array<{ slug: string }> };
    };
    try {
      const text = await chosen.text();
      bundle = JSON.parse(text);
    } catch (err) {
      window.alert(
        t('dialog.jsonParseFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
      return;
    }
    const raws = bundle.raws ?? {};
    const slugs = Object.keys(raws);
    if (slugs.length === 0) {
      window.alert(t('dialog.noValidRaws'));
      return;
    }
    // existing slug Set 한 번 — 이전엔 \`manifest.docs.some(...)\` 를 dedup
    // check 와 import loop 양쪽에서 호출해 O(N×M) 였다. Set lookup 으로 O(N+M).
    const existingSlugSet = new Set(manifest.docs.map((d) => d.slug));
    const existing = slugs.filter((s) => existingSlugSet.has(s));
    let overwrite = false;
    if (existing.length > 0) {
      overwrite = window.confirm(
        t('dialog.importOverwriteConfirm', { count: existing.length }),
      );
    }
    let created = 0;
    let skipped = 0;
    let updated = 0;
    for (const slug of slugs) {
      const content = raws[slug];
      if (typeof content !== 'string') continue;
      const exists = existingSlugSet.has(slug);
      try {
        if (exists) {
          if (overwrite) {
            await localVault.saveDoc(slug, content);
            updated += 1;
          } else {
            skipped += 1;
          }
        } else {
          await localVault.createDoc(slug, content);
          created += 1;
        }
      } catch {
        skipped += 1;
      }
    }
    window.alert(
      t('dialog.importDone', { created, updated, skipped }),
    );
  }, [canEditCurrent, manifest, localVault, t]);

  const handleExportVault = useCallback(async () => {
    if (typeof window === 'undefined') return;
    // 서버 볼트는 manifest 만 읽히지만 raw md 도 클라이언트 fetch 로 묶어
    // 단일 JSON 파일로 다운로드. 로컬 볼트는 fileHandle 로 읽기.
    const fetchRaw = async (slug: string): Promise<string> => {
      if (source === 'local' && localVault.fileHandles.has(slug)) {
        const fh = localVault.fileHandles.get(slug)!;
        const file = await fh.getFile();
        return file.text();
      }
      const res = await fetch(`/docs-vault/${slug}.md`, { cache: 'no-cache' });
      return res.ok ? res.text() : '';
    };
    const raws: Record<string, string> = {};
    for (const d of manifest.docs) {
      try {
        raws[d.slug] = await fetchRaw(d.slug);
      } catch {
        raws[d.slug] = '';
      }
    }
    const bundle = {
      exportedAt: new Date().toISOString(),
      source,
      vaultName:
        source === 'local' ? (localVault.handle?.name ?? 'local') : 'server',
      manifest,
      raws,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    a.href = url;
    a.download = `docs-vault-${bundle.vaultName}-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [manifest, source, localVault]);

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

  const handleCreateNewDoc = useCallback(async () => {
    if (!canEditCurrent) return;
    if (typeof window === 'undefined') return;
    // 현재 선택 문서의 디렉터리를 기본으로 제안. 없으면 루트.
    const currentDir = selectedSlug && selectedSlug.includes('/')
      ? selectedSlug.slice(0, selectedSlug.lastIndexOf('/'))
      : '';
    const suggested = currentDir
      ? `${currentDir}/new-document`
      : 'new-document';
    const input = window.prompt(t('dialog.newDocPrompt'), suggested);
    if (!input) return;
    const slug = input
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.md$/, '');
    if (!slug) return;
    if (manifest.docs.some((d) => d.slug === slug)) {
      window.alert(t('dialog.renameAlreadyExists', { slug }));
      return;
    }
    const title = slug.split('/').pop() ?? slug;
    const template = `---\ntitle: ${title}\n---\n\n# ${title}\n\n`;
    try {
      await localVault.createDoc(slug, template);
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
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, replaceUrlState, setRecentSlugs, t]);

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
  const prevQuerySlug = usePrevious(querySlug);
  useEffect(() => {
    if (prevQuerySlug !== querySlug && querySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(querySlug));
    }
  }, [prevQuerySlug, querySlug, selectedSlug]);
  const prevQueryView = usePrevious(queryView);
  useEffect(() => {
    if (prevQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [prevQueryView, queryView, view]);

  const docsBySlug = useMemo(() => {
    const map = new Map<string, (typeof manifest.docs)[number]>();
    for (const d of manifest.docs) map.set(d.slug, d);
    return map;
  }, [manifest]);
  const vaultSlugs = useMemo(
    () => new Set(manifest.docs.map((d) => d.slug)),
    [manifest],
  );
  const selectedDoc = selectedSlug ? (docsBySlug.get(selectedSlug) ?? null) : null;
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
  const collectionCounts = useMemo<Record<DocsVaultCollection, number>>(
    () => ({
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

  useEffect(() => {
    if (!selectedDoc) return;
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
        collection === 'guides' ? 'README' : null,
        collection === 'guides' ? 'FEATURES' : null,
        collection === 'guides' ? 'PRODUCT-DIRECTION' : null,
        collection === 'guides' ? 'ARCHITECTURE' : null,
        docs[0]?.slug,
      ];
      return (
        candidates.find((slug): slug is string => typeof slug === 'string' && slugs.has(slug)) ??
        null
      );
    },
    [manifest.docs, pinnedSlugs, recentSlugs],
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
    if (selectedSlug && docsBySlug.has(selectedSlug)) return;

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
      if (!querySlug) replaceUrlState({ slug: nextSlug });
    });
  }, [collectionDocSlugs, collectionDocs, collectionPinnedSlugs, collectionRecentSlugs, docsBySlug, querySlug, replaceUrlState, selectedSlug]);

  const handleSelect = useCallback(
    (slug: string, query?: string) => {
      setSelectedSlug(slug);
      setHighlightQuery(query);
      setRecentSlugs(pushRecentDoc(recentKey, slug));
      replaceUrlState({ slug });
    },
    [recentKey, replaceUrlState, setRecentSlugs],
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
  const activeOutlineHeading =
    outlineHeadings.find((h) => h.slug === activeHeadingSlug) ??
    outlineHeadings[0] ??
    null;

  // 전체 명령 목록 — ⌘⇧P 팔레트용. selection/source/editing 등에 따라
  // visible 동적 계산.
  const commands = useMemo<VaultCommand[]>(() => {
    const selectedDocExists = selectedSlug !== null;
    return [
      {
        id: 'palette',
        label: t('commands.openPalette'),
        icon: '🔍',
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
        icon: '📄',
        visible: view !== 'doc',
        onRun: () => handleViewChange('doc'),
      },
      {
        id: 'view-folder-topology',
        label: t('commands.viewFolderTopology'),
        icon: '🗺️',
        visible: source === 'local' && view !== 'folder-topology',
        onRun: () => handleViewChange('folder-topology'),
      },
      {
        id: 'scaffold-topology',
        label: t('commands.scaffoldTopology'),
        icon: '🆕',
        visible: canEditCurrent,
        onRun: () => void handleScaffoldTopology(),
      },
      {
        id: 'create-project',
        label: t('commands.createProject'),
        icon: '🧩',
        visible: canEditCurrent && source === 'local',
        onRun: () => void handleCreateProject(),
      },
      {
        id: 'source-server',
        label: t('commands.sourceServer'),
        icon: '📦',
        visible: source !== 'server',
        onRun: () => handleSourceChange('server'),
      },
      {
        id: 'source-local',
        label: t('commands.sourceLocal'),
        icon: '💾',
        visible: source !== 'local' && localVault.isSupported,
        onRun: () => handleSourceChange('local'),
      },
      {
        id: 'pin-toggle',
        label: pinnedSet.has(selectedSlug ?? '') ? t('commands.unpinDoc') : t('commands.pinDoc'),
        icon: '⭐',
        visible: selectedDocExists,
        onRun: () => selectedSlug && handleTogglePin(selectedSlug),
      },
      {
        id: 'copy-url',
        label: t('commands.copyUrl'),
        icon: '🔗',
        visible: selectedDocExists,
        onRun: () => selectedSlug && void handleCopyUrl(selectedSlug),
      },
      {
        id: 'copy-agent-verify-prompt',
        label: t('commands.copyAgentVerifyPrompt'),
        icon: '🤖',
        visible: source === 'local' && localVault.status === 'loaded',
        onRun: () => void handleCopyAgentVerifyPrompt(),
      },
      {
        id: 'print',
        label: t('commands.print'),
        icon: '🖨️',
        visible: selectedDocExists && view === 'doc',
        onRun: () => {
          if (typeof window !== 'undefined') window.print();
        },
      },
      {
        id: 'edit',
        label: t('commands.edit'),
        icon: '✏️',
        visible: canEditCurrent && selectedDocExists && !editing,
        onRun: () => setEditing(true),
      },
      {
        id: 'new-doc',
        label: t('commands.newDoc'),
        icon: '➕',
        visible: canEditCurrent,
        onRun: () => void handleCreateNewDoc(),
      },
      {
        id: 'daily-note',
        label: t('commands.dailyNote'),
        icon: '📅',
        visible: canEditCurrent,
        onRun: () => void handleDailyNote(),
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
        icon: '🗑️',
        visible: canEditCurrent && selectedDocExists,
        onRun: () => void handleDeleteCurrent(),
      },
      {
        id: 'export-doc-html',
        label: t('commands.exportDocHtml'),
        icon: '📄',
        visible: selectedDocExists && view === 'doc',
        onRun: () => handleExportDocHtml(),
      },
      {
        id: 'export',
        label: t('commands.exportVault'),
        icon: '⬇',
        onRun: () => void handleExportVault(),
      },
      {
        id: 'import',
        label: t('commands.importVault'),
        icon: '⬆',
        visible: canEditCurrent,
        onRun: () => void handleImportVault(),
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
    handleCreateNewDoc,
    handleCreateProject,
    handleDailyNote,
    handleDeleteCurrent,
    handleExportDocHtml,
    handleExportVault,
    handleImportVault,
    handleInsertToc,
    handleViewChange,
    handleRenameCurrent,
    handleScaffoldTopology,
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
    />
  );

  return (
    <div className="relative flex h-screen flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* 상단 바 — workspace 복귀 + 타이틀 + 소스 토글 + 모드 토글 */}
      <header className="flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-2 border-b border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2 md:px-4">
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => setSourceTreeOpen(true)}
            className="inline-flex h-8 flex-none items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-divider)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]"
            aria-label={t('header.openTreeAriaLabel')}
            title={t('header.openTreeTitle')}
          >
            <Menu size={14} aria-hidden />
            <span className="hidden sm:inline">{t('header.openTreeTitle')}</span>
          </button>
          <Link
            href={workspaceHref}
            aria-label={t('header.backToWorkspaceAriaLabel')}
            className="inline-flex h-8 w-8 flex-none items-center justify-center gap-1.5 rounded-full border border-[color:var(--color-divider)] text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] sm:w-auto sm:px-3"
          >
            <ArrowLeft size={12} aria-hidden />
            <span className="hidden sm:inline">{t('header.back')}</span>
          </Link>
          <div className="flex min-w-0 flex-none items-baseline gap-2">
            <h1 className="whitespace-nowrap text-[14px] font-semibold">{t('header.title')}</h1>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)] min-[360px]:inline">
              {t('header.docCount', { count: manifest.docs.length })}
            </span>
          </div>
          {isLocalSourceLoaded ? (
            <span className="hidden items-center gap-1 rounded-sm border border-[color:rgba(139,151,255,0.24)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:rgba(200,210,255,0.86)] min-[460px]:inline-flex">
              <HardDrive size={10} aria-hidden />
              {t('header.localBadge')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={toggleContract}
            aria-expanded={contractOpen}
            aria-controls="docs-source-contract"
            title={contractOpen ? t('header.contractToggleHide') : t('header.contractToggleShow')}
            className="hidden h-8 flex-none items-center gap-1.5 rounded-md border border-[color:var(--color-divider)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] md:inline-flex"
          >
            <PanelTop size={13} aria-hidden />
            <span>{t('header.contractToggleLabel')}</span>
            <ChevronDown
              size={12}
              aria-hidden
              className={`transition-transform ${contractOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <Tooltip content={t('header.topologyTooltip')} withProvider={false}>
            <Link
              href="/topology/"
              aria-label={t('header.topologyAriaLabel')}
              className="ml-auto inline-flex h-8 w-8 flex-none items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(94,106,210,0.08)] text-[12px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.5)] hover:bg-[color:rgba(94,106,210,0.14)] hover:text-[color:var(--color-text-primary)] sm:w-auto sm:px-2 md:ml-0 md:px-2.5"
            >
              <Network size={13} aria-hidden />
              <span className="hidden sm:inline">{t('header.topology')}</span>
            </Link>
          </Tooltip>
        </div>
        <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 md:ml-auto md:w-auto">
          {/* Source 토글 — 이전엔 advanced dropdown 안 깊숙이 묻혀 있던 가장
              중요한 결정 (샘플 vs 내 vault) 를 헤더에 직접 노출. */}
          <div
            className="flex items-center gap-0.5 rounded-md border border-[color:var(--color-border-soft)] p-0.5 text-[11px]"
            role="radiogroup"
            aria-label={t('header.sourceAriaLabel')}
          >
            <button
              type="button"
              role="radio"
              aria-checked={source === 'server'}
              onClick={() => handleSourceChange('server')}
              className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 transition-colors ${
                source === 'server'
                  ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
                  : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
              }`}
            >
              <Package size={11} aria-hidden />
              {t('advanced.sourceServer')}
            </button>
            <Tooltip
              content={
                !isDesktopRuntime
                  ? t('vaultStatus.desktopOnlyTooltip')
                  : localVault.status === 'unsupported'
                  ? t('vaultStatus.unsupportedTooltip')
                  : t('vaultStatus.localTooltip')
              }
              withProvider={false}
            >
              <button
                type="button"
                role="radio"
                aria-checked={source === 'local'}
                disabled={localSourceDisabled}
                aria-describedby={
                  localSourceDisabled
                    ? 'docs-vault-local-unsupported-hint'
                    : undefined
                }
                onClick={() => handleSourceChange('local')}
                className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  source === 'local'
                    ? 'bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
                    : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]'
                }`}
              >
                <HardDrive size={11} aria-hidden />
                {t('advanced.sourceLocal')}
              </button>
            </Tooltip>
            {/* unsupported 상태일 때 sr-only hint 노출 — 시각적으론 disabled
                opacity 와 tooltip 만으로 신호. 스크린리더 사용자는 disabled
                button 만 듣고는 *왜* disabled 인지 모르므로 별도 description. */}
            {localSourceDisabled ? (
              <span
                id="docs-vault-local-unsupported-hint"
                className="sr-only"
              >
                {isDesktopRuntime
                  ? t('vaultStatus.unsupportedTooltip')
                  : t('vaultStatus.desktopOnlyTooltip')}
              </span>
            ) : null}
          </div>
          {localSourceDisabled && !isDesktopRuntime ? (
            <Link
              href="/download/"
              aria-label={t('vaultStatus.downloadAppCta')}
              className="inline-flex h-8 flex-none items-center justify-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.28)] bg-[color:rgba(94,106,210,0.08)] px-2 text-[11px] font-medium text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.48)] hover:bg-[color:rgba(94,106,210,0.14)] hover:text-[color:var(--color-text-primary)]"
            >
              <Download size={12} aria-hidden />
              <span className="hidden min-[360px]:inline">
                {t('vaultStatus.downloadAppCta')}
              </span>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={toggleContract}
            aria-expanded={contractOpen}
            aria-controls="docs-source-contract"
            title={contractOpen ? t('header.contractToggleHide') : t('header.contractToggleShow')}
            className="inline-flex h-8 flex-none items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] md:hidden"
          >
            <PanelTop size={12} aria-hidden />
            <span>{t('header.contractToggleLabel')}</span>
            <ChevronDown
              size={11}
              aria-hidden
              className={`transition-transform ${contractOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <Tooltip content={t('header.paletteTooltip')} withProvider={false}>
            <button
              type="button"
              onClick={() => {
                setAdvancedOpen(false);
                setPaletteQuery('');
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.28)] hover:text-[color:var(--color-text-primary)]"
              aria-label={t('header.paletteAriaLabel')}
            >
              <Search size={13} aria-hidden />
              <kbd className="hidden rounded border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] md:inline-flex">
                ⌘K
              </kbd>
            </button>
          </Tooltip>
          {selectedDoc && !editing && !showDesktopWelcome ? (
            <Tooltip content={t('header.inspectorTooltip')} withProvider={false}>
              <button
                type="button"
                onClick={() => setDocInspectorOpen((open) => !open)}
                aria-expanded={docInspectorOpen}
                aria-label={
                  docInspectorOpen
                    ? t('header.closeInspectorAriaLabel')
                    : t('header.openInspectorAriaLabel')
                }
                className={`hidden h-8 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors lg:inline-flex ${
                  docInspectorOpen
                    ? 'border-[color:rgba(139,151,255,0.38)] bg-[color:rgba(94,106,210,0.1)] text-[color:rgba(200,210,255,0.95)]'
                    : 'border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(139,151,255,0.28)] hover:text-[color:var(--color-text-primary)]'
                }`}
              >
                <PanelRight size={13} aria-hidden />
                <span>{t('header.inspector')}</span>
              </button>
            </Tooltip>
          ) : null}
          {/* 로컬 vault 도구 패널 — server source 일 땐 dropdown 자체 숨김
              (보일 컨텐츠 0). local source 일 때만 vault picker / scaffold
              / new doc / folder-topology 토글 노출. */}
          {source === 'local' ? (
            <div className="relative" ref={advancedMenuRef}>
              <Tooltip content={t('header.vaultToolsTooltip')} withProvider={false}>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                  aria-haspopup="menu"
                  aria-label={t('header.vaultToolsAriaLabel')}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.28)] hover:text-[color:var(--color-text-primary)]"
                >
                  <Settings2 size={13} aria-hidden />
                </button>
              </Tooltip>
              {advancedOpen ? (
                <VaultToolsMenu
                  view={view}
                  onViewChange={handleViewChange}
                  folderTopoStatus={folderTopoStatus}
                  canEditCurrent={canEditCurrent}
                  localVault={localVault}
                  validationSummary={localVaultValidationSummary}
                  onCreateNewDoc={handleCreateNewDoc}
                  onOpenWorkflowGuide={handleOpenAgentGraphWorkflowGuide}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/* Round 9 cut — local source 인데 vault 가 error / permission-needed
          상태일 때 명시 banner. 이전엔 silent 으로 server 매니페스트 (샘플
          docs) 가 표시돼 사용자가 자기 vault 가 죽었음을 모름. picker 토글로
          바로 fix 가능 (헤더 우측 gear). */}
      {source === 'local' &&
      (localVault.status === 'error' ||
        localVault.status === 'permission-needed') ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-[color:rgba(229,72,77,0.32)] bg-[color:rgba(229,72,77,0.08)] px-4 py-2 text-[12px] text-[color:var(--color-status-danger)]"
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
            onClick={() => setAdvancedOpen(true)}
            className="rounded-sm border border-[color:rgba(229,72,77,0.32)] px-2 py-0.5 text-[11px] transition-colors hover:bg-[color:rgba(229,72,77,0.14)]"
          >
            {t('vaultStatus.openPicker')}
          </button>
        </div>
      ) : null}

      {showDesktopWelcome ? (
        <DesktopVaultWelcome
          status={localVault.status}
          recentVaults={localVault.recentVaults}
          onOpen={() => void openLocalVault()}
          onOpenRecent={(record) => void localVault.openRecent(record)}
          onOpenSample={() => handleSourceChange('server')}
          t={t}
        />
      ) : (
        <>
          <DocsVaultSourceContractBar
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
            t={t}
          />
          <div className="flex min-h-0 flex-1">
        {/* Source tree drawer — tree navigation is intentionally opt-in so the
            document/work surface stays primary on desktop and mobile. */}
        {sourceTreeOpen ? (
          <div className="fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-[color:rgba(0,0,0,0.5)]"
              onClick={() => setSourceTreeOpen(false)}
              aria-hidden
            />
            <aside className="relative flex w-[300px] max-w-[84vw] flex-col overflow-auto border-r border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] shadow-[0_0_24px_rgba(0,0,0,0.5)] md:w-[340px]">
              <div className="flex h-12 flex-none items-center justify-between border-b border-[color:var(--color-border-soft)] px-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {t('mobileDrawer.title')}
                </span>
                <button
                  type="button"
                  onClick={() => setSourceTreeOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-sm text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                  aria-label={t('mobileDrawer.closeAriaLabel')}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
              <div className="flex flex-1 flex-col overflow-auto">
                {sidebarBody}
              </div>
            </aside>
          </div>
        ) : null}

        {/* 본문 + 우측 사이드 */}
        <main id="main" className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {view === 'folder-topology' ? (
            <div className="relative flex min-h-0 flex-1">
              {canEditCurrent && folderTopo && folderTopo.projects.length > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  className="pointer-events-auto absolute left-3 top-[46px] z-10 inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.1)] px-2.5 py-1.5 text-[11.5px] text-[color:rgba(200,210,255,0.92)] shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:bg-[color:rgba(94,106,210,0.18)]"
                  title={t('topology.addProjectTitle', { slug: '{slug}' })}
                >
                  <FilePlus size={12} aria-hidden />
                  {t('topology.addProjectLabel')}
                </button>
              ) : null}
              {folderTopo && folderTopo.projects.length > 0 ? (
                <DocsVaultFolderTopology
                  build={folderTopo}
                  selectedSlug={selectedSlug}
                  onSelect={(slug) => {
                    handleSelect(`projects/${slug}`);
                    handleViewChange('doc');
                  }}
                  onPositionChange={
                    canEditCurrent
                      ? (slug, pos) => {
                          void localVault.updateFrontmatter(
                            `projects/${slug}`,
                            { positionX: pos.x, positionY: pos.y },
                            { skipRefresh: true },
                          );
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <FolderCog
                    size={28}
                    className="text-[color:var(--color-text-quaternary)]"
                    aria-hidden
                  />
                  <div className="text-[14px] text-[color:var(--color-text-primary)]">
                    {t('topology.emptyTitle')}
                  </div>
                  <p className="max-w-[440px] text-[12.5px] leading-[1.6] text-[color:var(--color-text-tertiary)]">
                    {t('topology.emptyBody')}
                  </p>
                  {folderTopoError ? (
                    <p className="font-mono text-[11px] text-[color:rgba(239,180,120,0.9)]">
                      {folderTopoError}
                    </p>
                  ) : null}
                  {canEditCurrent ? (
                    <button
                      type="button"
                      onClick={() => void handleScaffoldTopology()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[color:rgba(139,151,255,0.4)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 text-[12px] text-[color:rgba(200,210,255,0.95)] transition-colors hover:border-[color:rgba(139,151,255,0.6)] hover:bg-[color:rgba(94,106,210,0.14)]"
                    >
                      <FolderCog size={12} aria-hidden />
                      {t('topology.scaffoldCta')}
                    </button>
                  ) : (
                    <p className="font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
                      {t('topology.needEditPermission')}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : selectedDoc ? (
            <div className="flex min-h-0 flex-1">
              <div
                ref={articleScrollRef}
                className="min-w-0 flex-1 overflow-auto"
              >
                {editing && canEditCurrent && editResolver ? (
                  <DocsVaultEditor
                    key={`edit:${source}:${selectedDoc.slug}`}
                    doc={selectedDoc}
                    getDocContent={editResolver}
                    onSave={(slug, content) =>
                      // conflict 를 swallow 하지 않고 re-throw — 그래야 에디터가
                      // 버퍼를 dirty 로 유지해 다음 poll 의 clobber 를 막는다.
                      // (구버전은 여기서 return 으로 삼켜 phantom-clean → 데이터 손실)
                      persistEditorSave(
                        localVault.saveDoc,
                        { slug, content, expectedMtime: selectedDoc.mtime },
                        () => toast.show(t('dialog.vaultConflict'), 'error'),
                      )
                    }
                    onClose={() => setEditing(false)}
                    allDocs={manifest.docs}
                  />
                ) : (
                  <>
                    <DocMetaBar doc={selectedDoc} />
                    {selectedDoc.slug.startsWith('projects/') &&
                    source === 'local' ? (
                      <DocsVaultProjectDepsBar
                        currentSlug={selectedDoc.slug.replace(
                          /^projects\//,
                          '',
                        )}
                        build={folderTopo}
                        canEdit={canEditCurrent}
                        onChange={async (next) => {
                          try {
                            await localVault.updateFrontmatter(
                              selectedDoc.slug,
                              { dependencies: next },
                              { expectedMtime: selectedDoc.mtime },
                            );
                          } catch (err) {
                            if (err instanceof VaultConflictError) {
                              toast.show(t('dialog.vaultConflict'), 'error');
                              return;
                            }
                            throw err;
                          }
                          // manifest refresh 후 folderTopo 도 갱신
                          await buildFolderTopology();
                        }}
                        onNavigateProject={(slug) =>
                          handleSelect(`projects/${slug}`)
                        }
                      />
                    ) : null}
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
                    />
                  </>
                )}
              </div>
              {/* 우측 사이드: heading outline + backlinks. 기본은 닫아 본문을
                  우선하고, 필요할 때만 헤더의 인스펙터 버튼으로 연다. */}
              {!editing && docInspectorOpen ? (
                <DocsVaultDocOutlinePanel
                  selectedDoc={selectedDoc}
                  pinnedSet={pinnedSet}
                  copiedSlug={copiedSlug}
                  canEditCurrent={canEditCurrent}
                  outlineHeadings={outlineHeadings}
                  activeOutlineHeading={activeOutlineHeading}
                  activeHeadingSlug={activeHeadingSlug}
                  backlinksDetail={backlinksDetail}
                  docsBySlug={docsBySlug}
                  onTogglePin={handleTogglePin}
                  onStartEditing={() => setEditing(true)}
                  onClose={() => setDocInspectorOpen(false)}
                  onCopyUrl={handleCopyUrl}
                  onDeleteCurrent={handleDeleteCurrent}
                  onNavigate={handleSelect}
                  onHeadingClick={(slug) => {
                    document
                      .getElementById(slug)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    setActiveHeadingSlug(slug);
                    if (typeof window !== "undefined") {
                      window.history.replaceState(
                        {},
                        "",
                        `${window.location.pathname}${window.location.search}#${slug}`,
                      );
                    }
                  }}
                />
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
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function DocsVaultPage() {
  // local-first 핵심 (`.claude/rules/local-first.md` §1) — vault picker 진입은
  // 인증 게이트 없음. 사용자 로컬 디스크가 진실원.
  return (
    <Suspense fallback={null}>
      <DocsVaultContent />
    </Suspense>
  );
}
