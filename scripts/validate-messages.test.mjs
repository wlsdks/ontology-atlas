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
    assert.doesNotMatch(en.modeBadge.demoAriaLabelDownload, /open my markdown folder/i);
    assert.doesNotMatch(en.modeBadge.demoTooltipDownload, /open my markdown folder/i);
    assert.match(en.modeBadge.demoTooltipDownload, /install the macOS app/i);
    assert.match(ko.modeBadge.demoTooltipDownload, /macOS 앱 설치/);
    assert.match(en.modeBadge.demoAriaLabelPicker, /open a local vault folder/i);
    assert.match(en.modeBadge.demoTooltipPicker, /saving changes/i);
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

    assert.equal(ko.nav.topology, '지형도');
    assert.equal(ko.nav.docs, '저장소');
    assert.equal(ko.modeBadge.vaultLabel, '문서함');
    assert.equal(ko.modeBadge.vaultDocs, '개념 문서 {count}개');
    assert.equal(
      ko.modeBadge.vaultTooltip,
      '로컬 온톨로지 문서함 — {name} (개념 문서 {count}개). 모든 변경이 이 Mac의 폴더에 저장됩니다.',
    );
    assert.doesNotMatch(
      [
        ko.metadata.pages.docs,
        ko.nav.docs,
        ko.nav.tooltipDocs,
      ].join('\n'),
      /문서함/,
    );
    assert.doesNotMatch(
      [
        ko.modeBadge.vaultLabel,
        ko.modeBadge.vaultDocs,
        ko.modeBadge.vaultTooltip,
        ko.modeBadge.demoAriaLabelDownload,
        ko.modeBadge.demoAriaLabelPicker,
        ko.modeBadge.demoTooltip,
        ko.modeBadge.demoTooltipDownload,
        ko.modeBadge.demoTooltipPicker,
      ].join('\n'),
      /vault|Vault|온톨로지 노드|로컬 온톨로지 저장소/,
    );
    assert.equal(
      ko.nav.tooltipOntology,
      '온톨로지 — 개념·관계·변경점을 한 곳에서 확인합니다',
    );
    assert.equal(
      ko.nav.tooltipTopology,
      '지형도 — 개념 사이 연결을 공간에서 확인하고 선택 노드로 돌아갑니다',
    );
    assert.equal(
      ko.nav.tooltipDocs,
      '저장소 — 로컬 마크다운을 가이드와 온톨로지 개념으로 나눠 봅니다',
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
    assert.equal(
      ko.ontologySubNav.treeTooltip,
      '개념 지도 — 도메인, 역량, 요소를 고르고 의미와 근거를 봅니다',
    );
    assert.equal(
      ko.ontologySubNav.builderTooltip,
      '관계 편집 — 캔버스에서 개념과 관계를 고친 뒤 로컬 문서에 저장합니다',
    );
    assert.equal(
      ko.ontologySubNav.insightsTooltip,
      '그래프 검증 — MCP/CLI 쿼리로 허브, 경로, 상태를 점검합니다',
    );
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
    assert.doesNotMatch(ko.nav.tooltipTopology, /토폴로지/);
    assert.doesNotMatch(
      [
        ko.nav.tooltipDocs,
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
        ko.ontologySubNav.builderTooltip,
        ko.modeBadge.vaultLabel,
        ko.modeBadge.vaultTooltip,
        ko.modeBadge.demoTooltip,
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

  it('keeps topology overview framed as a product/system map for team inspection decisions', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(en.topology.analysis.overviewWorkOrderTitle, 'Proof order');
    assert.equal(en.topology.analysis.overviewWorkOrderRead, 'Read evidence-backed map');
    assert.equal(en.topology.analysis.overviewWorkOrderFocus, 'Focus graph handle');
    assert.equal(en.topology.analysis.overviewWorkOrderPath, 'Prove path evidence');
    assert.equal(en.topology.analysis.overviewWorkOrderHealth, 'Close health gate');
    assert.equal(en.topology.analysis.overviewHandoffSummary, 'Next step');
    assert.equal(en.topology.analysis.overviewCopyTools, 'Prepare agent handoff');
    assert.equal(en.topology.analysis.overviewReaderLensTitle, 'Reader lens');
    assert.match(en.topology.analysis.overviewReaderLensDomains, /domains/i);
    assert.match(en.topology.analysis.overviewReaderLensCapabilities, /capabilities/i);
    assert.match(en.topology.analysis.overviewReaderLensChangePaths, /agent/i);
    assert.equal(en.topology.controls.docsTooltip, 'Ontology workspace quick look (D)');
    assert.equal(
      en.topology.controls.docsAriaLabel,
      'Open ontology workspace quick look (D)',
    );
    assert.equal(en.topology.controls.docsLabel, 'Workspace');
    assert.match(en.topology.analysis.overviewPrompt, /product\/system map/i);
    assert.equal(ko.topology.analysis.overviewCopyTools, '에이전트 인계 준비');
    assert.equal(ko.topology.analysis.overviewReaderLensTitle, '읽는 순서');
    assert.match(ko.topology.analysis.overviewReaderLensDomains, /핵심 영역/);
    assert.match(ko.topology.analysis.overviewReaderLensCapabilities, /기능/);
    assert.match(ko.topology.analysis.overviewReaderLensChangePaths, /에이전트/);
    assert.match(en.topology.analysis.overviewPrompt, /domains, capabilities, and change paths/i);
    assert.match(en.topology.analysis.overviewPrompt, /team inspection and sharing/i);
    assert.doesNotMatch(en.topology.analysis.overviewPrompt, /agent handoff/i);
    assert.doesNotMatch(
      [
        en.topology.analysis.overviewWorkOrderTitle,
        en.topology.analysis.overviewWorkOrderRead,
        en.topology.analysis.overviewWorkOrderFocus,
        en.topology.analysis.overviewWorkOrderPath,
        en.topology.analysis.overviewWorkOrderHealth,
        en.topology.controls.docsTooltip,
        en.topology.controls.docsAriaLabel,
        en.topology.controls.docsLabel,
      ].join('\n'),
      /Quick view|See all|Pick one|See links|Clean up health|Source vault|source vault|^Source$/m,
    );

    assert.equal(ko.topology.analysis.overviewWorkOrderTitle, '검증 순서');
    assert.equal(ko.topology.analysis.title, '지형도 분석 모드');
    assert.equal(ko.topology.analysis.overviewWorkOrderRead, '근거 있는 지도 읽기');
    assert.equal(ko.topology.analysis.overviewWorkOrderFocus, '그래프 기준점 선택');
    assert.equal(ko.topology.analysis.overviewWorkOrderPath, '경로 근거 검증');
    assert.equal(ko.topology.analysis.overviewWorkOrderHealth, '상태 신호 확인');
    assert.equal(ko.topology.analysis.overviewHandoffSummary, '다음 단계');
    assert.equal(ko.topology.analysis.overviewCopyTools, '에이전트 인계 준비');
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
    assert.match(ko.topology.analysis.overviewPrompt, /제품\/시스템 지도/);
    assert.match(ko.topology.analysis.overviewPrompt, /영역, 기능, 변경 경로/);
    assert.match(ko.topology.analysis.overviewPrompt, /점검과 공유/);
    assert.doesNotMatch(ko.topology.analysis.overviewPrompt, /에이전트 인계/);
    assert.equal(ko.topology.controls.relayoutToast, '지형도를 다시 정렬합니다');
    assert.doesNotMatch(
      [
        ko.topology.analysis.title,
        ko.topology.analysis.overviewWorkOrderTitle,
        ko.topology.analysis.overviewWorkOrderRead,
        ko.topology.analysis.overviewWorkOrderFocus,
        ko.topology.analysis.overviewWorkOrderPath,
        ko.topology.analysis.overviewWorkOrderHealth,
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

  it('keeps Korean topology focus handoff copy readable', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const focusCopy = ko.topology.analysis;

    assert.equal(focusCopy.focusMcpCopy, '개념 점검 복사');
    assert.equal(focusCopy.focusMcpCopied, '개념 점검 복사됨');
    assert.equal(focusCopy.focusMcpImpactCopy, '영향 점검 복사');
    assert.equal(focusCopy.focusMcpImpactCopied, '영향 점검 복사됨');
    assert.equal(focusCopy.focusSyncGateCopy, '동기화 점검 복사');
    assert.equal(focusCopy.focusSyncGateCopied, '동기화 점검 복사됨');
    assert.equal(focusCopy.focusBriefCopy, '선택 브리프 복사');
    assert.equal(focusCopy.focusBriefCopied, '선택 브리프 복사됨');
    assert.equal(focusCopy.focusReviewOrderTitle, '선택 개념 검토 순서');
    assert.equal(focusCopy.focusReviewOrderProfile, '개념 브리프 읽기');
    assert.equal(focusCopy.focusReviewOrderImpact, '들어오는 영향 추적');
    assert.equal(focusCopy.focusReviewOrderSync, '동기화 점검 실행');
    assert.equal(focusCopy.focusMcpCopyAriaLabel, '지형도 선택 개념 점검 복사');
    assert.equal(focusCopy.focusMcpImpactCopyAriaLabel, '지형도 선택 개념 영향 점검 복사');
    assert.equal(focusCopy.focusSyncGateCopyAriaLabel, '지형도 선택 개념 수정 후 동기화 점검 복사');
    assert.equal(focusCopy.focusBriefCopyAriaLabel, '지형도 선택 개념 검토 브리프 복사');
    assert.equal(focusCopy.focusBriefCopiedAriaLabel, '지형도 선택 개념 검토 브리프 복사됨');
    assert.equal(focusCopy.focusBriefTitle, '지형도 선택 개념 검토');
    assert.equal(focusCopy.focusBriefOntologyUrl, '개념 문서 URL');
    assert.equal(focusCopy.focusBriefReviewFocus, '검토 URL');
    assert.equal(focusCopy.focusBriefAgentCheck, '에이전트 점검');
    assert.equal(focusCopy.focusBriefImpactCheck, '영향 점검');
    assert.equal(focusCopy.focusBriefMcpImpactCheck, 'MCP 영향 점검');
    assert.equal(focusCopy.focusBriefSyncGate, '수정 후 동기화 점검');

    assert.doesNotMatch(
      [
        focusCopy.focusMcpCopy,
        focusCopy.focusMcpCopied,
        focusCopy.focusMcpImpactCopy,
        focusCopy.focusMcpImpactCopied,
        focusCopy.focusSyncGateCopy,
        focusCopy.focusSyncGateCopied,
        focusCopy.focusBriefCopy,
        focusCopy.focusBriefCopied,
        focusCopy.focusReviewOrderTitle,
        focusCopy.focusReviewOrderProfile,
        focusCopy.focusReviewOrderImpact,
        focusCopy.focusReviewOrderSync,
        focusCopy.focusMcpCopyAriaLabel,
        focusCopy.focusMcpImpactCopyAriaLabel,
        focusCopy.focusSyncGateCopyAriaLabel,
        focusCopy.focusBriefCopyAriaLabel,
        focusCopy.focusBriefCopiedAriaLabel,
        focusCopy.focusBriefTitle,
        focusCopy.focusBriefOntologyUrl,
        focusCopy.focusBriefReviewFocus,
        focusCopy.focusBriefAgentCheck,
        focusCopy.focusBriefImpactCheck,
        focusCopy.focusBriefMcpImpactCheck,
        focusCopy.focusBriefSyncGate,
      ].join('\n'),
      /토폴로지|Topology|focus|profile|impact|sync gate|Review URL|Ontology URL|Agent 점검|Impact 점검/,
    );
  });

  it('keeps English topology focus and path copy labels mode-specific', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const copy = en.topology.analysis;

    assert.equal(copy.focusBriefCopy, 'Copy focus brief');
    assert.equal(copy.focusBriefCopied, 'Focus brief copied');
    assert.equal(copy.pathEvidenceCopy, 'Copy path evidence');
    assert.equal(copy.pathEvidenceCopied, 'Path evidence copied');
    assert.notEqual(copy.focusBriefCopy, copy.pathEvidenceCopy);
    assert.notEqual(copy.focusBriefCopied, copy.pathEvidenceCopied);
  });


  it('keeps Korean topology health handoff copy readable', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const enHealthCopy = en.topology.analysis;
    const healthCopy = ko.topology.analysis;

    assert.equal(enHealthCopy.healthMcpCopy, 'Copy health check');
    assert.equal(enHealthCopy.healthMcpImpactCopy, 'Copy health impact');
    assert.equal(enHealthCopy.healthSyncGateCopy, 'Copy health sync');
    assert.equal(healthCopy.healthCopy, '근거 복사');
    assert.equal(healthCopy.healthOpenOntology, '개념 문서');
    assert.equal(healthCopy.healthRepair, '관계 편집');
    assert.equal(healthCopy.healthCopyTools, '점검 복사 도구');
    assert.equal(healthCopy.healthMcpCopy, 'MCP 상태 점검 복사');
    assert.equal(healthCopy.healthMcpCopied, 'MCP 상태 점검 복사됨');
    assert.equal(healthCopy.healthMcpImpactCopy, 'MCP 영향 점검 복사');
    assert.equal(healthCopy.healthMcpImpactCopied, 'MCP 영향 점검 복사됨');
    assert.equal(healthCopy.healthSyncGateCopy, '동기화 점검 복사');
    assert.equal(healthCopy.healthSyncGateCopied, '동기화 점검 복사됨');
    assert.equal(healthCopy.healthRepairOrderSync, '동기화 점검 실행');
    assert.equal(healthCopy.healthMcpCopyAriaLabel, '지형도 상태 MCP 점검 복사');
    assert.equal(healthCopy.healthMcpImpactCopyAriaLabel, '지형도 상태 MCP 영향 점검 복사');
    assert.equal(healthCopy.healthSyncGateCopyAriaLabel, '지형도 상태 수리 후 동기화 점검 복사');
    assert.equal(healthCopy.healthCopyAriaLabel, '지형도 상태 점검 근거 복사');
    assert.equal(healthCopy.healthEvidenceTitle, '지형도 상태 점검 근거');
    assert.equal(healthCopy.healthEvidenceOntologyUrl, '개념 문서 URL');
    assert.equal(healthCopy.healthStale, '오래된 근거');
    assert.equal(healthCopy.healthOrphan, '소속 미정');
    assert.equal(healthCopy.healthPromotion, '상위 개념 후보');
    assert.equal(healthCopy.healthEvidenceActionKindStale, healthCopy.healthStale);
    assert.equal(healthCopy.healthEvidenceActionKindOrphan, healthCopy.healthOrphan);
    assert.equal(healthCopy.healthEvidenceActionKindPromotion, healthCopy.healthPromotion);
    assert.equal(healthCopy.healthEvidenceAgentCheck, '에이전트 점검');
    assert.equal(healthCopy.healthEvidenceRelationPreflight, '소유 관계 사전 점검');
    assert.equal(healthCopy.healthEvidenceMcpRelationPreflight, 'MCP 소유 관계 사전 점검');
    assert.equal(healthCopy.healthEvidenceImpactCheck, '영향 점검');
    assert.equal(healthCopy.healthEvidenceMcpImpactCheck, 'MCP 영향 점검');
    assert.equal(healthCopy.healthEvidenceSyncGate, '수리 후 동기화 점검');

    assert.doesNotMatch(
      [
        healthCopy.healthCopy,
        healthCopy.healthOpenOntology,
        healthCopy.healthRepair,
        healthCopy.healthCopyTools,
        healthCopy.healthMcpCopy,
        healthCopy.healthMcpCopied,
        healthCopy.healthMcpImpactCopy,
        healthCopy.healthMcpImpactCopied,
        healthCopy.healthSyncGateCopy,
        healthCopy.healthSyncGateCopied,
        healthCopy.healthRepairOrderSync,
        healthCopy.healthMcpCopyAriaLabel,
        healthCopy.healthMcpImpactCopyAriaLabel,
        healthCopy.healthSyncGateCopyAriaLabel,
        healthCopy.healthCopyAriaLabel,
        healthCopy.healthEvidenceTitle,
        healthCopy.healthEvidenceOntologyUrl,
        healthCopy.healthStale,
        healthCopy.healthOrphan,
        healthCopy.healthPromotion,
        healthCopy.healthEvidenceAgentCheck,
        healthCopy.healthEvidenceRelationPreflight,
        healthCopy.healthEvidenceMcpRelationPreflight,
        healthCopy.healthEvidenceImpactCheck,
        healthCopy.healthEvidenceMcpImpactCheck,
        healthCopy.healthEvidenceSyncGate,
      ].join('\n'),
      /토폴로지 health|Topology health|Ontology URL|impact|sync gate|Agent 점검|preflight|위치 없음|승격|^문서$|^수정$/m,
    );
  });

  it('keeps Korean topology path handoff copy readable', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const pathCopy = ko.topology.analysis;

    assert.equal(pathCopy.pathEvidenceCopy, '경로 근거 복사');
    assert.equal(pathCopy.pathEvidenceCopied, '경로 근거 복사됨');
    assert.equal(pathCopy.pathEvidenceCopyAriaLabel, '지형도 경로 근거 복사');
    assert.equal(pathCopy.pathMcpCopy, 'MCP 경로 점검 복사');
    assert.equal(pathCopy.pathMcpCopied, 'MCP 경로 점검 복사됨');
    assert.equal(pathCopy.pathMcpCopyAriaLabel, '지형도 경로 MCP 점검 복사');
    assert.equal(pathCopy.pathRelationPreflightCopy, '관계 사전 점검 복사');
    assert.equal(pathCopy.pathRelationPreflightCopied, '관계 사전 점검 복사됨');
    assert.equal(pathCopy.pathRelationPreflightCopyAriaLabel, '지형도 경로 관계 사전 점검 복사');
    assert.equal(pathCopy.pathExplainRelationCopy, '관계 설명 복사');
    assert.equal(pathCopy.pathExplainRelationCopied, '관계 설명 복사됨');
    assert.equal(pathCopy.pathExplainRelationCopyAriaLabel, '지형도 경로 관계 설명 점검 복사');
    assert.equal(pathCopy.pathAllPathsPlanCopy, '전체 경로 계획 복사');
    assert.equal(pathCopy.pathAllPathsPlanCopied, '전체 경로 계획 복사됨');
    assert.equal(pathCopy.pathAllPathsPlanCopyAriaLabel, '지형도 전체 경로 계획 복사');
    assert.equal(pathCopy.pathAllPathsCopy, '전체 경로 실행 복사');
    assert.equal(pathCopy.pathAllPathsCopied, '전체 경로 실행 복사됨');
    assert.equal(pathCopy.pathAllPathsCopyAriaLabel, '지형도 전체 경로 실행 점검 복사');
    assert.equal(pathCopy.pathProofOrderTitle, '경로 검증 순서');
    assert.equal(
      pathCopy.pathProofOrderDesc,
      '두 노드 사이의 경로와 필요한 점검 순서를 함께 보여줍니다.',
    );
    assert.equal(pathCopy.pathProofChecklist, '검증 순서');
    assert.equal(pathCopy.pathProofVisiblePath, '화면에 보이는 경로');
    assert.equal(pathCopy.pathProofRelationPreflight, '관계 방향 확인');
    assert.equal(pathCopy.pathProofExplainRelation, '연결 이유 설명');
    assert.equal(pathCopy.pathProofBoundedTraversal, '다른 경로 비교');
    assert.equal(pathCopy.pathProofPostWriteSync, '수정 후 동기화');
    assert.equal(pathCopy.pathProofStatusReady, '준비됨');
    assert.equal(pathCopy.pathProofStatusRequired, '필수');
    assert.equal(pathCopy.pathProofStatusAfterWrite, '수정 후');
    assert.equal(pathCopy.pathEvidenceTitle, '지형도 경로 근거');
    assert.equal(pathCopy.pathEvidenceUrl, '경로 화면 URL');
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
        pathCopy.pathEvidenceCopy,
        pathCopy.pathEvidenceCopied,
        pathCopy.pathEvidenceCopyAriaLabel,
        pathCopy.pathMcpCopy,
        pathCopy.pathMcpCopied,
        pathCopy.pathMcpCopyAriaLabel,
        pathCopy.pathRelationPreflightCopy,
        pathCopy.pathRelationPreflightCopied,
        pathCopy.pathRelationPreflightCopyAriaLabel,
        pathCopy.pathExplainRelationCopy,
        pathCopy.pathExplainRelationCopied,
        pathCopy.pathExplainRelationCopyAriaLabel,
        pathCopy.pathAllPathsPlanCopy,
        pathCopy.pathAllPathsPlanCopied,
        pathCopy.pathAllPathsPlanCopyAriaLabel,
        pathCopy.pathAllPathsCopy,
        pathCopy.pathAllPathsCopied,
        pathCopy.pathAllPathsCopyAriaLabel,
        pathCopy.pathProofOrderTitle,
        pathCopy.pathProofOrderDesc,
        pathCopy.pathProofChecklist,
        pathCopy.pathProofVisiblePath,
        pathCopy.pathProofRelationPreflight,
        pathCopy.pathProofExplainRelation,
        pathCopy.pathProofBoundedTraversal,
        pathCopy.pathProofPostWriteSync,
        pathCopy.pathProofStatusReady,
        pathCopy.pathProofStatusRequired,
        pathCopy.pathProofStatusAfterWrite,
        pathCopy.pathEvidenceTitle,
        pathCopy.pathEvidenceUrl,
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
      /토폴로지|Topology|path|Path|Relation|relation|ontology URL|Ontology URL|preflight|explain_relation|all_paths|sync gate|evidence|ready|required|after write|write 후/,
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
      en.nav.docs,
      en.nav.tooltipDocs,
      en.nav.settingsMenu.triggerTitle,
      en.nav.settingsMenu.subtitle,
      en.nav.settingsMenu.tabVaultDesc,
      en.nav.settingsMenu.vaultTitle,
      en.nav.settingsMenu.vaultBodyLocal,
      en.nav.settingsMenu.vaultBodyStatic,
      en.nav.settingsMenu.vaultCtaLocal,
      en.nav.settingsMenu.vaultCtaStatic,
      en.modeBadge.vaultLabel,
      en.modeBadge.vaultTooltip,
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
    assert.equal(en.nav.docs, 'Workspace');
    assert.equal(en.nav.tooltipDocs, 'Workspace — separate guide docs from ontology concepts');
    assert.equal(en.nav.settingsMenu.vaultTitle, 'Ontology workspace');
    assert.equal(en.nav.settingsMenu.vaultCtaLocal, 'Open workspace');
    assert.equal(en.nav.settingsMenu.vaultCtaStatic, 'Start local workspace');
    assert.equal(en.modeBadge.vaultLabel, 'Workspace');
    assert.equal(
      en.modeBadge.vaultTooltip,
      'Workspace mode — {name} ({count} documents). Every change is saved to your local disk.',
    );
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
