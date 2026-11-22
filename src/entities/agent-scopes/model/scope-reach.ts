/**
 * Who a scope's settings reach, as the four cells of one diagram: you or other people, in this
 * repository or in your other projects. The vendor documents each scope's reach; nothing is read.
 */

/** Every scope the popup explains; Codex calls its machine-wide skills folder Admin. */
export type ReachScope = 'managed' | 'system' | 'admin' | 'user' | 'project' | 'local';

export interface ScopeReach {
  meHere: boolean;
  othersHere: boolean;
  meElsewhere: boolean;
  othersElsewhere: boolean;
}

const EVERYONE: ScopeReach = { meHere: true, othersHere: true, meElsewhere: true, othersElsewhere: true };

export const SCOPE_REACH: Readonly<Record<ReachScope, ScopeReach>> = Object.freeze({
  managed: EVERYONE,
  system: EVERYONE,
  admin: EVERYONE,
  user: { meHere: true, othersHere: false, meElsewhere: true, othersElsewhere: false },
  project: { meHere: true, othersHere: true, meElsewhere: false, othersElsewhere: false },
  local: { meHere: true, othersHere: false, meElsewhere: false, othersElsewhere: false },
});

/** The names Claude Code and Codex print for each scope; product terms, not translated. */
export const SCOPE_NAMES: Readonly<Record<ReachScope, string>> = Object.freeze({
  managed: 'Managed',
  system: 'System',
  admin: 'Admin',
  user: 'User',
  project: 'Project',
  local: 'Local',
});
