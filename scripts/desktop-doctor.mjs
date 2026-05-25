#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { platform } from "node:os";
import { pathToFileURL } from "node:url";

export function evaluateDesktopDoctor({
  run = runCommand,
  osPlatform = platform(),
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

  const requiredFailures = checks.filter(
    (check) => check.required && check.status === "missing",
  );

  return {
    status: requiredFailures.length === 0 ? "ready" : "blocked",
    platform: osPlatform,
    checks,
    nextAction:
      requiredFailures[0]?.installHint ??
      "Run pnpm desktop:build, then smoke /docs, /ontology, /topology, and /ontology/edit.",
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
