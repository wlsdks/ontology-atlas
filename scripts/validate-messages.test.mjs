import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const MESSAGES_DIR = path.join(ROOT, 'messages');
const ROUTING_FILE = path.join(ROOT, 'src/i18n/routing.ts');

describe('i18n message catalog', () => {
  it('has one message file per configured locale', async () => {
    const locales = await readRoutingLocales();
    const messageLocales = (await readdir(MESSAGES_DIR))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort();

    assert.deepEqual(messageLocales, [...locales].sort());
  });

  it('keeps translation key shape identical across locales', async () => {
    const locales = await readRoutingLocales();
    const [baseLocale, ...otherLocales] = locales;
    const baseMessages = await readJson(path.join(MESSAGES_DIR, `${baseLocale}.json`));
    const baseKeys = flattenKeys(baseMessages);

    for (const locale of otherLocales) {
      const messages = await readJson(path.join(MESSAGES_DIR, `${locale}.json`));
      assert.deepEqual(
        flattenKeys(messages),
        baseKeys,
        `${locale}.json keys must match ${baseLocale}.json`,
      );
    }
  });

  it('keeps hosted download copy honest before the first public macOS release', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(en.download.primaryCta, 'Check GitHub releases');
    assert.equal(en.download.sourceCta, 'View source code');
    assert.match(ko.download.primaryCta, /릴리스 확인/);
    assert.match(ko.download.sourceCta, /소스 코드/);
    assert.doesNotMatch(en.download.primaryCta, /latest/i);
    assert.doesNotMatch(ko.download.primaryCta, /최신/);
    assert.match(en.download.releaseAvailabilityNote, /If no macOS DMG is visible yet/);
    assert.match(en.download.releaseAvailabilityNote, /PR review, version alignment, Developer ID signing\/notarization, or the v0\.1\.0 GitHub Release/);
    assert.doesNotMatch(en.download.releaseAvailabilityNote, /Firebase Hosting/);
    assert.match(en.download.releaseStatusTitle, /Before the first release is fully available/);
    assert.match(en.download.releaseStatusPr, /desktop release workflow/);
    assert.match(en.download.releaseStatusPr, /merged to main before v0\.1\.0 can ship/);
    assert.match(en.download.releaseStatusVersion, /v0\.1\.0 tag/);
    assert.match(en.download.releaseStatusVersion, /package\.json, Tauri, and Cargo metadata/);
    assert.doesNotMatch(en.download.releaseStatusVersion, /Firebase Hosting/);
    assert.match(en.download.releaseStatusSecrets, /Apple Developer ID signing\/notarization secrets/);
    assert.doesNotMatch(en.download.releaseStatusSecrets, /Firebase Hosting/);
    assert.match(en.download.releaseStatusSecrets, /direct-download DMGs/);
    assert.match(en.download.releaseStatusSecrets, /not Mac App Store submission/);
    assert.match(en.download.releaseStatusRelease, /v0\.1\.0 GitHub Release/);
    assert.match(en.download.releaseStatusRelease, /source of truth/);
    assert.match(en.download.releaseStatusHosted, /Separately, Firebase Hosting must deploy/);
    assert.match(en.download.releaseStatusHosted, /\/ko\/download\//);
    assert.match(ko.download.releaseAvailabilityNote, /macOS DMG 가 아직 보이지 않으면/);
    assert.match(ko.download.releaseAvailabilityNote, /PR review, version alignment, Developer ID signing\/notarization, v0\.1\.0 GitHub Release/);
    assert.doesNotMatch(ko.download.releaseAvailabilityNote, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusTitle, /첫 릴리스가 완전히 열리기 전 체크리스트/);
    assert.match(ko.download.releaseStatusPr, /desktop release workflow/);
    assert.match(ko.download.releaseStatusPr, /main 에 병합/);
    assert.match(ko.download.releaseStatusVersion, /v0\.1\.0 tag/);
    assert.match(ko.download.releaseStatusVersion, /package\.json, Tauri, Cargo metadata/);
    assert.doesNotMatch(ko.download.releaseStatusVersion, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusSecrets, /Apple Developer ID/);
    assert.doesNotMatch(ko.download.releaseStatusSecrets, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusSecrets, /직접 다운로드 DMG/);
    assert.match(ko.download.releaseStatusSecrets, /Mac App Store 제출용이 아니라/);
    assert.match(ko.download.releaseStatusRelease, /v0\.1\.0 GitHub Release/);
    assert.match(ko.download.releaseStatusRelease, /진실원/);
    assert.match(ko.download.releaseStatusHosted, /별도로/);
    assert.match(ko.download.releaseStatusHosted, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusHosted, /\/ko\/download\//);
    assert.match(en.download.proofSigned, /Release gate requires/);
    assert.match(en.download.proofNotarized, /Release gate requires/);
    assert.match(en.download.proofChecksum, /checksums are verified/);
    assert.match(en.download.step1Body, /aarch64 DMG for Apple Silicon Macs/);
    assert.match(en.download.step1Body, /x64 DMG for Intel Macs/);
    assert.match(ko.download.proofSigned, /릴리스 게이트/);
    assert.match(ko.download.proofNotarized, /릴리스 게이트/);
    assert.match(ko.download.proofChecksum, /체크섬을 검증/);
    assert.match(ko.download.step1Body, /Apple Silicon Mac 은 aarch64 DMG/);
    assert.match(ko.download.step1Body, /Intel Mac 은 x64 DMG/);
    // (Removed 2026-07-24) The `ontologyPages.edit.*` demo-mode/onboarding
    // download-guidance assertions were dropped with the retired ERD builder —
    // that namespace no longer exists. Topology empty-state download guidance
    // (below) still covers the "install the macOS app" contract.
    assert.match(en.topology.empty.bodyNoProjectsDownload, /Install the macOS app/i);
    assert.match(en.topology.empty.ctaOpenVaultDownload, /Download macOS app/i);
    assert.match(ko.topology.empty.ctaOpenVaultDownload, /macOS 앱 다운로드/);
  });

  it('keeps Korean primary navigation understandable without topology jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    // feat/rail-rollout retired `OperationsNav`/`OntologySubNav`/`ModeBadge`
    // (their top-tab, sub-tab, and vault-chip copy below) — `navRail.*` (the
    // AppNavRail rail + BottomTabBar's shared label source) is now the one
    // primary-navigation copy surface for both desktop and mobile.
    assert.equal(ko.navRail.map, '지도');
    assert.equal(ko.navRail.docs, '문서함');
    // `navRail.builder` retired 2026-07-24 with the ERD builder (the workshop absorbs it).
    // 2026-07-25: 스튜디오 → 공방 개명 (라벨만, `navRail.studio` 키는 유지).
    assert.equal(ko.navRail.studio, '공방');
    assert.equal(ko.navRail.insights, '인사이트');
    assert.equal(ko.navRail.projects, '프로젝트');
    assert.doesNotMatch(
      [ko.navRail.map, ko.navRail.docs, ko.navRail.studio, ko.navRail.insights, ko.navRail.projects].join('\n'),
      /지형도|토폴로지|운영|Operations/,
    );
    assert.equal(
      ko.nav.settingsMenu.triggerTitle,
      '화면, 언어, 온톨로지 작업공간, MCP 연결 설정을 엽니다',
    );
    assert.equal(ko.nav.settingsMenu.tabVault, '작업공간');
    assert.equal(ko.nav.settingsMenu.tabVaultDesc, '온톨로지 작업공간 접근.');
    assert.equal(ko.nav.settingsMenu.vaultTitle, '온톨로지 작업공간');
    assert.equal(
      ko.nav.settingsMenu.vaultBodyLocal,
      '현재 로컬 작업공간을 열어 파일과 온톨로지 개념을 확인합니다.',
    );
    assert.equal(ko.nav.settingsMenu.vaultCtaLocal, '작업공간 열기');
    assert.equal(ko.topology.documentTitle, '지형도');
    // 구 topologyWidgets.controls 단축키/depth 카피(depthHop·shortcutDepthAll·
    // shortcutDoubleClick·shortcutEsc)는 죽은 "지도 조절" 패널 철거(2026-07-21)로
    // 사라졌다 — Fit 타일만 남아 fitViewTooltip/fitViewAriaLabel 만 검증한다.
    assert.equal(ko.topologyWidgets.controls.fitViewAriaLabel, '지도 전체 맞추기');
    assert.equal(ko.topology.analysis.overviewAgentReadiness, '에이전트 인계');
    assert.equal(ko.topology.analysis.overviewAgentReadinessReady, '인계 가능');
    assert.equal(ko.topology.analysis.overviewAgentReadinessPreflight, '사전 점검');
    assert.doesNotMatch(
      [
        ko.topologyWidgets.controls.fitViewTooltip,
        ko.topologyWidgets.controls.fitViewAriaLabel,
        ko.topology.analysis.overviewAgentReadiness,
        ko.topology.analysis.overviewAgentReadinessReady,
        ko.topology.analysis.overviewAgentReadinessPreflight,
      ].join('\n'),
      /\b(Agent|agent|handoff|preflight|Depth|Local graph|HOP)\b/,
    );
    assert.doesNotMatch(
      [
        ko.navRail.docs,
        ko.nav.settingsMenu.triggerTitle,
        ko.nav.settingsMenu.subtitle,
        ko.nav.settingsMenu.tabGeneralDesc,
        ko.nav.settingsMenu.tabVault,
        ko.nav.settingsMenu.tabVaultDesc,
        ko.nav.settingsMenu.vaultTitle,
        ko.nav.settingsMenu.vaultBodyLocal,
        ko.nav.settingsMenu.vaultBodyStatic,
        ko.nav.settingsMenu.vaultCtaLocal,
        ko.nav.settingsMenu.vaultCtaStatic,
        ko.rootEntry.openingLocalVaultPicker,
        ko.searchWidgets.hero.ontologyAriaLabel,
        ko.searchWidgets.workspaceStrip.ontologyTitle,
        ko.searchWidgets.workspaceStrip.stubTitle,
      ].join('\n'),
      /frontmatter|vault|Vault|토폴로지|source|Source/,
    );
  });

  it('keeps Korean app settings MCP proof copy readable without internal client jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const settings = ko.nav.settingsMenu;
    const visibleCopy = [
      settings.subtitle,
      settings.tabMcpAgents,
      settings.tabMcpAgentsDesc,
      settings.liveVerdictSetupMeta,
      settings.liveVerdictFallback,
      settings.liveVerdictFallbackMeta,
      settings.fallbackProofTitle,
      settings.fallbackProofBody,
      settings.staleCacheBody,
      settings.proofDecisionSession,
      settings.proofDecisionFallback,
      settings.agentTitle,
      settings.agentBody,
      settings.mcpProofBody,
      settings.mcpProofDirectLabel,
      settings.mcpProofFallbackLabel,
      settings.mcpProofFallbackBody,
      settings.mcpProofStaleCache,
      settings.mcpProofFallback,
      settings.clientProofTitle,
      settings.clientProofBody,
      settings.clientCodexBody,
      settings.clientClaudeBody,
      settings.clientCursorVsCodeBody,
    ].join('\n');

    assert.equal(settings.tabMcpAgents, 'MCP/에이전트');
    assert.equal(settings.liveVerdictFallback, '대체 검증은 별도');
    assert.equal(settings.fallbackProofTitle, 'CLI 대체 검증');
    assert.equal(settings.clientProofTitle, '다른 도구의 확인 위치');
    assert.match(visibleCopy, /에이전트/);
    assert.match(visibleCopy, /대체 검증/);
    assert.doesNotMatch(visibleCopy, /\bAgent\b|\bFallback\b|\bclient\b|\bnamespace\b|\breload\b|\brestart\b|graph DB gate/);
  });

  it('keeps Korean live activity chip readable without internal status jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const live = ko.liveActivity;
    const visibleCopy = [
      live.live,
      live.triggerTitle,
      live.changed,
      live.summaryTitle,
      live.summaryBody,
      live.summaryZero,
      live.summaryCount,
      live.summaryNotTracking,
      live.summaryAction,
      live.agentTitle,
      live.agentMissing,
      live.agentInvalid,
      live.agentStaleAudit,
      live.agentEvidence,
      live.agentSource,
      live.agentReviewMode,
      live.agentReviewTarget,
      live.agentChipTracking,
      live.agentChipMissing,
      live.agentChipInvalid,
      live.agentChipStale,
      live.agentChipCurrent,
      live.close,
    ].join('\n');

    assert.equal(live.live, '실시간');
    assert.equal(live.agentTitle, 'AI 작업 상태');
    assert.equal(live.agentChipTracking, '추적 중');
    assert.equal(live.agentChipStale, '오래됨');
    assert.match(live.triggerTitle, /온톨로지 개념/);
    assert.match(live.triggerTitle, /AI 작업 상태/);
    assert.doesNotMatch(
      visibleCopy,
      /\bLive\b|ontology node|agent heartbeat|Agent heartbeat|\bagent\b|\bfresh\b|\bfocus\b|\bnode\b|\btracking\b|\binvalid\b|\bstale\b|\bsource\b|\breview\b|\btarget\b/,
    );
  });

  it('keeps the topology overview agent handoff brief readable (분석 패널 완전 소멸 2단계 — TopologyAnalysisBar 삭제 후 INDEX 푸터 인계 메뉴가 유일한 소비처)', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(en.topology.controls.docsTooltip, 'Ontology workspace quick look (D)');
    assert.equal(
      en.topology.controls.docsAriaLabel,
      'Open ontology workspace quick look (D)',
    );
    assert.equal(en.topology.controls.docsLabel, 'Workspace');
    assert.doesNotMatch(
      [
        en.topology.controls.docsTooltip,
        en.topology.controls.docsAriaLabel,
        en.topology.controls.docsLabel,
      ].join('\n'),
      /Quick view|See all|Pick one|See links|Clean up health|Source vault|source vault|^Source$/m,
    );

    assert.equal(ko.topology.analysis.overviewBriefCopyAriaLabel, '지형도 지도 요약 복사');
    assert.equal(ko.topology.analysis.overviewBriefCopiedAriaLabel, '지형도 지도 요약 복사됨');
    assert.equal(ko.topology.analysis.overviewBriefTitle, '지형도 지도 요약');
    assert.equal(ko.topology.analysis.overviewBriefHealthSignals, '상태 신호');
    assert.equal(ko.topology.analysis.overviewBriefHealthUrl, '상태 점검 URL');
    assert.equal(ko.topology.analysis.overviewBriefInsightsUrl, '연결·검증 URL');
    assert.equal(ko.topology.analysis.overviewBriefAgentCheck, '에이전트 전체 점검');
    assert.equal(ko.topology.analysis.overviewBriefMcpCheck, 'MCP 전체 점검');
    assert.equal(ko.topology.analysis.overviewBriefMcpQueryPlan, 'MCP 질의 계획');
    assert.equal(ko.topology.analysis.overviewBriefWorkspaceCheck, '작업공간 점검');
    assert.equal(ko.topology.analysis.overviewBriefMcpWorkspaceCheck, 'MCP 작업공간 점검');
    assert.equal(ko.topology.controls.docsTooltip, '온톨로지 워크스페이스 빠른 보기 (D)');
    assert.equal(
      ko.topology.controls.docsAriaLabel,
      '온톨로지 워크스페이스 빠른 보기 열기 (D)',
    );
    assert.equal(ko.topology.controls.docsLabel, '작업공간');
    assert.equal(ko.topology.controls.relayoutToast, '지형도를 다시 정렬합니다');
    assert.doesNotMatch(
      [
        ko.topology.analysis.overviewBriefCopyAriaLabel,
        ko.topology.analysis.overviewBriefCopiedAriaLabel,
        ko.topology.analysis.overviewBriefTitle,
        ko.topology.analysis.overviewBriefHealthSignals,
        ko.topology.analysis.overviewBriefAgentCheck,
        ko.topology.analysis.overviewBriefMcpCheck,
        ko.topology.analysis.overviewBriefMcpQueryPlan,
        ko.topology.analysis.overviewBriefWorkspaceCheck,
        ko.topology.analysis.overviewBriefMcpWorkspaceCheck,
        ko.topology.controls.relayoutToast,
        ko.topology.controls.docsTooltip,
        ko.topology.controls.docsAriaLabel,
        ko.topology.controls.docsLabel,
      ].join('\n'),
      /전체 보기|하나 선택|연결 보기|상태 정리|문서함|^문서$|토폴로지|Topology|overview brief|overview|query plan|Workspace|workspace|Health 신호/m,
    );
  });

  it('keeps the topology path chip copy readable (분석 패널 완전 소멸 2단계 §b — replaces the retired path panel copy)', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const enCopy = en.topology.analysis;
    const koCopy = ko.topology.analysis;

    assert.match(enCopy.pathChipUnresolved, /choose a target/i);
    assert.match(enCopy.pathChipResolved, /hops/i);
    assert.match(enCopy.pathChipNoPath, /no path/i);
    assert.equal(enCopy.pathChipCopyPacket, 'Copy path packet');
    assert.equal(enCopy.pathChipClear, 'Clear path');
    assert.match(koCopy.pathChipUnresolved, /대상 선택/);
    assert.match(koCopy.pathChipResolved, /홉/);
    assert.match(koCopy.pathChipNoPath, /경로 없음/);
    assert.equal(koCopy.pathChipCopyPacket, '경로 패킷 복사');
    assert.equal(koCopy.pathChipClear, '경로 지우기');

    assert.doesNotMatch(
      [
        enCopy.pathChipUnresolved,
        enCopy.pathChipResolved,
        enCopy.pathChipNoPath,
        enCopy.pathChipCopyPacket,
        enCopy.pathChipClear,
        enCopy.pathChipPacketMcpCheck,
      ].join('\n'),
      /Topology|topology|CLI|relation_check|explain_relation|all_paths|proof|checklist/,
    );
    assert.doesNotMatch(
      [
        koCopy.pathChipUnresolved,
        koCopy.pathChipResolved,
        koCopy.pathChipNoPath,
        koCopy.pathChipCopyPacket,
        koCopy.pathChipClear,
      ].join('\n'),
      /토폴로지|검증 순서|사전 점검|설명 점검|전체 경로/,
    );
  });

  it('keeps topologyWidgets free of the retired sigma/contextMenu/edgeTooltip namespaces (chore/copy-plainlang W5 — SigmaTopology.tsx + SigmaContextMenu were physically deleted in c84ecb25e; only `controls`/`hubRail` still have consumers under `src/widgets/topology-controls`)', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.deepEqual(Object.keys(ko.topologyWidgets).sort(), ['controls', 'hubRail']);
    assert.deepEqual(Object.keys(en.topologyWidgets).sort(), ['controls', 'hubRail']);
  });

  it('keeps Korean docs vault commands understandable without source/topology jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const commands = ko.docsVault.commands;
    const header = ko.docsVault.header;
    const docsUi = ko.vaultWidgets;

    assert.equal(header.back, '의미 지도');
    assert.equal(header.backToWorkspaceAriaLabel, '의미 지도로 돌아가기');
    assert.equal(header.openTreeTitle, '문서 목록');
    assert.equal(header.openTreeAriaLabel, '문서 목록 열기');
    assert.equal(docsUi.parts.sidebar.treeHeader, '문서 목록');
    assert.equal(docsUi.parts.sidebar.searchLabel, '문서 검색');
    assert.equal(docsUi.tree.navAria, '문서 목록');
    assert.doesNotMatch(header.back, /워크스페이스|토폴로지/);
    assert.doesNotMatch(header.backToWorkspaceAriaLabel, /워크스페이스|토폴로지/);
    assert.doesNotMatch(
      [
        header.openTreeTitle,
        header.openTreeAriaLabel,
        docsUi.parts.sidebar.treeHeader,
        docsUi.parts.sidebar.searchLabel,
        docsUi.tree.navAria,
      ].join('\n'),
      /문서 기록|기록 찾기/,
    );
    assert.equal(commands.sourceServer, '샘플 문서함 보기');
    assert.equal(commands.sourceLocal, '내 PC 문서함 열기');
    // P5a — folder-topology 제거: 해당 명령 키가 부활하지 않았는지 역단언.
    assert.equal(commands.viewFolderTopology, undefined);
    assert.equal(commands.scaffoldTopology, undefined);
    assert.doesNotMatch(commands.sourceServer, /소스|Source/);
    assert.doesNotMatch(commands.sourceLocal, /소스|Source/);
  });

  // (Removed 2026-07-24) The builder relation-write-confirmation copy guard
  // was deleted with the retired ERD builder — its
  // `ontologyPages.edit.page.relationConfirm` namespace no longer exists.

  it('keeps Korean docs vault welcome contract understandable without frontmatter jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const welcomeCopy = [
      ko.docsVault.desktopWelcome.title,
      ko.docsVault.desktopWelcome.body,
      ko.docsVault.desktopWelcome.contractAriaLabel,
      ko.docsVault.desktopWelcome.contractFilesLabel,
      ko.docsVault.desktopWelcome.contractAgentLabel,
      ko.docsVault.desktopWelcome.contractAgentBody,
      ko.docsVault.desktopWelcome.contractGraphValue,
      ko.docsVault.desktopWelcome.actionsAriaLabel,
      ko.docsVault.sourceContract.ariaLabel,
      ko.docsVault.sourceContract.filesLabel,
      ko.docsVault.desktopWelcome.contractGraphBody,
      ko.docsVault.sourceContract.filesBody,
      ko.docsVault.sourceContract.graphValue,
      ko.docsVault.sourceContract.graphBody,
      ko.docsVault.sourceContract.agentLabel,
      ko.docsVault.sourceContract.agentBody,
    ].join('\n');

    assert.equal(ko.docsVault.desktopWelcome.title, '로컬 온톨로지 문서함을 열거나 만드세요');
    assert.equal(ko.docsVault.desktopWelcome.contractAriaLabel, '온톨로지 문서함 실행 계약');
    assert.equal(ko.docsVault.desktopWelcome.contractFilesLabel, '문서함 파일');
    assert.equal(ko.docsVault.desktopWelcome.contractGraphValue, '문서 속성이 의미 그래프');
    assert.equal(ko.docsVault.desktopWelcome.contractAgentLabel, 'AI 확인');
    assert.equal(ko.docsVault.desktopWelcome.actionsAriaLabel, '온톨로지 문서함 시작 액션');
    assert.equal(ko.docsVault.sourceContract.filesLabel, '문서함 파일');
    assert.equal(ko.docsVault.sourceContract.graphValue, '개념 {nodes}개 · 관계 {edges}개');
    assert.equal(ko.docsVault.sourceContract.agentLabel, 'AI 확인');
    assert.match(ko.docsVault.desktopWelcome.body, /문서 상단의 속성/);
    assert.match(ko.docsVault.desktopWelcome.contractGraphValue, /문서 속성/);
    assert.match(ko.docsVault.sourceContract.graphBody, /지형도/);
    assert.doesNotMatch(
      welcomeCopy,
      /frontmatter|vault|Vault|토폴로지|source|Source|온톨로지 저장소|저장소 파일|온톨로지 노드|\bAgent\b|\bagent\b|에이전트|노드 \{nodes\}개|그래프 DB/,
    );
  });

  it('keeps English docs vault welcome contract understandable without implementation jargon', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const welcomeCopy = [
      en.metadata.pages.docs,
      en.navRail.docs,
      en.nav.settingsMenu.triggerTitle,
      en.nav.settingsMenu.subtitle,
      en.nav.settingsMenu.tabVaultDesc,
      en.nav.settingsMenu.vaultTitle,
      en.nav.settingsMenu.vaultBodyLocal,
      en.nav.settingsMenu.vaultBodyStatic,
      en.nav.settingsMenu.vaultCtaLocal,
      en.nav.settingsMenu.vaultCtaStatic,
      en.searchWidgets.shortcuts.sections.docsPalette,
      en.searchWidgets.shortcuts.sections.docsGraph,
      en.searchWidgets.shortcuts.sections.docsSource,
      en.searchWidgets.shortcuts.sections.docsActions,
      en.searchWidgets.shortcuts.rows.toggleDocsDrawer,
      en.searchWidgets.shortcuts.rows.localVault,
      en.searchWidgets.shortcuts.rows.manualRefresh,
      en.searchWidgets.shortcuts.rows.focusRefresh,
      en.searchWidgets.hero.docsVault,
      en.searchWidgets.hero.docsVaultAriaLabel,
      en.searchWidgets.hero.openDocsVault,
      en.vaultWidgets.docsDrawer.ariaLabel,
      en.vaultWidgets.docsDrawer.eyebrow,
      en.vaultWidgets.docsDrawer.openAllAriaLabel,
      en.vaultWidgets.docsDrawer.openVault,
      en.vaultWidgets.projectDrawer.openDocsVault,
      en.vaultWidgets.projectDrawer.openDocsVaultTitleEmpty,
      en.vaultWidgets.palette.dialogAriaLabel,
      en.vaultWidgets.palette.inputAriaLabel,
      en.docsVault.desktopWelcome.title,
      en.docsVault.desktopWelcome.body,
      en.docsVault.desktopWelcome.contractAriaLabel,
      en.docsVault.desktopWelcome.contractFilesLabel,
      en.docsVault.desktopWelcome.contractGraphValue,
      en.docsVault.desktopWelcome.contractGraphBody,
      en.docsVault.desktopWelcome.contractAgentLabel,
      en.docsVault.desktopWelcome.contractAgentBody,
      en.docsVault.desktopWelcome.actionsAriaLabel,
      en.docsVault.sourceContract.ariaLabel,
      en.docsVault.sourceContract.filesLabel,
      en.docsVault.sourceContract.filesBody,
      en.docsVault.sourceContract.graphValue,
      en.docsVault.sourceContract.graphBody,
      en.docsVault.sourceContract.agentLabel,
      en.docsVault.sourceContract.agentBody,
      en.docsVault.sourceContract.agentCopyGate,
      en.docsVault.sourceContract.agentCopyGateAriaLabel,
    ].join('\n');

    assert.equal(en.metadata.pages.docs, 'Ontology workspace');
    // `nav.docs`/`nav.tooltipDocs`/`modeBadge.*` retired with `OperationsNav`/
    // `ModeBadge` (feat/rail-rollout) — `navRail.docs` (shared by AppNavRail +
    // BottomTabBar) is the one surviving primary-nav label for this surface.
    assert.equal(en.navRail.docs, 'Docs');
    assert.equal(en.nav.settingsMenu.vaultTitle, 'Ontology workspace');
    assert.equal(en.nav.settingsMenu.vaultCtaLocal, 'Open workspace');
    assert.equal(en.nav.settingsMenu.vaultCtaStatic, 'Start local workspace');
    assert.equal(en.docsVault.desktopWelcome.title, 'Open or create a local ontology workspace');
    assert.equal(en.docsVault.desktopWelcome.contractAriaLabel, 'Ontology workspace contract');
    assert.equal(en.docsVault.desktopWelcome.contractFilesLabel, 'Workspace files');
    assert.equal(en.docsVault.desktopWelcome.contractGraphValue, 'Document properties become a meaning graph');
    assert.equal(en.docsVault.desktopWelcome.contractAgentLabel, 'AI check');
    assert.equal(en.docsVault.desktopWelcome.actionsAriaLabel, 'Ontology workspace setup actions');
    assert.equal(en.docsVault.sourceContract.ariaLabel, 'Current workspace contract');
    assert.equal(en.docsVault.sourceContract.filesLabel, 'Workspace files');
    assert.equal(en.docsVault.sourceContract.graphValue, '{nodes} concepts · {edges} relations');
    assert.equal(en.docsVault.sourceContract.agentLabel, 'AI check');
    assert.equal(en.docsVault.sourceContract.agentCopyGate, 'Copy graph check');
    assert.equal(en.searchWidgets.hero.docsVault, 'Ontology workspace');
    assert.equal(en.searchWidgets.hero.openDocsVault, 'Open workspace');
    assert.equal(en.vaultWidgets.docsDrawer.eyebrow, 'Ontology workspace');
    assert.equal(en.vaultWidgets.palette.dialogAriaLabel, 'Ontology workspace palette');
    assert.doesNotMatch(
      welcomeCopy,
      /frontmatter|vault|Vault|Source Vault|source vault|Source records|source records|Graph DB|graph DB|DB proof|Agent\b|agent\b|nodes \{nodes\}|proof gate|relation_name_parity|pattern_walk|project_map/,
    );
  });



  it('keeps Korean empty ontology start state concrete and low-jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const startCopy = [
      ko.featuresMisc.starterCta.emptyAriaLabel,
      ko.featuresMisc.starterCta.emptyTitle,
      ko.featuresMisc.starterCta.emptyBodyLine1,
      ko.featuresMisc.starterCta.emptyBodyLine2,
      ko.featuresMisc.starterCta.definitionLabel,
      ko.featuresMisc.starterCta.definitionBody,
      ko.featuresMisc.starterCta.proofLocalLabel,
      ko.featuresMisc.starterCta.proofGraphLabel,
      ko.featuresMisc.starterCta.proofAgentLabel,
      ko.featuresMisc.starterCta.proofLocalBody,
      ko.featuresMisc.starterCta.proofGraphBody,
      ko.featuresMisc.starterCta.proofAgentBody,
      ko.featuresMisc.starterCta.verifyAriaLabel,
      ko.featuresMisc.starterCta.verifyStepMcp,
      ko.featuresMisc.starterCta.verifyStepCli,
      ko.featuresMisc.starterCta.copyPromptLabel,
      ko.featuresMisc.starterCta.copyCliLabel,
      ko.featuresMisc.starterCta.copyCliCopied,
      ko.featuresMisc.starterCta.copyCliFailed,
      ko.featuresMisc.starterCta.copyJsonGateLabel,
      ko.featuresMisc.starterCta.copyJsonGateCopied,
      ko.featuresMisc.starterCta.copyJsonGateFailed,
      ko.featuresMisc.starterCta.emptyCta,
      ko.featuresMisc.starterCta.secondaryTitle,
      ko.featuresMisc.starterCta.secondaryCopyTitle,
      ko.featuresMisc.starterCta.secondaryCliTitle,
      ko.featuresMisc.starterCta.secondaryLabel,
    ].join('\n');

    assert.equal(ko.featuresMisc.starterCta.emptyAriaLabel, '온톨로지 시작 시드');
    assert.equal(ko.featuresMisc.starterCta.proofLocalLabel, '로컬');
    assert.equal(ko.featuresMisc.starterCta.proofGraphLabel, '그래프 근거');
    assert.equal(ko.featuresMisc.starterCta.proofAgentLabel, 'AI 흐름');
    assert.equal(ko.featuresMisc.starterCta.copyCliLabel, '터미널 근거 복사');
    assert.equal(ko.featuresMisc.starterCta.copyJsonGateLabel, '자동화 JSON 점검 복사');
    assert.doesNotMatch(
      startCopy,
      /ontology\s*가|다음 \d+ 단계|첫 트리|ontology starter|starter|frontmatter|codebase ontology|typed relation|graph proof|agent loop|AI agent|agent 검증|CLI proof|JSON gate|fallback self-check|read-first/,
    );
  });

  it('keeps the INDEX footer agent-sync status plain (chore/copy-plainlang W5 — "에이전트 동기화"/"Agent sync" told users a mode name, not what keeps the vault fresh)', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(ko.topology.index.agentSync, 'AI가 함께 갱신 중');
    assert.equal(en.topology.index.agentSync, 'Updated with AI');
    assert.doesNotMatch(ko.topology.index.agentSync, /동기화|Agent|sync/i);
    assert.doesNotMatch(en.topology.index.agentSync, /\bsync\b/i);

    assert.equal(
      ko.topology.index.agentHandoffAria,
      'AI에게 넘길 메모 복사 (요약 · 다시 분석 요청 · 최신 상태 확인)',
    );
    assert.equal(
      en.topology.index.agentHandoffAria,
      'Copy notes for your AI agent (summary, re-check request, update check)',
    );
    assert.doesNotMatch(ko.topology.index.agentHandoffAria, /동기화 게이트|재분석 지시/);
  });

  it('keeps download/settings copy free of untranslated English nouns mixed into Korean sentences (chore/copy-plainlang W5 — "domain"/"capability"/"handoff"/"batch" left un-Koreanized inside otherwise-Korean sentences)', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const settings = ko.nav.settingsMenu;
    const mixedLanguageCopy = [
      ko.download.includeCliBody,
      settings.mcpStateDisconnectedBody,
      settings.projectIndexMeaningGate,
      settings.projectIndexEvidence,
      settings.projectIndexApply,
    ].join('\n');

    assert.equal(ko.download.includeCliBody, '그래프 컴파일 · 에이전트 핸드오프 · 성장 큐 — 터미널이 일상 진입점.');
    assert.equal(
      settings.mcpStateDisconnectedBody,
      '서버 설정이 없거나 호출 가능한 도구가 없습니다. 핸드오프를 신뢰하기 전에 설정을 고치세요.',
    );
    assert.equal(
      settings.projectIndexMeaningGate,
      '의미 게이트: 비즈니스/제품 도메인과 역량을 먼저 보고한 뒤, 코드 행은 구현 근거로 인용합니다.',
    );
    assert.equal(
      settings.projectIndexEvidence,
      '비즈니스 근거: 소스 폴더를 역량으로 보기 전에 README와 docs/ontology에서 온 meaningGate.businessOntology.evidence 행을 보고합니다.',
    );
    assert.equal(
      settings.projectIndexApply,
      '쓰기 전 사람 검토: 후보 묶음을 승인한 뒤에만 --apply를 붙입니다.',
    );
    // literal JSON field paths (meaningGate.*) and CLI flags (--apply) stay as
    // exact machine-verifiable text — only bare English *nouns* standing in
    // for untranslated Korean words are forbidden here.
    assert.doesNotMatch(
      mixedLanguageCopy.replace(/meaningGate\.[a-zA-Z.]+|--apply/g, ''),
      /\bdomain\b|\bcapability\b|\bhandoff\b|\bbatch\b|\bgrowth queue\b|\bgraph compile\b/,
    );
  });

  // (Removed 2026-07-24) The builder inspector overview-tab jargon guard was
  // deleted with the retired ERD builder — its `ontologyPages.edit.inspector`
  // namespace no longer exists.
});

async function readRoutingLocales() {
  const source = await readFile(ROUTING_FILE, 'utf8');
  const match = source.match(/locales:\s*\[([^\]]+)\]\s+as const/);
  assert.ok(match, 'routing.ts must declare locales as a literal const array');

  const locales = [...match[1].matchAll(/['"]([a-z][a-z-]*)['"]/g)].map((item) => item[1]);
  assert.ok(locales.length > 0, 'routing.ts must declare at least one locale');
  return locales;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function flattenKeys(value, prefix = '') {
  if (!isPlainObject(value)) return [prefix];

  return Object.keys(value)
    .sort()
    .flatMap((key) => flattenKeys(value[key], prefix ? `${prefix}.${key}` : key));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

it('모든 메시지가 ICU 로 컴파일된다 — 꺾쇠 태그 오파싱이 raw 키 폴백을 만들지 않게 (리텐션 P2/P4 회귀)', async () => {
  // next-intl 은 `<tag>` 를 rich-text 태그로 파싱한다. plain t() 로 소비되는
  // 메시지에 문자 그대로의 `<...>` 가 들어가면 런타임 에러 → 사용자에게
  // raw 키가 보인다 (agentConnect.manualPathHint 사고). 여기서는 전 메시지를
  // 태그 허용 모드로 컴파일해 문법 깨짐(닫히지 않은 태그·잘못된 ICU)을 잡고,
  // 태그 사용 키는 소비처가 t.rich 인지까지는 보지 않는다(별도 관례).
  const { createRequire } = await import('node:module');
  const require_ = createRequire(new URL(import.meta.url));
  const pnpmDir = (await import('node:fs')).readdirSync('node_modules/.pnpm').find((d) => d.startsWith('intl-messageformat@'));
  const { IntlMessageFormat } = require_(
    `${process.cwd()}/node_modules/.pnpm/${pnpmDir}/node_modules/intl-messageformat/index.js`,
  );
  const { readFile } = await import('node:fs/promises');
  const failures = [];
  for (const locale of ['ko', 'en']) {
    const messages = JSON.parse(await readFile(`messages/${locale}.json`, 'utf-8'));
    const walk = (obj, path) => {
      for (const [key, value] of Object.entries(obj)) {
        const p = path ? `${path}.${key}` : key;
        if (typeof value === 'string') {
          try {
            // ignoreTag 없이 컴파일 — next-intl 과 같은 태그 파싱 조건.
            new IntlMessageFormat(value, locale);
          } catch (err) {
            failures.push(`${locale}:${p} — ${err.message.split('\n')[0]}`);
          }
        } else if (value && typeof value === 'object') walk(value, p);
      }
    };
    walk(messages, '');
  }
  assert.deepEqual(failures, [], `ICU 컴파일 실패:\n${failures.join('\n')}`);
});
