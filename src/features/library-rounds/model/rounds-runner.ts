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
  /** Names of connectors switched on for this folder, so the sheet can offer them. */
  connectors: { id: string; name: string; enabled: boolean }[];
  lastTickAt: string | null;
  /** Bumps on every ledger or state write, so a screen can re-read without a folder watcher. */
  revision: number;
  /**
   * `startedNow` is the promise the sheet made coming true: a consistency round saved while
   * nothing else is running takes its first pass immediately. A pass already in flight means
   * this one waits for its own due time, and the screen has to say so rather than repeat the
   * promise — one runner runs one pass at a time (`runPass` refuses a second).
   */
  save(round: RoundRecord): Promise<{ ok: boolean; startedNow: boolean }>;
  remove(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  runNow(id: string): void;
  refresh(): Promise<void>;
}
