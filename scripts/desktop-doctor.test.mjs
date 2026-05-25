import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDesktopDoctor } from "./desktop-doctor.mjs";

test("desktop doctor reports ready when required desktop tools are present", () => {
  const report = evaluateDesktopDoctor({
    osPlatform: "darwin",
    run: ([command]) => ({
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
    }),
  });

  assert.equal(report.status, "ready");
  assert.equal(report.checks.filter((check) => check.status === "ok").length, 4);
  assert.match(report.nextAction, /pnpm desktop:build/);
});

test("desktop doctor reports missing Cargo as a build blocker", () => {
  const report = evaluateDesktopDoctor({
    osPlatform: "darwin",
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
    run: () => ({ status: 0, stdout: "ok", stderr: "" }),
  });

  assert.equal(report.status, "ready");
  assert.equal(
    report.checks.find((check) => check.id === "xcode-select")?.status,
    "skipped",
  );
});
