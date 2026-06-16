import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = resolve("scripts/check-ci-workflow.mjs");
const ciCheck =
  "pnpm ci:workflow-check && node --test scripts/check-ci-workflow.test.mjs && " +
  "pnpm docs-vault:check && pnpm desktop:check && pnpm test:desktop:check && " +
  "pnpm exec tsc --noEmit && pnpm lint && pnpm test:run && pnpm test:contracts && " +
  "pnpm design:ontology && pnpm build && pnpm bundle:check";

const workflow = [
  "name: Local-first CI",
  "",
  "on:",
  "  push:",
  "    branches: [main]",
  "  pull_request:",
  "    branches: [main]",
  "",
  "env:",
  "  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true",
  "",
  "jobs:",
  "  verify:",
  "    runs-on: macos-14",
  "    steps:",
  "      - name: Checkout",
  "        uses: actions/checkout@v6",
  "      - name: Setup Node.js",
  "        uses: actions/setup-node@v6",
  "        with:",
  "          node-version: 24",
  "      - name: Enable Corepack pnpm",
  "        run: corepack prepare pnpm@10.18.0 --activate",
  "      - name: Install dependencies",
  "        run: pnpm install --frozen-lockfile",
  "      - name: Check CI workflow contract",
  "        run: node scripts/check-ci-workflow.mjs",
  "      - name: Local-first quality gates",
  "        run: pnpm ci:check",
  "",
].join("\n");

function withProject(overrides, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-ci-workflow-"));
  try {
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    if (overrides.workflow !== null) {
      writeFileSync(join(root, ".github/workflows/ci.yml"), overrides.workflow ?? workflow);
    }
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ scripts: { "ci:check": overrides.ciCheck ?? ciCheck } }, null, 2),
    );
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runCheck(root) {
  return spawnSync(process.execPath, [script, `--root=${root}`], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

test("CI workflow check accepts this repository's main and pull_request workflow", () => {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /main\/pull_request CI workflow ready/);
  assert.match(result.stdout, /pnpm test:desktop:check/);
});

test("CI workflow check accepts main and pull_request local-first gates", () => {
  withProject({}, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /main\/pull_request CI workflow ready/);
    assert.match(result.stdout, /pnpm desktop:check/);
    assert.match(result.stdout, /pnpm bundle:check/);
  });
});

test("CI workflow check fails when the workflow is missing", () => {
  withProject({ workflow: null }, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /main CI workflow is missing/);
  });
});

test("CI workflow check fails when the workflow does not run the package gate", () => {
  withProject({ workflow: workflow.replace("pnpm ci:check", "pnpm test:run") }, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /CI workflow must include pnpm ci:check/);
  });
});

test("CI workflow check fails when the workflow omits its self-check step", () => {
  withProject(
    {
      workflow: workflow.replace(
        [
          "      - name: Check CI workflow contract",
          "        run: node scripts/check-ci-workflow.mjs",
          "",
        ].join("\n"),
        "",
      ),
    },
    (root) => {
      const result = runCheck(root);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /must run node scripts\/check-ci-workflow\.mjs before pnpm ci:check/);
    },
  );
});

test("CI workflow check fails when ci:check omits desktop checker contracts", () => {
  withProject({ ciCheck: ciCheck.replace(" && pnpm test:desktop:check", "") }, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /ci:check script must include pnpm test:desktop:check/);
  });
});

test("CI workflow check fails when ci:check omits the workflow checker test", () => {
  withProject({ ciCheck: ciCheck.replace(" && node --test scripts/check-ci-workflow.test.mjs", "") }, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /ci:check script must include node --test scripts\/check-ci-workflow\.test\.mjs/);
  });
});

test("CI workflow check fails when bundle guard runs before build", () => {
  withProject({ ciCheck: ciCheck.replace("pnpm build && pnpm bundle:check", "pnpm bundle:check && pnpm build") }, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must run pnpm bundle:check after pnpm build/);
  });
});
