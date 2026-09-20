import type { RoundPassEntry, RoundRecord, RoundState } from '@/entities/library-round';

export type RoundsStoreStatus = 'no-vault' | 'loading' | 'ok' | 'missing' | 'malformed' | 'unavailable';

export interface RoundsRunnerValue {
  storeStatus: RoundsStoreStatus;
  state: RoundState | null;
  rounds: RoundRecord[];
  ledger: RoundPassEntry[];
  running: { roundId: string; roundName: string; startedAt: string; phase: 'checking' | 'agent' } | null;
  agentReady: boolean;
  agentLabel: string | null;
  connectors: { id: string; name: string; enabled: boolean }[];
  lastTickAt: string | null;
  revision: number;
  save(round: RoundRecord): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  setEnabled(id: string, enabled: boolean): Promise<boolean>;
  runNow(id: string): void;
  refresh(): Promise<void>;
}
