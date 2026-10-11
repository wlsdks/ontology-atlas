/**
 * Identifies which data source is in play. Two modes:
 *
 * - **static** — the dogfood manifest baked by `pnpm build`; the fallback when no vault is
 *   selected.
 * - **local** — the user's own `.md` vault, read through the File System Access API.
 *
 * Pure: the mode follows from the vault-loaded flag alone. The UI layer consumes the composed
 * result through the `useDataSourceMode` hook.
 */

export type DataSourceMode = 'static' | 'local';

interface ModeInputs {
  /** `useLocalVault().status === 'loaded'` */
  vaultLoaded: boolean;
}

export function getDataSourceMode({ vaultLoaded }: ModeInputs): DataSourceMode {
  return vaultLoaded ? 'local' : 'static';
}

/**
 * Exposes the current mode on `window` so it can be read as `window.__ohMyOntologyMode` in
 * devtools. Runtime code must not read this value — depend on the hook result instead.
 */
export function publishDataSourceModeForDebug(mode: DataSourceMode): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __ohMyOntologyMode?: DataSourceMode }).__ohMyOntologyMode = mode;
}
