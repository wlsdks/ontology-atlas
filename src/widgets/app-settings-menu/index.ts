export { AppSettingsMenu } from './ui/AppSettingsMenu';

/**
 * The 「Agents」 (agents) destination reuses this pane as is (2026-08-20, ledger 90).
 *
 * ⚠️ **A part that leaves the sheet must not take the sheet's dimensions with
 * it.** This pane stands on `SettingsGroup`/`SettingsRow`, and neither decides its
 * own width (they fill what the parent gives), so it stands correctly under the
 * destination's `PAGE_FRAME` too.
 */
export { AcpRuntimeSettings } from './ui/AcpRuntimeSettings';

/** The 「MCP Connection」 (MCP connection) pane — shared by the destination and the settings sheet, for the reason above. */
export { AgentSetupSection } from './ui/AgentSetupSection';

/** A group's heading row, for a group whose body draws its own frame (the MCP tab's connectors card). */
export { SettingsGroupHeading } from './ui/settings-primitives';
