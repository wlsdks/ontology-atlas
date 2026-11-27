import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifySpec, pendingSpecs } from "./app-route-runtime-classifier";

/**
 * Every end-to-end test that reaches an app screen runs on the faked app runtime
 * (`tests/e2e/desktop-rail-arrival-harness.ts`), because the installed app is the product and the
 * browser has no workbench. A test that visits an app route without installing it, or that reaches a
 * browser-only door (`?shell=desktop`, `stubDirectoryPicker`, `useDogfoodSample`,
 * `demo:sample-source`), is still to move.
 *
 * `app-route-runtime-pending.json` names the specs that hold such a test. It only shrinks: a spec that
 * is not on it fails here, and so does an entry that is already clean or no longer exists. The list is
 * empty once every test has moved. `node tests/contract/e2e/app-route-runtime-classifier.ts` prints the
 * tests themselves.
 */

const ROOT = process.cwd();
const pending: string[] = JSON.parse(
  readFileSync(join(ROOT, "tests/contract/e2e/app-route-runtime-pending.json"), "utf8"),
).specs;

describe("every app-route test runs on the faked app runtime", () => {
  const found = pendingSpecs();

  it("lists no spec that is not already on the pending list", () => {
    expect(found.filter((spec) => !pending.includes(spec))).toEqual([]);
  });

  it("lists no entry that is already clean", () => {
    expect(pending.filter((spec) => !found.includes(spec))).toEqual([]);
  });

  it("names only specs that exist, sorted, once each", () => {
    expect(pending.filter((spec) => !existsSync(join(ROOT, spec)))).toEqual([]);
    expect(pending).toEqual([...new Set(pending)].sort());
  });
});

/**
 * The classifier judges each test by what that test reaches: its own body, the `beforeEach` hooks around
 * it, and the functions they name. Planted specs (`planted-specs/`, kept as `.txt` so no runner collects
 * them) hold it to that; each of the first five once passed the check although a test still opened an app
 * address in a plain browser.
 */
describe("the classifier judges each test by what it reaches", () => {
  const planted = (name: string) => classifySpec(`tests/contract/e2e/planted-specs/${name}.spec.ts.txt`).tests;

  it("lists the test that installs nothing beside a test that does", () => {
    const [installs, plain] = planted("installs-for-one-test-only");
    expect(installs.pending).toBeNull();
    expect(plain.pending).toBe("no faked runtime");
  });

  it("does not take a mention of the bridge for an installation", () => {
    const [asserts, removes] = planted("names-the-bridge-without-installing");
    expect(asserts.installsRuntime).toBe(false);
    expect(asserts.pending).toBe("no faked runtime");
    expect(removes.installsRuntime).toBe(false);
    expect(removes.pending).toBe("no faked runtime");
  });

  it("does not take an imported installer for a called one", () => {
    const [test] = planted("imports-an-installer-without-calling-it");
    expect(test.installsRuntime).toBe(false);
    expect(test.pending).toBe("no faked runtime");
  });

  it("lists a test that reaches a browser door through a helper, even beside an installer", () => {
    const [test] = planted("reaches-a-browser-door-through-a-helper");
    expect(test.installsRuntime).toBe(true);
    expect(test.doors).toEqual(["stubDirectoryPicker"]);
    expect(test.pending).toBe("browser door");
  });

  it("sees a visit whose locale is an expression", () => {
    const [test] = planted("visits-through-a-locale-template");
    expect(test.visitedRoute).toContain("library");
    expect(test.pending).toBe("no faked runtime");
  });

  it("lists a spec that imports a module with the bridge but only for its fixture data", () => {
    const [test] = planted("reads-fixture-data-only");
    expect(test.visitedRoute).toBe("/en/library");
    expect(test.installsRuntime).toBe(false);
    expect(test.pending).toBe("no faked runtime");
  });

  it("passes a test that calls the installer", () => {
    expect(planted("installs-the-runtime")[0].pending).toBeNull();
  });

  it("passes a test that installs through a wrapper of the installer", () => {
    expect(planted("installs-through-a-wrapper")[0].pending).toBeNull();
  });
});
