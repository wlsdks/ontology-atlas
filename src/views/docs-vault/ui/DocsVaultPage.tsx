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
import { Link, useRouter } from '@/i18n/navigation';
import { getTopologyProjectHref } from '@/entities/project';
import { usePathname, useSearchParams } from 'next/navigation';
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
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import {
  VaultConflictError,
  useLocalVault,
  useStaticVaultSource,
  useVaultSessionIdentityScope,
  VaultSourceHydrationBoundary,
  type ReferrerRewriteReport,
} from '@/entities/vault-session';
import {
  OntologyStarterCta,
  buildOntologyStarterAgentVerifyPrompt,
} from '@/features/docs-vault-local';
import { AppSettingsMenu } from '@/widgets/app-settings-menu';
import { useNavRailSettingsSlot } from '@/widgets/app-nav-rail';
import { copyText } from '@/shared/lib/copy-text';
import { codedFailure } from '@/shared/lib/failure-code';
import { vaultImageUrl } from '@/shared/lib/open-vault-file';
import { useFailureSentence } from '@/shared/lib/use-failure-sentence';
import { useTypingShortcuts } from '@/shared/lib/use-typing-shortcut';
import { useClaimShellKey } from '@/shared/lib/shell-key-claims';
import { usePrevious } from '@/shared/lib/use-previous';
import { cn } from '@/shared/lib/cn';
import { useDocumentTitle } from '@/shared/lib/use-document-title';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import { useHydrated } from '@/shared/lib/use-hydrated';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
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
import { buildDocsVaultPopoutHtml } from '../lib/popout-template';
import { useReviewQueue } from '../lib/use-review-queue';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { useAdvancedMenu } from '../lib/use-advanced-menu';
import { useDocsVaultPersistence } from '../lib/use-docs-vault-persistence';
import {
  DocReadingPane,
  shouldShowOutlineRail,
  useBackToTop,
  useDocReadingScrollSpy,
} from '@/widgets/doc-reading-pane';
import { usePaletteState } from '../lib/use-palette-state';
import { replaceDocsVaultUrlState, settleDocsVaultAddress } from '../lib/url-state';
import {
  parseDocsTreeGroup,
  parseDocsTreeSort,
  type DocsTreeGroup,
  type DocsTreeSort,
  DocsVaultBacklinks,
  DocsVaultEditor,
  DocsVaultUnifiedPalette,
  DocsVaultViewer,
  ONTOLOGY_ATLAS_REPO_BLOB_BASE,
  DOCS_VAULT_REPO_ROOT,
  PINNED_DOCS_STORAGE_PREFIX,
  useDocsBodyIndex,
  migrateLegacyRecentDocs,
  pushRecentDoc,
  RECENT_DOCS_STORAGE_PREFIX,
} from '@/widgets/docs-vault';
import {
  buildTagIndexForDocs,
  filterDocsByCollection,
  isAuthorableOntologyDocument,
  followMovedSlugs,
  resolveDocsVaultSlugAlias,
  resolveDocsVaultCollection,
  resolveInitialDocsCollection,
  shouldDeferDocsVaultDefaultSelection,
  shouldShowSampleWelcomeNote,
  type DocsVaultCollection,
  type DocsVaultDocCollection,
  isArchitectureProfile,} from '../lib/docs-vault-collection';
import {
  buildDocsVaultHref,
  buildNewNodeDoc,
  buildOntologyDeeplinkForDoc,
  buildTopologyDeeplinkForDoc,
  deriveOntologyFromVault,
  type VaultManifest,
  loadStaticVaultHeadings,
  resolveStaticVaultSource,
  type StaticVaultHeadings,
  reviewDigest,
  planKindChangeReferrers,
  type FrontmatterUpdateValue,
} from '@/entities/docs-vault';
import type { VaultCommand } from '@/widgets/docs-vault';

const subscribeDesktopRuntime = () => () => undefined;
const readDesktopRuntime = () => isTauriVaultRuntime();
const readServerDesktopRuntime = () => false;
/** How many referrer names a kind-change receipt spells out before it counts the rest. */
const REFERRER_NAMES_SHOWN = 3;

// An updater can run during render, so the write goes to a microtask.
function storeSlugListSoon(storageKey: string, slugs: readonly string[]): void {
  queueMicrotask(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(slugs));
    } catch {
      /* ignore */
    }
  });
}

function readVaultFileText(handles: Pick<Map<string, { getFile(): Promise<File> }>, 'get'>) {
  return async (slug: string) => {
    const fh = handles.get(slug);
    if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
    const file = await fh.getFile();
    return file.text();
  };
}

function splitVaultSlugPath(slug: string): { dir: string; name: string } {
  const parts = slug.split('/');
  const name = parts.pop() ?? slug;
  return { dir: parts.length > 0 ? `${parts.join('/')}/` : '', name };
}

import { DocMetaBar } from "./parts/DocMetaBar";
import { DesktopVaultWelcome } from "./parts/DesktopVaultWelcome";
import { recentVaultRowKey } from "@/features/vault-switch";
import {
  DocFrontmatterBlock,
  useReferrerListName,
  type DocFrontmatterPatch,
} from "./parts/DocFrontmatterBlock";
import { DocsSidebarBody } from "./parts/DocsSidebarBody";
import { useAgentFilesModel } from "../lib/use-agent-files";
import { useSkillParity } from "../lib/use-skill-parity";
import { buildSkillParityHandoff } from "../lib/skill-parity-handoff";
import type { SkillParityRow } from "../lib/skill-parity";
import { SampleNotice } from "./parts/SampleNotice";
import { SampleWelcomeNote } from "./parts/SampleWelcomeNote";
import { EmptyState } from "./parts/EmptyState";
import { DocsHeaderTile } from "./parts/DocsHeaderTile";
import { DocsVaultVaultChip } from "./parts/DocsVaultVaultChip";
import { DocsVaultAuditModal } from "./parts/DocsVaultAuditModal";
import { DocsVaultTabStrip } from "./parts/DocsVaultTabStrip";
import { NewDocKindDialog, type NewDocKind } from "./parts/NewDocKindDialog";
import { RenameDocDialog, type RenameDocTarget } from "./parts/RenameDocDialog";
import { DeleteDocDialog, type DeleteDocTarget } from "./parts/DeleteDocDialog";
import { reclassifyMoveTarget } from "../lib/kind-folder-move";
import { kindChangeReceipt } from "../lib/kind-change-receipt";
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
  buildTopologyReturnHref,
  buildTopologyReturnMarker,
  parseInsightsReturnMarker,
  parseTopologyReturnMarker,
} from "@/entities/knowledge-graph";

function DocsVaultContent({
  initialCollection,
  documentScope,
  legacyEntry,
}: {
  initialCollection: DocsVaultDocCollection;
  documentScope: 'all' | 'ontology';
  legacyEntry: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const t = useTranslations('docsVault');
  const locale = useLocale();
  const referrerListName = useReferrerListName();
  const siteT = useTranslations('metadata');
  const tSkillParity = useTranslations('skillParity');
  const searchParams = useSearchParams();
  const routePathname = usePathname();
  const querySlug = searchParams?.get('slug') ?? null;
  const queryView = parseView(searchParams?.get('view'));
  const querySource = parseDocsVaultSource(searchParams?.get('source'));
  const querySample =
    searchParams?.get('sample') === 'dogfood' ? 'dogfood' : null;
  const queryDogfood = searchParams?.get('dogfood') ?? null;
  const localVault = useLocalVault();
  const router = useRouter();
  const hydrated = useHydrated();
  const installedShell = hydrated && isDesktopShell();
  const localWinsInitialSource =
    Boolean(localVault.manifest) && (installedShell || querySource !== 'server');
  // An unknown order value falls back to the default.
  const queryTreeSort = parseDocsTreeSort(searchParams?.get('sort'));
  const queryTreeGroup = parseDocsTreeGroup(searchParams?.get('group'));
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams?.get('via'),
  );
  const insightsReviewId = insightsReturnTab
    ? searchParams?.get('review') ?? null
    : null;
  // `via=topology:<nodeId>` sends the crumb back to that node, selected.
  const topologyReturnNode = parseTopologyReturnMarker(searchParams?.get('via'));
  const projectsListHref = '/projects/';
  // On a hard navigation `/` falls through to the gateway before the vault restores,
  // so the crumb goes straight to the map.
  const workspaceHref = insightsReturnTab
    ? buildOntologyInsightsReturnHref(insightsReturnTab, insightsReviewId)
    : topologyReturnNode
      ? buildTopologyReturnHref(topologyReturnNode)
      : '/topology';
  const getDocHref = useCallback(
    (slug: string, hash?: string) =>
      buildDocsVaultHref({
        slug,
        hash,
        // Keep the origin across in-vault hops so the crumb keeps its way back.
        via: insightsReturnTab
          ? `insights:${insightsReturnTab}`
          : topologyReturnNode
            ? buildTopologyReturnMarker(topologyReturnNode)
            : null,
        reviewId: insightsReviewId,
      }),
    [insightsReturnTab, insightsReviewId, topologyReturnNode],
  );
  // `/?p=` loses its query in the locale-less root redirect; link /topology directly.
  const getProjectHref = useCallback(
    (slug: string) => getTopologyProjectHref(slug),
    [],
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(querySlug);
  // A truthy `openWith` opens the palette; its value is the initial query (`>`, `#`, ``).
  const { paletteQuery, setPaletteQuery, paletteOpen } = usePaletteState();
  const [paletteOpened, setPaletteOpened] = useState(false);
  if (paletteOpen && !paletteOpened) setPaletteOpened(true);
  const vaultSessionScope = useVaultSessionIdentityScope();
  const [view, setView] = useState<DocsVaultView>(queryView);
  // No visible menu remains; other surfaces still call `setAdvancedOpen(false)` to close popovers.
  const { setOpen: setAdvancedOpen } = useAdvancedMenu();
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
  // Set when the reader picks a real document; `shouldShowSampleWelcomeNote` combines it.
  const [sampleWelcomeDismissed, setSampleWelcomeDismissed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [docCollection, setDocCollection] =
    useState<DocsVaultCollection>(initialCollection);
  const [treeSort, setTreeSort] = useState<DocsTreeSort>(queryTreeSort);
  const [treeGroup, setTreeGroup] = useState<DocsTreeGroup>(queryTreeGroup);
  // A loaded local vault starts local; `?intent=local` switches after mount, in the effect below.
  const [source, setSource] = useState<Source>(() =>
    localWinsInitialSource ? 'local' : querySource ?? 'server',
  );
  const [staticSampleOverride, setStaticSampleOverride] = useState<
    'dogfood' | null
  >(querySample);
  // Do not select the default README until the stored source is read, or a local
  // deeplink is overwritten by the server manifest.
  const [sourcePreferenceHydrated, setSourcePreferenceHydrated] =
    useState(() => localWinsInitialSource);
  // The rail gear owns settings at lg+; below lg the header chrome tile does.
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
  // `searchParams` can be stale at SSR time, so read `window.location` after mount.
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
    // Mount only, so a closed panel does not reopen on reload.
  }, [isDesktopRuntime, querySource, setAdvancedOpen]);
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  // Collapsed means width 0, persisted as a workspace preference.
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
  const localVaultStatus = localVault.status;
  // Distinguishes "not known yet" from "confirmed absent"; the landing decision waits on it.
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
    // A build with no configured path does nothing rather than open a path that does not exist.
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

  const {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin: handleTogglePin,
  } = useDocsVaultPersistence({ source, localVault });

  const replaceUrlState = replaceDocsVaultUrlState;
  const generalDocsHref = useCallback((slug: string) => {
    const query = new URLSearchParams(searchParams?.toString());
    query.delete('tab');
    query.set('slug', slug);
    const suffix = query.toString();
    return `/docs/${suffix ? `?${suffix}` : ''}${typeof window === 'undefined' ? '' : window.location.hash}`;
  }, [searchParams]);
  const legacyLibraryRedirectHref = useCallback(() => {
    const query = new URLSearchParams(searchParams?.toString());
    query.set('tab', 'ontology');
    const suffix = query.toString();
    return `/library/${suffix ? `?${suffix}` : ''}${typeof window === 'undefined' ? '' : window.location.hash}`;
  }, [searchParams]);
  const libraryOntologyHref = useMemo(() => {
    const query = new URLSearchParams(searchParams?.toString());
    query.delete('slug');
    query.delete('view');
    query.set('tab', 'ontology');
    const suffix = query.toString();
    return `/library/${suffix ? `?${suffix}` : ''}`;
  }, [searchParams]);

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
    setRecentSlugs(pushRecentDoc('server', slug));
    setAdvancedOpen(false);
    router.push(`/docs/?source=server&sample=dogfood&slug=${slug}&view=doc`);
  }, [router, setAdvancedOpen, setRecentSlugs]);

  useEffect(() => {
    migrateLegacyRecentDocs();
    // A mounted local vault wins on landing; `?source=server` stays a web-only choice.
    if (localVault.manifest && (installedShell || querySource !== 'server')) {
      scheduleStateSync(() => {
        setSource('local');
        setSourcePreferenceHydrated(true);
      });
      return;
    }
    // The installed shell never revives the stored web/sample preference.
    if (installedShell) return;
    if (querySource) {
      scheduleStateSync(() => {
        setSource(querySource);
        setSourcePreferenceHydrated(true);
      });
      return;
    }
    // `?intent=local` holds in every runtime; the mount effect above switches the source.
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
  }, [installedShell, isDesktopRuntime, localVault.manifest, querySource]);

  // Once per mount, when the restore attempt finishes, prefer a live local vault over a
  // stored sample preference; not persisted.
  const [landingSourceResolved, setLandingSourceResolved] = useState(
    () => localWinsInitialSource,
  );
  useEffect(() => {
    if (landingSourceResolved) return;
    if (!sourcePreferenceHydrated || !localVaultRestoreAttempted) return;
    setLandingSourceResolved(true);
    if (
      shouldPreferLocalOnLanding(
        localVaultStatus,
        source,
        querySource,
        localVault.awaitingVaultChoice,
      )
    ) {
      setSource('local');
    }
  }, [
    landingSourceResolved,
    sourcePreferenceHydrated,
    localVaultRestoreAttempted,
    localVaultStatus,
    localVault.awaitingVaultChoice,
    querySource,
    source,
  ]);
  /**
   * One predicate for scope-switch cleanup, the missing-document banner and default
   * selection: any earlier decision mistakes the boot-time sample window for reality.
   */
  const localSourceReady =
    localVaultStatus === 'loaded' || localVault.isReloadingSameVault;
  const showDesktopWelcome = shouldShowDesktopVaultWelcome({
    isDesktopRuntime,
    source,
    localVaultStatus,
    hasLocalManifest: Boolean(localVault.manifest),
  });
  const vaultScopeSettled =
    sourcePreferenceHydrated &&
    landingSourceResolved &&
    // A local source with no manifest is settled too: the folder picker owns the screen.
    (source === 'server' || localSourceReady || showDesktopWelcome);

  // Always starts closed; a modal on every load violates modality.
  const [contractOpen, setContractOpen] = useState(false);
  const openContract = useCallback(() => {
    // Single-transient rule: opening a modal closes the other popovers.
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setContractOpen(true);
  }, [setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  const closeContract = useCallback(() => setContractOpen(false), []);

  /** The toast confirms the copy, including failure, since clipboard permission can be refused silently. */
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
    // The builder knows the vault path; a fixed `.` points at whatever folder the agent runs in.
    const copied = await copyText(
      buildOntologyStarterAgentVerifyPrompt(
        (localVault.handle ? getTauriVaultRootPath(localVault.handle) : null) ?? '.',
      ),
    );
    toast.show(
      copied ? t('dialog.agentVerifyPromptCopied') : t('dialog.agentVerifyPromptCopyFailed'),
      copied ? 'success' : 'error',
    );
    // `localVault.handle` stays in the deps: the prompt carries the vault's absolute path.
  }, [localVault.handle, t, toast]);

  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocReadingScrollSpy(selectedSlug, source);
  const backToTop = useBackToTop(articleScrollRef, selectedSlug);

  // Fall back to the sample only when FSA is unsupported; a local web session is valid.
  useEffect(() => {
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
    // The installed app has no bundled sample; legacy commands and links must not reopen it.
    if (installedShell && next === 'server') return;
    setSource(next);
    setStaticSampleOverride(null);
    storeSource(next);
  // The same slug rarely exists in both vaults.
    setSelectedSlug(null);
    setActiveTag(null);
  // Re-show the welcome note on every entry into sample mode.
    if (next === 'server') setSampleWelcomeDismissed(false);
    replaceUrlState(
      next === 'server'
        ? { slug: null, view, intent: null, source: null, sample: null }
        : { slug: null, view, source: null, sample: null },
    );
  // The native picker opens only from the welcome screen's "open folder".
    if (next === 'local' && isDesktopRuntime && localVault.status !== 'loaded') {
      localIntentAutoOpenRef.current = true;
      setAdvancedOpen(false);
    }
  }, [installedShell, isDesktopRuntime, replaceUrlState, view, localVault.status, setAdvancedOpen]);

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


  // The static fallback follows the sample the user chose, matching the map.
  const preferredStaticVault = useStaticVaultSource();
  const staticVault = staticSampleOverride
    ? resolveStaticVaultSource(staticSampleOverride)
    : preferredStaticVault;
  const manifest: VaultManifest =
    isLocalSourceLoaded && localVault.manifest
      ? localVault.manifest
      : staticVault.manifest;
  const normalizedQuerySlug = useMemo(
    () => resolveDocsVaultSlugAlias(querySlug, manifest.docs, manifest.aliases),
    [manifest.aliases, manifest.docs, querySlug],
  );
  const legacyTargetDoc = useMemo(
    () => legacyEntry && normalizedQuerySlug
      ? manifest.docs.find((doc) => doc.slug === normalizedQuerySlug) ?? null
      : null,
    [legacyEntry, manifest.docs, normalizedQuerySlug],
  );
  const legacyDocumentMode = Boolean(
    legacyTargetDoc && !isAuthorableOntologyDocument(legacyTargetDoc),
  );
  const legacyRedirectToLibrary = legacyEntry && !legacyDocumentMode;
  const scopedDocs = useMemo(
    () => legacyDocumentMode && legacyTargetDoc
      ? [legacyTargetDoc]
      : documentScope === 'ontology'
      ? manifest.docs.filter(isAuthorableOntologyDocument)
      : manifest.docs,
    [documentScope, legacyDocumentMode, legacyTargetDoc, manifest.docs],
  );
  const scopedDocSlugs = useMemo(
    () => new Set(scopedDocs.map((doc) => doc.slug)),
    [scopedDocs],
  );

  // Bundled headings live in a lazily loaded chunk (`entities/docs-vault/lib/static-headings.ts`);
  // use the map only for the vault currently drawn.
  const [staticHeadingsBundle, setStaticHeadingsBundle] = useState<{
    source: string;
    map: StaticVaultHeadings;
  } | null>(null);
  useEffect(() => {
    if (isLocalSourceLoaded) return undefined;
    let cancelled = false;
    loadStaticVaultHeadings(staticVault.source)
      .then((map) => {
        if (!cancelled) setStaticHeadingsBundle({ source: staticVault.source, map });
      })
      .catch(() => {
        // The outline is supplementary; a load failure must not block the page.
      });
    return () => {
      cancelled = true;
    };
  }, [isLocalSourceLoaded, staticVault.source]);
  const staticHeadings =
    staticHeadingsBundle && staticHeadingsBundle.source === staticVault.source
      ? staticHeadingsBundle.map
      : null;
  const ontologyDerivation = useMemo(
    () => deriveOntologyFromVault(manifest),
    [manifest],
  );

  // With no file handles yet, fall back to a server fetch so demo content shows.
  const getDocContent = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    if (source !== 'local') return undefined;
    if (localVault.fileHandles.size === 0) return undefined;
    return readVaultFileText(localVault.fileHandles);
  }, [source, localVault.fileHandles]);

  const resolveImage = useMemo<
    ((path: string) => Promise<string | null>) | undefined
  >(() => {
    if (source !== 'local') return undefined;
    const handles = localVault.imageHandles;
    return async (path: string) => {
      const fh = handles.get(path);
      if (!fh) return null;
      return vaultImageUrl(await fh.getFile());
    };
  }, [source, localVault.imageHandles]);

  const canEditCurrent = isLocalSourceLoaded;
  const editResolver = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    if (!canEditCurrent) return undefined;
    return readVaultFileText(localVault.fileHandles);
  }, [canEditCurrent, localVault.fileHandles]);
  useEffect(() => {
    if (!canEditCurrent) scheduleStateSync(() => setEditing(false));
  }, [canEditCurrent]);
  useEffect(() => {
    scheduleStateSync(() => setEditing(false));
  }, [selectedSlug]);

  // Rename and delete open `RenameDocDialog` and `DeleteDocDialog`, from the header and the palette.
  const failureSentence = useFailureSentence();
  // Names of documents pointing at `slug`, from the manifest's backlink index.
  const referrersOf = useCallback(
    (slug: string) => {
      const seen = new Set<string>();
      const referrers: Array<{ slug: string; title: string }> = [];
      for (const entry of manifest.backlinksDetail?.[slug] ?? []) {
        if (entry.fromSlug === slug || seen.has(entry.fromSlug)) continue;
        seen.add(entry.fromSlug);
        const doc = manifest.docs.find((d) => d.slug === entry.fromSlug);
        referrers.push({
          slug: entry.fromSlug,
          title: doc ? resolveLocaleDisplayName(doc.frontmatter, locale, doc.title) : entry.fromSlug,
        });
      }
      return referrers;
    },
    [manifest, locale],
  );
  // Rename, kind change and folder move share this move. Everything naming the old address
  // follows it, and the new name is "not known yet" until the manifest has it, so the
  // missing-document banner does not fire.
  const moveDoc = useCallback(
    async (
      fromSlug: string,
      toSlug: string,
      options: { expectedMtime?: number; frontmatterUpdates?: Record<string, FrontmatterUpdateValue> } = {},
    ): Promise<ReferrerRewriteReport> => {
      if (manifest.docs.some((d) => d.slug === toSlug)) {
        throw codedFailure('already-exists', `${toSlug}.md`);
      }
      const report = await localVault.renameDoc(fromSlug, toSlug, { rewriteBacklinks: true, ...options });
      appTouchedSlugsRef.current = new Set([fromSlug, toSlug]);
      setSelectedSlug(toSlug);
      replaceUrlState({ slug: toSlug });
      setRecentSlugs((list) => {
        const mapped = list.map((s) => (s === fromSlug ? toSlug : s));
        storeSlugListSoon(`${RECENT_DOCS_STORAGE_PREFIX}${recentKey}`, mapped);
        return mapped;
      });
      setPinnedSlugs((list) => {
        const mapped = list.map((s) => (s === fromSlug ? toSlug : s));
        storeSlugListSoon(`${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`, mapped);
        return mapped;
      });
      return report;
    },
    [manifest, localVault, recentKey, replaceUrlState, setPinnedSlugs, setRecentSlugs],
  );

  const [deleteTarget, setDeleteTarget] = useState<DeleteDocTarget | null>(null);
  const handleDeleteCurrent = useCallback(() => {
    if (!canEditCurrent || !selectedSlug) return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    // Clear what would stand above the scrim.
    toast.dismiss();
    setDeleteTarget({
      slug: doc.slug,
      title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      referrers: referrersOf(doc.slug),
    });
  }, [canEditCurrent, selectedSlug, manifest, locale, referrersOf, toast]);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const slug = deleteTarget.slug;
    // The version the person was shown is the one they agreed to remove.
    const expectedMtime = manifest.docs.find((d) => d.slug === slug)?.mtime;
    await localVault.deleteDoc(slug, { expectedMtime });
    setDeleteTarget(null);
    // Mark the slug as app-touched so the missing-document banner ignores it.
    appTouchedSlugsRef.current = new Set([slug]);
    setSelectedSlug(null);
    replaceUrlState({ slug: null });
    setEditing(false);
    setRecentSlugs((list) => list.filter((s) => s !== slug));
    setPinnedSlugs((list) => {
      const next = list.filter((s) => s !== slug);
      if (next.length !== list.length) {
        storeSlugListSoon(`${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`, next);
      }
      return next;
    });
  }, [deleteTarget, manifest, localVault, recentKey, replaceUrlState, setPinnedSlugs, setRecentSlugs]);

  const handleScaffoldOntologyStarter = useCallback(async () => {
    const result = await localVault.scaffoldOntology(locale);
    setRecentSlugs(pushRecentDoc(recentKey, 'README'));
    setView('doc');
    setAdvancedOpen(false);
    toast.show(
      // Concepts and config files are counted separately.
      t('dialog.ontologyStarterDone', {
        concepts: result.markdownCreated,
        configs: result.agentConfigCreated,
        skipped: result.skipped,
      }),
      'success',
    );
    router.push(generalDocsHref('README'));
    return result;
  }, [
    locale,
    localVault,
    recentKey,
    generalDocsHref,
    router,
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
      toast.show(t('dialog.noHeadings'), 'info');
      return;
    }
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
      toast.show(t('dialog.notLocalFile'), 'error');
      return;
    }
    try {
      const file = await fh.getFile();
      const raw = await file.text();
      let insertAfter = 0;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) insertAfter = end + 4;
        while (raw[insertAfter] === '\n') insertAfter += 1;
      }
      const stripped = raw.replace(
        /<!-- toc:start -->[\s\S]*?<!-- toc:end -->\n?/,
        '',
      );
      // `insertAfter` is not adjusted for the stripped block; safe while the toc sits at the top.
      const head = stripped.slice(0, insertAfter);
      const body = stripped.slice(insertAfter);
      const next = `${head}${tocBlock}\n\n${body}`;
      await localVault.saveDoc(selectedSlug, next, {
        expectedMtime: file.lastModified,
      });
    } catch (err) {
      toast.show(
        err instanceof VaultConflictError
          ? t('dialog.vaultConflict')
          : failureSentence(err, t('dialog.tocFailed')).sentence,
        'error',
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, t, toast, failureSentence]);

  const handleExportDocHtml = useCallback(() => {
    if (!selectedSlug || typeof window === 'undefined') return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    const article = document.querySelector('[data-docs-viewer]');
    if (!article) {
      toast.show(t('dialog.notRendered'), 'info');
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
  }, [selectedSlug, manifest, t, toast]);

  const [renameTarget, setRenameTarget] = useState<RenameDocTarget | null>(null);
  const handleRenameCurrent = useCallback(() => {
    if (!canEditCurrent || !selectedSlug) return;
    const doc = manifest.docs.find((d) => d.slug === selectedSlug);
    if (!doc) return;
    toast.dismiss();
    setRenameTarget({
      slug: doc.slug,
      title: resolveLocaleDisplayName(doc.frontmatter, locale, doc.title),
      referrerCount: referrersOf(doc.slug).length,
    });
  }, [canEditCurrent, selectedSlug, manifest, locale, referrersOf, toast]);
  const confirmRename = useCallback(
    async (nextSlug: string) => {
      if (!renameTarget) return;
      const expectedMtime = manifest.docs.find((d) => d.slug === renameTarget.slug)?.mtime;
      await moveDoc(renameTarget.slug, nextSlug, { expectedMtime });
      setRenameTarget(null);
    },
    [renameTarget, manifest, moveDoc],
  );
  // macOS and Windows keep one file for `Auth.md` and `auth.md`.
  const isSlugTaken = useCallback(
    (slug: string) => {
      const wanted = slug.toLowerCase();
      return manifest.docs.some((d) => d.slug.toLowerCase() === wanted);
    },
    [manifest],
  );

  // New documents pick a kind first, so every document is a node from creation;
  // the map creates nodes with the same `buildNewNodeDoc`.
  const [newDocKindDialogOpen, setNewDocKindDialogOpen] = useState(false);
  const handleOpenNewDocDialog = useCallback(() => {
    if (!canEditCurrent) return;
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setNewDocKindDialogOpen(true);
  }, [canEditCurrent, setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  // Warns about a similar title of the same kind before creating, without blocking;
  // slug collisions are handled separately.
  const [pendingSimilarDoc, setPendingSimilarDoc] = useState<{
    slug: string;
    markdown: string;
    match: SimilarNodeMatch;
  } | null>(null);
  const commitCreateDoc = useCallback(
    async (slug: string, markdown: string) => {
      try {
        await localVault.createDoc(slug, markdown);
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

  // Once on mount, backfill from localStorage when the URL carries no value.
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams?.has('view')) setView(queryView);
    });
  }, [searchParams, queryView]);

  // URL to state only; user actions push state to the URL themselves.
  const outOfScopeQuerySlug =
    documentScope === 'ontology' &&
    !legacyEntry &&
    normalizedQuerySlug &&
    manifest.docs.some((doc) => doc.slug === normalizedQuerySlug) &&
    !scopedDocSlugs.has(normalizedQuerySlug)
      ? normalizedQuerySlug
      : null;
  useEffect(() => {
    if (!vaultScopeSettled || !outOfScopeQuerySlug) return;
    router.replace(generalDocsHref(outOfScopeQuerySlug), { scroll: false });
  }, [generalDocsHref, outOfScopeQuerySlug, router, vaultScopeSettled]);
  useEffect(() => {
    if (!vaultScopeSettled || !legacyRedirectToLibrary) return;
    router.replace(legacyLibraryRedirectHref(), { scroll: false });
  }, [legacyLibraryRedirectHref, legacyRedirectToLibrary, router, vaultScopeSettled]);
  const showSampleWelcomeNote = shouldShowSampleWelcomeNote({
    source,
    normalizedQuerySlug: normalizedQuerySlug ?? selectedSlug,
    dismissed: sampleWelcomeDismissed,
  });
  const prevQuerySlug = usePrevious(normalizedQuerySlug);
  useEffect(() => {
    if (outOfScopeQuerySlug) return;
    if (prevQuerySlug !== normalizedQuerySlug && normalizedQuerySlug !== selectedSlug) {
      scheduleStateSync(() => setSelectedSlug(normalizedQuerySlug));
    }
  }, [normalizedQuerySlug, outOfScopeQuerySlug, prevQuerySlug, selectedSlug]);
  const prevQueryView = usePrevious(queryView);
  useEffect(() => {
    if (prevQueryView !== queryView && queryView !== view) {
      scheduleStateSync(() => setView(queryView));
    }
  }, [prevQueryView, queryView, view]);
  // Order also changes through back, shared links and agent URLs.
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
  // Frontmatter references use a bare slug; resolve path form first, then the
  // frontmatter `slug`, then path tail. Unresolved references are not links.
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
  // `sourceKey` reuses `recentKey`; selectedSlug and the URL stay the active source of truth.
  const {
    tabs: openDocTabs,
    hydrated: openDocTabsHydrated,
    restoredActiveSlug,
    rememberActiveSlug,
    openTab: openDocTab,
    closeTab: closeDocTabInWorkingSet,
  } = useOpenDocTabs({
    sourceKey: recentKey,
    validSlugs: vaultSlugs,
    visibleSlugs: scopedDocSlugs,
  });
  // Restore the last active tab once per vault, only after hydration, so the default README
  // does not open first and overwrite `lastActivatedAt`.
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
    const restoredSlug = normalizedQuerySlug ? null : restoredActiveSlug;
    if (restoredSlug) settleDocsVaultAddress(routePathname, restoredSlug);
    scheduleStateSync(() => {
      setRestoredDocTabsSourceKey(recentKey);
      if (restoredSlug) setSelectedSlug(restoredSlug);
    });
  }, [
    openDocTabsHydrated,
    normalizedQuerySlug,
    recentKey,
    restoredActiveSlug,
    restoredDocTabsSourceKey,
    routePathname,
  ]);
  // Every path that changes `selectedSlug` converges here, so opening a tab needs no call-site code.
  useEffect(() => {
    if (!openDocTabsHydrated) return;
    if (
      pendingRestoredActiveSlug &&
      selectedSlug !== pendingRestoredActiveSlug
    ) {
      return;
    }
    if (!selectedSlug) return;
    if (!scopedDocSlugs.has(selectedSlug)) return;
    const doc = docsBySlug.get(selectedSlug);
    if (!doc) return;
    openDocTab(selectedSlug, resolveLocaleDisplayName(doc.frontmatter, locale, doc.title));
  }, [
    selectedSlug,
    scopedDocSlugs,
    docsBySlug,
    locale,
    openDocTab,
    openDocTabsHydrated,
    pendingRestoredActiveSlug,
  ]);
  const selectedDoc = selectedSlug && scopedDocSlugs.has(selectedSlug)
    ? (docsBySlug.get(selectedSlug) ?? null)
    : null;
  /**
   * Said once, then gone: the unresolved slug is removed from the address after it is captured,
   * so the same verdict does not reappear on every visit.
   */
  const [missingQuerySlug, setMissingQuerySlug] = useState<string | null>(null);
  /**
   * Slugs the app itself just renamed or deleted are not "missing"; `useSearchParams` still
   * holds the old slug after a `history.replaceState`.
   */
  const appTouchedSlugsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!normalizedQuerySlug || docsBySlug.size === 0) return;
    const touched = appTouchedSlugsRef.current;
    if (touched.size > 0 && !touched.has(normalizedQuerySlug)) {
      appTouchedSlugsRef.current = new Set();
    } else if (touched.has(normalizedQuerySlug)) {
      return;
    }
    if (docsBySlug.has(normalizedQuerySlug)) {
      setMissingQuerySlug((prev) => (prev === normalizedQuerySlug ? null : prev));
      return;
    }
    // Before the vault loads and boot settles the scope, the answer is "not known yet".
    if (!vaultScopeSettled) return;
    setMissingQuerySlug((prev) => prev ?? normalizedQuerySlug);
  }, [normalizedQuerySlug, docsBySlug, vaultScopeSettled]);

  /**
   * `?slug=` means something only inside one vault, so a vault switch clears it. It is not
   * the `recentKey`, which collapses both samples into `'server'` and hides a sample switch.
   */
  const vaultScope = source === 'local' ? recentKey : `sample:${staticVault.source}`;
  /**
   * A scope change before settling is boot, not a vault switch; clearing then would delete
   * a deeplink someone just handed over.
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
  // Every surface names a document the same way; the file path stays in the caption below.
  const selectedDocDisplayTitle = selectedDoc
    ? resolveLocaleDisplayName(selectedDoc.frontmatter, locale, selectedDoc.title)
    : "";
  // Null means no place in the graph, so "open on the map" is not rendered; shared with `DocMetaBar`.
  const mapDeeplinkForSelectedDoc = selectedDoc
    ? buildTopologyDeeplinkForDoc(selectedDoc) ?? buildOntologyDeeplinkForDoc(selectedDoc)
    : null;
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
  // Referrers are named by display name, and each list by its plain name in the reader's language.
  const docDisplayName = useCallback(
    (slug: string) => {
      const doc = docsBySlug.get(slug);
      return doc ? resolveLocaleDisplayName(doc.frontmatter, locale, doc.title) : slug;
    },
    [docsBySlug, locale],
  );
  const joinDocNames = useCallback(
    (slugs: readonly string[]) => {
      const shown = slugs.slice(0, REFERRER_NAMES_SHOWN).map(docDisplayName).join(', ');
      return slugs.length > REFERRER_NAMES_SHOWN
        ? `${shown}${t('frontmatterBlock.referrerLists.namesMore', { count: slugs.length - REFERRER_NAMES_SHOWN })}`
        : shown;
    },
    [docDisplayName, t],
  );
  // Rows the quick patch shows before Save, from the same verdict the write applies.
  const kindChangeReferrers = useCallback(
    (newKind: string, newSlug: string) => {
      if (!selectedDoc) return [];
      return planKindChangeReferrers(manifest.docs, {
        oldSlug: selectedDoc.slug,
        newSlug,
        newKind,
      }).map((row) => ({ ...row, name: docDisplayName(row.slug) }));
    },
    [selectedDoc, manifest, docDisplayName],
  );
  // The receipt after Save: which referrers moved lists, kept it, or could not be written.
  const showKindChangeReceipt = useCallback(
    (report: ReferrerRewriteReport) => {
      const receipt = kindChangeReceipt(report);
      if (!receipt) return;
      const list = (key: string | null) => (key ? referrerListName(key) : '');
      const sentences: string[] = [];
      if (receipt.moved.slugs.length > 0) {
        const args = {
          count: receipt.moved.slugs.length,
          names: joinDocNames(receipt.moved.slugs),
          to: list(receipt.moved.to),
          from: list(receipt.moved.from),
        };
        sentences.push(
          receipt.moved.from
            ? t('frontmatterBlock.referrerLists.movedReceipt', args)
            : t('frontmatterBlock.referrerLists.movedReceiptMixed', args),
        );
      }
      if (receipt.kept.slugs.length > 0) {
        sentences.push(
          t('frontmatterBlock.referrerLists.keptReceipt', {
            count: receipt.kept.slugs.length,
            names: joinDocNames(receipt.kept.slugs),
          }),
        );
      }
      if (receipt.failed.slugs.length > 0) {
        sentences.push(
          t('frontmatterBlock.referrerLists.failedReceipt', {
            count: receipt.failed.slugs.length,
            names: joinDocNames(receipt.failed.slugs),
          }),
        );
      }
      const description =
        sentences.length > 1
          ? sentences.slice(1).join(' ')
          : receipt.moved.slugs.length > 0
            ? t('frontmatterBlock.referrerLists.movedEffect', {
                count: receipt.moved.slugs.length,
                to: list(receipt.moved.to),
              })
            : undefined;
      toast.show(sentences[0], receipt.tone, undefined, description ? { description } : undefined);
    },
    [t, joinDocNames, referrerListName, toast],
  );
  // The form shows a rejection in place, so no toast. A kind change also moves the file to
  // its new kind folder and rewrites every referrer's list.
  const handlePatchDocFrontmatter = useCallback(
    async (patch: DocFrontmatterPatch) => {
      if (!selectedDoc) return;
      const updates: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value !== undefined) updates[key] = value;
      }
      const currentKind =
        typeof selectedDoc.frontmatter?.kind === 'string' ? selectedDoc.frontmatter.kind.trim() : null;
      const newKind = updates.kind && updates.kind !== currentKind ? updates.kind : null;
      const expectedMtime = selectedDoc.mtime;
      if (!newKind) {
        await localVault.updateFrontmatter(selectedDoc.slug, updates, { expectedMtime });
        return;
      }
      const moveTarget = reclassifyMoveTarget(selectedDoc.slug, currentKind, newKind);
      showKindChangeReceipt(
        moveTarget
          ? await moveDoc(selectedDoc.slug, moveTarget, { expectedMtime, frontmatterUpdates: updates })
          : await localVault.reclassifyDoc(selectedDoc.slug, updates, { expectedMtime }),
      );
    },
    [selectedDoc, localVault, moveDoc, showKindChangeReceipt],
  );
  const handleMoveToKindFolder = useCallback(
    (target: string) => {
      if (!selectedDoc) return;
      moveDoc(selectedDoc.slug, target, { expectedMtime: selectedDoc.mtime }).catch((err: unknown) => {
        toast.show(
          err instanceof VaultConflictError
            ? t('dialog.vaultConflict')
            : failureSentence(err, t('dialog.moveFailed')).sentence,
          'error',
        );
      });
    },
    [selectedDoc, moveDoc, toast, t, failureSentence],
  );
  // Static export cannot prebuild per-slug metadata; mirrors layout.tsx's `%s · siteName`.
  useDocumentTitle(
    selectedDoc ? `${selectedDocDisplayTitle} · ${siteT('siteName')}` : null,
  );
  const collectionDocs = useMemo(
    () => documentScope === 'ontology'
      ? scopedDocs
      : filterDocsByCollection(manifest.docs, docCollection),
    [docCollection, documentScope, manifest.docs, scopedDocs],
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
  // Palette full-text index from the first open, keyed by mtime.
  const { bodyIndex: docsBodyIndex, indexing: docsBodyIndexing } = useDocsBodyIndex({
    docs: collectionDocs,
    enabled: paletteOpened,
    scope: vaultSessionScope,
    getDocContent,
  });
  // Built from the whole folder: a reserved node keeps waiting whatever the filter shows.
  const reviewQueue = useReviewQueue({
    docs: scopedDocs,
    getDocContent,
    bundledContent: source === 'local' ? undefined : staticVault.content,
  });
  const selectedReviewRow = useMemo(
    () => reviewQueue.find((row) => row.slug === selectedSlug),
    [reviewQueue, selectedSlug],
  );
  const [reviewBusy, setReviewBusy] = useState(false);
  /**
   * A person's own write, through the conflict-guarded `updateFrontmatter`; the MCP server
   * refuses it so that a click proves a person. The digest is of the file as it is now,
   * so any later edit reads as changed.
   */
  const handleReviewWrite = useCallback(
    async (intent: 'confirm' | 'release') => {
      if (!selectedDoc || !getDocContent) return;
      setReviewBusy(true);
      try {
        const patch: Record<string, string | null> =
          intent === 'release'
            ? {
                review_state: null,
                review_note: null,
                // Clearing only the state would leave `reviewedBy` reading as an approval nobody holds.
                reviewed_by: null,
                reviewed_at: null,
                reviewed_digest: null,
              }
            : {
                review_state: 'confirmed',
                // The reader's calendar day, not UTC's; `sv-SE` formats as `YYYY-MM-DD`.
                reviewed_at: new Date().toLocaleDateString('sv-SE'),
                reviewed_digest: await reviewDigest(
                  selectedDoc.frontmatter,
                  parseFrontmatter(await getDocContent(selectedDoc.slug)).body,
                ),
                // Confirming answers the reservation, so its question is cleared.
                review_note: null,
              };
        await localVault.updateFrontmatter(selectedDoc.slug, patch, {
          expectedMtime: selectedDoc.mtime,
        });
      } catch (err) {
        // Both callers discard this promise, so the failure is told here.
        if (err instanceof VaultConflictError) {
          toast.show(t('dialog.vaultConflict'), 'error');
        } else {
          toast.show(t('review.writeFailed'), 'error');
        }
        console.error('[docs-vault] review write failed', err);
      } finally {
        setReviewBusy(false);
      }
    },
    [selectedDoc, getDocContent, localVault, toast, t],
  );
  const collectionCounts = useMemo<Record<DocsVaultCollection, number>>(
    () => ({
      all: scopedDocs.length,
      guides: documentScope === 'ontology'
        ? 0
        : filterDocsByCollection(manifest.docs, 'guides').length,
      ontology: documentScope === 'ontology'
        ? scopedDocs.length
        : filterDocsByCollection(manifest.docs, 'ontology').length,
    }),
    [documentScope, manifest.docs, scopedDocs],
  );
  const collectionPinnedSlugs = useMemo(
    () => followMovedSlugs(pinnedSlugs, manifest.aliases).filter((slug) => collectionDocSlugs.has(slug)),
    [collectionDocSlugs, manifest.aliases, pinnedSlugs],
  );
  const collectionRecentSlugs = useMemo(
    () => followMovedSlugs(recentSlugs, manifest.aliases).filter((slug) => collectionDocSlugs.has(slug)),
    [collectionDocSlugs, manifest.aliases, recentSlugs],
  );

  // Reinterpret the default collection once, when documents first land, so the first screen
  // is not empty; repeating it would undo a deliberately chosen empty collection.
  const initialCollectionResolvedRef = useRef(false);
  useEffect(() => {
    if (documentScope === 'ontology') return;
    if (initialCollectionResolvedRef.current) return;
    if (manifest.docs.length === 0) return;
    initialCollectionResolvedRef.current = true;
    const resolved = resolveInitialDocsCollection(manifest.docs, initialCollection);
    if (resolved !== docCollection) {
      scheduleStateSync(() => setDocCollection(resolved));
    }
  }, [docCollection, documentScope, initialCollection, manifest.docs]);

  useEffect(() => {
    if (documentScope === 'ontology') return;
    if (!selectedDoc) return;
    // Picking a document never narrows the "all documents" view.
    if (docCollection === 'all') return;
    const nextCollection = resolveDocsVaultCollection(selectedDoc);
    if (nextCollection !== docCollection) {
      scheduleStateSync(() => setDocCollection(nextCollection));
    }
  }, [docCollection, documentScope, selectedDoc]);

  const pickDefaultDocForCollection = useCallback(
    (collection: DocsVaultCollection): string | null => {
      const docs = documentScope === 'ontology'
        ? scopedDocs
        : filterDocsByCollection(manifest.docs, collection);
      const slugs = new Set(docs.map((doc) => doc.slug));
      const candidates = [
        ...pinnedSlugs,
        ...recentSlugs,
        collection !== 'ontology' ? 'README' : null,
        collection !== 'ontology' ? 'FEATURES' : null,
        collection !== 'ontology' ? 'PRODUCT-DIRECTION' : null,
        collection !== 'ontology' ? 'ARCHITECTURE' : null,
        firstReadableSlug(docs),
      ];
      return (
        candidates.find((slug): slug is string => typeof slug === 'string' && slugs.has(slug)) ??
        null
      );
    },
    [documentScope, manifest.docs, pinnedSlugs, recentSlugs, scopedDocs],
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
      if (documentScope === 'ontology') return;
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
    [documentScope, manifest.docs, pickDefaultDocForCollection, replaceUrlState, selectedSlug],
  );

  useEffect(() => {
    if (!openDocTabsHydrated || pendingRestoredActiveSlug) return;
    if (outOfScopeQuerySlug) return;
    if (selectedSlug && scopedDocSlugs.has(selectedSlug)) return;
    if (
      shouldDeferDocsVaultDefaultSelection({
        normalizedQuerySlug,
        selectedSlug,
        selectionReady: vaultScopeSettled,
      })
    ) {
      return;
    }

    const candidates = [
      ...collectionPinnedSlugs,
      ...collectionRecentSlugs,
      'README',
      'FEATURES',
      'PRODUCT-DIRECTION',
      'ARCHITECTURE',
      firstReadableSlug(collectionDocs),
    ];
    const nextSlug = candidates.find(
      (slug): slug is string => typeof slug === 'string' && collectionDocSlugs.has(slug),
    );
    if (!nextSlug) return;

    settleDocsVaultAddress(routePathname, nextSlug);
    scheduleStateSync(() => setSelectedSlug(nextSlug));
  }, [collectionDocSlugs, collectionDocs, collectionPinnedSlugs, collectionRecentSlugs, normalizedQuerySlug, openDocTabsHydrated, outOfScopeQuerySlug, pendingRestoredActiveSlug, routePathname, scopedDocSlugs, selectedSlug, vaultScopeSettled]);

  const handleSelect = useCallback(
    (slug: string, query?: string) => {
      if (documentScope === 'ontology' && !scopedDocSlugs.has(slug)) {
        router.push(generalDocsHref(slug), { scroll: false });
        return;
      }
      rememberActiveSlug(slug);
      setSelectedSlug(slug);
      setHighlightQuery(query);
      setRecentSlugs(pushRecentDoc(recentKey, slug));
      replaceUrlState({ slug });
      setSampleWelcomeDismissed(true);
    },
    [documentScope, generalDocsHref, recentKey, rememberActiveSlug, replaceUrlState, router, scopedDocSlugs, setRecentSlugs],
  );

  // Closing the active tab moves left first, then right; closing the last falls back like default selection.
  const handleCloseDocTab = useCallback(
    (slug: string) => {
      const nextActiveSlug = closeDocTabInWorkingSet(slug, selectedSlug);
      if (nextActiveSlug) {
        handleSelect(nextActiveSlug);
        return;
      }
      const fallbackSlug = collectionDocSlugs.has('README')
        ? 'README'
        : firstReadableSlug(collectionDocs);
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

  // ⌘K is this workspace's palette, so the shell search stands aside.
  useClaimShellKey('search');
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
    // Bundled headings come from the lazily loaded map; a local manifest has them inline.
    const docHeadings =
      selectedDoc && selectedDoc.headings.length > 0
        ? selectedDoc.headings
        : selectedDoc
          ? (staticHeadings?.[selectedDoc.slug] ?? [])
          : [];
    const headings = docHeadings.filter((h) => h.depth >= 2 && h.depth <= 3);
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
  }, [selectedDoc, staticHeadings]);
  const showOutlineRail = shouldShowOutlineRail(outlineHeadings.length);
  const handleHeadingNavigate = useCallback(
    (slug: string) => {
      document
        .getElementById(slug)
        ?.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      setActiveHeadingSlug(slug);
      if (typeof window !== 'undefined') {
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${window.location.search}#${slug}`,
        );
      }
    },
    [reducedMotion, setActiveHeadingSlug],
  );

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
        visible: !installedShell && source !== 'server',
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
        visible: canEditCurrent && !legacyDocumentMode,
        onRun: () => handleOpenNewDocDialog(),
      },
      {
        id: 'rename',
        label: t('commands.rename'),
        keywords: t('commands.renameKeywords'),
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
          // The static export has no locale-less `/projects/` route.
          router.push(projectsListHref);
        },
      },
    ];
  }, [
    router,
    view,
    source,
    installedShell,
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
    legacyDocumentMode,
    setPaletteQuery,
    t,
  ]);

  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setSourceTreeOpen(false);
    },
    [handleSelect],
  );
  // From the whole manifest, independent of the collection filter; read-only.
  const agentFiles = useAgentFilesModel(manifest, localVault.fileHandles);
  // Skill-copy parity only with a real absolute path; the web falls back to the handle name.
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
      reviewQueue={reviewQueue}
      pinnedSlugs={collectionPinnedSlugs}
      recentSlugs={collectionRecentSlugs}
      selectedSlug={selectedSlug}
      docsBySlug={docsBySlug}
      activeTag={activeTag}
      manifest={collectionManifest}
      collection={docCollection}
      collectionCounts={collectionCounts}
      showCollectionChooser={documentScope !== 'ontology'}
      showCreateDocument={!legacyDocumentMode}
      visibleDocSlugs={collectionDocSlugs}
      onSelect={handleSelectFromSidebar}
      onCollectionChange={handleCollectionChange}
      onTogglePin={handleTogglePin}
      onTagSelect={setActiveTag}
      // In the read-only sample the `+` opens a folder, the path that makes creating possible.
      onCreateNewDoc={canEditCurrent ? handleOpenNewDocDialog : handleVaultPillSwap}
      canCreateNewDoc={canEditCurrent}
      sort={treeSort}
      group={treeGroup}
      onSortChange={handleTreeSortChange}
      onGroupChange={handleTreeGroupChange}
      agentFiles={documentScope === 'ontology' ? null : agentFiles}
    />
  );

  // Show the real path only for an open local folder; the build machine's dogfood path
  // would otherwise leak into the sample.
  const vaultPillPath =
    isLocalSourceLoaded && localVaultRootPath
      ? localVaultRootPath
      : isLocalSourceLoaded && localVault.handle
        ? localVault.handle.name
        : t('header.vaultPillSampleLabel');
  const vaultTopLevelFolderCount = manifest.tree.children?.filter(
    (child) =>
      child.type === 'dir' &&
      (child.children?.some(function containsScopedDoc(descendant): boolean {
        return descendant.type === 'doc'
          ? Boolean(descendant.slug && scopedDocSlugs.has(descendant.slug))
          : descendant.children?.some(containsScopedDoc) ?? false;
      }) ?? false),
  ).length ?? 0;

  // One neutral frame until source and restored manifest settle, so the static manifest
  // never paints as the installed app's data.
  if (!vaultScopeSettled || legacyRedirectToLibrary) return <RouteLoadingFallback />;

  // While the list is expanded, zone-l ends at the document pane's left edge so tabs sit
  // over the pane (list width − header padding − zone gap).
  const identityZone = (
    <div
      data-docs-header-zone="identity"
      className={cn(
        // From md this uses content width; the pane alignment applies at lg only.
        "flex w-full min-w-0 flex-none flex-wrap items-center gap-2 md:w-auto md:flex-nowrap md:gap-3",
        legacyDocumentMode
          ? "lg:w-auto"
          : docListCollapsed
          ? "lg:w-auto"
          : "lg:w-[calc(var(--docs-list-width)-1.5rem)]",
      )}
    >
      {legacyDocumentMode ? (
        <>
          <Link
            href={libraryOntologyHref}
            data-testid="docs-compatibility-library-return"
            className={controlClass({
              shape: 'chip',
              size: 'lg',
              className: 'flex-none justify-center hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]',
            })}
          >
            <ArrowLeft size={ICON_SIZE.md} aria-hidden />
            <span>{t('compatibility.back')}</span>
          </Link>
          <span className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t('compatibility.title')}
          </span>
        </>
      ) : null}
      {/* Return to the insights review the user came from; the rail owns the way back to the map. */}
      {insightsReturnTab ? (
        <Link
          href={workspaceHref}
          aria-label={t('header.backToReviewAriaLabel')}
          // Not a `<button>`, so the ratchet does not see it, but it must match the chip height.
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
      {/* The chip states the chosen source (`lib/vault-chip-identity`). */}
      <DocsVaultVaultChip
        label={
          vaultChipIdentity.kind === 'local'
            ? vaultChipIdentity.label
            : vaultChipIdentity.kind === 'local-pending'
              ? t('header.vaultChipLocalPending')
              : t('advanced.sourceServer')
        }
        docCount={vaultChipIdentity.showDocCount ? scopedDocs.length : null}
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
        allowSample={!installedShell}
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
  );
  // `self-stretch` fills the header height so the active tab covers the baseline.
  const tabsZone = (
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
  );
  // Fixed order at natural width; zone-c shrinks so nothing overlaps. From md `ml-auto`
  // right-aligns; at lg zone-c owns the gap.
  const toolsZone = (
    <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 md:ml-auto md:w-auto md:flex-nowrap">
      {/* Source display and switching live in the vault chip only. */}
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
      {/* At lg+ the nav rail gear owns settings; this tile appears only below lg. */}
      <div className="lg:hidden">
        <AppSettingsMenu
          mode={source === 'local' ? 'local' : 'static'}
          triggerVariant="chrome-tile"
        />
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full">
      <div className="topology-ui-scale relative flex h-full min-w-0 flex-1 flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* 44px chrome grid keeps the content start line fixed across views. Below lg the header
         wraps to two rows to avoid overflow at 390px (local-vault-picker.spec.ts). */}
      <div data-chrome-grid="44" className="flex-none">
      {/* From md the header is one row; below md it wraps. */}
      {/* `isolate` and `z-10` are a pair: `isolate` confines the header's stacking, and `z-10`
         lifts the header over the reading pane so its dropdowns are not covered. Keep it
         below `--z-map-scrim` (25) and `--z-dialog` (60). */}
      <header className="relative isolate z-10 flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-2 bg-[color:var(--color-panel)] px-3 py-2 md:h-11 md:min-h-0 md:flex-nowrap md:gap-2 md:px-4 md:py-0">
        <h1 className="sr-only">
          {legacyDocumentMode ? t('compatibility.title') : t('header.title')}
        </h1>
        {/* Absolutely positioned so the active tab can cover it with its own 2px underline. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-[color:var(--color-border-soft)]"
        />
        {identityZone}
        {tabsZone}
        {toolsZone}
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

      {/* A local vault in error or needing permission says so instead of silently showing the sample. */}
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
              : // A rejection is not a failure; do not leak the cause string.
                localVault.errorCode === 'root-rejected'
                ? t('vaultStatus.rootRejectedBanner')
                : // Each code owns a finished sentence; append the cause only when there is one.
                  localVault.errorCode === 'grant-needed'
                  ? t('vaultStatus.grantNeededBanner')
                  : localVault.errorCode === 'path-missing'
                  ? t('vaultStatus.pathMissingBanner')
                  : localVault.errorCode === 'permission-denied'
                    ? t('vaultStatus.permissionDeniedBanner')
                    : localVault.errorMessage
                      ? t('vaultStatus.errorBanner', { message: localVault.errorMessage })
                      : t('vaultStatus.unknownErrorBanner')}
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

      {/* Say so when `?slug=` does not resolve in this vault; default selection draws another document. */}
      {missingQuerySlug ? (
        <div
          className="flex flex-none items-center gap-2 border-b border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] px-4 py-2 text-body text-[color:var(--color-status-warning)]"
          role="status"
          data-testid="docs-missing-slug-banner"
        >
          <span className="min-w-0 flex-1 truncate">
            {t('vaultStatus.missingSlugBanner', { slug: missingQuerySlug })}
          </span>
          {selectedDoc ? (
            <Link
              href={getDocHref(selectedDoc.slug)}
              data-testid="docs-missing-slug-fallback"
              className={controlClass({ shape: 'link', tone: 'secondary', className: 'shrink-0 text-label' })}
            >
              {t('vaultStatus.openFallback')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {showDesktopWelcome ? (
        <DesktopVaultWelcome
          status={localVault.status}
          recentVaults={localVault.recentVaults}
          onOpen={() => void openLocalVault()}
          // The web cannot open an absolute path (`.claude/rules/surfaces.md` forbids a dead CTA), and working web paths sit beside it.
          onOpenDogfoodPath={isDesktopRuntime ? handleOpenDogfoodVault : undefined}
          onOpenRecent={(record) => void localVault.openRecent(record)}
          onForgetRecent={(record) => void localVault.forgetRecent(record)}
          currentVaultKey={
            localVault.storedVaultRecord
              ? recentVaultRowKey(localVault.storedVaultRecord)
              : null
          }
          choosing={localVault.awaitingVaultChoice}
          // Only the installed app can reopen the folder without a permission gesture.
          canResumeWithoutGesture={isDesktopRuntime}
          showDogfoodHint={showDogfoodHint}
          t={t}
        />
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1">
        {/* Tree navigation is opt-in so the document surface stays primary. */}
        {/* Full-screen surface: opacity-only motion. */}
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

        {/* `--docs-list-width` tree at lg+, replaced by the drawer below. Collapsed means width 0. */}
        <aside
          // The docs tour anchor; while collapsed it fails to resolve and the tour folds to one step.
          data-testid="docs-vault-doc-list"
          aria-label={t('mobileDrawer.title')}
          aria-hidden={docListCollapsed}
          // `inert` also removes the hidden controls from the Tab order.
          inert={docListCollapsed}
          style={{ width: docListCollapsed ? 0 : 'var(--docs-list-width)' }}
          className={`hidden flex-none flex-col overflow-hidden bg-[color:var(--color-panel)] transition-[width] duration-[var(--motion-base)] ease-[var(--motion-ease)] lg:flex ${
            docListCollapsed ? '' : 'border-r border-[color:var(--color-border-soft)]'
          }`}
        >
          {sidebarBody}
        </aside>

        <main
          id="main"
      tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          /**
           * Measures in the installed app whether dot directories were read, a desktop capability a browser
           * cannot prove (`.claude/rules/surfaces.md`). `-` means no capability
           * (web), `0/0` means capable with no skill tree.
           */
          data-skill-parity={
            skillParity ? `${skillParity.rows.length}/${skillParity.disagreeing}` : "-"
          }
        >
          {selectedDoc ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {!editing && showSampleWelcomeNote ? (
                <SampleWelcomeNote
                  canOpenLocalVault={!localSourceDisabled}
                  onOpenFolder={() => handleSourceChange('local')}
                  onDismiss={() => setSampleWelcomeDismissed(true)}
                />
              ) : null}
              {/* Display title lives in the tab and H1; this row shows only where the file lives. */}
              <div className="flex flex-none flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--color-border-soft)] px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <span data-testid="docs-editor-path" className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
                    <span>{splitVaultSlugPath(selectedDoc.slug).dir}</span>
                    {splitVaultSlugPath(selectedDoc.slug).name}.md
                  </span>
                  {/* Rename and delete sit beside the path they change, only when writable and not editing,
                     since a move under an open editor would strand unsaved text. */}
                  {canEditCurrent && !editing ? (
                    <span data-testid="docs-file-actions" className="flex flex-none items-center gap-0.5">
                      <IconButton
                        label={t('fileActions.rename')}
                        tone="muted"
                        hoverInk="strong"
                        hoverSurface="lift"
                        onClick={handleRenameCurrent}
                        data-testid="docs-file-rename"
                      >
                        <TextCursorInput size={ICON_SIZE.sm} aria-hidden />
                      </IconButton>
                      <IconButton
                        label={t('fileActions.delete')}
                        tone="muted"
                        hoverInk="strong"
                        hoverSurface="lift"
                        onClick={handleDeleteCurrent}
                        data-testid="docs-file-delete"
                      >
                        <Trash2 size={ICON_SIZE.sm} aria-hidden />
                      </IconButton>
                    </span>
                  ) : null}
                </div>
                {/* Read-only is a vault fact, stated here at zero vertical cost. */}
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
                      className="hover:text-[color:var(--color-text-secondary)]"
                    >
                      {t('editorHeader.previewTab')}
                    </Chip>
                    <Chip
                      role="tab"
                      aria-selected={editing}
                      active={editing}
                      tone={editing ? 'strong' : 'muted'}
                      onClick={() => setEditing(true)}
                      className="hover:text-[color:var(--color-text-secondary)]"
                    >
                      {t('editorHeader.editTab')}
                    </Chip>
                  </div>
                ) : null}
                {/* The dot is the label's bullet; it states only whether the vault source is local. */}
                {isLocalSourceLoaded ? (
                  <span className="flex-none text-label text-[color:var(--color-text-quaternary)]">
                    <span
                      className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[color:var(--color-indigo-accent)] align-middle"
                      aria-hidden
                    />
                    {t('editorHeader.localSynced')}
                  </span>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1">
                <DocReadingPane
                  data-testid="docs-reading-pane"
                  scrollRef={articleScrollRef}
                  outline={
                    !editing && showOutlineRail
                      ? {
                          headings: outlineHeadings,
                          activeHeadingSlug,
                          onHeadingClick: handleHeadingNavigate,
                        }
                      : null
                  }
                  backToTop={!editing ? backToTop : null}
                >
                    {editing && canEditCurrent && editResolver ? (
                      <DocsVaultEditor
                        key={`edit:${vaultScope}:${selectedDoc.slug}`}
                        vaultScope={vaultScope}
                        doc={selectedDoc}
                        getDocContent={editResolver}
                        onSave={(slug, content, expectedMtime) =>
                          // Rethrow so the editor stays dirty and the next poll cannot clobber the buffer.
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
                        {/* The block renders for a missing or empty kind too, the commonest ways a node leaves the map. */}
                        <DocFrontmatterBlock
                            key={selectedDoc.slug}
                            doc={selectedDoc}
                            canEdit={canEditCurrent}
                            domainOptions={domainOptions}
                            onPatch={handlePatchDocFrontmatter}
                            onMoveToKindFolder={handleMoveToKindFolder}
                            kindChangeReferrers={kindChangeReferrers}
                            onNavigate={handleSelect}
                            resolveRef={(token) => refSlugResolver.get(token) ?? null}
                            kindOf={(slug) => {
                              const kind = docsBySlug.get(slug)?.frontmatter?.kind;
                              return typeof kind === "string" ? kind.trim() : null;
                            }}
                            // Only what the local vault observed; server and sample vaults render nothing.
                            agentActivityStatus={localVault.agentActivityStatus}
                            selfEditTimestamps={localVault.selfEditTimestamps}
                          />
                        <DocMetaBar
                          doc={selectedDoc}
                          {...(selectedReviewRow ? { reviewRow: selectedReviewRow } : {})}
                          {...(canEditCurrent && getDocContent
                            ? {
                                review: {
                                  reserved:
                                    selectedDoc.frontmatter.review_state === 'human_decides',
                                  busy: reviewBusy,
                                  onConfirm: () => void handleReviewWrite('confirm'),
                                  onRelease: () => void handleReviewWrite('release'),
                                },
                              }
                            : {})}
                        />
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
                </DocReadingPane>
              </div>

              {/* Always visible; zero backlinks shows an empty-state line. */}
              {!editing ? (
                // The bottom-tab reserve must apply to this `flex-none` sibling too, or the tab bar covers
                // its controls below lg.
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
                  {/* No `/topology/` fallback: a document without a graph node gets no map link. */}
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
            scopedDocs.length === 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center px-5 pt-5 pb-[calc(var(--topology-mobile-bottom-tab-reserve)+24px)] lg:pb-5">
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
            </div>
          ) : (
            <EmptyState
              docCount={scopedDocs.length}
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

      <NewDocKindDialog
        open={newDocKindDialogOpen}
        onSelect={(kind) => void handleCreateNewDocWithKind(kind)}
        onClose={() => setNewDocKindDialogOpen(false)}
      />
      <RenameDocDialog
        target={renameTarget}
        isTaken={isSlugTaken}
        onCancel={() => setRenameTarget(null)}
        onConfirm={confirmRename}
      />
      <DeleteDocDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />


      {/* Bottom chip without scrim or autofocus, so the content stays usable. */}
      <AnimatePresence>
        {pendingSimilarDoc ? (
          <div
            key="pending-similar-doc"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
          >
            <div className="pointer-events-auto w-full max-w-[var(--dialog-w-sm)]">
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


/** An architecture profile is never the unattended first document (`a11y-vault-backed.spec.ts`). */
function firstReadableSlug<T extends { slug: string; frontmatter: Record<string, unknown> }>(
  docs: readonly T[],
): string | undefined {
  // No fallback to `docs[0]`; callers handle "no document".
  return docs.find((doc) => !isArchitectureProfile(doc))?.slug;
}

export function DocsVaultPage({
  initialCollection = 'guides',
  documentScope = 'all',
  legacyEntry = false,
}: {
  /** The collection a no-slug entry opens. Explicit slugs and later choices still win. */
  initialCollection?: DocsVaultDocCollection;
  /** Fix Library's Ontology tab to authored ontology nodes; generic Docs remains unscoped. */
  documentScope?: 'all' | 'ontology';
  /** Resolve `/docs` only as an exact non-ontology document reader; otherwise return to Library. */
  legacyEntry?: boolean;
} = {}) {
  // Local-first core (`.claude/rules/local-first.md` §1): no auth gate before the vault picker.
  return (
    <VaultSourceHydrationBoundary>
      {/* Prerendered HTML carries this fallback; null would start as a black screen. */}
      <Suspense fallback={<RouteLoadingFallback />}>
        <DocsVaultContent
          initialCollection={initialCollection}
          documentScope={documentScope}
          legacyEntry={legacyEntry}
        />
      </Suspense>
    </VaultSourceHydrationBoundary>
  );
}
