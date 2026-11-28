import { useMemo } from 'react';

import { firstSearchText } from '@/shared/lib/navigation/search-text';
import { useCommittedSearch } from '@/shared/lib/navigation/use-committed-address';
import { connectorSecretRef } from '@/shared/lib/connectors/tauri-connector-secrets';
import { parseMcpInstallLink } from '@/shared/lib/connectors/mcp-install-link';

import { prefillFromRecord, type CustomPrefill } from './connector-draft';
import { installLinkNotice, type InstallLinkNotice } from './install-link-notice';

/**
 * `?install=<base64 json>` is the "Add to …" shape Cursor and VS Code publish; `parseMcpInstallLink` refuses any unknown field because a confirmation showing less than the truth is the CVE this surface avoids. The link only opens the dialog: nothing is written and the switch stays off.
 * Read from the screen on show, not in an effect: an effect would paint the dialog closed first. The installed app's `ontology-atlas://mcp?install=` arrives via `src-tauri/src/app_shell/deep_link.rs`.
 */
export function useInstallLinkArrival(): {
  incoming: CustomPrefill | null;
  linkNotice: InstallLinkNotice | null;
} {
  const installParam = firstSearchText(useCommittedSearch().install) ?? null;
  const arrival = useMemo(() => {
    if (!installParam) return null;
    return parseMcpInstallLink(`?config=${encodeURIComponent(installParam)}`, {
      id: 'draft',
      secretRef: connectorSecretRef,
    });
  }, [installParam]);
  const incoming = useMemo(
    () => (arrival?.ok && arrival.draft ? prefillFromRecord(arrival.draft) : null),
    [arrival],
  );
  return { incoming, linkNotice: installLinkNotice(arrival) };
}
