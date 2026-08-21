import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 폐기된 npm 채널을 되살리는 안내를 막는 게이트.
 *
 * npm 발행 계획은 2026-07-27 에 폐기됐다 (`docs/DECISIONS.md`). `ontology-atlas`
 * 와 `ontology-atlas-mcp` 는 레지스트리에 없고 앞으로도 없다 — 그래서 `npx
 * ontology-atlas init` 같은 안내는 미래 시제가 아니라 **거짓말**이다. 실행하면
 * 404 가 난다. #732 가 살아있는 앱·문서 표면을 걷었고, 이 게이트는 그게 다시
 * 기어들어오는 것을 막는다.
 *
 * **왜 lint 가 아니라 계약 테스트인가**: 위반이 사는 곳이 마크다운 산문·YAML
 * 이슈 템플릿·런치 초안이다. ESLint 의 AST 셀렉터가 볼 수 없는 층이라
 * `design.md` 의 "룰 없는 규격은 지켜지지 않는다" 를 여기서는 계약 테스트가
 * 대신 진다.
 *
 * **예외 목록을 쓰지 않는다.** 아카이브(`docs/archive/**`), CHANGELOG 과거
 * 항목, 날짜 박힌 감사·벤치마크 기록, 프로토타입 시안은 **그때는 참이었고**
 * 그대로 남아야 한다. 그래서 게이트는 denylist 가 아니라 **allowlist** 다 —
 * 역사는 목록에 없으므로 구조적으로 건드려지지 않는다. 관리해야 할 예외가
 * 0개인 것이 이 설계의 요점이다.
 *
 * 두 층으로 나눈 이유는 **인용과 지시가 다르기 때문**이다:
 *
 * - **Tier A — 전면 금지.** 이 표면들은 죽은 채널을 언급할 이유가 없다.
 *   런치 초안, 이슈 템플릿, 기여 안내, 스타터 README. 여기 있는 `npx` 는
 *   100% 사용자에게 주는 지시다.
 * - **Tier B — 코드 블록 안만 금지.** 사용자에게 "그건 안 된다" 고 말해야 하는
 *   문서들(TROUBLESHOOTING, README status, CLI README)은 명령을 **이름으로
 *   불러야** 한다. 판별은 글리프가 아니라 **자리**로 한다 — 펜스 안은 복사해
 *   붙이라는 뜻이고, 산문 안은 인용이다. 라벨 장식 게이트가 화살표를 글리프가
 *   아니라 위치로 판별하는 것과 같은 원리다.
 * - **Tier C — 소스의 맨몸 호출.** 2026-07-29 추가. 아래 「사정거리」 참조.
 *
 * ## 사정거리를 넓힌 이유 (2026-07-29 실측)
 *
 * 이 게이트는 오래 `npx ontology-atlas` 만 봤다. 그런데 앱이 사용자에게
 * 복사시키던 것은 **맨몸** `ontology-atlas validate .` 이었다 — 러너가 없으니
 * 패턴에 안 걸렸고, `which ontology-atlas` 는 not found 다. 전수 측정 결과 소스
 * 22곳 116건이 이 형태로 살아 있었다.
 *
 * **룰이 있어도 사정거리가 짧으면 룰이 없는 것과 같다.** 라벨 장식 게이트가
 * `→` 를 통째로 면제했다가 다음 날 주 저장 버튼이 그 면제로 빠져나간 것과
 * 같은 실패다. 그래서 Tier C 를 더한다: `src/`·`app/` 의 TS/TSX 에서 실행
 * 가능한 형태의 맨몸 호출을 금지하고, 살아있는 형태는 단일 출처
 * (`src/shared/config/cli-invocation.ts`)가 만든다.
 */

/** 죽은 채널을 실행하려는 시도. 한 줄 안에서 러너와 패키지가 만나는 형태만 본다. */
const DEAD_INVOCATION: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "npx-ontology-atlas", pattern: /\bnpx\b[^\n]*\bontology-atlas\b/ },
  { id: "mcp-command-npx", pattern: /["']command["']\s*:\s*["']npx["']/ },
  { id: "codex-command-npx", pattern: /^\s*command\s*=\s*"npx"/m },
  {
    id: "npm-install-global",
    pattern: /\bnpm\s+(?:install|i)\s+(?:-g|--global)\b[^\n]*\bontology-atlas\b/,
  },
  { id: "dlx", pattern: /\b(?:pnpm|yarn)\s+dlx\b[^\n]*\bontology-atlas\b/ },
  /**
   * 맨몸 호출 — 러너가 없어 위 패턴에 안 걸리지만 **실행되지 않는 것은 똑같다**.
   * `which ontology-atlas` → not found. Tier A 는 전면 금지, Tier B 는 펜스
   * 안에서만 금지된다(산문으로 "그건 죽었다" 고 말하려면 이름을 불러야 하므로).
   */
  {
    id: "bare-ontology-atlas",
    pattern:
      /(?<![\w/<-])ontology-atlas (?:absorb|add|agent-activity|agent-brief|agent-files|agent-setup|all-paths|analyze|backlinks|blast-radius|bootstrap|compile|components|cycles|delete|domain-matrix|explain|export|facets|find|growth|health|hubs|import|index|infer-imports|init|list|maintenance|match-edges|match-nodes|mcp-verify|merge|moment|node|node-profile|orphans|overview|path|pattern-walk|preflight|project-map|query|reachability|relate|relation-check|rename|schema|similar|snapshot|topological-order|validate|workspace-brief)(?![\w-])/,
  },
];

/**
 * Tier A — 죽은 채널을 한 글자도 쓰지 않는 표면.
 * 디렉터리는 글롭으로 잡아 **새로 추가되는 파일도 자동으로 덮는다**.
 */
const TIER_A_GLOBS = [
  "docs/launch/**/*.md",
  ".github/**/*.md",
  ".github/**/*.yml",
  ".github/**/*.yaml",
  "CONTRIBUTING.md",
  "cli/templates/vault/README.md",
  "cli/templates/vault-ko/README.md",
  // CLI 템플릿과 바이트 동일해야 하는 웹 스타터 (starter-templates.contract).
  "src/features/docs-vault-local/lib/ontology-starter.ts",
];

/** Tier B — 산문으로 "그건 죽었다" 고 말해도 되지만, 코드 블록에는 못 넣는 표면. */
const TIER_B_FILES = [
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "docs/AGENT-GRAPH-WORKFLOW.md",
  "docs/FEATURES.md",
  "docs/TROUBLESHOOTING.md",
  "docs/PRODUCT-DIRECTION.md",
  "cli/README.md",
  "mcp/README.md",
];

/**
 * Tier C — 소스에서 **명령으로 읽히는** 맨몸 호출. 산문 속 제품명
 * ("ontology-atlas contributors", "Use this ontology-atlas run order")은 명령이
 * 아니므로 **실제 CLI 명령 이름이 뒤따를 때만** 위반이다.
 */
const CLI_COMMANDS = [
  "absorb", "add", "agent-activity", "agent-brief", "agent-files", "agent-setup",
  "all-paths", "analyze", "backlinks", "blast-radius", "bootstrap",
  "compile", "components", "cycles", "delete", "domain-matrix", "explain",
  "export", "facets", "find", "growth", "health", "hubs", "import", "index",
  "infer-imports", "init", "list", "maintenance", "match-edges", "match-nodes",
  "mcp-verify", "merge", "moment", "node", "node-profile", "orphans", "overview",
  "path", "pattern-walk", "preflight", "project-map", "query", "reachability",
  "relate", "relation-check", "rename", "schema", "similar", "snapshot",
  "topological-order", "validate", "workspace-brief",
] as const;

/**
 * `<ontology-atlas checkout>` 같은 **자리 표시** 안의 이름은 명령이 아니다 —
 * 그건 이미 살아있는 형태(`node <…>/cli/src/index.mjs`)의 일부다. 그래서 여는
 * 꺾쇠와 경로 구분자를 앞자리에서 배제한다.
 */
const BARE_CLI_PATTERN = new RegExp(
  `(?<![\\w/<-])ontology-atlas (?:${CLI_COMMANDS.map((c) => c.replace(/-/g, "\\-")).join("|")})(?![\\w-])`,
);

/**
 * 이 파일들만 죽은 이름을 문자로 가질 수 있다 — 하나는 **살아있는 형태를
 * 만드는 곳**이고, 하나는 **이 규칙을 설명하는 곳**(그러려면 이름을 불러야
 * 한다)이다. 목록이 셋이 되면 그건 규칙이 새는 신호다.
 */
const TIER_C_ALLOWED = [
  "src/shared/config/cli-invocation.ts",
  "src/shared/config/mcp-server-launch.ts",
];

interface Offence {
  file: string;
  line: number;
  rule: string;
  text: string;
}

function offencesIn(text: string, file: string, fencedOnly: boolean): Offence[] {
  const found: Offence[] = [];
  let insideFence = false;

  text.split("\n").forEach((line, index) => {
    // `ontology-starter.ts` 는 마크다운을 템플릿 리터럴에 담아 백틱을 이스케이프
    // 한다. 펜스 판정 전에 백슬래시를 걷어내면 .md 와 .ts 가 같은 규칙을 탄다.
    const bare = line.replace(/\\/g, "");
    if (/^\s*(```|~~~)/.test(bare)) {
      insideFence = !insideFence;
      return;
    }
    if (fencedOnly && !insideFence) return;

    for (const { id, pattern } of DEAD_INVOCATION) {
      if (pattern.test(line)) found.push({ file, line: index + 1, rule: id, text: line.trim() });
    }
  });

  return found;
}

function report(offences: Offence[]): string {
  return offences.map((o) => `  ${o.file}:${o.line} [${o.rule}] ${o.text.slice(0, 110)}`).join("\n");
}

describe("npm 채널은 폐기됐다 — 죽은 npx 안내 차단", () => {
  it("Tier C: 소스가 실행 불가능한 맨몸 `ontology-atlas <명령>` 을 만들지 않는다", async () => {
    const { execFileSync } = await import("node:child_process");
    const files = execFileSync("git", ["ls-files", "src", "app"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f))
      // `git ls-files` 는 아직 stage 하지 않은 삭제 파일도 index 에 남긴다.
      // 게이트가 현재 작업 트리를 읽게 해야 삭제 자체를 검증할 수 있다.
      .filter((f) => existsSync(join(process.cwd(), f)))
      .filter((f) => !f.includes(".test."))
      // 생성 미러는 저장소 산문을 담고 있어 **문서를 소스로 오인**하게 만든다.
      .filter((f) => !f.includes("docs-vault/data"))
      .filter((f) => !TIER_C_ALLOWED.includes(f));

    expect(files.length, "Tier C 파일 목록이 비었다 — 경로 계약이 깨졌다").toBeGreaterThan(100);

    const offences: Offence[] = [];
    for (const rel of files) {
      const text = readFileSync(join(process.cwd(), rel), "utf8");
      text.split("\n").forEach((line, index) => {
        if (BARE_CLI_PATTERN.test(line)) {
          offences.push({ file: rel, line: index + 1, rule: "bare-ontology-atlas", text: line.trim() });
        }
      });
    }

    expect(
      offences,
      offences.length
        ? `실행할 수 없는 맨몸 CLI 호출이다 — 이 이름의 전역 바이너리는 없다.\n` +
            `\`ATLAS_CLI\`(src/shared/config/cli-invocation.ts)로 만들어라.\n${report(offences)}`
        : "",
    ).toEqual([]);
  });

  /**
   * **탐지기가 조용히 무력화되는 것을 막는 프로브.** 위 검사는 위반이 0이면
   * 언제나 통과하므로, 패턴이 오타 하나로 죽어도 아무도 모른다. 여기서 위반
   * 1줄과 정상 3줄을 직접 먹여 전자만 걸리는지 확인한다.
   */
  it("Tier C 프로브: 명령만 잡고 제품명·살아있는 형태는 통과시킨다", () => {
    expect(BARE_CLI_PATTERN.test('`ontology-atlas validate ${target}`')).toBe(true);
    expect(BARE_CLI_PATTERN.test('"ontology-atlas agent-brief [vault]"')).toBe(true);
    // 산문 속 제품명 — 명령이 아니다.
    expect(BARE_CLI_PATTERN.test("name: 'ontology-atlas contributors'")).toBe(false);
    expect(BARE_CLI_PATTERN.test("Use this ontology-atlas first-contact run order")).toBe(false);
    // 살아있는 형태 — 경로 안의 이름은 잡지 않는다.
    expect(BARE_CLI_PATTERN.test("`node $ATLAS/cli/src/index.mjs validate ${t}`")).toBe(false);
    expect(BARE_CLI_PATTERN.test("node <ontology-atlas checkout>/cli/src/index.mjs agent-setup")).toBe(
      false,
    );
  });

  it("Tier A: 런치 초안 · 이슈 템플릿 · 기여 안내 · 스타터에 죽은 명령이 없다", async () => {
    const { glob } = await import("node:fs/promises");
    const files: string[] = [];
    for (const pattern of TIER_A_GLOBS) {
      for await (const entry of glob(pattern, { cwd: process.cwd() })) files.push(entry);
    }

    // 게이트가 스스로 살아있음을 증명한다 — 글롭이 0건을 읽으면 "위반 없음" 이
    // 아니라 이 단언이 먼저 터진다. (2026-07 에 같은 종류의 게이트가 외부
    // 프로세스 실패로 조용히 전부 통과시킨 사고가 있었다.)
    expect(files.length, "Tier A glob matched nothing — 경로 계약이 깨졌다").toBeGreaterThan(5);

    const offences = files.flatMap((rel) =>
      offencesIn(readFileSync(join(process.cwd(), rel), "utf8"), rel, false),
    );

    expect(
      offences,
      offences.length
        ? `죽은 npm 채널 안내 ${offences.length}건 (npm 발행 폐기, docs/DECISIONS.md 2026-07-27).\n` +
            `살아있는 경로는 둘뿐이다 — 설치 앱의 「에이전트 연결」 버튼, 또는 소스 체크아웃의\n` +
            `\`node <checkout>/cli/src/index.mjs\`.\n${report(offences)}`
        : "",
    ).toEqual([]);
  });

  it("Tier B: 참고 문서의 코드 블록 안에 죽은 명령이 없다 (산문 인용은 허용)", () => {
    const present = TIER_B_FILES.filter((rel) => existsSync(join(process.cwd(), rel)));
    expect(present, "Tier B 파일 경로가 깨졌다").toEqual(TIER_B_FILES);

    const offences = present.flatMap((rel) =>
      offencesIn(readFileSync(join(process.cwd(), rel), "utf8"), rel, true),
    );

    expect(
      offences,
      offences.length
        ? `코드 블록은 "이걸 복사해 실행하라" 는 뜻이다. 죽은 채널은 산문으로만 인용한다.\n${report(offences)}`
        : "",
    ).toEqual([]);
  });

  // ── 프로브: 게이트가 실제로 잡는지 증명한다 ──────────────────────────────
  // 룰을 켜기 전 "위반 1건 실패 + 정상 1건 통과" 를 증명하라는 design.md 절차를
  // 게이트 자신 안에 상주시킨다. 탐지기가 조용히 무력화되면 여기서 먼저 터진다.
  it("프로브: 위반은 잡고, 정직한 산문과 살아있는 경로는 통과시킨다", () => {
    const violations = [
      "npx ontology-atlas init my-vault",
      "  - \"npx ontology-atlas init\"",
      '      "command": "npx",',
      'command = "npx"',
      "npm install -g ontology-atlas",
      "pnpm dlx ontology-atlas init",
    ];
    // **겹쳐 걸리는 것은 정상이다.** `npx ontology-atlas init` 은 러너 규칙과
    // 맨몸 규칙에 동시에 걸린다 — 같은 줄이 두 가지 이유로 틀렸다는 뜻이고,
    // 규칙 하나가 나중에 좁아져도 나머지가 받친다. 그래서 "정확히 1건" 이
    // 아니라 "적어도 1건" 을 요구한다.
    for (const line of violations) {
      expect(
        offencesIn(line, "probe", false).length,
        `놓쳤다: ${line}`,
      ).toBeGreaterThanOrEqual(1);
    }

    const allowed = [
      "node $ATLAS init ./ontology",
      '"command": "/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp"',
      "node <checkout>/cli/src/index.mjs agent-setup <vault> --root . --write",
      "npx create-next-app",
    ];
    for (const line of allowed) {
      expect(offencesIn(line, "probe", false), `오탐: ${line}`).toHaveLength(0);
    }

    // 펜스 안/밖 판별이 실제로 갈리는지 — Tier B 의 핵심 성질. 같은 글리프라도
    // 산문 인용("그건 안 된다")은 통과하고, 코드 블록("이걸 실행하라")은 잡힌다.
    const doc = [
      "`npx ontology-atlas` and `npx -y ontology-atlas-mcp` do not resolve and never will.",
      "```bash",
      "npx ontology-atlas init",
      "```",
    ].join("\n");
    // 자리(펜스 안/밖)로 갈리는지가 요점이라 **줄 수**로 센다 — 한 줄이 여러
    // 규칙에 걸리는 것은 위에서 정상으로 정했으므로 건수로 세면 그 겹침이
    // 이 성질과 무관하게 숫자를 흔든다.
    const linesOf = (fencedOnly: boolean) =>
      new Set(offencesIn(doc, "probe", fencedOnly).map((o) => o.line)).size;
    expect(linesOf(true), "Tier B 는 펜스 안 한 줄만 잡아야 한다").toBe(1);
    expect(linesOf(false), "Tier A 는 산문 인용 줄까지 두 줄을 잡아야 한다").toBe(2);
  });
});
