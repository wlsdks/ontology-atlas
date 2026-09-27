import type { RoundPassEntry, RoundRecord, RoundState } from '@/entities/library-round';

export type RoundsStoreStatus = 'no-vault' | 'loading' | 'ok' | 'missing' | 'malformed' | 'unavailable';

export interface RoundsRunnerValue {
  /** Native folder only. `no-vault` in the browser and before a folder is open. */
  storeStatus: RoundsStoreStatus;
  state: RoundState | null;
  rounds: RoundRecord[];
  ledger: RoundPassEntry[];
  running: { roundId: string; roundName: string; startedAt: string; phase: 'checking' | 'agent' } | null;
  /** A guarded coding agent is ready to take a turn; without it a redraft or a service pass cannot run. */
  agentReady: boolean;
  agentLabel: string | null;
  /** `enabled` is whether it would attach on this Mac, so the sheet offers only what a pass can reach. */
  connectors: { id: string; name: string; enabled: boolean }[];
  lastTickAt: string | null;
  /** Bumps on every ledger or state write, so a screen can re-read without a folder watcher. */
  revision: number;
  /** None of these runs here, by the clock or by "Run now", whatever the folder's switch says. */
  notAllowedHere: ReadonlySet<string>;
  changedSinceAllowed: ReadonlySet<string>;
  allow(id: string): boolean;
  /** `startedNow` is false when another pass is running, so the screen must not promise an immediate pass. */
  save(round: RoundRecord): Promise<{ ok: boolean; startedNow: boolean }>;
  remove(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  runNow(id: string): void;
  refresh(): Promise<void>;
}
