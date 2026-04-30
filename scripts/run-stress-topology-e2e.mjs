#!/usr/bin/env node

import { spawn } from "node:child_process";

const args = [
  "exec",
  "playwright",
  "test",
  "tests/e2e/stress-topology.spec.ts",
];

const child = spawn("pnpm", args, {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
  },
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
