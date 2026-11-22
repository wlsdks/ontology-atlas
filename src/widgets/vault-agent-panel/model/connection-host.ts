import { hostOfBaseUrl, type LocalEndpointSettings } from '@/shared/lib/llm-connection/local-endpoint';
import {
  LOCAL_PROVIDER,
  SECRET_PROVIDER_HOSTS,
  type ConnectionProvider,
} from '@/shared/lib/llm-connection/tauri-secrets';

/**
 * Where this conversation actually goes: the official host for a named vendor, the typed address's
 * host for the address path, in the same form as the audit row, so screen and record agree.
 */
export function connectionHost(
  provider: ConnectionProvider | null,
  localEndpoint: LocalEndpointSettings | null,
): string {
  if (provider === LOCAL_PROVIDER) return hostOfBaseUrl(localEndpoint?.baseUrl ?? '');
  return provider ? SECRET_PROVIDER_HOSTS[provider] : '';
}
