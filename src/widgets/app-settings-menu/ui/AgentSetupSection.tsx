'use client';

import { useTranslations } from 'next-intl';

import { useAgentServer, useLocalVault } from '@/features/docs-vault-local';
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
export function AgentSetupSection({ onBeforeNavigate }: { onBeforeNavigate?: () => void } = {}) {
  const t = useTranslations('nav.settingsMenu');
  const localVault = useLocalVault();
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
      </div>
    );
  }

  return (
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
