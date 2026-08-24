/**
 * Guards `NOTICE.md` against the two ways an attribution file rots.
 *
 * The first is drift: someone adds a dependency and the inventory no longer matches
 * the tree. `pnpm notice:check` catches that, and it runs in the release preflight,
 * so this file does not re-verify it against the live tree — that would make the unit
 * test depend on `cargo` and a resolved `node_modules`.
 *
 * The second is quieter and is what these tests actually defend: someone edits the
 * prose and removes the part that carries the obligation. The LGPL-2.1 section 6
 * relink path is the only reason this file legally exists, and a well-meaning
 * cleanup that trims it to a tidy dependency table would leave the release
 * non-compliant while the check script still reports green. The assertions below name
 * the specific claims a reader is owed, so deleting one fails here rather than
 * surfacing after publication.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  INVENTORY_MARKER,
  buildNotice,
  isBoundaryLicense,
  normalizeLicense,
} from "./build-notice.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTICE = fs.readFileSync(path.join(REPO_ROOT, "NOTICE.md"), "utf8");
const TAURI_CONF = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
);
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

describe("normalizeLicense", () => {
  it("collapses the spellings Cargo uses for one dual license", () => {
    const canonical = normalizeLicense("MIT OR Apache-2.0");
    assert.equal(normalizeLicense("Apache-2.0 OR MIT"), canonical);
    assert.equal(normalizeLicense("MIT/Apache-2.0"), canonical);
  });

  it("leaves a single license untouched", () => {
    assert.equal(normalizeLicense("MPL-2.0"), "MPL-2.0");
  });

  it("reports a missing license rather than emitting an empty heading", () => {
    assert.equal(normalizeLicense(undefined), "UNKNOWN");
  });
});

describe("isBoundaryLicense", () => {
  it("flags the licenses that bind the component", () => {
    for (const license of ["MPL-2.0", "LGPL-2.1", "GPL-3.0", "EPL-2.0"]) {
      assert.equal(isBoundaryLicense(license), true, license);
    }
  });

  it("does not flag permissive licenses", () => {
    for (const license of ["MIT", "Apache-2.0", "ISC", "BSD-3-Clause", "OFL-1.1"]) {
      assert.equal(isBoundaryLicense(license), false, license);
    }
  });
});

describe("buildNotice", () => {
  it("is deterministic for the same dependency set in any input order", () => {
    const rustCrates = [
      { name: "selectors", license: "MPL-2.0" },
      { name: "serde", license: "MIT OR Apache-2.0" },
    ];
    const npmPackages = [{ name: "zod", license: "MIT" }];
    const forward = buildNotice({ rustCrates, npmPackages });
    const reversed = buildNotice({ rustCrates: [...rustCrates].reverse(), npmPackages });
    assert.equal(forward, reversed);
  });

  it("counts what it lists", () => {
    const output = buildNotice({
      rustCrates: [{ name: "serde", license: "MIT" }],
      npmPackages: [
        { name: "zod", license: "MIT" },
        { name: "sharp", license: "Apache-2.0" },
      ],
    });
    assert.match(output, /## Rust crates \(1\)/);
    assert.match(output, /## npm packages \(2\)/);
  });
});

describe("NOTICE.md content", () => {
  it("states that third-party licenses do not relicense Ontology Atlas", () => {
    assert.match(NOTICE, /MIT License/);
    assert.match(NOTICE, /bind the component, not\s+the program that links it/);
  });

  it("carries the LGPL-2.1 relink path, which is the obligation the file exists for", () => {
    assert.match(NOTICE, /JavaScriptCore and WebKit/);
    assert.match(NOTICE, /LGPL-2\.1 section 6/);
    assert.match(NOTICE, /github\.com\/oven-sh\/webkit/);
    assert.match(NOTICE, /pnpm mcp:build-binary/);
  });

  it("reproduces the OFL text the Pretendard package omits", () => {
    assert.match(NOTICE, /SIL OPEN FONT LICENSE Version 1\.1/);
    assert.match(NOTICE, /Reserved Font Name/);
  });

  it("names every MPL-2.0 crate rather than burying them in the inventory", () => {
    for (const crate of ["cssparser", "cssparser-macros", "dtoa-short", "option-ext", "selectors"]) {
      assert.ok(NOTICE.includes(`\`${crate}\``), `MPL-2.0 crate ${crate} is not named in the prose`);
    }
  });

  it("records which option is elected for a dependency offering LGPL", () => {
    assert.match(NOTICE, /r-efi/);
    assert.match(NOTICE, /MIT\s+option is elected/);
  });

  it("separates hand-written prose from the generated inventory", () => {
    assert.ok(NOTICE.includes(INVENTORY_MARKER));
    assert.ok(NOTICE.indexOf("LGPL-2.1 section 6") < NOTICE.indexOf(INVENTORY_MARKER));
  });
});

describe("release wiring", () => {
  it("ships NOTICE.md and LICENSE inside the installed app", () => {
    const resources = TAURI_CONF.bundle.resources ?? [];
    assert.ok(resources.includes("../NOTICE.md"), "NOTICE.md is not bundled into the app");
    assert.ok(resources.includes("../LICENSE"), "LICENSE is not bundled into the app");
  });

  it("blocks a release whose notice is stale", () => {
    assert.match(PACKAGE_JSON.scripts["desktop:release-preflight"], /pnpm notice:check/);
  });

  it("exposes the regeneration command the check script names", () => {
    assert.equal(PACKAGE_JSON.scripts["notice:build"], "node scripts/build-notice.mjs");
    assert.match(NOTICE, /pnpm notice:build/);
  });
});
