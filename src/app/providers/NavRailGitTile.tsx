"use client";

import { useMemo } from "react";

import { computeOntologyChangeset, useChangeBaseline } from "@/shared/lib/ontology-tree";
import { useOntologyInsight } from "@/features/vault-ontology";
import { useLocalVault } from "@/features/docs-vault-local";
import { GitStatusTile } from "@/widgets/app-nav-rail";
import { AtlasGitPanel } from "@/widgets/atlas-git-panel";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { useAudiencePlain } from "@/shared/lib/audience-preference";
import { useAtlasGitLauncher } from "@/shared/lib/atlas-git-launcher";

/**
 * 레일 하단 **발자취(Atlas Git)** 타일 + 그 패널 — 셸 소유 (#65).
 *
 * 왜 셸로 올렸나: 이 타일은 원래 `HomePage` 가 `settingsSlot` 에 끼워 넣었고,
 * 설정 기어도 페이지마다 손으로 등록했다. 그래서 하단 유틸 티어 개수가 화면마다
 * 갈렸다 — 지도 3개 · 문서함/인사이트/프로젝트 2개 · **공방 1개**
 * (opus5 검수 2026-07-25 실측, 소유자: "모든 페이지에서 다 똑같이 하단에
 * 아이콘이 3개여야 하는데 왜 1개만 나옴?").
 *
 * 페이지가 기억해야 하는 구조가 drift 의 원인이므로, 전역에서 같아야 하는 것은
 * 셸이 소유한다. vault 경로와 세션 changeset 은 전부 공용 훅에서 나오므로
 * 페이지 상태에 의존하지 않는다.
 *
 * 비개발(plain) 모드에서는 발자취를 개발자 크롬으로 보고 숨긴다 — 기존 지도
 * 규칙 그대로이며, 이제 `audience-preference` 공용 스토어를 읽어 설정에서
 * 바꾸면 모든 화면이 함께 바뀐다.
 */
export function NavRailGitTile() {
  const [audiencePlain] = useAudiencePlain();
  const launcher = useAtlasGitLauncher();
  const { vaultPath, changeset } = useAtlasGitContext();

  if (audiencePlain) return null;

  return (
    <GitStatusTile
      onActivate={launcher.open}
      panelOpen={launcher.isOpen}
      vaultPath={vaultPath}
      sessionDirty={changeset.touchedNodeIds.size > 0}
    />
  );
}

/** vault 경로 + 세션 changeset — 타일과 패널이 같은 값을 본다. */
function useAtlasGitContext() {
  const localVault = useLocalVault();
  const { insight } = useOntologyInsight();
  const changeBaseline = useChangeBaseline();

  const changeset = useMemo(
    () => computeOntologyChangeset(changeBaseline, insight?.nodes ?? [], insight?.edges ?? []),
    [changeBaseline, insight],
  );

  // Tauri 데스크톱이면 vault 절대 경로(브리지 활성), 웹 FSA 핸들이면 null →
  // 타일/패널이 세션 changeset 기반으로 정직하게 강등한다.
  const vaultPath = localVault.handle ? (getTauriVaultRootPath(localVault.handle) ?? null) : null;
  return { vaultPath, changeset };
}

/**
 * 패널 본체. **열렸을 때만 마운트**한다 — 닫힌 상태에서도 changeset 을 계산하면
 * 모든 페이지의 모든 렌더에서 그래프를 훑는 낭비가 된다.
 */
export function AtlasGitPanelHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <AtlasGitPanelBody onClose={onClose} />;
}

function AtlasGitPanelBody({ onClose }: { onClose: () => void }) {
  const { vaultPath, changeset } = useAtlasGitContext();

  return (
    <div
      data-interactive-overlay="true"
      data-testid="atlas-git-scrim"
      className="pointer-events-auto fixed inset-0 z-50 flex items-stretch justify-center bg-[color:var(--color-backdrop-medium)] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-y-auto border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-2xl sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:max-w-[560px] sm:rounded-[var(--topology-shortcut-sheet-radius)]"
      >
        <AtlasGitPanel vaultPath={vaultPath} sessionChangeset={changeset} onClose={onClose} />
      </div>
    </div>
  );
}
