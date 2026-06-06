import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { evaluateDesktopDoctor } from "./desktop-doctor.mjs";

function makeDoctorRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-desktop-doctor-"));
  fs.mkdirSync(path.join(root, "docs", "ontology"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "ontology", "README.md"), "# Vault\n");
  fs.writeFileSync(path.join(root, "docs", "DESKTOP-MACOS.md"), "# Desktop\n");
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "cli:mcp-verify": "node cli/src/index.mjs mcp-verify docs/ontology --timeout-ms 15000",
        "dogfood:agent-setup-gate": "node cli/src/index.mjs agent-brief docs/ontology --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4",
      },
    }),
  );
  return root;
}

test("desktop doctor reports ready when required desktop tools are present", () => {
  const root = makeDoctorRoot();
  fs.mkdirSync(
    path.join(
      root,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      "Ontology Atlas.app",
    ),
    { recursive: true },
  );
  const report = evaluateDesktopDoctor({
    osPlatform: "darwin",
    root,
    run: ([command]) => {
      if (command === "codesign") {
        return {
          status: 0,
          stdout: "",
          stderr: "Authority=Developer ID Application: Example Corp\nTeamIdentifier=ABCDE12345\n",
        };
      }
      return {
        status: 0,
        stdout:
          command === "pnpm"
            ? "tauri-cli 2.11.2"
            : command === "cargo"
              ? "cargo 1.90.0"
              : command === "rustc"
                ? "rustc 1.90.0"
                : "/Applications/Xcode.app/Contents/Developer",
        stderr: "",
      };
    },
  });

  assert.equal(report.status, "ready");
  assert.equal(report.checks.filter((check) => check.status === "ok").length, 9);
  assert.equal(
    report.checks.find((check) => check.id === "local-app-signing")?.status,
    "ok",
  );
  assert.match(
    report.checks.find((check) => check.id === "local-app-signing")?.output ?? "",
    /Developer ID Application/,
  );
  assert.equal(
    report.checks.find((check) => check.id === "dogfood-vault")?.status,
    "ok",
  );
  assert.equal(
    report.checks.find((check) => check.id === "cli-mcp-verify")?.output,
    "pnpm cli:mcp-verify docs/ontology --timeout-ms 15000",
  );
  assert.equal(
    report.checks.find((check) => check.id === "agent-setup-gate")?.output,
    "pnpm dogfood:agent-setup-gate",
  );
  assert.match(report.nextAction, /pnpm desktop:build/);
  assert.match(report.nextAction, /pnpm cli:mcp-verify docs\/ontology/);
  assert.match(report.nextAction, /pnpm dogfood:agent-setup-gate/);
});

test("desktop doctor warns when the local app bundle is ad-hoc signed", () => {
  const root = makeDoctorRoot();
  fs.mkdirSync(
    path.join(
      root,
      "src-tauri",
      "target",
      "release",
      "bundle",
      "macos",
      "Ontology Atlas.app",
    ),
    { recursive: true },
  );
  const report = evaluateDesktopDoctor({
    osPlatform: "darwin",
    root,
    run: ([command]) => {
      if (command === "codesign") {
        return {
          status: 0,
          stdout: "",
          stderr: "Signature=adhoc\nTeamIdentifier=not set\n",
        };
      }
      return { status: 0, stdout: `${command} ok`, stderr: "" };
    },
  });

  assert.equal(report.status, "ready");
  assert.equal(
    report.checks.find((check) => check.id === "local-app-signing")?.status,
    "warning",
  );
  assert.match(
    report.checks.find((check) => check.id === "local-app-signing")?.output ?? "",
    /ad-hoc local build/,
  );
  assert.match(
    report.checks.find((check) => check.id === "local-app-signing")?.installHint ?? "",
    /pnpm desktop:sign/,
  );
});

test("desktop doctor reports missing Cargo as a build blocker", () => {
  const report = evaluateDesktopDoctor({
    osPlatform: "darwin",
    root: makeDoctorRoot(),
    run: ([command]) => ({
      status: command === "cargo" ? 127 : 0,
      stdout: command === "cargo" ? "" : `${command} ok`,
      stderr: command === "cargo" ? "command not found: cargo" : "",
    }),
  });

  assert.equal(report.status, "blocked");
  assert.equal(report.checks.find((check) => check.id === "cargo")?.status, "missing");
  assert.match(report.nextAction, /Install Rust with rustup/);
});

test("desktop doctor skips Xcode command line tools outside macOS", () => {
  const report = evaluateDesktopDoctor({
    osPlatform: "linux",
    root: makeDoctorRoot(),
    run: () => ({ status: 0, stdout: "ok", stderr: "" }),
  });

  assert.equal(report.status, "ready");
  assert.equal(
    report.checks.find((check) => check.id === "xcode-select")?.status,
    "skipped",
  );
});

test("desktop doctor blocks when local ontology handoff files are missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omo-desktop-doctor-empty-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));

  const report = evaluateDesktopDoctor({
    osPlatform: "darwin",
    root,
    run: () => ({ status: 0, stdout: "ok", stderr: "" }),
  });

  assert.equal(report.status, "blocked");
  assert.equal(
    report.checks.find((check) => check.id === "dogfood-vault")?.status,
    "missing",
  );
  assert.equal(
    report.checks.find((check) => check.id === "cli-mcp-verify")?.status,
    "missing",
  );
  assert.equal(
    report.checks.find((check) => check.id === "agent-setup-gate")?.status,
    "missing",
  );
  assert.match(report.nextAction, /docs\/ontology/);
});
