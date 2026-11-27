/**
 * Which data source is in play: `local` (the user's own `.md` folder is open) or `no-folder` (the
 * app has not opened one: first run, a folder being restored, or a destination that opens without
 * one). Pure: the mode follows from the folder-loaded flag alone.
 */

export type DataSourceMode = 'no-folder' | 'local';

interface ModeInputs {
  vaultLoaded: boolean;
}

export function getDataSourceMode({ vaultLoaded }: ModeInputs): DataSourceMode {
  return vaultLoaded ? 'local' : 'no-folder';
}

/**
 * Exposes the current mode on `window` so it can be read as `window.__ohMyOntologyMode` in
 * devtools. Runtime code must not read this value — depend on the hook result instead.
 */
export function publishDataSourceModeForDebug(mode: DataSourceMode): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __ohMyOntologyMode?: DataSourceMode }).__ohMyOntologyMode = mode;
}
