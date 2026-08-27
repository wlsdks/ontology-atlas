"use client";

import { useEffect, useMemo, useState } from 'react';

import {
  deriveArchitectureProfiles,
  deriveRoleOccupants,
  type ArchitectureHandoffContext,
  type ArchitectureOccupant,
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
  const occupantsByProfile = useMemo(() => {
    const out: Record<string, Record<string, ArchitectureOccupant[]>> = {};
    for (const profile of profiles) out[profile.slug] = deriveRoleOccupants(profile, docs);
    return out;
  }, [docs, profiles]);
  const profileKey = profiles.map((profile) => profile.slug).join('\0');
  const [loadedHandoffContexts, setLoadedHandoffContexts] = useState<{
    handle: FileSystemDirectoryHandle | null;
    profileKey: string;
    contexts: Record<string, ArchitectureHandoffContext>;
  }>({ handle: null, profileKey: '', contexts: EMPTY_HANDOFF_CONTEXTS });
  const handoffContexts = mode === 'local'
    && loadedHandoffContexts.handle === localVault.handle
    && loadedHandoffContexts.profileKey === profileKey
    ? loadedHandoffContexts.contexts
    : EMPTY_HANDOFF_CONTEXTS;

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
      }
      if (!cancelled) setLoadedHandoffContexts({ handle, profileKey, contexts: next });
    })();

    return () => { cancelled = true; };
  }, [docs, localVault.handle, localVault.status, mode, profileKey, profiles]);

  return (
    <ArchitectureWorkbench
      profiles={profiles}
      handoffContexts={handoffContexts}
      occupantsByProfile={occupantsByProfile}
    />
  );
}
