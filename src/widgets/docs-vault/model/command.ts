/**
 * One global command for the unified palette's `> ` mode; `icon` is an emoji string or a React
 * element.
 */
export interface VaultCommand {
  id: string;
  label: string;
  /**
   * Other words a person types for this command, matched like the label but never shown, so renamed
   * commands still answer to their old names.
   */
  keywords?: string;
  hint?: string;
  icon: React.ReactNode;
  /** The shortcut to display — shown as a kbd at the row's right when present. */
  shortcut?: string;
  /** Listed only when true; false hides it. */
  visible?: boolean;
  /** The run callback. The palette closes automatically after calling onRun. */
  onRun: () => void | Promise<void>;
}
