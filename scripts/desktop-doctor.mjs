#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { pathToFileURL } from "node:url";

export function evaluateDesktopDoctor({
  run = runCommand,
  osPlatform = platform(),
  root = process.cwd(),
} = {}) {
  const checks = [
    {
      id: "tauri-cli",
      label: "Tauri CLI",
      command: ["pnpm", "--silent", "tauri", "--version"],
      required: true,
      installHint: "Run pnpm install so @tauri-apps/cli is available.",
    },
    {
      id: "cargo",
      label: "Cargo",
      command: ["cargo", "--version"],
      required: true,
      installHint: "Install Rust with rustup before running pnpm desktop:build.",
    },
    {
      id: "rustc",
      label: "Rust compiler",
      command: ["rustc", "--version"],
      required: true,
      installHint: "Install Rust with rustup before running pnpm desktop:build.",
    },
    {
      id: "xcode-select",
      label: "Xcode command line tools",
      command: ["xcode-select", "-p"],
      required: osPlatform === "darwin",
      skipped: osPlatform !== "darwin",
      installHint: "Run xcode-select --install on macOS before signing or bundling.",
    },
  ].map((check) => evaluateCheck(check, run));

  checks.push(...evaluateLocalOntologyChecks(root));

  const requiredFailures = checks.filter(
    (check) => check.required && check.status === "missing",
  );

  return {
    status: requiredFailures.length === 0 ? "ready" : "blocked",
    platform: osPlatform,
    checks,
    nextAction:
      requiredFailures[0]?.installHint ??
      "Run pnpm desktop:build, smoke /docs, /ontology, /topology, and /ontology/edit, then run pnpm cli:mcp-verify docs/ontology --timeout-ms 15000 and pnpm dogfood:agent-setup-gate.",
  };
}

function evaluateLocalOntologyChecks(root) {
  const packageJsonPath = path.join(root, "package.json");
  const pkg = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
    : {};

  return [
    evaluateStaticCheck({
      id: "dogfood-vault",
      label: "Dogfood ontology vault",
      ok: fs.existsSync(path.join(root, "docs", "ontology", "README.md")),
      output: "docs/ontology is available as the local source-of-truth vault",
      installHint: "Run from the ontology-atlas repo root so docs/ontology can be verified.",
    }),
    evaluateStaticCheck({
      id: "cli-mcp-verify",
      label: "CLI/MCP handoff gate",
      ok: Boolean(pkg.scripts?.["cli:mcp-verify"]),
      output: "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
      installHint: "Restore package.json script cli:mcp-verify before desktop handoff smoke.",
    }),
    evaluateStaticCheck({
      id: "agent-setup-gate",
      label: "Agent setup JSON gate",
      ok: Boolean(pkg.scripts?.["dogfood:agent-setup-gate"]),
      output: "pnpm dogfood:agent-setup-gate",
      installHint: "Restore package.json script dogfood:agent-setup-gate before desktop handoff smoke.",
    }),
    evaluateStaticCheck({
      id: "desktop-docs",
      label: "Offline desktop docs",
      ok: fs.existsSync(path.join(root, "docs", "DESKTOP-MACOS.md")),
      output: "docs/DESKTOP-MACOS.md is available for packaged offline reference",
      installHint: "Restore docs/DESKTOP-MACOS.md so desktop setup can be read offline.",
    }),
  ];
}

function evaluateStaticCheck({ id, label, ok, output, installHint }) {
  return {
    id,
    label,
    required: true,
    command: "local file check",
    status: ok ? "ok" : "missing",
    output: ok ? output : "missing",
    installHint,
  };
}

function evaluateCheck(check, run) {
  if (check.skipped) {
    return {
      ...check,
      command: check.command.join(" "),
      status: "skipped",
      output: "not required on this platform",
    };
  }

  const result = run(check.command);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  return {
    ...check,
    command: check.command.join(" "),
    status: result.status === 0 ? "ok" : "missing",
    output: output || `exit ${String(result.status ?? "unknown")}`,
  };
}

function runCommand(command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr || result.error?.message || "",
  };
}

function renderDoctor(report) {
  const lines = [
    "[desktop-doctor] macOS desktop runtime prerequisites",
    `status: ${report.status}`,
  ];

  for (const check of report.checks) {
    const marker =
      check.status === "ok" ? "✓" : check.status === "skipped" ? "·" : "✗";
    lines.push(`${marker} ${check.label}: ${firstLine(check.output)}`);
    if (check.status === "missing") {
      lines.push(`  next: ${check.installHint}`);
    }
  }

  lines.push(`next action: ${report.nextAction}`);
  return lines.join("\n");
}

function firstLine(value) {
  return value.split("\n").find(Boolean) ?? value;
}

function main() {
  const json = process.argv.includes("--json");
  const requireRuntime = process.argv.includes("--require-runtime");
  const report = evaluateDesktopDoctor();

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderDoctor(report));
  }

  if (requireRuntime && report.status !== "ready") {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
