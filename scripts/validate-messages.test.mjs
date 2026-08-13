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

  it('keeps hosted download copy honest about what is actually published', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    // The page's release-dependent facts come from the generated release
    // module, so the catalog must not carry a second, hand-written copy of
    // them. These keys are gone on purpose — restoring one puts the page back
    // in the state where six placeholders drifted independently.
    for (const gone of [
      'releaseAvailabilityNote',
      'releaseStatusTitle',
      'releaseStatusPr',
      'releaseStatusVersion',
      'releaseStatusSecrets',
      'factSizeValuePending',
      'checksumValuePending',
      'primaryCta',
    ]) {
      assert.equal(en.download[gone], undefined, `download.${gone} must stay removed`);
      assert.equal(ko.download[gone], undefined, `download.${gone} must stay removed`);
    }

    // Two states, both honest: a real download once published, an honest link
    // to the releases page before that.
    // 2026-07-29 — 크기는 **번역 문자열을 떠났다**(카운슬 평결 ④). 라벨이
    // `· {size}` 를 달고 있으면 `whitespace-nowrap` 버튼이 320px 에서 판을
    // 뚫는데(실측 en: 22px 초과), 보간이 문자열 안에 있으면 그 절만 반응형으로
    // 뺄 수가 없다. 이제 `AssetSize` 스팬이 그린다 — Intel 버튼이 원래 쓰던
    // 문법이라 두 버튼이 같아지는 것은 덤이다.
    //
    // 이 게이트가 지키던 것은 "카탈로그가 릴리스 사실의 두 번째 사본을 갖지
    // 않는다" 였고, 그 규율은 **더 강해졌다**: 라벨은 이제 아키텍처만 부른다.
    // 크기가 실제로 그려지는지는 `DownloadPage.test.tsx` 가 생성 모듈의 값
    // (`12.4 MB`)으로 검증한다.
    assert.match(en.download.primaryCtaPublished, /Apple Silicon/);
    assert.match(ko.download.primaryCtaPublished, /Apple Silicon/);
    for (const [locale, value] of [
      ['en', en.download.primaryCtaPublished],
      ['ko', ko.download.primaryCtaPublished],
    ]) {
      assert.doesNotMatch(value, /\{size\}/, `${locale}: 크기는 스팬이 그린다`);
      assert.doesNotMatch(value, /\bMB\b|\bGB\b/, `${locale}: 크기 리터럴 금지`);
    }
    assert.match(en.download.primaryCtaPending, /releases page/i);
    assert.match(ko.download.primaryCtaPending, /릴리스 페이지/);
    assert.equal(en.download.sourceCta, 'Go to GitHub');
    assert.equal(ko.download.sourceCta, 'GitHub로 이동하기');

    // The CTA must never depend on a /releases/latest URL — asset names carry
    // the version, so "latest" silently breaks on the next release.
    assert.doesNotMatch(en.download.primaryCtaPending, /latest/i);
    assert.doesNotMatch(ko.download.primaryCtaPending, /최신/);

    // Signing and notarization are properties of the release path, never a
    // gate that "requires" them at some future point.
    assert.doesNotMatch(en.download.proofSigned, /Release gate requires/);
    assert.doesNotMatch(ko.download.proofSigned, /게이트가/);
    assert.match(en.download.trustVerifyCommand, /\{file\}/);

    // 2026-07-27 — the Developer ID certificate exists (docs/DECISIONS.md),
    // so the unsigned-era copy is now false. It said "not signed yet" and
    // walked every downloader through System Settings → Open Anyway; leaving
    // that in place would send people down a detour macOS no longer asks for,
    // on the page where a first impression is spent exactly once. The signed
    // claim itself is guarded against drift by `release-facts.test.ts`
    // against the real `desktop:release-artifact` chain.
    const downloadCopy = { en: JSON.stringify(en.download), ko: JSON.stringify(ko.download) };
    assert.doesNotMatch(downloadCopy.en, /Not signed yet|Open Anyway|certificate pending/i);
    assert.doesNotMatch(downloadCopy.ko, /아직 서명되지 않음|확인 없이 열기|인증서 준비 중/);
    assert.match(en.download.proofSigned, /Developer ID/);
    assert.match(ko.download.proofSigned, /Developer ID/);

    // Most visitors do not know their own Mac's architecture. Naming both and
    // stopping there leaves them stuck in front of two buttons.
    assert.match(en.download.archHelpBody, /About This Mac/i);
    assert.match(ko.download.archHelpBody, /이 Mac에 관하여/);

    // Local-first is the product's promise; a stranger about to run an
    // unfamiliar binary needs it stated, not implied.
    assert.match(en.download.trustPrivacyNote, /No account, no server/i);
    assert.match(ko.download.trustPrivacyNote, /계정도 서버도 없습니다/);

    // The release-notes excerpt used to be a hand-maintained Korean constant
    // rendered verbatim on the English page. Whatever replaces it must not
    // reintroduce a second, locale-blind copy of the changelog.
    for (const gone of ['releaseNotesHeading', 'releaseNotesSource', 'releaseNotesCaption']) {
      assert.equal(en.download[gone], undefined, `download.${gone} must stay removed`);
      assert.equal(ko.download[gone], undefined, `download.${gone} must stay removed`);
    }

    // Windows is named rather than omitted, so a Windows visitor learns where
    // they stand instead of guessing whether the product excludes them.
    //
    // 2026-07-29 — 그 사실이 **자리를 옮겼다**(주장은 그대로다). 예전에는
    // 접힘 아래 별도 행(`windowsPendingBadge`/`windowsPendingBody`)이었는데,
    // 받는 자리에서 알아야 늦지 않으므로 판 안 한 줄(`platformStatus`)로
    // 올라갔고, 정책 산문("같은 기준을 통과할 때")은 결정 재료가 아니라
    // 푸터 접이식(`windowsPolicy`)으로 내려갔다. 게이트가 지키는 것은 키
    // 이름이 아니라 **두 사실이 어딘가에는 있다**는 것이다.
    assert.match(en.download.platformStatus, /Windows/);
    assert.match(ko.download.platformStatus, /Windows/);
    assert.match(en.download.windowsUnsignedWarning, /not code-signed/i);
    assert.match(en.download.windowsUnsignedWarning, /SmartScreen/i);
    assert.match(ko.download.windowsUnsignedWarning, /코드 서명되지 않았습니다/);
    assert.match(ko.download.windowsUnsignedWarning, /SmartScreen/i);

    // A domain that does not resolve must not be cited as fact.
    assert.doesNotMatch(JSON.stringify(en.download), /ontology-atlas\.dev/);
    assert.doesNotMatch(JSON.stringify(ko.download), /ontology-atlas\.dev/);
  });

  it('keeps Korean primary navigation understandable without topology jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    // feat/rail-rollout retired `OperationsNav`/`OntologySubNav`/`ModeBadge`
    // (their top-tab, sub-tab, and vault-chip copy below) — `navRail.*` (the
    // AppNavRail rail + BottomTabBar's shared label source) is now the one
    // primary-navigation copy surface for both desktop and mobile.
    /*
     * ⚠️ **값이 아니라 성격을 잠근다** (2026-08-12).
     *
     * 종전에는 다섯 라벨을 문자열로 못박았다(`'공방'` · `'인사이트'` …). 그런데 이
     * 시험의 이름이 말하는 의도는 「**알아들을 수 있는 말인가**」이고, 못박기는 그
     * 의도와 반대로 작동했다 — 소유자가 *"'그래프 인사이트' 이거 뭔말인지 모르겠음"*
     * 이라고 지적했을 때, 이름을 고치려면 **먼저 이 시험을 고쳐야** 했다. 게이트가
     * 규격을 좋게 바꾸는 것을 막는 모양이고, 이 저장소가 문서 게이트에서 이미 내린
     * 결론(사람이 쓴 문장을 못박지 않는다)과 같은 자리다.
     *
     * 그래서 잠그는 것을 성질로 바꾼다: ① 다섯 자리가 다 채워져 있다 ② 전문용어와
     * **알아듣기 어려운 외래어**가 없다 ③ 라벨은 짧다(레일 폭에 들어간다).
     * 무슨 단어를 고르는지는 사람의 판단이고, 이 시험이 대신하지 않는다.
     */
    const railLabels = [
      ko.navRail.map,
      ko.navRail.docs,
      ko.navRail.studio,
      ko.navRail.insights,
      ko.navRail.projects,
      ko.navRail.skills,
      ko.navRail.git,
    ];
    for (const label of railLabels) {
      assert.equal(typeof label, 'string');
      assert.ok(label.trim().length > 0, '레일 라벨이 비었다');
      // 레일은 좁다 — 긴 라벨은 줄바꿈되거나 잘린다(36px 타일 계약).
      assert.ok(label.length <= 5, `레일 라벨이 너무 길다: ${label}`);
    }
    assert.doesNotMatch(
      railLabels.join('\n'),
      /지형도|토폴로지|운영|Operations/,
      '레일에 전문용어가 들어왔다',
    );
    /*
     * 알아듣기 어려운 외래어 금지. 「인사이트」가 여기 있는 이유: 소유자가 실제로 그
     * 화면 이름을 못 알아봤다(2026-08-12). 「빌더」는 은퇴한 이름이라 되돌아오는
     * 것을 막는다.
     *
     * 「스튜디오」는 2026-08-12 소유자 결정으로 금지에서 뺐다 — 조립대(← 공방
     * ← 스튜디오)를 두 번 갈아 본 끝에 *"조합대라는 이름 별로야.. 좀
     * 보편적이어도 되는데"* → *"스튜디오로 가자"*. 라우트가 원래
     * /ontology/studio 라 주소와 라벨이 처음으로 같은 말을 하게 됐다.
     * 원장: docs/DECISIONS.md 2026-08-12 「쓰기 화면의 이름은 스튜디오다」.
     */
    assert.doesNotMatch(
      railLabels.join('\n'),
      /인사이트|빌더|온톨로지/,
      '레일에 알아듣기 어려운 외래어가 들어왔다',
    );
    /*
     * 한 목적지 한 이름 (2026-08-13). /git 화면은 자기를 「기록」이라 부르는데
     * 레일만 「Git」이었다 — 레일의 다른 항목은 전부 한국어인데 여기만 개발자
     * 용어가 샜고, 같은 목적지가 이름 둘을 갖게 됐다. 단어를 못박는 대신
     * **두 표면이 같은 이름을 쓰는가**를 잠근다(사람이 고른 문장을 고정하지
     * 않는다는 문서 게이트 원칙 그대로 — 이름을 바꾸려면 두 곳을 같이 바꾸면
     * 되고, 이 시험은 안 바뀐 쪽을 가리킨다).
     */
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    assert.equal(
      ko.navRail.git,
      ko.atlasGit.title,
      '레일의 기록 라벨이 그 화면 제목과 다르다 — 한 목적지가 이름 둘을 갖는다',
    );
    assert.equal(
      en.navRail.git,
      en.atlasGit.title,
      'rail git label must match the destination title — one destination, one name',
    );
    assert.equal(
      ko.nav.settingsMenu.triggerTitle,
      '화면, 언어, 작업공간, AI 에이전트 연결을 한 곳에서 조정합니다',
    );
    assert.equal(ko.nav.settingsMenu.groupWorkspace, '작업공간');
    assert.equal(ko.nav.settingsMenu.workspaceFolderLabel, '작업공간 폴더');
    assert.equal(ko.nav.settingsMenu.vaultTitle, '문서함');
    assert.equal(
      ko.nav.settingsMenu.vaultBodyLocal,
      '작업공간 문서를 열어 파일과 개념을 확인해요',
    );
    assert.equal(ko.nav.settingsMenu.vaultCtaLocal, '열기');
    assert.equal(ko.topology.documentTitle, '지도');
    // 구 topologyWidgets.controls 단축키/depth 카피(depthHop·shortcutDepthAll·
    // shortcutDoubleClick·shortcutEsc)는 죽은 "지도 조절" 패널 철거(2026-07-21)로
    // 사라졌다 — Fit 타일만 남아 fitViewTooltip/fitViewAriaLabel 만 검증한다.
    assert.equal(ko.topologyWidgets.controls.fitViewAriaLabel, '지도 전체 맞추기');
    assert.equal(ko.topology.analysis.overviewAgentReadiness, 'AI가 이어서 작업할 준비');
    assert.equal(ko.topology.analysis.overviewAgentReadinessReady, '준비됨');
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
    // 2026-08-02 — 세 이름이 전부 「AI」로 시작해 첫 글자로 안 갈렸다
    // (「AI 에이전트」 절 · 「AI 에이전트 연결」 행 · 「AI 연결」 서브뷰). 복도가
    // 사라지며 두 목적지가 LNB 로 올라왔고 이름이 「내」/「앱 안」으로 갈렸다.
    // 얼린 문장 대신 **절 이름 전체**를 스캔한다.
    const visibleCopy = [
      JSON.stringify(settings.section),
      settings.agentStatusNoVault,
      settings.agentNoVaultHint,
      settings.mcpProofTitle,
      settings.mcpProofBody,
      settings.mcpProofCopy,
      settings.mcpProofCopied,
    ].join('\n');

    assert.equal(settings.mcpProofTitle, 'MCP 첫 호출');
    assert.match(visibleCopy, /에이전트/);
    // 두 목적지의 이름이 **첫 글자로** 갈린다 — 같은 글자로 시작하면 눈이 못
    // 가른다는 것이 이 개명의 근거였으므로, 그 성질을 그대로 잠근다.
    assert.notEqual(settings.section.agent[0], settings.section.ai[0]);
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
    assert.match(live.triggerTitle, /개념/);
    assert.doesNotMatch(live.triggerTitle, /온톨로지/);
    assert.match(live.triggerTitle, /AI 작업 상태/);
    assert.doesNotMatch(
      visibleCopy,
      /\bLive\b|ontology node|agent heartbeat|Agent heartbeat|\bagent\b|\bfresh\b|\bfocus\b|\bnode\b|\btracking\b|\binvalid\b|\bstale\b|\bsource\b|\breview\b|\btarget\b/,
    );
  });

  it('keeps the topology overview agent handoff brief readable (분석 패널 완전 소멸 2단계 — TopologyAnalysisBar 삭제 후 INDEX 푸터 인계 메뉴가 유일한 소비처)', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(en.topology.controls.docsTooltip, 'Quick view of the doc library (D)');
    assert.equal(
      en.topology.controls.docsAriaLabel,
      'Open the doc library quick view (D)',
    );
    assert.equal(en.topology.controls.docsLabel, 'Workspace');
    assert.doesNotMatch(
      [
        en.topology.controls.docsTooltip,
        en.topology.controls.docsAriaLabel,
        en.topology.controls.docsLabel,
      ].join('\n'),
      // `Quick view` 는 2026-07-26 평문화에서 되살아났다 — 옛 금지 목록의 나머지(See all·Pick one 류
      // 모호 라벨)와 달리 이건 대상을 명시한다("Quick view of the doc library"). 「온톨로지」를
      // 브랜드 자리 밖에서 쓰지 않는다는 최신 규율과 충돌해 이 한 항목만 해제한다.
      /See all|Pick one|See links|Clean up health|Source vault|source vault|^Source$/m,
    );

    assert.equal(ko.topology.analysis.overviewBriefCopyAriaLabel, '지도 요약 복사');
    assert.equal(ko.topology.analysis.overviewBriefCopiedAriaLabel, '지도 요약 복사됨');
    assert.equal(ko.topology.analysis.overviewBriefTitle, '지도 요약');
    assert.equal(ko.topology.analysis.overviewBriefHealthSignals, '상태 신호');
    assert.equal(ko.topology.analysis.overviewBriefHealthUrl, '상태 점검 URL');
    assert.equal(ko.topology.analysis.overviewBriefInsightsUrl, '연결·검증 URL');
    assert.equal(ko.topology.analysis.overviewBriefAgentCheck, '에이전트 전체 점검');
    assert.equal(ko.topology.analysis.overviewBriefMcpCheck, 'MCP 전체 점검');
    assert.equal(ko.topology.analysis.overviewBriefMcpQueryPlan, 'MCP 질의 계획');
    assert.equal(ko.topology.analysis.overviewBriefWorkspaceCheck, '작업공간 점검');
    assert.equal(ko.topology.analysis.overviewBriefMcpWorkspaceCheck, 'MCP 작업공간 점검');
    assert.equal(ko.topology.controls.docsTooltip, '문서함 빠른 보기 (D)');
    assert.equal(
      ko.topology.controls.docsAriaLabel,
      '문서함 빠른 보기 열기 (D)',
    );
    assert.equal(ko.topology.controls.docsLabel, '작업공간');
    assert.equal(ko.topology.controls.relayoutToast, '지도를 다시 정렬합니다');
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
      // `문서함` 은 2026-07-26 평문화가 고른 평문 한국어다 — 옛 라운드에서 모호 라벨과 함께
      // 묶여 있었으나, 지금은 이 표면의 정식 이름이라 이 항목만 해제한다. 나머지(토폴로지·
      // Topology·overview 류 전문어와 '전체 보기' 류 모호 라벨)는 그대로 막는다.
      /전체 보기|하나 선택|연결 보기|상태 정리|^문서$|토폴로지|Topology|overview brief|overview|query plan|Workspace|workspace|Health 신호/m,
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
    assert.equal(koCopy.pathChipCopyPacket, 'AI에게 줄 경로 정보 복사');
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

    /*
     * ⚠️ **정확한 집합으로 못박지 않는다** (2026-08-10 에 좁혔다).
     *
     * 종전에는 `deepEqual(keys, ['controls','hubRail'])` 였다. 그런데 이 시험이
     * **말하는 목적**은 「은퇴한 sigma/contextMenu/edgeTooltip 이 되살아나지
     * 못하게」다 — 정확한 집합을 박으면 **정당한 추가에도 터진다**(실제로
     * `keyboardWalk` 를 더하다 걸렸다). 그런 게이트는 다음 사람이 게이트 대신
     * 기능 쪽을 되돌리게 만든다(`documentation.md` · `/gate-probe`).
     *
     * 그래서 거부 목록으로 판정한다. 새 절은 자유롭게 늘고, 은퇴한 이름은
     * 되돌아오지 못한다.
     */
    const RETIRED = ['sigma', 'contextMenu', 'edgeTooltip'];
    for (const [locale, messages] of [['ko', ko], ['en', en]]) {
      const keys = Object.keys(messages.topologyWidgets);
      assert.ok(keys.length > 0, `${locale}: topologyWidgets 가 비었다 — 이 시험이 공회전한다`);
      for (const retired of RETIRED) {
        assert.ok(
          !keys.includes(retired),
          `${locale}: 은퇴한 topologyWidgets.${retired} 가 되살아났다`,
        );
      }
    }
    // 아직 소비처가 있는 둘은 사라지면 안 된다.
    for (const [locale, messages] of [['ko', ko], ['en', en]]) {
      for (const kept of ['controls', 'hubRail']) {
        assert.ok(
          Object.keys(messages.topologyWidgets).includes(kept),
          `${locale}: topologyWidgets.${kept} 가 사라졌다 (소비처가 남아 있다)`,
        );
      }
    }
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

    assert.equal(ko.docsVault.desktopWelcome.title, '로컬 문서함을 열거나 만드세요');
    assert.equal(ko.docsVault.desktopWelcome.contractAriaLabel, '문서함 실행 계약');
    assert.equal(ko.docsVault.desktopWelcome.contractFilesLabel, '문서함 파일');
    assert.equal(ko.docsVault.desktopWelcome.contractGraphValue, '문서 속성이 의미 그래프');
    assert.equal(ko.docsVault.desktopWelcome.contractAgentLabel, 'AI 확인');
    assert.equal(ko.docsVault.desktopWelcome.actionsAriaLabel, '문서함 시작 액션');
    assert.equal(ko.docsVault.sourceContract.filesLabel, '문서함 파일');
    assert.equal(ko.docsVault.sourceContract.graphValue, '개념 {nodes}개 · 관계 {edges}개');
    assert.equal(ko.docsVault.sourceContract.agentLabel, 'AI 확인');
    assert.match(ko.docsVault.desktopWelcome.body, /문서 상단의 속성/);
    assert.match(ko.docsVault.desktopWelcome.contractGraphValue, /문서 속성/);
    assert.match(ko.docsVault.sourceContract.graphBody, /지도/);
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
      en.nav.settingsMenu.groupWorkspace,
      en.nav.settingsMenu.workspaceFolderLabel,
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
    assert.equal(en.nav.settingsMenu.vaultTitle, 'Library');
    assert.equal(en.nav.settingsMenu.vaultCtaLocal, 'Open');
    assert.equal(en.nav.settingsMenu.vaultCtaStatic, 'Get started');
    assert.equal(en.docsVault.desktopWelcome.title, 'Open or create a local workspace');
    assert.equal(en.docsVault.desktopWelcome.contractAriaLabel, 'Workspace contract');
    assert.equal(en.docsVault.desktopWelcome.contractFilesLabel, 'Workspace files');
    assert.equal(en.docsVault.desktopWelcome.contractGraphValue, 'Document properties become a meaning graph');
    assert.equal(en.docsVault.desktopWelcome.contractAgentLabel, 'AI check');
    assert.equal(en.docsVault.desktopWelcome.actionsAriaLabel, 'Workspace setup actions');
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
      /frontmatter|vault|Vault|Source Vault|source vault|Source records|source records|Graph DB|graph DB|DB proof|nodes \{nodes\}|proof gate|relation_name_parity|pattern_walk|project_map/,
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

    const handoffLabels = [
      ko.topology.index.agentHandoffAria,
      en.topology.index.agentHandoffAria,
    ];
    assert.equal(handoffLabels.length, 2, 'both configured locales must expose the INDEX AI work-menu label');
    for (const label of handoffLabels) {
      assert.equal(typeof label, 'string');
      assert.ok(label.trim().length > 0, 'INDEX AI work-menu labels must not be empty');
    }

    assert.match(ko.topology.index.agentHandoffAria, /AI 작업 메뉴/);
    assert.match(ko.topology.index.agentHandoffAria, /프로젝트 정보 복사/);
    assert.match(ko.topology.index.agentHandoffAria, /다시 분석/);
    assert.match(ko.topology.index.agentHandoffAria, /최신 상태 확인/);
    assert.doesNotMatch(
      ko.topology.index.agentHandoffAria,
      /인계문|넘길 메모|동기화 게이트|재분석 지시/,
    );

    assert.match(en.topology.index.agentHandoffAria, /AI work menu/i);
    assert.match(en.topology.index.agentHandoffAria, /copy project info/i);
    assert.match(en.topology.index.agentHandoffAria, /re-analy[sz]e/i);
    assert.match(en.topology.index.agentHandoffAria, /latest status/i);
  });

  it('keeps active download/settings copy free of untranslated English nouns mixed into Korean sentences', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const settings = ko.nav.settingsMenu;
    // 2026-07-27 — 구 `download.includeCliBody` 한 줄만 고정하던 것을
    // download 네임스페이스 **전체 스캔**으로 넓혔다. 문자열 하나를 얼려
    // 두면 그 문자열이 사라지는 순간 게이트도 같이 사라진다(그 일이
    // `/download` 리메이크에서 실제로 일어날 뻔했다). 지키려던 것은 특정
    // 문장이 아니라 "한국어 문장 안에 번역되지 않은 영어 명사가 섞이지
    // 않는다" 는 규칙이다.
    const mixedLanguageCopy = [
      JSON.stringify(ko.download),
      // LNB 절 이름 — 2026-08-02 에 「AI 에이전트」 한 줄이 「내 에이전트 연결」·
      // 「앱 안 에이전트」 두 목적지로 갈렸다. 문자열 하나를 얼리는 대신 절
      // 이름 **전체**를 스캔에 넣는다(위 주석과 같은 이유다 — 얼린 문장은
      // 사라지는 순간 게이트도 데려간다. 구 `settings.agentBody` 고정이 정확히
      // 그 부류였고, 복도가 사라지며 함께 사라졌다).
      JSON.stringify(settings.section),
      settings.agentNoVaultHint,
      settings.mcpProofBody,
    ].join('\n');

    assert.equal(
      settings.agentNoVaultHint,
      '작업공간 폴더를 열면 설정 파일 상태 확인과 수리를 여기서 할 수 있어요.',
    );
    assert.equal(
      settings.mcpProofBody,
      '연결 여부는 이 화면만으로 단정하지 않고 에이전트 세션에서 증명합니다. Codex나 Claude에 서버가 보이면 이 첫 호출 안내를 붙여넣으세요.',
    );
    assert.doesNotMatch(
      mixedLanguageCopy,
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
