#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export const DEFAULT_ONTOLOGY_DESIGN_TARGET_DIRS = [
  "src/views/docs-vault",
  "src/widgets/docs-vault",
  // #611 (2026-07-24) retired the xyflow ERD builder at src/views/ontology-edit.
  // The write surface is now the 공방 (Compass Stage) at src/views/ontology-studio,
  // with a thin client redirect at src/views/ontology-edit-redirect. Scanning the
  // studio matters more than ever — the old --studio-* game exception was retired,
  // so this surface must pass the same charter (no glow/gradient/scale-hover).
  "src/views/ontology-studio",
  "src/views/ontology-edit-redirect",
  "src/views/ontology-insights",
  // feat/rail-rollout retired `operations-nav` (top tab bar) and
  // `ontology-sub-nav` (their inline sub-tab) in favor of the persistent
  // `app-nav-rail` + per-page `app-settings-menu` — those replace them here.
  "src/widgets/app-nav-rail",
  "src/widgets/app-settings-menu",
  "src/widgets/bottom-tab-bar",
  "src/widgets/topology-index-panel",
  "src/shared/ui",
];

const DEFAULT_ALLOWED_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const DEFAULT_IGNORED_FILE_PATTERN = /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[^/]+$/;

export const ONTOLOGY_DESIGN_FORBIDDEN_CHECKS = [
  {
    id: "no-hover-shadow",
    pattern: /hover:shadow/g,
    reason: "Use border/background transitions instead of glow-like hover shadows.",
  },
  {
    id: "no-hover-scale",
    pattern: /hover:scale-/g,
    reason: "Scale-based hover is forbidden by docs/DESIGN-SYSTEM.md.",
  },
  {
    id: "no-backdrop-blur",
    pattern: /backdrop-blur/g,
    reason: "Glassmorphism is forbidden by docs/DESIGN-SYSTEM.md.",
  },
  {
    id: "no-purple-pink",
    pattern: /\b(?:purple|pink)\b|(?:from|via|to)-(?:purple|pink)-/gi,
    reason: "Ontology operation surfaces stay on neutral surfaces plus indigo.",
  },
  {
    id: "no-decorative-gradient",
    pattern: /\b(?:bg-gradient|linear-gradient|radial-gradient)\b/g,
    reason: "Decorative gradients are forbidden on ontology operation surfaces.",
    // A gradient is only forbidden when it paints DECORATIVE COLOR. Mask fades
    // (mask-image / -webkit-mask-image using black/transparent alpha) and
    // token/dot-grid textures (var(--…) + transparent, no color literals) are
    // functional, charter-compliant techniques — not decorative color fills.
    allow: (line) => gradientIsFunctional(line),
  },
  {
    id: "no-glow-ring",
    pattern: /boxShadow:\s*`0 0/g,
    reason: "Use restrained borders, stripes, and labels instead of glow-like rings.",
  },
  {
    id: "no-kind-decision-stripe",
    pattern: /ontology-kind-decision-stripe/g,
    reason:
      "The node detail classification card uses a compact marker and neutral divider instead of a full-height colored rail.",
  },
];

// True when a gradient on this line is functional (a mask fade, or a
// monochrome/token texture) rather than a decorative color fill. Charter forbids
// decorative COLOR gradients (purple→pink, aurora, colored bg fills); it allows
// mask-image alpha fades and token dot-grid textures.
export function gradientIsFunctional(line) {
  // Mask fades control reveal/alpha, not color — always functional.
  if (/mask-?image|mask\s*:/i.test(line)) return true;
  const calls = line.match(/(?:linear|radial|conic)-gradient\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gi);
  if (!calls) return false; // e.g. bare `bg-gradient` Tailwind class — decorative.
  // Decorative when any stop names a real color: a non-monochrome hex, an
  // rgb()/hsl() value, or a color keyword. transparent/black/white/#000/#fff and
  // CSS custom-property tokens (var(--…)) are functional, not decorative.
  const decorative = /#(?!000\b|fff\b|000000\b|ffffff\b)[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:red|orange|yellow|green|blue|indigo|violet|purple|pink|amber|cyan|teal|magenta|lime|rose|fuchsia|emerald|sky)\b/i;
  return calls.every((call) => !decorative.test(call));
}

// Blank out comment content (both `/* … */` blocks — including JSX `{/* … */}` —
// and `//` line comments) while preserving character positions, so line/column
// reporting stays accurate. A design gate scans styling CODE, not prose comments
// that merely mention a forbidden token to explain it is deliberately avoided.
export function blankComments(source) {
  let out = "";
  let i = 0;
  let state = "code"; // code | block | line | string
  let quote = "";
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (state === "code") {
      if (c === "/" && next === "*") { out += "  "; i += 2; state = "block"; continue; }
      // `//` line comment, but not `://` (URLs like https://).
      if (c === "/" && next === "/" && source[i - 1] !== ":") { out += "  "; i += 2; state = "line"; continue; }
      if (c === '"' || c === "'" || c === "`") { quote = c; state = "string"; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === "string") {
      if (c === "\\") { out += source.slice(i, i + 2); i += 2; continue; }
      if (c === quote) { state = "code"; }
      out += c; i += 1; continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") { out += "  "; i += 2; state = "code"; continue; }
      out += c === "\n" ? "\n" : " "; i += 1; continue;
    }
    // line comment
    if (c === "\n") { out += "\n"; i += 1; state = "code"; continue; }
    out += " "; i += 1;
  }
  return out;
}

export const ONTOLOGY_DESIGN_REQUIRED_SURFACE_MARKERS = [
  // [삭제, 2026-07-18] "browse-workbench-loop" / "browse-tree-row-graph-handle"
  // 체크 — B3 "허브가 곧 지도" 로 `/ontology` 의 트리/ego 허브
  // (`OntologyViewPage.tsx` + `ontology-tree-view` widget) 가 통째로
  // retire 되고 `/topology` (지도 + INDEX 패널 + 데이터시트) 로 수렴했다.
  // Browse/Write/Query 루프 자체는 없어지지 않았다 — INDEX 패널의 트리 +
  // `?p=` 선택 + 데이터시트 "전체 상세 →" 가 같은 역할을 지도 위에서 한다.
  {
    // docs-chrome-round (2026-07): 점검 밴드가 중앙 모달로 승격되며
    // `DocsVaultSourceContractBar` → `DocsVaultAuditModal` (별도 파일) 로
    // 이동했다 — 마커는 파일 묶음 전체에서 존재를 본다(builder-write-verify-loop
    // 와 동일 패턴).
    id: "source-vault-execution-contract",
    files: [
      "src/views/docs-vault/ui/DocsVaultPage.tsx",
      "src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx",
    ],
    markers: [
      "function DocsVaultAuditModal",
      "sourceContract.filesLabel",
      "sourceContract.filesChip",
      "sourceContract.graphLabel",
      "sourceContract.graphChip",
      "sourceContract.agentLabel",
      "sourceContract.agentChip",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "SOURCE_VAULT_RUNTIME_REPLAY_MARKERS",
      "pattern_walk/project_map",
      "sourceContract.agentCopyGate",
    ],
    reason:
      "/docs must read as Workspace with Files / Graph / Agent execution contract and a copyable graph check.",
  },
  {
    // [교체, 2026-07-24] 구 "builder-write-verify-loop" 체크 — 대상이던 xyflow
    // ERD 빌더(src/views/ontology-edit/*)가 #611 로 은퇴했다. 쓰기 표면은 이제
    // 공방(Compass Stage, src/views/ontology-studio)이다: 관계 종류별 고정
    // 방위(CompassBearingView) + 라인아트 소켓 채우기 → 실제 frontmatter 관계
    // 쓰기(buildFillPacket) 또는 읽기전용 vault 의 MCP 패킷 핸드오프
    // (buildMcpPacket), 그리고 진행도 캡션(bottomProgress).
    id: "studio-write-verify-loop",
    files: [
      "src/views/ontology-studio/ui/OntologyStudioPage.tsx",
      "src/views/ontology-studio/ui/StudioCompass.tsx",
      "src/views/ontology-studio/lib/build-create-node.ts",
    ],
    markers: [
      "function OntologyStudioPage",
      "StudioCompass",
      "CompassBearingView",
      "buildFillPacket",
      "buildMcpPacket",
      "bottomProgress",
    ],
    reason:
      "/ontology/studio (공방) must expose fixed compass bearings, fillable sockets that write a real relation (or an MCP packet in a read-only vault), and a plain progress caption.",
  },
  // [교체, 2026-07-18] "query-cockpit-runtime-gate" 체크 — 대상이던 4탭
  // reader-persona insights (InsightsQueryPackCockpit 등) 가 #363 (insights
  // 3탭 재구축) 으로 삭제됐다. 새 계약: 3탭 구조(TabBar) + 실그래프 census
  // 히어로 + 에이전트 핸드오프 행(복사 가능한 payload) 이 남아 있어야 한다.
  {
    id: "insights-tabbed-handoff",
    files: [
      "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
      "src/views/ontology-insights/ui/tabs/OverviewTab.tsx",
      "src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx",
    ],
    markers: [
      "TabBar",
      "InsightsHeroCensus",
      "InsightsHandoffRow",
      "CopyAgentTextButton",
    ],
    reason:
      "/ontology/insights must keep the 3-tab structure, the real-graph census hero, and a copyable agent handoff row.",
  },
  // [삭제, 2026-07-18] "topology-kind-legend-role-copy" 체크 — 대상 파일
  // `SigmaTopology.tsx` 가 #344 (retire-sigma-topology) 로 삭제됐고, 검증하던
  // i18n 키(kindLegend*Role)도 다른 어떤 컴포넌트도 소비하지 않아 함께 제거.
  // 이 UI(노드 kind 역할 legend)는 topology-map-v2 에 재구현되지 않았다.
  {
    id: "product-design-operating-system",
    files: ["docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md"],
    markers: [
      "Design Council",
      "PO + Designer Working Loop",
      "Atlas Designer Bench",
      "Lead Product Designer",
      "Interaction Designer",
      "Information Visualization Designer",
      "macOS Workbench Designer",
      "Design Systems Engineer",
      "Agent Handoff Designer",
      "Reference source packet:",
      "Source -> Atlas rule -> verifier",
      "Not allowed:",
      "Standing Relief/Topology Critique Queue",
      "Reference Permission Test",
      "Relief/Topology Token And Anti-Pattern Gate",
      "Token decision record",
      "stacked floating panels",
      "popup soup",
      "blocking composer",
      "drag-only discovery",
      "one-off JSX clamp",
      "compact/14-inch/1920/2560",
      "WebView token marker",
      "Apple HIG",
      "Fluent 2",
      "Atlassian",
      "Carbon",
      "yFiles",
      "Cambridge Intelligence",
      "Linear",
      "Rauno",
      "Tufte",
      "Rams",
      "installed app route",
      "WebView marker",
      "Computer Use",
      "Do not copy",
    ],
    reason:
      "Product Design OS must keep a concrete designer bench, public-reference permission test, Atlas-rule translation, and installed-app proof contract.",
  },
  {
    id: "relief-topology-token-contract",
    files: ["docs/DESIGN-SYSTEM.md", ".claude/rules/design.md"],
    markers: [
      "Tokenization Contract For Relief/Topology",
      "--topology-*",
      "product reason",
      "WebView/test marker",
      "stacked floating panels",
      "popup soup",
      "modal without modality",
      "drag-only discovery",
    ],
    reason:
      "Relief/Topology design changes must be tokenized and reject known floating-panel, popup, modal, and drag-discovery anti-patterns.",
  },
  {
    id: "agents-product-design-gate",
    files: ["AGENTS.md"],
    markers: [
      "Product design gate",
      "docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md",
      "mandatory",
      "Public references are principle sources only",
    ],
    reason:
      "AGENTS.md must route UI, graph readability, responsive, and macOS workbench changes through the Product Design OS after the PO pass.",
  },
];

function collectFiles(root, dir, allowedExtensions, ignoredFilePattern) {
  const absoluteDir = join(root, dir);
  const files = [];

  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(
        ...collectFiles(root, relative(root, absolutePath), allowedExtensions, ignoredFilePattern),
      );
      continue;
    }

    const relativePath = relative(root, absolutePath);
    if (
      stat.isFile() &&
      allowedExtensions.has(extname(entry)) &&
      !ignoredFilePattern.test(relativePath)
    ) {
      files.push(absolutePath);
    }
  }

  return files;
}

export function findForbiddenPatternViolations({
  root,
  file,
  checks = ONTOLOGY_DESIGN_FORBIDDEN_CHECKS,
}) {
  const rawSource = readFileSync(file, "utf8");
  const rawLines = rawSource.split(/\r?\n/);
  const lines = blankComments(rawSource).split(/\r?\n/);
  const violations = [];

  lines.forEach((line, lineIndex) => {
    for (const check of checks) {
      if (typeof check.allow === "function" && check.allow(line)) continue;
      check.pattern.lastIndex = 0;
      for (const match of line.matchAll(check.pattern)) {
        violations.push({
          file: relative(root, file),
          line: lineIndex + 1,
          column: (match.index ?? 0) + 1,
          check,
          source: (rawLines[lineIndex] ?? line).trim(),
        });
      }
    }
  });

  return violations;
}

export function findRequiredMarkerViolations({
  root,
  requiredSurfaceMarkers = ONTOLOGY_DESIGN_REQUIRED_SURFACE_MARKERS,
}) {
  const violations = [];

  for (const requirement of requiredSurfaceMarkers) {
    const files = requirement.files ?? [requirement.file];
    const source = files
      .map((file) => readFileSync(join(root, file), "utf8"))
      .join("\n");
    for (const marker of requirement.markers) {
      if (source.includes(marker)) continue;
      violations.push({
        file: files[0],
        line: 1,
        column: 1,
        check: {
          id: requirement.id,
          reason: requirement.reason,
        },
        source: `missing marker: ${marker}`,
      });
    }
  }

  return violations;
}

export function evaluateOntologyDesignSurface({
  root = process.cwd(),
  targetDirs = DEFAULT_ONTOLOGY_DESIGN_TARGET_DIRS,
  allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,
  ignoredFilePattern = DEFAULT_IGNORED_FILE_PATTERN,
  checks = ONTOLOGY_DESIGN_FORBIDDEN_CHECKS,
  requiredSurfaceMarkers = ONTOLOGY_DESIGN_REQUIRED_SURFACE_MARKERS,
} = {}) {
  const files = targetDirs
    .flatMap((dir) => collectFiles(root, dir, allowedExtensions, ignoredFilePattern))
    .sort();
  const violations = [
    ...files.flatMap((file) => findForbiddenPatternViolations({ root, file, checks })),
    ...findRequiredMarkerViolations({ root, requiredSurfaceMarkers }),
  ];

  return {
    ok: violations.length === 0,
    files,
    targetDirCount: targetDirs.length,
    requiredSurfaceMarkerCount: requiredSurfaceMarkers.length,
    violations,
  };
}

export function renderOntologyDesignSurfaceReport(report) {
  if (report.ok) {
    return [
      `[ontology-design-surface] clean · checked ${report.files.length} files across ${report.targetDirCount} surfaces + ${report.requiredSurfaceMarkerCount} workbench structure contracts`,
    ];
  }

  const lines = [
    `[ontology-design-surface] ${report.violations.length} design drift violation(s) found`,
  ];

  for (const violation of report.violations) {
    lines.push(
      `- ${violation.file}:${violation.line}:${violation.column} ${violation.check.id}`,
    );
    lines.push(`  ${violation.check.reason}`);
    lines.push(`  ${violation.source}`);
  }

  return lines;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = evaluateOntologyDesignSurface();
  const lines = renderOntologyDesignSurfaceReport(report);
  for (const line of lines) {
    if (report.ok) console.log(line);
    else console.error(line);
  }
  if (!report.ok) process.exit(1);
}
