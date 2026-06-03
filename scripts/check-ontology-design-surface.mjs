#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export const DEFAULT_ONTOLOGY_DESIGN_TARGET_DIRS = [
  "src/views/docs-vault",
  "src/widgets/docs-vault",
  "src/views/ontology-view",
  "src/views/ontology-edit",
  "src/views/ontology-insights",
  "src/widgets/ontology-sub-nav",
  "src/widgets/operations-nav",
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
  },
];

export const ONTOLOGY_DESIGN_REQUIRED_SURFACE_MARKERS = [
  {
    id: "browse-workbench-loop",
    files: ["src/views/ontology-view/ui/OntologyViewPage.tsx"],
    markers: [
      "function GraphWorkbenchSummary",
      "<GraphWorkbenchSummary",
      "activeSlugLabel",
      "activeSlugBody",
      "treeProof",
      "graphDbProof",
      "formatAgentPostChangeSyncPacket",
    ],
    reason:
      "/ontology must keep Browse / Write / Query cards plus the graph DB proof rail from docs/DESIGN-SYSTEM.md.",
  },
  {
    id: "browse-tree-row-graph-handle",
    files: ["src/widgets/ontology-tree-view/ui/OntologyTreeView.tsx"],
    markers: [
      "selectAriaLabel",
      "selectedHandleLabel",
      "selectedHandleTitle",
      "data-orphan-select-button",
    ],
    reason:
      "/ontology tree rows must name the selected graph handle so Browse / Write / Query keep the same slug.",
  },
  {
    id: "source-vault-execution-contract",
    files: ["src/views/docs-vault/ui/DocsVaultPage.tsx"],
    markers: [
      "function DocsVaultSourceContractBar",
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
      "/docs must read as Source Vault with Files / Graph / Agent execution contract and a copyable graph gate.",
  },
  {
    id: "builder-write-verify-loop",
    files: ["src/views/ontology-edit/ui/OntologyEditPage.tsx"],
    markers: [
      "function BuilderWriteSummary",
      "function BuilderCanvasEntryRail",
      "formatBuilderGuardPacket",
      "formatBuilderProofPacket",
      "formatAgentPostChangeSyncPacket",
      "aria-label={t(\"ariaLabel\"",
      "anchorAriaLabel",
      "anchorSlugLabel",
      "data-anchor-slug",
      "activeFocusAriaLabel",
      "activeFocus",
      "proofChipSelected",
    ],
    reason:
      "/ontology/edit must expose Source / Draft / Guard / Proof plus persisted graph anchors before canvas work.",
  },
  {
    id: "query-cockpit-runtime-gate",
    files: [
      "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
      "src/views/ontology-insights/ui/parts/InsightsQueryPackCockpit.tsx",
      "src/views/ontology-insights/ui/parts/InsightsFocusedNodeProofPanel.tsx",
    ],
    markers: [
      "function InsightsQueryPackCockpit",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND",
      "queryCockpitCopyRuntimeGate",
      "queryCockpitContractsAriaLabel",
      "queryCockpitLiveProofAriaLabel",
      "queryCockpitEvidenceAriaLabel",
      "focused_blast_radius",
      "relation_name_parity",
      "pattern_walk/project_map",
      "--type depends_on",
      "relationType and via",
    ],
    reason:
      "/ontology/insights must lead with executable graph DB query pack, runtime gate, and result contracts.",
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
  const source = readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  const violations = [];

  lines.forEach((line, lineIndex) => {
    for (const check of checks) {
      check.pattern.lastIndex = 0;
      for (const match of line.matchAll(check.pattern)) {
        violations.push({
          file: relative(root, file),
          line: lineIndex + 1,
          column: (match.index ?? 0) + 1,
          check,
          source: line.trim(),
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
