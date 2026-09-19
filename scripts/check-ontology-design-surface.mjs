#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export const DEFAULT_ONTOLOGY_DESIGN_TARGET_DIRS = [
  "src/views/docs-vault",
  "src/widgets/docs-vault",
  // Manual writing now lives in the selected map inspector; ACP writing pauses
  // inside its existing conversation card. The old Studio route is a redirect.
  "src/views/home",
  "src/features/ontology-meaning-editor",
  "src/features/ontology-change-review",
  "src/widgets/acp-chat-panel",
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
  // The visual-expression checks that used to sit here (hover shadow, scale hover,
  // backdrop blur, purple/pink, decorative gradient, glow ring) were lifted by the
  // owner on 2026-09-08 — `docs/DECISIONS.md`, "The expression bans are lifted".
  // What stays is structural: a full-height coloured rail is a layout decision,
  // not an effect.
  {
    id: "no-kind-decision-stripe",
    pattern: /ontology-kind-decision-stripe/g,
    reason:
      "The node detail classification card uses a compact marker and neutral divider instead of a full-height colored rail.",
  },
];

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
  {
    // The audit band was promoted to a centred modal and moved from
    // `DocsVaultSourceContractBar` to `DocsVaultAuditModal` (a separate file), so the
    // marker checks for presence across the whole file bundle.
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
    id: "contextual-write-review-loop",
    files: [
      "src/views/home/ui/HomePage.tsx",
      "src/views/home/ui/CreateNodeForm.tsx",
      "src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx",
      "src/features/ontology-change-review/ui/OntologyChangeReview.tsx",
      "src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx",
      "src/features/acp-session/model/acp-client.ts",
    ],
    markers: [
      "MeaningEditorPanel",
      "buildOntologyRelationEditPlan",
      "meaning-editor-change-review",
      "create-node-change-review",
      "previewEdge={mapRelationPreview}",
      "acp-ontology-change-review",
      "reviewKind === 'ontology-write'",
      "allowAlways && !ontologyWrite",
      "atlasMode === 'write'",
    ],
    reason:
      "Map and ACP writes must both stop on a typed pre-write change review; the map must preview the proposed relation without mutating layout, and ontology writes must never expose allow-always.",
  },
  // Replaced the old three-tab "insights-tabbed-handoff" check (2026-07-27). Insights
  // has six measured maintenance questions (do next / unmatched / composition /
  // connections / boundaries / freshness) plus one agent-written Flow question. Neither a
  // fixed three-tab dashboard nor a metrics-only board is the current contract.
  // What must hold together is the exact seven-tab set restorable from the URL, one
  // active tabpanel at a time, and an agent handoff matching the current question.
  // `unmatched` joined on 2026-09-05: names this folder was asked for and does not hold.
  {
    id: "insights-maintenance-board",
    files: [
      "src/views/ontology-insights/lib/insights-tab-state.ts",
      "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
      "src/views/ontology-insights/ui/tabs/FlowTab.tsx",
      "src/views/ontology-insights/ui/parts/InsightsHandoffRow.tsx",
    ],
    markers: [
      [
        "export const INSIGHTS_TABS = [",
        '  "brief",',
        '  "library",',
        '  "harness",',
        '  "do-next",',
        '  "unmatched",',
        '  "composition",',
        '  "connections",',
        '  "boundaries",',
        '  "growth",',
        '  "flow",',
        "] as const;",
      ].join("\n"),
      'data-insights-surface="maintenance-board"',
      'data-insights-question-model="one-tab-one-question"',
      "TabBar",
      'role="tabpanel"',
      '{tab === "flow" ? (',
      "<FlowTab",
      'request={flowRequest}',
      "canLaunchAgent={agentRoute === 'agent'}",
      '<InsightsAgentDock',
      'data-testid="flow-tab"',
      'data-testid="flow-prefill"',
      "onClick={() => onPrefill?.(request)}",
      "navigator.clipboard.writeText(request)",
      'data-testid="flow-copy"',
      "InsightsHandoffRow",
      'data-insights-handoff="tab-query"',
      "CopyAgentTextButton",
    ],
    reason:
      "/ontology/insights must keep the brief first, a row naming each core, six measured ontology tabs and a rendered Flow panel with its visible request, person-owned prefill, browser copy fallback, and tab-scoped agent handoff.",
  },
  {
    id: "product-design-operating-system",
    files: ["docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md"],
    markers: [
      "pnpm design:route",
      "computer-use-loop",
      "Do not build a whole UI from imagination",
      "real macOS screen",
      "Design Council",
      "Atlas Designer Bench",
      "No seat always attends",
      "Council utility",
      "Five consecutive no-delta councils",
      "No-Human-Designer Working Mode",
      "Source -> Atlas rule -> verifier",
      "Reference Permission Test",
      "Relief/Topology Graph Engine Fit Gate",
      "ontology-map",
      "Graphology",
      "ForceAtlas2",
      "Composer blocks the map",
      "Click focus must be durable",
      "Drag is editing, not discovery",
      "Installed macOS app proof",
      "WebView marker",
      "Computer Use",
    ],
    reason:
      "Product Design OS must keep fact-derived proof routing, iterative real-window inspection, recorded motion, selected-seat council utility, and Atlas topology/desktop boundaries.",
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
      "Design gate after the PO pass",
      "docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md",
      "/design-build",
      "pnpm design:route",
      "Computer Use while building",
      "/motion-verify",
    ],
    reason:
      "AGENTS.md must route design from observable facts and require the iterative Computer Use and recorded-motion evidence contracts.",
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
  const idleViolations = files.length === 0
    ? [{
        file: targetDirs.join(", ") || "(no target directories)",
        line: 1,
        column: 1,
        check: {
          id: "ontology-design-scan-idle",
          reason: "The ontology design gate must scan at least one real source file.",
        },
        source: "matched zero design-surface files",
      }]
    : [];
  const violations = [
    ...idleViolations,
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
