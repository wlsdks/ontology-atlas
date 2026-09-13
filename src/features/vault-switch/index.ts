/**
 * Only what crosses the feature's boundary. The row model, the reachability type and the
 * probe hook are used exclusively by `RecentVaultList` inside this feature, so re-exporting
 * them here would publish an API with no caller - which the dead-code ratchet rejects by
 * name. `recentVaultRowKey` is out because two callers outside need to name the folder the
 * last session had open: the docs view's chooser, and the rail tile.
 */
export { RecentVaultList } from './ui/RecentVaultList';
export { VaultSwitchRailTile } from './ui/VaultSwitchRailTile';
export { recentVaultRowKey } from './lib/recent-vault-row';
