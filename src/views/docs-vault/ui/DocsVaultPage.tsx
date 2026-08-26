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
  isArchitectureProfile,} from '../lib/docs-vault-collection';
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

/** slug "capabilities/foo" → { dir: "capabilities/", name: "foo" }; a root slug
 *  gets dir "". Pure helper for rendering the mono filename in the editor head. */
function splitVaultSlugPath(slug: string): { dir: string; name: string } {
  const parts = slug.split('/');
  const name = parts.pop() ?? slug;
  return { dir: parts.length > 0 ? `${parts.join('/')}/` : '', name };
}

// View parsing and persistence helpers live in a `DocsVault*` namespace so they do
// not collide with another domain's view; aliased short inside this file.
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
import {
  loadStaticVaultHeadings,
  resolveStaticVaultSource,
  type StaticVaultHeadings,
} from '@/entities/docs-vault';

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
  // List order — the URL is the source of truth. An unknown value is not an error, it is the default.
  const queryTreeSort = parseDocsTreeSort(searchParams?.get('sort'));
  const queryTreeGroup = parseDocsTreeGroup(searchParams?.get('group'));
  const insightsReturnTab = parseInsightsReturnMarker(
    searchParams?.get('via'),
  );
  const insightsReviewId = insightsReturnTab
    ? searchParams?.get('review') ?? null
    : null;
  const projectsListHref = '/projects/';
  // UX audit (2026-07): on a hard navigation `/` falls through to the gateway because
  // the vault has not been restored yet, so the crumb always goes straight to the map.
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
  // One unified palette serves all three shortcuts. A truthy `openWith` opens it, and
  // the value is the initial query (`>` command, `#` tag, `` default).
  const { paletteQuery, setPaletteQuery, paletteOpen } = usePaletteState();
  const [view, setView] = useState<DocsVaultView>(queryView);
  // The vault tools dropdown moved into the settings menu, so this latch no longer opens
  // a visible menu. Other transient surfaces still poke `setAdvancedOpen(false)` as the
  // "close the other popovers" contract, so the setter is kept (the hook effect is a
  // no-op while open=false). Agent tooling now belongs to AppSettingsMenu's vault /
  // mcpAgents tabs.
  const { setOpen: setAdvancedOpen } = useAdvancedMenu();
  // The VaultChip popover (path, folder count, local badge, switch vault) reuses the gear
  // menu's outside-click/Escape contract — the second consumer of `useAdvancedMenu`.
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
  // Whether the user dismissed the sample welcome note themselves by picking a real
  // document (`handleSelect`). `shouldShowSampleWelcomeNote` combines this with the
  // source and whether a deeplink was used to decide the final visibility.
  const [sampleWelcomeDismissed, setSampleWelcomeDismissed] = useState(false);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [docCollection, setDocCollection] =
    useState<DocsVaultCollection>('guides');
  const [treeSort, setTreeSort] = useState<DocsTreeSort>(queryTreeSort);
  const [treeGroup, setTreeGroup] = useState<DocsTreeGroup>(queryTreeGroup);
  // `?intent=local` is the entry query of the landing CTA "open my markdown folder".
  // Pinning the initial source to 'local' puts the picker in the right sidebar from the
  // first frame — it used to be buried four steps deep.
  const [source, setSource] = useState<Source>(querySource ?? 'server');
  const [staticSampleOverride, setStaticSampleOverride] = useState<
    'dogfood' | null
  >(querySample);
  // Starting from the safe SSR default (server), do not select the default README while
  // the stored source is still being read. This blocks the race where reopening the app
  // on a local deeplink renders the server manifest first and overwrites the last document.
  const [sourcePreferenceHydrated, setSourcePreferenceHydrated] =
    useState(false);
  // At lg+ the gear at the bottom of the nav rail opens settings, matching the map,
  // insights, and projects. Below lg the header's chrome tile takes over (the rail is
  // hidden at that width). Both uncontrolled.
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
  // On `?intent=local`: set source to 'local' and expand the advanced panel. `searchParams`
  // can be stale at SSR time, so this reads `window.location` directly after mount — the
  // landing CTA must not dead-end.
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
    // Mount only, so it does not reopen on reload after the user closed it. `setAdvancedOpen`
    // is ref-stable (a `useCallback` from `useAdvancedMenu`) but ESLint cannot track the
    // stability of a destructured method, so it is listed explicitly.
  }, [isDesktopRuntime, querySource, setAdvancedOpen]);
  const [sourceTreeOpen, setSourceTreeOpen] = useState(false);
  // Collapsing the document-list aside means width 0 (the rail is removed, not slimmed),
  // persisted to localStorage because it is a workspace preference that outlives a reload.
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
  // Whether the IDB handle restore **has finished being attempted** — unlike status, this
  // separates "not known yet" from "confirmed absent". The only start signal for the
  // landing source decision.
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
    // A build with no configured path (the public release) does nothing — staying quiet is
    // more honest than pretending to open a path that does not exist.
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

  // Pinned/recent persistence is encapsulated in `useDocsVaultPersistence`. The setters are
  // exposed because the view's mutation sites (delete, new document) call them directly.
  const {
    recentKey,
    recentSlugs,
    setRecentSlugs,
    pinnedSlugs,
    setPinnedSlugs,
    pinnedSet,
    togglePin: handleTogglePin,
  } = useDocsVaultPersistence({ source, localVault });

  // `replaceUrlState` is a module-level pure function in
  // `src/views/docs-vault/lib/url-state.ts`, so it needs no `useCallback` wrapper and drops
  // out of every call site's deps (a module reference is stable by construction).
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
    // `?intent=local` means the local source only inside the installed app. A hosted
    // browser keeps the web as a promo/download surface and does not open local vault work.
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

  // When a local vault is live, landing on the docs surface must NOT silently flip to the
  // Sample (`server`) source just because that was the last stored preference. Users read
  // that flip as "my data is gone". The local vault restores asynchronously from IndexedDB,
  // so we watch for it and, ONCE per mount (before any manual source switch), prefer
  // `local`. Not persisted, so an intentional stored preference on disk is not overwritten.
  //
  // ⚠️ **The landing decision is settled exactly once, the moment the restore attempt
  // finishes** (2026-08-08). It used to be a one-shot ref, and that design had two holes:
  //
  // ① On a boot whose stored preference was already local there was nothing to fire, so the
  //    ref stayed loaded — and that loaded shot **bounced the user's first switch to
  //    "sample" straight back to local** (measured on device: local at both 300 ms and
  //    1800 ms after the click; the first switch was silently ignored). The landing guard
  //    was eating the user's choice.
  // ② With the decision point left open, the scope cleanup, the "document not found"
  //    verdict, and the default selection below had no way to know whether a landing switch
  //    was still coming — so the sample window during boot was observed as "settled" (see
  //    the scope-cleanup effect's comment for what that caused).
  //
  // `restoreAttempted` becomes true only **after** the IDB restore attempt concludes
  // (use-local-vault sets it once load completes), so the status at this point is final and
  // one decision is enough. It is **state, not a ref**, because a ref produces no re-render
  // when the decision ends in "no switch", leaving every consumer below asleep forever.
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
   * **Has the vault scope settled** — are we past the first moment boot can claim that "the
   * vault on screen" matches the user's intent? Three consumers share this one predicate:
   * scope-switch cleanup, the "document not found" banner, and default document selection.
   * Any of the three deciding earlier mistakes the boot-time sample window for reality
   * (2026-08-08 — three consumers using three different predicates lost a deeplink).
   */
  const vaultScopeSettled =
    sourcePreferenceHydrated &&
    landingSourceResolved &&
    (source === 'server' || localVaultStatus === 'loaded');

  // The docs check modal must not persist its open state: a modal appearing on every load
  // violates modality, so it always starts closed. The toggle is plain component state and
  // lives only for the session.
  const [contractOpen, setContractOpen] = useState(false);
  const openContract = useCallback(() => {
    // The single-transient rule — opening a modal closes the other L2 popovers (gear,
    // VaultChip, ⌘K). The document-info inspector is exempt because it is a persistent panel
    // the user opened.
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setContractOpen(true);
  }, [setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  const closeContract = useCallback(() => setContractOpen(false), []);

  /**
   * Copy confirmation is **owned by the toast** (2026-07-28).
   *
   * The check icon in the document-info inspector used to be the only feedback. Removing
   * that panel nearly turned ⌘K's "copy link" into a command with **no response at all** —
   * feedback that lived only on a deleted surface disappearing with it is the most common
   * accident of a reduction.
   *
   * It follows the toast grammar this screen already uses (`handleCopyAgentVerifyPrompt`),
   * including on failure: clipboard permission can be refused silently, and staying quiet
   * then leaves the user believing the copy succeeded.
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
     * Use the builder that knows the path. The old constant pinned the folder to `.`, so
     * opening the agent **in a different working folder made that `.` point at someone
     * else's folder** — a copy detached from the fact is not a copy, it is a wrong answer.
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
     * ⚠️ `localVault.handle` must stay in the deps (`exhaustive-deps` audit, 2026-08-06).
     * This callback copies a prompt with the **vault's absolute path** baked in; without the
     * dep it keeps copying the **old vault path** after switching folders. Same class as the
     * missing `vaultScope` on `DocsVaultEditor`: a stale closed-over value going out to the user.
     */
  }, [localVault.handle, t, toast]);

  // Scroll spy — tracks the outline's active heading as the body scrolls.
  const { articleScrollRef, activeHeadingSlug, setActiveHeadingSlug } =
    useDocsVaultScrollSpy(selectedSlug, source);
  // Back-to-top threshold and click behaviour. Subscribes to the same scroll container as the
  // scroll spy but is a separate hook because the concern differs.
  const backToTop = useBackToTop(articleScrollRef, selectedSlug);

  // A hosted browser does not open local vault work, even when an earlier browser session
  // stored the local source — it returns to the promo/read-only surface.
  useEffect(() => {
  // Fall back to server only when FSA is unsupported; a local web session is valid now.
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
  // Clear the selection when the source changes — the same slug rarely exists in both vaults.
    setSelectedSlug(null);
    setActiveTag(null);
  // Show the welcome note again on every (re-)entry into sample mode. Even if it was
  // dismissed in an earlier session, switching between sample and one's own vault is worth
  // re-orienting.
    if (next === 'server') setSampleWelcomeDismissed(false);
    replaceUrlState(
      next === 'server'
        ? { slug: null, view, intent: null, source: null, sample: null }
        : { slug: null, view, source: null, sample: null },
    );
  // Switching to local lets the user choose from the Obsidian-style welcome screen. The
  // native picker opens only when they press "open folder".
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


  // The active manifest, branching on source; local is null until loaded. The static
  // fallback follows the sample the user chose (dogfood or the example storefront) —
  // reading the bundled manifest directly would make "view the example business" silently
  // ignored in the docs surface, showing a different vault from the map.
  const preferredStaticVault = useStaticVaultSource();
  const staticVault = staticSampleOverride
    ? resolveStaticVaultSource(staticSampleOverride)
    : preferredStaticVault;
  const manifest: VaultManifest =
    isLocalSourceLoaded && localVault.manifest
      ? localVault.manifest
      : staticVault.manifest;

  /*
   * Headings for the bundled vault were split out of the manifest into their own chunk:
   * 263 KB used only by `/docs` was riding in every route's shared chunk
   * (`entities/docs-vault/lib/static-headings.ts`). Static mode imports it dynamically when
   * needed; a local manifest carries headings inline.
   * Pairing rule: only load the map for the same vault (source) currently being drawn.
   */
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
        // The outline is supplementary — a load failure must not block the docs surface itself.
      });
    return () => {
      cancelled = true;
    };
  }, [isLocalSourceLoaded, staticVault.source]);
  // Consume the map only while the source matches, so a stale map is never used the moment
  // the sample changes.
  const staticHeadings =
    staticHeadingsBundle && staticHeadingsBundle.source === staticVault.source
      ? staticHeadingsBundle.map
      : null;
  const ontologyDerivation = useMemo(
    () => deriveOntologyFromVault(manifest),
    [manifest],
  );

  // Viewer content resolver — local reads through file handles, server uses a plain fetch.
  // Reported by a user: entering via `?intent=local` forces source='local', and while no
  // vault is chosen (zero handles) the viewer asked for a slug with no handle and surfaced
  // "no file handle for 'FEATURES'". With no handles it falls back to a server fetch, so
  // demo content shows until the user clicks the picker.
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

  // Local vault image resolver — relative path → blob URL. Undefined for the server vault.
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

  // Editing requires a local vault: patching to disk needs a vault handle.
  const canEditCurrent = isLocalSourceLoaded;
  const editResolver = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
  // The edit resolver is identical to the viewer's, kept separate deliberately.
    if (!canEditCurrent) return undefined;
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const fh = handles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      const file = await fh.getFile();
      return file.text();
    };
  }, [canEditCurrent, localVault.fileHandles]);
  // Leave edit mode when returning to the viewer or when the source changes.
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
      // Delete succeeded — clean up selection, address, pinned, and recent. Leaving the
      // address in place makes the "requested document is missing" verdict catch the slug
      // that was just deleted the moment the manifest updates, raising a false warning
      // (measured in a 2026-08-13 walkthrough — the same illness as rename).
      appTouchedSlugsRef.current = new Set([slug]);
      setSelectedSlug(null);
      replaceUrlState({ slug: null });
      setEditing(false);
      setRecentSlugs((list) => list.filter((s) => s !== slug));
      setPinnedSlugs((list) => {
        const next = list.filter((s) => s !== slug);
        if (next.length !== list.length) {
          // Sync localStorage only when something was actually removed. An updater function
          // can run during render (the 2026-08-13 draft-save incident), so the write is
          // pushed out of render into a microtask. The write is idempotent, so a double call
          // is harmless.
          queueMicrotask(() => {
            try {
              window.localStorage.setItem(
                `${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`,
                JSON.stringify(next),
              );
            } catch {
              /* ignore */
            }
          });
        }
        return next;
      });
    } catch (err) {
      window.alert(
        t('dialog.deleteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, replaceUrlState, setPinnedSlugs, setRecentSlugs, t]);

  const handleScaffoldOntologyStarter = useCallback(async () => {
      // A vault created from a screen in one language should read in that language.
    const result = await localVault.scaffoldOntology(locale);
    setSelectedSlug('README');
    setRecentSlugs(pushRecentDoc(recentKey, 'README'));
    replaceUrlState({ slug: 'README', view: 'doc' });
    setView('doc');
    setAdvancedOpen(false);
    toast.show(
      // State the concept count and the config-file count **separately**. They used to be
      // summed into one `created`, so the toast said "8 starter documents" while the real
      // ontology concept count was 5.
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
      // TOC markdown — h2 has no indent, h3 gets two spaces.
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
      let insertAfter = 0;
      if (raw.startsWith('---')) {
        const end = raw.indexOf('\n---', 3);
        if (end !== -1) insertAfter = end + 4;
        while (raw[insertAfter] === '\n') insertAfter += 1;
      }
      // Remove an existing toc block, if any.
      const stripped = raw.replace(
        /<!-- toc:start -->[\s\S]*?<!-- toc:end -->\n?/,
        '',
      );
      // `insertAfter` is not recomputed against `stripped`. It would need adjusting by the
      // removed length, but the toc is normally at the very top so this stays safe.
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
      // Migrate selection, address, active memory, and recent/pinned. Leaving the address
      // behind makes the "the URL requests a missing document" verdict catch the old address
      // the moment the manifest updates, raising a false warning (walkthrough 2026-08-13).
      // The new name is deferred as "not known yet" until it appears in the manifest.
      const prev = selectedSlug;
      appTouchedSlugsRef.current = new Set([prev, nextSlug]);
      setSelectedSlug(nextSlug);
      replaceUrlState({ slug: nextSlug });
      setRecentSlugs((list) => {
        const mapped = list.map((s) => (s === prev ? nextSlug : s));
      // No direct writes inside an updater function — same reason as the delete path above.
        queueMicrotask(() => {
          try {
            window.localStorage.setItem(
              `${RECENT_DOCS_STORAGE_PREFIX}${recentKey}`,
              JSON.stringify(mapped),
            );
          } catch {
            /* ignore */
          }
        });
        return mapped;
      });
      setPinnedSlugs((list) => {
        const mapped = list.map((s) => (s === prev ? nextSlug : s));
        queueMicrotask(() => {
          try {
            window.localStorage.setItem(
              `${PINNED_DOCS_STORAGE_PREFIX}${recentKey}`,
              JSON.stringify(mapped),
            );
          } catch {
            /* ignore */
          }
        });
        return mapped;
      });
    } catch (err) {
      window.alert(
        t('dialog.renameFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [canEditCurrent, selectedSlug, manifest, localVault, recentKey, replaceUrlState, setPinnedSlugs, setRecentSlugs, t]);

  // "New document" asks for the kind first (domain / capability / element / document). There
  // is no generic `title:` template, which forces "a document in this vault is a node" at the
  // moment of creation. Clicking a kind prompts for a title, and `buildNewNodeDoc` serializes
  // it into the kind's folder with normalized frontmatter — the same function the map uses
  // to create a node (entities/docs-vault).
  const [newDocKindDialogOpen, setNewDocKindDialogOpen] = useState(false);
  const handleOpenNewDocDialog = useCallback(() => {
    if (!canEditCurrent) return;
  // The single-transient rule — opening this modal closes the other L2 popovers (gear
  // dropdown, VaultChip, ⌘K). Same contract as `openContract`.
    setAdvancedOpen(false);
    setVaultChipOpen(false);
    setPaletteQuery(null);
    setNewDocKindDialogOpen(true);
  }, [canEditCurrent, setAdvancedOpen, setVaultChipOpen, setPaletteQuery]);
  // Near-duplicate detection in the GUI. A separate, earlier signal from an outright slug
  // collision (`renameAlreadyExists` above, untouched): it shows "a node of the same kind
  // with a similar title already exists" before creating, without blocking. The creation
  // logic is factored into `commitCreateDoc` and shared with the "create anyway" path.
  const [pendingSimilarDoc, setPendingSimilarDoc] = useState<{
    slug: string;
    markdown: string;
    match: SimilarNodeMatch;
  } | null>(null);
  const commitCreateDoc = useCallback(
    async (slug: string, markdown: string) => {
      try {
        await localVault.createDoc(slug, markdown);
        // Select the newly created document and enter edit mode.
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
        // Non-blocking — creation is not prevented, only a choice is offered (human-sovereign).
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

  // Once on mount — backfill from the localStorage preference when the initial URL carries
  // no value. A ref gates whether it ran, and the deps list only component-stable values.
  const initialPrefsAppliedRef = useRef(false);
  useEffect(() => {
    if (initialPrefsAppliedRef.current) return;
    initialPrefsAppliedRef.current = true;
    scheduleStateSync(() => {
      if (!searchParams?.has('view')) setView(queryView);
    });
  }, [searchParams, queryView]);

  // URL → state sync: local state follows only when the URL query changes. The other
  // direction (state → URL) is already handled by `router.push` on user interaction.
  // `usePrevious` compares against the previous URL value so the action fires only when the
  // URL actually changed.
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
  // The screen follows when order changes via back, a shared link, or a URL from an agent.
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
  // Frontmatter references use the bare slug (`ai-agent-partner`) while `doc.slug` is
  // path-shaped (`ontology/domains/ai-agent-partner`). All three spellings — bare slug,
  // frontmatter `slug`, and path tail — resolve to the real navigation slug (path form
  // first; a frontmatter bare slug is more authoritative than a tail). An unresolved
  // reference is not rendered as a link.
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
  // The open-document tab working set. `sourceKey` reuses `useDocsVaultPersistence`'s
  // `recentKey` rather than inventing a second per-vault convention
  // ('server' | `local:<handle.name>`). The active source of truth is still
  // selectedSlug / the URL; this hook owns only the list of open documents.
  const {
    tabs: openDocTabs,
    hydrated: openDocTabsHydrated,
    restoredActiveSlug,
    rememberActiveSlug,
    openTab: openDocTab,
    closeTab: closeDocTabInWorkingSet,
  } = useOpenDocTabs({ sourceKey: recentKey, validSlugs: vaultSlugs });
  // With no URL deeplink, restore the last active document from the per-vault tab store,
  // once. Both hydration and the restore target are checked before moving `selectedSlug`, so
  // the default README does not open first right after a sourceKey switch and overwrite
  // `lastActivatedAt`.
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
  // Opening a tab is a side effect of document selection, so every path that changes
  // `selectedSlug` (sidebar, search, deeplink) converges here and no call site needs its own
  // instrumentation.
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
   * **The URL requests a document this vault does not have** — said once, then gone.
   *
   * It was derived from `normalizedQuerySlug` at first, and it **reappeared every visit**;
   * the owner caught it in the app (*"Why is this showing up in the docs surface?"* — why does this keep showing
   * up in the docs surface?). The cause was not the banner but **the URL lying persistently**:
   * the unresolved slug stayed in the address, so the same verdict became true again on every
   * entry. And nobody had requested that slug — it was residue from a time when a different
   * vault was open, stuck to the address.
   *
   * So both are fixed together:
   *
   * 1. **Correct the address to the document actually opened** (the default-selection effect
   *    below). It used to deliberately leave the URL alone whenever `?slug=` was present, and
   *    that courtesy was exactly the lifespan of the lie.
   * 2. **The banner captures that moment as state.** Once the address is corrected the derived
   *    condition is immediately false, so a derived value would vanish before anyone read it.
   *
   * Result: a genuinely broken deeplink or handoff link shows it **once**, a stale address
   * never does, and picking a document dismisses it.
   */
  const [missingQuerySlug, setMissingQuerySlug] = useState<string | null>(null);
  /**
   * **An address the app itself just touched is not "missing"** (two walkthrough measurements,
   * 2026-08-13).
   *
   * Two addresses hit the verdict after a rename or delete: ① the retired old address — a tree
   * click is a router navigation, so `useSearchParams` still holds the old `?slug=` and
   * `replaceUrlState`'s `history.replaceState` is invisible to that hook. The moment the
   * manifest updates and the name disappears, "the requested document is missing" fires and
   * **attaches a failure warning to a rename or delete that just succeeded** (both within
   * 0.5 s; a delete has already passed a confirmation dialog). ② the new address of a rename —
   * the manifest is a poll behind, and in that gap the new name also looks missing. Neither is
   * an outside request; both are the app's own action, so neither is subject to the verdict.
   * The guard lifts as soon as the user navigates elsewhere (the query leaves that set).
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
      // The document appeared — drop the captured verdict. This is the case where a "missing"
      // decided during the boot-time sample window became false once the local vault arrived
      // (2026-08-08).
      setMissingQuerySlug((prev) => (prev === normalizedQuerySlug ? null : prev));
      return;
    }
    // While the vault has not loaded (`docsBySlug` empty) and while boot has not decided which
    // vault to show (before `vaultScopeSettled`), the answer is "not known yet", not "missing".
    // Speaking in that window is a flicker at best and, worse, sentences a document that really
    // exists in the local vault as missing against the sample manifest (measured on device
    // 2026-08-08 — that sentence removed a deeplink).
    if (!vaultScopeSettled) return;
    setMissingQuerySlug((prev) => prev ?? normalizedQuerySlug);
  }, [normalizedQuerySlug, docsBySlug, vaultScopeSettled]);

  /**
   * **When the vault changes, clear the vault-scoped address state** — this is the root fix.
   *
   * `?slug=` is **a name that only means something inside one vault**, and the address does not
   * know about vaults. So when the user switches folders or moves between the sample and their
   * own vault, that name loses its meaning while nobody clears it and it sticks to the address.
   * From then on the docs surface re-decided "the requested document is missing" on every entry
   * — while **nobody had requested it.**
   *
   * Making the banner conditional treats the symptom (the verdict stays true). Deleting the name
   * **at the moment it loses meaning** treats the cause. Then:
   *
   * - a stale slug cannot survive a vault boundary → the noise is structurally zero
   * - the banner does its one job — **a link from outside** (a deeplink, an agent handoff, a
   *   bookmark) that is genuinely broken, once
   * - the address never points at a document that is not open
   *
   * The first mount is skipped: that `?slug=` is not residue, it is **something someone gave us**.
   *
   * ⚠️ **`recentKey` is not the right scope for this verdict.** That key is a storage namespace
   * and collapses both samples (dogfood, example storefront) into a single `'server'`. Using it
   * would make **a sample↔sample switch invisible as a scope change**, leaving the very noise
   * this fixes alive on that one axis (raised and reproduced 2026-08-01).
   *
   * Widening `recentKey` itself is not the answer either — that moves where pins, recents, and
   * open tabs are stored and orphans the user's existing lists instead of fixing anything. Only
   * the cleanup verdict uses the precise scope.
   */
  const vaultScope = source === 'local' ? recentKey : `sample:${staticVault.source}`;
  /**
   * ⚠️ **A scope change before settling is boot, not a vault switch** (2026-08-08).
   *
   * This cleanup must run only when *the user* switches vault, but on a cold load the stored
   * source preference hydrating from `sample:…` to `local:…` also registered as a scope change.
   * So **a `?slug=` deeplink someone had just handed over was mistaken for residue mid-boot and
   * deleted**, after which tab restore saw "no URL", seated the last-viewed document, and
   * overwrote the address — the requested document replaced by someone else's last screen, which
   * is the jugular of an agent handoff link (live review 2026-08-08:
   * `?slug=domains/typed-api` requested → overwritten with `capabilities/temporal-graph`).
   *
   * The comment directly above already said *"the first mount's `?slug=` is not residue, it is
   * something someone gave us"*, but that protection applied only to the first run and never
   * reached **the hydration switch during boot**. So the baseline moved from "the first run" to
   * **"the first settled scope"** — only a scope change after settling is a real vault switch.
   *
   * **Second review, 2026-08-08 — the definition of "settled" was wrong and the same accident
   * survived.** The first fix's predicate treated `source === 'server'` as settled immediately,
   * but on a boot whose stored preference is the sample, the landing auto-switch flips the source
   * the instant the local vault restore finishes — so that "server settled" was a false one
   * lasting a few hundred milliseconds, and the flip read as a "vault switch" that again removed
   * the deeplink. Today's `vaultScopeSettled` (defined above) includes
   * `landingSourceResolved`, so that window is never observed as settled. e2e:
   * `docs-deeplink.spec.ts` measures a full record of `replaceState` calls down to "zero calls
   * that lost the deeplink".
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
  // The tree, tabs, search, and map call one document by the same name. The file path stays
  // visible in the caption directly below, so file identity is not lost.
  const selectedDocDisplayTitle = selectedDoc
    ? resolveLocaleDisplayName(selectedDoc.frontmatter, locale, selectedDoc.title)
    : "";
  // Does this document **have an address on the map**? Null means it has no place in the graph,
  // and then "open on the map" is not rendered (zero dead CTAs). `DocMetaBar` uses the same
  // verdict — the function is shared so the two places cannot say different things.
  const mapDeeplinkForSelectedDoc = selectedDoc
    ? buildTopologyDeeplinkForDoc(selectedDoc) ?? buildOntologyDeeplinkForDoc(selectedDoc)
    : null;
  // Domain candidates for the frontmatter verdict action: only the vault's `kind: domain`
  // documents. The point is fixing a capability or element assigned to the wrong domain right
  // there, without hand-editing raw YAML.
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
        // `DocFrontmatterPatch` is a narrow shape of kind/domain/title. It is structurally
        // compatible with `updateFrontmatter`'s index-signature parameter (every value is
        // `string | null`), but TS separately requires the index signature, hence the cast.
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
  // Client-side dynamic title. Static export metadata cannot be pre-built per slug (the vault
  // is the user's local folder), so the selected document's title is applied here, composed the
  // same way as layout.tsx's server template (`%s · siteName`).
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
  // Full-text body index for the palette. The body source is the same as the viewer's (local:
  // lazy read through a FileSystemFileHandle; static: the bundled content.json plus a fetch).
  // The cache is keyed by mtime, so after a polling diff rebuild only changed documents are re-read.
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

  // The first screen **shows what it actually has** (measured defect 2026-07-28 — the vault pill
  // said "31 documents" while the list showed zero). The collection default is decided before the
  // documents arrive, so it is reinterpreted once, on the frame the documents first land.
  //
  // **Once** is the contract — running it repeatedly would undo a zero-count collection the user
  // deliberately chose (the chips show counts, so that click is intentional).
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
    // In the "all documents" view, picking a document does not narrow the collection — a
    // document selection must not undo the user's intent to see everything.
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
        firstReadableSlug(docs),
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
        // Before boot decides which vault to show (the landing decision has not concluded),
        // default selection waits too — a default chosen in the sample window overwrites the
        // deeplink of the local vault about to arrive (2026-08-08). All three consumers share
        // one predicate.
        selectionReady: vaultScopeSettled,
      })
    ) {
      return;
    }

    // First-entry default. `docs/README.md` is usually absent from a vault (`AGENTS.md` is the
    // canonical guide), which is why ARCHITECTURE used to be the fallback — but for a first-time
    // visitor a list of *what they can do right now* (FEATURES) is worth more than ARCHITECTURE,
    // and AGENTS.md itself points at "features users can use right now, see docs/FEATURES.md".
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

    scheduleStateSync(() => {
      setSelectedSlug(nextSlug);
      /**
       * **The address points at the document that is open** (fix, 2026-08-01).
       *
       * The URL used to be left alone whenever `?slug=` was present. That was meant to preserve
       * the request, but when the requested document could **not** be opened the courtesy was
       * exactly **the lifespan of a lie** — the screen shows A while the address keeps naming B.
       * Copying and sharing that address sends the recipient to the same place.
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
      // Once the user picks a document themselves, stop pushing the sample welcome note. (The
      // default-selection effect does not go through this function and is unaffected.)
      setSampleWelcomeDismissed(true);
    },
    [recentKey, rememberActiveSlug, replaceUrlState, setRecentSlugs],
  );

  // Tab close rule: closing the active tab moves to an adjacent one (left first, otherwise
  // right). Closing the last tab falls back to the first document in the list or README —
  // isomorphic to the default-selection priority, which also prefers README over the first document.
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
    // The bundled manifest's headings are empty (split into a separate chunk); in that case
    // they come from the lazily loaded map for the same vault. A local manifest has them inline.
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
  // The always-on outline rail in the left margin appears only for long documents (headings at or
  // above the threshold) — on short documents it is noise.
  const showOutlineRail = shouldShowOutlineRail(outlineHeadings.length);
  // Scroll jump on outline click. The rail and the inspector panel share the same behaviour, so
  // it is defined in one place.
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

  // The full command list for the ⌘⇧P palette. Visibility is computed dynamically from selection,
  // source, editing state, and so on.
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

  // The left sidebar's inner content, reused by both the aside and the mobile drawer. The caller
  // wraps `onSelect` with closing the mobile drawer.
  const handleSelectFromSidebar = useCallback(
    (slug: string) => {
      handleSelect(slug);
      setSourceTreeOpen(false);
    },
    [handleSelect],
  );
  // The "agent files" group is computed from the whole manifest, independent of the collection
  // filter. Non-null only when the vault includes the repository root (gated inside the hook);
  // detection is read-only.
  const agentFiles = useAgentFilesModel(manifest, localVault.fileHandles);
  /**
   * Skill-copy parity — **only when there is an absolute path.** On the web `localVaultRootPath`
   * falls back to the handle name, and using that would call the bridge with a path that does not
   * exist there. This accepts a real absolute path only.
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
        // Silence reads as success — report the failure too.
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
      // Turn a blocked affordance into **a live path** (owner report 2026-07-28: "why is there no
      // 'create document'?"). In the read-only sample the `+` used to be disabled at 40% opacity
      // with the reason available **only on hover** — the information existed but never arrived,
      // and the screen read as "that feature does not exist".
      //
      // The charter's degradation grammar is "why it is unavailable **and where to go**", so
      // pressing it now goes to what makes it possible: open my folder.
      onCreateNewDoc={canEditCurrent ? handleOpenNewDocDialog : handleVaultPillSwap}
      canCreateNewDoc={canEditCurrent}
      sort={treeSort}
      group={treeGroup}
      onSortChange={handleTreeSortChange}
      onGroupChange={handleTreeGroupChange}
      agentFiles={agentFiles}
    />
  );

  // Show the real path only when a local folder is genuinely open (including the desktop dogfood
  // auto-load). In a pure static/server sample (the build-time manifest) `isLocalSourceLoaded` is
  // false and `DOGFOOD_VAULT_PATH` is the build machine's developer absolute path — showing it
  // would be both misleading and a path leak. That case renders the "bundled sample" label instead.
  const vaultPillPath =
    isLocalSourceLoaded && localVaultRootPath
      ? localVaultRootPath
      : isLocalSourceLoaded && localVault.handle
        ? localVault.handle.name
        : t('header.vaultPillSampleLabel');
  const vaultTopLevelFolderCount = manifest.tree.children?.filter(
    (child) => child.type === 'dir',
  ).length ?? 0;
  // The vault pill's "switch vault" keeps only the high-frequency swap, which is part of the
  // read/write flow. It used to open the vault tools dropdown; now local calls the native folder
  // re-pick (`openLocalVault`) and the desktop sample→local switch calls the source switch
  // directly. Recent vaults, close, refresh, and permission recovery moved to the settings menu's
  // vault tab.

  return (
    <div className="flex h-full w-full">
      {/* The rail lives in the layout (AppShell) since the persistent-shell work. */}
      <div className="topology-ui-scale relative flex h-full min-w-0 flex-1 flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
      {/* The 76px chrome grid — breadcrumb 32px + a three-zone 44px header. Same idea as the
          topology's `--topology-index-top` clearance: only a fixed grid keeps the content start
          line from shifting between views. At lg+ the header fills the grid as a single h-11 row;
          below lg the two-row wrap plus the mobile drawer stay, because a single row causes
          horizontal scrolling at a 390px viewport (the zero-overflow contract in
          local-vault-picker.spec.ts). */}
      <div data-chrome-grid="44" className="flex-none">
      {/* The breadcrumb row was removed. The left nav rail already highlights "docs", answering
          "where am I", and the rail's map destination (→ /topology) owns the way back, so this
          row's back link was duplicate navigation. That recovers 32px of vertical space; the one
          thing the rail cannot do — returning to the insights review the user came from — moved
          into the header's zone-l (the insightsReturnTab chip below). The "docs" identity is kept
          as an sr-only h1. */}
      {/* Header three zones: [zone-l identity] [zone-c tabs] [zone-r tools]. The macOS download
          button was removed here entirely — it is owned by the read-only sample banner and
          /download alone. */}
      {/* Tablet vertical compression (owner report 2026-07-23) — the single-row switch moved from
          lg down to md. Measured at 768: zone-l (~230px) + zone-r (~343px) = 573px fits
          comfortably in one 728px row, yet it was wrapping to two rows (~90px total). Below md the
          two-row wrap stays (zero-overflow contract). */}
      {/* `isolate` and `z-10` are **a pair** (owner report 2026-08-17: the folder dropdown looked
          *"transparent, somehow wrong"*).

          `isolate` confines the tab strip's local stacking here — but that also confines the
          header's popovers and dropdowns. The folder menu's `z-50` became valid **only inside the
          header**, and the header itself had no layer (auto), so the reading pane that comes after
          it in the DOM covered the whole header. The reading pane has a transparent background, so
          **only its text drew over the menu**, which read as a translucent menu (measured: the
          reading pane at x344+ drew over the menu at x128–416).

          `z-10` is enough — the only opponent is one sibling at `auto`, and staying under 20 leaves
          the global ladder (bars at 25, dialogs at 60) untouched.
          Gate: `tests/e2e/docs-vault-chip-menu-stacking.spec.ts`. */}
      <header className="relative isolate z-10 flex min-h-14 flex-none flex-wrap items-center gap-x-3 gap-y-2 bg-[color:var(--color-panel)] px-3 py-2 md:h-11 md:min-h-0 md:flex-nowrap md:gap-2 md:px-4 md:py-0">
        <h1 className="sr-only">{t('header.title')}</h1>
        {/* The header baseline. Under the active tab this 1px line must be replaced by a 2px indigo
            underline, so it is an absolutely positioned line rather than the header's own
            `border-b`. Its negative z-index is scoped by the header's `isolate`, so normal-flow
            content (zone-l/zone-c/zone-r) always draws above it — the active tab's opaque
            `--color-canvas` background covers the line naturally and draws its own 2px bar on top,
            so no double line appears. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px bg-[color:var(--color-border-soft)]"
        />
        {/* zone-l — the list toggle and the VaultChip.
            Width contract: while the list is expanded, zone-l's right edge lines up exactly with
            **the document pane's left edge**, so the tab strip is aligned over the pane it opens
            (the tab=pane rule of VS Code and Obsidian). The calculation is
            list-width − header padding (1rem) − zone gap (0.5rem). It used to stretch with flex-1
            to a max-w-300 cap larger than its content (≈197px), starting the tabs 50px right of the
            pane edge (owner report). With the list collapsed there is no pane edge to align to, so
            it returns to content width. */}
        <div
          data-docs-header-zone="identity"
          className={cn(
            // The md single-row switch: forcing `w-full` is residue from the sub-md two-row wrap, so
            // from md it uses content width. The list-pane alignment contract (`lg:w-[calc...]`)
            // stays at lg only, since the pane is lg+ exclusive.
            "flex w-full min-w-0 flex-none flex-wrap items-center gap-2 md:w-auto md:flex-nowrap md:gap-3",
            docListCollapsed
              ? "lg:w-auto"
              : "lg:w-[calc(var(--docs-list-width)-1.5rem)]",
          )}
        >
          {/* The one thing worth keeping from the removed breadcrumb: returning to the insights
              review the user came from. The rail's map destination does not cover that path, so it
              moved to the header. Not rendered on a normal (non-insights) entry — the rail owns
              going back to the map. */}
          {insightsReturnTab ? (
            <Link
              href={workspaceHref}
              aria-label={t('header.backToReviewAriaLabel')}
              // This Link stands beside the "open tree" chip. It is not a `<button>` so the ratchet
              // does not see it, but normalizing only one of them makes their heights diverge.
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
          {/* The chip states **the chosen source**. Drawing a local vault with no folder chosen as
              the sample would make the screen claim "there are 31 documents in my folder"
              (`lib/vault-chip-identity`). */}
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
        {/* zone-c — the open-document tab strip, rendered only when `view==='doc'` (currently the
            only view). With zero tabs it simply stays empty, with no EmptyState (no placeholders).
            `self-stretch` fills the header height so the active tab's background fully covers the
            baseline. */}
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
        {/* zone-r — source pill → ⌘K → check → document info → gear (local). Fixed order; nothing
            hidden and nothing overlapping.
            Defect found in review 2026-07-23: the old `lg:max-w-[340px]` cap made EN labels
            (Sample/Local/SETTINGS) exceeding 340px spill left of the cap under justify-end and
            cover the tab strip (28px measured at 1440). Removing the cap gives it natural width;
            zone-c (a `flex-1 min-w-0` scrolling strip) simply shrinks, making overlap structurally
            impossible. */}
        {/* The md single-row switch — `w-full` is released from md and `ml-auto` right-aligns
            (zone-c's tab strip is lg+ only, so there is no natural gap in the md band). At lg
            zone-c owns the gap and `ml-auto` is a no-op. */}
        <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 md:ml-auto md:w-auto md:flex-nowrap">
          {/* ⚠️ **The source radio and the check tile used to be here** (removed 2026-08-08).
              The "Sample | Local" control at the right edge repeated what the vault chip on the left
              already said (one fact, two places), and there were two ways to change it — the chip
              menu and this radio. The owner named this cluster as confusing: a switch that changes
              the whole screen's data source sat beside search and clipboard with no distinction of
              kind.
              Display, switching, and checking all consolidated into the vault chip (zero new
              surfaces). What remains here is ⌘K — plus the settings tile only below `lg`, where the
              rail is hidden. */}
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
          {/* The docs header's vault tools dropdown was absorbed into the settings menu. Agent
              configuration, repair, the copy packet, and the verification gate now belong to
              AppSettingsMenu's vault / mcpAgents tabs. Only the gear that leads there stays in the
              header (zero new surfaces, zero new tabs). Local vault management (the picker) also
              opens from the settings vault tab; the vault pill handles only the high-frequency swap.
              At lg+ the nav rail's gear owns this, so the chrome tile appears only below lg where
              the rail is hidden. */}
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

      {/* An explicit banner when the source is local but the vault is in error or
          permission-needed. It used to fail silently: the server manifest (sample docs) was shown
          and the user never learned their vault was dead. Fixable directly from the picker (the
          gear at the header's right). */}
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
              : // A rejection is not a failure — leaking the cause string would show the user
                // `vault-root-rejected:filesystem-root`.
                localVault.errorCode === 'root-rejected'
                ? t('vaultStatus.rootRejectedBanner')
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
       * **Say so when the requested document is not in this vault** (measured fix, 2026-08-01).
       *
       * When `?slug=` does not resolve, the default-selection logic picks README or FEATURES and
       * simply draws it. Meanwhile the URL still carries the requested slug (the default-selection
       * effect used to leave the URL alone whenever `normalizedQuerySlug` existed), and nothing on
       * screen says it was not found.
       *
       * Measured outcome: someone following a document link from the [connect an agent] sheet
       * landed in front of the demo storefront's **"delete my account"** document. That link was
       * fixed too (its address named no vault), but **a silent substitution is not one link's
       * problem** — every deeplink, bookmark, and agent handoff after a vault change or a deleted
       * document arrives the same way.
       *
       * The same illness this repository already learned once: the banner directly above records
       * *"it used to fail silently … the user never learned their vault was dead"*.
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
          // **Do not draw an action for something the browser cannot do in principle.**
          // This card opens the repository's absolute path with `createTauriVaultHandle`, and the
          // web has no such runtime. It used to render on the web too, where pressing it threw
          // `Tauri vault runtime is not available.` and **nothing on screen changed** (measured
          // 2026-07-28: identical body length before and after the click). That is a dead CTA, which
          // `.claude/rules/surfaces.md` forbids by name.
          //
          // No degraded card is built in its place because the paths that *do* work on the web
          // (open a folder, view the sample) sit right beside this one. Leaving what works is
          // better than explaining what does not.
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
        {/* It covers the whole screen, so it uses the **opacity-only** grammar (`motion="overlay"`):
            movement or scale on a surface this large reads as the screen itself shaking. The scrim
            and the drawer enter and leave as one surface. */}
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

        {/* Persistent left pane — the `--docs-list-width` (280px) file tree. Always visible at lg+;
            below that the drawer above replaces it (the menu button is `lg:hidden`). Collapsed
            means width 0 — no 34px slim rail — because re-open discoverability is already covered
            three ways: zone-l's PanelLeft tile (in its active state), the tabs, and ⌘K. */}
        <aside
          // The anchor the two-step docs tour points at for "your folder list is on the left". While
          // collapsed (width 0) the anchor fails to resolve and the tour folds to one step — it does
          // not point at somewhere that is not there.
          data-testid="docs-vault-doc-list"
          aria-label={t('mobileDrawer.title')}
          aria-hidden={docListCollapsed}
          // `aria-hidden` alone leaves the search input and tree buttons hidden behind width 0 still
          // in the Tab order (focus disappearing somewhere invisible — a WCAG defect, and a
          // contradiction with focus inside `aria-hidden`). `inert` blocks focus and pointer together
          // (React 19 boolean inert).
          inert={docListCollapsed}
          style={{ width: docListCollapsed ? 0 : 'var(--docs-list-width)' }}
          className={`hidden flex-none flex-col overflow-hidden bg-[color:var(--color-panel)] transition-[width] duration-[var(--motion-base)] ease-[var(--motion-ease)] lg:flex ${
            docListCollapsed ? '' : 'border-r border-[color:var(--color-border-soft)]'
          }`}
        >
          {sidebarBody}
        </aside>

        {/* Body plus the right side. */}
        <main
          id="main"
      tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          /**
           * A marker for measuring the installed app: **were the dot directories actually read?**
           *
           * That verdict is a **desktop capability**, so proving it in a browser proves nothing
           * (`.claude/rules/surfaces.md`). But the place that shows the verdict is inside the docs
           * check modal, which is absent from the DOM while closed — so this always-present element
           * carries the summary. `-` means "this surface does not have that capability" (the web),
           * and `0/0` means "the capability exists but this vault has no skill tree". They are
           * different facts and are not collapsed into one value.
           */
          data-skill-parity={
            skillParity ? `${skillParity.rows.length}/${skillParity.disagreeing}` : "-"
          }
        >
          {selectedDoc ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* The sample entry note: landing in sample mode with no deeplink, this explains in
                  plain language what this docs surface is and how to use it, ahead of the document
                  body. It disappears once the user picks a real document (`handleSelect`). */}
              {!editing && showSampleWelcomeNote ? (
                <SampleWelcomeNote
                  canOpenLocalVault={!localSourceDisabled}
                  onOpenFolder={() => handleSourceChange('local')}
                  onDismiss={() => setSampleWelcomeDismissed(true)}
                />
              ) : null}
              {/* Editor head — display title + preview/edit segment + sync status. It used to show
                  only the inner filename of `dir/file.md` in mono, making a raw filename like
                  "README.md" the primary label for a non-developer. The title is now the primary
                  single-line label and the file path drops to a secondary caption — the same
                  `title ?? name` priority the tree (`DocsVaultTree`) uses. */}
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
                {/* The sample notice — why it is read-only and how to switch. It used to be its own
                    53px band above the title. The fact it states belongs to the **vault**, so there
                    is no reason to repeat it per document, and in a sample vault the right side of
                    this row is empty — so it says the same thing at zero vertical cost. */}
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
                {/* The dot is **the label's bullet**, not a state in itself (2026-08-04). It used to
                    be drawn unconditionally while the text appeared only for a local vault, so in
                    sample/server mode a meaningless indigo dot floated there — colour carrying no
                    information.
                    ⚠️ This line says only whether the **vault source** is local. It is unrelated to
                    whether this document is on the map, which is `DocMetaBar`'s verdict. */}
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
                {/* The `relative` wrapper is the positioning reference for both the outline rail
                    (absolutely positioned in the empty margin) and back-to-top (laid over, outside
                    the scroll container, so it keeps the same screen position regardless of scroll).
                    The body's max-w-760 still centres inside the overflow-auto container below and
                    is not narrowed by the rail. */}
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                  {/* This rail is the sole owner of the outline. The document-info inspector used to
                      hold a second copy, which required a rule demoting the rail whenever it opened —
                      removing that panel on 2026-07-28 removed the double exposure itself. */}
                  {!editing && showOutlineRail ? (
                    <DocReadingOutlineRail
                      headings={outlineHeadings}
                      activeHeadingSlug={activeHeadingSlug}
                      onHeadingClick={handleHeadingNavigate}
                    />
                  ) : null}
                  <div
                    ref={articleScrollRef}
                    // Scroll-end reserve below lg — this container's bottom cut 17px behind the fixed
                    // tab bar (measured identically at 768/834/600), hiding the last line at the end
                    // of the scroll. The tab bar reserve plus 12px is taken as inner padding of the
                    // scroll content.
                    className="min-h-0 flex-1 overflow-auto max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]"
                  >
                    {editing && canEditCurrent && editResolver ? (
                      <DocsVaultEditor
                        key={`edit:${vaultScope}:${selectedDoc.slug}`}
                        vaultScope={vaultScope}
                        doc={selectedDoc}
                        getDocContent={editResolver}
                        onSave={(slug, content, expectedMtime) =>
                          // Re-throw the conflict rather than swallowing it, so the editor keeps the
                          // buffer dirty and blocks the next poll from clobbering it. (An older
                          // version returned here, producing a phantom-clean state and data loss.)
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
                        {/* Why the gate disappeared here (2026-08-04): the block used not to render at
                            all when `kind` was missing, but a missing or empty kind is **the two most
                            common ways a node vanishes from the map** — so the screen went silent in
                            exactly the two cases that most needed explaining. The verdict now belongs
                            to the component: it still draws nothing for guide documents (the validator
                            raises no issue for a document with no ontology intent) and draws a short
                            diagnosis for a document that tried to be a node and failed. One place for
                            the verdict is what keeps the two from disagreeing. */}
                        <DocFrontmatterBlock
                            key={selectedDoc.slug}
                            doc={selectedDoc}
                            canEdit={canEditCurrent}
                            domainOptions={domainOptions}
                            onPatch={handlePatchDocFrontmatter}
                            onNavigate={handleSelect}
                            resolveRef={(token) => refSlugResolver.get(token) ?? null}
                            // The real data behind the last-editor and conflict badges. Both use only
                            // what the local vault singleton (`LocalVaultProvider`) actually observed —
                            // in a server or sample vault there is no heartbeat or self-write record,
                            // so the component renders nothing on its own.
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
                {/* Right side: heading outline, share, and file management. Closed by default so the
                    body comes first; opened from the header's inspector button when needed. Backlinks
                    are not here — the strip at the bottom of the pane is the single source. */}
              </div>

              {/* The backlinks strip at the bottom, anchored to the full pane width and always
                  visible. Persona QA found it was gated on `backlinksDetail.length > 0` against that
                  spec, so on a document with no backlinks the strip vanished entirely and the feature
                  was undiscoverable — zero backlinks now shows an empty-state line so the user can
                  tell "there are none yet". */}
              {!editing ? (
                /*
                 * **The reserve applies to this bar too** (measured fix, 2026-08-01).
                 *
                 * It used to be applied only to the scroller above (`articleScrollRef`). But this bar
                 * is that scroller's **`flex-none` sibling**, so the scroller's inner padding
                 * structurally cannot reach it. It did not lose a cascade — **the reserve was applied
                 * to the wrong box.**
                 *
                 * The result was beyond occlusion: it was **input theft**. At 375, 390, 600, 640, 700,
                 * 768, 834, 900, and 1023 (the whole sub-lg band where the tab bar exists),
                 * `elementFromPoint(centre)` returned `bottom-tab-get-app`, and pressing it really did
                 * go to `/download/`. Someone trying to open a document on the map arrived at the
                 * download page instead.
                 *
                 * Written as base + an `lg:` override rather than `max-lg:`, so which one wins does not
                 * depend on class order.
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
                  {/* Go there directly — `/ontology/?node=` is a **thin redirect** to the map (the old
                      hub is retired), so it wastes a hop. The `?p=` focus link arrives at the same place.

                      **The `?? '/topology/'` fallback was a dead CTA** (measured 2026-08-04). For a
                      document with no node in the graph both builders returned null and this link
                      rendered as `/ko/topology/` — pressing it opened the map with **nothing selected**.
                      A control labelled "open on the map" with nothing to open is not a degradation but
                      a trap, and zero dead CTAs is this repository's contract
                      (`.claude/rules/surfaces.md`). With no address to build, nothing is rendered — the
                      diagnosis block above already says why that document is not on the map. */}
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

      {/* The modal skeleton, including enter/exit presence, belongs to the Dialog primitive — the
          call site passes only `open`. */}
      <NewDocKindDialog
        open={newDocKindDialogOpen}
        onSelect={(kind) => void handleCreateNewDocWithKind(kind)}
        onClose={() => setNewDocKindDialogOpen(false)}
      />

      {/* Non-blocking near-duplicate warning. A bottom-anchored chip that does not cover the screen
          (no scrim, no backdrop), so interaction with the content behind it is not blocked. No
          autoFocus — it steals focus from no input. */}
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


/**
 * ⚠️ **What Docs opens by itself is not simply "the first document".**
 *
 * An architecture profile sorted first in its folder, Docs auto-opened it, and `<main>` fell to 26
 * elements against a floor of 40 (`a11y-vault-backed.spec.ts`) — the reading surface's opening
 * screen became a twenty-line frontmatter record with nothing to read. It stays in the list, where
 * the standing 2026-08-26 architecture record puts it; it is only never the unattended choice.
 */
function firstReadableSlug<T extends { slug: string; frontmatter: Record<string, unknown> }>(
  docs: readonly T[],
): string | undefined {
  /*
   * No fallback to `docs[0]`. A collection whose only member is a profile — the storefront
   * sample's guides collection is one — has nothing to read, and opening the profile anyway is
   * the exact screen the element floor caught. Every caller already handles "no document".
   */
  return docs.find((doc) => !isArchitectureProfile(doc))?.slug;
}

export function DocsVaultPage() {
  // Local-first core (`.claude/rules/local-first.md` §1) — reaching the vault picker passes through
  // no auth gate. The user's local disk is the source of truth.
  return (
    // This inner boundary is closer than the route boundary, so what actually gets baked into the
    // prerendered HTML is this fallback — null would make the deployed docs surface start as a black
    // screen with only the rail.
    <Suspense fallback={<RouteLoadingFallback />}>
      <DocsVaultContent />
    </Suspense>
  );
}
