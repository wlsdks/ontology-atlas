/**
 * One global command in the source vault. The unified palette
 * (DocsVaultUnifiedPalette) takes this array and runs fuzzy matching over it in
 * `> ` prefix mode.
 *
 * `icon` accepts either a string (emoji) or a React element — the palette UI only
 * renders it.
 */
export interface VaultCommand {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  /** The shortcut to display — shown as a kbd at the row's right when present. */
  shortcut?: string;
  /** Listed only when true; false hides it. */
  visible?: boolean;
  /** The run callback. The palette closes automatically after calling onRun. */
  onRun: () => void | Promise<void>;
}
