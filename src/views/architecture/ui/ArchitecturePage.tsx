"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { buildDocsVaultHref } from '@/entities/docs-vault';
import { Chip, RouteLoadingFallback } from '@/shared/ui';
import { useHydrated } from '@/shared/lib/render-timing/use-hydrated';
import { useOntologyInsight } from '@/features/vault-ontology';

import {
  deriveArchitectureProfilesReport,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import { useAgentServer, useDataSourceMode, useLocalVault, useOpenFolderManifest } from '@/entities/vault-session';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source/project-source-store';
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
import { bridgePort } from '@/features/harness-report';
import { detectAcpRuntimes, isAcpBridgeAvailable } from '@/shared/lib/agent-chat/tauri-acp';
import { useRememberedTool } from '@/widgets/acp-chat-panel';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { deriveRoleConcepts, type RoleConcept } from '../model/role-concepts';
import {
  deriveRoleSourceModules,
  type RoleSourceModule,
  type SourceDirEntry,
} from '../model/source-modules';
import { useArchitectureRecords } from '../model/use-architecture-record';
import type { DraftPreviewSource } from '../model/draft-preview';
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

const subscribeDesktopRuntime = () => () => undefined;
const readServerDesktopRuntime = () => false;

type VaultDoc = { slug: string; frontmatter: Record<string, unknown> };
const EMPTY_HANDOFF_CONTEXTS: Record<string, ArchitectureHandoffContext> = {};

function projectSlugForProfile(profile: ArchitectureProfile, docs: ReadonlyArray<VaultDoc>) {
  const project = docs.find((doc) => (
    doc.frontmatter.kind === 'project' && doc.frontmatter.uid === profile.projectUid
  ));
  return typeof project?.frontmatter.slug === 'string' ? project.frontmatter.slug : null;
}

/** `embedded`: the Harness shell owns the eyebrow, `h1` and explainer, so the blueprint drops its own. */
export function ArchitecturePage({
  embedded = false,
  draftSource = null,
  harnessPanelId,
  harnessPanelLabelledBy,
}: {
  embedded?: boolean;
  draftSource?: DraftPreviewSource | null;
  harnessPanelId?: string;
  harnessPanelLabelledBy?: string;
} = {}) {
  const tReview = useTranslations('analysisWorkbench');
  const locale = useLocale();
  const router = useRouter();
  const mode = useDataSourceMode();
  const hydrated = useHydrated();
  const localVault = useLocalVault();
  const { insight } = useOntologyInsight();
  const agentServer = useAgentServer();
  const acpBridgeAvailable = useSyncExternalStore(
    subscribeDesktopRuntime,
    isAcpBridgeAvailable,
    readServerDesktopRuntime,
  );
  const docs = useOpenFolderManifest().docs;
  /* The report, not the list: an unreadable document is named instead of failing every profile. */
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

  const chooseAcpRuntime = useRememberedTool({
    vaultRoot: gitVaultPath,
    runtimes: acpRuntimes,
    runtimeId: acpRuntimeId,
    setRuntimeId: setAcpRuntimeId,
  });
  const acpRuntime = acpRuntimes.find((runtime) => runtime.id === acpRuntimeId) ?? null;
  const vaultConnectors = useVaultConnectors(localVault.handle);
  const acpMcpServers = useMemo(() => {
    const registration =
      vaultSelfReadSlot(acpRuntimeId) === 'codex-config'
        ? {
            command: localVault.agentConfigStatus?.codexRegisteredCommand ?? null,
            validForCurrentVault: localVault.agentConfigStatus?.codexConfigValid === true,
          }
        : null;
    // The vault server first, then enabled connectors: handshake order, so a same-named entry cannot replace ours.
    return [
      ...vaultMcpServers(agentServer.launch, gitVaultPath, registration, {
        ownsWriteGate: runtimeOwnsWriteGate(acpRuntimeId),
      }),
      ...connectorAcpServers(vaultConnectors.connectors, acpRuntimeId, vaultConnectors.allowedHere),
    ];
  }, [
    acpRuntimeId,
    agentServer.launch,
    gitVaultPath,
    localVault.agentConfigStatus?.codexConfigValid,
    localVault.agentConfigStatus?.codexRegisteredCommand,
    vaultConnectors.allowedHere,
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
  const sourceListingCapable =
    mode === 'local' && !!localVault.handle && getTauriVaultRootPath(localVault.handle) != null;
  const { records: recordsByProfile, loaded: recordsLoaded } = useArchitectureRecords(
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
      /* `sourceRoot: null` is the honest missing half when no project source is connected. */
      const draftContext: ArchitectureHandoffContext = {
        sourceRoot: draftSourceRoot,
        vaultRoot,
      };
      for (const profile of profiles) {
        const projectSlug = projectSlugForProfile(profile, docs);
        const sourceRoot = projectSlug ? bindingsByProject.get(projectSlug) ?? null : null;
        next[profile.slug] = {
          sourceRoot,
          vaultRoot,
        };
        if (!sourceRoot || !projectSlug) continue;
        const port = bridgePort({ vaultRoot, projectSlug });
        const listDir = async (relativePath: string): Promise<SourceDirEntry[] | null> =>
          (await port.listDir(relativePath))?.map((entry) => ({
            name: entry.name,
            kind: entry.kind === 'directory' ? 'dir' : 'file',
          })) ?? null;
        const modules = await deriveRoleSourceModules(profile, listDir);
        if (modules) nextModules[profile.slug] = modules;
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

  if (!hydrated) return <RouteLoadingFallback />;

  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-hidden"
      role={harnessPanelId ? 'tabpanel' : undefined}
      id={harnessPanelId}
      aria-labelledby={harnessPanelLabelledBy}
      tabIndex={harnessPanelId ? -1 : undefined}
    >
      <ArchitectureWorkbench
        embedded={embedded}
        profiles={profiles}
        profileProblems={profileProblems}
        handoffContexts={handoffContexts}
        draftHandoffContext={draftHandoffContext}
        draftSource={draftSource}
        sourceModulesByProfile={sourceModulesByProfile}
        sourceListingCapable={sourceListingCapable}
        recordsByProfile={recordsByProfile}
        recordsLoaded={recordsLoaded}
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
          onRuntimeChange={chooseAcpRuntime}
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
  );
}
