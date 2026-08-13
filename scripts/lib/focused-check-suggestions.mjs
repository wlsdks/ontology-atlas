import { existsSync } from 'node:fs';

const RULES = [
  {
    command: 'pnpm test:mcp:registration',
    reason: 'MCP source-checkout registration templates changed',
    matches: [/^\.mcp\.json(?:\.example)?$/, /^\.codex\/config\.toml$/],
  },
  {
    command: 'pnpm docs-vault:check',
    reason: 'static docs-vault input or generated manifest changed',
    matches: [/^docs\/.+\.md$/, /^src\/entities\/docs-vault\/data\/manifest\.json$/],
  },
  {
    command: 'pnpm test:docs-vault',
    reason: 'docs-vault build/check helper changed',
    matches: [/^scripts\/build-docs-vault\.(?:mjs|test\.mjs)$/],
  },
  {
    // 이 그물이 실제로 잡는 사고는 「문서를 옮기거나 볼트를 재생성했는데
    // 그것을 인용하던 산문이 남았다」이고, 그건 markdown 을 건드린 PR 에서만
    // 생긴다 — 그래서 추천의 트리거도 markdown 이다.
    command: 'pnpm docs:links',
    reason: 'markdown moved or edited — cited paths and links may have gone stale',
    matches: [/\.md$/],
  },
  {
    command: 'pnpm test:guide-examples',
    reason: 'public guide ontology examples must satisfy the live UID schema',
    matches: [
      /^docs\/guide\/[^/]+\.md$/,
      /^scripts\/check-guide-frontmatter-examples\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm docs:surface:check',
    reason: 'MCP tool registry, CLI command registry, or their READMEs changed',
    matches: [
      /^mcp\/src\/index\.js$/,
      /^cli\/src\/lib\/cli-commands\.mjs$/,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^docs\/\.generated\/mcp-surface\.json$/,
    ],
  },
  {
    command: 'pnpm test:docs:checks',
    reason: 'docs surface or doc-link checker changed',
    matches: [
      /^scripts\/build-docs-surface\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-doc-links\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/(?:docs-surface|doc-links)\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'GitHub workflow or community template changed',
    matches: [
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^\.github\/DISCUSSIONS-CATEGORIES\.md$/,
      /^\.github\/ISSUE_TEMPLATE\/[^/]+\.yml$/,
    ],
  },
  {
    command: 'pnpm test:vault:validate',
    reason: 'vault validator script changed',
    matches: [/^scripts\/validate-vault(?:-script)?\.test\.mjs$/, /^scripts\/validate-vault\.mjs$/],
  },
  {
    command: 'pnpm test:vault:audit',
    reason: 'vault path audit script changed',
    matches: [/^scripts\/audit-vault-paths\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:desktop:check',
    reason: 'desktop readiness checker contract changed',
    matches: [
      /^scripts\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos-app-launch(?:\.[^/]+)?\.mjs$/,
      /^scripts\/lib\/verify-macos\/[^/]+\.mjs$/,
      /^scripts\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-macos-download-release\.mjs$/,
      /^scripts\/build-updater-manifest\.(?:mjs|test\.mjs)$/,
      /^scripts\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
    ],
  },
  {
    command: 'pnpm test:desktop:runtime',
    reason: 'hosted-vs-installed desktop runtime split changed',
    matches: [
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu(?:\.test)?\.tsx$/,
    ],
  },
  {
    command: 'pnpm design:ontology',
    reason: 'ontology workbench design surface guard changed',
    matches: [/^scripts\/check-ontology-design-surface\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:desktop:bridge',
    reason: 'native macOS vault bridge changed',
    matches: [
      /^src\/shared\/lib\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src-tauri\/src\/lib\.rs$/,
      /^src-tauri\/Cargo\.(?:toml|lock)$/,
    ],
  },
  {
    command: 'pnpm desktop:check',
    reason: 'macOS desktop readiness inputs changed',
    matches: [
      /^scripts\/check-desktop-readiness\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-doctor\.(?:mjs|test\.mjs)$/,
      /^scripts\/desktop-smoke\.(?:mjs|test\.mjs)$/,
      /^scripts\/verify-macos-dmg\.mjs$/,
      /^scripts\/verify-macos-install-smoke\.mjs$/,
      /^scripts\/lib\/macos-dmg-layout\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/redact-command\.(?:mjs|test\.mjs)$/,
      /^scripts\/check-macos-download-release\.mjs$/,
      /^scripts\/stage-macos-release-assets\.(?:mjs|test\.mjs)$/,
      /^docs\/DESKTOP-MACOS\.md$/,
      /^src\/views\/docs-vault\/lib\/persistence(?:\.test)?\.ts$/,
      /^src\/shared\/lib\/tauri-vault-fs(?:\.test)?\.ts$/,
      /^src\/views\/root-entry\/ui\/RootEntryPage(?:\.test)?\.tsx$/,
      /^src\/views\/docs-vault\/ui\/DocsVaultPage\.tsx$/,
      /^src\/widgets\/app-settings-menu\/ui\/AppSettingsMenu(?:\.test)?\.tsx$/,
      /^\.github\/workflows\/deploy-pages\.yml$/,
      /^src-tauri\//,
      /^package\.json$/,
      /^next\.config\.ts$/,
    ],
  },
  {
    command: 'pnpm test:vault:migrate',
    reason: 'vault migration behavior changed',
    matches: [
      /^scripts\/migrate-vault\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrate-node-uids\.(?:mjs|test\.mjs)$/,
      /^scripts\/migrations\/[^/]+\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm vault:migrate --list',
    reason: 'vault migration inventory or runner changed',
    matches: [
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/(?:README\.md|[^/]+\.mjs)$/,
    ],
  },
  {
    command: 'pnpm test:contracts',
    reason:
      'cross-package parser/schema contract, or a UI file the design-system and a11y contracts scan from disk',
    matches: [
      // 2026-08-04 — 새 `.tsx` 뷰와 새 라우트에 이 advisor 가 tsc·i18n 말고는
      // 아무것도 안 권했다. 그런데 `tests/contract/` 의 여러 게이트는 **파일
      // 시스템을 직접 읽는다** — 램프 커버리지, 이름 유틸리티 래칫, 컨트롤
      // 채택 래칫, 금지 클래스, 인라인 hex, 표면 모션, 라벨 장식, 그리고
      // 라우트를 분류하는 `audited-route-coverage`. 새로 만든 UI 파일은
      // 그것들의 입력이지 남의 일이 아니다.
      /^(?:src|app)\/.*\.tsx$/,
      /^tests\/contract\//,
      /^tests\/fixtures\/(?:frontmatter|frontmatter-writer|validate-vault|vault-schema)-cases\.mjs$/,
      /^mcp\/src\/(?:parser|schema|validate)\.mjs$/,
      /^cli\/src\/lib\/(?:parse-frontmatter|schema|validate)\.mjs$/,
      /^cli\/src\/commands\/validate\.mjs$/,
      /^scripts\/lib\/parse-frontmatter\.mjs$/,
      /^src\/shared\/lib\/(?:parse-frontmatter|validate-vault-document)\.ts$/,
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/[^/]+\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:unit',
    reason: 'MCP core unit implementation changed',
    matches: [
      /^mcp\/src\/(?:analyze|meaning-evaluation|construction-qualification|construction-lifecycle|infer-imports|ontology-atlas-ignore|ontology-compiler|ontology-engine|parser|query|validate|vault|index)\.(?:mjs|js)$/,
      /^mcp\/src\/(?:analyze|meaning-evaluation|construction-qualification|construction-lifecycle|infer-imports|ontology-atlas-ignore|ontology-compiler|ontology-engine|parser|query|validate|vault|redirect-backlinks|conflict-detection|json-rpc-lines)\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm integration:mcp:surface',
    reason: 'MCP JSON-RPC tool registry or handler surface changed',
    matches: [/^mcp\/src\/index\.js$/],
  },
  {
    command: 'pnpm integration:mcp',
    reason: 'MCP integration test harness or broad integration contract changed',
    matches: [/^mcp\/src\/integration\.test\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:graph',
    reason: 'MCP graph artifact/query handler surface changed',
    matches: [/^mcp\/src\/(?:ontology-compiler|ontology-engine)\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:repo-analysis',
    reason: 'MCP code-to-vault analysis handler surface changed',
    matches: [/^mcp\/src\/(?:analyze|meaning-evaluation|construction-qualification|construction-lifecycle|infer-imports)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    command: 'pnpm integration:mcp:vault-read',
    reason: 'MCP vault/frontmatter read handler surface changed',
    matches: [/^mcp\/src\/(?:validate|vault)\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:read',
    reason: 'MCP read/query tool handler surface changed',
    matches: [
      /^mcp\/src\/query\.mjs$/,
    ],
  },
  {
    command: 'pnpm integration:mcp:write',
    reason: 'MCP write tool handler surface changed',
    matches: [/^mcp\/src\/(?:index|vault)\.(?:mjs|js)$/],
  },
  {
    command: 'pnpm test:dogfood:script-refs',
    reason: 'help text, package-script references, or focused wrapper behavior changed',
    matches: [
      /^package\.json$/,
      /^scripts\/lib\/pnpm-script-refs\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/test-name-pattern\.(?:mjs|test\.mjs)$/,
      /^scripts\/run-focused-node-test\.(?:mjs|test\.mjs)$/,
      /^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/commands\/mcp-verify\.mjs$/,
      /^mcp\/scripts\/verify\.mjs$/,
      /^README\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/benchmark\/README\.md$/,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^scripts\/migrations\/README\.md$/,
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
      /^\.claude\/LOOP-PRINCIPLES\.md$/,
      /^\.claude\/rules\/[^/]+\.md$/,
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
    ],
  },
  {
    command: 'pnpm test:claude:hooks',
    reason: 'Claude Code/Codex hook wiring or publish guard changed',
    matches: [
      /^\.claude\/hooks\/(?:block-npm-publish|inject-ontology-summary)\.sh$/,
      /^\.claude\/settings\.json$/,
      /^\.codex\/hooks\.json$/,
      /^\.codex\/hooks\/(?:block-npm-publish|inject-ontology-summary)\.sh$/,
      /^scripts\/claude-hooks\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:dogfood:args',
    reason: 'dogfood shortcut argument helper changed',
    matches: [/^scripts\/lib\/dogfood-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:dogfood:compile-fix',
    reason: 'dogfood compile-fix idempotence helper changed',
    matches: [/^scripts\/dogfood-compile-fix\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:checks:changed',
    reason: 'changed-path focused-check advisor changed',
    matches: [
      /^scripts\/lib\/focused-check-suggestions\.(?:mjs|test\.mjs)$/,
      /^scripts\/suggest-focused-checks\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    /*
     * **CI 가 무엇을 돌릴지 정하는 스크립트인데 추천 매핑이 없었다** (2026-08-08).
     * `pnpm checks:changed -- scripts/classify-change.mjs` 가 «no focused
     * mapping» 을 돌려줬다 — 이 저장소에서 결과가 가장 큰 스크립트가 정작
     * 자기 시험을 가리키는 줄을 못 갖고 있었다. 실제로 이 파일의 판정 결함
     * 하나가 main 에서 전체 Playwright 를 통째로 생략시켰다.
     */
    command: 'pnpm exec node --test scripts/classify-change.test.mjs',
    reason: 'the CI change classifier decides what CI runs at all',
    matches: [/^scripts\/classify-change\.(?:mjs|test\.mjs)$/],
  },
  {
    /*
     * 스킬 무결성 계기 — 제품 기능이 아니라 발견 도구지만, 판정 로직이 순수
     * 함수라 시험이 붙어 있다. 도구가 못 가리키는 검사는 존재하지 않는 검사다.
     */
    command: 'pnpm test:skills:audit',
    reason: 'Claude skill integrity instrument changed',
    matches: [/^scripts\/audit-claude-skills\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts',
    reason: 'Vitest config, setup, or test discovery changed',
    matches: [/^vitest\.config\.ts$/, /^vitest\.setup\.ts$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    reason: 'Playwright config or webServer behavior changed',
    matches: [/^playwright\.config\.ts$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts',
    reason: 'global CSS, Tailwind, or PostCSS styling behavior changed',
    matches: [/^app\/globals\.css$/, /^postcss\.config\.mjs$/],
  },
  {
    /*
     * ⚠️ **문서함을 고치면 문서함을 운전하는 e2e 를 같이 돌린다** (2026-08-08).
     *
     * 이 매핑이 없어서 실제 사고가 났다. #987 이 문서함 헤더의 「샘플|로컬」
     * 라디오를 볼트 칩 메뉴로 옮겼는데, `docs-deeplink.spec.ts` 가 그 라디오를
     * 클릭한다. 추천 도구가 그 스펙을 **한 번도 가리키지 않아** 로컬에서
     * 안 돌렸고, CI 는 빨간 채로 **여섯 PR 이 더 머지됐다**(2분 타임아웃 ×
     * 재시도 3회 × 두 시험).
     *
     * `.claude/rules/testing.md` 가 정확히 이것을 경고한다 — *"화면을 삭제하면
     * 같은 PR 에서 e2e spec 도 같이 훑어 지운다"*. 사람의 기억에 맡긴 그 훑기를
     * 도구가 대신하게 한다: **도구가 못 가리키는 검사는 존재하지 않는 검사다.**
     */
    command:
      'pnpm exec playwright test tests/e2e/docs-deeplink.spec.ts tests/e2e/document-scroll-lock.spec.ts tests/e2e/vault-truth-telling.spec.ts',
    reason: 'the docs surface changed — its e2e specs drive that screen by role and testid',
    matches: [
      /^src\/views\/docs-vault\/.+\.tsx?$/,
      /^src\/widgets\/docs-vault\/.+\.tsx?$/,
    ],
  },
  {
    // 표면 분리(2026-07-27) 이후 웹은 앱을 따라가지 않으므로, 능력 브리지를
    // 건드린 사람은 앱만 확인하고 지나가기 쉽다. 웹이 무인 표면이라 그 통과가
    // 그대로 부패가 된다 — 브리지를 만지면 웹 스모크를 같이 권한다.
    command: 'pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
    reason: 'desktop capability bridge or local-vault entry changed — the web surface is unattended',
    matches: [
      /^src\/shared\/lib\/tauri-(?:vault-fs|git|secrets|llm)\.ts$/,
      /^src\/shared\/lib\/desktop-shell\.ts$/,
      /^src\/features\/docs-vault-local\/model\/use-local-vault\.ts$/,
      /^src\/features\/first-run-starter\/ui\/FirstRunStarterModule\.tsx$/,
      /^src-tauri\//,
    ],
  },
  {
    command: 'pnpm test:dogfood:status',
    reason: 'dogfood status shortcut changed',
    matches: [/^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:dogfood:graph-db',
    reason: 'dogfood graph DB pack gate changed',
    matches: [/^scripts\/dogfood-graph-db-pack\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm benchmark --dry-run',
    reason: 'Codex benchmark runner config changed',
    matches: [/^scripts\/benchmark\.mjs$/],
  },
  {
    command: 'pnpm benchmark:scale --dry-run',
    reason: 'Codex scale benchmark runner config changed',
    matches: [/^scripts\/benchmark-scale\.mjs$/],
  },
  {
    command: 'node scripts/perf-vault.mjs 10',
    reason: 'vault parser perf smoke changed',
    matches: [/^scripts\/perf-vault\.mjs$/],
  },
  {
    command: 'node --test scripts/perf-graph.test.mjs',
    reason: 'graph compiler/query perf audit helper contract changed',
    matches: [/^scripts\/perf-graph\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm perf:graph:check',
    reason: 'graph compiler/query perf budget changed',
    matches: [/^scripts\/perf-graph\.mjs$/],
  },
  {
    command: 'pnpm perf:graph:scale',
    reason: 'graph compiler/query scale budget changed',
    matches: [/^scripts\/perf-graph\.mjs$/],
  },
  {
    command: 'pnpm smoke:onboarding',
    reason: 'clean onboarding smoke changed',
    matches: [/^scripts\/smoke-clean-onboarding\.mjs$/],
  },
  {
    command: 'pnpm smoke:memory-loop',
    reason: 'fresh repo memory loop smoke changed',
    matches: [/^scripts\/smoke-memory-loop\.mjs$/],
  },
  {
    command: 'pnpm exec tsc --noEmit',
    reason: 'TypeScript or Next.js static export config changed',
    matches: [
      /^app\/.*\.(?:ts|tsx)$/,
      /^next\.config\.ts$/,
      /^next-env\.d\.ts$/,
      /^src\/(?!.*\.(?:test|spec)\.).*\.(?:ts|tsx)$/,
      /^src\/i18n\/.*\.ts$/,
      /^tsconfig\.json$/,
    ],
  },
  {
    // 2026-08-08 — 카운슬이 「앱 전용」이라 거짓 주장하던 문구를 고쳤는데,
    // advisor 는 `test:i18n:messages`(카탈로그 정합)만 권했다. 실제로 그
    // 문구를 못박고 있던 게이트는 **`check-desktop-readiness`** 였고, 그것은
    // CI 에서야 빨개졌다 — 로컬 검증을 도구가 시키는 대로 다 돌렸는데도.
    //
    // 문구 카탈로그는 정합 검사만의 입력이 아니다. 「이 화면이 무엇을 할 수
    // 있다고 말하나」를 읽는 게이트들의 입력이기도 하다.
    command: 'pnpm test:desktop:check',
    reason: 'message copy changed — the desktop routing gate reads these strings for capability claims',
    matches: [/^messages\/[^/]+\.json$/],
  },
  {
    command: 'pnpm test:i18n:messages',
    reason: 'locale routing or message catalog changed',
    matches: [
      /^messages\/[^/]+\.json$/,
      /^src\/i18n\/.*\.ts$/,
      /^scripts\/validate-messages\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm lint',
    reason: 'ESLint boundary or style rules changed',
    matches: [/^eslint\.config\.mjs$/],
  },
  {
    // 2026-08-04 — 라우트를 새로 놓은 사람에게 이 advisor 는 tsc 만 권했다.
    // 라우트는 세 게이트의 입력이다: 원장(`decisions:check`), 접근성 분류
    // (`audited-route-coverage` → `pnpm test:contracts`), 그리고 실제 측정
    // (두 래칫). 셋째가 여기 없으면 새 화면의 대비 미달이 **아무 목록에도
    // 없는 채로** 통과한다 — 2026-08-03 에 404 두 장이 그렇게 AA 4.42:1 을
    // 들고 있었다.
    command:
      'pnpm exec playwright test tests/e2e/a11y-ratchet.spec.ts tests/e2e/contrast-ratchet.spec.ts',
    reason: 'a route was added or changed — it must be classified into the a11y/contrast ratchets',
    matches: [/^app\/(?:.+\/)?(?:page|not-found|error|global-error)\.tsx$/],
  },
  {
    // 2026-08-08 — 관문의 판을 고친 사람에게 이 advisor 는 **그 판의 격자
    // 검사를 권하지 않았다.** 실제로 그 사이로 회귀가 지나갔다: 푸터에 줄
    // 하나를 넣자 여덟 폭 전부에서 `download-gateway-grid` 가 빨개졌는데,
    // 로컬에서는 아무도 그 스펙을 안 돌렸고 CI 에서야 나왔다.
    //
    // 이 저장소의 규율은 «손으로 쓴 목록 대신 도구를 가리켜라» 인데, 그러면
    // **도구가 못 가리키는 검사는 존재하지 않는 검사**가 된다. 스펙 이름에
    // `download-gateway` 가 그대로 들어 있어도 경로↔검사 연결이 없으면
    // 소용없다.
    //
    // 원점(`PAGE_COLUMN`/`PAGE_GUTTER`)까지 넣는 이유: 그 값이 곧 격자가
    // 재는 기준선이라, 그것을 고치면 판을 안 건드려도 여덟 폭이 함께 움직인다.
    command: 'pnpm exec playwright test tests/e2e/download-gateway-grid.spec.ts',
    reason: 'the gateway plate or its frame changed — six elements must still share one origin',
    matches: [
      /^src\/views\/download\/.*\.tsx?$/,
      /^src\/widgets\/gateway-chrome\/.*\.tsx?$/,
      /^src\/shared\/lib\/gateway-frame\.ts$/,
    ],
  },
  {
    command: 'pnpm decisions:check',
    reason: 'a route or design-spec surface moved — the decision ledger must move with it',
    matches: [/^app\/(?:.+\/)?(?:page|not-found)\.tsx$/],
  },
  {
    command: 'pnpm build',
    reason: 'static export config changed',
    matches: [/^next\.config\.ts$/],
  },
  {
    command: 'pnpm test:mcp:dogfood:timeout',
    reason: 'MCP dogfood timeout/argument diagnostics changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:dogfood',
    reason: 'MCP dogfood helper changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:verify:first-contact',
    reason: 'MCP verify first-contact helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:verify:timeout',
    reason: 'MCP verify timeout/startup diagnostics changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:verify',
    reason: 'MCP verify helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:maintenance',
    reason: 'maintenance_plan queue or formatter behavior changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/, /^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:suggestions',
    reason: 'MCP enum or argument suggestion behavior changed',
    matches: [/^mcp\/src\/suggestions\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:args',
    reason: 'CLI argument parser changed',
    matches: [/^cli\/src\/lib\/cli-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:mcp-call',
    reason: 'CLI MCP response wrapper changed',
    matches: [/^cli\/src\/lib\/mcp-call\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:lib',
    reason: 'CLI shared helper changed',
    matches: [/^cli\/src\/lib\//],
  },
  {
    command: 'pnpm integration:cli:entry',
    reason: 'CLI entrypoint, help, or init dispatch changed',
    matches: [/^cli\/src\/index\.mjs$/, /^cli\/src\/lib\/cli-commands\.mjs$/],
  },
  {
    command: 'pnpm integration:cli',
    reason: 'CLI integration test harness or broad integration contract changed',
    matches: [/^cli\/src\/integration\.test\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:compile',
    reason: 'CLI compile command changed',
    matches: [/^cli\/src\/commands\/compile\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:mcp-verify',
    reason: 'CLI mcp-verify command changed',
    matches: [/^cli\/src\/commands\/mcp-verify\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:diagnosis',
    reason: 'CLI health/agent-brief/workspace-brief diagnosis command changed',
    matches: [/^cli\/src\/commands\/(?:health|agent-brief|workspace-brief)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:graph-read',
    reason: 'CLI graph read command changed',
    matches: [
      /^cli\/src\/commands\/(?:backlinks|path|all-paths|relation-check|orphans|query|overview|hubs|blast-radius|cycles|node-profile|similar)\.mjs$/,
      /^cli\/src\/lib\/query-plan-output\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm integration:cli:graph-write',
    reason: 'CLI graph write command changed',
    matches: [/^cli\/src\/commands\/(?:rename|delete|merge)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:repo-analysis',
    reason: 'CLI repo analysis or bootstrap command changed',
    matches: [/^cli\/src\/commands\/(?:analyze|infer-imports|bootstrap)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    command: 'pnpm integration:cli:local-vault',
    reason: 'CLI local vault/frontmatter command changed',
    matches: [/^cli\/src\/commands\/(?:add|import|list|find|validate)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:growth',
    reason: 'CLI growth command changed',
    matches: [/^cli\/src\/commands\/growth\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:maintenance',
    reason: 'CLI maintenance command changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:package',
    reason: 'package or release contract changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'public docs or dogfood ontology docs changed',
    matches: [
      /^README\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/CHANGELOG\.md$/,
      /^docs\/ontology\//,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^scripts\/check-package-contracts\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm dogfood:status',
    reason: 'dogfood ontology or MCP/CLI dogfood surface changed',
    matches: [/^docs\/ontology\//, /^mcp\//, /^cli\//, /^scripts\/dogfood/],
  },
];

const ESCALATIONS = [
  {
    command: 'pnpm package:check',
    reason: 'package manifests, docs contracts, or release scripts changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm dogfood:verify',
    reason: 'shared MCP/CLI verification surface changed',
    matches: [/^mcp\//, /^cli\/src\/commands\/mcp-verify\.mjs$/, /^scripts\/smoke-packed-cli\.mjs$/],
  },
];

const MCP_DIRECT_UNIT_TESTS = new Map([
  ['mcp/src/analyze.mjs', 'mcp/src/analyze.test.mjs'],
  ['mcp/src/meaning-evaluation.mjs', 'mcp/src/meaning-evaluation.test.mjs'],
  ['mcp/src/construction-qualification.mjs', 'mcp/src/construction-qualification.test.mjs'],
  ['mcp/src/construction-lifecycle.mjs', 'mcp/src/construction-lifecycle.test.mjs'],
  ['mcp/src/infer-imports.mjs', 'mcp/src/infer-imports.test.mjs'],
  ['mcp/src/ontology-atlas-ignore.mjs', 'mcp/src/ontology-atlas-ignore.test.mjs'],
  ['mcp/src/ontology-compiler.mjs', 'mcp/src/ontology-compiler.test.mjs'],
  ['mcp/src/ontology-engine.mjs', 'mcp/src/ontology-engine.test.mjs'],
  ['mcp/src/parser.mjs', 'mcp/src/parser.test.mjs'],
  ['mcp/src/query.mjs', 'mcp/src/query.test.mjs'],
  ['mcp/src/suggestions.mjs', 'mcp/src/suggestions.test.mjs'],
  ['mcp/src/validate.mjs', 'mcp/src/validate.test.mjs'],
  ['mcp/src/vault.mjs', 'mcp/src/vault.test.mjs'],
  ['mcp/scripts/json-rpc-lines.mjs', 'mcp/src/json-rpc-lines.test.mjs'],
]);

const MCP_DIRECT_UNIT_TEST_FILES = new Set([
  ...MCP_DIRECT_UNIT_TESTS.values(),
  'mcp/src/redirect-backlinks.test.mjs',
  'mcp/src/conflict-detection.test.mjs',
  'mcp/src/json-rpc-lines.test.mjs',
]);

const CLI_DIRECT_LIB_TESTS = new Map([
  ['cli/src/lib/batch-results.mjs', 'cli/src/lib/batch-results.test.mjs'],
  ['cli/src/lib/captured-summary.mjs', 'cli/src/lib/captured-summary.test.mjs'],
  ['cli/src/lib/cli-args.mjs', 'cli/src/lib/cli-args.test.mjs'],
  ['cli/src/lib/cli-commands.mjs', 'cli/src/lib/cli-commands.test.mjs'],
  ['cli/src/lib/diagnosis-colors.mjs', 'cli/src/lib/diagnosis-colors.test.mjs'],
  ['cli/src/lib/diagnosis-options.mjs', 'cli/src/lib/diagnosis-options.test.mjs'],
  ['cli/src/lib/import-analysis-results.mjs', 'cli/src/lib/import-analysis-results.test.mjs'],
  ['cli/src/lib/mcp-call.mjs', 'cli/src/lib/mcp-call.test.mjs'],
  ['cli/src/lib/mcp-metadata.mjs', 'cli/src/lib/mcp-metadata.test.mjs'],
  ['cli/src/lib/query-plan-output.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
  ['cli/src/lib/query-plan-output.test.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
  ['cli/src/lib/query-result-contract.mjs', 'cli/src/lib/query-result-contract.test.mjs'],
  ['cli/src/lib/repo-analysis-results.mjs', 'cli/src/lib/repo-analysis-results.test.mjs'],
  ['cli/src/lib/resolve-vault.mjs', 'cli/src/lib/resolve-vault.test.mjs'],
  ['cli/src/lib/vault-census.mjs', 'cli/src/lib/vault-census.test.mjs'],
]);

const CLI_DIRECT_LIB_TEST_FILES = new Set(CLI_DIRECT_LIB_TESTS.values());

const SCRIPT_DIRECT_LIB_TESTS = new Map([
  ['scripts/audit-vault-paths.mjs', 'scripts/audit-vault-paths.test.mjs'],
  ['scripts/audit-vault-paths.test.mjs', 'scripts/audit-vault-paths.test.mjs'],
  ['scripts/build-docs-vault.mjs', 'scripts/build-docs-vault.test.mjs'],
  ['scripts/build-docs-vault.test.mjs', 'scripts/build-docs-vault.test.mjs'],
  ['scripts/check-desktop-readiness.mjs', 'scripts/check-desktop-readiness.test.mjs'],
  ['scripts/check-desktop-readiness.test.mjs', 'scripts/check-desktop-readiness.test.mjs'],
  ['scripts/check-ontology-design-surface.mjs', 'scripts/check-ontology-design-surface.test.mjs'],
  ['scripts/check-ontology-design-surface.test.mjs', 'scripts/check-ontology-design-surface.test.mjs'],
  ['scripts/desktop-doctor.mjs', 'scripts/desktop-doctor.test.mjs'],
  ['scripts/desktop-doctor.test.mjs', 'scripts/desktop-doctor.test.mjs'],
  ['scripts/desktop-smoke.mjs', 'scripts/desktop-smoke.test.mjs'],
  ['scripts/desktop-smoke.test.mjs', 'scripts/desktop-smoke.test.mjs'],
  ['scripts/lib/macos-dmg-layout.mjs', 'scripts/lib/macos-dmg-layout.test.mjs'],
  ['scripts/lib/macos-dmg-layout.test.mjs', 'scripts/lib/macos-dmg-layout.test.mjs'],
  ['scripts/lib/redact-command.mjs', 'scripts/lib/redact-command.test.mjs'],
  ['scripts/lib/redact-command.test.mjs', 'scripts/lib/redact-command.test.mjs'],
  ['scripts/dogfood-compile-fix.mjs', 'scripts/dogfood-compile-fix.test.mjs'],
  ['scripts/dogfood-compile-fix.test.mjs', 'scripts/dogfood-compile-fix.test.mjs'],
  ['scripts/dogfood-mcp-walk.mjs', 'scripts/dogfood-mcp-walk.test.mjs'],
  ['scripts/dogfood-mcp-walk.test.mjs', 'scripts/dogfood-mcp-walk.test.mjs'],
  ['scripts/dogfood-status.mjs', 'scripts/dogfood-status.test.mjs'],
  ['scripts/dogfood-status.test.mjs', 'scripts/dogfood-status.test.mjs'],
  ['scripts/dogfood-graph-db-pack.mjs', 'scripts/dogfood-graph-db-pack.test.mjs'],
  ['scripts/dogfood-graph-db-pack.test.mjs', 'scripts/dogfood-graph-db-pack.test.mjs'],
  ['scripts/run-focused-node-test.mjs', 'scripts/run-focused-node-test.test.mjs'],
  ['scripts/run-focused-node-test.test.mjs', 'scripts/run-focused-node-test.test.mjs'],
  ['scripts/lib/dogfood-args.mjs', 'scripts/lib/dogfood-args.test.mjs'],
  ['scripts/lib/dogfood-args.test.mjs', 'scripts/lib/dogfood-args.test.mjs'],
  ['scripts/lib/focused-check-suggestions.mjs', 'scripts/lib/focused-check-suggestions.test.mjs'],
  ['scripts/lib/pnpm-script-refs.mjs', 'scripts/lib/pnpm-script-refs.test.mjs'],
  ['scripts/lib/test-name-pattern.mjs', 'scripts/lib/test-name-pattern.test.mjs'],
  ['scripts/validate-messages.test.mjs', 'scripts/validate-messages.test.mjs'],
  ['scripts/validate-vault.mjs', 'scripts/validate-vault-script.test.mjs'],
  ['scripts/validate-vault-script.test.mjs', 'scripts/validate-vault-script.test.mjs'],
  ['scripts/check-package-contracts.mjs', 'scripts/check-package-contracts.test.mjs'],
  ['scripts/check-package-contracts.test.mjs', 'scripts/check-package-contracts.test.mjs'],
]);

const SCRIPT_DIRECT_LIB_TEST_FILES = new Set(SCRIPT_DIRECT_LIB_TESTS.values());

const FOCUSED_CHECK_DIRECT_TESTS = new Map([
  ['scripts/suggest-focused-checks.mjs', 'scripts/suggest-focused-checks.test.mjs'],
  ['scripts/suggest-focused-checks.test.mjs', 'scripts/suggest-focused-checks.test.mjs'],
]);

export function normalizeChangedPath(path) {
  return String(path || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

export function suggestFocusedChecks(paths = []) {
  const normalizedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const staticCommands = rulesToSuggestions(RULES, normalizedPaths);
  const withVitestDirect = prependSuggestions(
    staticCommands,
    directVitestTestSuggestions(normalizedPaths),
  );
  const withPlaywrightDirect = prependSuggestions(
    withVitestDirect,
    directPlaywrightTestSuggestions(normalizedPaths),
  );
  const withLintDirect = prependSuggestions(
    withPlaywrightDirect,
    directLintSuggestions(normalizedPaths),
  );
  const withMcpDirect = insertBeforeCommand(
    withLintDirect,
    directMcpUnitTestSuggestions(normalizedPaths),
    'pnpm test:mcp:unit',
  );
  const commands = insertBeforeCommand(
    withMcpDirect,
    directCliLibTestSuggestions(normalizedPaths),
    'pnpm test:cli:lib',
  );
  const withScriptDirect = insertBeforeCommand(
    commands,
    directScriptLibTestSuggestions(normalizedPaths),
    'pnpm test:dogfood:script-refs',
  );
  const withFocusedCheckDirect = insertBeforeCommand(
    withScriptDirect,
    directFocusedCheckTestSuggestions(normalizedPaths),
    'pnpm test:checks:changed',
  );
  const escalations = rulesToSuggestions(ESCALATIONS, normalizedPaths);
  return { paths: normalizedPaths, commands: withFocusedCheckDirect, escalations };
}

function directVitestTestSuggestions(paths) {
  const pathSet = new Set(paths);
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = resolveVitestTestFile(path, pathSet);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec vitest run ${testFile}`,
      reason: 'direct Vitest sibling test for changed app/source file',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

/**
 * 바뀐 `src/**` · `app/**` 소스에 **ESLint 를 직접** 건다.
 *
 * 이 저장소에서 디자인 시스템 규격(타입·반경·행간·모션·그림자 램프, 금지
 * 그라디언트, accent×틴트 페어링, FSD 경계)은 문서가 아니라 `no-restricted-syntax`
 * 가 강제한다. 그런데 2026-08-04 실사용 시험에서 이 advisor 는 새 `.tsx` 뷰에
 * tsc·contracts·i18n 만 권하고 **lint 를 한 번도 권하지 않았다** — 규격을 지고
 * 있는 게이트가 추천 목록에 없었다.
 *
 * `pnpm lint` 전체가 아니라 **바뀐 파일만** 건다. 전체는 escalation 이고,
 * 여기서 필요한 것은 "방금 쓴 화면이 규격 안에 있나" 라는 즉답이다.
 */
function directLintSuggestions(paths) {
  const lintable = paths.filter((path) => /^(?:src|app)\/.+\.(?:ts|tsx)$/.test(path));
  if (lintable.length === 0) return [];
  return [
    {
      command: `pnpm exec eslint ${lintable.join(' ')}`,
      reason: 'design-system ramps and FSD boundaries are lint-enforced on changed source',
      paths: lintable,
    },
  ];
}

function directPlaywrightTestSuggestions(paths) {
  return paths
    .filter((path) => /^tests\/e2e\/.+\.spec\.ts$/.test(path))
    .map((path) => ({
      command: `pnpm exec playwright test ${path}`,
      reason: 'direct Playwright spec for changed e2e test',
      paths: [path],
    }));
}

function resolveVitestTestFile(path, pathSet) {
  if (!/^(?:src|app)\//.test(path)) return null;
  if (!/\.(?:ts|tsx)$/.test(path)) return null;
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(path)) return path;

  const testFile = path.replace(/\.(tsx?)$/, '.test.$1');
  if (pathSet.has(testFile) || existsSync(testFile)) return testFile;
  return null;
}

function directMcpUnitTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = MCP_DIRECT_UNIT_TESTS.get(path) ?? (MCP_DIRECT_UNIT_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct MCP unit test for changed core file',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directCliLibTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = CLI_DIRECT_LIB_TESTS.get(path) ?? (CLI_DIRECT_LIB_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct CLI lib unit test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directScriptLibTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = SCRIPT_DIRECT_LIB_TESTS.get(path) ?? (SCRIPT_DIRECT_LIB_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct script helper unit test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directFocusedCheckTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = FOCUSED_CHECK_DIRECT_TESTS.get(path);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct focused-check advisor test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function prependSuggestions(suggestions, additions) {
  if (additions.length === 0) return suggestions;
  const existing = new Set(suggestions.map((item) => item.command));
  const uniqueAdditions = additions.filter((item) => !existing.has(item.command));
  return [...uniqueAdditions, ...suggestions];
}

function insertBeforeCommand(suggestions, additions, command) {
  if (additions.length === 0) return suggestions;
  const seen = new Set();
  const uniqueAdditions = additions.filter((item) => {
    if (seen.has(item.command)) return false;
    seen.add(item.command);
    return true;
  });
  const index = suggestions.findIndex((item) => item.command === command);
  if (index === -1) return [...uniqueAdditions, ...suggestions];
  return [
    ...suggestions.slice(0, index),
    ...uniqueAdditions,
    ...suggestions.slice(index),
  ];
}

function rulesToSuggestions(rules, paths) {
  const seen = new Set();
  const suggestions = [];
  for (const rule of rules) {
    const matchedPaths = paths.filter((path) => rule.matches.some((pattern) => pattern.test(path)));
    if (matchedPaths.length === 0 || seen.has(rule.command)) continue;
    seen.add(rule.command);
    suggestions.push({ command: rule.command, reason: rule.reason, paths: matchedPaths });
  }
  return suggestions;
}

export function formatFocusedCheckSuggestions({ paths = [], commands = [], escalations = [] } = {}) {
  if (paths.length === 0) {
    return [
      '[focused-checks] no changed paths against HEAD or untracked files',
      'Use `pnpm checks:changed -- <path...>` to inspect a planned file set.',
    ].join('\n');
  }
  const lines = [
    `[focused-checks] ${paths.length} changed path${paths.length === 1 ? '' : 's'}`,
  ];
  if (commands.length === 0) {
    lines.push('First checks: no focused mapping; do not jump to the full suite by default.');
    lines.push('Choose the nearest area from docs/DEVELOPMENT-CHECKS.md, then escalate only for concrete uncovered risk.');
  } else {
    lines.push('First checks:');
    for (const suggestion of commands) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
    lines.push('Run these before broad lint/build/test; escalate only when the change risk requires it.');
  }
  if (escalations.length > 0) {
    lines.push('Escalate when needed:');
    for (const suggestion of escalations) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  return lines.join('\n');
}
