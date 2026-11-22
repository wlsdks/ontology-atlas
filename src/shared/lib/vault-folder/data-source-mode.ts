/**
 * Which data source is in play: `static` (the dogfood manifest baked by `pnpm build`, the fallback
 * with no vault selected) or `local` (the user's own `.md` vault via the File System Access API).
 * Pure: the mode follows from the vault-loaded flag alone.
 */

export type DataSourceMode = 'static' | 'local';

interface ModeInputs {
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
