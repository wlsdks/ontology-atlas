'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { LocalEndpointSettings } from '@/shared/lib/llm-connection/local-endpoint';
import { previewConstructionSource } from '@/shared/lib/llm-connection/tauri-local-construction';
import type { ConnectionProvider } from '@/shared/lib/llm-connection/tauri-secrets';
import { useHeldValue } from '@/shared/lib/render-timing/use-presence';
import { pickTauriSourceDirectory } from '@/shared/lib/vault-folder/native-vault/tauri-project-source';

import {
  canChooseConstructionSource,
  canConstructLocally,
  constructionResourceKey,
  previewMatchesRequest,
  runnablePreview,
  type ConstructionSourceSelection,
} from './construction-source';
import type { useVaultAgent } from './use-vault-agent';

type VaultAgent = ReturnType<typeof useVaultAgent>;

/**
 * Choosing a folder of source code to build the ontology from: pick, preview, then run. A choice that
 * outlives the vault, connection or panel state it was made under is dropped, and a slower answer
 * from an older choice never lands.
 */
export function useConstructionSource({
  open,
  bridgeAvailable,
  vaultPath,
  provider,
  localEndpoint,
  agent,
  draft,
  onRun,
}: {
  open: boolean;
  bridgeAvailable: boolean;
  vaultPath: string | null;
  provider: ConnectionProvider | null;
  localEndpoint: LocalEndpointSettings | null;
  agent: Pick<VaultAgent, 'running' | 'proposal' | 'stop' | 'sendConstruction'>;
  draft: string;
  onRun: () => void;
}) {
  const t = useTranslations('vaultAgentPanel');
  const [selection, setSelection] = useState<ConstructionSourceSelection | null>(null);
  const selectionNonce = useRef(0);
  const heldSelection = useHeldValue(selection, selection ? `${selection.nonce}:${selection.status}` : null);

  const resourceKey = constructionResourceKey({ vaultPath, provider, localEndpoint, open });
  const resourceKeyRef = useRef(resourceKey);
  useLayoutEffect(() => { resourceKeyRef.current = resourceKey; }, [resourceKey]);
  useEffect(() => () => { selectionNonce.current += 1; setSelection(null); }, [resourceKey]);

  const cancel = () => { selectionNonce.current += 1; setSelection(null); };
  const choose = async () => {
    if (!vaultPath || !canChooseConstructionSource({ bridgeAvailable, running: agent.running, applying: agent.proposal?.status === 'applying' })) return;
    agent.stop();
    const nonce = ++selectionNonce.current;
    const resource = resourceKey;
    if (!canConstructLocally(provider, localEndpoint)) {
      setSelection({ nonce, status: 'localRequired' });
      return;
    }
    setSelection({ nonce, status: 'preparing' });
    const active = () => selectionNonce.current === nonce && resourceKeyRef.current === resource;
    try {
      const sourcePath = await pickTauriSourceDirectory(t('construction.pickerTitle'));
      if (!active()) return;
      if (!sourcePath) { setSelection(null); return; }
      const preview = await previewConstructionSource(sourcePath, vaultPath);
      if (!active()) return;
      if (!previewMatchesRequest(preview, sourcePath, vaultPath)) throw new Error('source_changed');
      setSelection({ nonce, status: 'preview', preview });
    } catch {
      if (active()) setSelection({ nonce, status: 'sourceChanged' });
    }
  };
  const run = () => {
    const preview = runnablePreview(selection, agent.running);
    if (!preview) return;
    cancel();
    onRun();
    void agent.sendConstruction(preview, draft.trim() || t('construction.action'));
  };

  return { selection, heldSelection, choose, cancel, run };
}
