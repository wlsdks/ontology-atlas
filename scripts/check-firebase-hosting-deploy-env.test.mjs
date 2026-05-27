import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("scripts/check-firebase-hosting-deploy-env.mjs");

function writeBaseProject(root, overrides = {}) {
  writeFileSync(
    join(root, ".env.prod"),
    overrides.env ??
      [
        "FIREBASE_PROJECT_ID=oh-my-ontology",
        "FIREBASE_HOSTING_URL=https://oh-my-ontology.web.app",
        "FIREBASE_HOSTING_ALT_URL=https://oh-my-ontology.firebaseapp.com",
        "",
      ].join("\n"),
  );
  writeFileSync(
    join(root, ".firebaserc"),
    JSON.stringify(overrides.firebaserc ?? { projects: { default: "oh-my-ontology" } }),
  );
  writeFileSync(
    join(root, "firebase.json"),
    JSON.stringify(
      overrides.firebaseJson ?? {
        hosting: {
          public: "out",
          cleanUrls: true,
          trailingSlash: true,
          ignore: ["firebase.json", "**/.*", "**/node_modules/**"],
          headers: [],
        },
      },
    ),
  );
  writeFileSync(join(root, ".gitignore"), overrides.gitignore ?? ".env.prod\n");
  writeFileSync(join(root, ".firebaseignore"), overrides.firebaseignore ?? ".env.prod\n");
}

function runCheck(root) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
  });
}

function withProject(overrides, run) {
  const root = mkdtempSync(join(tmpdir(), "omo-firebase-deploy-"));
  try {
    writeBaseProject(root, overrides);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("firebase deploy check accepts static hosting deploy identifiers", () => {
  withProject({}, (root) => {
    const result = runCheck(root);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /ready for static Hosting deploy: oh-my-ontology/);
    assert.match(result.stdout, /https:\/\/oh-my-ontology\.web\.app/);
  });
});

test("firebase deploy check fails when .env.prod is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "omo-firebase-deploy-"));
  try {
    writeBaseProject(root);
    rmSync(join(root, ".env.prod"));

    const result = runCheck(root);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.env\.prod is missing/);
    assert.match(result.stderr, /\.env\.prod\.example/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("firebase deploy check rejects a project mismatch", () => {
  withProject(
    {
      firebaserc: { projects: { default: "wrong-project" } },
    },
    (root) => {
      const result = runCheck(root);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /does not match FIREBASE_PROJECT_ID/);
    },
  );
});

test("firebase deploy check rejects backend Firebase config", () => {
  withProject(
    {
      firebaseJson: {
        hosting: { public: "out" },
        functions: { source: "functions" },
      },
    },
    (root) => {
      const result = runCheck(root);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /Hosting-only/);
      assert.match(result.stderr, /functions/);
    },
  );
});

test("firebase deploy check requires .env.prod to be ignored by Firebase deploy", () => {
  withProject(
    {
      firebaseignore: "node_modules/\n",
    },
    (root) => {
      const result = runCheck(root);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /\.firebaseignore must ignore \.env\.prod/);
    },
  );
});
