import type { ConnectorRecord } from '@/shared/lib/connectors/connector-record';

/** `command arg arg` or the URL: what will actually run, in one line. */
export function whatRuns(connector: ConnectorRecord): string {
  if (connector.transport === 'http') return (connector.url ?? '').trim();
  return [connector.command ?? '', ...connector.args].join(' ').trim();
}

export function connectorDestination(connector: ConnectorRecord): string {
  if (connector.transport !== 'http') return whatRuns(connector);
  try {
    return new URL(connector.url ?? '').host;
  } catch {
    return (connector.url ?? '').trim();
  }
}

/**
 * The variable names a waiting connector would pass when allowed, each as the person should read
 * it: a keychain reference by label only, a literal as `name=value`, a bare name as itself.
 */
export function connectorPasses(
  connector: ConnectorRecord,
  keychainLabel: (name: string) => string,
): string[] {
  return [...connector.env, ...connector.headers].map((entry) =>
    typeof entry.secretRef === 'string'
      ? keychainLabel(entry.name)
      : typeof entry.value === 'string'
        ? `${entry.name}=${entry.value}`
        : entry.name,
  );
}
