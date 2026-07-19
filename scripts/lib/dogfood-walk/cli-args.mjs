// CLI argument + timeout parsing for the dogfood MCP walk.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import { closestDogfoodOption, stripLeadingPnpmSeparator } from "../dogfood-args.mjs";

export function dogfoodUsage() {
  return [
    "Usage:",
    "  pnpm dogfood:help",
    "  pnpm dogfood:walk -- [--help]",
    "  node scripts/dogfood-mcp-walk.mjs [--help]",
    "",
    "Runs the source-checkout MCP dogfood walk against this repo's docs/ontology vault.",
    "The walk starts the local MCP stdio server, exercises read/diagnosis/graph-query",
    "surfaces, and exits non-zero when the first-contact or dogfood gate regresses.",
    "No positional vault argument is accepted; this script intentionally dogfoods the",
    "repo's own ontology vault.",
    "",
    "Options:",
    "  -h, --help                 Print this help without starting the MCP server.",
    "",
    "Environment:",
    "  OATLAS_DOGFOOD_TIMEOUT_MS   Positive integer wait window in milliseconds.",
    "                              Example: OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk",
    "",
    "Lighter dogfood gates:",
    "  pnpm dogfood:compile       Fast compile_ontology summary over docs/ontology.",
    "  pnpm dogfood:compile-fix   compile --fix idempotence gate over docs/ontology; changed vaults need pnpm docs-vault:build; success ends with [dogfood:compile-fix] docs/ontology unchanged.",
    "  pnpm dogfood:health        Fail-closed health JSON gate over docs/ontology.",
    "  pnpm dogfood:agent         Claude Code/Codex agent_brief JSON handoff over docs/ontology.",
    "  pnpm dogfood:agent-graph-db-pack  Shell-pasteable graph DB pack over docs/ontology.",
    "  pnpm dogfood:graph-db      Executes the dogfood graph DB pack checks over docs/ontology.",
    "  pnpm dogfood:agent-setup-gate     Machine-readable agent setup gate with ok/performanceOk over docs/ontology.",
    "  pnpm dogfood:brief         First-contact workspace_brief JSON snapshot over docs/ontology.",
    "  pnpm dogfood:growth        growth_plan JSON snapshot over docs/ontology.",
    "  pnpm dogfood:maintenance   maintenance_plan JSON snapshot over docs/ontology.",
    "  pnpm dogfood:status        Human-readable health + workspace_brief + maintenance over docs/ontology; ends with [dogfood:status] health:N · workspace-brief:N · maintenance:N and focused hints before pnpm dogfood:verify on failure.",
    "  pnpm dogfood:verify        Installed-style verify gate over docs/ontology before the full walk.",
    "",
    "Focused checks:",
    "  pnpm test:dogfood:args          Shared dogfood shortcut argument helper contract.",
    "  pnpm test:dogfood:script-refs   Shared help/package-script reference + focused filter parser/wrapper summary contract.",
    "  pnpm test:dogfood:compile-fix   Narrow dogfood compile --fix idempotence runner contract.",
    "  pnpm test:dogfood:status        Narrow dogfood status shortcut runner contract.",
    "  pnpm test:dogfood:graph-db      Narrow dogfood graph DB pack runner contract.",
    "  pnpm test:mcp:registration      Narrow source-checkout .mcp.json/.mcp.json.example/.codex/config.toml registration template contract.",
    "  pnpm test:mcp:maintenance       Narrow maintenance_plan filter/cursor/resume/work-queue formatter gates.",
    "  pnpm test:mcp:dogfood           Dogfood helper, compile/index gates, tools/list inventory names + annotation coverage, row-label guidance, batch cap gates, invalid-only batch row repair + no-write metadata smoke, strict closest-value and unknown-tool repair summary, vault warning and validate_vault problem gates, first-contact health/growth/sample-shape gates, maintenance work-queue shape + formatter checks, initialize tool-inventory + safety/recovery guidance, destructive dry-run, help/argument/timeout handling, structuredContent, strict relation filters, strict add_relation type-preflight + no-write metadata, strict graph kind filters, stderr warning checks.",
    "  pnpm test:mcp:dogfood:timeout   Narrow dogfood timeout/help retry diagnostics.",
    "  pnpm dogfood:test               Full dogfood helper regression suite when focused checks are not enough.",
  ].join("\n");
}

export function shouldPrintDogfoodHelp(argv = process.argv.slice(2)) {
  return parseDogfoodArgs(argv).help;
}

export function parseDogfoodArgs(argv = process.argv.slice(2)) {
  const args = stripLeadingPnpmSeparator(Array.isArray(argv) ? argv : []);
  const help = args.includes("--help") || args.includes("-h");
  const unsupported = args.filter((arg) => arg !== "--help" && arg !== "-h");
  if (help) return { help: true, error: null };
  if (unsupported.length > 0) {
    return {
      help: false,
      error: formatUnsupportedDogfoodArgs(unsupported),
    };
  }
  return { help: false, error: null };
}

function formatUnsupportedDogfoodArgs(args) {
  const values = args.join(", ");
  const suggestion = args.length === 1 ? closestDogfoodOption(args[0], ["--help", "-h"]) : null;
  const suffix = suggestion ? `. Did you mean ${suggestion}?` : "";
  return [
    `dogfood:walk does not accept arguments: ${values}${suffix}`,
    "Run pnpm dogfood:walk -- --help for usage.",
  ].join("\n");
}

export function parseDogfoodTimeoutMs(value, fallback = 5000) {
  if (value == null || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
}

export function dogfoodTimeoutErrorMessage(value) {
  const received = value == null ? "undefined" : JSON.stringify(String(value));
  return [
    "OATLAS_DOGFOOD_TIMEOUT_MS must be a positive integer wait window in milliseconds.",
    `Received: ${received}.`,
    "Example: OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk",
  ].join("\n");
}
