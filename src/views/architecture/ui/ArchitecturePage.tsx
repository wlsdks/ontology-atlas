"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  deriveArchitectureProfiles,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import { useDataSourceMode, VaultSourceHydrationBoundary } from '@/entities/vault-session';
import { useLocalVault } from '@/entities/vault-session';
import { useStaticVaultSource } from '@/entities/vault-session';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
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
import { ArchitectureWorkbench } from './ArchitectureWorkbench';

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

async function verifiedAtlasCliEntry(sourceRoot: string): Promise<string | null> {
  if (!sourceRoot.startsWith('/')) return null;
  try {
    const packageText = await readTauriVaultText(sourceRoot, 'cli/package.json');
    const packageJson = packageText ? JSON.parse(packageText) as { name?: unknown } : null;
    if (packageJson?.name !== 'ontology-atlas') return null;
    const entries = await listTauriVaultEntries(sourceRoot, 'cli/src');
    if (!entries.some((entry) => entry.kind === 'file' && entry.name === 'index.mjs')) return null;
    return `${sourceRoot.replace(/\/+$/, '')}/cli/src/index.mjs`;
  } catch {
    return null;
  }
}

export function ArchitecturePage() {
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();
  const docs = useMemo(
    () => mode === 'static' ? staticManifest.docs : localVault.manifest?.docs ?? EMPTY_DOCS,
    [localVault.manifest, mode, staticManifest.docs],
  );
  const profiles = useMemo(() => deriveArchitectureProfiles(docs), [docs]);
  /* The click-open meaning layer: reviewed concepts joined into roles, real on every surface. */
  const conceptsByProfile = useMemo(() => {
    const out: Record<string, Record<string, RoleConcept[]>> = {};
    for (const profile of profiles) out[profile.slug] = deriveRoleConcepts(profile, docs);
    return out;
  }, [docs, profiles]);
  const profileKey = profiles.map((profile) => profile.slug).join('\0');
  const [loadedHandoffContexts, setLoadedHandoffContexts] = useState<{
    handle: FileSystemDirectoryHandle | null;
    profileKey: string;
    contexts: Record<string, ArchitectureHandoffContext>;
    modules: Record<string, Record<string, RoleSourceModule[]>>;
  }>({ handle: null, profileKey: '', contexts: EMPTY_HANDOFF_CONTEXTS, modules: {} });
  const loaded = mode === 'local'
    && loadedHandoffContexts.handle === localVault.handle
    && loadedHandoffContexts.profileKey === profileKey;
  const handoffContexts = loaded ? loadedHandoffContexts.contexts : EMPTY_HANDOFF_CONTEXTS;
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
      for (const profile of profiles) {
        const projectSlug = projectSlugForProfile(profile, docs);
        if (!projectSlug) continue;
        const result = await store.list(projectSlug);
        if (result.status !== 'ok' || result.bindings.length !== 1) continue;
        const sourceRoot = result.bindings[0]!.rootPath;
        next[profile.slug] = {
          sourceRoot,
          vaultRoot,
          cliEntry: await verifiedAtlasCliEntry(sourceRoot),
        };
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
        setLoadedHandoffContexts({ handle, profileKey, contexts: next, modules: nextModules });
      }
    })();

    return () => { cancelled = true; };
  }, [docs, localVault.handle, localVault.status, mode, profileKey, profiles]);

  return (
    <VaultSourceHydrationBoundary>
      <ArchitectureWorkbench
        profiles={profiles}
        handoffContexts={handoffContexts}
        sourceModulesByProfile={sourceModulesByProfile}
        sourceListingCapable={sourceListingCapable}
        sourceUnavailableReason={sourceUnavailableReason}
        recordsByProfile={recordsByProfile}
        conceptsByProfile={conceptsByProfile}
      />
    </VaultSourceHydrationBoundary>
  );
}
