'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocalVault } from '@/entities/vault-session';
import { CodedFailure } from '@/shared/lib/failures/failure-code';
import { vaultImageUrl } from '@/shared/lib/library/open-vault-file';
import { scheduleStateSync, type DocsVaultSource as Source } from '../lib/persistence';

type VaultFileHandles = Pick<Map<string, { getFile(): Promise<File> }>, 'get'>;

function readVaultFileText(handles: VaultFileHandles) {
  return async (slug: string) => {
    const fh = handles.get(slug);
    if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
    const file = await fh.getFile();
    return file.text();
  };
}

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/**
 * The text the editor starts from. A document that is not UTF-8 reads with replacement characters,
 * and saving them would overwrite the bytes it could not decode, so it is refused, as Planning does.
 */
export function readEditableVaultFileText(handles: VaultFileHandles) {
  return async (slug: string) => {
    const fh = handles.get(slug);
    if (!fh) throw new Error(`Local vault: no file handle for "${slug}"`);
    const bytes = await (await fh.getFile()).arrayBuffer();
    try {
      return strictUtf8.decode(bytes);
    } catch {
      throw new CodedFailure('not-utf8', `"${slug}" is not UTF-8`);
    }
  };
}

export function useDocAccess({
  source,
  isLocalSourceLoaded,
  selectedSlug,
}: {
  source: Source;
  isLocalSourceLoaded: boolean;
  selectedSlug: string | null;
}) {
  const localVault = useLocalVault();
  const [editing, setEditing] = useState(false);
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
    return readEditableVaultFileText(localVault.fileHandles);
  }, [canEditCurrent, localVault.fileHandles]);
  useEffect(() => {
    if (!canEditCurrent) scheduleStateSync(() => setEditing(false));
  }, [canEditCurrent]);
  useEffect(() => {
    scheduleStateSync(() => setEditing(false));
  }, [selectedSlug]);
  return { getDocContent, resolveImage, canEditCurrent, editResolver, editing, setEditing };
}
