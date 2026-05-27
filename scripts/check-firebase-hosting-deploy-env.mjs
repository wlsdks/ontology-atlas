#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const REQUIRED_ENV = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_HOSTING_URL",
];

function printHelp() {
  console.log(`Usage: pnpm firebase:deploy-check

Checks local Firebase Hosting deploy prerequisites without deploying:
- .env.prod exists and contains the required deploy identifiers
- .firebaserc matches FIREBASE_PROJECT_ID
- firebase.json remains static Hosting-only and serves out/
- .env.prod is ignored by both git and Firebase deploy packaging

This command never calls firebase deploy.
`);
}

function fail(message) {
  console.error(`[firebase-deploy-check] ${message}`);
  process.exit(1);
}

function readText(file) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf8");
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    fail(`${file} must be valid JSON: ${error.message}`);
  }
}

function parseEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      fail(`.env.prod contains an unsupported line: ${rawLine}`);
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function assertIgnored(file, text, target) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.includes(target) && !lines.includes("**/.*")) {
    fail(`${file} must ignore ${target} before production deploy.`);
  }
}

function assertUrl(name, value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) {
      fail(`${name} must use http or https.`);
    }
  } catch {
    fail(`${name} must be a valid URL, got ${value || "(empty)"}.`);
  }
}

function main() {
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--") continue;
    fail(`unknown argument: ${arg}`);
  }

  const envPath = path.join(process.cwd(), ".env.prod");
  if (!fs.existsSync(envPath)) {
    fail(".env.prod is missing. Copy .env.prod.example to .env.prod and confirm the Firebase project id before deploying.");
  }

  const env = parseEnv(fs.readFileSync(envPath, "utf8"));
  const missing = REQUIRED_ENV.filter((key) => !env.get(key));
  if (missing.length > 0) {
    fail(`.env.prod is missing required values: ${missing.join(", ")}`);
  }
  assertUrl("FIREBASE_HOSTING_URL", env.get("FIREBASE_HOSTING_URL"));
  if (env.get("FIREBASE_HOSTING_ALT_URL")) {
    assertUrl("FIREBASE_HOSTING_ALT_URL", env.get("FIREBASE_HOSTING_ALT_URL"));
  }

  const firebaserc = readJson(".firebaserc");
  const firebaseConfig = readJson("firebase.json");
  const firebaseProjectId = env.get("FIREBASE_PROJECT_ID");
  if (firebaserc.projects?.default !== firebaseProjectId) {
    fail(
      `.firebaserc default project (${firebaserc.projects?.default ?? "missing"}) does not match FIREBASE_PROJECT_ID (${firebaseProjectId}).`,
    );
  }

  const forbiddenTopLevel = ["functions", "firestore", "storage", "database", "emulators", "extensions"];
  const forbiddenPresent = forbiddenTopLevel.filter((key) => Object.hasOwn(firebaseConfig, key));
  if (forbiddenPresent.length > 0) {
    fail(`firebase.json must stay Hosting-only; found top-level ${forbiddenPresent.join(", ")}.`);
  }
  if (Array.isArray(firebaseConfig.hosting)) {
    fail("firebase.json must keep a single Hosting target, not a hosting array.");
  }
  if (firebaseConfig.hosting?.public !== "out") {
    fail("firebase.json hosting.public must be out.");
  }
  for (const key of ["rewrites", "source", "frameworksBackend"]) {
    if (Object.hasOwn(firebaseConfig.hosting ?? {}, key)) {
      fail(`firebase.json hosting must not configure ${key}; this deploy is static-only.`);
    }
  }

  assertIgnored(".gitignore", readText(".gitignore"), ".env.prod");
  assertIgnored(".firebaseignore", readText(".firebaseignore"), ".env.prod");

  console.log(`[firebase-deploy-check] ready for static Hosting deploy: ${firebaseProjectId}`);
  console.log(`hosting: ${env.get("FIREBASE_HOSTING_URL")}`);
}

main();
