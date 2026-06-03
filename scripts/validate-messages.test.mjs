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
    assert.match(en.download.releaseAvailabilityNote, /PR review, version alignment, Apple signing, or the v0\.1\.0 GitHub Release/);
    assert.doesNotMatch(en.download.releaseAvailabilityNote, /Firebase Hosting/);
    assert.match(en.download.releaseStatusTitle, /Before the first release is fully available/);
    assert.match(en.download.releaseStatusPr, /PR #274/);
    assert.match(en.download.releaseStatusPr, /before v0\.1\.0 can ship/);
    assert.match(en.download.releaseStatusVersion, /v0\.1\.0 tag/);
    assert.match(en.download.releaseStatusVersion, /package\.json, Tauri, and Cargo metadata/);
    assert.doesNotMatch(en.download.releaseStatusVersion, /Firebase Hosting/);
    assert.match(en.download.releaseStatusSecrets, /Apple Developer ID signing\/notarization secrets/);
    assert.doesNotMatch(en.download.releaseStatusSecrets, /Firebase Hosting/);
    assert.match(en.download.releaseStatusSecrets, /before the macOS app release/);
    assert.match(en.download.releaseStatusRelease, /v0\.1\.0 GitHub Release/);
    assert.match(en.download.releaseStatusRelease, /source of truth/);
    assert.match(en.download.releaseStatusHosted, /Separately, Firebase Hosting must deploy/);
    assert.match(en.download.releaseStatusHosted, /\/ko\/download\//);
    assert.match(ko.download.releaseAvailabilityNote, /macOS DMG 가 아직 보이지 않으면/);
    assert.match(ko.download.releaseAvailabilityNote, /PR review, version alignment, Apple signing, v0\.1\.0 GitHub Release/);
    assert.doesNotMatch(ko.download.releaseAvailabilityNote, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusTitle, /첫 릴리스가 완전히 열리기 전 체크리스트/);
    assert.match(ko.download.releaseStatusPr, /PR #274/);
    assert.match(ko.download.releaseStatusPr, /v0\.1\.0 배포 전/);
    assert.match(ko.download.releaseStatusVersion, /v0\.1\.0 tag/);
    assert.match(ko.download.releaseStatusVersion, /package\.json, Tauri, Cargo metadata/);
    assert.doesNotMatch(ko.download.releaseStatusVersion, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusSecrets, /Apple Developer ID/);
    assert.doesNotMatch(ko.download.releaseStatusSecrets, /Firebase Hosting/);
    assert.match(ko.download.releaseStatusSecrets, /macOS 앱 릴리스 전/);
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

    assert.equal(ko.nav.topology, '관계 지도');
    assert.equal(
      ko.nav.tooltipDocs,
      '문서함 — 저장된 마크다운 파일을 가이드 문서와 온톨로지 노드로 나눠 봅니다',
    );
    assert.equal(
      ko.nav.tooltipOntology,
      '온톨로지 — 개념·관계·변경점을 한 곳에서 확인합니다',
    );
    assert.equal(
      ko.nav.tooltipTopology,
      '관계 지도 — 개념 사이 연결을 공간에서 확인하고 선택 노드로 돌아갑니다',
    );
    assert.equal(
      ko.ontologySubNav.treeTooltip,
      '개념 보기 — 계층과 이웃 관계를 확인합니다',
    );
    assert.equal(
      ko.ontologySubNav.builderTooltip,
      '저장·편집 — 캔버스에서 노드와 관계를 고친 뒤 frontmatter에 저장합니다',
    );
    assert.equal(
      ko.ontologySubNav.insightsTooltip,
      '연결·검증 — MCP/CLI 쿼리로 허브, 경로, 상태를 점검합니다',
    );
    assert.equal(ko.topology.documentTitle, '관계 지도');
    assert.doesNotMatch(ko.nav.tooltipTopology, /토폴로지/);
  });

  it('keeps Korean docs vault commands understandable without source/topology jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const commands = ko.docsVault.commands;

    assert.equal(commands.sourceServer, '샘플 문서함 보기');
    assert.equal(commands.sourceLocal, '내 PC 문서함 열기');
    assert.equal(commands.viewFolderTopology, '뷰 · 프로젝트 관계 지도 (projects/*.md)');
    assert.equal(commands.scaffoldTopology, '이 폴더를 관계 지도용 볼트로 초기화');
    assert.doesNotMatch(commands.sourceServer, /소스|Source/);
    assert.doesNotMatch(commands.sourceLocal, /소스|Source/);
    assert.doesNotMatch(commands.viewFolderTopology, /Topology|토폴로지/);
    assert.doesNotMatch(commands.scaffoldTopology, /Topology|토폴로지/);
  });

  it('keeps Korean empty ontology start state concrete and low-jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const startCopy = [
      ko.ontologyView.emptyHint,
      ko.ontologyView.getStarted.headingLocal,
      ko.ontologyView.getStarted.headingDefault,
      ko.ontologyView.getStarted.bodyLocal,
      ko.ontologyView.getStarted.bodyDefault,
    ].join('\n');

    assert.match(ko.ontologyView.emptyHint, /kind 가 있는 \.md/);
    assert.match(ko.ontologyView.getStarted.bodyLocal, /활성 문서함/);
    assert.match(ko.ontologyView.getStarted.bodyDefault, /로컬 문서함/);
    assert.doesNotMatch(startCopy, /ontology\s*가|다음 \d+ 단계|첫 트리/);
  });

  it('keeps Korean local vault graph summary concrete and low-jargon', async () => {
    const ko = await readJson(path.join(MESSAGES_DIR, 'ko.json'));
    const stubsCopy = [
      ko.featuresMisc.vaultStubs.emptyBody,
      ko.featuresMisc.vaultStubs.intro,
      ko.featuresMisc.vaultStubs.polishBody,
    ].join('\n');

    assert.match(ko.featuresMisc.vaultStubs.emptyBody, /로컬 문서함의 \.md/);
    assert.match(ko.featuresMisc.vaultStubs.intro, /로컬 문서함/);
    assert.match(ko.featuresMisc.vaultStubs.polishBody, /같은 \.md 파일/);
    assert.doesNotMatch(stubsCopy, /vault 의|ontology\s*가|ERD-like|promote/);
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
