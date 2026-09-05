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

  /*
   * ⚠️ **A borrowed label is not a name.** "Unmatched" is the word the reference product
   * this list was studied from puts in its own navigation. Shipping it here would make
   * Atlas's screen quote a competitor's vocabulary for a fact Atlas states differently:
   * these are names this folder was asked for and does not hold, not rows that failed to
   * match something. The key stays `unmatched` because it is a URL parameter people have
   * bookmarked; only what a person reads is checked (design-lead, 2026-09-05).
   */
  it('never puts the reference product\'s label in front of a person', async () => {
    for (const locale of ['en', 'ko']) {
      const messages = await readJson(path.join(MESSAGES_DIR, `${locale}.json`));
      const offenders = [];
      const walk = (node, trail) => {
        if (typeof node === 'string') {
          if (/unmatched/i.test(node)) offenders.push(trail);
          return;
        }
        if (node && typeof node === 'object') {
          for (const [key, value] of Object.entries(node)) walk(value, `${trail}.${key}`);
        }
      };
      walk(messages, locale);
      assert.deepEqual(
        offenders,
        [],
        `these strings say "unmatched", which is the reference product's label: ${offenders.join(', ')}`,
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
    // 2026-07-29 — the size **left the translation string** (council verdict ④).
    // With `· {size}` inside the label, a `whitespace-nowrap` button overflows the
    // panel at 320px (measured, en: 22px over), and an interpolation inside the
    // string cannot be pulled out responsively on its own. An `AssetSize` span
    // renders it now — the syntax the Intel button already used, so the two buttons
    // matching is a bonus.
    //
    // What this gate guarded was "the catalog holds no second copy of a release
    // fact", and that discipline is now **stronger**: the label names only the
    // architecture. Whether the size actually renders is verified by
    // `DownloadPage.test.tsx` against the generated module's value (`12.4 MB`).
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

    // Local-first describes Atlas storage, not provider-owned agent traffic.
    // The page must state both boundaries instead of promising zero network.
    assert.match(en.download.trustPrivacyNote, /No Atlas account or backend/i);
    assert.match(en.download.trustPrivacyNote, /does not upload/i);
    assert.match(en.download.trustPrivacyNote, /coding agent.*provider/i);
    assert.match(ko.download.trustPrivacyNote, /Atlas 계정도 백엔드도 없습니다/);
    assert.match(ko.download.trustPrivacyNote, /Atlas가 업로드하지 않습니다/);
    assert.match(ko.download.trustPrivacyNote, /코딩 에이전트.*제공자/);
    assert.doesNotMatch(en.download.trustPrivacyNote, /never transmitted|nothing sent/i);
    assert.doesNotMatch(ko.download.trustPrivacyNote, /어디로도 전송되지|아무것도 보내지/);

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
    // 2026-07-29 — that fact **moved** (the claim is unchanged). It used to be its own
    // row under a disclosure (`windowsPendingBadge`/`windowsPendingBody`); knowing it at
    // the point of download is what makes it timely, so it moved up into a single line
    // inside the panel (`platformStatus`), while the policy prose ("when it passes the
    // same bar") went down into a footer disclosure (`windowsPolicy`) since it is not
    // decision material. What the gate guards is not the key names but that **both facts
    // exist somewhere**.
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
     * ⚠️ **Lock the property, not the value** (2026-08-12).
     *
     * This used to pin five labels as literal strings (`'Workshop'`, `'Insight'`, …). But
     * the intent stated in this test's own name is "is this understandable", and
     * pinning worked against that intent: when the owner said *"I have no idea what
     * 'Graph Insight' means"*, fixing
     * the name required **fixing this test first**. That is a gate blocking an
     * improvement to the spec — the same conclusion this repository already reached
     * for doc gates: do not pin sentences a human wrote.
     *
     * So what is locked becomes a property: ① all six slots are filled ② no jargon and
     * no **hard-to-understand loanwords** ③ labels are short (they fit the rail width).
     * Which word to choose is a human judgement this test does not make.
     */
    const railLabels = [
      ko.navRail.map,
      ko.navRail.docs,
      ko.navRail.insights,
      ko.navRail.projects,
      ko.navRail.agents,
      ko.navRail.git,
    ];
    for (const label of railLabels) {
      assert.equal(typeof label, 'string');
      assert.ok(label.trim().length > 0, '레일 라벨이 비었다');
      // The rail is narrow — a long label wraps or truncates (the 36px tile contract).
      assert.ok(label.length <= 5, `레일 라벨이 너무 길다: ${label}`);
    }
    assert.doesNotMatch(
      railLabels.join('\n'),
      /지형도|토폴로지|운영|Operations/,
      '레일에 전문용어가 들어왔다',
    );
    /*
     * Ban hard-to-understand loanwords. "Insight" is on this list because the owner
     * genuinely did not recognise that screen's name (2026-08-12). "Builder" is a
     * retired name and is blocked from coming back.
     *
     * "Studio" came off the ban list by owner decision on 2026-08-12, after the
     * name was changed twice (Workshop → Assembly Table → Studio): *"The name 'Assembly
     * Table' isn't great.. it should be more common"* → *"Let's go with Studio"* (that name is no good; something
     * more common is fine → let's go with studio). The route was already
     * /ontology/studio, so address and label finally say the same thing.
     * Ledger: docs/DECISIONS.md 2026-08-12 "The name of the writing screen is Studio".
     */
    assert.doesNotMatch(
      railLabels.join('\n'),
      /인사이트|빌더|온톨로지/,
      '레일에 알아듣기 어려운 외래어가 들어왔다',
    );
    /*
     * One destination, one name (2026-08-13). The /git screen calls itself "Records"
     * while only the rail said "Git" — every other rail item is Korean, developer
     * vocabulary leaked into just this one, and one destination ended up with two
     * names. Instead of pinning the word, this locks **whether the two surfaces use
     * the same name** (the same doc-gate principle of not fixing sentences a human
     * chose — to rename, change both places, and this test points at whichever one
     * was not changed).
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
    // The old topologyWidgets.controls shortcut/depth copy (depthHop,
    // shortcutDepthAll, shortcutDoubleClick, shortcutEsc) went with the removal of the
    // dead map-controls panel (2026-07-21). Only the Fit tile remains, so only
    // fitViewTooltip is verified — its `fitViewAriaLabel` twin went on 2026-09-05 when
    // the rail tiles started showing their labels: a `ChromeTile` in label mode takes
    // its accessible name from the word on screen, so a second name could only differ
    // from it (WCAG 2.5.3).
    assert.equal(ko.topologyWidgets.controls.fitViewTooltip, '지도 전체 맞추기');
    assert.equal(ko.topology.analysis.overviewAgentReadiness, 'AI가 이어서 작업할 준비');
    assert.equal(ko.topology.analysis.overviewAgentReadinessReady, '준비됨');
    assert.equal(ko.topology.analysis.overviewAgentReadinessPreflight, '사전 점검');
    assert.doesNotMatch(
      [
        ko.topologyWidgets.controls.fitViewTooltip,
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
    // 2026-08-02 — three names all started with "AI" so the eye could not separate
    // them by first character (the "AI Agent" section, the "Connect AI Agent"
    // row, and the "AI Connection" subview). With the corridor gone, two destinations moved
    // up into the LNB and the names split into "My"/"In-app". Instead of frozen
    // sentences, this scans **the whole section-name set**.
    const visibleCopy = [
      JSON.stringify(settings.section),
      settings.goToAgents,
      settings.agentStatusNoVault,
      settings.agentNoVaultHint,
      settings.mcpProofTitle,
      settings.mcpProofBody,
      settings.mcpProofCopy,
      settings.mcpProofCopied,
    ].join('\n');

    assert.equal(settings.mcpProofTitle, '실제로 연결됐는지 확인하기');
    assert.match(visibleCopy, /에이전트/);
    /*
     * ⚠️ **Re-aimed 2026-08-21** (ledger 90). This used to compare the first characters
     * of `section.agent` and `section.ai`. The `agent` section then left for the
     * "Agent" destination — what remains in the sheet is a **signpost row** pointing
     * there.
     *
     * The **locked property is unchanged**: within the connect group, can the eye
     * separate the two rows by first character? That they cannot when both start with
     * the same character was the basis for the rename.
     */
    assert.notEqual(settings.goToAgents[0], settings.section.ai[0]);
    assert.doesNotMatch(visibleCopy, /\bAgent\b|\bFallback\b|\bclient\b|\bnamespace\b|\breload\b|\brestart\b|graph DB gate/);
  });

  // (Removed 2026-09-01) The liveActivity namespace had no renderer anywhere in src/
  // or app/ and was deleted from both catalogs; this block was its last reader.

  it('keeps the topology overview agent handoff brief readable (분석 패널 완전 소멸 2단계 — TopologyAnalysisBar 삭제 후 INDEX 푸터 인계 메뉴가 유일한 소비처)', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    assert.equal(en.topology.controls.docsTooltip, 'Quick view of the doc library (D)');
    assert.equal(
      en.topology.controls.docsAriaLabel,
      'Open the doc library quick view (D)',
    );
    assert.equal(en.topology.controls.docsLabel, 'Docs');
    assert.doesNotMatch(
      [
        en.topology.controls.docsTooltip,
        en.topology.controls.docsAriaLabel,
        en.topology.controls.docsLabel,
      ].join('\n'),
      // `Quick view` came back in the 2026-07-26 plain-language pass. Unlike the rest of
      // the old ban list (vague labels of the See all / Pick one kind) it names its
      // object ("Quick view of the doc library"). It conflicts with the current rule that
      // "Ontology" is not used outside brand positions, so this one entry is released.
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
    assert.equal(ko.topology.controls.docsLabel, '문서함');
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
      // `Document Room` is the plain Korean the 2026-07-26 pass chose. An earlier round grouped
      // it with the vague labels, but it is now this surface's official name, so only this
      // entry is released. The rest — jargon of the Topology / overview kind and
      // vague labels like 'View All' — stays blocked.
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
     * ⚠️ **Do not pin an exact set** (narrowed 2026-08-10).
     *
     * This used to be `deepEqual(keys, ['controls','hubRail'])`. But the purpose this
     * test **states** is "the retired sigma/contextMenu/edgeTooltip must not come back",
     * and pinning an exact set **breaks on legitimate additions** too — it actually
     * caught adding `keyboardWalk`. Such a gate makes the next person revert the feature
     * rather than the gate (`.claude/rules/documentation.md`, `/gate-probe`).
     *
     * So the verdict is a denylist. New sections grow freely; retired names cannot
     * return.
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
    // The two that still have consumers must not disappear.
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
    // folder-topology was removed; assert those command keys have not come back.
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
    /*
     * ⚠️ **Wording is no longer pinned here** (2026-08-22). These two used to pin
     * 'Document Execution Contract' and 'Document Property Meaning Graph'. `docs/GLOSSARY.md` retired
     * "Contract" and "Document Property" as screen words — the very jargon this test's name
     * says it guards against — so the pins broke on a change made *in their
     * direction*. Pinning an authored sentence is what `documentation.md` forbids;
     * what is checked now is the property, and `ui-copy-glossary.contract.test.ts`
     * owns the banned-word list.
     */
    assert.doesNotMatch(ko.docsVault.desktopWelcome.contractAriaLabel, /계약/);
    assert.ok(ko.docsVault.desktopWelcome.contractAriaLabel.length > 0);
    assert.equal(ko.docsVault.desktopWelcome.contractFilesLabel, '문서함 파일');
    assert.doesNotMatch(ko.docsVault.desktopWelcome.contractGraphValue, /문서 속성|프론트매터/);
    assert.equal(ko.docsVault.desktopWelcome.contractAgentLabel, 'AI 확인');
    assert.equal(ko.docsVault.desktopWelcome.actionsAriaLabel, '문서함 시작 액션');
    assert.equal(ko.docsVault.sourceContract.filesLabel, '문서함 파일');
    assert.equal(ko.docsVault.sourceContract.graphValue, '개념 {nodes}개 · 관계 {edges}개');
    assert.equal(ko.docsVault.sourceContract.agentLabel, 'AI 확인');
    // The plain phrase replaced "Properties at the top of the document" / "Document Properties" — both screens now
    // say "File Top Info Bar", and the glossary gate keeps the old names out.
    assert.match(ko.docsVault.desktopWelcome.contractGraphValue, /정보칸/);
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

    assert.equal(en.metadata.pages.docs, 'Docs');
    // `nav.docs`/`nav.tooltipDocs`/`modeBadge.*` retired with `OperationsNav`/
    // `ModeBadge` (feat/rail-rollout) — `navRail.docs` (shared by AppNavRail +
    // BottomTabBar) is the one surviving primary-nav label for this surface.
    assert.equal(en.navRail.docs, 'Docs');
    assert.equal(en.nav.settingsMenu.vaultTitle, 'Library');
    assert.equal(en.nav.settingsMenu.vaultCtaLocal, 'Open');
    assert.equal(en.nav.settingsMenu.vaultCtaStatic, 'Get started');
    assert.equal(en.docsVault.desktopWelcome.title, 'Open or create a local workspace');
    // Property, not wording — see the Korean half of this file for why.
    assert.doesNotMatch(en.docsVault.desktopWelcome.contractAriaLabel, /\bcontract\b/i);
    assert.ok(en.docsVault.desktopWelcome.contractAriaLabel.length > 0);
    assert.equal(en.docsVault.desktopWelcome.contractFilesLabel, 'Workspace files');
    assert.doesNotMatch(en.docsVault.desktopWelcome.contractGraphValue, /frontmatter/i);
    assert.equal(en.docsVault.desktopWelcome.contractAgentLabel, 'AI check');
    assert.equal(en.docsVault.desktopWelcome.actionsAriaLabel, 'Workspace setup actions');
    assert.doesNotMatch(en.docsVault.sourceContract.ariaLabel, /\bcontract\b/i);
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
    assert.equal(ko.featuresMisc.starterCta.proofGraphLabel, '서로 맞는지 확인함');
    assert.equal(ko.featuresMisc.starterCta.proofAgentLabel, 'AI가 확인하는 순서');
    assert.equal(ko.featuresMisc.starterCta.copyCliLabel, '터미널 근거 복사');
    assert.equal(ko.featuresMisc.starterCta.copyJsonGateLabel, '자동 점검 명령 복사');
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

  });

  it('keeps active download/settings copy free of untranslated English nouns mixed into Korean sentences', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const settings = ko.nav.settingsMenu;
    // 2026-07-27 — widened from pinning the single old `download.includeCliBody` line
    // to **scanning the whole download namespace**. Freezing one string means the gate
    // disappears the moment that string does (which nearly happened in the `/download`
    // remake). What was being guarded is not a particular sentence but the rule that
    // untranslated English nouns are not mixed into Korean sentences.
    const mixedLanguageCopy = [
      JSON.stringify(ko.download),
      // LNB section names — on 2026-08-02 the single "AI Agent" row split into two
      // destinations, "Connect My Agent" and "In-app Agent". Instead of freezing one
      // string, the **whole** section-name set goes into the scan (same reason as the
      // comment above — a frozen sentence takes the gate with it when it disappears; the
      // old `settings.agentBody` pin was exactly that, and it went with the corridor).
      JSON.stringify(settings.section),
      settings.agentNoVaultHint,
      settings.mcpProofBody,
    ].join('\n');

    /*
     * ⚠️ **The `assert.equal` on `agentNoVaultHint` was removed on 2026-09-05**, for the reason
     * this test's own comments give twice: freezing a sentence takes the gate with it when the
     * sentence changes, and it fires on correct edits. It fired on one — the design council
     * replaced 「작업공간」 with 「폴더」, which is the vocabulary rule
     * (`user-facing-vocabulary.contract.test.ts`) being followed, not broken.
     *
     * The string stays in `mixedLanguageCopy` below, so what this test is actually for — no
     * untranslated English noun dropped into a Korean sentence — still covers it. The rule is
     * guarded; the wording is not pinned.
     */
    assert.equal(
      settings.mcpProofBody,
      '이 화면만으로는 연결을 장담할 수 없어요. Codex나 Claude에서 이 서버가 보이면, 아래 첫 질문을 복사해 붙여넣어 에이전트가 이 폴더의 개념으로 답하는지 확인해 보세요.',
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
  // next-intl parses `<tag>` as a rich-text tag. A literal `<...>` inside a message
  // consumed through plain t() is a runtime error, and the user sees the raw key
  // (the agentConnect.manualPathHint incident). This compiles every message in
  // tag-enabled mode to catch broken syntax (unclosed tags, invalid ICU); it does not
  // check whether a tag-using key is consumed through t.rich (a separate convention).
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
            // Compile without ignoreTag — the same tag-parsing conditions as next-intl.
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
