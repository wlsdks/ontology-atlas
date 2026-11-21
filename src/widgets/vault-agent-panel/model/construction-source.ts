import type { LocalEndpointSettings } from '@/shared/lib/llm-connection/local-endpoint';
import type { ConstructionSourcePreview } from '@/shared/lib/llm-connection/tauri-local-construction';
import { LOCAL_PROVIDER, type ConnectionProvider } from '@/shared/lib/llm-connection/tauri-secrets';

import { isLocalConstructionEndpoint } from './use-vault-agent';

export interface ConstructionSourceSelection {
  nonce: number;
  status: 'preparing' | 'preview' | 'localRequired' | 'sourceChanged';
  preview?: ConstructionSourcePreview;
}

/** Everything a pending source choice depends on; when it changes, the choice is void. */
export function constructionResourceKey({
  vaultPath,
  provider,
  localEndpoint,
  open,
}: {
  vaultPath: string | null;
  provider: ConnectionProvider | null;
  localEndpoint: LocalEndpointSettings | null;
  open: boolean;
}): string {
  return JSON.stringify([vaultPath, provider, localEndpoint?.model, localEndpoint?.baseUrl, open]);
}

export function canChooseConstructionSource({
  bridgeAvailable,
  running,
  applying,
}: {
  bridgeAvailable: boolean;
  running: boolean;
  applying: boolean;
}): boolean {
  return bridgeAvailable && !running && !applying;
}

/** Reading source files for construction is local-only: a model on this computer's own address. */
export function canConstructLocally(
  provider: ConnectionProvider | null,
  localEndpoint: LocalEndpointSettings | null,
): boolean {
  return (
    provider === LOCAL_PROVIDER &&
    Boolean(localEndpoint?.model) &&
    isLocalConstructionEndpoint(localEndpoint?.baseUrl ?? '')
  );
}

/** The preview the bridge returned is the one asked for: same source, same destination folder. */
export function previewMatchesRequest(
  preview: Pick<ConstructionSourcePreview, 'sourcePath' | 'destinationPath'>,
  sourcePath: string,
  vaultPath: string,
): boolean {
  return preview.destinationPath === vaultPath && preview.sourcePath === sourcePath;
}

/** The preview a person may run: shown, with at least one file, and no agent turn in flight. */
export function runnablePreview(
  selection: ConstructionSourceSelection | null,
  running: boolean,
): ConstructionSourcePreview | null {
  if (selection?.status !== 'preview' || !selection.preview?.files.length || running) return null;
  return selection.preview;
}
