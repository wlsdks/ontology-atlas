"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import {
  AppNavRail,
  NavRailShellProvider,
  useNavRailShellValue,
} from "@/widgets/app-nav-rail";
import {
  AGENT_CONNECT_ROUTE_HREF,
  AgentConnectLauncherProvider,
  useAgentConnectLauncher,
} from "@/widgets/agent-connect";
import { AgentTerminalDock } from "@/widgets/agent-terminal";
import { AppSettingsMenu } from "@/widgets/app-settings-menu";
import { useAtlasGitContext } from "@/widgets/atlas-git-panel";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";
import { useTranslations } from "next-intl";
import { TerminalSquare } from "lucide-react";
import { resolveActiveNavDestination } from "@/shared/lib/nav-destination";
import { RouteFocusManager } from "@/shared/ui/route-focus-manager";

/**
 * perf/persistent-shell — 레일(AppNavRail)을 8개 페이지 각각의 개별 마운트
 * (rail-rollout, #377)에서 `app/[locale]/layout.tsx` 상주로 승격한 진짜 SPA
 * 셸. 이동 전/후 프로덕션 정적 서빙(:3156) 진단 결과: 클릭은 이미 Next.js
 * client-side RSC 전환(`__next.*.txt` payload, `window` 전역 생존 확인)이라
 * 풀 문서 리로드는 아니었다 — 그런데도 페이지 트리가 통째로 unmount/remount
 * 되면서 레일 DOM도 매번 새로 생성돼(주입한 data attribute 가 이동 후
 * 사라짐) "깜빡이며 로딩되는" 체감을 만들었다. 레일을 라우트 트리 바깥,
 * layout 레벨로 옮기면 콘텐츠 영역만 교체되고 레일은 리액트 identity 를
 * 유지한다.
 *
 * **높이 계약 (2026-07-26 개정 — 종전 "높이는 강제하지 않는다" 는 폐기).**
 * 예전에는 각 페이지가 최상위 wrapper 로 뷰포트 높이를 직접 주장했고
 * (`h-screen` / `min-h-screen`), 셸은 투명한 pass-through 였다. 하단 도크(#79)
 * 가 들어오면서 그 모델이 깨졌다 — 페이지가 100vh 를 주장하면 셸 칼럼이
 * `100vh + 도크높이` 가 되어 도크가 화면 밖으로 밀린다(실측: 보이는 픽셀 0).
 *
 * 이제 **뷰포트 높이는 셸이 소유한다**: 셸이 `h-dvh overflow-hidden` 칼럼을
 * 잡고 본문 슬롯만 스크롤한다. 페이지 루트는 `h-full` / `min-h-full` 로
 * 슬롯을 채우기만 하면 되고, 도크가 있는지 없는지 알 필요가 없다 —
 * 페이지가 기억해야 하는 구조는 #65 계열의 drift 를 부른다.
 * 새 페이지에서 `h-screen`/`min-h-screen` 은 결함이다.
 *
 * `AgentConnectLauncherProvider` 도 여기서 상주한다 — 레일의 에이전트 타일이
 * 어느 페이지에서든 연결 시트를 "열려는 의도" 를 세우면, 지형도로 이동한 뒤에도
 * (레이아웃 상주라) 그 의도가 살아남아 HomePage 가 마운트 직후 소비한다.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NavRailShellProvider>
      {/* 2026-07-25 — 발자취 모달 런처 제거. 목적지(`/git/`)가 lg+ 레일과
          `<lg` 크롬 타일 양쪽에서 같은 표면을 담당하므로 셸에 상주하는 모달이
          더는 필요 없다(런처·패널 호스트·구 레일 타일 전부 도달 불가였다). */}
      <AgentConnectLauncherProvider>
        <RouteFocusManager />
        <ShellWithTerminalDock>{children}</ShellWithTerminalDock>
      </AgentConnectLauncherProvider>
    </NavRailShellProvider>
  );
}

/**
 * 셸 본문 + 하단 터미널 도크 (#79).
 *
 * 도크가 **목적지가 아니라 도크**인 이유: LNB 목적지는 "가서 생각하는 장소"고
 * 터미널은 *다른 표면을 보면서 켜두는 도구* 다. 목적지로 만들면 지도를
 * 대체해버린다 — VS Code 가 터미널을 하단 패널에 둔 이유와 같다.
 *
 * 열림 상태는 셸이 소유한다 — 목적지를 옮겨 다녀도 세션이 유지돼야
 * "켜두는 도구" 가 성립한다.
 */
function ShellWithTerminalDock({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [terminalOpen, setTerminalOpen] = useState(false);
  const vault = useLocalVault();
  const vaultPath = vault.handle ? (getTauriVaultRootPath(vault.handle) ?? null) : null;

  // 터미널을 열 수 있는 표면 (소유자 판단 2026-07-26: "터미널은 지도
  // 페이지에서만 열 수 있도록 하는게 나을듯? 아니면 공방쪽이나..").
  //
  // 왜 전역이 아닌가: 터미널은 *작업 중인 것 옆에 켜두는 도구* 다. 프로젝트
  // 목록이나 다운로드 페이지에서 셸을 띄우는 건 할 일이 없는데 본문 높이의
  // 30% 를 가져간다. 어디서나 열리면 "언제 쓰는 건지" 도 흐려진다.
  //
  // 허용 표면 = **볼트를 실제로 만지는 곳**: 지도(구조를 보며 에이전트에게
  // 시킨다) · 공방(노드를 쓰는 중 확인한다) · 기록(git 을 직접 만진다).
  const tTerminal = useTranslations("agentTerminal");
  const terminalLabel = tTerminal("title");
  const surface = resolveActiveNavDestination(pathname);
  const terminalAllowed = surface === "map" || surface === "studio" || surface === "git";

  // 허용 안 된 표면으로 이동하면 접는다 — 열어둔 채 넘어가면 "왜 여기 있지" 가
  // 된다. 세션 정리(자식 프로세스 kill)는 도크 언마운트 effect 가 한다.
  useEffect(() => {
    if (!terminalAllowed) setTerminalOpen(false);
  }, [terminalAllowed]);

  // ⌃` — VS Code 의 터미널 토글은 **모든 플랫폼에서 Control+backtick** 이다.
  // macOS 의 ⌘` 는 시스템 "다음 창" 단축키라, 여기서 preventDefault 하면
  // 설치 앱에서 OS 관용구를 뺏는다. 이 키가 **세션을 시작하는 유일한 경로**
  // 이므로 자동 실행 0 이 유지된다(마운트만으로는 아무것도 안 뜬다).
  useEffect(() => {
    if (!terminalAllowed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "`" || !event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      setTerminalOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [terminalAllowed]);

  // 도크가 본문에서 가져가는 높이(`--app-viewport-h`)는 도크 자신이
  // `<html data-agent-terminal>` 로 선언한다 — 실제 높이를 정하는 조건
  // (available · vaultPath)을 아는 곳이 거기 하나뿐이라, 여기서 따로
  // 계산하면 예약 높이와 실제 높이가 갈린다.
  return (
    // 뷰포트 소유권은 **셸**이 갖는다 (소유자 실보고 2026-07-26: "스크롤을 맨
    // 밑으로 내려야 터미널이 나오는데.."). 도크가 문서 흐름에 있으면 그건
    // 도크가 아니라 푸터다.
    //
    // 토큰(`--app-viewport-h`)을 만들어 **각 페이지가 쓰도록** 하는 방법도
    // 있었지만, 그건 "페이지가 기억해야 하는 구조" 라 #65(레일 유틸 티어가
    // 화면마다 1/2/3 개였던 결함)와 같은 drift 를 부른다. 셸이 `h-dvh` 를
    // 잡고 본문을 스크롤 영역으로 가두면 어떤 페이지도 아무것도 몰라도 된다.
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <AppNavRailSlot />
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
      {/* 도크 손잡이 — 닫혀 있을 때만. ⌃` 만 있으면 **발견 불가능한 기능**이라
          사실상 없는 것과 같다(소유자 실보고 2026-07-26: "터미널을 여는 버튼이
          없는데?").

          왜 레일 타일이 아닌가: 터미널은 표면 한정(지도·공방·기록)이라 레일에
          넣으면 화면마다 아이콘 수가 달라진다 — #65 가 그 결함이었다. 대신
          도크가 자기 손잡이를 갖는다: 닫히면 얇은 바, 열리면 그 자리가 헤더가
          되어 위치가 연속된다(VS Code 패널 토글과 같은 관용구). 셸이 소유하므로
          페이지가 등록할 것이 없다. */}
      {terminalAllowed && !terminalOpen ? (
        <button
          type="button"
          data-testid="agent-terminal-handle"
          onClick={() => setTerminalOpen(true)}
          title={`${terminalLabel} (⌃\`)`}
          className="flex shrink-0 items-center gap-2 border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-1.5 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        >
          <TerminalSquare size={13} aria-hidden />
          <span>{terminalLabel}</span>
          {/* 단축키를 손잡이에 새겨 다음부터는 키로 열게 만든다 — 버튼은
              발견용, 키는 사용용. */}
          <kbd className="ml-auto rounded border border-[color:var(--color-border-soft)] px-1.5 py-0.5 font-mono text-caption">
            ⌃`
          </kbd>
        </button>
      ) : null}

      <AgentTerminalDock
        open={terminalOpen && terminalAllowed}
        onClose={() => setTerminalOpen(false)}
        vaultPath={vaultPath}
      />
    </div>
  );
}

/** `/` 와 `/topology*` 는 둘 다 HomePage(연결 시트 소유자)를 렌더한다. */
function isTopologyHubPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/topology");
}

function AppNavRailSlot() {
  const { settingsSlot, hidden, contextHrefs } = useNavRailShellValue();
  const launcher = useAgentConnectLauncher();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const dataSourceMode = useDataSourceMode();

  // P4-② 분기(TopologyIndexPanel 푸터와 동일 계약) — 연결됨: 활동
  // 다이제스트(인사이트)로. 미연결/stale: 연결 시트를 여는 전역 의도를 세운다.
  // 시트 본체는 HomePage 소유이므로 지형도 밖이면 지형도로 이동 —
  // launcher.wantOpen 이 레이아웃 상주라 도착한 HomePage 가 곧바로 소비한다.
  const onAgentTileActivate = useCallback(
    (connected: boolean) => {
      if (connected) {
        router.push("/ontology/insights/");
        return;
      }
      launcher.open();
      if (!isTopologyHubPath(pathname)) {
        router.push(AGENT_CONNECT_ROUTE_HREF);
      }
    },
    [launcher, router, pathname],
  );

  // #65 — 레일 하단 유틸 티어는 셸이 기본으로 채운다. 예전엔 페이지마다
  // `useNavRailSettingsSlot(<AppSettingsMenu triggerVariant="rail-tile" />)` 를
  // 손으로 등록해야 했고, **공방(OntologyStudioPage)이 그걸 빠뜨려** 그 화면만
  // 하단에 아이콘 1개(에이전트)만 남았다 (지도 3 · 문서함/인사이트/프로젝트 2 ·
  // 공방 1, opus5 검수 2026-07-25 실측). 페이지가 기억해야 하는 구조가 drift 의
  // 원인이므로 기본값을 셸로 올린다 — 페이지는 특별한 슬롯이 필요할 때만
  // 덮어쓴다.
  // 뱃지 카운트 — 목적지와 **같은 훅**을 읽는다(값이 갈리면 목록은 비었는데
  // 숫자가 남는 신뢰 사고가 난다). 세션 changeset 기준이라 웹/데스크톱 모두
  // 동작한다 — 데스크톱 정밀 카운트(`git_status.changedCount`)는 후속.
  const { changeset: gitChangeset } = useAtlasGitContext();
  const gitDirtyCount = gitChangeset.touchedNodeIds.size;

  // 2026-07-25 — 발자취는 **목적지로 승격**됐고 이 유틸 타일은 흡수됐다. 입구가
  // 둘이면(타일 + 목적지) #65 와 같은 계열의 혼란이 재발한다. 미커밋 변경 수는
  // 목적지 아이콘의 warning 뱃지로 옮겼다.
  const utilityTier =
    settingsSlot ?? <AppSettingsMenu mode={dataSourceMode} triggerVariant="rail-tile" />;

  return (
    <AppNavRail
      settingsSlot={utilityTier}
      hidden={hidden}
      contextHrefs={contextHrefs}
      gitDirtyCount={gitDirtyCount}
      onAgentTileActivate={onAgentTileActivate}
      agentConnectOpen={launcher.wantOpen}
    />
  );
}
