"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { buildDocsVaultHref } from '@/entities/docs-vault';
import { Chip } from '@/shared/ui';
import { useOntologyInsight } from '@/features/vault-ontology';

import {
  deriveArchitectureProfilesReport,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import {
  useAgentServer,
  useDataSourceMode,
  VaultSourceHydrationBoundary,
} from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
import {
  type AcpTurnActivity,
  type AnalysisCaptureContext,
  ANALYSIS_FINDINGS_INSTRUCTION,
  analysisGraphFromInsight,
  connectorAcpServers,
  runtimeOwnsWriteGate,
  vaultMcpServers,
  vaultSelfReadSlot,
} from '@/features/acp-session';
import { useVaultConnectors } from '@/features/mcp-connectors';
import { detectAcpRuntimes, isAcpBridgeAvailable } from '@/shared/lib/tauri-acp';
import {
  getTauriVaultRootPath,
  isTauriVaultRuntime,
  listTauriVaultEntries,
  readTauriVaultText,
} from '@/shared/lib/tauri-vault-fs';
import { deriveRoleConcepts, type RoleConcept } from '../model/role-concepts';
import {
  deriveRoleSourceModules,
  type RoleSourceModule,
  type SourceDirEntry,
} from '../model/source-modules';
import { useArchitectureRecords } from '../model/use-architecture-record';
import {
  ArchitectureWorkbench,
} from './ArchitectureWorkbench';
import {
  ArchitectureAgentDock,
  type ArchitectureAgentOpeningRequest,
} from './ArchitectureAgentDock';
import {
  resolveArchitectureAgentRoute,
  selectArchitectureAgentRuntimes,
  type ArchitectureAgentRequest,
  type ArchitectureAgentRuntime,
} from '../model/architecture-agent';

/* The runtime never changes inside a session, so the store is a constant read. Same shape as
   `DocsVaultPage`; two surfaces answering "am I the installed app?" differently would be a
   question the next reader has to resolve twice. */
const subscribeDesktopRuntime = () => () => undefined;
const readDesktopRuntime = () => isTauriVaultRuntime();
const readServerDesktopRuntime = () => false;

type VaultDoc = { slug: string; frontmatter: Record<string, unknown> };
const EMPTY_DOCS: VaultDoc[] = [];
const EMPTY_HANDOFF_CONTEXTS: Record<string, ArchitectureHandoffContext> = {};

function projectSlugForProfile(profile: ArchitectureProfile, docs: ReadonlyArray<VaultDoc>) {
  const project = docs.find((doc) => (
    doc.frontmatter.kind === 'project' && doc.frontmatter.uid === profile.projectUid
  ));
  return typeof project?.frontmatter.slug === 'string' ? project.frontmatter.slug : null;
}

async function verifiedAtlasCliEntry(candidateRoots: readonly string[]): Promise<string | null> {
  /*
   * The target repository and the Atlas tool checkout are different things. The first version
   * searched only `sourceRoot`, which happened to work while Atlas inspected itself and made every
   * ordinary project appear to have lost its fallback. A vault commonly lives inside an Atlas
   * checkout (`docs/ontology`), so inspect the independently known roots and a bounded set of vault
   * ancestors. Every candidate still has to prove the Atlas package name and real CLI entry.
   */
  const roots = new Set<string>();
  for (const candidate of candidateRoots) {
    if (!candidate.startsWith('/')) continue;
    let at = candidate.replace(/\/+$/, '');
    for (let depth = 0; depth < 5 && at.split('/').length > 2; depth += 1) {
      roots.add(at);
      at = at.slice(0, at.lastIndexOf('/'));
    }
  }
  for (const root of roots) {
    try {
      const packageText = await readTauriVaultText(root, 'cli/package.json');
      const packageJson = packageText ? JSON.parse(packageText) as { name?: unknown } : null;
      if (packageJson?.name !== 'ontology-atlas') continue;
      const entries = await listTauriVaultEntries(root, 'cli/src');
      if (!entries.some((entry) => entry.kind === 'file' && entry.name === 'index.mjs')) continue;
      return `${root}/cli/src/index.mjs`;
    } catch {
      // A candidate is only a hint. The next independently known root may be the Atlas checkout.
    }
  }
  return null;
}

export function ArchitecturePage() {
  const tReview = useTranslations('analysisWorkbench');
  const locale = useLocale();
  const router = useRouter();
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const { insight } = useOntologyInsight();
  const agentServer = useAgentServer();
  const acpBridgeAvailable = useSyncExternalStore(
    subscribeDesktopRuntime,
    isAcpBridgeAvailable,
    readServerDesktopRuntime,
  );
  const { manifest: staticManifest } = useStaticVaultSource();
  const docs = useMemo(
    () => mode === 'static' ? staticManifest.docs : localVault.manifest?.docs ?? EMPTY_DOCS,
    [localVault.manifest, mode, staticManifest.docs],
  );
  /* The report, not the list: a document this surface cannot read is named on the screen instead
     of replacing every profile in the folder with an error boundary (2026-09-03). */
  const profileReport = useMemo(() => deriveArchitectureProfilesReport(docs), [docs]);
  const profiles = profileReport.profiles;
  const profileProblems = profileReport.problems;
  const gitVaultPath = localVault.handle ? getTauriVaultRootPath(localVault.handle) ?? null : null;
  const knownSlugs = useMemo(() => new Set(docs.map((doc) => doc.slug)), [docs]);
  const [acpRuntimes, setAcpRuntimes] = useState<ArchitectureAgentRuntime[]>([]);
  const [acpRuntimeId, setAcpRuntimeId] = useState<string | null>(null);
  const [runtimeCheckComplete, setRuntimeCheckComplete] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [reviewScope, setReviewScope] = useState<{ profileSlug: string | null; roleId: string | null }>({ profileSlug: null, roleId: null });
  const [analysisParentRunId, setAnalysisParentRunId] = useState<string | null>(null);
  const [analysisParentRequestText, setAnalysisParentRequestText] = useState<string | null>(null);
  const requestSerial = useRef(0);
  const [sectionRequest, setSectionRequest] = useState<{ tab: 'history' | 'conversation'; nonce: number }>({ tab: 'history', nonce: 0 });
  const [agentActivity, setAgentActivity] = useState<AcpTurnActivity | null>(null);
  const [agentOpeningRequest, setAgentOpeningRequest] =
    useState<ArchitectureAgentOpeningRequest | null>(null);

  useEffect(() => {
    if (!acpBridgeAvailable) return;
    let cancelled = false;
    const apply = (list: Awaited<ReturnType<typeof detectAcpRuntimes>>) => {
      if (cancelled) return;
      const usable = selectArchitectureAgentRuntimes(list);
      setAcpRuntimes(usable);
      setAcpRuntimeId((current) =>
        current && usable.some((runtime) => runtime.id === current)
          ? current
          : (usable[0]?.id ?? null),
      );
    };

    void detectAcpRuntimes()
      .then((fast) => {
        apply(fast);
        return detectAcpRuntimes({ probeLogin: true });
      })
      .then(apply)
      .catch(() => apply(null))
      .finally(() => {
        if (!cancelled) setRuntimeCheckComplete(true);
      });
    return () => {
      cancelled = true;
    };
  }, [acpBridgeAvailable]);

  const acpRuntime = acpRuntimes.find((runtime) => runtime.id === acpRuntimeId) ?? null;
  /* Same list as the map's, read from the same file — one vault, one set of attached tools. */
  const vaultConnectors = useVaultConnectors(localVault.handle);
  const acpMcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
        ? {
            command: localVault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: localVault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    // The vault server first, then the connectors the person switched on — the order the
    // handshake reads, and the one that keeps a same-named entry from replacing our own.
    return [
      ...vaultMcpServers(agentServer.launch, gitVaultPath, registration, {
        ownsWriteGate: runtimeOwnsWriteGate(acpRuntimeId),
      }),
      ...connectorAcpServers(vaultConnectors.connectors, acpRuntimeId),
    ];
  }, [
    acpRuntimeId,
    agentServer.launch,
    gitVaultPath,
    localVault.agentConfigStatus?.codexConfigValid,
    localVault.agentConfigStatus?.codexRegisteredCommand,
    vaultConnectors.connectors,
  ]);
  const agentRoute = resolveArchitectureAgentRoute({
    bridgeAvailable: acpBridgeAvailable,
    runtimeCheckComplete,
    serverCheckComplete: agentServer.launch !== null || agentServer.reason !== null,
    runtime: acpRuntime,
    vaultRoot: gitVaultPath,
    serverReady: agentServer.launch !== null,
  });
  const startAgent = useCallback((request: ArchitectureAgentRequest) => {
    setReviewScope({ profileSlug: request.profileSlug ?? null, roleId: request.roleId ?? null });
    setAnalysisParentRunId(null);
    setAnalysisParentRequestText(null);
    setSectionRequest((current) => ({ tab: 'conversation', nonce: current.nonce + 1 }));
    setAgentOpeningRequest({
      kind: request.kind,
      text: `${request.prompt}\n\n${ANALYSIS_FINDINGS_INSTRUCTION}`,
      nonce: ++requestSerial.current,
      profileSlug: request.profileSlug ?? null,
      roleId: request.roleId ?? null,
      scopeKey: JSON.stringify([gitVaultPath, request.profileSlug ?? null]),
    });
    setAgentOpen(true);
  }, [gitVaultPath]);
  /* The click-open meaning layer: reviewed concepts joined into roles, real on every surface. */
  const conceptsByProfile = useMemo(() => {
    const out: Record<string, Record<string, RoleConcept[]>> = {};
    for (const profile of profiles) out[profile.slug] = deriveRoleConcepts(profile, docs);
    return out;
  }, [docs, profiles]);
  const profileKey = profiles.map((profile) => profile.slug).join('\0');
  const profileDocuments = useMemo(() => new Map(profiles.flatMap((profile) => profile.documentSlug ? [[profile.slug, profile.documentSlug] as const] : [])), [profiles]);
  const [loadedHandoffContexts, setLoadedHandoffContexts] = useState<{
    handle: FileSystemDirectoryHandle | null;
    profileKey: string;
    contexts: Record<string, ArchitectureHandoffContext>;
    draftContext: ArchitectureHandoffContext | null;
    modules: Record<string, Record<string, RoleSourceModule[]>>;
  }>({
    handle: null,
    profileKey: '',
    contexts: EMPTY_HANDOFF_CONTEXTS,
    draftContext: null,
    modules: {},
  });
  const loaded = mode === 'local'
    && loadedHandoffContexts.handle === localVault.handle
    && loadedHandoffContexts.profileKey === profileKey;
  const handoffContexts = loaded ? loadedHandoffContexts.contexts : EMPTY_HANDOFF_CONTEXTS;
  const draftHandoffContext = loaded ? loadedHandoffContexts.draftContext : null;
  const sourceModulesByProfile = loaded ? loadedHandoffContexts.modules : undefined;
  /* A browser cannot list a source folder; only the installed app's bridge can. */
  const sourceListingCapable =
    mode === 'local' && !!localVault.handle && getTauriVaultRootPath(localVault.handle) != null;
  /*
   * Why the surface must say *which* thing is missing (2026-08-28 inspection). The installed app
   * opens on a sample with no folder bound, and there the old single sentence told the reader
   * "source modules appear in the installed app" while being the installed app. Two different
   * absences were wearing one message. The runtime answers which one this is: a browser can never
   * list a folder, and an app without a bound folder is one open away.
   */
  const desktopRuntime = useSyncExternalStore(
    subscribeDesktopRuntime,
    readDesktopRuntime,
    readServerDesktopRuntime,
  );
  const sourceUnavailableReason = sourceListingCapable
    ? null
    : desktopRuntime
      ? ('unbound' as const)
      : ('browser' as const);
  /*
   * Persisted conformance receipts live in the vault sidecar, so both surfaces read them through
   * the same handle. Static/demo mode carries no sidecar and therefore never a record.
   */
  const recordsByProfile = useArchitectureRecords(
    mode === 'local' && localVault.status === 'loaded' ? localVault.handle : null,
    profiles.map((profile) => profile.slug),
    profileDocuments,
    localVault.fileHandles,
  );

  useEffect(() => {
    let cancelled = false;
    const handle = localVault.handle;
    const vaultRoot = handle ? getTauriVaultRootPath(handle) ?? null : null;
    if (mode !== 'local' || localVault.status !== 'loaded' || !handle || !vaultRoot) {
      return () => { cancelled = true; };
    }

    const store = createVaultFileProjectSourceStore(handle);
    void (async () => {
      const next: Record<string, ArchitectureHandoffContext> = {};
      const nextModules: Record<string, Record<string, RoleSourceModule[]>> = {};
      const bindingsByProject = new Map<string, string>();
      const projectSlugs = docs
        .filter((doc) => doc.frontmatter.kind === 'project')
        .map((doc) => doc.frontmatter.slug)
        .filter((slug): slug is string => typeof slug === 'string');
      for (const projectSlug of projectSlugs) {
        const result = await store.list(projectSlug);
        if (result.status === 'ok' && result.bindings.length === 1) {
          bindingsByProject.set(projectSlug, result.bindings[0]!.rootPath);
        }
      }
      const distinctSourceRoots = [...new Set(bindingsByProject.values())];
      const draftSourceRoot = distinctSourceRoots.length === 1 ? distinctSourceRoots[0]! : null;
      const cliEntry = await verifiedAtlasCliEntry([...distinctSourceRoots, vaultRoot]);
      /* The vault root is known even when no project source has been connected. Preserve that
         truth in every task packet; `sourceRoot: null` is the honest missing half. */
      const draftContext: ArchitectureHandoffContext = {
        sourceRoot: draftSourceRoot,
        vaultRoot,
        cliEntry,
      };
      for (const profile of profiles) {
        const projectSlug = projectSlugForProfile(profile, docs);
        const sourceRoot = projectSlug ? bindingsByProject.get(projectSlug) ?? null : null;
        next[profile.slug] = {
          sourceRoot,
          vaultRoot,
          cliEntry,
        };
        if (!sourceRoot) continue;
        /*
         * A read-only directory walk fills the blueprint's bands with the source modules each
         * role glob actually contains. Listing only — no file is opened, no import is read;
         * conformance stays with the MCP and CLI.
         */
        const listDir = async (relativePath: string): Promise<SourceDirEntry[] | null> => {
          try {
            const entries = await listTauriVaultEntries(sourceRoot, relativePath);
            return entries.map((entry) => ({
              name: entry.name,
              kind: entry.kind === 'directory' ? 'dir' : 'file',
            }));
          } catch {
            return null;
          }
        };
        nextModules[profile.slug] = await deriveRoleSourceModules(profile, listDir);
      }
      if (!cancelled) {
        setLoadedHandoffContexts({
          handle,
          profileKey,
          contexts: next,
          draftContext,
          modules: nextModules,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [docs, localVault.handle, localVault.status, mode, profileKey, profiles]);

  const reviewProfile = profiles.find((profile) => profile.slug === reviewScope.profileSlug) ?? profiles[0] ?? null;
  const reviewRole = reviewProfile?.roles.find((role) => role.id === reviewScope.roleId) ?? null;
  const analysisContext = useMemo<AnalysisCaptureContext>(() => ({
    mode: 'architecture', surface: 'architecture', handle: mode === 'local' ? localVault.handle : null,
    writable: mode === 'local' && localVault.status === 'loaded', fileHandles: localVault.fileHandles,
    scope: { projectSlug: reviewProfile ? projectSlugForProfile(reviewProfile, docs) : null, projectUid: reviewProfile?.projectUid ?? null, targetSlugs: [], profileSlug: reviewProfile?.slug ?? null },
    graph: analysisGraphFromInsight(insight), sourceFingerprint: null, profileHash: null,
    sourceRoot: reviewProfile ? handoffContexts[reviewProfile.slug]?.sourceRoot ?? null : draftHandoffContext?.sourceRoot ?? null,
    profileDocumentSlug: reviewProfile?.documentSlug ?? null,
    roleIds: new Set(reviewProfile?.roles.map((role) => role.id) ?? []), parentRunId: analysisParentRunId, parentRequestText: analysisParentRequestText,
  }), [mode, localVault.handle, localVault.status, localVault.fileHandles, reviewProfile, docs, insight, handoffContexts, draftHandoffContext, analysisParentRunId, analysisParentRequestText]);

  return (
    <VaultSourceHydrationBoundary>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <ArchitectureWorkbench
          profiles={profiles}
          profileProblems={profileProblems}
          handoffContexts={handoffContexts}
          draftHandoffContext={draftHandoffContext}
          sourceModulesByProfile={sourceModulesByProfile}
          sourceListingCapable={sourceListingCapable}
          sourceUnavailableReason={sourceUnavailableReason}
          /* The installed app must never offer its own download; the browser is the only
             runtime that can hand a person the app that lists their source folder. */
          offersInstalledApp={!desktopRuntime}
          recordsByProfile={recordsByProfile}
          conceptsByProfile={conceptsByProfile}
          agentRoute={agentRoute}
          agentLabel={acpRuntime?.label ?? null}
          onAgentRequest={agentRoute === 'agent' ? startAgent : undefined}
          contextDockOpen={agentOpen}
          onOpenReview={(profileSlug, roleId) => {
            setSectionRequest((current) => ({ tab: 'history', nonce: current.nonce + 1 }));
            setReviewScope({ profileSlug, roleId }); setAgentOpen(true);
          }}
          agentActivity={agentActivity}
        />
        <ArchitectureAgentDock
            open={agentOpen}
            runtime={acpRuntime}
            runtimes={acpRuntimes}
            onRuntimeChange={setAcpRuntimeId}
            vaultRoot={gitVaultPath}
            mcpServers={acpMcpServers}
            openingRequest={agentOpeningRequest}
            knownSlugs={knownSlugs}
            analysisContext={analysisContext}
            sectionRequest={sectionRequest}
            onOpeningRequestSent={(nonce) => setAgentOpeningRequest((current) => current?.nonce === nonce ? null : current)}
            contextLabel={reviewRole ? `${reviewProfile?.title} · ${reviewRole.id}` : reviewProfile?.title ?? tReview('wholeProject')}
            facts={<div className="space-y-3"><p>{tReview('architectureCriteria')}</p>{reviewRole ? <p>{reviewRole.summaries[locale] ?? reviewRole.summary ?? tReview('definitionMissing')}</p> : null}{reviewProfile?.documentSlug ? <Chip onClick={() => router.push(buildDocsVaultHref({ slug: reviewProfile.documentSlug! }))}>{tReview('openDefinition')}</Chip> : null}</div>}
            onAnalysisRequest={agentRoute === 'agent' ? (text, parentRunId) => {
              setAnalysisParentRunId(parentRunId);
              const inspection = analysisContext.sourceRoot && reviewProfile ? `\nInspect this exact connected source: inspect_architecture(${JSON.stringify({ rootPath: analysisContext.sourceRoot, profileSlug: reviewProfile.slug })}).` : '\nNo connected source is available. Report source-dependent conclusions as unknown; do not guess a repository.';
              const requestText = `${reviewProfile?.title ?? tReview('architectureTitle')}${reviewRole ? ` · ${reviewRole.id}` : ''}\n${text}${inspection}`;
              setAnalysisParentRequestText(parentRunId ? requestText : null);
              setAgentOpeningRequest({ kind: 'improve', text: requestText, nonce: ++requestSerial.current, profileSlug: reviewProfile?.slug ?? null, roleId: reviewRole?.id ?? null, scopeKey: JSON.stringify([gitVaultPath, reviewProfile?.slug ?? null]) });
            } : undefined}
            onEvidence={(slug) => router.push(buildDocsVaultHref({ slug }))}
            onTurnActivityChange={setAgentActivity}
            onClose={() => { setAgentOpen(false); setAgentOpeningRequest(null); setAnalysisParentRunId(null); setAnalysisParentRequestText(null); }}
        />
      </div>
    </VaultSourceHydrationBoundary>
  );
}
