#!/usr/bin/env node
//
// **이 파일의 판별 기준 (2026-08-01, 소유자 확정 — `docs/DECISIONS.md`)**
//
//   기계가 만들 수 있는 것만 검사한다. 사람이 판단해서 쓴 문장은 검사하지 않는다.
//
// 종전 판은 3,419줄 · 단언 2,126개였고 그중 1,915개(90%)가 「README 에 이
// 문장이 있는가」였다. 그 핀들은 **잡아야 할 것을 못 잡았다** — 도구 동작이
// 바뀌고 문서가 안 바뀌면 문장은 그대로라 통과했다 — 그리고 **개선을 막았다**:
// 문서를 더 나은 말로 고치면 빨개졌다. 실제로 이 파일 자신이 「게이트가 틀리고
// 문서가 옳았다」는 주석을 여러 번 달고 있었다.
//
// 지금 남은 것은 셋뿐이다:
//   1. 코드에서 유도한 값과의 대조 (enum · 카운트 · 버전 · 계산된 요약 문자열)
//   2. 참조 무결성 (문서가 부르는 `pnpm ...` 가 실재하나, 볼트 README 가 부르는
//      노드가 실재하나, 글롭이 디스크를 전부 덮나)
//   3. 실행 가능성 (스크립트가 정말로 도나) + 패키지 구조 (tarball · 진입점)
//
// 산문이 "무엇을 설명하는지" 는 이제 두 그물이 대신 본다:
//   - `pnpm docs:surface:check` — 레지스트리에서 표면을 재생성해 diff 하고,
//     등록된 도구/커맨드 이름이 README 에 나오는지 본다.
//   - `pnpm docs:links` — 깨진 링크와 존재하지 않는 파일 인용.
//
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

import {
  expectedToolsListAnnotationSummary,
  tunedHealthScopeOutputSummary,
  tunedWorkspaceBriefScopeOutputSummary,
} from '../mcp/scripts/verify.mjs';
import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../mcp/src/ontology-engine.mjs';
import { RELATION_TYPE_VALUES as CLI_RELATION_TYPE_VALUES } from '../cli/src/lib/relation-types.mjs';
import { SERVER_VERSION } from '../mcp/src/server-version.mjs';
import { CLI_COMMAND_COUNT } from '../cli/src/lib/cli-commands.mjs';
import { parseMcpToolMetadataFromDescription } from '../cli/src/lib/mcp-metadata.mjs';
import {
  checkPackage,
  checkMcpLeanTarballFiles,
  importedSpecifiers,
  isCoveredByFiles,
  isPublishRuntimeScript,
  packageEntrypoints,
  parseScriptFileRefs,
} from './check-package-contracts.mjs';
import { assertPnpmScriptsExist } from './lib/pnpm-script-refs.mjs';

function withPackage(pkg, files, fn) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-package-contract-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function markdownEnumList(values) {
  return values.map((value) => `\`${value}\``).join(' / ');
}

function normalizedMarkdownIncludes(markdown, expected) {
  return markdown.replace(/\s+/g, ' ').includes(expected);
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runNodeScript(args) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
}

function generatedSurface() {
  return JSON.parse(readFileSync('docs/.generated/mcp-surface.json', 'utf-8'));
}

describe('package contract helpers', () => {
  /**
   * **참조 무결성 — 문서가 부르는 `pnpm ...` 가 실재하나.**
   *
   * 이것은 산문 핀이 아니다: 기대값이 산문이 아니라 `package.json` 의 스크립트
   * 목록이라 기계가 만든다. 종전 판은 이 단언 옆에 스크립트 본문을 글자
   * 그대로 복제한 `assert.equal(pkg.scripts[x], '...')` 를 150여 개 두고
   * 있었는데, 그건 계약이 아니라 **거울**이었다 — 사람이 정한 문자열을 두
   * 곳에 적어 두고 한쪽이 바뀌면 다른 쪽을 고치게 만들 뿐이다.
   */
  it('keeps every pnpm command named in the docs resolvable to a real root script', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));
    const docs = [
      'README.md',
      'docs/DEVELOPMENT-CHECKS.md',
      'mcp/README.md',
      'cli/README.md',
      'docs/benchmark/README.md',
      'scripts/migrations/README.md',
      '.claude/LOOP-PRINCIPLES.md',
      '.claude/rules/architecture.md',
      '.claude/rules/design.md',
      '.claude/rules/documentation.md',
      '.claude/rules/forbidden.md',
      '.claude/rules/git.md',
      '.claude/rules/local-first.md',
      '.claude/rules/testing.md',
      '.claude/skills/ontology-bootstrap/SKILL.md',
      '.claude/skills/ontology-extract/SKILL.md',
      '.claude/skills/ontology-sync/SKILL.md',
    ]
      .map((file) => readFileSync(file, 'utf-8'))
      .join('\n');

    assertPnpmScriptsExist(docs, pkg.scripts, { filteredScripts: { './mcp': mcpPkg.scripts } });
    // 스크립트끼리 서로 부르는 `pnpm ...` 도 같은 무결성을 지켜야 한다.
    assertPnpmScriptsExist(Object.values(pkg.scripts).join('\n'), pkg.scripts);
  });

  /**
   * 발견이 **실제로 전부를 덮는지** 잰다 — 스크립트 문자열이 글롭처럼 생긴
   * 것과 그 글롭이 디스크의 모든 파일을 잡는 것은 다른 주장이다.
   *
   * 이 검사가 없었다면 `test:mcp:unit` 이 21개를 적어 두고 27개 중 6개를
   * 조용히 빼는 상태가 그대로 통과했다(그중 `verify-script.test.mjs` 는
   * 실제로 실패 중이었고, 어느 워크플로도 MCP 를 안 돌려서 아무도 못 봤다).
   */
  it('MCP unit script reaches every unit test file on disk', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    const command = pkg.scripts?.['test:mcp:unit'] ?? '';
    const discovered = execSync(command.replace(/^node --test /, 'echo '), {
      encoding: 'utf-8',
    })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((file) => basename(file))
      .sort();

    const onDisk = readdirSync('mcp/src')
      .filter((file) => file.endsWith('.test.mjs'))
      .filter((file) => file !== 'integration.test.mjs')
      .sort();

    assert.deepEqual(discovered, onDisk);
  });

  it('keeps push and PR GitHub CI disabled while preserving local verification scripts', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

    assert.equal(existsSync('.github/workflows/ci.yml'), false);
    assert.equal(existsSync('scripts/check-ci-workflow.mjs'), false);
    assert.equal(existsSync('scripts/check-ci-workflow.test.mjs'), false);
    assert.equal(packageJson.scripts['ci:check'], undefined);
    assert.equal(packageJson.scripts['ci:workflow-check'], undefined);
  });

  it('keeps the docs-vault freshness check executable from source checkout', () => {
    const help = runNodeScript(['scripts/build-docs-vault.mjs', '--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/build-docs-vault\.mjs \[--check\]/);
    assert.equal(help.stderr, '');

    const check = runNodeScript(['scripts/build-docs-vault.mjs', '--check']);
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /\[docs-vault\] current · \d+ docs/);
    assert.equal(check.stderr, '');
  });

  /** 생성 후 diff 그물 자신도 소스 체크아웃에서 실제로 돌아야 한다. */
  it('keeps the generated docs surface check executable from source checkout', () => {
    const help = runNodeScript(['scripts/build-docs-surface.mjs', '--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/build-docs-surface\.mjs \[--check\]/);
    assert.equal(help.stderr, '');

    const links = runNodeScript(['scripts/check-doc-links.mjs', '--help']);
    assert.equal(links.status, 0);
    assert.match(links.stdout, /Usage: node scripts\/check-doc-links\.mjs \[--external\]/);
    assert.equal(links.stderr, '');
  });

  it('keeps source-checkout MCP registration templates wired to the dogfood vault', () => {
    for (const file of ['.mcp.json', '.mcp.json.example']) {
      const config = JSON.parse(readFileSync(file, 'utf-8'));
      const server = config.mcpServers?.['ontology-atlas'];

      assert.ok(server, `${file} must register the ontology-atlas MCP server`);
      assert.equal(server.command, 'node');
      assert.deepEqual(server.args, ['./mcp/src/index.js']);
      assert.equal(server.env?.OATLAS_VAULT, './docs/ontology');
    }

    const codexConfig = readFileSync('.codex/config.toml', 'utf-8');
    assert.match(codexConfig, /\[mcp_servers\.ontology-atlas\]/);
    assert.match(codexConfig, /command\s*=\s*"node"/);
    assert.match(codexConfig, /args\s*=\s*\["\.\/mcp\/src\/index\.js"\]/);
    assert.match(codexConfig, /\[mcp_servers\.ontology-atlas\.env\]/);
    assert.match(codexConfig, /OATLAS_VAULT\s*=\s*"\.\/docs\/ontology"/);
  });

  /**
   * README 가 광고하는 지름길이 **정말 도는지** 본다. 도움말의 각 줄을 글자로
   * 고정하던 30여 개 단언은 걷었다 — 도움말 문구는 사람이 쓴 산문이고, 그것을
   * 고정하면 더 나은 문구로 고칠 때 게이트가 깨진다.
   *
   * 잃은 것: 도움말이 실재하지 않는 지름길을 나열해도 여기서는 안 걸린다.
   * 그 자리는 `assertPnpmScriptsExist` 가 (도움말 텍스트를 대상으로 도는
   * `pnpm test:dogfood:script-refs` 를 통해) 대신 지킨다.
   */
  it('keeps the root README mcp-verify shortcut executable from source checkout', () => {
    const result = runNodeScript(['cli/src/index.mjs', 'mcp-verify', '--help']);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /ontology-atlas mcp-verify \[vault\] \[--timeout-ms N\]/);
    assert.equal(result.stderr, '');
  });

  it('keeps the CLI entrypoint on natural exit so large stdout can flush', () => {
    const source = readFileSync('cli/src/index.mjs', 'utf-8');

    assert.doesNotMatch(source, /import\s*\{[^}]*\bexit\b[^}]*\}\s+from ['"]node:process['"]/);
    assert.doesNotMatch(source, /\bexit\s*\(/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
  });

  it('keeps the MCP npm test verify entrypoint on natural exit so large stdout can flush', () => {
    const source = readFileSync('mcp/scripts/verify.mjs', 'utf-8');

    assert.doesNotMatch(source, /import\s*\{[^}]*\bexit\b[^}]*\}\s+from ['"]node:process['"]/);
    assert.doesNotMatch(source, /\bprocess\.exit\s*\(/);
    assert.match(source, /process\.exitCode\s*=\s*await main\(\)/);
  });

  it('keeps the CLI MCP dependency aligned with the local MCP package version', () => {
    const cliPkg = JSON.parse(readFileSync('cli/package.json', 'utf-8'));
    const mcpPkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));

    assert.equal(cliPkg.dependencies?.['ontology-atlas-mcp'], `^${mcpPkg.version}`);
  });

  it('keeps CLI relation type validation aligned with MCP query filters', () => {
    assert.deepEqual(CLI_RELATION_TYPE_VALUES, RELATION_TYPE_VALUES);
  });

  /**
   * **열거형은 코드가 가진 값이 전부다.** 기대 문자열을 엔진의 배열에서
   * 만들어 붙이므로, 값을 하나 더하면 문서가 따라오지 않는 한 여기서 걸린다 —
   * 이것이 「인자/열거값 정합」 부류이고 산문 핀과 성격이 다르다.
   */
  it('keeps every relation and maintenance enum value documented from the engine', () => {
    const mcpReadme = readFileSync('mcp/README.md', 'utf-8');
    const features = readFileSync('docs/FEATURES.md', 'utf-8');
    const dogfoodDoc = readFileSync('docs/ontology/capabilities/mcp-server.md', 'utf-8');
    const strictInputSection = mcpReadme.split('String-array options are strict too:')[1]?.split('Scalar string options')[0] ?? '';
    const addRelationRow = mcpReadme.split('| `add_relation` |')[1]?.split('\n')[0] ?? '';
    const addRelationsRow = mcpReadme.split('| `add_relations` |')[1]?.split('\n')[0] ?? '';
    const addRelationFeature = features.split('4. **add_relation**')[1]?.split('\n').slice(0, 3).join('\n') ?? '';

    assert.notEqual(strictInputSection, '', 'MCP README lost the strict string-array options section — move this anchor');
    assert.notEqual(addRelationRow, '', 'MCP README lost the add_relation row — move this anchor');

    for (const value of WRITE_RELATION_TYPE_VALUES) {
      assert.match(addRelationFeature, new RegExp(`\`${value}\``), `FEATURES documents add_relation type ${value}`);
      assert.match(addRelationRow, new RegExp(`\`${value}\``), `MCP README documents add_relation type ${value}`);
      assert.match(addRelationsRow, new RegExp(`\`${value}\``), `MCP README documents add_relations type ${value}`);
    }

    const enumClaims = [
      [strictInputSection, `\`maintenance_plan.phases\` is additionally limited to ${markdownEnumList(MAINTENANCE_PHASE_VALUES)}`],
      [strictInputSection, `\`maintenance_plan.severities\` is limited to ${markdownEnumList(MAINTENANCE_SEVERITY_VALUES)}`],
      [strictInputSection, `\`maintenance_plan.kinds\` is limited to ${markdownEnumList(MAINTENANCE_KIND_VALUES)}`],
      [strictInputSection, `\`dependencyTypes\` and \`componentTypes\` (${markdownEnumList(RELATION_TYPE_VALUES)})`],
    ];
    for (const [section, expected] of enumClaims) {
      assert.ok(normalizedMarkdownIncludes(section, expected), `MCP README must document: ${expected}`);
    }

    const dogfoodSection = dogfoodDoc.split('환경변수 `OATLAS_VAULT`')[0];
    for (const [key, values] of [
      ['phases', MAINTENANCE_PHASE_VALUES],
      ['severities', MAINTENANCE_SEVERITY_VALUES],
      ['kinds', MAINTENANCE_KIND_VALUES],
    ]) {
      const expected = `\`maintenance_plan.${key}\` 는 ${markdownEnumList(values)}`;
      assert.ok(normalizedMarkdownIncludes(dogfoodSection, expected), `dogfood MCP docs must document: ${expected}`);
    }
  });

  /**
   * 튜닝된 브리프/진단의 **스코프 요약 문자열은 verify 가 계산한다** — README
   * 트랜스크립트가 그 계산 결과를 그대로 담고 있어야 한다. 볼트가 자라도
   * 안 바뀌므로 썩지 않는다.
   */
  it('keeps the MCP verify README quoting the tuned-scope summaries the code computes', () => {
    const readme = readFileSync('mcp/README.md', 'utf-8');
    const verifySection = readme.split('### One-line verify CLI')[1]?.split('### Manual verification')[0] ?? '';

    assert.notEqual(verifySection, '', 'mcp/README.md lost the "One-line verify CLI" section — move this anchor');
    assert.match(verifySection, new RegExp(regexEscape(tunedWorkspaceBriefScopeOutputSummary())));
    assert.match(verifySection, new RegExp(regexEscape(tunedHealthScopeOutputSummary())));
  });

  /**
   * **공개 계약의 수** — 도구 인벤토리와 annotation 인구 조사. 도구를 등록하거나
   * 지워야만 바뀌고, 그 변경은 의도적이라 문서/스모크가 따라오는 것이 맞다.
   */
  it('keeps the tools/list annotation census on its published contract', () => {
    assert.equal(
      expectedToolsListAnnotationSummary(),
      '32/32 titled; 19/19 read; 13/13 write; 8/8 destructive; 3/3 idempotent; 32/32 local-only',
    );
  });

  /**
   * `mcp/package.json` 의 description 은 런치 문서 게이트
   * (`src/shared/lib/launch-docs-current.test.ts`)가 「현행 도구 수」를 파생하는
   * 출처다. 그 문자열은 사람이 쓴다 — 여기서 **레지스트리와 묶지 않으면**
   * 파생 게이트 전체가 낡은 수를 진실로 삼아 조용히 통과한다.
   */
  it('keeps the MCP package description counts anchored to the generated registry surface', () => {
    const surface = generatedSurface();
    const metadata = parseMcpToolMetadataFromDescription(
      JSON.parse(readFileSync('mcp/package.json', 'utf-8')).description,
    );

    assert.ok(metadata, 'mcp/package.json description must state the current tool surface');
    assert.equal(Number(metadata.toolCount), surface.mcp.toolCount);
    assert.equal(Number(metadata.readCount), surface.mcp.readToolCount);
    assert.equal(Number(metadata.writeCount), surface.mcp.writeToolCount);
  });

  it('keeps CLAUDE.md a thin AGENTS wrapper', () => {
    const claude = readFileSync('CLAUDE.md', 'utf-8');
    const agentImports = [...claude.matchAll(/^@AGENTS\.md$/gm)];

    assert.equal(agentImports.length, 1);
    // 문구가 아니라 «CLAUDE.md 가 AGENTS.md 의 절을 복제하지 않는다» 는 구조
    // 불변식이라 산문을 다시 써도 유효하다. 임포트 브리지 자체는
    // `pnpm agents:check` 가 별도로 지킨다.
    assert.doesNotMatch(claude, /## Project overview/);
    assert.doesNotMatch(claude, /## 프로젝트 개요/);
  });

  /**
   * **볼트 README 의 참조 무결성.** 종전 게이트는 이 문서가 특정 문장을
   * 담도록 요구했는데(산문 핀), 정작 잡고 싶었던 사고는 「볼트를 재생성했더니
   * README 가 사라진 노드를 가리킨다」였다. 그건 기계가 판정할 수 있다.
   */
  it('keeps the self-ontology README naming nodes that exist and counts that are derived', () => {
    const readme = readFileSync('docs/ontology/README.md', 'utf-8');
    const surface = generatedSurface();
    const referenced = [...readme.matchAll(/`((?:domains|capabilities|elements)\/[a-z0-9-]+|[a-z0-9-]+\.md)`/g)].map(
      (match) => match[1],
    );

    assert.ok(referenced.length >= 3, 'the vault README should point at real entry points');
    for (const slug of new Set(referenced)) {
      const file = slug.endsWith('.md') ? `docs/ontology/${slug}` : `docs/ontology/${slug}.md`;
      assert.ok(existsSync(file), `docs/ontology/README.md points at a node that does not exist: ${slug}`);
    }
    assert.match(readme, new RegExp(`${surface.mcp.toolCount} MCP tools`));
    assert.match(readme, new RegExp(`${surface.cli.commandCount} CLI commands`));
  });

  it('keeps dogfood CLI capability docs from freezing the command count by hand', () => {
    const doc = readFileSync('docs/ontology/capabilities/cli-developer-entry.md', 'utf-8');

    // 카운트는 CLI 가 export 하는 진실원에서 파생 — 하드코딩 숫자 rot 방지.
    assert.match(doc, new RegExp(`CLI Developer Entry \\(${CLI_COMMAND_COUNT} commands`));
    assert.match(doc, new RegExp(`총 ${CLI_COMMAND_COUNT} 명령`));
  });

  it('keeps the embedded SERVER_VERSION in sync with mcp/package.json', () => {
    const pkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));
    const source = readFileSync('mcp/src/index.js', 'utf-8');

    assert.equal(SERVER_VERSION, pkg.version);
    assert.equal(isCoveredByFiles('src/server-version.mjs', pkg.files), true);
    assert.match(source, /import \{ SERVER_VERSION \} from '\.\/server-version\.mjs'/);
    assert.doesNotMatch(source, /version: '\d+\.\d+\.\d+'/);
  });

  it('keeps MCP npm test runnable from the lean published tarball', () => {
    const pkg = JSON.parse(readFileSync('mcp/package.json', 'utf-8'));

    assert.equal(pkg.scripts?.test, 'node --test src/parser.test.mjs');
    assert.equal(isCoveredByFiles('src/parser.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('scripts/verify.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('scripts/json-rpc-lines.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/suggestions.test.mjs', pkg.files), false);
    assert.equal(isCoveredByFiles('src/verify-script.test.mjs', pkg.files), false);
  });

  it('keeps CLI npm test runnable from the published tarball', () => {
    const pkg = JSON.parse(readFileSync('cli/package.json', 'utf-8'));

    assert.equal(isCoveredByFiles('src/lib/cli-args.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/batch-results.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/batch-results.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/import-analysis-results.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/import-analysis-results.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/repo-analysis-results.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/repo-analysis-results.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/cli-commands.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/mcp-call.test.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/index.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/commands/mcp-verify.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('src/lib/cli-commands.mjs', pkg.files), true);
    assert.equal(isCoveredByFiles('templates/vault/project.md', pkg.files), true);
  });

  it('parses package script file references', () => {
    assert.deepEqual(parseScriptFileRefs('node --test src/a.test.mjs scripts/check.mjs'), [
      'src/a.test.mjs',
      'scripts/check.mjs',
    ]);
  });

  it('ignores test scripts when deriving publish runtime entrypoints', () => {
    assert.equal(isPublishRuntimeScript('start'), true);
    assert.equal(isPublishRuntimeScript('verify'), true);
    assert.equal(isPublishRuntimeScript('test'), false);
    assert.equal(isPublishRuntimeScript('test:smoke'), false);

    withPackage(
      {
        name: 'scripts',
        main: 'src/index.mjs',
        scripts: {
          verify: 'node scripts/verify.mjs',
          test: 'node src/integration.test.mjs',
          'test:smoke': 'node src/parser.test.mjs',
        },
        files: ['src/index.mjs', 'scripts/verify.mjs'],
      },
      {
        'src/index.mjs': 'export const ok = true;\n',
        'scripts/verify.mjs': 'export const verify = true;\n',
        'src/integration.test.mjs': 'throw new Error("not runtime");\n',
        'src/parser.test.mjs': 'throw new Error("not runtime");\n',
      },
      (dir) => {
        const entrypoints = packageEntrypoints(
          {
            main: 'src/index.mjs',
            scripts: {
              verify: 'node scripts/verify.mjs',
              test: 'node src/integration.test.mjs',
              'test:smoke': 'node src/parser.test.mjs',
            },
          },
          dir,
        ).map((entry) => entry.replace(`${dir}/`, ''));

        assert.deepEqual(entrypoints.sort(), ['scripts/verify.mjs', 'src/index.mjs']);
      },
    );
  });

  it('parses static side-effect, re-export, multiline, and dynamic imports', () => {
    const source = `
import './side-effect.mjs';
export { value as reexported } from './re-export.mjs';
import {
  value,
} from './multi-line.mjs';
const mod = await import('./dynamic.mjs');
writeFileSync('fixture.mjs', "import './not-real.mjs';");
`;

    assert.deepEqual(importedSpecifiers(source).sort(), [
      './side-effect.mjs',
      './re-export.mjs',
      './multi-line.mjs',
      './dynamic.mjs',
    ].sort());
  });

  it('parses CLI command registry runner entries as reachable command modules', () => {
    const source = `
function runner(moduleFile, exportName) {
  return { modulePath: \`./commands/\${moduleFile}\`, moduleFile, exportName };
}
export const CLI_COMMAND_RUNNERS = Object.freeze({
  list: runner('list.mjs', 'runList'),
  'mcp-verify': runner("mcp-verify.mjs", 'runMcpVerify'),
});
`;

    assert.deepEqual(importedSpecifiers(source).sort(), [
      '../commands/list.mjs',
      '../commands/mcp-verify.mjs',
    ].sort());
  });

  it('matches files entries by exact file, directory, and glob', () => {
    assert.equal(isCoveredByFiles('src/index.mjs', ['src/index.mjs']), true);
    assert.equal(isCoveredByFiles('src/lib/a.mjs', ['src/lib']), true);
    assert.equal(isCoveredByFiles('src/lib/a.test.mjs', ['src/lib/*.test.mjs']), true);
    assert.equal(isCoveredByFiles('src/lib/a.test.mjs', ['src/*.test.mjs']), false);
  });

  it('allows only the parser smoke fixture in the MCP tarball', () => {
    assert.doesNotThrow(() =>
      checkMcpLeanTarballFiles(['src/index.js', 'src/parser.mjs', 'src/parser.test.mjs']),
    );

    assert.throws(
      () => checkMcpLeanTarballFiles(['src/index.js', 'src/*.test.mjs']),
      /must not use broad test globs/,
    );

    assert.throws(
      () => checkMcpLeanTarballFiles(['src/index.js', 'src/integration.test.mjs']),
      /only src\/parser\.test\.mjs may ship/,
    );
  });
});

describe('checkPackage', () => {
  it('passes when reachable files and files entries match', () => {
    withPackage(
      {
        name: 'ok',
        main: 'src/index.mjs',
        files: ['src/index.mjs', 'src/lib'],
      },
      {
        'src/index.mjs': "import './lib/util.mjs';\n",
        'src/lib/util.mjs': 'export const ok = true;\n',
      },
      (dir) => {
        assert.doesNotThrow(() => checkPackage({ label: 'ok', dir }, { silent: true }));
      },
    );
  });

  it('fails when a reachable import is missing from files', () => {
    withPackage(
      {
        name: 'missing-reachable',
        main: 'src/index.mjs',
        files: ['src/index.mjs'],
      },
      {
        'src/index.mjs': "import './lib/util.mjs';\n",
        'src/lib/util.mjs': 'export const ok = true;\n',
      },
      (dir) => {
        assert.throws(
          () => checkPackage({ label: 'missing-reachable', dir }, { silent: true }),
          /src\/lib\/util\.mjs is reachable/,
        );
      },
    );
  });

  it('fails when a files entry matches nothing', () => {
    withPackage(
      {
        name: 'stale-entry',
        main: 'src/index.mjs',
        files: ['src/index.mjs', 'src/missing/*.mjs'],
      },
      {
        'src/index.mjs': 'export const ok = true;\n',
      },
      (dir) => {
        assert.throws(
          () => checkPackage({ label: 'stale-entry', dir }, { silent: true }),
          /entry does not match any package file: src\/missing\/\*\.mjs/,
        );
      },
    );
  });
});
