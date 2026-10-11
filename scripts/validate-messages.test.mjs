import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import { composeAll, listLocales } from './build-messages.mjs';

const ROOT = process.cwd();
const MESSAGES_DIR = path.join(ROOT, 'messages');
const ROUTING_FILE = path.join(ROOT, 'src/i18n/routing.ts');

describe('i18n message catalog', () => {
  // The authored catalogue is messages/<locale>/<Namespace>.json; messages/<locale>.json
  // is the composite scripts/build-messages.mjs generates. Parity is judged on the parts
  // so a stale composite cannot hide a missing key.
  it('has one message directory per configured locale', async () => {
    const locales = await readRoutingLocales();
    assert.deepEqual(listLocales(ROOT), [...locales].sort());
  });

  it('keeps translation key shape identical across locales', async () => {
    const locales = await readRoutingLocales();
    const [baseLocale, ...otherLocales] = locales;
    const { composites, problems } = composeAll(ROOT);
    assert.deepEqual(problems, [], 'every namespace exists in every locale');
    const baseMessages = JSON.parse(composites.get(baseLocale));
    const baseKeys = flattenKeys(baseMessages);

    for (const locale of otherLocales) {
      const messages = JSON.parse(composites.get(locale));
      assert.deepEqual(
        flattenKeys(messages),
        baseKeys,
        `${locale}.json keys must match ${baseLocale}.json`,
      );
    }
  });

  /*
   * The key stays `unmatched` because it is a bookmarked URL parameter; only what a person reads is
   * checked. "Unmatched" is a reference product's navigation word and must not appear on screen.
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

    assert.match(en.download.primaryCtaPublished, /Apple Silicon/);
    assert.match(ko.download.primaryCtaPublished, /Apple Silicon/);
    for (const [locale, value] of [
      ['en', en.download.primaryCtaPublished],
      ['ko', ko.download.primaryCtaPublished],
    ]) {
      assert.doesNotMatch(value, /\{size\}/, `${locale}: 크기는 스팬이 그린다`);
      assert.doesNotMatch(value, /\bMB\b|\bGB\b/, `${locale}: 크기 리터럴 금지`);
    }
    assert.match(en.download.factShaLink, /\{file\}/);

    const downloadCopy = { en: JSON.stringify(en.download), ko: JSON.stringify(ko.download) };
    assert.doesNotMatch(downloadCopy.en, /Not signed yet|Open Anyway|certificate pending/i);
    assert.doesNotMatch(downloadCopy.ko, /아직 서명되지 않음|확인 없이 열기|인증서 준비 중/);
    assert.match(en.download.trustLine, /Signed and notarized by Apple/);
    assert.match(ko.download.trustLine, /Apple 서명·공증/);

    for (const gone of ['releaseNotesHeading', 'releaseNotesSource', 'releaseNotesCaption']) {
      assert.equal(en.download[gone], undefined, `download.${gone} must stay removed`);
      assert.equal(ko.download[gone], undefined, `download.${gone} must stay removed`);
    }

    // Windows is named rather than omitted, and its unsigned build says so where
    // the visitor downloads it.
    assert.match(en.download.heroWindowsCta, /Windows/);
    assert.match(ko.download.heroWindowsCta, /Windows/);
    assert.match(en.download.trustLineWindows, /unsigned/i);
    assert.match(en.download.trustLineWindows, /SmartScreen/i);
    assert.match(ko.download.trustLineWindows, /미서명/);
    assert.match(ko.download.trustLineWindows, /SmartScreen/i);

    // A domain that does not resolve must not be cited as fact.
    assert.doesNotMatch(JSON.stringify(en.download), /ontology-atlas\.dev/);
    assert.doesNotMatch(JSON.stringify(ko.download), /ontology-atlas\.dev/);
  });

  it('keeps Korean primary navigation understandable without topology jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));

    /*
     * Lock the property, not the value: all six slots are filled, no jargon or hard loanwords, and
     * labels are short enough for the rail width.
     */
    const railLabels = [
      ko.navRail.map,
      ko.navRail.architecture,
      ko.navRail.library,
      ko.navRail.insights,
      ko.navRail.projects,
      ko.navRail.agents,
      ko.navRail.mcp,
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
    /* Ban hard-to-understand loanwords; "Builder" is a retired name and stays blocked. */
    assert.doesNotMatch(
      railLabels.join('\n'),
      /인사이트|빌더|온톨로지/,
      '레일에 알아듣기 어려운 외래어가 들어왔다',
    );
    /*
     * One destination, one name: the rail label and the screen title must match. The test locks that
     * they agree, not which word they use.
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
    assert.ok(
      ko.settingsFolder.documentsTitle.includes(ko.navRail.docs),
      '설정 카드가 여는 온톨로지 섹션을 이름으로 말해야 한다',
    );
    assert.ok(
      ko.settingsFolder.documentsBodyLocal.includes(ko.navRail.docs),
      '설정 카드 설명이 여는 온톨로지 섹션을 말해야 한다',
    );
    assert.ok(
      !ko.settingsFolder.documentsTitle.includes(ko.navRail.library),
      '온톨로지 섹션 카드가 자료실 목적지 전체를 연다고 말하면 안 된다',
    );
    assert.equal(ko.topology.documentTitle, '지도');
    // Only `fitViewTooltip` is checked: a `ChromeTile` in label mode takes its accessible name from
    // the word on screen (WCAG 2.5.3), so a second aria label could only differ from it.
    assert.equal(ko.topologyWidgets.controls.fitViewTooltip, '지도 전체 맞추기');
    assert.doesNotMatch(
      [
        ko.topologyWidgets.controls.fitViewTooltip,
      ].join('\n'),
      /\b(Agent|agent|handoff|preflight|Depth|Local graph|HOP)\b/,
    );
    assert.doesNotMatch(
      [
        ko.navRail.docs,
        ko.nav.settingsMenu.triggerTitle,
        ko.settingsFolder.folderLabel,
        ko.settingsFolder.documentsTitle,
        ko.settingsFolder.documentsBodyLocal,
        ko.settingsFolder.documentsBodyStatic,
        ko.settingsFolder.documentsCtaLocal,
        ko.settingsFolder.documentsCtaStatic,
        ko.rootEntry.openingLocalVaultPicker,
      ].join('\n'),
      /frontmatter|vault|Vault|토폴로지|source|Source/,
    );
  });

  it('keeps Korean app settings MCP proof copy readable without internal client jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const settings = ko.nav.settingsMenu;
    const visibleCopy = [
      JSON.stringify(settings.section),
      ko.settingsAgents.codingToolsLabel,
      ko.settingsAgents.modelsLabel,
      ko.settingsAgents.mcpLabel,
      settings.agentStatusNoVault,
      settings.agentNoVaultHint,
      settings.mcpProofTitle,
      settings.mcpProofBody,
      settings.mcpProofCopy,
      settings.mcpProofCopied,
    ].join('\n');

    assert.equal(settings.mcpProofTitle, '실제로 연결됐는지 확인하기');
    assert.match(visibleCopy, /에이전트/);
    const doorRows = [
      ko.settingsAgents.codingToolsLabel,
      ko.settingsAgents.modelsLabel,
      ko.settingsAgents.mcpLabel,
    ];
    assert.equal(new Set(doorRows.map((label) => label[0])).size, doorRows.length);
    assert.equal(settings.section.ai, undefined, 'the API Key pane is a pointer row now, not a section');
    assert.doesNotMatch(visibleCopy, /\bAgent\b|\bFallback\b|\bclient\b|\bnamespace\b|\breload\b|\brestart\b|graph DB gate/);
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

  it('keeps the topologyWidgets namespaces its controls read', async () => {
    const en = await readJson(path.join(MESSAGES_DIR, 'en.json'));
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
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

    assert.equal(header.openTreeTitle, '문서 목록');
    assert.equal(header.openTreeAriaLabel, '문서 목록 열기');
    assert.equal(docsUi.parts.sidebar.searchLabel, '문서 검색');
    assert.equal(docsUi.tree.navAria, '문서 목록');
    assert.doesNotMatch(
      [
        header.openTreeTitle,
        header.openTreeAriaLabel,
        docsUi.parts.sidebar.searchLabel,
        docsUi.tree.navAria,
      ].join('\n'),
      /문서 기록|기록 찾기/,
    );
    assert.equal(commands.sourceServer, '샘플 폴더 보기');
    assert.equal(commands.sourceLocal, '내 PC 폴더 열기');
    assert.equal(commands.viewFolderTopology, undefined);
    assert.equal(commands.scaffoldTopology, undefined);
    assert.doesNotMatch(commands.sourceServer, /소스|Source/);
    assert.doesNotMatch(commands.sourceLocal, /소스|Source/);
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
      ko.docsVault.sourceContract.filesLabel,
      ko.docsVault.desktopWelcome.contractGraphBody,
      ko.docsVault.sourceContract.filesBody,
      ko.docsVault.sourceContract.graphValue,
      ko.docsVault.sourceContract.graphBody,
      ko.docsVault.sourceContract.agentLabel,
      ko.docsVault.sourceContract.agentBody,
    ].join('\n');

    assert.equal(ko.docsVault.desktopWelcome.title, '로컬 폴더를 열거나 만드세요');
    /*
     * Properties are checked, not authored wording; `ui-copy-glossary.contract.test.ts` owns the
     * banned-word list.
     */
    assert.doesNotMatch(ko.docsVault.desktopWelcome.contractAriaLabel, /계약/);
    assert.ok(ko.docsVault.desktopWelcome.contractAriaLabel.length > 0);
    assert.equal(ko.docsVault.desktopWelcome.contractFilesLabel, '폴더 파일');
    assert.doesNotMatch(ko.docsVault.desktopWelcome.contractGraphValue, /문서 속성|프론트매터/);
    assert.equal(ko.docsVault.desktopWelcome.contractAgentLabel, 'AI 확인');
    assert.equal(ko.docsVault.desktopWelcome.actionsAriaLabel, '폴더 시작 액션');
    assert.equal(ko.docsVault.sourceContract.filesLabel, '폴더 파일');
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
      en.settingsFolder.folderLabel,
      en.settingsFolder.documentsTitle,
      en.settingsFolder.documentsBodyLocal,
      en.settingsFolder.documentsBodyStatic,
      en.settingsFolder.documentsCtaLocal,
      en.settingsFolder.documentsCtaStatic,
      en.searchWidgets.shortcuts.sections.docsPalette,
      en.searchWidgets.shortcuts.sections.docsGraph,
      en.searchWidgets.shortcuts.sections.docsSource,
      en.searchWidgets.shortcuts.sections.docsActions,
      en.searchWidgets.shortcuts.rows.toggleDocsDrawer,
      en.searchWidgets.shortcuts.rows.localVault,
      en.searchWidgets.shortcuts.rows.manualRefresh,
      en.searchWidgets.shortcuts.rows.focusRefresh,
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
      en.docsVault.sourceContract.filesLabel,
      en.docsVault.sourceContract.filesBody,
      en.docsVault.sourceContract.graphValue,
      en.docsVault.sourceContract.graphBody,
      en.docsVault.sourceContract.agentLabel,
      en.docsVault.sourceContract.agentBody,
      en.docsVault.sourceContract.agentCopyGate,
      en.docsVault.sourceContract.agentCopyGateAriaLabel,
    ].join('\n');

    assert.ok(
      en.metadata.pages.docs.includes(en.navRail.docs),
      'document metadata must name the Ontology section',
    );
    assert.ok(
      en.metadata.pages.docs.includes(en.navRail.library),
      'document metadata must name its Library destination',
    );
    // `navRail.library` is the primary destination label. `navRail.docs` now names
    // the Ontology section reached through compatible `/docs` links and controls.
    assert.notEqual(en.navRail.docs, en.navRail.library);
    assert.equal(en.library.title, en.navRail.library);
    // The settings card keeps the compatible `/docs/` address, so it names the Ontology
    // section inside Library rather than claiming to be a second Library destination.
    assert.ok(
      en.settingsFolder.documentsTitle.includes(en.navRail.docs),
      'the settings card must name the Ontology section it opens',
    );
    assert.ok(
      !en.settingsFolder.documentsTitle.includes(en.navRail.library),
      'the Ontology section card must not claim to open the whole Library destination',
    );
    assert.equal(en.docsVault.desktopWelcome.title, 'Open or create a local workspace');
    // Property, not wording — see the Korean half of this file for why.
    assert.doesNotMatch(en.docsVault.desktopWelcome.contractAriaLabel, /\bcontract\b/i);
    assert.ok(en.docsVault.desktopWelcome.contractAriaLabel.length > 0);
    assert.equal(en.docsVault.desktopWelcome.contractFilesLabel, 'Workspace files');
    assert.doesNotMatch(en.docsVault.desktopWelcome.contractGraphValue, /frontmatter/i);
    assert.equal(en.docsVault.desktopWelcome.contractAgentLabel, 'AI check');
    assert.equal(en.docsVault.desktopWelcome.actionsAriaLabel, 'Workspace setup actions');
    assert.equal(en.docsVault.sourceContract.filesLabel, 'Workspace files');
    assert.equal(en.docsVault.sourceContract.graphValue, '{nodes} concepts · {edges} relations');
    assert.equal(en.docsVault.sourceContract.agentLabel, 'AI check');
    assert.equal(en.docsVault.sourceContract.agentCopyGate, 'Copy graph check');
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
    assert.equal(ko.featuresMisc.starterCta.proofLocalLabel, '로컬 파일');
    assert.equal(ko.featuresMisc.starterCta.proofGraphLabel, '연결 검사');
    assert.equal(ko.featuresMisc.starterCta.proofAgentLabel, '먼저 읽기');
    assert.equal(ko.featuresMisc.starterCta.copyCliLabel, 'CLI 점검 복사');
    assert.equal(ko.featuresMisc.starterCta.copyJsonGateLabel, 'JSON 점검 복사');
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
    // Scan the whole download namespace for untranslated English nouns in Korean sentences, not one
    // frozen string.
    const mixedLanguageCopy = [
      JSON.stringify(ko.download),
      JSON.stringify(settings.section),
      settings.agentNoVaultHint,
      settings.mcpProofBody,
    ].join('\n');

    /*
     * `agentNoVaultHint` is not pinned by equality; `mixedLanguageCopy` covers it without freezing
     * wording.
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

  /* A property, not a sentence: the lede must name a coding agent and MCP. */
  it('names the coding agent and the protocol on the gateway first screen, in both languages', async () => {
    for (const locale of ['en', 'ko']) {
      const messages = await readJson(path.join(MESSAGES_DIR, `${locale}.json`));
      const lead = messages.download.heroLead;
      assert.match(
        lead,
        /Claude Code/,
        `${locale} gateway lede must name the coding agent the reader already runs`,
      );
      assert.match(lead, /\bMCP\b/, `${locale} gateway lede must name how the agent reaches Atlas`);
    }
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

it('모든 메시지가 ICU 로 컴파일된다 — 꺾쇠 태그 오파싱이 raw 키 폴백을 만들지 않게 (리텐션 P2/P4 회귀)', async () => {
  // next-intl parses `<tag>` as a rich-text tag. A literal `<...>` inside a message
  // consumed through plain t() is a runtime error, and the user sees the raw key.
  // This compiles every message in tag-enabled mode to catch broken syntax (unclosed
  // tags, invalid ICU); whether a tagged key goes through t.rich is a separate check.
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
