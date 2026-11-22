/** How the release status runs gh, git and node, and reads the clock; tests replace each through an environment variable. */

import { spawnSync } from "node:child_process";

function ghBin() {
  return process.env.OATLAS_GH_BIN || "gh";
}

function gitBin() {
  return process.env.OATLAS_GIT_BIN || "git";
}

export function runGh(args, { parseJson = false } = {}) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    return { ok: false, message: `failed to run gh ${args.join(" ")}: ${result.error.message}` };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      message: (result.stderr || result.stdout || `gh ${args.join(" ")} failed with ${result.status}`).trim(),
    };
  }
  if (!parseJson) return { ok: true, value: result.stdout };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, message: `gh ${args.join(" ")} returned invalid JSON: ${error.message}` };
  }
}

export function runGhStatus(args) {
  const result = spawnSync(ghBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    return { status: null, stdout: "", stderr: `failed to run gh ${args.join(" ")}: ${result.error.message}` };
  }
  return result;
}

export function runGitStatus(args) {
  const result = spawnSync(gitBin(), args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.error) {
    return { status: null, stdout: "", stderr: `failed to run git ${args.join(" ")}: ${result.error.message}` };
  }
  return result;
}

export function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: result.status === 0,
    message: (result.stdout || result.stderr || "").trim(),
  };
}

export function currentDate() {
  const raw = process.env.OATLAS_RELEASE_STATUS_NOW;
  if (!raw) return new Date();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
