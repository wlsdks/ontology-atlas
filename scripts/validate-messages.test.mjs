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

  it('keeps topology overview framed as ontology proof and agent handoff', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(en.topology.analysis.overviewWorkOrderTitle, 'Proof order');
    assert.equal(en.topology.analysis.overviewWorkOrderRead, 'Read source-backed map');
    assert.equal(en.topology.analysis.overviewWorkOrderFocus, 'Focus graph handle');
    assert.equal(en.topology.analysis.overviewWorkOrderPath, 'Prove path evidence');
    assert.equal(en.topology.analysis.overviewWorkOrderHealth, 'Close health gate');
    assert.equal(en.topology.controls.docsTooltip, 'Ontology workspace quick look (D)');
    assert.equal(
      en.topology.controls.docsAriaLabel,
      'Open ontology workspace quick look (D)',
    );
    assert.equal(en.topology.controls.docsLabel, 'Workspace');
    assert.match(en.topology.analysis.overviewPrompt, /source-backed ontology map/i);
    assert.match(en.topology.analysis.overviewPrompt, /agent handoff/i);
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
    assert.equal(ko.topology.analysis.overviewWorkOrderRead, '근거 있는 지형도 읽기');
    assert.equal(ko.topology.analysis.overviewWorkOrderFocus, '그래프 기준점 선택');
    assert.equal(ko.topology.analysis.overviewWorkOrderPath, '경로 근거 검증');
    assert.equal(ko.topology.analysis.overviewWorkOrderHealth, '상태 신호 확인');
    assert.equal(ko.topology.analysis.overviewBriefCopyAriaLabel, '지형도 검증 요약 복사');
    assert.equal(ko.topology.analysis.overviewBriefCopiedAriaLabel, '지형도 검증 요약 복사됨');
    assert.equal(ko.topology.analysis.overviewBriefTitle, '지형도 검증 요약');
    assert.equal(ko.topology.analysis.overviewBriefHealthSignals, '상태 신호');
    assert.equal(ko.topology.analysis.overviewBriefHealthUrl, '상태 점검 URL');
    assert.equal(ko.topology.analysis.overviewBriefInsightsUrl, '연결·검증 URL');
    assert.equal(ko.topology.analysis.overviewBriefAgentCheck, '에이전트 overview 점검');
    assert.equal(ko.topology.controls.docsTooltip, '온톨로지 워크스페이스 빠른 보기 (D)');
    assert.equal(
      ko.topology.controls.docsAriaLabel,
      '온톨로지 워크스페이스 빠른 보기 열기 (D)',
    );
    assert.equal(ko.topology.controls.docsLabel, '작업공간');
    assert.match(ko.topology.analysis.overviewPrompt, /근거 있는 온톨로지 지형도/);
    assert.match(ko.topology.analysis.overviewPrompt, /에이전트 인계/);
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
        ko.topology.controls.relayoutToast,
        ko.topology.controls.docsTooltip,
        ko.topology.controls.docsAriaLabel,
        ko.topology.controls.docsLabel,
      ].join('\n'),
      /전체 보기|하나 선택|연결 보기|상태 정리|문서함|^문서$|토폴로지|Topology|overview brief|Health 신호/m,
    );
  });

  it('keeps Korean topology focus handoff copy readable', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const focusCopy = ko.topology.analysis;

    assert.equal(focusCopy.focusMcpCopy, 'MCP 노드 점검 복사');
    assert.equal(focusCopy.focusMcpCopied, 'MCP 노드 점검 복사됨');
    assert.equal(focusCopy.focusMcpImpactCopy, 'MCP 영향 점검 복사');
    assert.equal(focusCopy.focusMcpImpactCopied, 'MCP 영향 점검 복사됨');
    assert.equal(focusCopy.focusSyncGateCopy, '동기화 점검 복사');
    assert.equal(focusCopy.focusSyncGateCopied, '동기화 점검 복사됨');
    assert.equal(focusCopy.focusBriefCopy, '선택 브리프 복사');
    assert.equal(focusCopy.focusBriefCopied, '선택 브리프 복사됨');
    assert.equal(focusCopy.focusReviewOrderTitle, '선택 개념 검토 순서');
    assert.equal(focusCopy.focusReviewOrderProfile, '노드 정보 읽기');
    assert.equal(focusCopy.focusReviewOrderImpact, '들어오는 영향 추적');
    assert.equal(focusCopy.focusReviewOrderSync, '동기화 점검 실행');
    assert.equal(focusCopy.focusMcpCopyAriaLabel, '지형도 선택 개념 MCP 노드 점검 복사');
    assert.equal(focusCopy.focusMcpImpactCopyAriaLabel, '지형도 선택 개념 MCP 영향 점검 복사');
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

  it('keeps Korean topology drawer handoff copy readable', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const drawerCopy = ko.topology.ontologyDrawer;

    assert.equal(drawerCopy.caption, '개념 정보');
    assert.equal(
      drawerCopy.collaboratorBody,
      '기획, 마케팅, 도메인 리뷰, AI 에이전트 전달에서 같이 쓰는 공유 어휘로 읽습니다.',
    );
    assert.equal(drawerCopy.openBuilder, '관계 편집');
    assert.equal(drawerCopy.collaboratorCopyCliProfile, 'CLI 노드 점검 복사');
    assert.equal(drawerCopy.collaboratorCopyMcpProfile, 'MCP 노드 점검 복사');
    assert.equal(drawerCopy.collaboratorCopyCliImpact, 'CLI 영향 점검 복사');
    assert.equal(drawerCopy.collaboratorCopyMcpImpact, 'MCP 영향 점검 복사');
    assert.equal(drawerCopy.collaboratorCopySyncGate, '동기화 점검 복사');
    assert.equal(drawerCopy.collaboratorBriefHandoff, '전달');
    assert.equal(drawerCopy.collaboratorBriefTopology, '지형도');
    assert.equal(drawerCopy.collaboratorBriefAgentCheck, '에이전트 점검');
    assert.equal(drawerCopy.collaboratorBriefSyncGate, '수정 후 동기화 점검');
    assert.equal(drawerCopy.collaboratorHandoffOrderTitle, '그래프 전달 순서');
    assert.equal(
      drawerCopy.collaboratorHandoffProfileStep,
      '언어나 범위를 바꾸기 전에 선택 개념의 노드 정보를 먼저 확인합니다.',
    );
    assert.equal(
      drawerCopy.collaboratorHandoffImpactStep,
      '리뷰 전에 들어오는 영향 범위를 추적해 의존 대상을 보이게 합니다.',
    );
    assert.equal(
      drawerCopy.collaboratorHandoffSyncStep,
      '실제 변경 후에는 공유 온톨로지 동기화 점검을 실행합니다.',
    );
    assert.equal(
      drawerCopy.collaboratorReview.traceImpact,
      '리뷰: 메시지, 범위, 구현을 바꾸기 전에 양방향 영향을 추적하세요.',
    );
    assert.equal(drawerCopy.collaboratorChip.impact, '영향 추적');

    assert.doesNotMatch(
      [
        drawerCopy.collaboratorBody,
        drawerCopy.openBuilder,
        drawerCopy.collaboratorCopyCliProfile,
        drawerCopy.collaboratorCopyMcpProfile,
        drawerCopy.collaboratorCopyCliImpact,
        drawerCopy.collaboratorCopyMcpImpact,
        drawerCopy.collaboratorCopySyncGate,
        drawerCopy.collaboratorBriefHandoff,
        drawerCopy.collaboratorBriefTopology,
        drawerCopy.collaboratorBriefAgentCheck,
        drawerCopy.collaboratorBriefSyncGate,
        drawerCopy.collaboratorHandoffOrderTitle,
        drawerCopy.collaboratorHandoffProfileStep,
        drawerCopy.collaboratorHandoffImpactStep,
        drawerCopy.collaboratorHandoffSyncStep,
        drawerCopy.collaboratorReview.traceImpact,
        drawerCopy.collaboratorChip.impact,
        drawerCopy.caption,
      ].join('\n'),
      /profile|impact|sync gate|Agent 점검|선택한 노드|agent handoff|Handoff|Graph handoff|incoming|토폴로지/,
    );
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
    assert.equal(pathCopy.pathProofChecklist, '검증 순서');
    assert.equal(pathCopy.pathProofVisiblePath, '화면에 보이는 경로');
    assert.equal(pathCopy.pathProofRelationPreflight, '관계 사전 점검');
    assert.equal(pathCopy.pathProofExplainRelation, '관계 설명 맥락');
    assert.equal(pathCopy.pathProofBoundedTraversal, '전체 경로 계획');
    assert.equal(pathCopy.pathProofPostWriteSync, '수정 후 동기화 점검');
    assert.equal(pathCopy.pathProofStatusReady, '준비됨');
    assert.equal(pathCopy.pathProofStatusRequired, '필수');
    assert.equal(pathCopy.pathProofStatusAfterWrite, '수정 후');
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

    assert.equal(pathCopy.pathStartBadge, '경로');
    assert.equal(pathCopy.pathStartTitle, '경로 모드');
    assert.match(pathCopy.pathStartBody, /시작 노드/);
    assert.doesNotMatch(pathCopy.pathStartBody, /Path mode|Shift/);
    assert.equal(pathCopy.pathCopy, '경로 근거');
    assert.equal(pathCopy.pathMcpCopy, 'MCP 경로');
    assert.equal(pathCopy.pathRelationPreflightCopy, '관계 사전 점검');
    assert.equal(pathCopy.pathExplainRelationCopy, '관계 설명');
    assert.equal(pathCopy.pathAllPathsPlanCopy, '전체 경로 계획');
    assert.equal(pathCopy.pathAllPathsCopy, '전체 경로 실행');
    assert.equal(pathCopy.pathRelationPreflightReasonLabel, '관계 사전 점검 이유');
    assert.equal(pathCopy.pathTraversalCompletenessLabel, '전체 경로 점검');
    assert.equal(pathCopy.pathTraversalCompletenessBadge, '전체 경로');
    assert.equal(
      pathCopy.pathTraversalCompletenessBody,
      '최단 경로를 완전한 그래프 근거로 쓰기 전에 범위를 제한한 전체 경로 점검을 실행하세요.',
    );
    assert.equal(pathCopy.pathCopyAriaLabel, '경로 근거 복사');
    assert.equal(pathCopy.pathRelationPreflightCopyAriaLabel, '경로 관계 사전 점검 복사');
    assert.equal(pathCopy.pathExplainRelationCopyAriaLabel, '경로 관계 설명 점검 복사');
    assert.equal(pathCopy.pathAllPathsPlanCopyAriaLabel, '전체 경로 계획 복사');
    assert.equal(pathCopy.pathAllPathsCopyAriaLabel, '전체 경로 실행 점검 복사');
    assert.equal(pathCopy.pathEvidenceTitle, '지형도 경로 근거');
    assert.equal(pathCopy.pathEvidenceSlugs, '개념 ID');
    assert.equal(pathCopy.pathEvidenceSourceOntologyUrl, '시작점 개념 문서 URL');
    assert.equal(pathCopy.pathEvidenceTargetOntologyUrl, '대상 개념 문서 URL');
    assert.equal(pathCopy.pathEvidenceRelationPreflightReason, '관계 사전 점검 이유');
    assert.equal(pathCopy.pathEvidenceRelationPreflightCliCheck, 'CLI 관계 사전 점검');
    assert.equal(pathCopy.pathEvidenceRelationPreflightMcpCheck, 'MCP 관계 사전 점검');
    assert.equal(pathCopy.pathEvidenceExplainRelationCliCheck, 'CLI 관계 설명 점검');
    assert.equal(pathCopy.pathEvidenceExplainRelationMcpCheck, 'MCP 관계 설명 점검');
    assert.equal(pathCopy.pathEvidenceTraversalCompleteness, '전체 경로 점검');
    assert.equal(
      pathCopy.pathEvidenceTraversalCompletenessPolicy,
      '최단 경로를 완전한 그래프 근거로 쓰기 전에 범위를 제한한 전체 경로 점검을 실행하세요.',
    );
    assert.equal(pathCopy.pathEvidenceAllPathsCliCheck, 'CLI 전체 경로 점검');
    assert.equal(pathCopy.pathEvidenceAllPathsPlanMcpCheck, 'MCP 전체 경로 계획');
    assert.equal(pathCopy.pathEvidenceAllPathsMcpCheck, 'MCP 전체 경로 점검');
    assert.equal(pathCopy.pathEvidenceAllPathsCopyInstruction, '전체 경로 근거 계약');
    assert.equal(pathCopy.pathEvidencePostWriteSyncGate, '수정 후 동기화 점검');

    assert.doesNotMatch(
      [
        pathCopy.pathStartTitle,
        pathCopy.pathStartBadge,
        pathCopy.pathStartBody,
        pathCopy.pathCopy,
        pathCopy.pathMcpCopy,
        pathCopy.pathRelationPreflightCopy,
        pathCopy.pathExplainRelationCopy,
        pathCopy.pathAllPathsPlanCopy,
        pathCopy.pathAllPathsCopy,
        pathCopy.pathRelationPreflightReasonLabel,
        pathCopy.pathTraversalCompletenessLabel,
        pathCopy.pathTraversalCompletenessBadge,
        pathCopy.pathTraversalCompletenessBody,
        pathCopy.pathCopyAriaLabel,
        pathCopy.pathRelationPreflightCopyAriaLabel,
        pathCopy.pathExplainRelationCopyAriaLabel,
        pathCopy.pathAllPathsPlanCopyAriaLabel,
        pathCopy.pathAllPathsCopyAriaLabel,
        pathCopy.pathEvidenceTitle,
        pathCopy.pathEvidenceSlugs,
        pathCopy.pathEvidenceSourceOntologyUrl,
        pathCopy.pathEvidenceTargetOntologyUrl,
        pathCopy.pathEvidenceRelationPreflightReason,
        pathCopy.pathEvidenceRelationPreflightCliCheck,
        pathCopy.pathEvidenceRelationPreflightMcpCheck,
        pathCopy.pathEvidenceExplainRelationCliCheck,
        pathCopy.pathEvidenceExplainRelationMcpCheck,
        pathCopy.pathEvidenceTraversalCompleteness,
        pathCopy.pathEvidenceTraversalCompletenessPolicy,
        pathCopy.pathEvidenceAllPathsCliCheck,
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

  it('keeps Korean ontology browse entry copy free of internal graph jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const ontologyBrowseCopy = [
      ko.ontologyView.titleTooltip.body,
      ko.ontologyView.title,
      ko.ontologyView.actions.workbenchOverviewTooltip,
      ko.ontologyView.actions.builderTooltip,
      ko.ontologyView.agentStatus.title,
      ko.ontologyView.changes.emptyHint,
      ko.ontologyView.stat.graphRefsHint,
      ko.ontologyView.stat.roleValue,
      ko.ontologyView.stat.roleHint,
      ko.ontologyView.meaningGate.agentGraphDbGateLabel,
      ko.ontologyView.meaningGate.agentGraphDbGateTitle,
      ko.ontologyView.meaningGate.agentGraphDbGateBody,
      ko.ontologyView.meaningGate.agentGraphDbContextBody,
      ko.ontologyView.meaningGate.agentGraphDbWorkspaceBody,
      ko.ontologyView.meaningGate.agentGraphDbHealthBody,
      ko.ontologyView.treeWarnings.badge,
      ko.ontologyView.treeWarnings.body,
      ko.ontologyView.treeWarnings.rawHint,
      ko.ontologyView.workbench.dialogTitle,
      ko.ontologyView.workbench.activeSlugBody,
      ko.ontologyView.workbench.treeLabel,
      ko.ontologyView.workbench.treeProof,
      ko.ontologyView.workbench.builderBody,
      ko.ontologyView.workbench.builderLabel,
      ko.ontologyView.getStarted.bodyLocal,
      ko.ontologyView.getStarted.bodyDefault,
      ko.ontologyView.getStarted.stepLocalFrontmatterTitle,
      ko.ontologyView.getStarted.stepLocalFrontmatterDesc,
      ko.ontologyView.getStarted.stepStaticVaultTitlePicker,
      ko.ontologyView.getStarted.stepStaticVaultDescDownload,
      ko.ontologyView.getStarted.stepStaticFrontmatterTitle,
      ko.ontologyView.getStarted.stepStaticFrontmatterDesc,
      ko.ontologyView.getStarted.snippetSummary,
      ko.ontologyView.getStarted.snippetHelp,
      ko.ontologyView.footer.countsHint,
      ko.ontologyView.footer.modeLocal,
      ko.ontologyView.detail.handoffBrowseLabel,
      ko.ontologyView.detail.handoffAriaLabel,
      ko.ontologyView.detail.handoffBrowseProof,
      ko.ontologyView.detail.handoffWriteLabel,
      ko.ontologyView.detail.handoffWriteProof,
      ko.ontologyView.detail.handoffQueryProof,
      ko.ontologyView.detail.handoffCopyProof,
      ko.ontologyView.detail.handoffCopyProofCopied,
      ko.ontologyView.detail.summaryMore,
      ko.ontologyView.detail.summaryLess,
      ko.ontologyView.detail.proofPathTitle,
      ko.ontologyView.detail.proofPathBadge,
      ko.ontologyView.detail.proofStep.profile,
      ko.ontologyView.detail.proofStep.impact,
      ko.ontologyView.detail.proofStep.guard,
      ko.ontologyView.detail.proofStep.sync,
      ko.ontologyView.detail.proofStepCopied,
      ko.ontologyView.detail.proofStepCopyAria,
      ko.ontologyView.detail.proofStepCopyToastSuccess,
      ko.ontologyView.detail.proofStepCopyToastError,
      ko.ontologyView.detail.reviewOpenTopology,
      ko.ontologyView.detail.reviewRelationPreviewTitle,
      ko.ontologyView.detail.reviewRelationPreviewEmpty,
      ko.ontologyView.detail.reviewRelationPreviewOut,
      ko.ontologyView.detail.reviewRelationPreviewIn,
      ko.ontologyView.detail.reviewRelationOpenNode,
      ko.ontologyView.detail.topologyCta,
      ko.ontologyView.detail.stubWarning,
      ko.ontologyView.stat.selectionHint,
      ko.ontologyWidgets.tree.selectAriaLabel,
    ].join('\n');

    assert.match(ko.ontologyView.titleTooltip.body, /문서 상단 속성/);
    assert.equal(ko.ontologyView.title, '개념 지도');
    assert.match(ko.ontologyView.workbench.dialogTitle, /개념 지도 · 관계 편집 · 그래프 검증/);
    assert.equal(ko.ontologyView.workbench.builderLabel, '관계 편집');
    assert.equal(ko.ontologyView.detail.handoffBrowseLabel, '지형도');
    assert.equal(ko.ontologyView.detail.handoffAriaLabel, '선택 개념 전달');
    assert.equal(ko.ontologyView.detail.handoffWriteLabel, '저장·편집');
    assert.equal(ko.ontologyView.detail.handoffBrowseProof, '선택 개념 포커스');
    assert.equal(ko.ontologyView.detail.handoffWriteProof, '캔버스에서 수정');
    assert.equal(ko.ontologyView.detail.handoffQueryProof, '상태와 영향 확인');
    assert.equal(ko.ontologyView.detail.handoffCopyProof, '전체 확인 복사');
    assert.equal(ko.ontologyView.detail.handoffCopyProofCopied, '전체 확인 복사됨');
    assert.equal(ko.ontologyView.detail.nextActionTopology, '연결 보기');
    assert.equal(ko.ontologyView.detail.nextActionBuilder, '연결 정리');
    assert.equal(ko.ontologyView.detail.nextActionQuery, '영향 확인');
    assert.equal(ko.ontologyView.detail.summaryMore, '더 보기');
    assert.equal(ko.ontologyView.detail.summaryLess, '접기');
    assert.equal(ko.ontologyView.detail.proofPathTitle, '같은 그래프 확인');
    assert.equal(ko.ontologyView.detail.sectionNavAgent, 'AI 확인');
    assert.equal(ko.ontologyView.detail.sectionNavAgentDesc, '복사해서 실행');
    assert.equal(ko.ontologyView.detail.sectionNavReview, '팀 검토');
    assert.equal(ko.ontologyView.detail.sectionNavReviewDesc, '담당자와 영향');
    assert.equal(ko.ontologyView.detail.advancedToolsShow, '추가 확인 보기');
    assert.equal(ko.ontologyView.detail.advancedToolsHide, '추가 확인 접기');
    assert.equal(ko.ontologyView.detail.proofPathBadge, '확인 순서');
    assert.equal(ko.ontologyView.detail.agentContextTitle, '넘길 확인');
    assert.deepEqual(Object.values(ko.ontologyView.detail.proofStep), [
      '개념 읽기',
      '영향 보기',
      '경로 확인',
      '상태 확인',
    ]);
    assert.deepEqual(Object.values(ko.ontologyView.detail.proofStepBody), [
      '의미와 직접 관계를 읽습니다',
      '바꾸면 닿는 범위를 봅니다',
      '관계 경로가 충분한지 봅니다',
      '수정 뒤 그래프 상태를 봅니다',
    ]);
    assert.equal(ko.ontologyView.detail.proofStepCopied, '복사됨');
    assert.match(ko.ontologyView.detail.proofStepCopyAria, /확인 복사/);
    assert.match(ko.ontologyView.detail.proofStepCopyToastSuccess, /복사했습니다/);
    assert.equal(ko.ontologyView.detail.agentContextCopyMcp, 'AI에게 넘기기');
    assert.equal(ko.ontologyView.detail.agentContextCopyCli, '터미널에서 확인');
    assert.equal(ko.ontologyView.detail.agentContextCopyBundle, '전체 확인 복사');
    assert.equal(ko.ontologyView.detail.agentContextBundleToastSuccess, '전체 확인을 복사했습니다.');
    assert.equal(ko.ontologyView.detail.agentContextBundleToastError, '전체 확인을 복사하지 못했습니다.');
    assert.equal(ko.ontologyView.detail.reviewCopyMcpCheck, 'AI 개념 확인');
    assert.equal(ko.ontologyView.detail.reviewCopyCliCheck, '터미널 개념 확인');
    assert.equal(ko.ontologyView.detail.reviewCopyMcpImpactCheck, 'AI 영향 확인');
    assert.equal(ko.ontologyView.detail.reviewCopyCliImpactCheck, '터미널 영향 확인');
    assert.equal(ko.ontologyView.detail.reviewCopySyncGate, '수정 후 상태 복사');
    assert.match(ko.ontologyView.detail.reviewCopySyncGateTitle, /수정 후 상태 확인/);
    assert.equal(ko.ontologyView.detail.reviewCopyVocabulary, '공유 어휘 복사');
    assert.equal(ko.ontologyView.detail.reviewCopySuccess, '검토 요약을 복사했습니다.');
    assert.equal(ko.ontologyView.detail.reviewCopyError, '검토 요약을 복사하지 못했습니다.');
    assert.equal(ko.ontologyView.detail.reviewVocabularyTitle, '공유 어휘');
    assert.equal(ko.ontologyView.detail.reviewQuestionsTitle, '확인 질문');
    assert.equal(ko.ontologyView.detail.reviewImpactIncoming, '처음 들어오는 연결');
    assert.equal(ko.ontologyView.detail.reviewImpactOutgoing, '처음 나가는 연결');
    assert.equal(ko.ontologyView.detail.reviewDetailDisclosure, '변경 기준 · 넘길 점검');
    assert.doesNotMatch(
      [
        ko.ontologyView.detail.reviewCopySuccess,
        ko.ontologyView.detail.reviewCopyError,
        ko.ontologyView.detail.reviewVocabularyTitle,
        ko.ontologyView.detail.reviewQuestionsTitle,
        ko.ontologyView.detail.reviewImpactIncoming,
        ko.ontologyView.detail.reviewImpactOutgoing,
        ...Object.values(ko.ontologyView.detail.reviewImpact),
        ...Object.values(ko.ontologyView.detail.reviewPrompt),
        ko.ontologyView.detail.reviewQuestions.defineOwnerOwner,
        ko.ontologyView.detail.reviewQuestions.defineOwnerContainer,
      ].join('\n'),
      /brief|incoming|outgoing|graph relation|owner|container|dependent|dependency/,
    );
    assert.equal(ko.ontologyView.detail.reviewRelationPreviewTitle, '연결된 개념');
    assert.equal(ko.ontologyView.detail.reviewRelationPreviewEmpty, '아직 직접 관계 근거가 없습니다.');
    assert.equal(ko.ontologyView.detail.reviewRelationPreviewOut, '이 개념에서');
    assert.equal(ko.ontologyView.detail.reviewRelationPreviewIn, '이 개념으로');
    assert.equal(ko.ontologyView.detail.reviewRelations, '이 개념에서 {outgoing} · 이 개념으로 {incoming}');
    assert.equal(ko.ontologyView.detail.reviewRelationTypes, '관계 종류 · {types}');
    assert.equal(ko.ontologyView.detail.reachabilityTitle, '더 멀리 연결된 개념');
    assert.equal(ko.ontologyView.detail.reachabilityMeta, '{depth}단계 · {direction}');
    assert.equal(ko.ontologyView.detail.reachabilityDirectionLabel, '연결 방향');
    assert.equal(ko.ontologyView.detail.reachabilityDepthOption, '{depth}단계');
    assert.equal(ko.ontologyView.detail.reachabilityNodes, '개념');
    assert.equal(ko.ontologyView.detail.relationsHopBreakdown, '· 1단계 {one} · 2단계 {two}');
    assert.equal(ko.ontologyView.detail.relationGraphNeighborLabel, '{source}에서 {target}로 {type} 관계 연결');
    assert.equal(ko.ontologyWidgets.egoGraph.ariaLabelOneHop, '{title} 의 관계 그래프 (1단계)');
    assert.equal(ko.ontologyWidgets.egoGraph.ariaLabelTwoHop, '{title} 의 관계 그래프 (2단계)');
    assert.equal(ko.ontologyWidgets.egoGraph.directionOutgoing, '이 개념에서');
    assert.equal(ko.ontologyWidgets.egoGraph.directionIncoming, '이 개념으로');
    assert.match(ko.ontologyView.detail.reviewRelationOpenNode, /연결된 개념/);
    assert.match(ko.ontologyView.stat.selectionHint, /의미 · 관계 · 구현 근거/);
    assert.match(ko.ontologyView.getStarted.stepLocalFrontmatterTitle, /문서 속성/);
    assert.match(ko.ontologyView.stat.graphRefsHint, /온톨로지 저장소/);
    assert.match(ko.ontologyView.stat.evidenceHint, /계층 밖 근거/);
    assert.equal(ko.ontologyView.footer.modeLocal, '로컬 온톨로지 문서함');
    assert.equal(ko.ontologyView.meaningGate.agentGraphDbGateLabel, 'AI 에이전트 그래프 검증 순서');
    assert.equal(ko.ontologyView.meaningGate.agentGraphDbGateTitle, 'AI 에이전트 그래프 검증');
    assert.match(ko.ontologyView.meaningGate.agentGraphDbGateBody, /같은 온톨로지 그래프/);
    assert.match(ko.ontologyView.meaningGate.agentGraphDbWorkspaceBody, /그래프 구조/);
    assert.doesNotMatch(
      [
        ko.ontologyView.stat.graphRefsHint,
        ko.ontologyView.stat.evidenceHint,
        ko.ontologyView.footer.countsHint,
        ko.ontologyView.footer.modeLocal,
      ].join('\n'),
      /문서함 전체 요약|로컬 문서함|문서함 문서 수/,
    );
    assert.equal(ko.ontologySubNav.caption, '온톨로지');
    assert.equal(Object.hasOwn(ko.ontologySubNav, 'nodeCount'), false);
    assert.equal(Object.hasOwn(ko.ontologySubNav, 'edgeCount'), false);
    assert.equal(Object.hasOwn(ko.ontologySubNav, 'countHint'), false);
    assert.doesNotMatch(
      ontologyBrowseCopy,
      /frontmatter|vault|Vault|토폴로지|tree projection|graph DB proof|implicit stub|hosted|read-only|둘러보기|작성|relation|RELATION|focus|handoff|Graph DB|graph DB|Agent graph|ontology graph|graph shape|drift|business-first/,
    );
  });

  it('keeps English selected concept handoff aligned with the destination', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));

    assert.equal(en.ontologyView.detail.handoffBrowseLabel, 'Topology');
    assert.equal(en.ontologyView.detail.handoffBrowseProof, 'selected concept focus');
    assert.equal(en.ontologyView.detail.sectionNavRelationsDesc, 'Connected concepts');
    assert.equal(en.ontologyView.detail.sectionNavAgent, 'AI check');
    assert.equal(en.ontologyView.detail.sectionNavAgentDesc, 'Copy and run');
    assert.equal(en.ontologyView.detail.sectionNavReview, 'Team review');
    assert.equal(en.ontologyView.detail.sectionNavReviewDesc, 'Owner and impact');
    assert.equal(en.ontologyView.detail.advancedToolsShow, 'Show extra checks');
    assert.equal(en.ontologyView.detail.advancedToolsHide, 'Hide extra checks');
    assert.equal(en.ontologyView.detail.nextActionTopology, 'View links');
    assert.equal(en.ontologyView.detail.nextActionBuilder, 'Clean up links');
    assert.equal(en.ontologyView.detail.nextActionQuery, 'Check impact');
    assert.equal(en.ontologyView.detail.handoffCopyProof, 'Copy all checks');
    assert.equal(en.ontologyView.detail.agentContextCopyMcp, 'Hand to AI');
    assert.equal(en.ontologyView.detail.agentContextCopyCli, 'Check in terminal');
    assert.equal(en.ontologyView.detail.agentContextCopyBundle, 'Copy all checks');
    assert.equal(en.ontologyView.detail.reviewCopyMcpCheck, 'AI concept check');
    assert.equal(en.ontologyView.detail.reviewCopyCliCheck, 'Terminal concept check');
    assert.equal(en.ontologyView.detail.proofPathBadge, 'Check order');
    assert.equal(en.ontologyView.detail.agentContextTitle, 'Checks to hand off');
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

  it('keeps Korean insights distribution labels readable without DB/frontmatter jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const insightsCopy = [
      ko.ontologyPages.insights.bandCensusEyebrow,
      ko.ontologyPages.insights.bandCensusDesc,
      ko.ontologyPages.insights.kindPanelTitle,
      ko.ontologyPages.insights.hubsPanelSubtitle,
      ko.ontologyPages.insights.recentSubtitle,
    ].join('\n');

    assert.match(ko.ontologyPages.insights.bandCensusEyebrow, /^분포/);
    assert.match(ko.ontologyPages.insights.kindPanelTitle, /종류별/);
    assert.match(ko.ontologyPages.insights.hubsPanelSubtitle, /근거 문서\/프로젝트/);
    assert.match(ko.ontologyPages.insights.recentSubtitle, /문서함 개념/);
    assert.doesNotMatch(insightsCopy, /Census|KIND|Kind|document|project 제외|vault|frontmatter|agent 준비도/);
  });

  it('keeps Korean insights first screen readable without mixed English chrome', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const firstScreenCopy = [
      ko.ontologyPages.insights.eyebrow,
      ko.ontologyPages.insights.title,
      ko.ontologyPages.insights.titleInfoAriaLabel,
      ko.ontologyPages.insights.titleProofLocal,
      ko.ontologyPages.insights.titleProofAgent,
      ko.ontologyPages.insights.titleProofRuntime,
      ko.ontologyPages.insights.questionPresetsBody,
      ko.ontologyPages.insights.questionPresetsLensLabel,
      ko.ontologyPages.insights.readerIntent.planning.presetQuestion,
      ko.ontologyPages.insights.readerIntent.planning.operationLabel,
      ko.ontologyPages.insights.readerIntent.marketing.presetQuestion,
      ko.ontologyPages.insights.readerIntent.marketing.operationLabel,
      ko.ontologyPages.insights.readerIntent.agent.reader,
      ko.ontologyPages.insights.readerIntent.agent.presetQuestion,
      ko.ontologyPages.insights.readerIntent.agent.businessSignal,
      ko.ontologyPages.insights.readerIntent.agent.operationLabel,
      ko.ontologyPages.insights.bandProofEyebrow,
      ko.ontologyPages.insights.bandProofDesc,
      ko.ontologyPages.insights.queryCockpitCompactSummary,
      ko.ontologyPages.insights.queryCockpitEvidenceSummary,
      ko.ontologyPages.insights.queryCockpitDetailsSummary,
      ko.ontologyPages.insights.queryCockpitTabRun,
      ko.ontologyPages.insights.queryCockpitPayloads,
      ko.ontologyPages.insights.queryCockpitCliFallback,
      ko.ontologyPages.insights.queryCockpitBusinessLaneLabel,
      ko.ontologyPages.insights.queryCockpitBusinessPackLabel,
      ko.ontologyPages.insights.queryCockpitBusinessPackValue,
      ko.ontologyPages.insights.queryCockpitBusinessOutcomeHandle,
      ko.ontologyPages.insights.queryCockpitBusinessBoundaryHandle,
      ko.ontologyPages.insights.queryCockpitBusinessClaimHandle,
      ko.ontologyPages.insights.queryCockpitBusinessEvidenceHandle,
      ko.ontologyPages.insights.queryCockpitBusinessEvidenceAcceptance,
      ko.ontologyPages.insights.queryCockpitBusinessAcceptanceSummary,
      ko.ontologyPages.insights.queryCockpitAgentLensHandle,
      ko.ontologyPages.insights.queryCockpitLiveTraversalValue,
    ].join('\n');

    assert.equal(ko.ontologyPages.insights.eyebrow, '온톨로지 · 질문과 근거');
    assert.equal(ko.ontologyPages.insights.title, '그래프에 묻고 근거로 확인');
    assert.equal(ko.ontologyPages.insights.titleProofAgent, 'AI와 터미널 확인');
    assert.equal(ko.ontologyPages.insights.titleProofRuntime, '근거 확인');
    assert.equal(ko.ontologyPages.insights.questionPresetsLensLabel, '결과 → 도메인 → 역량 → 구현 근거');
    assert.equal(ko.ontologyPages.insights.readerIntent.agent.reader, 'AI');
    assert.equal(ko.ontologyPages.insights.readerIntent.agent.operationLabel, '요약과 상태 확인');
    assert.equal(ko.ontologyPages.insights.bandProofEyebrow, '근거 게이트');
    assert.equal(ko.ontologyPages.insights.queryCockpitPack, '확인 순서');
    assert.equal(ko.ontologyPages.insights.queryCockpitMcp, 'AI 확인');
    assert.equal(ko.ontologyPages.insights.queryCockpitCli, '터미널 확인');
    assert.equal(ko.ontologyPages.insights.queryCockpitTabRun, '확인 순서');
    assert.equal(ko.ontologyPages.insights.queryCockpitPayloads, 'AI 확인');
    assert.equal(ko.ontologyPages.insights.queryCockpitCliFallback, '터미널 확인');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessLaneLabel, '결정 질문');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessPackLabel, 'AI 확인 묶음');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessPackValue, '질문 {count}개');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessOutcomeHandle, '결과 분포와 도메인 경계');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessBoundaryHandle, '제품 경계와 연결');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessClaimHandle, '역량 주장 후보');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessEvidenceHandle, '구현 근거 연결');
    assert.equal(ko.ontologyPages.insights.queryCockpitBusinessAcceptanceSummary, '답변 기준 보기');
    assert.equal(ko.ontologyPages.insights.queryCockpitAgentLensHandle, 'AI 판단 지도');
    assert.match(ko.ontologyPages.insights.queryCockpitBusinessEvidenceAcceptance, /근거 행/);
    assert.match(ko.ontologyPages.insights.queryCockpitLiveTraversalValue, /중심/);
    assert.match(ko.ontologyPages.insights.queryCockpitLiveTraversalValue, /평균/);
    const renderedFirstScreenCopy = firstScreenCopy.replaceAll(/\{[^}]+\}/g, '');

    assert.doesNotMatch(
      renderedFirstScreenCopy,
      /Ontology|Check|Proof|AGENT|Agent|agent 가|cockpit|handoff|MCP|CLI|readiness|business-first|outcome -> domain -> capability -> element|FACETS|DOMAIN_MATRIX|business_questions|facets \+ domain_matrix|match_nodes|capability -> element|agent_brief|health|그래프 DB|에이전트용|터미널용|Agent 실행|터미널 실행|proof row|\bhub\b|\bavg\b/,
    );
  });

  it('keeps Korean insights graph verification copy readable without operation-name chrome', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const insights = ko.ontologyPages.insights;
    const graphVerificationCopy = [
      insights.queryCockpitNextStepBody,
      insights.queryCockpitLiveProofAriaLabel,
      insights.queryCockpitLiveGraphBody,
      insights.queryCockpitEvidenceAriaLabel,
      insights.queryCockpitEvidencePlanLabel,
      insights.queryCockpitEvidencePlanBody,
      insights.queryCockpitEvidenceScanBody,
      insights.queryCockpitEvidenceFollowUpBody,
      insights.queryCockpitEvidenceProofBody,
      insights.queryCockpitContractsAriaLabel,
      insights.queryCockpitScanContractBody,
      insights.queryCockpitPathContractBody,
      insights.queryCockpitProofBody,
      insights.queryCockpitRuntimeBody,
      insights.focusedProofAriaLabel,
      insights.focusedProofRailBody,
      insights.focusedProofEyebrow,
      insights.focusedProofBody,
      insights.focusedProofCopyPacket,
      insights.focusedProofProfileLabel,
      insights.focusedProofEdgeScanLabel,
      insights.focusedProofPathPlanLabel,
      insights.focusedProofRelationCheckLabel,
      insights.focusedProofImpactLabel,
      insights.focusedProofSyncLabel,
      insights.focusedProofSyncBody,
      insights.focusedProofPacketTitle,
      insights.domainCouplingMetricCross,
      insights.domainCouplingReproduce,
      insights.domainCouplingCopyCli,
      insights.domainCouplingOpenPath,
      insights.domainCouplingCopyPathCheck,
      insights.domainCouplingPathCheckTitle,
      insights.domainCouplingPathCheckCli,
      insights.domainCouplingPathCheckMcpPlan,
      insights.domainCouplingPathCheckMcp,
      insights.domainCouplingPathCheckEvidenceContract,
    ].join('\n');

    assert.equal(insights.queryCockpitEvidencePlanLabel, '계획');
    assert.equal(insights.queryCockpitEvidenceProofBody, '쓰기 전 관계 사전 점검, 전체 경로 근거, 동기화 점검으로 근거를 닫습니다.');
    assert.equal(insights.focusedProofProfileLabel, '노드 프로필');
    assert.equal(insights.focusedProofPathPlanLabel, '경로 계획');
    assert.equal(insights.focusedProofRelationCheckLabel, '관계 사전 점검');
    assert.equal(insights.focusedProofSyncLabel, '동기화 점검');
    assert.equal(insights.domainCouplingOpenPath, '경로');
    assert.equal(insights.domainCouplingCopyPathCheck, '경로 점검 복사');
    assert.equal(insights.domainCouplingPathCheckMcpPlan, 'MCP 전체 경로 계획');
    assert.equal(insights.domainCouplingPathCheckEvidenceContract, '근거 기준');

    assert.match(insights.queryCockpitRuntimeBody, /전체 경로 완결성/);
    assert.match(insights.domainCouplingReproduce, /의미 연결표/);
    assert.doesNotMatch(
      graphVerificationCopy,
      /scan row|runtime gate|manifest|query|Plan|Path|Cross|matrix|semantic|proof|graph proof|query cockpit|tree handoff|node_profile|match_edges|all_paths|relation_check|sync gate|blast_radius|bounded|frontmatter|vault|Evidence contract|relation 필터|graph 검사/,
    );
  });

  it('keeps Korean insights collaborator handoff copy readable without internal workflow terms', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const insights = ko.ontologyPages.insights;
    const collaboratorHandoffCopy = [
      insights.collaboratorDecisionGraphHandoff,
      insights.collaboratorDecisionAlignNextStep,
      insights.collaboratorDecisionImpactNextStep,
      insights.collaboratorDecisionOrphanNextStep,
      insights.collaboratorDecisionRecordOwner,
      insights.collaboratorReaderDecisionLens,
      insights.collaboratorMeetingAgenda,
      insights.collaboratorMeetingAgendaAction,
      insights.collaboratorHubHandoff,
      insights.collaboratorImpactHandoff,
      insights.collaboratorImpactHandoffPath,
      insights.collaboratorOpenQuestionHandoff,
      insights.collaboratorHandoff,
      insights.collaboratorHandoffTopology,
      insights.collaboratorHandoffTopologyFocus,
      insights.collaboratorHandoffTopologyHealth,
      insights.collaboratorHandoffTopologyShort,
      insights.collaboratorHandoffAgentCheck,
    ].join('\n');

    assert.equal(insights.collaboratorDecisionGraphHandoff, '그래프 전달');
    assert.equal(
      insights.collaboratorDecisionAlignNextStep,
      '계획서나 캠페인에 옮기기 전에 허브 전달을 온톨로지, 지형도, 저장·편집에서 엽니다.',
    );
    assert.equal(
      insights.collaboratorDecisionImpactNextStep,
      '지형도 경로 전달을 열고 도메인 의미 연결표 CLI/MCP 점검을 재생합니다.',
    );
    assert.equal(
      insights.collaboratorDecisionOrphanNextStep,
      '저장·편집 또는 지형도 상태 전달을 열고, 쓰기 전에 에이전트 소유 관계 점검을 실행합니다.',
    );
    assert.equal(insights.collaboratorDecisionRecordOwner, '담당자');
    assert.equal(insights.collaboratorReaderDecisionLens, '읽는 사람별 결정 관점');
    assert.equal(insights.collaboratorMeetingAgenda, '회의 안건');
    assert.equal(insights.collaboratorMeetingAgendaAction, '다음 그래프 작업');
    assert.equal(insights.collaboratorHubHandoff, '허브 전달');
    assert.equal(insights.collaboratorImpactHandoff, '영향 전달');
    assert.equal(insights.collaboratorImpactHandoffPath, '경로');
    assert.equal(insights.collaboratorOpenQuestionHandoff, '열린 질문 전달');
    assert.equal(insights.collaboratorHandoff, '전달');
    assert.equal(insights.collaboratorHandoffTopology, '지형도 상태');
    assert.equal(insights.collaboratorHandoffTopologyFocus, '지형도 선택');
    assert.equal(insights.collaboratorHandoffTopologyHealth, '지형도 상태');
    assert.equal(insights.collaboratorHandoffTopologyShort, '지형도');
    assert.equal(insights.collaboratorHandoffAgentCheck, '에이전트 점검');

    assert.doesNotMatch(
      collaboratorHandoffCopy,
      /handoff|Handoff|Topology|Path|Agent|Owner|Reader|lens|agenda|graph action|hub handoff/,
    );
  });

  it('keeps Korean insights collaborator review questions readable for non-developer meetings', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const insights = ko.ontologyPages.insights;
    const collaboratorQuestionCopy = [
      insights.collaboratorReaderPlanningQuestion,
      insights.collaboratorReaderMarketingQuestion,
      insights.collaboratorReaderLeadershipQuestion,
      insights.collaboratorQuestionAlignRename,
      insights.collaboratorQuestionAlignOwner,
      insights.collaboratorQuestionImpactDomains,
      insights.collaboratorQuestionImpactMessaging,
      insights.collaboratorQuestionImpactBoundary,
      insights.collaboratorQuestionOrphanOwner,
      insights.collaboratorQuestionOrphanContainer,
      insights.collaboratorQuestionOrphanAction,
      insights.collaboratorNoHubs,
    ].join('\n');

    assert.equal(
      insights.collaboratorReaderPlanningQuestion,
      '다음 범위 변경에 재사용할 수 있는 어휘 경계인가요?',
    );
    assert.equal(
      insights.collaboratorReaderMarketingQuestion,
      '외부 주장에 사용할 수 있는 역량 근거는 무엇인가요?',
    );
    assert.equal(
      insights.collaboratorReaderLeadershipQuestion,
      '영향 도메인과 영향 경계의 담당자는 누구인가요?',
    );
    assert.equal(
      insights.collaboratorQuestionAlignRename,
      '전달 전에 더 명확한 이름이 필요한 핵심 용어는 무엇인가요?',
    );
    assert.equal(
      insights.collaboratorQuestionAlignOwner,
      '명시적인 담당자가 필요한 공유 어휘 허브는 무엇인가요?',
    );
    assert.equal(
      insights.collaboratorQuestionImpactDomains,
      '이 어휘나 범위가 바뀌면 어떤 도메인이 영향을 받나요?',
    );
    assert.equal(
      insights.collaboratorQuestionImpactMessaging,
      '어떤 메시지, 소유 관계, 로드맵 약속을 다시 검토해야 하나요?',
    );
    assert.equal(
      insights.collaboratorQuestionImpactBoundary,
      '표현이 바뀌어도 같이 움직이면 안 되는 구현 경계는 무엇인가요?',
    );
    assert.equal(
      insights.collaboratorQuestionOrphanOwner,
      '각 미연결 개념의 담당자는 누구인가요?',
    );
    assert.equal(
      insights.collaboratorQuestionOrphanContainer,
      '어떤 도메인, 역량, 프로젝트 아래에 연결해야 하나요?',
    );
    assert.equal(
      insights.collaboratorQuestionOrphanAction,
      '이 개념은 연결, 병합, 이름 변경, 삭제 중 무엇이 맞나요?',
    );
    assert.equal(insights.collaboratorNoHubs, '아직 연결된 허브가 없습니다');

    assert.doesNotMatch(
      collaboratorQuestionCopy,
      /handoff|vocabulary|owner|concept|domain|scope|boundary|claim|ownership|roadmap|hub가|capability|project/,
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
