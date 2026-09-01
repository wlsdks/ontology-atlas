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
function maskCssCustomPropertyCalls(line) {
  let result = "";
  let cursor = 0;
  const varCall = /\bvar\(/gi;

  while (cursor < line.length) {
    varCall.lastIndex = cursor;
    const match = varCall.exec(line);
    if (!match) {
      result += line.slice(cursor);
      break;
    }

    result += line.slice(cursor, match.index);
    let depth = 1;
    let end = varCall.lastIndex;
    while (end < line.length && depth > 0) {
      if (line[end] === "(") depth += 1;
      if (line[end] === ")") depth -= 1;
      end += 1;
    }

    if (depth !== 0) {
      result += line.slice(match.index);
      break;
    }

    // Token names may legitimately contain color words such as "indigo". The
    // design-system token itself is the authority; inspecting its spelling as a
    // literal color would turn an allowed functional fill into a false positive.
    result += "design-token";
    cursor = end;
  }

  return result;
}

export function gradientIsFunctional(line) {
  // Mask fades control reveal/alpha, not color — always functional.
  if (/mask-?image|mask\s*:/i.test(line)) return true;
  const tokenNeutralLine = maskCssCustomPropertyCalls(line);
  const calls = tokenNeutralLine.match(/(?:linear|radial|conic)-gradient\(([^)]*(?:\([^)]*\)[^)]*)*)\)/gi);
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
  // has five measured maintenance questions (do next / composition / connections /
  // boundaries / freshness) plus one agent-written Flow question. Neither a fixed
  // three-tab dashboard nor a metrics-only five-tab board is the current contract.
  // What must hold together is the exact six-tab set restorable from the URL, one
  // active tabpanel at a time, and an agent handoff matching the current question.
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
        '  "do-next",',
        '  "composition",',
        '  "connections",',
        '  "boundaries",',
        '  "freshness",',
        '  "flow",',
        "] as const;",
      ].join("\n"),
      'data-insights-surface="maintenance-board"',
      'data-insights-question-model="one-tab-one-question"',
      "TabBar",
      'role="tabpanel"',
      '{tab === "flow" ? (',
      "<FlowTab",
      'request={buildBusinessFlowRequest({ request: t("flow.request") })}',
      'canLaunchAgent={isAcpBridgeAvailable()}',
      'router.push(buildBusinessFlowHref(buildInsightsReturnMarker("flow")));',
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
      "/ontology/insights must keep five measured maintenance tabs plus a rendered Flow panel with its visible request, person-owned prefill, browser copy fallback, and tab-scoped agent handoff.",
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
      "topology-map-v2",
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
      "Product design gate",
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
