'use client';

import { useTranslations } from 'next-intl';

import { Chip } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { Check, Copy } from 'lucide-react';

import { OpenVaultCta, useAgentServer, useLocalVault } from '@/features/docs-vault-local';
import { summarizeVaultValidation } from '@/shared/lib/validate-vault-document';

import { VaultAgentSetupPanel } from './VaultAgentSetupPanel';

/**
 * 「MCP 연결」 칸을 **스스로 서게** 묶은 것.
 *
 * ## 왜 생겼나 (2026-08-20, 원장 90)
 *
 * 이 칸이 설정 시트 안에만 있을 때는 시트가 훅을 불러 값을 내려 줬다. 그런데
 * 「에이전트」 목적지가 생기며 소비처가 둘이 됐고, 파생 로직(검증 요약)을 양쪽에
 * 베끼면 그 순간부터 두 화면이 다른 경고 수를 말하게 된다.
 *
 * ## 왜 웹에서도 그린다 (이게 이 칸의 존재 이유다)
 *
 * MCP 는 Atlas 화면이 아니라 **폴더에 붙는다** — 에이전트가 자기 쪽에서 서버를
 * 띄우고 그 서버가 디스크의 볼트를 직접 읽고 쓴다. 그래서 웹 사용자도 연결된다
 * (2026-08-01 원장 「웹의 「연결 불가」는 거짓이었다」). 브라우저가 못 하는 것은
 * **절대 경로를 몰라 설정 파일을 대신 저장해 주는 것** 하나뿐이고, 그건 화면에서
 * 설정 내용을 만들어 사람이 붙이게 하는 길로 답한다.
 *
 * 실행기 칸이 웹에서 「프로그램을 못 띄운다」고 말하면서 *"이 화면에서도 「MCP
 * 연결」 칸에서 …"* 라고 가리키는데, 그 칸이 같은 화면에 없으면 **그 문장이
 * 가리키는 곳이 없다.** 목적지가 이 칸을 같이 데려가는 이유가 그것이다.
 */
/**
 * AI 에이전트 첫 접촉 증명 패킷 — 사람이 읽는 카드 대신 에이전트에 그대로
 * 붙여넣는 typed handoff.
 *
 * ⚠️ **이 파일로 옮겨 왔다** (2026-08-21, 원장 90). 종전에는 설정 시트의
 * MCP 절 안에 살았는데, 그 절이 「에이전트」 목적지로 나가면서 **하마터면 같이
 * 사라질 뻔했다** — 지운 분기 안의 「복사」 버튼만 이 상수를 쓰고 있었고,
 * lint 의 「안 쓰는 변수」 경고가 그 사실을 알려 줬다.
 *
 * 표면은 옮겨도 **핸드오프는 산다** — 이 저장소가 구 5탭 시절에 같은 문장을
 * 이미 적어 뒀다.
 */
const MCP_FIRST_CALLS_PACKET = [
  'Ontology Atlas MCP first-contact proof packet',
  '',
  'Direct MCP proof inside the current agent session:',
  '1. codex mcp list',
  '2. tools/list -> read toolCount from connection_info for the current number; finalize_project_meaning and query_ontology must be present',
  '3. query_ontology({"operation":"agent_brief"})',
  '4. query_ontology({"operation":"workspace_brief"})',
  '5. query_ontology({"operation":"health"})',
  '',
  'If direct MCP tools are missing, this is CLI fallback proof only:',
  'pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
  '',
  'Stale client cache hint:',
  'If the client still says 23 tools or query_ontology is not callable, reload/restart the agent or refresh cached MCP tools.',
  '',
  'Project ontology indexing checkpoint (side effect 0):',
  'Replace [codebase-root] with the current checkout path before running project indexing.',
  'index_project({"rootPath":"[codebase-root]"})',
  'node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2',
  '',
  'Meaning gate: report the business/product domain and capability first, then cite code index rows as implementation evidence.',
  'Business evidence: include meaningGate.businessOntology.evidence rows from README and docs/ontology.',
  'Review queue: include meaningGate.implementationEvidence.reviewRequiredRows so humans can name folders that still lack product meaning.',
  'Do not promote source folders to capabilities when existing ontology evidence maps them through matching slugs or capability elements.',
].join('\n');

export function AgentSetupSection({ onBeforeNavigate }: { onBeforeNavigate?: () => void } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const localVault = useLocalVault();
  const { state: copyState, copy } = useCopyFeedback();
  const serverAvailability = useAgentServer();
  const isLoaded = localVault.status === 'loaded';

  if (!isLoaded) {
    return (
      /* 구획 상자의 인셋은 램프가 낸다 — 16px 을 손으로 다시 적지 않는다
         (`static-card-adoption-ratchet`: 새 파일은 첫날부터 0). */
      <div className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
        <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
          {t('agentStatusNoVault')}
        </p>
        <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('agentNoVaultHint')}
        </p>
        {/*
          ⚠️ **말한 자리에 여는 길이 같이 있어야 한다** (2026-08-20, e2e 가 잡았다).
          첫 판은 「폴더를 열면 …」이라는 문장만 옮기고 **버튼을 안 데려왔다** —
          이 저장소가 이름 붙여 금지한 「막다른 CTA」 그대로다. 요구하는 행동은
          그 자리에서 하게 한다.
        */}
        <div className="mt-3">
          <OpenVaultCta testId="agents-open-vault" />
        </div>
      </div>
    );
  }

  return (
    <>
    <VaultAgentSetupPanel
      canEditCurrent
      localVault={localVault}
      serverAvailability={serverAvailability}
      validationSummary={deriveValidationSummary(localVault)}
      // 목적지에서는 시트를 닫을 것이 없다. 그래도 prop 은 필수이므로
      // 아무것도 안 하는 것을 명시적으로 넘긴다 — `undefined` 를 흘리면
      // 부르는 쪽이 «없어도 되나» 를 매번 다시 판단하게 된다.
      onOpenWorkflowGuide={onBeforeNavigate ?? (() => undefined)}
    />
    {/*
      **첫 접촉 증명 패킷** — 에이전트가 붙었는지 사람이 눈으로 확인하는 대신,
      그대로 붙여넣어 **에이전트가 스스로 증명하게** 한다. 이 절이 시트에서
      목적지로 옮겨 올 때 함께 왔다.
    */}
    <div className="mt-4 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
      <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
        {t('mcpProofTitle')}
      </p>
      <p className="mt-1 break-keep text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('mcpProofBody')}
      </p>
      <Chip
        tone="accentOnTint"
        data-testid="agents-mcp-proof-copy"
        onClick={() => void copy(MCP_FIRST_CALLS_PACKET)}
        className="mt-2 w-full justify-center border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-mono hover:bg-[color:var(--color-indigo-a24)]"
      >
        {copyState === 'copied' ? (
          <Check size={ICON_SIZE.sm} aria-hidden />
        ) : (
          <Copy size={ICON_SIZE.sm} aria-hidden />
        )}
        {copyState === 'copied' ? t('mcpProofCopied') : t('mcpProofCopy')}
      </Chip>
    </div>
    </>
  );
}

/**
 * 볼트 검증 요약 — **문제가 있을 때만** 값이 된다.
 *
 * 두 소비처가 같은 수를 말해야 하므로 여기 한 번만 적는다(사본이 둘이면 어느 날
 * 한쪽만 경고를 세기 시작한다 — Carbon).
 */
function deriveValidationSummary(
  localVault: ReturnType<typeof useLocalVault>,
): { errorCount: number; warningCount: number } | null {
  if (localVault.status !== 'loaded' || !localVault.manifest) return null;
  const summary = summarizeVaultValidation(
    localVault.manifest.docs.map((doc) => ({ slug: doc.slug, frontmatter: doc.frontmatter })),
  );
  if (summary.errorCount === 0 && summary.warningCount === 0) return null;
  return { errorCount: summary.errorCount, warningCount: summary.warningCount };
}
