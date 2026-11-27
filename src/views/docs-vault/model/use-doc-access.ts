'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import { vaultImageUrl } from '@/shared/lib/library/vault-image-url';
import { readStrictUtf8Text } from '@/shared/lib/vault-folder/strict-utf8-text';
import { scheduleStateSync } from '../lib/persistence';

function readVaultFileText(handles: Pick<Map<string, { getFile(): Promise<File> }>, 'get'>) {
  return async (slug: string) => {
    const fh = handles.get(slug);
    if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
    const file = await fh.getFile();
    return file.text();
  };
}


export function useDocAccess({
  isLocalSourceLoaded,
  selectedSlug,
}: {
  isLocalSourceLoaded: boolean;
  selectedSlug: string | null;
}) {
  const localVault = useLocalVault();
  const [editing, setEditing] = useState(false);
  const getDocContent = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    if (localVault.fileHandles.size === 0) return undefined;
    return readVaultFileText(localVault.fileHandles);
  }, [localVault.fileHandles]);

  const resolveImage = useMemo<
    ((path: string) => Promise<string | null>) | undefined
  >(() => {
    const handles = localVault.imageHandles;
    return async (path: string) => {
      const fh = handles.get(path);
      if (!fh) return null;
      return vaultImageUrl(await fh.getFile());
    };
  }, [localVault.imageHandles]);

  const canEditCurrent = isLocalSourceLoaded;
  const editResolver = useMemo<
    ((slug: string) => Promise<string>) | undefined
  >(() => {
    if (!canEditCurrent) return undefined;
    // The editor saves the whole file, so it starts only from text that is the file's bytes.
    const handles = localVault.fileHandles;
    return async (slug: string) => {
      const fh = handles.get(slug);
      if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
      return readStrictUtf8Text(await fh.getFile(), `${slug}.md`);
    };
  }, [canEditCurrent, localVault.fileHandles]);
  useEffect(() => {
    if (!canEditCurrent) scheduleStateSync(() => setEditing(false));
  }, [canEditCurrent]);
  useEffect(() => {
    scheduleStateSync(() => setEditing(false));
  }, [selectedSlug]);
  return { getDocContent, resolveImage, canEditCurrent, editResolver, editing, setEditing };
}
