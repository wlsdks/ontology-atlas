#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const targetDirs = [
  "src/views/ontology-view",
  "src/views/ontology-edit",
  "src/views/ontology-insights",
  "src/widgets/ontology-sub-nav",
  "src/widgets/operations-nav",
];

const allowedExtensions = new Set([".css", ".ts", ".tsx"]);

const checks = [
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

const requiredSurfaceMarkers = [
  {
    id: "browse-workbench-loop",
    file: "src/views/ontology-view/ui/OntologyViewPage.tsx",
    markers: [
      "function GraphWorkbenchSummary",
      "<GraphProofRail model={graphProofRailModel} />",
      "formatAgentPostChangeSyncPacket",
    ],
    reason:
      "/ontology must keep Browse / Write / Query cards plus the graph DB proof rail from docs/DESIGN-SYSTEM.md.",
  },
  {
    id: "builder-write-verify-loop",
    file: "src/views/ontology-edit/ui/OntologyEditPage.tsx",
    markers: [
      "function BuilderWriteSummary",
      "function BuilderCanvasEntryRail",
      "formatBuilderProofPacket",
      "formatAgentPostChangeSyncPacket",
    ],
    reason:
      "/ontology/edit must expose Source / Draft / Guard / Proof plus persisted graph anchors before canvas work.",
  },
  {
    id: "query-cockpit-runtime-gate",
    file: "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
    markers: [
      "function InsightsQueryPackCockpit",
      "AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND",
      "AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND",
      "queryCockpitContractsAriaLabel",
    ],
    reason:
      "/ontology/insights must lead with executable graph DB query pack, runtime gate, and result contracts.",
  },
];

function collectFiles(dir) {
  const absoluteDir = join(root, dir);
  const files = [];

  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...collectFiles(relative(root, absolutePath)));
      continue;
    }

    if (stat.isFile() && allowedExtensions.has(extname(entry))) {
      files.push(absolutePath);
    }
  }

  return files;
}

function findViolations(file) {
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

function findRequiredMarkerViolations() {
  const violations = [];

  for (const requirement of requiredSurfaceMarkers) {
    const absolutePath = join(root, requirement.file);
    const source = readFileSync(absolutePath, "utf8");
    for (const marker of requirement.markers) {
      if (source.includes(marker)) continue;
      violations.push({
        file: requirement.file,
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

const files = targetDirs.flatMap(collectFiles).sort();
const violations = [
  ...files.flatMap(findViolations),
  ...findRequiredMarkerViolations(),
];

if (violations.length > 0) {
  console.error(
    `[ontology-design-surface] ${violations.length} design drift violation(s) found`,
  );

  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line}:${violation.column} ${violation.check.id}`,
    );
    console.error(`  ${violation.check.reason}`);
    console.error(`  ${violation.source}`);
  }

  process.exit(1);
}

console.log(
  `[ontology-design-surface] clean · checked ${files.length} files across ${targetDirs.length} surfaces + ${requiredSurfaceMarkers.length} workbench structure contracts`,
);
