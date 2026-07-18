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

    assert.equal(en.download.primaryCta, 'Open macOS releases');
    assert.equal(en.download.sourceCta, 'View source code');
    assert.match(ko.download.primaryCta, /릴리스 열기/);
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
    // `modeBadge.*` retired with `OperationsNav`/`ModeBadge` (feat/rail-rollout
    // — the vault/demo chip that lived in the old top nav's right cluster has
    // no rail-era replacement; `AppSettingsMenu`'s vault tab + the builder/
    // ontologyView demo-mode copy below cover the same "install the macOS
    // app" / "pick a local vault folder" guidance).
    assert.doesNotMatch(en.ontologyPages.edit.page.toastDemoModeDownload, /\/docs|open a markdown folder/i);
    assert.doesNotMatch(en.ontologyPages.edit.page.toastVaultEdgeDemoDownload, /\/docs|open a vault folder/i);
    assert.match(en.ontologyPages.edit.page.toastDemoModeDownload, /install the macOS app/i);
    assert.match(en.ontologyPages.edit.inspector.vaultFooterReadOnlyDownload, /install the macOS app/i);
    assert.match(en.ontologyPages.edit.onboarding.stepSaveBodyDownload, /install the macOS app/i);
    assert.doesNotMatch(en.ontologyPages.edit.onboarding.stepConnectBody, /save automatically/i);
    assert.match(en.ontologyPages.edit.onboarding.stepConnectBody, /write preview and preflight first/i);
    assert.match(en.ontologyPages.edit.onboarding.stepConnectBody, /choose the relation key, then save/i);
    assert.match(en.ontologyPages.edit.page.toastDemoModePicker, /local vault folder/i);
    assert.match(en.ontologyPages.edit.inspector.vaultFooterReadOnlyPicker, /local vault folder/i);
    assert.match(en.ontologyPages.edit.onboarding.stepSaveBodyPicker, /top-right demo badge/i);
    assert.match(ko.ontologyPages.edit.page.toastDemoModeDownload, /macOS 앱 설치/);
    assert.match(ko.ontologyPages.edit.inspector.vaultFooterReadOnlyDownload, /macOS 앱/);
    assert.doesNotMatch(ko.ontologyPages.edit.onboarding.stepConnectBody, /자동 저장/);
    assert.match(ko.ontologyPages.edit.onboarding.stepConnectBody, /미리보기와 사전 점검/);
    assert.match(ko.ontologyPages.edit.onboarding.stepConnectBody, /관계 종류를 고른 뒤 저장/);
    assert.match(en.ontologyView.getStarted.stepStaticVaultDescDownload, /hosted browser is read-only/i);
    assert.match(en.ontologyView.getStarted.stepStaticVaultDescDownload, /install the macOS app/i);
    assert.match(en.ontologyView.getStarted.stepStaticVaultDescPicker, /local vault folder/i);
    assert.match(en.ontologyView.getStarted.ctaVaultOpenDownload, /Download macOS app/i);
    assert.match(en.topology.empty.bodyNoProjectsDownload, /Install the macOS app/i);
    assert.match(en.topology.empty.ctaOpenVaultDownload, /Download macOS app/i);
    assert.match(ko.ontologyView.getStarted.stepStaticVaultDescDownload, /macOS 앱/);
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
    assert.equal(ko.navRail.builder, '빌더');
    assert.equal(ko.navRail.insights, '인사이트');
    assert.equal(ko.navRail.projects, '프로젝트');
    assert.doesNotMatch(
      [ko.navRail.map, ko.navRail.docs, ko.navRail.builder, ko.navRail.insights, ko.navRail.projects].join('\n'),
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
    assert.equal(ko.topologyWidgets.controls.depthHop, '{count}단계');
    assert.equal(ko.topologyWidgets.controls.shortcutDepthAll, '연결 범위 전체');
    assert.equal(ko.topologyWidgets.controls.shortcutDoubleClick, '로컬 그래프 진입');
    assert.equal(ko.topologyWidgets.controls.shortcutEsc, '로컬 그래프 나가기 / 검색 지우기');
    assert.equal(ko.topology.analysis.overviewAgentReadiness, '에이전트 인계');
    assert.equal(ko.topology.analysis.overviewAgentReadinessReady, '인계 가능');
    assert.equal(ko.topology.analysis.overviewAgentReadinessPreflight, '사전 점검');
    assert.doesNotMatch(
      [
        ko.topologyWidgets.controls.depthHop,
        ko.topologyWidgets.controls.shortcutDepthAll,
        ko.topologyWidgets.controls.shortcutDoubleClick,
        ko.topologyWidgets.controls.shortcutEsc,
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

  it('keeps Korean sigma path overlay copy readable', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const pathCopy = ko.topologyWidgets.sigma;

    assert.equal(pathCopy.pathCopy, '경로 근거');
    assert.equal(pathCopy.pathMcpCopy, 'MCP 경로');
    assert.equal(pathCopy.pathRelationPreflightCopy, '관계 사전 점검');
    assert.equal(pathCopy.pathExplainRelationCopy, '관계 설명');
    assert.equal(pathCopy.pathAllPathsPlanCopy, '전체 경로 계획');
    assert.equal(pathCopy.pathAllPathsCopy, '전체 경로 실행');
    assert.equal(pathCopy.pathRelationPreflightCopyAriaLabel, '경로 관계 사전 점검 복사');
    assert.equal(pathCopy.pathExplainRelationCopyAriaLabel, '경로 관계 설명 점검 복사');
    assert.equal(pathCopy.pathAllPathsPlanCopyAriaLabel, '전체 경로 계획 복사');
    assert.equal(pathCopy.pathAllPathsCopyAriaLabel, '전체 경로 실행 점검 복사');
    assert.equal(pathCopy.pathEvidenceTitle, '지형도 경로 근거');
    assert.equal(pathCopy.pathEvidenceSourceOntologyUrl, '시작점 개념 문서 URL');
    assert.equal(pathCopy.pathEvidenceTargetOntologyUrl, '대상 개념 문서 URL');
    assert.equal(pathCopy.pathEvidenceRelationPreflightReason, '관계 사전 점검 이유');
    assert.equal(pathCopy.pathEvidenceRelationPreflightMcpCheck, 'MCP 관계 사전 점검');
    assert.equal(pathCopy.pathEvidenceExplainRelationMcpCheck, 'MCP 관계 설명 점검');
    assert.equal(pathCopy.pathEvidenceAllPathsPlanMcpCheck, 'MCP 전체 경로 계획');
    assert.equal(pathCopy.pathEvidenceAllPathsMcpCheck, 'MCP 전체 경로 점검');
    assert.equal(pathCopy.pathEvidenceAllPathsCopyInstruction, '전체 경로 근거 계약');
    assert.equal(pathCopy.pathEvidencePostWriteSyncGate, '수정 후 동기화 점검');

    assert.doesNotMatch(
      [
        pathCopy.pathCopy,
        pathCopy.pathMcpCopy,
        pathCopy.pathRelationPreflightCopy,
        pathCopy.pathExplainRelationCopy,
        pathCopy.pathAllPathsPlanCopy,
        pathCopy.pathAllPathsCopy,
        pathCopy.pathRelationPreflightCopyAriaLabel,
        pathCopy.pathExplainRelationCopyAriaLabel,
        pathCopy.pathAllPathsPlanCopyAriaLabel,
        pathCopy.pathAllPathsCopyAriaLabel,
        pathCopy.pathEvidenceTitle,
        pathCopy.pathEvidenceSourceOntologyUrl,
        pathCopy.pathEvidenceTargetOntologyUrl,
        pathCopy.pathEvidenceRelationPreflightReason,
        pathCopy.pathEvidenceRelationPreflightMcpCheck,
        pathCopy.pathEvidenceExplainRelationMcpCheck,
        pathCopy.pathEvidenceAllPathsPlanMcpCheck,
        pathCopy.pathEvidenceAllPathsMcpCheck,
        pathCopy.pathEvidenceAllPathsCopyInstruction,
        pathCopy.pathEvidencePostWriteSyncGate,
      ].join('\n'),
      /Path mode|Preflight|Explain|Plan|Node ID|all_paths|explain_relation|preflight|evidence|sync gate|bounded|Traversal completeness|ontology URL|Ontology URL|graph /,
    );
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
    assert.equal(docsUi.parts.empty.selectPrompt, '문서 목록에서 항목을 선택하세요');
    assert.equal(docsUi.tree.navAria, '문서 목록');
    assert.doesNotMatch(header.back, /워크스페이스|토폴로지/);
    assert.doesNotMatch(header.backToWorkspaceAriaLabel, /워크스페이스|토폴로지/);
    assert.doesNotMatch(
      [
        header.openTreeTitle,
        header.openTreeAriaLabel,
        docsUi.parts.sidebar.treeHeader,
        docsUi.parts.sidebar.searchLabel,
        docsUi.parts.empty.selectPrompt,
        docsUi.tree.navAria,
      ].join('\n'),
      /문서 기록|기록 찾기/,
    );
    assert.equal(commands.sourceServer, '샘플 문서함 보기');
    assert.equal(commands.sourceLocal, '내 PC 문서함 열기');
    assert.equal(commands.viewFolderTopology, '뷰 · 프로젝트 지형도 (projects/*.md)');
    assert.equal(commands.scaffoldTopology, '이 폴더를 지형도용 볼트로 초기화');
    assert.doesNotMatch(commands.sourceServer, /소스|Source/);
    assert.doesNotMatch(commands.sourceLocal, /소스|Source/);
    assert.doesNotMatch(commands.viewFolderTopology, /Topology|토폴로지/);
    assert.doesNotMatch(commands.scaffoldTopology, /Topology|토폴로지/);
  });

  it('keeps Korean ontology concept link copy states explicit', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const copyLink = ko.ontologyView.copyLink;

    assert.equal(copyLink.ariaCopy, '개념 링크 복사');
    assert.equal(copyLink.ariaCopied, '개념 링크 복사됨');
    assert.equal(copyLink.badge, '복사됨');
    assert.notEqual(copyLink.ariaCopy, copyLink.badge);
  });

  it('keeps Korean builder relation write confirmation readable before graph writes', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const relationConfirm = ko.ontologyPages.edit.page.relationConfirm;
    const decisions = relationConfirm.decisions;
    const copy = [
      relationConfirm.body,
      relationConfirm.inferredKey,
      relationConfirm.alternatives,
      relationConfirm.writeBoundaryValue,
      relationConfirm.writeKey,
      relationConfirm.writeMeaning,
      relationConfirm.writeFrontmatterPatch,
      relationConfirm.mcpWriteArgs,
      relationConfirm.mcpWritePolicy,
      relationConfirm.mcpWritePolicyReady,
      relationConfirm.mcpWritePolicyBlocked,
      relationConfirm.graphRelation,
      relationConfirm.graphSurfacesValue,
      relationConfirm.graphAlternativeWarning,
      relationConfirm.saveChecklistSelectedKey,
      relationConfirm.saveChecklistPreflight,
      relationConfirm.saveChecklistTraversal,
      relationConfirm.preflight,
      relationConfirm.preflightExact,
      relationConfirm.preflightInverse,
      relationConfirm.preflightActionSafe,
      relationConfirm.preflightActionReview,
      relationConfirm.preflightActionBlocked,
      relationConfirm.traversalCheck,
      relationConfirm.traversalCheckBody,
      relationConfirm.traversalContract,
      relationConfirm.traversalContractBody,
      relationConfirm.agentCheck,
      relationConfirm.copyCliPreflight,
      relationConfirm.copyCliPreflightCopied,
      relationConfirm.copyMcpPreflight,
      relationConfirm.copyMcpPreflightCopied,
      relationConfirm.copyMcpWrite,
      relationConfirm.copyMcpWriteCopied,
      decisions.safeToAdd.hint,
      decisions.skipExisting.hint,
      decisions.reviewInverse.hint,
      decisions.reviewPath.hint,
    ].join('\n');

    assert.match(relationConfirm.body, /문서 속성/);
    assert.equal(relationConfirm.writeFrontmatterPatch, '문서 속성 변경');
    assert.equal(relationConfirm.mcpWritePolicy, 'MCP 저장 정책');
    assert.equal(relationConfirm.saveChecklistPreflight, '관계 사전 점검 결과');
    assert.equal(relationConfirm.saveChecklistTraversal, '전체 경로 근거');
    assert.equal(relationConfirm.preflight, '사전 점검');
    assert.equal(relationConfirm.traversalCheck, '전체 경로 완결성');
    assert.equal(relationConfirm.traversalContract, '근거 기준');
    assert.equal(relationConfirm.copyCliPreflight, 'CLI 사전 점검 복사');
    assert.equal(relationConfirm.copyMcpPreflight, 'MCP 사전 점검 복사');
    assert.equal(relationConfirm.copyMcpWrite, 'MCP 저장 복사');
    assert.match(decisions.skipExisting.hint, /시작 노드의 문서 속성/);
    const visibleCopy = copy.replace(/\{[^}]+\}/g, '').replace(/`[^`]+`/g, '');

    assert.doesNotMatch(
      visibleCopy,
      /frontmatter|source|target|Preflight|preflight|Traversal|Evidence|edge|relation label|relation 이|relation_check|bounded all_paths|direct MCP write|MCP write|read 점검|graph 의미|graph 안|review packet|write 근거|path 를|key\b|meaning|args|patch|topology|impact|Agent 점검/,
    );
  });

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
      ko.ontologyView.emptyHint,
      ko.ontologyView.getStarted.headingLocal,
      ko.ontologyView.getStarted.headingDefault,
      ko.ontologyView.getStarted.bodyLocal,
      ko.ontologyView.getStarted.bodyDefault,
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

    assert.match(ko.ontologyView.emptyHint, /kind 가 있는 \.md/);
    assert.match(ko.ontologyView.getStarted.bodyLocal, /활성 문서함/);
    assert.match(ko.ontologyView.getStarted.bodyDefault, /로컬 문서함/);
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
