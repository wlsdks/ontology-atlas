'use client';

import { useEffect, useMemo, useState } from 'react';
import type { useLocalVault } from '@/entities/vault-session';
import { vaultImageUrl } from '@/shared/lib/open-vault-file';
import { scheduleStateSync, type DocsVaultSource as Source } from '../lib/persistence';

type LocalVault = ReturnType<typeof useLocalVault>;

function readVaultFileText(handles: Pick<Map<string, { getFile(): Promise<File> }>, 'get'>) {
  return async (slug: string) => {
    const fh = handles.get(slug);
    if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
    const file = await fh.getFile();
    return file.text();
  };
}

export function useDocAccess({
  source,
  localVault,
  isLocalSourceLoaded,
  selectedSlug,
}: {
  source: Source;
  localVault: LocalVault;
  isLocalSourceLoaded: boolean;
  selectedSlug: string | null;
}) {
  const [editing, setEditing] = useState(false);
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
  return { getDocContent, resolveImage, canEditCurrent, editResolver, editing, setEditing };
}
