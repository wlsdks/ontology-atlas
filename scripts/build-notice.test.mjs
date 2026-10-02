/**
 * The generated inventories are checked against the live trees by `pnpm notice:check`; these
 * tests hold the rendering to determinism and the prose to the obligations it carries.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { INVENTORY_MARKER, LICENSES_FILE, NOTICE_FILE, buildNotice, buildOutputs, normalizeLicense } from "./build-notice.mjs";
import { normalizeLicenseText, packageLicenseText, selectLicenseFiles } from "./lib/third-party-licenses.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NOTICE = fs.readFileSync(path.join(REPO_ROOT, NOTICE_FILE), "utf8");
const LICENSES = fs.readFileSync(path.join(REPO_ROOT, LICENSES_FILE), "utf8");
const TAURI_CONF = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
);
const PACKAGE_JSON = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));

function pkg(name, license, overrides = {}) {
  return { ecosystem: "npm", scope: "web", name, version: "1.0.0", license, authors: [], dir: "/", platformSpecific: false, ...overrides };
}

const readText = (entry) => ({ label: entry.license, body: `text of ${entry.license}` });

describe("normalizeLicense", () => {
  it("collapses the spellings Cargo uses for one dual license", () => {
    const canonical = normalizeLicense("MIT OR Apache-2.0");
    assert.equal(normalizeLicense("Apache-2.0 OR MIT"), canonical);
    assert.equal(normalizeLicense("MIT/Apache-2.0"), canonical);
  });

  it("reports a missing license rather than emitting an empty heading", () => {
    assert.equal(normalizeLicense(undefined), "UNKNOWN");
  });
});

describe("buildOutputs", () => {
  const trees = {
    web: [pkg("zod", "MIT"), pkg("sharp", "Apache-2.0")],
    mcp: [pkg("zod", "MIT", { scope: "mcp" })],
    rust: [pkg("selectors", "MPL-2.0", { ecosystem: "cargo" }), pkg("serde", "MIT OR Apache-2.0", { ecosystem: "cargo" })],
    adapted: [],
    readText,
  };

  it("is deterministic for the same dependency set in any input order", () => {
    const forward = buildOutputs(trees);
    const reversed = buildOutputs({ ...trees, web: [...trees.web].reverse(), rust: [...trees.rust].reverse() });
    assert.deepEqual(forward, reversed);
  });

  it("renders the same files whatever platform-specific build tools the machine installed", () => {
    const darwin = pkg("@next/swc-darwin-arm64", "MIT", { platformSpecific: true });
    const linux = pkg("@img/sharp-libvips-linux-x64", "LGPL-3.0-or-later", { platformSpecific: true });
    assert.deepEqual(buildOutputs({ ...trees, web: [...trees.web, darwin] }), buildOutputs({ ...trees, web: [...trees.web, linux] }));
  });

  it("counts packages by name, once however many versions are installed", () => {
    const output = buildNotice({
      rustCrates: [pkg("windows-sys", "MIT", { version: "0.52.0" }), pkg("windows-sys", "MIT", { version: "0.61.0" })],
      npmPackages: [pkg("zod", "MIT"), pkg("sharp", "Apache-2.0")],
      mcpPackages: [pkg("zod", "MIT")],
      adapted: [],
    });
    assert.match(output, /## Rust crates \(1\)/);
    assert.match(output, /## npm packages \(2\)/);
    assert.match(output, /## MCP sidecar npm packages \(1\)/);
  });

  it("lists adapted code with its source, license and holder", () => {
    const adapted = [{ path: "src/a.ts", url: "https://example.com/a", license: "MIT", holder: "Example Holder" }];
    const outputs = buildOutputs({ ...trees, adapted });
    for (const text of Object.values(outputs)) {
      assert.ok(text.includes("https://example.com/a") && text.includes("Example Holder") && text.includes("src/a.ts"));
    }
  });
});

describe("license texts", () => {
  it("keeps the file of the elected license and every file named for no license", () => {
    const names = ["COPYRIGHT", "LICENSE-APACHE", "LICENSE-MIT", "NOTICE"];
    assert.deepEqual(selectLicenseFiles(names, ["MIT"]), ["COPYRIGHT", "LICENSE-MIT", "NOTICE"]);
    assert.deepEqual(selectLicenseFiles(names, ["Apache-2.0 WITH LLVM-exception"]), ["COPYRIGHT", "LICENSE-APACHE", "NOTICE"]);
  });

  it("keeps every file when none is named for the elected license", () => {
    assert.deepEqual(selectLicenseFiles(["LICENSE", "LICENSE-THIRD-PARTY"], ["MIT"]), ["LICENSE", "LICENSE-THIRD-PARTY"]);
  });

  it("strips the byte-order mark, carriage returns and trailing blanks a host may add", () => {
    assert.equal(normalizeLicenseText("\uFEFFMIT License  \r\n\r\nCopyright\f (c)\r\n\r\n"), "MIT License\n\nCopyright (c)");
  });

  it("passes on the NOTICE file an Apache-2.0 package publishes, after its license", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-notice-"));
    try {
      fs.writeFileSync(path.join(dir, "LICENSE"), "Apache License text");
      fs.writeFileSync(path.join(dir, "NOTICE"), "Example NOTICE text");
      const { label, body } = packageLicenseText(pkg("example", "Apache-2.0", { dir }));
      assert.equal(label, "Apache-2.0");
      assert.ok(body.indexOf("Apache License text") < body.indexOf("Example NOTICE text"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
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

  it("reproduces the OFL text the Pretendard package omits, in both shipped files", () => {
    for (const text of [NOTICE, LICENSES]) {
      assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1/);
      assert.match(text, /Reserved Font Name/);
    }
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
  it("ships NOTICE.md, LICENSE and the license texts inside the installed app", () => {
    const resources = TAURI_CONF.bundle.resources ?? [];
    for (const file of ["../LICENSE", "../NOTICE.md", `../${LICENSES_FILE}`]) {
      assert.ok(resources.includes(file), `${file} is not bundled into the app`);
    }
  });

  it("blocks a release whose notice is stale or whose dependencies break the license policy", () => {
    assert.match(PACKAGE_JSON.scripts["desktop:release-preflight"], /pnpm notice:check && pnpm licenses:check/);
  });

  it("exposes the regeneration command the check script names", () => {
    assert.equal(PACKAGE_JSON.scripts["notice:build"], "node scripts/build-notice.mjs");
    assert.match(NOTICE, /pnpm notice:build/);
  });
});
