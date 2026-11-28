import assert from "node:assert/strict";
import test from "node:test";

import { launchProblems, successLine, verifyWindowsAppLaunch } from "./verify-windows-app-launch.mjs";

const ROUTE = "/en/topology/";
const VAULT = "C:\\fixture";
const payloadLine = ({ markers, ...overrides } = {}) => {
  const payload = {
    href: `http://tauri.localhost${ROUTE}`,
    readyState: "complete",
    title: "Map · Ontology Atlas",
    bodyText: "Map Concept map INDEX",
    width: 1280,
    height: 800,
    markers: {
      verificationFixtureVault: VAULT,
      mapNav: true,
      libraryNav: true,
      topologyMapEngine: "v2",
      ontologyMapCanvasInkPixels: 4200,
      topologyStagePanClickCancelPx: 7,
      ...markers,
    },
    ...overrides,
  };
  // The app prints the callback's result, which is the JSON text of the string it returned.
  return `[ontology-atlas-webview-verify] ${JSON.stringify(JSON.stringify(payload))}`;
};
const GRANT = `[ontology-atlas-verify-vault] root=${VAULT} granted=true`;
const STATE = "[ontology-atlas-window-verify] state_plugin=disabled";
const ARRIVED = `[ontology-atlas-verify-route] route=${ROUTE} arrived=true attempts=3`;
const output = (...lines) => `${lines.join("\r\n")}\r\n`;
const problemsOf = (...lines) => launchProblems(output(...lines), { route: ROUTE, vault: VAULT });

test("a launch that granted the vault, reached the route and drew its map has no problem", () => {
  assert.deepEqual(problemsOf(GRANT, STATE, ARRIVED, payloadLine()), []);
});

test("each missing proof is named, so a red run says which one the app did not give", () => {
  const cases = [
    [[STATE, ARRIVED, payloadLine()], /never reported granting the fixture vault/],
    [[GRANT, STATE, payloadLine()], /never reported arriving at \/en\/topology\//],
    [[GRANT, STATE, "[ontology-atlas-verify-route] route=/en/topology/ arrived=false attempts=20", payloadLine()], /never reported arriving/],
    [[GRANT, STATE, ARRIVED], /printed no WebView document report/],
    [[GRANT, ARRIVED, payloadLine()], /window-state plugin marker/],
    [[GRANT, STATE, ARRIVED, payloadLine({ href: "http://tauri.localhost/en/docs/" })], /reported route \/en\/docs\/, expected \/en\/topology\//],
    [[GRANT, STATE, ARRIVED, payloadLine({ href: "https://example.com/en/topology/" })], /the app's own address/],
    [[GRANT, STATE, ARRIVED, payloadLine({ readyState: "loading" })], /not complete/],
    [[GRANT, STATE, ARRIVED, payloadLine({ title: "404" })], /Ontology Atlas route title/],
    [[GRANT, STATE, ARRIVED, payloadLine({ bodyText: "   " })], /body text was empty/],
    [[GRANT, STATE, ARRIVED, payloadLine({ bodyText: "Loading" })], /workbench markers/],
    [[GRANT, STATE, ARRIVED, payloadLine({ markers: { verificationFixtureVaultError: "denied" } })], /fixture vault bootstrap failed: denied/],
    [[GRANT, STATE, ARRIVED, payloadLine({ markers: { verificationFixtureVault: "C:\\other" } })], /fixture vault was C:\\other/],
  ];
  for (const [lines, expected] of cases) {
    assert.match(problemsOf(...lines).join("\n"), expected, lines.join(" | "));
  }
});

test("a map that drew no pixels is not a pass, however well the rest of the document reads", () => {
  assert.match(problemsOf(GRANT, STATE, ARRIVED, payloadLine({ markers: { ontologyMapCanvasInkPixels: 0 } })).join("\n"), /rendered pixels/);
  assert.match(problemsOf(GRANT, STATE, ARRIVED, payloadLine({ markers: { ontologyMapCanvasInkPixels: undefined } })).join("\n"), /rendered pixels/);
  assert.match(problemsOf(GRANT, STATE, ARRIVED, payloadLine({ markers: { topologyMapEngine: "" } })).join("\n"), /ontology-map engine/);
});

const app = (lines, afterMs = 0) => ({
  app: process.execPath,
  args: ["-e", `for (const l of ${JSON.stringify(lines)}) process.stdout.write(l + "\\r\\n"); setTimeout(() => {}, 60000 + ${afterMs})`],
  vault: VAULT,
  route: ROUTE,
});

test("a process that prints the proof over its pipes passes and is ended afterwards", async () => {
  const result = await verifyWindowsAppLaunch({ ...app([GRANT, STATE, ARRIVED, payloadLine()]), timeoutMs: 15_000 });
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
  assert.equal(successLine(ROUTE), "[verify-windows] /en/topology/ rendered in the installed app");
});

test("a process that prints nothing fails with the pipes named, and one that exits early says so", async () => {
  const silent = await verifyWindowsAppLaunch({ ...app([]), timeoutMs: 600 });
  assert.equal(silent.ok, false);
  assert.match(silent.problems.join("\n"), /printed nothing over its pipes/);

  const gone = await verifyWindowsAppLaunch({ app: process.execPath, args: ["-e", "process.exit(3)"], vault: VAULT, route: ROUTE, timeoutMs: 15_000 });
  assert.equal(gone.ok, false);
  assert.match(gone.problems[0], /exited early \(code 3/);
});
