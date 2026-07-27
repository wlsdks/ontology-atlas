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
    for (const line of violations) {
      expect(offencesIn(line, "probe", false), `놓쳤다: ${line}`).toHaveLength(1);
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
    expect(offencesIn(doc, "probe", true), "Tier B 는 펜스 안 1건만 잡아야 한다").toHaveLength(1);
    expect(offencesIn(doc, "probe", false), "Tier A 는 산문 인용까지 2건 다 잡아야 한다").toHaveLength(
      2,
    );
  });
});
