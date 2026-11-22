import {
  ownsSecretRef,
  type ConnectorRecord,
  type ConnectorValueEntry,
} from '@/shared/lib/connectors/connector-record';
import { connectorSecretDelete } from '@/shared/lib/connectors/tauri-connector-secrets';

export function ownRefs(connectorId: string, entries: readonly ConnectorValueEntry[]): string[] {
  return entries
    .filter((entry) => ownsSecretRef(connectorId, entry))
    .map((entry) => entry.secretRef!);
}

/** The variable names whose keychain token this connector owns, for the removal warning. */
export function ownedSecretNames(connector: ConnectorRecord): string[] {
  return [...connector.env, ...connector.headers]
    .filter((entry) => ownsSecretRef(connector.id, entry))
    .map((entry) => entry.name);
}

/**
 * Forgets the keychain tokens a connector's variables pointed at, or an orphaned token stays on the machine. Best effort and before the file is written: a refusing keychain must not stop the removal, and the file never claims a reference the keychain still answers to.
 * Only its own entries: a shared row naming another connector's reference must not delete that token.
 */
export async function forgetSecrets(connectorId: string, entries: readonly ConnectorValueEntry[]): Promise<void> {
  await Promise.all(
    ownRefs(connectorId, entries).map((reference) => connectorSecretDelete(reference).catch(() => null)),
  );
}
