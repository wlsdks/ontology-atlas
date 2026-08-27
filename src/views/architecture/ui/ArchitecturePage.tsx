"use client";

import { useEffect, useMemo, useState } from 'react';

import {
  deriveArchitectureProfiles,
  type ArchitectureHandoffContext,
  type ArchitectureProfile,
} from '@/entities/architecture-profile';
import { useDataSourceMode } from '@/features/data-source-mode';
import { useLocalVault } from '@/features/docs-vault-local';
import { useStaticVaultSource } from '@/features/vault-sample-source';
import { createVaultFileProjectSourceStore } from '@/shared/lib/project-source-store';
import {
  getTauriVaultRootPath,
  listTauriVaultEntries,
  readTauriVaultText,
} from '@/shared/lib/tauri-vault-fs';
import {
  deriveRoleSourceModules,
  type RoleSourceModule,
  type SourceDirEntry,
} from '../model/source-modules';
import { useArchitectureRecords } from '../model/use-architecture-record';
import { ArchitectureWorkbench } from './ArchitectureWorkbench';

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
    <ArchitectureWorkbench
      profiles={profiles}
      handoffContexts={handoffContexts}
      sourceModulesByProfile={sourceModulesByProfile}
      sourceListingCapable={sourceListingCapable}
      recordsByProfile={recordsByProfile}
    />
  );
}
