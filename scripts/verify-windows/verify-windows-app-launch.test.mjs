import assert from "node:assert/strict";
import test from "node:test";

import { launchProblems, verifyWindowsAppLaunch } from "./verify-windows-app-launch.mjs";

const ROUTE = "/en/topology/";
const payloadLine = (overrides = {}) => {
  const payload = {
    href: `http://tauri.localhost${ROUTE}`,
    readyState: "complete",
    title: "Map · Ontology Atlas",
    bodyText: "Map Concept map INDEX",
    markers: {},
    ...overrides,
  };
  // The app prints the callback's result, which is the JSON text of the string it returned.
  return `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}`;
};
const GRANT = "[ontology-atlas-verify-vault] root=C:\\fixture granted=true";
const ARRIVED = `[ontology-atlas-verify-route] route=${ROUTE} arrived=true attempts=3`;
const output = (...lines) => `${lines.join("\r\n")}\r\n`;

test("a launch that granted the vault, reached the route and drew its words has no problem", () => {
  assert.deepEqual(launchProblems(output(GRANT, ARRIVED, payloadLine()), { route: ROUTE }), []);
});

test("each missing proof is named, so a red run says which one the app did not give", () => {
  const complete = [GRANT, ARRIVED, payloadLine()];
  const cases = [
    [[ARRIVED, payloadLine()], /never reported granting the fixture vault/],
    [[GRANT, payloadLine()], /never reported arriving at \/en\/topology\//],
    [[GRANT, "[ontology-atlas-verify-route] route=/en/topology/ arrived=false attempts=20", payloadLine()], /never reported arriving/],
    [[GRANT, ARRIVED], /printed no WebView document report/],
    [[GRANT, ARRIVED, payloadLine({ href: "http://tauri.localhost/en/docs/" })], /was at \/en\/docs\/, expected \/en\/topology\//],
    [[GRANT, ARRIVED, payloadLine({ href: "https://example.com/en/topology/" })], /not the app's own origin/],
    [[GRANT, ARRIVED, payloadLine({ readyState: "loading" })], /not complete/],
    [[GRANT, ARRIVED, payloadLine({ title: "404" })], /not the app's/],
    [[GRANT, ARRIVED, payloadLine({ bodyText: "   " })], /body was empty/],
    [[GRANT, ARRIVED, payloadLine({ bodyText: "Loading" })], /did not hold the words/],
    [[GRANT, ARRIVED, payloadLine({ markers: { verificationFixtureVaultError: "denied" } })], /fixture vault bootstrap failed: denied/],
  ];
  assert.deepEqual(launchProblems(output(...complete), { route: ROUTE }), []);
  for (const [lines, expected] of cases) {
    assert.match(launchProblems(output(...lines), { route: ROUTE }).join("\n"), expected, lines.join(" | "));
  }
});

const app = (lines, afterMs = 0) => ({
  app: process.execPath,
  args: ["-e", `for (const l of ${JSON.stringify(lines)}) process.stdout.write(l + "\\r\\n"); setTimeout(() => {}, 60000 + ${afterMs})`],
  vault: "C:\\fixture",
  route: ROUTE,
});

test("a process that prints the proof over its pipes passes and is ended afterwards", async () => {
  const result = await verifyWindowsAppLaunch({ ...app([GRANT, ARRIVED, payloadLine()]), timeoutMs: 15_000 });
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
});

test("a process that prints nothing fails with the pipes named, and one that exits early says so", async () => {
  const silent = await verifyWindowsAppLaunch({ ...app([]), timeoutMs: 600 });
  assert.equal(silent.ok, false);
  assert.match(silent.problems.join("\n"), /printed nothing over its pipes/);

  const gone = await verifyWindowsAppLaunch({ app: process.execPath, args: ["-e", "process.exit(3)"], vault: "C:\\fixture", route: ROUTE, timeoutMs: 15_000 });
  assert.equal(gone.ok, false);
  assert.match(gone.problems[0], /exited early \(code 3/);
});
