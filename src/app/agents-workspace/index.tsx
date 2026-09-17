'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { AgentsPage } from '@/views/agents';
import { McpPage } from '@/views/mcp';
import { useLocalVault } from '@/entities/vault-session';
import { useVaultConnectors } from '@/features/mcp-connectors';
import { useRouter } from '@/i18n/navigation';
import { selectOpenVaultHandle } from '@/shared/lib/select-open-vault-handle';
import { TabBar } from '@/shared/ui';

/**
 * **One Agents destination, two tabs** (owner, 2026-09-17: "merge these two, split them
 * as tabs inside").
 *
 * The rail had carried Agents and MCP side by side since 2026-09-05. They are one
 * subject for the person — the coding tools on this computer and what they reach — so
 * the second destination folds into the first as its second tab. Each tab is the same
 * view it was as a page (`AgentsPage`, `McpPage`), each still owning its own `<main>`
 * and display title; only the active one mounts, and no view imports the other. The
 * strip is the Library's: header-placed tabs on `?tab=`, no name in the strip, the rail
 * already names the place. MCP's own two sections keep their switch under `?mcp=`.
 *
 * `/mcp/` stays as a redirect into `?tab=mcp` so the deep link the installed app answers
 * (`ontology-atlas://mcp?install=…`) and every older link keep resolving.
 */

type AgentsTab = 'agents' | 'mcp';

export function AgentsWorkspace() {
  const t = useTranslations('agents');
  const params = useSearchParams();
  const router = useRouter();
  const vault = useLocalVault();
  const handle = selectOpenVaultHandle(vault.status, vault.handle);
  const connectors = useVaultConnectors(handle);
  const enabledConnectors = connectors.connectors.filter((connector) => connector.enabled).length;
  const tab: AgentsTab = params.get('tab') === 'mcp' ? 'mcp' : 'agents';

  const selectTab = useCallback((next: AgentsTab) => {
    if (next === tab) return;
    const query = new URLSearchParams(params.toString());
    if (next === 'agents') {
      query.delete('tab');
      query.delete('mcp');
    } else {
      query.set('tab', 'mcp');
    }
    const search = query.toString();
    router.push(`/agents/${search ? `?${search}` : ''}${window.location.hash}`, { scroll: false });
  }, [params, router, tab]);

  return (
    <div data-testid="agents-workspace" className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <header className="topology-ui-scale flex h-14 shrink-0 items-stretch border-b border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-0">
        <TabBar
          ariaLabel={t('workspace.aria')}
          activeKey={tab}
          onSelect={(next) => selectTab(next as AgentsTab)}
          idPrefix="agents-workspace"
          testId="agents-workspace-tabs"
          placement="header"
          items={[
            { key: 'agents', label: t('workspace.agents'), testId: 'agents-workspace-agents' },
            {
              key: 'mcp',
              label: t('workspace.mcp'),
              count: handle && enabledConnectors > 0 ? enabledConnectors : undefined,
              countTitle: t('workspace.mcpCount'),
              testId: 'agents-workspace-mcp',
            },
          ]}
        />
      </header>
      <div
        id={'agents-workspace-tabpanel-' + tab}
        role="tabpanel"
        aria-labelledby={'agents-workspace-tab-' + tab}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {tab === 'mcp' ? <McpPage /> : <AgentsPage />}
      </div>
    </div>
  );
}
