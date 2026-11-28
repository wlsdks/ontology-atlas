export { AppSettingsMenu } from './ui/AppSettingsMenu';

/**
 * The Agents destination reuses this pane as is; its `SettingsGroup`/`SettingsRow` parts
 * fill their parent, so it must not carry the sheet's dimensions with it.
 */
export { AcpRuntimeSettings } from './ui/agent-setup/AcpRuntimeSettings';

export { ModelConnections } from './ui/ModelConnectionsPanel';

export { AgentSetupSection } from './ui/agent-setup/AgentSetupSection';

/** A group's heading row, for a group whose body draws its own frame (the MCP tab's connectors card). */
export { SettingsGroupHeading } from './ui/settings-primitives';
