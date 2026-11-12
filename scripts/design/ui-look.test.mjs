import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { readVaultFiles, routeLocale } from "./look/open-vault.mjs";
import { parseLookArgs, resolveVaultSource, shotName } from "./ui-look.mjs";

const SCRATCH = mkdtempSync(path.join(tmpdir(), "ui-look-test-"));
after(() => rmSync(SCRATCH, { recursive: true, force: true }));
const scratchDir = () => mkdtempSync(path.join(SCRATCH, "case-"));

test("parseLookArgs defaults to the fixture vault at one 1440 width", () => {
  const opts = parseLookArgs(["--", "--route=/ko/topology/"]);
  assert.deepEqual(opts, { routes: ["/ko/topology/"], vault: "fixture", widths: [1440], height: 900, audit: false });
});

test("parseLookArgs repeats routes and reads every flag", () => {
  const opts = parseLookArgs([
    "--route=/ko/topology/",
    "--route=/ko/docs/",
    "--vault=sample",
    "--widths=768,1920",
    "--height=1200",
    "--url=http://127.0.0.1:4555/",
    "--out=shots",
    "--audit",
  ]);
  assert.deepEqual(opts, {
    routes: ["/ko/topology/", "/ko/docs/"],
    vault: "sample",
    widths: [768, 1920],
    height: 1200,
    url: "http://127.0.0.1:4555",
    out: "shots",
    audit: true,
  });
});

test("parseLookArgs rejects a missing route, an unknown flag and a non-positive width", () => {
  assert.throws(() => parseLookArgs(["--vault=fixture"]), /usage/);
  assert.throws(() => parseLookArgs(["--route=/ko/", "--json"]), /unknown argument: --json/);
  assert.throws(() => parseLookArgs(["--route=/ko/", "--widths=0"]), /--widths/);
  assert.throws(() => parseLookArgs(["--route=/ko/", "--widths="]), /--widths/);
});

test("resolveVaultSource maps fixture, sample and a directory relative to the caller", () => {
  assert.deepEqual(resolveVaultSource("fixture"), { kind: "fixture" });
  const sample = resolveVaultSource("sample");
  assert.equal(sample.kind, "dir");
  assert.ok(Object.keys(readVaultFiles(sample.dir)).length > 0, "the sample vault seeds at least one file");
  const parent = scratchDir();
  mkdirSync(path.join(parent, "vault"));
  assert.deepEqual(resolveVaultSource("vault", { cwd: parent }), { kind: "dir", dir: path.join(parent, "vault") });
});

test("resolveVaultSource refuses synthetic vaults and paths that are not directories", () => {
  assert.throws(() => resolveVaultSource("synthetic:500"), /not yet supported/);
  const parent = scratchDir();
  writeFileSync(path.join(parent, "note.md"), "# note\n");
  assert.throws(() => resolveVaultSource("note.md", { cwd: parent }), /not a directory/);
  assert.throws(() => resolveVaultSource("missing", { cwd: parent }), /not a directory/);
});

test("readVaultFiles keys Markdown by vault path and skips dot entries and other files", () => {
  const dir = scratchDir();
  mkdirSync(path.join(dir, "capabilities"));
  mkdirSync(path.join(dir, ".git"));
  writeFileSync(path.join(dir, "project.md"), "a");
  writeFileSync(path.join(dir, "capabilities/pay.md"), "b");
  writeFileSync(path.join(dir, ".git/HEAD.md"), "c");
  writeFileSync(path.join(dir, ".hidden.md"), "d");
  writeFileSync(path.join(dir, "image.png"), "e");
  assert.deepEqual(readVaultFiles(dir), { "project.md": "a", "capabilities/pay.md": "b" });
});

test("routeLocale takes a known locale prefix and falls back to en", () => {
  assert.equal(routeLocale("/ko/topology/"), "ko");
  assert.equal(routeLocale("/this-route-does-not-exist/"), "en");
});

test("shotName matches one file per route and width", () => {
  assert.equal(shotName("/ko/topology/", 1440), "ko_topology@1440.png");
  assert.equal(shotName("/", 600), "root@600.png");
});
