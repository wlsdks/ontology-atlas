import type { AcpRuntimeStatus } from '@/shared/lib/tauri-acp';
import { isGuardedRuntime } from '@/features/acp-session';

import type { InsightsTab } from './insights-tab-state';

export interface InsightsAgentRuntime {
  id: string;
  label: string;
}

export interface InsightsAgentPrefill {
  kind: InsightsTab;
  text: string;
  nonce: number;
}

export type InsightsAgentRoute = 'checking' | 'agent' | 'clipboard';

export type InsightsAgentPromptPlan =
  | { action: 'open-current'; request: InsightsAgentPrefill }
  | { action: 'seat'; request: InsightsAgentPrefill }
  | { action: 'confirm-replace'; request: InsightsAgentPrefill };

/** Only verified, ready runtimes with an app-owned permission boundary may open chat. */
export function selectInsightsAgentRuntimes(
  runtimes: readonly AcpRuntimeStatus[] | null | undefined,
): InsightsAgentRuntime[] {
  return (runtimes ?? [])
    .filter((runtime) => (
      runtime.state === 'ready'
      && runtime.verified
      && isGuardedRuntime(runtime.id, runtime.isolated)
    ))
    .map(({ id, label }) => ({ id, label }));
}

export function resolveInsightsAgentRoute({
  bridgeAvailable,
  runtimeCheckComplete,
  serverCheckComplete,
  runtime,
  vaultRoot,
  serverReady,
}: {
  bridgeAvailable: boolean;
  runtimeCheckComplete: boolean;
  serverCheckComplete: boolean;
  runtime: InsightsAgentRuntime | null;
  vaultRoot: string | null;
  serverReady: boolean;
}): InsightsAgentRoute {
  if (!bridgeAvailable) return 'clipboard';
  if (!runtimeCheckComplete || !serverCheckComplete) return 'checking';
  if (runtime && vaultRoot && serverReady) return 'agent';
  return 'clipboard';
}

/**
 * Tab selection itself never calls this planner. An explicit agent action either
 * opens the current request, seats a new one into an empty composer, or requires
 * a second explicit choice before replacing non-empty draft bytes.
 */
export function planInsightsAgentPrompt({
  current,
  draftPresent,
  kind,
  text,
}: {
  current: InsightsAgentPrefill | null;
  draftPresent: boolean;
  kind: InsightsTab;
  text: string;
}): InsightsAgentPromptPlan {
  if (current?.kind === kind && current.text === text) {
    return { action: 'open-current', request: current };
  }
  const request = {
    kind,
    text,
    nonce: (current?.nonce ?? 0) + 1,
  } satisfies InsightsAgentPrefill;
  return draftPresent
    ? { action: 'confirm-replace', request }
    : { action: 'seat', request };
}

/** Flow owns a stricter presentation contract; the other tabs share one read-only frame. */
export function buildInsightsAgentPrompt({
  locale,
  kind,
  handoff,
  flowRequest,
}: {
  locale: string;
  kind: InsightsTab;
  handoff: string;
  flowRequest: string;
}): string {
  if (kind === 'flow') return flowRequest;
  const readHandoff = kind === 'unmatched'
    ? 'query_ontology({operation:"maintenance_plan", kinds:["resolve_dangling_reference","add_missing_relation","unassigned_node"]}) → explain the unresolved names and one-sided placements with evidence; do not change the vault'
    : handoff;
  return locale === 'ko'
    ? [
        '이 분석 탭을 현재 온톨로지 근거만으로 설명해줘.',
        'Atlas MCP 읽기 도구만 사용하고 쓰기 도구, shell, 파일, 소스, 웹은 호출하지 마.',
        '',
        readHandoff,
        '',
        '무엇을 먼저 판단해야 하는지와 확인할 수 없는 한계를 사람이 읽을 문장으로 설명해줘.',
      ].join('\n')
    : [
        'Explain this Analysis tab from the current ontology evidence only.',
        'Use only Atlas MCP read tools. Do not call write tools, shell, files, source, or the web.',
        '',
        readHandoff,
        '',
        'Explain what a person should judge first and what the ontology cannot confirm.',
      ].join('\n');
}
