// Integration tests for the MCP tool handlers.
//
// Ports verify.mjs's spawn + stdio JSON-RPC pattern into the test framework:
// build a tmp vault, boot the server, call a tool, check the response, clean up.
//
// Covers what the unit helper tests (parser, vault, redirect-backlinks, …) do not:
// the input → routing → output flow of the tool handlers themselves.

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  VAULT_ISSUE_CODE_VALUES,
  expectedToolTitle,
} from "../scripts/verify.mjs";
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from "./ontology-engine.mjs";
import { GRAPH_ARRAY_KEYS, loadVaultDocs } from "./vault.mjs";
import { buildProjectSourceGraphHash } from "./project-source-graph-hash.mjs";
import { renderProjectCompetencyMarkdown } from "./project-meaning-receipt.mjs";
import { defaultBody } from "./schema.mjs";
import { proposalCoverageRefs } from "./construction-lifecycle.mjs";
import {
  formatNoTestMatchMessage,
  formatTestFilterSuffix,
  resolveTestNamePattern,
} from "../../scripts/lib/test-name-pattern.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "index.js");
const QUALIFIED_CONSTRUCTION_FIXTURE = JSON.parse(readFileSync(
  resolve(__dirname, "../../tests/fixtures/construction-qualification/qualified.json"),
  "utf8",
));
const EQUALITY_FILTER_KEYS = ["kind", "domain", "slug", "title", "created_by"];

let passed = 0;
let failed = 0;
let skipped = 0;
let matched = 0;
const TEST_FILTER = resolveTestFilter();
const TEST_NAME_PATTERN = TEST_FILTER.pattern;

function resolveTestFilter() {
  try {
    return resolveTestNamePattern();
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}

function test(name, fn) {
  if (TEST_NAME_PATTERN && !TEST_NAME_PATTERN.test(name)) {
    skipped += 1;
    return Promise.resolve();
  }
  matched += 1;
  return fn()
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message ?? err}`);
      if (err.stack) console.error(err.stack);
    });
}

console.log(
  TEST_NAME_PATTERN
    ? `integration (${formatTestFilterSuffix(TEST_FILTER)})`
    : "integration",
);

function makeVault(seed = []) {
  const root = mkdtempSync(join(tmpdir(), "ontology-atlas-int-"));
  for (const [index, { slug, content }] of seed.entries()) {
    const fullPath = join(root, `${slug}.md`);
    // Subdirectory slugs ("capabilities/foo") get their directories created too,
    // so a fixture writer can express any structure, not only top-level files.
    mkdirSync(dirname(fullPath), { recursive: true });
    const seededContent = /^---\r?\n/.test(content) && /(?:^|\r?\n)kind\s*:/m.test(content) && !/(?:^|\r?\n)uid\s*:/m.test(content)
      ? content.replace(
          /^---(\r?\n)/,
          `---$1uid: 00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}$1`,
        )
      : content;
    writeFileSync(fullPath, seededContent, "utf-8");
  }
  return root;
}

function makeGitTraceWrapper() {
  if (process.platform === "win32") return null;
  const root = mkdtempSync(join(tmpdir(), "ontology-atlas-git-trace-"));
  const tracePath = join(root, "calls.log");
  const wrapperPath = join(root, "git");
  writeFileSync(
    wrapperPath,
    [
      "#!/bin/sh",
      'printf \'%s\\n\' "$*" >> "$OATLAS_GIT_TRACE"',
      'exec "$OATLAS_REAL_GIT" "$@"',
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(wrapperPath, 0o755);
  writeFileSync(tracePath, "", "utf8");
  return { root, tracePath };
}

function gitCalls(tracePath, command) {
  return readFileSync(tracePath, "utf8")
    .split("\n")
    .filter((line) => new RegExp(`(?:^| )${command}(?: |$)`).test(line));
}

/**
 * Spawns the server on a tmp vault, sends the requests as JSON-RPC, and collects
 * every response. SIGTERM after a 1.5s timeout. Responses are the stdout lines
 * that JSON.parse accepts.
 */
function rpc(vaultRoot, requests, timeoutMs = 1500, extraEnv = {}) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn("node", [SERVER_ENTRY], {
      env: { ...process.env, OATLAS_VAULT: vaultRoot, ...extraEnv },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => (stdout += stdoutDecoder.write(b)));
    proc.stderr.on("data", (b) => (stderr += stderrDecoder.write(b)));

    const lines = requests.map((r) => JSON.stringify(r)).join("\n") + "\n";
    proc.stdin.write(lines);

    const timer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);

    proc.on("close", () => {
      clearTimeout(timer);
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      const responses = stdout
        .split("\n")
        .filter(Boolean)
        .map((s) => {
          try {
            return JSON.parse(s);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      resolveP({ responses, stderr });
    });

    proc.on("error", rejectP);
  });
}

function rpcForRepo(vaultRoot, repoRoot, requests, timeoutMs = 1500, extraEnv = {}) {
  return rpc(vaultRoot, requests, timeoutMs, {
    OATLAS_REPO_ROOT: repoRoot,
    ...extraEnv,
  });
}

/**
 * ⚠️ **`2024-11-05` is not a stale constant — it is the thing under test.**
 *
 * This handshake deliberately uses the **oldest supported version**. The contract
 * this file protects is that old clients still connect after the server moved to
 * the v2 SDK (2026-07-29); bumping to the newest version stops verifying it, and
 * a pass would only mean "current clients talk to each other".
 *
 * Measured at migration time: the v2 server negotiates `2024-11-05` for this
 * request and answers `tools/list` and `tools/call` normally. If the SDK ever
 * drops this version from its list, this turns red first — and that is when
 * "oldest supported version" gets raised.
 */
const INIT_REQUESTS = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
];

function callTool(id, name, args = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

function getCallText(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) throw new Error(`no response for id ${id}`);
  if (res.error) throw new Error(`error response: ${JSON.stringify(res.error)}`);
  const text = res.result?.content?.[0]?.text;
  if (!text) throw new Error(`no text in response id ${id}`);
  return text;
}

function getCallParsed(responses, id) {
  const structured = getCallStructured(responses, id);
  if (structured?.contract === "agentBriefCompact:v2") return structured;
  return JSON.parse(getCallText(responses, id));
}

function getCallStructured(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) throw new Error(`no response for id ${id}`);
  if (res.error) throw new Error(`error response: ${JSON.stringify(res.error)}`);
  return res.result?.structuredContent;
}

function assertStructuredValueRepair(responses, id, { valueName, receivedValue, suggestion, allowedValues }) {
  const structured = getCallStructured(responses, id);
  assert.equal(structured?.errorCode, "invalid_arguments", `request ${id} errorCode`);
  assert.equal(structured?.valueName, valueName, `request ${id} valueName`);
  assert.equal(structured?.receivedValue, receivedValue, `request ${id} receivedValue`);
  if (suggestion !== undefined) {
    assert.equal(structured?.suggestion, suggestion, `request ${id} suggestion`);
  }
  assert.deepEqual(structured?.allowedValues, allowedValues, `request ${id} allowedValues`);
}

function isErrorResponse(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) return false;
  return res.result?.isError === true;
}

function assertPostWriteMaintenanceShape(value, label = "postWriteMaintenance") {
  assert.ok(value, `${label} exists`);
  assert.equal(value.operation, "maintenance_plan", `${label} preserves operation`);
  assert.equal(value.sideEffect, false, `${label} stays side-effect free`);
  assert.equal(typeof value.graphHash, "string", `${label} exposes graphHash`);
  assertPostWriteMaintenanceSummaryShape(value.summary, label);
  assert.ok(value.filters, `${label} exposes maintenance filters`);
  assert.equal(value.filters.executableOnly, false, `${label} exposes default executableOnly filter`);
  assert.deepEqual(value.filters.phases, [], `${label} exposes phase filters`);
  assert.deepEqual(value.filters.severities, [], `${label} exposes severity filters`);
  assert.deepEqual(value.filters.kinds, [], `${label} exposes kind filters`);
  assert.ok(value.cursor, `${label} exposes cursor metadata`);
  assert.equal(typeof value.cursor.found, "boolean", `${label} cursor exposes found flag`);
  assert.ok(Object.hasOwn(value.cursor, "reason"), `${label} cursor exposes miss reason metadata`);
  assert.ok(Object.hasOwn(value.cursor, "startIndex"), `${label} cursor exposes start index`);
  assert.equal(typeof value.cursor.hasMore, "boolean", `${label} cursor exposes hasMore flag`);
  assert.ok(value.byPhase && typeof value.byPhase === "object", `${label} exposes phase counts`);
  assert.ok(value.bySeverity && typeof value.bySeverity === "object", `${label} exposes severity counts`);
  assert.ok(value.byKind && typeof value.byKind === "object", `${label} exposes kind counts`);
  assert.equal(typeof value.limited, "boolean", `${label} exposes limited flag`);
  assert.ok(Array.isArray(value.actions), `${label} exposes compact actions`);
  assert.ok(Object.hasOwn(value, "nextExecutableAction"), `${label} exposes next executable action pointer`);
  assert.ok(Object.hasOwn(value, "nextReviewAction"), `${label} exposes next review action pointer`);
  if (value.nextExecutableAction) {
    assertCompactMaintenanceActionShape(value.nextExecutableAction, `${label} nextExecutableAction`);
  }
  if (value.nextReviewAction) {
    assertCompactMaintenanceActionShape(value.nextReviewAction, `${label} nextReviewAction`);
  }
  if (value.actions.length > 0) {
    assertCompactMaintenanceActionShape(value.actions[0], label);
  }
}

function assertPostWriteMaintenanceSummaryShape(summary, label) {
  assert.ok(summary && typeof summary === "object", `${label} exposes summary`);
  for (const key of [
    "totalActions",
    "filteredActions",
    "remainingActions",
    "executableActions",
    "reviewActions",
    "compileIssues",
    "dependencyCycles",
    "canonicalizationActions",
    "danglingReferences",
    "relationRecommendations",
    "externalElementRefs",
    "externalElementRefsIgnored",
    "unassignedNodes",
    "emptyDomains",
  ]) {
    assert.equal(typeof summary[key], "number", `${label} summary exposes ${key}`);
    assert.ok(Number.isFinite(summary[key]), `${label} summary ${key} is finite`);
    assert.ok(summary[key] >= 0, `${label} summary ${key} is non-negative`);
  }
  assert.equal(
    summary.executableActions + summary.reviewActions,
    summary.totalActions,
    `${label} summary executable/review counts add up`,
  );
  assert.ok(
    summary.filteredActions <= summary.totalActions,
    `${label} summary filteredActions does not exceed totalActions`,
  );
  assert.ok(
    summary.remainingActions <= summary.filteredActions,
    `${label} summary remainingActions does not exceed filteredActions`,
  );
}

function assertCompactMaintenanceActionShape(action, label) {
  assert.match(action.id, /^maint_[a-f0-9]{8}$/, `${label} action has stable id`);
  assert.equal(typeof action.phase, "string", `${label} action exposes phase`);
  assert.equal(typeof action.kind, "string", `${label} action exposes kind`);
  assert.equal(typeof action.severity, "string", `${label} action exposes severity`);
  assert.equal(typeof action.score, "number", `${label} action exposes score`);
  assert.ok(Number.isFinite(action.score), `${label} action score is finite`);
  assert.equal(typeof action.executable, "boolean", `${label} action exposes executable flag`);
  assert.equal(typeof action.reason, "string", `${label} action exposes reason`);
  if (action.executable) {
    assert.ok(action.proposedAction, `${label} executable action exposes proposedAction`);
  }
  if (action.proposedAction) {
    assert.equal(typeof action.proposedAction.tool, "string", `${label} proposedAction exposes tool`);
    assert.ok(action.proposedAction.tool.length > 0, `${label} proposedAction tool is non-empty`);
    assert.ok(action.proposedAction.args && typeof action.proposedAction.args === "object", `${label} proposedAction exposes args`);
  }
  if (action.kind === "add_missing_relation" && action.proposedAction) {
    assert.equal(action.proposedAction.tool, "add_relation", `${label} add_missing_relation uses add_relation`);
    assert.ok(action.nodes?.from?.slug, `${label} add_missing_relation exposes from node`);
    assert.ok(action.nodes?.to?.slug, `${label} add_missing_relation exposes to node`);
    assert.equal(action.proposedAction.args.from, action.nodes.from.slug, `${label} add_missing_relation from matches args`);
    assert.equal(action.proposedAction.args.to, action.nodes.to.slug, `${label} add_missing_relation to matches args`);
    assert.equal(typeof action.proposedAction.args.type, "string", `${label} add_missing_relation exposes relation type`);
  }
}

function assertDestructivePreview(
  result,
  { canConfirm, wouldChange, blocked = 0, label = "destructive preview" },
) {
  assert.equal(result.dryRun, true, `${label} is a dry-run`);
  assert.equal(result.previewReady, true, `${label} is ready for agent review`);
  assert.equal(result.canConfirm, canConfirm, `${label} exposes confirmation readiness`);
  assert.equal(result.wouldChange, wouldChange, `${label} exposes mutation intent`);
  assert.ok(Array.isArray(result.blockedReasons), `${label} exposes blocker list`);
  assert.equal(result.blockedReasons.length, blocked, `${label} blocker count`);
}

function parseInstructionToolInventory(instructions) {
  assert.equal(typeof instructions, "string", "initialize instructions are present");
  const section = instructions.match(
    /## Tool inventory \((\d+) tools = read (\d+) \+ write (\d+)\)\s+([\s\S]*?)(?=\n## )/,
  );
  assert.ok(section, "initialize instructions expose a structured tool inventory");

  const namesFrom = (label) => {
    const line = section[4].match(new RegExp(`^\\*\\*${label}\\*\\*\\s+—\\s+(.+)$`, "m"));
    assert.ok(line, `tool inventory exposes ${label} line`);
    return [...line[1].matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1]);
  };

  return {
    total: Number(section[1]),
    readCount: Number(section[2]),
    writeCount: Number(section[3]),
    readNames: namesFrom("read"),
    writeNames: namesFrom("write"),
  };
}

function assertInstructionToolInventoryMatches(initializeResponse, tools) {
  assert.ok(initializeResponse, "initialize response is present");
  assert.ok(Array.isArray(tools), "tools/list returns an array");
  assert.ok(tools.length > 0, "tools/list target is non-empty");

  const names = tools.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, "tools/list names are unique");
  const expectedRead = tools
    .filter((tool) => tool.annotations?.readOnlyHint === true)
    .map((tool) => tool.name)
    .sort();
  const expectedWrite = tools
    .filter((tool) => tool.annotations?.readOnlyHint !== true)
    .map((tool) => tool.name)
    .sort();
  const inventory = parseInstructionToolInventory(initializeResponse.result?.instructions);

  assert.equal(inventory.total, tools.length, "inventory total matches tools/list");
  assert.equal(inventory.readCount, expectedRead.length, "inventory read count matches tools/list");
  assert.equal(inventory.writeCount, expectedWrite.length, "inventory write count matches tools/list");
  assert.equal(inventory.total, inventory.readCount + inventory.writeCount, "inventory header adds up");
  assert.equal(inventory.readCount, inventory.readNames.length, "inventory read count matches its names");
  assert.equal(inventory.writeCount, inventory.writeNames.length, "inventory write count matches its names");
  assert.deepEqual([...inventory.readNames].sort(), expectedRead, "inventory read names match tools/list");
  assert.deepEqual([...inventory.writeNames].sort(), expectedWrite, "inventory write names match tools/list");
}

// The single tools (get_concept, add_concept, add_relation) must cross-reference
// their batch counterparts (get_concepts, add_concepts, add_relations) in their
// descriptions, so an agent reading only the tool list knows the K-round-trip
// alternative exists. Drift turns this red immediately.
await test("tools/list — 단일 도구 description 이 batch 짝을 cross-reference", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      { jsonrpc: "2.0", id: 99, method: "tools/list", params: {} },
    ]);
    const list = responses.find((r) => r.id === 99);
    assert.ok(list, "tools/list 응답");
    const tools = list.result?.tools;
    assert.ok(Array.isArray(tools));
    assert.ok(
      tools.every((tool) => tool.inputSchema?.additionalProperties === false),
      "tools/list schemas reject unknown top-level arguments",
    );
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [...EXPECTED_TOOLS].sort(),
      "tools/list registry must match verify inventory",
    );
    assertInstructionToolInventoryMatches(
      responses.find((response) => response.id === 1),
      tools,
    );
    for (const tool of tools) {
      assert.equal(
        tool.annotations?.title,
        expectedToolTitle(tool.name),
        `${tool.name} exposes stable title annotation`,
      );
      assert.equal(
        tool.annotations?.readOnlyHint,
        EXPECTED_READ_TOOLS.includes(tool.name),
        `${tool.name} exposes correct readOnlyHint annotation`,
      );
      assert.equal(tool.annotations?.openWorldHint, false, `${tool.name} exposes local-only openWorldHint`);
      assert.equal(
        tool.annotations?.destructiveHint,
        EXPECTED_DESTRUCTIVE_TOOLS.includes(tool.name),
        `${tool.name} exposes correct destructiveHint annotation`,
      );
      assert.equal(
        tool.annotations?.idempotentHint,
        EXPECTED_IDEMPOTENT_TOOLS.includes(tool.name),
        `${tool.name} exposes correct idempotentHint annotation`,
      );
    }
    const findTool = (name) => tools.find((t) => t.name === name);
    const assertCleanStringSchema = (schema, label) => {
      assert.equal(schema?.type, "string", `${label} type`);
      assert.equal(schema?.minLength, 1, `${label} minLength`);
      assert.equal(schema?.pattern, "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$", `${label} pattern`);
    };
    const assertCleanBacklinkValueSchema = (schema, label) => {
      assert.deepEqual(schema?.type, ["array", "object", "string"], `${label} type`);
      assert.equal(schema?.minLength, 1, `${label} minLength`);
      assert.equal(schema?.minItems, 1, `${label} minItems`);
      assert.equal(schema?.minProperties, 1, `${label} minProperties`);
      assert.equal(schema?.pattern, "^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$", `${label} pattern`);
      assertCleanStringSchema(schema?.items, `${label} items`);
      assertCleanStringSchema(schema?.propertyNames, `${label} propertyNames`);
      assertCleanStringSchema(schema?.additionalProperties, `${label} additionalProperties`);
    };
    const listConcepts = findTool("list_concepts");
    assert.equal(listConcepts?.outputSchema?.type, "object");
    assert.deepEqual(listConcepts?.outputSchema?.required, ["total", "vaultRoot", "nodes", "returned", "limited", "pagination"]);
    assert.equal(listConcepts?.outputSchema?.additionalProperties, false);
    assert.equal(listConcepts?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(listConcepts?.outputSchema?.properties?.vaultRoot?.type, "string");
    assert.deepEqual(listConcepts?.outputSchema?.properties?.nodes?.items?.required, ["uid", "slug", "kind", "title", "mtime"]);
    assert.equal(listConcepts?.outputSchema?.properties?.nodes?.items?.properties?.mtime?.type, "number");
    assert.equal(listConcepts?.outputSchema?.properties?.nodes?.items?.additionalProperties, false);
    assert.deepEqual(listConcepts?.outputSchema?.properties?.vaultWarnings?.required, ["errorCount", "warningCount"]);
    assert.equal(listConcepts?.outputSchema?.properties?.vaultWarnings?.additionalProperties, false);
    const getConceptTool = findTool("get_concept");
    assert.equal(getConceptTool?.outputSchema?.type, "object");
    assert.deepEqual(getConceptTool?.outputSchema?.required, ["uid", "slug", "frontmatter", "bodyInfo", "neighbors", "outgoingEdges", "mtime"]);
    assert.equal(getConceptTool?.inputSchema?.properties?.uid?.pattern, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assert.equal(getConceptTool?.inputSchema?.oneOf, undefined, "Claude-compatible input avoids top-level oneOf");
    assert.match(getConceptTool?.description ?? "", /exactly one selector/i);
    assert.deepEqual(getConceptTool?.inputSchema?.properties?.body?.enum, ["excerpt", "full"]);
    assert.deepEqual(getConceptTool?.outputSchema?.properties?.bodyInfo?.required, ["mode", "totalChars", "returnedChars", "truncated"]);
    assert.equal(getConceptTool?.outputSchema?.additionalProperties, false);
    assert.equal(getConceptTool?.outputSchema?.properties?.frontmatter?.type, "object");
    assert.deepEqual(getConceptTool?.outputSchema?.properties?.neighbors?.required, ["domains", "domain", "capabilities", "elements", "dependencies", "relates", "contains", "describes"]);
    assert.equal(getConceptTool?.outputSchema?.properties?.neighbors?.additionalProperties, false);
    assert.equal(getConceptTool?.outputSchema?.properties?.outgoingEdges?.items?.properties?.via?.type, "string");
    assert.equal(getConceptTool?.outputSchema?.properties?.outgoingEdges?.items?.additionalProperties, false);
    assert.equal(getConceptTool?.outputSchema?.properties?.mtime?.type, "number");
    assert.deepEqual(getConceptTool?.outputSchema?.properties?.warnings?.items?.required, ["code", "severity", "message"]);
    assert.equal(getConceptTool?.outputSchema?.properties?.warnings?.items?.additionalProperties, false);
    const getConceptsTool = findTool("get_concepts");
    assert.equal(getConceptsTool?.outputSchema?.type, "object");
    assert.deepEqual(getConceptsTool?.outputSchema?.required, ["concepts"]);
    assert.equal(getConceptsTool?.outputSchema?.additionalProperties, false);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.type, "array");
    assert.deepEqual(getConceptsTool?.outputSchema?.properties?.concepts?.items?.required, ["ok"]);
    assert.equal(getConceptsTool?.inputSchema?.oneOf, undefined, "Claude-compatible batch input avoids top-level oneOf");
    assert.match(getConceptsTool?.description ?? "", /exactly one selector array/i);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.additionalProperties, false);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.ok?.type, "boolean");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.frontmatter?.type, "object");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.excerpt?.type, "string");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.neighbors?.type, "object");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.neighbors?.additionalProperties, false);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.outgoingEdges?.type, "array");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.outgoingEdges?.items?.additionalProperties, false);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.mtime?.type, "number");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.warnings?.type, "array");
    assert.deepEqual(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.warnings?.items?.properties?.severity?.enum, ["error", "warning"]);
    const findEvidence = findTool("find_evidence");
    assert.match(
      findEvidence?.description ?? "",
      /Find vault docs that mention a given concept by title[\s\S]*Each match includes a prose `?excerpt`?[\s\S]*without an extra get_concept call/i,
      "find_evidence description documents excerpt-first usage",
    );
    assert.match(
      findEvidence?.inputSchema?.properties?.title?.description ?? "",
      /case-insensitive substring match/i,
      "find_evidence title schema documents matching behavior",
    );
    assert.equal(findEvidence?.outputSchema?.type, "object");
    assert.deepEqual(findEvidence?.outputSchema?.required, ["query", "matches"]);
    assert.equal(findEvidence?.outputSchema?.additionalProperties, false);
    assert.equal(findEvidence?.outputSchema?.properties?.matches?.type, "array");
    const evidenceMatchSchema = findEvidence?.outputSchema?.properties?.matches?.items;
    assert.deepEqual(evidenceMatchSchema?.required, ["slug", "isNode", "title", "mtime", "matchedIn", "score", "excerpt"]);
    assert.equal(evidenceMatchSchema?.additionalProperties, false);
    assert.deepEqual(evidenceMatchSchema?.properties?.matchedIn?.enum, ["frontmatter", "body"]);
    assert.deepEqual(
      evidenceMatchSchema?.oneOf,
      [
        {
          properties: { isNode: { const: true } },
          required: ["uid", "kind"],
        },
        {
          properties: { isNode: { const: false } },
          not: { anyOf: [{ required: ["uid"] }, { required: ["kind"] }] },
        },
      ],
      "find_evidence output rows discriminate graph-node identity from ordinary markdown",
    );
    const findBacklinks = findTool("find_backlinks");
    assert.match(
      findBacklinks?.description ?? "",
      /Return every node that points to the target slug[\s\S]*Scans both frontmatter[\s\S]*wikilinks \/ markdown links in the body[\s\S]*walk the graph from a node to its dependents/i,
      "find_backlinks description documents dependent-walk behavior",
    );
    assert.match(
      findBacklinks?.inputSchema?.properties?.slug?.description ?? "",
      /Target vault-relative slug[\s\S]*omit the \.md extension/i,
      "find_backlinks slug schema documents target slug format",
    );
    assert.equal(findBacklinks?.outputSchema?.type, "object");
    assert.deepEqual(findBacklinks?.outputSchema?.required, ["target", "total", "matches"]);
    assert.equal(findBacklinks?.outputSchema?.additionalProperties, false);
    assert.equal(findBacklinks?.outputSchema?.properties?.total?.type, "integer");
    assert.deepEqual(findBacklinks?.outputSchema?.properties?.matches?.items?.required, ["uid", "slug", "kind", "title", "mtime"]);
    assert.equal(findBacklinks?.outputSchema?.properties?.matches?.items?.additionalProperties, false);
    assert.equal(findBacklinks?.outputSchema?.properties?.matches?.items?.properties?.matchedKeys?.items?.type, "string");
    const findNeighbors = findTool("find_neighbors");
    assert.equal(findNeighbors?.outputSchema?.type, "object");
    assert.deepEqual(findNeighbors?.outputSchema?.required, ["center", "requested", "direction", "totalEdges", "limited", "edges"]);
    assert.equal(findNeighbors?.outputSchema?.additionalProperties, false);
    assert.deepEqual(findNeighbors?.outputSchema?.properties?.direction?.enum, ["outgoing", "incoming", "both"]);
    assert.equal(findNeighbors?.outputSchema?.properties?.totalEdges?.type, "integer");
    assert.deepEqual(findNeighbors?.outputSchema?.properties?.edges?.items?.required, ["direction", "from", "to", "via", "ref", "resolved"]);
    assert.equal(findNeighbors?.outputSchema?.properties?.edges?.items?.additionalProperties, false);
    assert.deepEqual(findNeighbors?.outputSchema?.properties?.nodes?.items?.required, ["uid", "slug", "kind", "title", "mtime"]);
    assert.equal(findNeighbors?.outputSchema?.properties?.nodes?.items?.additionalProperties, false);
    const findPath = findTool("find_path");
    assert.equal(findPath?.outputSchema?.type, "object");
    assert.deepEqual(findPath?.outputSchema?.required, ["from", "to", "found"]);
    assert.equal(findPath?.outputSchema?.additionalProperties, false);
    assert.equal(findPath?.outputSchema?.properties?.found?.type, "boolean");
    assert.equal(findPath?.outputSchema?.properties?.hopCount?.type, "integer");
    assert.equal(findPath?.outputSchema?.properties?.hops?.items?.type, "string");
    assert.deepEqual(findPath?.outputSchema?.properties?.edges?.items?.required, ["from", "to", "via"]);
    assert.equal(findPath?.outputSchema?.properties?.edges?.items?.additionalProperties, false);
    assert.deepEqual(findPath?.outputSchema?.properties?.nodes?.items?.required, ["uid", "slug", "kind", "title"]);
    const findOrphans = findTool("find_orphans");
    assert.match(
      findOrphans?.description ?? "",
      /List orphan nodes[\s\S]*docs that no other node references via any frontmatter array key[\s\S]*cleanup starting point[\s\S]*Root\/sentinel kinds like project and vault-readme are excluded by default/i,
      "find_orphans description documents cleanup and default exclusions",
    );
    assert.match(
      findOrphans?.inputSchema?.properties?.kind?.description ?? "",
      /Restrict to one kind[\s\S]*Omit for all kinds/i,
      "find_orphans kind schema documents optional kind filter",
    );
    assert.equal(findOrphans?.outputSchema?.type, "object");
    assert.deepEqual(findOrphans?.outputSchema?.required, ["total", "orphans"]);
    assert.equal(findOrphans?.outputSchema?.additionalProperties, false);
    assert.equal(findOrphans?.outputSchema?.properties?.total?.type, "integer");
    assert.deepEqual(findOrphans?.outputSchema?.properties?.orphans?.items?.required, ["uid", "slug", "kind", "title", "mtime"]);
    assert.equal(findOrphans?.outputSchema?.properties?.orphans?.items?.additionalProperties, false);
    assert.equal(findOrphans?.outputSchema?.properties?.orphans?.items?.properties?.mtime?.type, "number");
    const queryConcepts = findTool("query_concepts");
    assert.equal(queryConcepts?.outputSchema?.type, "object");
    assert.deepEqual(queryConcepts?.outputSchema?.required, ["filter", "parsedAs", "total", "matches", "limited"]);
    assert.equal(queryConcepts?.outputSchema?.additionalProperties, false);
    assert.equal(queryConcepts?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(queryConcepts?.outputSchema?.properties?.limited?.type, "boolean");
    assert.deepEqual(queryConcepts?.outputSchema?.properties?.matches?.items?.required, ["uid", "slug", "kind", "title", "mtime"]);
    assert.equal(queryConcepts?.outputSchema?.properties?.matches?.items?.additionalProperties, false);
    assert.equal(queryConcepts?.outputSchema?.properties?.matches?.items?.properties?.mtime?.type, "number");
    const compileOntology = findTool("compile_ontology");
    assert.equal(compileOntology?.outputSchema?.type, "object");
    assert.deepEqual(compileOntology?.outputSchema?.required, [
      "version",
      "graphHash",
      "maxMtime",
      "nodeCount",
      "edgeCount",
      "resolvedEdgeCount",
      "externalEdgeCount",
      "unresolvedEdgeCount",
      "aliasCount",
      "ambiguousAliasCount",
      "issueCount",
      "canonicalizationActionCount",
      "byKind",
      "byDomain",
    ]);
    assert.equal(compileOntology?.outputSchema?.additionalProperties, false);
    assert.equal(compileOntology?.outputSchema?.properties?.graphHash?.type, "string");
    assert.equal(compileOntology?.outputSchema?.properties?.nodeCount?.type, "integer");
    assert.equal(compileOntology?.outputSchema?.properties?.byKind?.additionalProperties?.type, "integer");
    assert.deepEqual(compileOntology?.outputSchema?.properties?.nodes?.items?.required, ["uid", "slug", "kind", "title", "mtime", "outDegree", "inDegree"]);
    assert.equal(compileOntology?.outputSchema?.properties?.nodes?.items?.additionalProperties, false);
    assert.deepEqual(compileOntology?.outputSchema?.properties?.edges?.items?.required, ["id", "from", "to", "via", "ref", "resolved", "external"]);
    assert.equal(compileOntology?.outputSchema?.properties?.edges?.items?.additionalProperties, false);
    assert.deepEqual(compileOntology?.outputSchema?.properties?.nodesPagination?.required, ["offset", "limit", "total", "returned", "hasMore", "nextOffset"]);
    assert.equal(compileOntology?.outputSchema?.properties?.nodesPagination?.additionalProperties, false);
    assert.equal(compileOntology?.outputSchema?.properties?.aliases?.items?.additionalProperties, false);
    assert.equal(compileOntology?.outputSchema?.properties?.ambiguousAliases?.items?.additionalProperties, false);
    assert.deepEqual(compileOntology?.outputSchema?.properties?.issues?.items?.required, ["code", "severity", "message"]);
    assert.equal(compileOntology?.outputSchema?.properties?.issues?.items?.additionalProperties, false);
    const canonicalizationActionSchema = compileOntology?.outputSchema?.properties?.canonicalizationActions?.items;
    assert.deepEqual(canonicalizationActionSchema?.required, ["slug", "keys", "frontmatter", "expected_mtime"]);
    assert.equal(canonicalizationActionSchema?.additionalProperties, false);
    assert.deepEqual(canonicalizationActionSchema?.properties?.keys?.items?.enum, GRAPH_ARRAY_KEYS);
    assert.equal(canonicalizationActionSchema?.properties?.frontmatter?.additionalProperties, false);
    assert.deepEqual(
      Object.keys(canonicalizationActionSchema?.properties?.frontmatter?.properties ?? {}).sort(),
      [...GRAPH_ARRAY_KEYS].sort(),
    );
    assert.equal(canonicalizationActionSchema?.properties?.frontmatter?.properties?.contains?.items?.minLength, 1);
    assert.equal(canonicalizationActionSchema?.properties?.expected_mtime?.minimum, 0);
    assert.equal(compileOntology?.outputSchema?.properties?.indexes?.additionalProperties, false);
    assert.equal(compileOntology?.outputSchema?.properties?.indexes?.properties?.edgeById?.additionalProperties?.additionalProperties, false);
    assert.equal(compileOntology?.outputSchema?.properties?.indexes?.properties?.uidToSlug?.type, "object");
    assert.equal(compileOntology?.outputSchema?.properties?.indexes?.properties?.slugToUid?.type, "object");
    assert.equal(compileOntology?.outputSchema?.properties?.indexes?.properties?.mergedUidToSlug?.type, "object");
    assert.deepEqual(compileOntology?.outputSchema?.properties?.summary?.required, ["nodes", "edges", "graphHash", "maxMtime", "resolvedEdges", "externalEdges", "unresolvedEdges", "aliases", "ambiguousAliases", "issues"]);
    assert.equal(compileOntology?.outputSchema?.properties?.summary?.additionalProperties, false);
    const indexProject = findTool("index_project");
    const indexMeaningGate = indexProject?.outputSchema?.properties?.meaningGate;
    assert.deepEqual(indexMeaningGate?.properties?.businessOntology?.required, ["domains", "capabilities", "evidence", "evidenceRows"]);
    assert.equal(indexMeaningGate?.properties?.businessOntology?.properties?.evidenceRows?.maxItems, 5);
    assert.deepEqual(indexMeaningGate?.properties?.businessOntology?.properties?.evidenceRows?.items?.required, ["slug", "kind", "source"]);
    assert.deepEqual(indexMeaningGate?.properties?.businessOntology?.properties?.evidenceRows?.items?.properties?.kind?.enum, ["domain", "capability"]);
    assert.deepEqual(indexMeaningGate?.properties?.implementationEvidence?.required, ["elements", "reviewRequiredCapabilities", "reviewRequiredRows"]);
    assert.equal(indexMeaningGate?.properties?.implementationEvidence?.properties?.reviewRequiredRows?.maxItems, 5);
    assert.deepEqual(indexMeaningGate?.properties?.implementationEvidence?.properties?.reviewRequiredRows?.items?.required, ["slug", "reason", "evidence"]);
    const analyzeRepo = findTool("analyze_repo_structure");
    assert.match(
      analyzeRepo?.description ?? "",
      /analyze a code repository and propose ontology node candidates[\s\S]*side effect 0 \(vault frontmatter NOT modified\)[\s\S]*Returns deterministic candidates[\s\S]*construction lifecycle[\s\S]*reviewPlan[\s\S]*constructionQualification:v1[\s\S]*writePlan[\s\S]*bootstrap the ontology/i,
      "analyze_repo_structure description documents bootstrap safety workflow",
    );
    assert.match(
      analyzeRepo?.description ?? "",
      /unqualified-project-exclusion[\s\S]*exact human-acceptance gap[\s\S]*source-aware citation verification/i,
      "analyze_repo_structure description separates approvable scope gaps from source-aware truth checks",
    );
    assert.match(
      analyzeRepo?.description ?? "",
      /freeze claim id, statement, and proposalRefs[\s\S]*isolated source-hidden[\s\S]*source-aware lanes run in parallel[\s\S]*before human acceptance/i,
      "analyze_repo_structure description keeps parallel qualification sealed and pre-acceptance",
    );
    assert.match(
      analyzeRepo?.description ?? "",
      /mandatory non-gap warning blocks the first review before qualification/i,
      "analyze_repo_structure description rejects mandatory warnings before candidate release",
    );
    assert.match(
      analyzeRepo?.description ?? "",
      /separately audit material Definition, Includes, Excludes, and Uncertainty assertions[\s\S]*several claims share one proposal ref/i,
      "analyze_repo_structure description requires body-assertion rather than ref-only qualification",
    );
    const initializeInstructions = responses.find((response) => response.id === 1)?.result?.instructions ?? "";
    assert.match(
      initializeInstructions,
      /Ontology construction lifecycle[\s\S]*reviewPlan[\s\S]*sourceDigest[\s\S]*separately identified evaluator[\s\S]*declared human provenance[\s\S]*writeEligibility:"executable"[\s\S]*finalize_project_meaning/,
      "initialize instructions expose the non-bypassable review, evaluation, approval, write, and post-write lifecycle",
    );
    assert.match(
      initializeInstructions,
      /unqualified-project-exclusion[\s\S]*exact required gap[\s\S]*Raw source absence[\s\S]*source-aware citation check/,
      "initialize instructions keep human-review warnings and source-hidden uncertainty in their proper phases",
    );
    assert.match(
      initializeInstructions,
      /Seal one exact claim manifest before qualification forks: claim id, statement, and proposalRefs cannot change\.[\s\S]{0,900}Run the source-hidden evaluation and source-aware citation audit in parallel isolation; the lanes must not exchange results\.[\s\S]{0,300}Record human acceptance only after the sealed outputs join without mismatch\./,
      "initialize instructions seal parallel qualification lanes before human acceptance",
    );
    assert.match(
      initializeInstructions,
      /Proposal-ref coverage alone is insufficient:[\s\S]*Definition assertion[\s\S]*Includes\/Excludes bullet[\s\S]*Uncertainty assertion[\s\S]*several claims to share one concept ref/,
      "initialize instructions require source-aware coverage of each material body assertion",
    );
    assert.match(
      initializeInstructions,
      /mandatory warning that is not gap-eligible[\s\S]*writeEligibility:"blocked"[\s\S]*do not count that response as a candidate release/i,
      "initialize instructions keep mandatory warnings out of the qualification lanes",
    );
    assert.match(
      analyzeRepo?.inputSchema?.properties?.rootPath?.description ?? "",
      /Repository root to analyze[\s\S]*Defaults to the MCP server cwd/i,
      "analyze_repo_structure rootPath schema documents default root",
    );
    assert.equal(analyzeRepo?.inputSchema?.properties?.ignore?.maxItems, 200);
    assert.equal(analyzeRepo?.outputSchema?.type, "object");
    assert.deepEqual(analyzeRepo?.outputSchema?.required, ["rootPath", "framework", "domains", "capabilities", "elements", "meaningGate", "extractionContract", "semanticEvidence", "configurationEvidence", "proposalValidation", "suggestedRelations", "skipped"]);
    assert.equal(analyzeRepo?.outputSchema?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.project?.required, ["slug", "title"]);
    assert.equal(analyzeRepo?.outputSchema?.properties?.project?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.framework?.enum, ["fsd", "next", "generic"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.capabilities?.items?.required, ["slug", "title", "evidence"]);
    assert.equal(analyzeRepo?.outputSchema?.properties?.capabilities?.items?.additionalProperties, false);
    assert.equal(analyzeRepo?.outputSchema?.properties?.capabilities?.items?.properties?.evidence?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.inputSchema?.properties?.proposal?.required, ["project", "domains", "capabilities", "elements", "relations", "competencyAnswers"]);
    assert.equal(analyzeRepo?.inputSchema?.properties?.proposal?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.inputSchema?.properties?.proposal?.properties?.elements?.items?.required, ["slug", "title", "definition", "evidence", "confidence", "domain", "path"]);
    assert.deepEqual(analyzeRepo?.inputSchema?.properties?.proposal?.properties?.relations?.items?.required, ["from", "to", "type", "why", "evidence", "confidence"]);
    assert.equal(analyzeRepo?.inputSchema?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.inputSchema?.properties?.qualification?.required, [
      "contract",
      "qualificationId",
      "subject",
      "actors",
      "purposeAuthority",
      "scenarios",
      "competencyQuestions",
      "witnesses",
      "cqResults",
      "claims",
      "citationChecks",
      "sourceHiddenTask",
      "axisResults",
      "diagnostics",
      "regression",
      "resourceUse",
      "acceptance",
    ]);
    assert.equal(analyzeRepo?.inputSchema?.properties?.qualification?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.inputSchema?.properties?.qualification?.properties?.claims?.items?.required, [
      "id",
      "statement",
      "status",
      "witnessRefs",
      "proposalRefs",
    ]);
    const competencyAnswerSchema = analyzeRepo?.inputSchema?.properties?.proposal?.properties?.competencyAnswers?.properties?.scope;
    assert.deepEqual(competencyAnswerSchema?.required, ["answer", "status", "witnesses"]);
    assert.deepEqual(competencyAnswerSchema?.properties?.status?.enum, ["answered", "partial", "visible-gap"]);
    assert.deepEqual(competencyAnswerSchema?.properties?.witnesses?.required, ["concepts", "relations", "evidence", "paths"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.proposalValidation?.required, ["status", "canWrite", "summary", "gates", "findings", "constructionLifecycle", "nextStep"]);
    assert.equal(analyzeRepo?.outputSchema?.properties?.proposalValidation?.additionalProperties, false);
    const rustConfigurationSchema = analyzeRepo?.outputSchema?.properties?.configurationEvidence;
    assert.deepEqual(rustConfigurationSchema?.properties?.contract?.enum, ["rustFeatureConfigurationEvidence:v1"]);
    assert.deepEqual(rustConfigurationSchema?.properties?.status?.enum, ["not_present", "unsupported", "observed", "limited"]);
    assert.deepEqual(rustConfigurationSchema?.properties?.writePolicy?.properties?.writeAllowed?.enum, [false]);
    assert.deepEqual(rustConfigurationSchema?.properties?.packages?.items?.properties?.features?.items?.properties?.references?.items?.properties?.meaning?.enum, ["conditional_inclusion", "conditional_attribute"]);
    assert.deepEqual(rustConfigurationSchema?.properties?.packages?.items?.properties?.features?.items?.properties?.references?.items?.properties?.polarity?.enum, ["positive", "negative", "compound", "unknown"]);
    assert.equal(rustConfigurationSchema?.properties?.coverage?.properties?.predicateEvaluation?.enum?.[0], false);
    assert.equal(rustConfigurationSchema?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.summary?.required, ["concepts", "relations", "findings", "errors", "warnings"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.writePlan?.required, ["concepts", "relations", "competencyAnswers"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.reviewPlan?.required, ["concepts", "relations", "competencyAnswers"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.constructionLifecycle?.required, [
      "contract",
      "qualificationStatus",
      "writeEligibility",
      "planDigest",
      "sourceDigest",
      "planRevision",
      "firstBlockingPhase",
      "phases",
      "diagnostics",
      "requiredGapIds",
      "proposalCoverage",
      "admission",
      "nextAction",
    ]);
    assert.equal(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.constructionLifecycle?.properties?.phases?.minItems, 8);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.writePlan?.properties?.relations?.items?.required, ["from", "to", "type", "why"]);
    assert.ok(analyzeRepo?.outputSchema?.properties?.proposalValidation?.properties?.gates?.required?.includes("competencyWitnessesResolved"));
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.extractionContract?.properties?.competencyQuestions?.items?.required, ["id", "type", "question", "priority", "requiredWitnesses"]);
    const analyzeMeaningGate = analyzeRepo?.outputSchema?.properties?.meaningGate;
    assert.deepEqual(analyzeMeaningGate?.required, ["policy", "sourceStructureRole", "businessOntology", "proposedBusinessOntology", "implementationEvidence", "reviewQuestions"]);
    assert.equal(analyzeMeaningGate?.additionalProperties, false);
    assert.deepEqual(analyzeMeaningGate?.properties?.businessOntology?.required, ["domains", "capabilities", "evidence"]);
    assert.equal(analyzeMeaningGate?.properties?.businessOntology?.properties?.domains?.items?.type, "string");
    assert.deepEqual(analyzeMeaningGate?.properties?.businessOntology?.properties?.evidence?.items?.required, ["slug", "kind", "source"]);
    assert.deepEqual(analyzeMeaningGate?.properties?.businessOntology?.properties?.evidence?.items?.properties?.kind?.enum, ["domain", "capability"]);
    assert.equal(analyzeMeaningGate?.properties?.implementationEvidence?.properties?.elements?.items?.type, "string");
    assert.equal(analyzeMeaningGate?.properties?.implementationEvidence?.properties?.reviewRequiredCapabilities?.items?.additionalProperties, false);
    assert.deepEqual(analyzeMeaningGate?.properties?.implementationEvidence?.properties?.reviewRequiredCapabilities?.items?.required, ["slug", "reason", "evidence"]);
    assert.ok(
      analyzeRepo?.outputSchema?.properties?.semanticEvidence?.items?.properties?.role?.enum?.includes("package-contract"),
      "semantic evidence schema must admit the package-contract role emitted by analysis",
    );
    const reviewRequiredEvidenceSchema = analyzeRepo?.outputSchema?.properties
      ?.semanticEvidence?.items?.properties?.reviewRequiredEvidence;
    assert.equal(reviewRequiredEvidenceSchema?.maxItems, 4);
    assert.deepEqual(reviewRequiredEvidenceSchema?.items?.required, [
      "heading",
      "startLine",
      "endLine",
      "excerpt",
      "riskFlags",
    ]);
    assert.deepEqual(
      reviewRequiredEvidenceSchema?.items?.properties?.riskFlags?.items?.enum,
      ["future-state-claim", "negated-claim", "deprecated-state"],
    );
    assert.equal(reviewRequiredEvidenceSchema?.items?.additionalProperties, false);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.suggestedRelations?.items?.required, ["from", "to", "type"]);
    assert.equal(analyzeRepo?.outputSchema?.properties?.suggestedRelations?.items?.additionalProperties, false);
    const inferImports = findTool("infer_imports");
    assert.equal(inferImports?.outputSchema?.type, "object");
    assert.equal(inferImports?.inputSchema?.properties?.sourceFolders?.maxItems, 50);
    assert.equal(inferImports?.inputSchema?.properties?.ignore?.maxItems, 200);
    assert.deepEqual(inferImports?.inputSchema?.properties?.reviewMode?.enum, ["full", "next", "focus"]);
    assert.equal(inferImports?.inputSchema?.properties?.allowLargeResponse?.type, "boolean");
    assert.match(
      inferImports?.inputSchema?.properties?.allowLargeResponse?.description ?? "",
      /reviewMode:"full"[\s\S]*exceeds 128 KiB/i,
    );
    assert.match(inferImports?.inputSchema?.properties?.afterReviewId?.description ?? "", /cursor\.nextAfterReviewId/);
    assert.equal(inferImports?.inputSchema?.properties?.focusPath?.type, "string");
    assert.deepEqual(inferImports?.inputSchema?.properties?.focusDirection?.enum, ["incoming", "outgoing", "both"]);
    assert.equal(inferImports?.inputSchema?.properties?.focusLimit?.maximum, 100);
    assert.match(inferImports?.inputSchema?.properties?.focusAfterEdgeId?.description ?? "", /nextAfterEdgeId/);
    assert.deepEqual(inferImports?.outputSchema?.required, ["rootPath", "filesScanned", "coverage"]);
    assert.deepEqual(inferImports?.outputSchema?.oneOf?.[0]?.required, ["edges", "externalImports", "unresolved", "moduleEdges"]);
    assert.deepEqual(inferImports?.outputSchema?.oneOf?.[1]?.required, ["contract", "scanSummary", "reconciliationSummary", "reviewQueue", "nextReview"]);
    assert.deepEqual(Object.keys(inferImports?.outputSchema?.properties?.staleEdgeFollowUp?.properties ?? {}).sort(), ["count", "nextCall", "status"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.staleEdgeFollowUp?.required, ["status", "count", "nextCall"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.staleEdgeFollowUp?.properties?.status?.enum, ["not_present", "full_follow_up_required"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.staleEdgeFollowUp?.properties?.nextCall?.properties?.tool?.enum, ["infer_imports"]);
    assert.deepEqual(inferImports?.outputSchema?.oneOf?.[2]?.required, ["contract", "scanSummary", "focusReview"]);
    assert.equal(inferImports?.outputSchema?.additionalProperties, false);
    assert.equal(inferImports?.outputSchema?.properties?.filesScanned?.type, "integer");
    assert.deepEqual(inferImports?.outputSchema?.properties?.coverage?.properties?.contract?.enum, ["importScanCoverage:v1"]);
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.coverage?.properties?.detectedUnsupportedLanguages?.items?.enum,
      ["c"],
    );
    assert.deepEqual(inferImports?.outputSchema?.properties?.coverage?.properties?.zeroEdgesMeaning?.enum, ["no_supported_static_import_edges_observed"]);
    assert.equal(inferImports?.outputSchema?.properties?.coverage?.additionalProperties, false);
    assert.deepEqual(inferImports?.outputSchema?.properties?.edges?.items?.required, ["from", "to", "kind", "sourceRole", "importUsage"]);
    assert.equal(inferImports?.outputSchema?.properties?.edges?.items?.additionalProperties, false);
    assert.deepEqual(inferImports?.outputSchema?.properties?.edges?.items?.properties?.kind?.enum, IMPORT_EDGE_KIND_VALUES);
    assert.equal(inferImports?.outputSchema?.properties?.externalImports?.items?.additionalProperties, false);
    assert.deepEqual(inferImports?.outputSchema?.properties?.unresolved?.items?.properties?.reason?.enum, IMPORT_UNRESOLVED_REASON_VALUES);
    assert.equal(inferImports?.outputSchema?.properties?.unresolved?.items?.additionalProperties, false);
    assert.deepEqual(inferImports?.outputSchema?.properties?.moduleEdges?.items?.required, ["from", "to", "count", "kindCounts", "sourceRoleCounts", "importUsageCounts", "productValueCount", "evidence", "evidenceLimited"]);
    assert.equal(inferImports?.outputSchema?.properties?.moduleEdges?.items?.additionalProperties, false);
    assert.equal(inferImports?.outputSchema?.properties?.moduleEdges?.items?.properties?.count?.minimum, 1);
    const kindCountsSchema = inferImports?.outputSchema?.properties?.moduleEdges?.items?.properties?.kindCounts;
    assert.equal(kindCountsSchema?.additionalProperties, false);
    assert.equal(kindCountsSchema?.minProperties, 1);
    assert.deepEqual(Object.keys(kindCountsSchema?.properties ?? {}), IMPORT_EDGE_KIND_VALUES);
    assert.equal(kindCountsSchema?.properties?.static?.type, "integer");
    assert.equal(kindCountsSchema?.properties?.static?.minimum, 1);
    const moduleEvidenceSchema = inferImports?.outputSchema?.properties?.moduleEdges?.items?.properties?.evidence;
    assert.equal(moduleEvidenceSchema?.maxItems, 5);
    assert.deepEqual(moduleEvidenceSchema?.items?.required, ["from", "to", "kind", "sourceRole", "importUsage"]);
    assert.equal(moduleEvidenceSchema?.items?.additionalProperties, false);
    assert.equal(inferImports?.outputSchema?.properties?.moduleEdges?.items?.properties?.evidenceLimited?.type, "boolean");
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.coverage?.properties?.supportedLanguages?.items?.enum,
      ["go", "javascript", "python", "rust", "typescript"],
    );
    const goPackageEvidenceSchema = inferImports?.outputSchema?.properties?.packageImportEvidence;
    assert.deepEqual(goPackageEvidenceSchema?.required, [
      "contract",
      "modulePath",
      "sourceQualification",
      "writeAllowed",
      "filesScanned",
      "fileScanLimited",
      "perFileByteLimit",
      "perFileImportLimit",
      "skipped",
      "limitations",
      "packageImports",
      "moduleEdges",
    ]);
    assert.equal(goPackageEvidenceSchema?.additionalProperties, false);
    assert.deepEqual(goPackageEvidenceSchema?.properties?.contract?.enum, ["goPackageImports:v1"]);
    assert.deepEqual(goPackageEvidenceSchema?.properties?.sourceQualification?.enum, ["observed_bounded_go_package_imports_not_runtime_or_semantic_impact"]);
    assert.deepEqual(goPackageEvidenceSchema?.properties?.writeAllowed?.enum, [false]);
    assert.deepEqual(goPackageEvidenceSchema?.properties?.packageImports?.items?.required, ["fromFile", "fromPackage", "toPackage", "importSpec", "kind", "sourceRole", "importUsage"]);
    assert.equal(goPackageEvidenceSchema?.properties?.packageImports?.items?.additionalProperties, false);
    assert.deepEqual(goPackageEvidenceSchema?.properties?.moduleEdges?.items?.required, ["fromPackage", "toPackage", "count", "kindCounts", "sourceRoleCounts", "importUsageCounts", "productValueCount", "evidence", "evidenceLimited"]);
    assert.equal(goPackageEvidenceSchema?.properties?.moduleEdges?.items?.additionalProperties, false);
    assert.deepEqual(goPackageEvidenceSchema?.properties?.moduleEdges?.items?.properties?.evidence?.items?.required, ["fromFile", "fromPackage", "toPackage", "importSpec", "kind", "sourceRole", "importUsage"]);
    const goPackageSummarySchema = inferImports?.outputSchema?.properties?.packageImportEvidenceSummary;
    assert.deepEqual(goPackageSummarySchema?.required, ["contract", "filesScanned", "fileScanLimited", "packageImports", "moduleEdges", "fullEvidenceCall"]);
    assert.equal(goPackageSummarySchema?.additionalProperties, false);
    assert.deepEqual(goPackageSummarySchema?.properties?.fullEvidenceCall?.properties?.tool?.enum, ["infer_imports"]);
    assert.deepEqual(goPackageSummarySchema?.properties?.fullEvidenceCall?.properties?.arguments?.required, ["rootPath", "reviewMode", "allowLargeResponse"]);
    assert.equal(goPackageSummarySchema?.properties?.fullEvidenceCall?.properties?.arguments?.properties?.sourceFolders?.maxItems, 50);
    assert.equal(goPackageSummarySchema?.properties?.fullEvidenceCall?.properties?.arguments?.properties?.ignore?.maxItems, 200);
    assert.equal(goPackageSummarySchema?.properties?.fullEvidenceCall?.properties?.arguments?.properties?.maxFiles?.maximum, 50000);
    assert.deepEqual(indexProject?.outputSchema?.properties?.imports?.properties?.packageImports?.type, "integer");
    assert.deepEqual(indexProject?.outputSchema?.properties?.imports?.properties?.packageModuleEdges?.type, "integer");
    assert.deepEqual(indexProject?.outputSchema?.properties?.imports?.required, ["filesScanned", "moduleEdges", "packageImports", "packageModuleEdges", "coverage"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.contract?.enum, ["inferImportsReview:v1", "inferImportsFocus:v1"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.focusReview?.required, [
      "contract",
      "focusPath",
      "direction",
      "sourceQualification",
      "writeAllowed",
      "summary",
      "edges",
      "cursor",
      "interpretation",
    ]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.focusReview?.properties?.writeAllowed?.enum, [false]);
    assert.equal(inferImports?.outputSchema?.properties?.focusReview?.properties?.edges?.maxItems, 100);
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.delivery?.properties?.selection?.enum,
      ["automatic_compact"],
    );
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.delivery?.properties?.automaticLimitBytes?.enum,
      [131072],
    );
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.delivery?.required,
      [
        "selection",
        "reason",
        "estimatedFullResponseBytes",
        "automaticLimitBytes",
        "explicitFullAvailable",
        "explicitFullArguments",
      ],
    );
    assert.equal(inferImports?.outputSchema?.properties?.delivery?.additionalProperties, false);
    assert.deepEqual(inferImports?.outputSchema?.properties?.nextReview?.properties?.writeAllowed?.enum, [false]);
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.nextReview?.properties?.candidate?.properties?.evidenceQualification?.required,
      ["basis", "sourceRoleCounts", "importUsageCounts", "productValueCount", "status"],
    );
    assert.deepEqual(
      inferImports?.outputSchema?.properties?.nextReview?.properties?.decision?.properties?.questionEligibility?.enum,
      ["blocked_missing_vault_endpoints", "eligible_after_semantic_review", "additional_product_meaning_evidence_required"],
    );
    assert.deepEqual(inferImports?.outputSchema?.properties?.nextReview?.properties?.cursor?.required, ["afterReviewId", "total", "remaining", "hasMore", "nextAfterReviewId"]);
    assert.match(
      inferImports?.description ?? "",
      /walk TS\/JS files in a code repo and infer file-level \+ module-level import edges[\s\S]*bounded root Python packages[\s\S]*side effect 0 \(vault frontmatter NOT modified\)[\s\S]*source-backed review candidates[\s\S]*focusPath[\s\S]*incoming[\s\S]*outgoing[\s\S]*omit `reviewMode`[\s\S]*128 KiB[\s\S]*larger reconciled scans return exactly one compact, non-writing `nextRelationReview:v1` packet[\s\S]*delivery receipt[\s\S]*reviewMode:"next"[\s\S]*reviewMode:"full"[\s\S]*allowLargeResponse:true[\s\S]*actionable error[\s\S]*bounded exact file-edge `evidence` receipt[\s\S]*rationale_review_required[\s\S]*ask the user[\s\S]*add_relation[\s\S]*`why`/i,
      "infer_imports description documents dependency-ingest safety workflow",
    );
    assert.match(
      inferImports?.inputSchema?.properties?.maxFiles?.description ?? "",
      /default 5000[\s\S]*max 50000[\s\S]*avoid pathological monorepos/i,
      "infer_imports maxFiles schema documents hard stop",
    );
    assert.match(inferImports?.description ?? "", /tsconfig\.json compilerOptions\.paths aliases first/);
    assert.match(inferImports?.description ?? "", /fallback common @\/\* aliases/);
    assert.match(inferImports?.description ?? "", /resolved to internal files/);
    assert.match(inferImports?.description ?? "", /alias-not-found/);
    assert.doesNotMatch(inferImports?.description ?? "", /aliases \(@\/\) → external \(not resolved\)/);
    const inspectArchitecture = findTool("inspect_architecture");
    const architectureProfileSchema = inspectArchitecture?.outputSchema?.properties?.profile;
    const architectureConformanceSchema = inspectArchitecture?.outputSchema?.properties?.conformance;
    assert.deepEqual(
      architectureProfileSchema?.properties?.dependencyUsages?.items?.enum,
      ["value", "type_only"],
    );
    assert.ok(architectureProfileSchema?.required?.includes("dependencyUsages"));
    assert.ok(architectureConformanceSchema?.required?.includes("excludedByUsage"));
    assert.deepEqual(
      architectureConformanceSchema?.properties?.observedRoleEdges?.items?.properties?.importUsageCounts?.required,
      ["value", "type_only", "unknown"],
    );
    assert.deepEqual(
      architectureConformanceSchema?.properties?.observedRoleEdges?.items?.properties?.evidence?.items?.properties?.importUsage?.enum,
      ["value", "type_only", "unknown"],
    );
    assert.deepEqual(
      architectureConformanceSchema?.properties?.violations?.items?.properties?.importUsage?.enum,
      ["value", "type_only"],
    );
    assert.ok(
      architectureConformanceSchema?.properties?.unknown?.required?.includes("unknownImportUsages"),
    );
    assert.match(
      inspectArchitecture?.description ?? "",
      /which known import usages those rules govern[\s\S]*usage-qualified receipts[\s\S]*unclassified import usage/i,
    );
    const listKinds = findTool("list_kinds");
    assert.match(
      listKinds?.description ?? "",
      /Vault kind distribution[\s\S]*quick census[\s\S]*size up the vault without paging through list_concepts/i,
      "list_kinds description documents census workflow",
    );
    assert.equal(listKinds?.outputSchema?.type, "object");
    assert.deepEqual(listKinds?.outputSchema?.required, ["total", "byKind"]);
    assert.equal(listKinds?.outputSchema?.additionalProperties, false);
    assert.equal(listKinds?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.total?.minimum, 0);
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.type, "object");
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.additionalProperties?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.additionalProperties?.minimum, 0);
    const validateVault = findTool("validate_vault");
    assert.match(
      validateVault?.description ?? "",
      /validate every doc in the vault[\s\S]*per-doc \+ per-code aggregate[\s\S]*side effect 0[\s\S]*first-contact before writes[\s\S]*before \/ after a batch write/i,
      "validate_vault description documents first-contact health workflow",
    );
    assert.equal(validateVault?.outputSchema?.type, "object");
    assert.deepEqual(validateVault?.outputSchema?.required, ["scanned", "problems", "summary", "pathDrift"]);
    assert.equal(validateVault?.outputSchema?.additionalProperties, false);
    assert.equal(validateVault?.outputSchema?.properties?.scanned?.type, "integer");
    assert.equal(validateVault?.outputSchema?.properties?.problems?.type, "array");
    assert.equal(validateVault?.outputSchema?.properties?.problems?.items?.additionalProperties, false);
    assert.deepEqual(validateVault?.outputSchema?.properties?.problems?.items?.properties?.issues?.items?.properties?.code?.enum, VAULT_ISSUE_CODE_VALUES);
    assert.equal(validateVault?.outputSchema?.properties?.problems?.items?.properties?.issues?.items?.additionalProperties, false);
    assert.equal(validateVault?.outputSchema?.properties?.summary?.additionalProperties, false);
    assert.deepEqual(validateVault?.outputSchema?.properties?.summary?.properties?.byCode?.propertyNames?.enum, VAULT_ISSUE_CODE_VALUES);
    assert.equal(validateVault?.outputSchema?.properties?.summary?.properties?.byCode?.additionalProperties?.additionalProperties, false);
    assert.equal(validateVault?.outputSchema?.properties?.summary?.properties?.byCode?.additionalProperties?.properties?.files?.items?.type, "string");
    const addConcepts = findTool("add_concepts");
    assert.equal(addConcepts?.outputSchema?.type, "object");
    assert.deepEqual(addConcepts?.outputSchema?.required, ["concepts"]);
    assert.equal(addConcepts?.outputSchema?.additionalProperties, false);
    assert.deepEqual(addConcepts?.outputSchema?.properties?.concepts?.items?.required, ["slug", "ok"]);
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.additionalProperties, false);
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.ok?.type, "boolean");
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.warnings?.items?.type, "string");
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.receivedValue?.type, "string");
    assert.equal(addConcepts?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const addConcept = findTool("add_concept");
    assert.equal(addConcept?.outputSchema?.type, "object");
    assert.deepEqual(addConcept?.outputSchema?.required, ["ok", "slug", "filePath", "changed"]);
    assert.equal(addConcept?.outputSchema?.additionalProperties, false);
    assert.equal(addConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(addConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.filePath?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(addConcept?.outputSchema?.properties?.warnings?.items?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const addRelations = findTool("add_relations");
    assert.equal(addRelations?.outputSchema?.type, "object");
    assert.deepEqual(addRelations?.outputSchema?.required, ["relations"]);
    assert.equal(addRelations?.outputSchema?.additionalProperties, false);
    assert.deepEqual(addRelations?.outputSchema?.properties?.relations?.items?.required, ["ok", "from", "to", "type"]);
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.additionalProperties, false);
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.ok?.type, "boolean");
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.alreadyExists?.type, "boolean");
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.receivedValue?.type, "string");
    assert.equal(addRelations?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    assert.equal(addRelations?.inputSchema?.properties?.relations?.items?.properties?.why?.type, "string");
    assert.equal(addRelations?.inputSchema?.properties?.relations?.items?.properties?.why?.maxLength, 300);
    const addRelation = findTool("add_relation");
    assert.equal(addRelation?.outputSchema?.type, "object");
    assert.deepEqual(addRelation?.outputSchema?.required, ["ok", "from", "to", "type"]);
    assert.equal(addRelation?.outputSchema?.additionalProperties, false);
    assert.equal(addRelation?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(addRelation?.outputSchema?.properties?.from?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.to?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.type?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.alreadyExists?.type, "boolean");
    assert.equal(addRelation?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const patchConcept = findTool("patch_concept");
    assert.equal(patchConcept?.outputSchema?.type, "object");
    assert.deepEqual(patchConcept?.outputSchema?.required, ["ok", "slug", "filePath", "changed", "postWriteMaintenance"]);
    assert.equal(patchConcept?.outputSchema?.additionalProperties, false);
    assert.equal(patchConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(patchConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(patchConcept?.outputSchema?.properties?.filePath?.type, "string");
    assert.equal(patchConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(patchConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const renameConcept = findTool("rename_concept");
    assert.equal(renameConcept?.outputSchema?.type, "object");
    assert.deepEqual(renameConcept?.outputSchema?.required, [
      "ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons",
      "uid", "oldSlug", "newSlug", "sourcePath", "targetPath", "moved", "backlinkUpdates",
    ]);
    assert.equal(renameConcept?.outputSchema?.additionalProperties, false);
    assert.equal(renameConcept?.outputSchema?.properties?.oldSlug?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.newSlug?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.sourcePath?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.targetPath?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.message?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(renameConcept?.outputSchema?.properties?.dryRun?.type, "boolean");
    assert.equal(renameConcept?.outputSchema?.properties?.moved?.type, "boolean");
    assert.equal(renameConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(renameConcept?.outputSchema?.properties?.backlinkUpdates?.type, "object");
    assert.deepEqual(renameConcept?.outputSchema?.properties?.backlinkUpdates?.required, ["updates", "totalUpdated"]);
    assert.equal(renameConcept?.outputSchema?.properties?.backlinkUpdates?.additionalProperties, false);
    const renameBacklinkUpdate =
      renameConcept?.outputSchema?.properties?.backlinkUpdates?.properties?.updates?.items;
    assert.deepEqual(renameBacklinkUpdate?.required, ["slug", "title", "beforeKeys", "afterKeys", "bodyChanged"]);
    assert.equal(renameBacklinkUpdate?.additionalProperties, false);
    assertCleanStringSchema(renameBacklinkUpdate?.properties?.slug, "rename backlink update slug");
    assertCleanStringSchema(renameBacklinkUpdate?.properties?.title, "rename backlink update title");
    const renameBacklinkKeyChange = renameBacklinkUpdate?.properties?.beforeKeys?.items;
    assert.deepEqual(renameBacklinkKeyChange?.required, ["key"]);
    assert.equal(renameBacklinkKeyChange?.additionalProperties, false);
    assertCleanStringSchema(renameBacklinkKeyChange?.properties?.key, "rename backlink key-change key");
    assertCleanBacklinkValueSchema(renameBacklinkKeyChange?.properties?.before, "rename backlink key-change before");
    assertCleanBacklinkValueSchema(renameBacklinkKeyChange?.properties?.after, "rename backlink key-change after");
    assert.equal(renameConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const mergeConcepts = findTool("merge_concepts");
    assert.equal(mergeConcepts?.outputSchema?.type, "object");
    assert.deepEqual(mergeConcepts?.outputSchema?.required, [
      "ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons",
      "fromUid", "intoUid", "absorbedUids", "fromSlug", "intoSlug", "fromPath", "deleted", "backlinkUpdates", "capturedFrom",
    ]);
    assert.equal(mergeConcepts?.outputSchema?.additionalProperties, false);
    assert.equal(mergeConcepts?.outputSchema?.properties?.fromSlug?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.intoSlug?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.fromPath?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.message?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(mergeConcepts?.outputSchema?.properties?.dryRun?.type, "boolean");
    assert.equal(mergeConcepts?.outputSchema?.properties?.deleted?.type, "boolean");
    assert.equal(mergeConcepts?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(mergeConcepts?.outputSchema?.properties?.backlinkUpdates?.type, "object");
    assert.equal(mergeConcepts?.outputSchema?.properties?.capturedFrom?.type, "object");
    assert.deepEqual(mergeConcepts?.outputSchema?.properties?.capturedFrom?.required, ["frontmatter"]);
    assert.equal(mergeConcepts?.outputSchema?.properties?.capturedFrom?.additionalProperties, false);
    assert.equal(mergeConcepts?.outputSchema?.properties?.capturedFrom?.properties?.bodyExcerpt?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.capturedFrom?.properties?.body?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const deleteConcept = findTool("delete_concept");
    assert.equal(deleteConcept?.outputSchema?.type, "object");
    assert.deepEqual(deleteConcept?.outputSchema?.required, [
      "ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons", "uid", "slug", "filePath",
    ]);
    assert.equal(deleteConcept?.outputSchema?.additionalProperties, false);
    assertCleanStringSchema(deleteConcept?.outputSchema?.properties?.slug, "delete slug");
    assertCleanStringSchema(deleteConcept?.outputSchema?.properties?.filePath, "delete filePath");
    assertCleanStringSchema(deleteConcept?.outputSchema?.properties?.message, "delete message");
    assert.equal(deleteConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(deleteConcept?.outputSchema?.properties?.dryRun?.type, "boolean");
    assert.equal(deleteConcept?.outputSchema?.properties?.forced?.type, "boolean");
    assert.equal(deleteConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(deleteConcept?.outputSchema?.properties?.backlinks?.items?.type, "object");
    assert.equal(deleteConcept?.outputSchema?.properties?.backlinksAtDelete?.items?.type, "object");
    assert.deepEqual(deleteConcept?.outputSchema?.properties?.backlinks?.items?.required, ["uid", "slug", "kind", "title", "mtime"]);
    assert.equal(deleteConcept?.outputSchema?.properties?.backlinks?.items?.additionalProperties, false);
    const deleteBacklinkRow = deleteConcept?.outputSchema?.properties?.backlinksAtDelete?.items;
    assert.equal(deleteBacklinkRow?.properties?.uid?.pattern, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.slug, "delete backlink slug");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.kind, "delete backlink kind");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.title, "delete backlink title");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.domain, "delete backlink domain");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.matchedKeys?.items, "delete backlink matchedKeys item");
    assert.equal(deleteBacklinkRow?.properties?.matchedInBody?.type, "boolean");
    assert.equal(deleteConcept?.outputSchema?.properties?.captured?.type, "object");
    assert.deepEqual(deleteConcept?.outputSchema?.properties?.captured?.required, ["frontmatter"]);
    assert.equal(deleteConcept?.outputSchema?.properties?.captured?.additionalProperties, false);
    assert.equal(deleteConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const destructivePreviewTools = [
      "remove_relation",
      "replace_relation",
      "rename_concept",
      "reclassify_concept",
      "merge_concepts",
      "delete_concept",
      "absorb_document",
      "git_snapshot",
    ];
    for (const name of destructivePreviewTools) {
      const schema = findTool(name)?.outputSchema;
      for (const requiredField of ["previewReady", "canConfirm", "wouldChange", "blockedReasons"]) {
        assert.ok(schema?.required?.includes(requiredField), `${name} requires ${requiredField}`);
      }
      assert.equal(schema?.properties?.previewReady?.type, "boolean", `${name} previewReady schema`);
      assert.equal(schema?.properties?.canConfirm?.type, "boolean", `${name} canConfirm schema`);
      assert.equal(schema?.properties?.wouldChange?.type, "boolean", `${name} wouldChange schema`);
      assert.equal(schema?.properties?.blockedReasons?.type, "array", `${name} blockedReasons schema`);
      assert.equal(schema?.properties?.blockedReasons?.items?.type, "string", `${name} blocker item schema`);
    }
    const absorbDocument = findTool("absorb_document");
    assert.equal(absorbDocument?.inputSchema?.properties?.allowOutsideRepo?.type, "boolean");
    assert.equal(absorbDocument?.outputSchema?.properties?.outsideRepo?.type, "boolean");
    const findDesc = (name) => findTool(name)?.description;
    const getC = findDesc("get_concept");
    const getCs = findDesc("get_concepts");
    const findN = findDesc("find_neighbors");
    const compile = findDesc("compile_ontology");
    const query = findDesc("query_ontology");
    const validate = findDesc("validate_vault");
    const addC = findDesc("add_concept");
    const addCs = findDesc("add_concepts");
    const addR = findDesc("add_relation");
    const addRs = findDesc("add_relations");
    assert.ok(getC && /get_concepts/.test(getC), "get_concept → get_concepts hint");
    assert.ok(
      getCs && /Missing or invalid slug rows return/.test(getCs) && /later valid slugs still resolve/.test(getCs),
      "get_concepts partial-row recovery hint",
    );
    assert.ok(findN && /one-hop graph neighborhood/i.test(findN), "find_neighbors graph hint");
    assert.ok(compile && /deterministic graph artifact/i.test(compile), "compile_ontology compiler hint");
    assert.ok(query && /graph-engine queries/i.test(query), "query_ontology engine hint");
    assert.ok(query && /cursor\.found=true/.test(query), "query_ontology ready cursor found hint");
    assert.ok(query && /cursor\.reason=null/.test(query), "query_ontology ready cursor reason hint");
    assert.ok(query && /nextAfterActionId/.test(query), "query_ontology cursor nextAfterActionId hint");
    assert.ok(query && /hasMore/.test(query), "query_ontology cursor hasMore hint");
    assert.ok(
      validate && /first-contact before writes/i.test(validate),
      "validate_vault first-contact before writes hint",
    );
    assert.ok(addC && /add_concepts/.test(addC), "add_concept → add_concepts hint");
    assert.match(
      addCs ?? "",
      /Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`/,
      "add_concepts invalid-only batches are visibly non-writing",
    );
    assert.ok(addR && /add_relations/.test(addR), "add_relation → add_relations hint");
    assert.match(
      addR ?? "",
      /Invalid relation `type`[\s\S]*no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata/,
      "add_relation invalid-type preflight is visibly non-writing",
    );
    assert.match(
      addRs ?? "",
      /Invalid-only batches return no row-level `changed` \/ `alreadyExists` write metadata and no top-level `postWriteMaintenance`/,
      "add_relations invalid-only batches are visibly non-writing",
    );
    for (const toolName of [
      "add_concept",
      "add_concepts",
      "add_relation",
      "add_relations",
      "patch_concept",
      "rename_concept",
      "merge_concepts",
      "delete_concept",
    ]) {
      const description = findTool(toolName)?.description ?? "";
      assert.match(description, /postWriteMaintenance/, `${toolName} describes post-write maintenance`);
      assert.match(description, /score/, `${toolName} describes maintenance action score`);
      assert.match(description, /proposedAction/, `${toolName} describes executable proposedAction`);
      assert.match(description, /nextExecutableAction/, `${toolName} describes next executable action pointer`);
      assert.match(description, /nextReviewAction/, `${toolName} describes next review action pointer`);
      assert.match(description, /byPhase/, `${toolName} describes maintenance phase buckets`);
      assert.match(description, /bySeverity/, `${toolName} describes maintenance severity buckets`);
      assert.match(description, /byKind/, `${toolName} describes maintenance kind buckets`);
      const postWriteSchema = findTool(toolName)?.outputSchema?.properties?.postWriteMaintenance;
      assert.equal(postWriteSchema?.properties?.byPhase?.additionalProperties?.type, "integer", `${toolName} exposes byPhase bucket schema`);
      assert.equal(postWriteSchema?.properties?.bySeverity?.additionalProperties?.type, "integer", `${toolName} exposes bySeverity bucket schema`);
      assert.equal(postWriteSchema?.properties?.byKind?.additionalProperties?.type, "integer", `${toolName} exposes byKind bucket schema`);
      assert.deepEqual(
        postWriteSchema?.required,
        [
          "operation",
          "sideEffect",
          "graphHash",
          "summary",
          "filters",
          "cursor",
          "byPhase",
          "bySeverity",
          "byKind",
          "limited",
          "nextExecutableAction",
          "nextReviewAction",
          "actions",
        ],
        `${toolName} exposes complete post-write maintenance required fields`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.summary?.required,
        [
          "totalActions",
          "filteredActions",
          "remainingActions",
          "executableActions",
          "reviewActions",
          "compileIssues",
          "dependencyCycles",
          "canonicalizationActions",
          "danglingReferences",
          "relationRecommendations",
          "externalElementRefs",
          "externalElementRefsIgnored",
          "unassignedNodes",
          "emptyDomains",
        ],
        `${toolName} exposes full compact summary schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.filters?.required,
        ["executableOnly", "phases", "severities", "kinds"],
        `${toolName} exposes maintenance filter schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.filters?.properties?.phases?.items?.enum,
        ["validate", "repair", "link", "materialize", "review"],
        `${toolName} exposes maintenance phase filter enum`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.cursor?.required,
        ["afterActionId", "found", "reason", "startIndex", "nextAfterActionId", "hasMore"],
        `${toolName} exposes maintenance cursor schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.required,
        ["id", "phase", "kind", "severity", "score", "executable", "reason", "proposedAction"],
        `${toolName} exposes compact action row schema`,
      );
      assert.equal(postWriteSchema?.additionalProperties, false, `${toolName} closes postWriteMaintenance schema`);
      assert.equal(postWriteSchema?.properties?.summary?.additionalProperties, false, `${toolName} closes summary schema`);
      assert.equal(postWriteSchema?.properties?.filters?.additionalProperties, false, `${toolName} closes filters schema`);
      assert.equal(postWriteSchema?.properties?.cursor?.additionalProperties, false, `${toolName} closes cursor schema`);
      assert.equal(postWriteSchema?.properties?.actions?.items?.additionalProperties, false, `${toolName} closes action row schema`);
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.proposedAction?.required,
        ["tool", "args"],
        `${toolName} exposes executable proposedAction call schema`,
      );
      assert.equal(
        postWriteSchema?.properties?.actions?.items?.properties?.proposedAction?.additionalProperties,
        false,
        `${toolName} closes executable proposedAction schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.proposedAction?.properties?.tool?.enum,
        ["add_concept", "add_relation", "patch_concept"],
        `${toolName} exposes proposedAction tool enum`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.proposedAction?.properties?.args?.oneOf?.map((schema) => schema.required),
        [
          ["slug", "kind", "title"],
          ["from", "to", "type"],
          ["slug", "frontmatter", "expected_mtime"],
        ],
        `${toolName} exposes proposedAction args variants`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.proposedAction?.properties?.args?.oneOf?.[1]?.properties?.type?.enum,
        ["depends_on", "relates", "contains", "describes", "domains", "capabilities", "elements", "domain"],
        `${toolName} exposes add_relation proposedAction relation enum`,
      );
      assert.equal(postWriteSchema?.properties?.actions?.items?.type, "object", `${toolName} exposes non-null action rows`);
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.node?.required,
        ["slug", "kind", "title"],
        `${toolName} exposes compact action node schema`,
      );
      assert.equal(
        postWriteSchema?.properties?.actions?.items?.properties?.node?.additionalProperties,
        false,
        `${toolName} closes compact action node schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.nodes?.type,
        ["array", "object"],
        `${toolName} exposes array or keyed compact action nodes`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.nodes?.items?.required,
        ["slug", "kind", "title"],
        `${toolName} exposes array compact action node rows`,
      );
      assert.equal(
        postWriteSchema?.properties?.actions?.items?.properties?.nodes?.items?.additionalProperties,
        false,
        `${toolName} closes array compact action node rows`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.actions?.items?.properties?.nodes?.additionalProperties?.required,
        ["slug", "kind", "title"],
        `${toolName} exposes keyed compact action node rows`,
      );
      assert.equal(
        postWriteSchema?.properties?.actions?.items?.properties?.nodes?.additionalProperties?.additionalProperties,
        false,
        `${toolName} closes keyed compact action node rows`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextExecutableAction?.type,
        ["object", "null"],
        `${toolName} exposes nullable next executable action`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextExecutableAction?.required,
        ["id", "phase", "kind", "severity", "score", "executable", "reason", "proposedAction"],
        `${toolName} exposes compact next executable action schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextExecutableAction?.properties?.proposedAction?.required,
        ["tool", "args"],
        `${toolName} exposes next executable proposedAction call schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextExecutableAction?.properties?.proposedAction?.properties?.tool?.enum,
        ["add_concept", "add_relation", "patch_concept"],
        `${toolName} exposes next executable proposedAction tool enum`,
      );
      assert.equal(
        postWriteSchema?.properties?.nextExecutableAction?.properties?.proposedAction?.properties?.args?.oneOf?.length,
        3,
        `${toolName} exposes next executable proposedAction args variants`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextReviewAction?.type,
        ["object", "null"],
        `${toolName} exposes nullable next review action`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextReviewAction?.required,
        ["id", "phase", "kind", "severity", "score", "executable", "reason", "proposedAction"],
        `${toolName} exposes compact next review action schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextReviewAction?.properties?.proposedAction?.required,
        ["tool", "args"],
        `${toolName} exposes next review proposedAction call schema`,
      );
      assert.deepEqual(
        postWriteSchema?.properties?.nextReviewAction?.properties?.proposedAction?.properties?.tool?.enum,
        ["add_concept", "add_relation", "patch_concept"],
        `${toolName} exposes next review proposedAction tool enum`,
      );
      assert.equal(
        postWriteSchema?.properties?.nextReviewAction?.properties?.proposedAction?.properties?.args?.oneOf?.length,
        3,
        `${toolName} exposes next review proposedAction args variants`,
      );
    }
    const expectedMtimeTools = [
      "add_relation",
      "patch_concept",
      "rename_concept",
      "merge_concepts",
      "delete_concept",
    ];
    for (const toolName of expectedMtimeTools) {
      const property = findTool(toolName)?.inputSchema?.properties?.expected_mtime;
      assert.equal(property?.type, "number", `${toolName} exposes expected_mtime as a numeric conflict guard`);
      assert.equal(property?.minimum, 0, `${toolName} exposes expected_mtime as non-negative`);
      assert.match(
        property?.description ?? "",
        /conflict|mtime|modified externally|read time/i,
        `${toolName} explains expected_mtime conflict semantics`,
      );
    }

    const mergeTargetMtime = findTool("merge_concepts")?.inputSchema?.properties?.expected_into_mtime;
    assert.equal(
      mergeTargetMtime?.type,
      "number",
      "merge_concepts exposes the survivor mtime as a numeric conflict guard",
    );
    assert.equal(
      mergeTargetMtime?.minimum,
      0,
      "merge_concepts exposes the survivor mtime as non-negative",
    );
    assert.match(
      mergeTargetMtime?.description ?? "",
      /survivor|concurrent|mtime|modified externally/i,
      "merge_concepts explains survivor conflict semantics",
    );

    const relationItemSchema =
      findTool("add_relations")?.inputSchema?.properties?.relations?.items;
    assert.equal(
      relationItemSchema?.properties?.expected_mtime?.type,
      "number",
      "add_relations row schema exposes expected_mtime",
    );
    assert.equal(
      relationItemSchema?.properties?.expected_mtime?.minimum,
      0,
      "add_relations row schema exposes expected_mtime as non-negative",
    );

    for (const toolName of ["rename_concept", "merge_concepts", "delete_concept"]) {
      const confirm = findTool(toolName)?.inputSchema?.properties?.confirm;
      assert.equal(confirm?.type, "boolean", `${toolName} exposes confirm dry-run safety switch`);
      assert.match(confirm?.description ?? "", /dry-run|actually/i);
    }
    const overwrite = findTool("rename_concept")?.inputSchema?.properties?.overwrite;
    assert.equal(
      overwrite?.type,
      "boolean",
      "rename_concept exposes overwrite destructive safety switch",
    );
    assert.match(
      overwrite?.description ?? "",
      /overwrite|existing|exists/i,
      "rename_concept explains overwrite target-file risk",
    );
    const force = findTool("delete_concept")?.inputSchema?.properties?.force;
    assert.equal(
      force?.type,
      "boolean",
      "delete_concept exposes force destructive safety switch",
    );
    assert.match(
      force?.description ?? "",
      /backlinks|dangling|delete/i,
      "delete_concept explains force backlink risk",
    );

    assert.deepEqual(
      {
        type: findTool("list_concepts")?.inputSchema?.properties?.limit?.type,
        minimum: findTool("list_concepts")?.inputSchema?.properties?.limit?.minimum,
        maximum: findTool("list_concepts")?.inputSchema?.properties?.limit?.maximum,
      },
      { type: "integer", minimum: 1, maximum: 500 },
      "list_concepts exposes bounded integer limit schema",
    );
    assert.equal(
      findTool("list_concepts")?.inputSchema?.properties?.since?.minimum,
      0,
      "list_concepts exposes non-negative since schema",
    );
    assert.match(
      findTool("list_concepts")?.inputSchema?.properties?.since?.description ?? "",
      /mtime > since[\s\S]*incremental sync[\s\S]*does not double-fetch/i,
      "list_concepts since schema documents incremental sync semantics",
    );
    assert.match(
      findTool("list_concepts")?.inputSchema?.properties?.summary?.description ?? "",
      /summary[\s\S]*max 200 chars[\s\S]*without N follow-up `get_concept` calls[\s\S]*Default false/i,
      "list_concepts summary schema documents preview and payload tradeoff",
    );
    assert.match(
      findTool("list_concepts")?.inputSchema?.properties?.limit?.description ?? "",
      /Defaults to 100, max 500/,
      "list_concepts limit schema documents default and cap",
    );
    assert.deepEqual(
      {
        type: findTool("find_neighbors")?.inputSchema?.properties?.limit?.type,
        minimum: findTool("find_neighbors")?.inputSchema?.properties?.limit?.minimum,
        maximum: findTool("find_neighbors")?.inputSchema?.properties?.limit?.maximum,
      },
      { type: "integer", minimum: 1, maximum: 500 },
      "find_neighbors exposes bounded integer limit schema",
    );
    assert.match(
      findTool("find_neighbors")?.inputSchema?.properties?.direction?.description ?? "",
      /Defaults to both/,
      "find_neighbors direction schema documents the default",
    );
    assert.match(
      findTool("find_neighbors")?.inputSchema?.properties?.types?.description ?? "",
      /Public add_relation types are normalized to stored graph keys/,
      "find_neighbors types schema documents public alias normalization",
    );
    assert.deepEqual(
      findTool("find_neighbors")?.inputSchema?.properties?.types?.items?.enum,
      RELATION_TYPE_VALUES,
      "find_neighbors types schema exposes relation type enum",
    );
    assert.match(
      findTool("find_neighbors")?.inputSchema?.properties?.includeNodes?.description ?? "",
      /true \(default\)|default.*true/i,
      "find_neighbors includeNodes schema documents the default",
    );
    assert.match(
      findTool("find_neighbors")?.inputSchema?.properties?.limit?.description ?? "",
      /Defaults to 100, max 500/,
      "find_neighbors limit schema documents default and cap",
    );
    assert.deepEqual(
      {
        kindEnum: findTool("find_orphans")?.inputSchema?.properties?.kind?.enum,
        excludeKindsEnum: findTool("find_orphans")?.inputSchema?.properties?.excludeKinds?.items?.enum,
      },
      {
        kindEnum: NODE_KIND_VALUES,
        excludeKindsEnum: NODE_KIND_VALUES,
      },
      "find_orphans exposes node kind enums for direct filters",
    );
    assert.deepEqual(
      {
        type: findTool("find_path")?.inputSchema?.properties?.maxHops?.type,
        minimum: findTool("find_path")?.inputSchema?.properties?.maxHops?.minimum,
        maximum: findTool("find_path")?.inputSchema?.properties?.maxHops?.maximum,
      },
      { type: "integer", minimum: 0, maximum: 20 },
      "find_path exposes bounded integer maxHops schema",
    );
    assert.match(
      findTool("find_path")?.inputSchema?.properties?.maxHops?.description ?? "",
      /default 5, max 20/i,
      "find_path maxHops schema documents default and cap",
    );
    assert.deepEqual(
      {
        nodesLimitType: findTool("compile_ontology")?.inputSchema?.properties?.nodesLimit?.type,
        nodesLimitMinimum: findTool("compile_ontology")?.inputSchema?.properties?.nodesLimit?.minimum,
        nodesLimitMaximum: findTool("compile_ontology")?.inputSchema?.properties?.nodesLimit?.maximum,
        type: findTool("compile_ontology")?.inputSchema?.properties?.nodesOffset?.type,
        minimum: findTool("compile_ontology")?.inputSchema?.properties?.nodesOffset?.minimum,
        edgesLimitType: findTool("compile_ontology")?.inputSchema?.properties?.edgesLimit?.type,
        edgesLimitMinimum: findTool("compile_ontology")?.inputSchema?.properties?.edgesLimit?.minimum,
        edgesLimitMaximum: findTool("compile_ontology")?.inputSchema?.properties?.edgesLimit?.maximum,
        edgesOffsetType: findTool("compile_ontology")?.inputSchema?.properties?.edgesOffset?.type,
        edgesOffsetMinimum: findTool("compile_ontology")?.inputSchema?.properties?.edgesOffset?.minimum,
      },
      {
        nodesLimitType: "integer",
        nodesLimitMinimum: 1,
        nodesLimitMaximum: 500,
        type: "integer",
        minimum: 0,
        edgesLimitType: "integer",
        edgesLimitMinimum: 1,
        edgesLimitMaximum: 500,
        edgesOffsetType: "integer",
        edgesOffsetMinimum: 0,
      },
      "compile_ontology exposes advancing pagination schema",
    );
    assert.match(
      findTool("compile_ontology")?.description ?? "",
      /deterministic graph artifact[\s\S]*stable semantic graphHash and maxMtime[\s\S]*Large vaults \(100\+ nodes\) can exceed the MCP token cap[\s\S]*summary: true[\s\S]*nodesLimit\/nodesOffset[\s\S]*edgesLimit\/edgesOffset/i,
      "compile_ontology description documents cache and large-vault guidance",
    );
    assert.match(
      findTool("compile_ontology")?.inputSchema?.properties?.summary?.description ?? "",
      /omit `nodes` \/ `edges` \/ `aliases`[\s\S]*Cheap polling for cache invalidation/i,
      "compile_ontology summary schema documents cheap polling behavior",
    );
    assert.match(
      findTool("compile_ontology")?.inputSchema?.properties?.nodesLimit?.description ?? "",
      /Pair with `nodesOffset` to paginate[\s\S]*max 500/i,
      "compile_ontology nodesLimit schema documents pagination cap",
    );
    assert.deepEqual(
      {
        type: findTool("query_concepts")?.inputSchema?.properties?.limit?.type,
        minimum: findTool("query_concepts")?.inputSchema?.properties?.limit?.minimum,
        maximum: findTool("query_concepts")?.inputSchema?.properties?.limit?.maximum,
      },
      { type: "integer", minimum: 1, maximum: 500 },
      "query_concepts exposes bounded integer limit schema",
    );
    assert.match(
      findTool("query_concepts")?.description ?? "",
      /Typed filter DSL[\s\S]*filter\s*:=\s*atom[\s\S]*predicate\s*:=\s*key=value \| key!=value \| has\(key\)[\s\S]*kind=capability AND domain=auth AND NOT has\(elements\)/i,
      "query_concepts description documents the typed filter grammar",
    );
    assert.match(
      findTool("query_concepts")?.inputSchema?.properties?.filter?.description ?? "",
      /Supports NOT \/ AND \/ OR[\s\S]*Wrap values containing whitespace or special characters/i,
      "query_concepts filter schema documents operators and quoting",
    );
    assert.match(
      findTool("query_concepts")?.inputSchema?.properties?.limit?.description ?? "",
      /Defaults to 100, max 500/,
      "query_concepts limit schema documents default and cap",
    );
    assert.match(
      findTool("query_ontology")?.description ?? "",
      /agent_brief[\s\S]*relationDecisionGuide[\s\S]*read-first write policy/,
      "query_ontology description documents agent_brief relationDecisionGuide",
    );
    assert.match(
      findTool("query_ontology")?.description ?? "",
      /agent_brief[\s\S]*businessOntologyLens[\s\S]*business-first[\s\S]*domain[\s\S]*capability[\s\S]*element/,
      "query_ontology description documents agent_brief business-first ontology lens",
    );
    assert.match(
      findTool("query_ontology")?.description ?? "",
      /agent_brief[\s\S]*detail:\"compact\"[\s\S]*12000 UTF-8 JSON bytes[\s\S]*taskNavigation[\s\S]*never searches the repository[\s\S]*never proves source behavior/,
      "query_ontology description documents the bounded task handoff and evidence limit",
    );
    assert.match(
      findTool("analyze_repo_structure")?.description ?? "",
      /navigation:primary\|supporting\|test:<path>#<symbol>[\s\S]*limits 1\/1\/3[\s\S]*rejects missing, ambiguous, unsafe, or task-inferred coordinates/,
      "analyze_repo_structure documents reviewed navigation evidence without widening meaning proof",
    );
    assert.deepEqual(
      {
        detailEnum: findTool("query_ontology")?.inputSchema?.properties?.detail?.enum,
        taskType: findTool("query_ontology")?.inputSchema?.properties?.task?.type,
        taskMinLength: findTool("query_ontology")?.inputSchema?.properties?.task?.minLength,
        taskMaxLength: findTool("query_ontology")?.inputSchema?.properties?.task?.maxLength,
      },
      {
        detailEnum: ["compact", "full"],
        taskType: "string",
        taskMinLength: 1,
        taskMaxLength: 2000,
      },
      "query_ontology exposes the compact/full and request-local task signature",
    );
    assert.deepEqual(
      {
        type: findTool("query_ontology")?.inputSchema?.properties?.iterations?.type,
        minimum: findTool("query_ontology")?.inputSchema?.properties?.iterations?.minimum,
        maximum: findTool("query_ontology")?.inputSchema?.properties?.iterations?.maximum,
      },
      { type: "integer", minimum: 1, maximum: 100 },
      "query_ontology exposes bounded iterations schema",
    );
    assert.deepEqual(
      {
        type: findTool("query_ontology")?.inputSchema?.properties?.limit?.type,
        minimum: findTool("query_ontology")?.inputSchema?.properties?.limit?.minimum,
        maximum: findTool("query_ontology")?.inputSchema?.properties?.limit?.maximum,
        depthMaximum: findTool("query_ontology")?.inputSchema?.properties?.depth?.maximum,
        maxHopsMaximum: findTool("query_ontology")?.inputSchema?.properties?.maxHops?.maximum,
        nodeLimitDescription:
          findTool("query_ontology")?.inputSchema?.properties?.nodeLimit?.description,
      },
      {
        type: "integer",
        minimum: 1,
        maximum: 500,
        depthMaximum: 20,
        maxHopsMaximum: 20,
        nodeLimitDescription:
          "components/communities/health/workspace_brief/agent_brief only: positive integer max node summaries per component/community group. Defaults to 25 for components/communities and 10 for health, capped at 500.",
      },
      "query_ontology exposes runtime numeric caps in schema",
    );
    assert.deepEqual(
      {
        componentLimitType: findTool("query_ontology")?.inputSchema?.properties?.componentLimit?.type,
        componentLimitMaximum:
          findTool("query_ontology")?.inputSchema?.properties?.componentLimit?.maximum,
        cycleLimitType: findTool("query_ontology")?.inputSchema?.properties?.cycleLimit?.type,
        recommendationLimitType:
          findTool("query_ontology")?.inputSchema?.properties?.recommendationLimit?.type,
        orderLimitType: findTool("query_ontology")?.inputSchema?.properties?.orderLimit?.type,
        dependencyTypesItem:
          findTool("query_ontology")?.inputSchema?.properties?.dependencyTypes?.items?.type,
        dependencyTypesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.dependencyTypes?.items?.enum,
        typesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.types?.items?.enum,
        patternEnum:
          findTool("query_ontology")?.inputSchema?.properties?.pattern?.items?.enum,
        typeEnum:
          findTool("query_ontology")?.inputSchema?.properties?.type?.enum,
        relationEnum:
          findTool("query_ontology")?.inputSchema?.properties?.relation?.enum,
        kindEnum: findTool("query_ontology")?.inputSchema?.properties?.kind?.enum,
        fromKindEnum: findTool("query_ontology")?.inputSchema?.properties?.fromKind?.enum,
        toKindEnum: findTool("query_ontology")?.inputSchema?.properties?.toKind?.enum,
        componentTypesItem:
          findTool("query_ontology")?.inputSchema?.properties?.componentTypes?.items?.type,
        componentTypesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.componentTypes?.items?.enum,
        phasesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.phases?.items?.enum,
        severitiesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.severities?.items?.enum,
        maintenanceKindsEnum:
          findTool("query_ontology")?.inputSchema?.properties?.kinds?.items?.enum,
        kindDescription:
          findTool("query_ontology")?.inputSchema?.properties?.kind?.description,
        fromKindDescription:
          findTool("query_ontology")?.inputSchema?.properties?.fromKind?.description,
        toKindDescription:
          findTool("query_ontology")?.inputSchema?.properties?.toKind?.description,
        afterActionIdDescription:
          findTool("query_ontology")?.inputSchema?.properties?.afterActionId?.description,
        componentTypesDescription:
          findTool("query_ontology")?.inputSchema?.properties?.componentTypes?.description,
      },
      {
        componentLimitType: "integer",
        componentLimitMaximum: 500,
        cycleLimitType: "integer",
        recommendationLimitType: "integer",
        orderLimitType: "integer",
        dependencyTypesItem: "string",
        dependencyTypesEnum: RELATION_TYPE_VALUES,
        typesEnum: RELATION_TYPE_VALUES,
        patternEnum: RELATION_TYPE_VALUES,
        typeEnum: RELATION_TYPE_VALUES,
        relationEnum: RELATION_TYPE_VALUES,
        kindEnum: NODE_KIND_VALUES,
        fromKindEnum: NODE_KIND_VALUES,
        toKindEnum: EDGE_TARGET_KIND_VALUES,
        componentTypesItem: "string",
        componentTypesEnum: RELATION_TYPE_VALUES,
        phasesEnum: MAINTENANCE_PHASE_VALUES,
        severitiesEnum: MAINTENANCE_SEVERITY_VALUES,
        maintenanceKindsEnum: MAINTENANCE_KIND_VALUES,
        kindDescription:
          "match_nodes: optional node kind filter (project, domain, capability, element, document, vault-readme). recommend_relations currently supports capability or element.",
        fromKindDescription:
          "match_edges only: optional source node kind filter (project, domain, capability, element, document, vault-readme). Source must be a real ontology node, not external/unresolved.",
        toKindDescription:
          "match_edges only: optional target kind filter (project, domain, capability, element, document, vault-readme, external, unresolved). Use external or unresolved for non-node refs.",
        afterActionIdDescription:
          "maintenance_plan only: stable action id cursor; return actions after this id. Without afterActionId the ready page reports cursor.found=true and cursor.reason=null; cursor.nextAfterActionId matches the last returned action id (or null for an empty page), and cursor.hasMore matches whether more remaining actions exist after this page. nextExecutableAction/nextReviewAction point only at the first executable/review action in the current returned page and preserve that action id, executable flag, phase, kind, and severity. Bucket totals (byPhase, bySeverity, byKind) match remainingActions for the returned cursor. Unknown cursors return an empty page with cursor.found=false, cursor.reason, zero remaining actions, cursor.nextAfterActionId=null, cursor.hasMore=false, and no next actions.",
        componentTypesDescription:
          "health/workspace_brief/agent_brief only: relation types used for connected-component checks. Defaults to the full graph relation set.",
      },
      "query_ontology exposes health/workspace_brief/agent_brief tuning controls",
    );
    assert.deepEqual(
      {
        minDegreeType: findTool("query_ontology")?.inputSchema?.properties?.minDegree?.type,
        minDegreeMinimum: findTool("query_ontology")?.inputSchema?.properties?.minDegree?.minimum,
        maxDegreeType: findTool("query_ontology")?.inputSchema?.properties?.maxDegree?.type,
        maxDegreeMinimum: findTool("query_ontology")?.inputSchema?.properties?.maxDegree?.minimum,
        minInDegreeType: findTool("query_ontology")?.inputSchema?.properties?.minInDegree?.type,
        minInDegreeMinimum:
          findTool("query_ontology")?.inputSchema?.properties?.minInDegree?.minimum,
        minOutDegreeType: findTool("query_ontology")?.inputSchema?.properties?.minOutDegree?.type,
        minOutDegreeMinimum:
          findTool("query_ontology")?.inputSchema?.properties?.minOutDegree?.minimum,
      },
      {
        minDegreeType: "integer",
        minDegreeMinimum: 0,
        maxDegreeType: "integer",
        maxDegreeMinimum: 0,
        minInDegreeType: "integer",
        minInDegreeMinimum: 0,
        minOutDegreeType: "integer",
        minOutDegreeMinimum: 0,
      },
      "query_ontology exposes integer match_nodes degree filters",
    );
    assert.deepEqual(
      {
        maxDepthType: findTool("analyze_repo_structure")?.inputSchema?.properties?.maxDepth?.type,
        maxDepthMinimum:
          findTool("analyze_repo_structure")?.inputSchema?.properties?.maxDepth?.minimum,
        maxDepthMaximum:
          findTool("analyze_repo_structure")?.inputSchema?.properties?.maxDepth?.maximum,
        maxFilesType: findTool("infer_imports")?.inputSchema?.properties?.maxFiles?.type,
        maxFilesMinimum: findTool("infer_imports")?.inputSchema?.properties?.maxFiles?.minimum,
        maxFilesMaximum: findTool("infer_imports")?.inputSchema?.properties?.maxFiles?.maximum,
      },
      {
        maxDepthType: "integer",
        maxDepthMinimum: 0,
        maxDepthMaximum: 10,
        maxFilesType: "integer",
        maxFilesMinimum: 1,
        maxFilesMaximum: 50000,
      },
      "analysis tools expose bounded numeric scan controls",
    );
    assert.deepEqual(
      findTool("query_ontology")?.inputSchema?.required,
      ["operation"],
      "query_ontology exposes operation as the required dispatch key",
    );
    assert.deepEqual(
      findTool("query_ontology")?.inputSchema?.properties?.operation?.enum,
      [
        "neighbors",
        "path",
        "all_paths",
        "query_plan",
        "centrality",
        "communities",
        "similar_nodes",
        "explain_relation",
        "reachability",
        "pattern_walk",
        "impact",
        "blast_radius",
        "subgraph",
        "builder_context",
        "overview",
        "schema",
        "facets",
        "match_nodes",
        "match_edges",
        "node_profile",
        "domain_profile",
        "domain_matrix",
        "project_scope",
        "project_map",
        "relation_check",
        "components",
        "lineage",
        "containment_tree",
        "cycles",
        "topological_order",
        "recommend_relations",
        "growth_plan",
        "maintenance_plan",
        "agent_brief",
        "meaning_repair_review",
        "workspace_brief",
        "health",
      ],
      "query_ontology exposes runtime operation enum",
    );
    assert.deepEqual(
      findTool("query_ontology")?.inputSchema?.properties?.targetOperation?.enum,
      [
        "neighbors",
        "path",
        "all_paths",
        "centrality",
        "communities",
        "similar_nodes",
        "explain_relation",
        "reachability",
        "pattern_walk",
        "impact",
        "blast_radius",
        "subgraph",
        "builder_context",
        "overview",
        "schema",
        "facets",
        "match_nodes",
        "match_edges",
        "node_profile",
        "domain_profile",
        "domain_matrix",
        "project_scope",
        "project_map",
        "relation_check",
        "components",
        "lineage",
        "containment_tree",
        "cycles",
        "topological_order",
        "recommend_relations",
        "growth_plan",
        "maintenance_plan",
        "agent_brief",
        "workspace_brief",
        "health",
      ],
      "query_ontology exposes query_plan targetOperation enum",
    );
    for (const [toolName, propertyName] of [
      ["list_concepts", "kind"],
      ["list_concepts", "domain"],
      ["get_concept", "slug"],
      ["find_evidence", "title"],
      ["add_concept", "slug"],
      ["add_concept", "kind"],
      ["add_concept", "title"],
      ["add_concept", "domain"],
      ["add_relation", "from"],
      ["add_relation", "to"],
      ["add_relation", "type"],
      ["patch_concept", "slug"],
      ["find_backlinks", "slug"],
      ["find_neighbors", "slug"],
      ["find_path", "from"],
      ["find_path", "to"],
      ["rename_concept", "oldSlug"],
      ["rename_concept", "newSlug"],
      ["merge_concepts", "fromSlug"],
      ["merge_concepts", "intoSlug"],
      ["delete_concept", "slug"],
      ["find_orphans", "kind"],
      ["query_concepts", "filter"],
      ["query_ontology", "slug"],
      ["query_ontology", "targetOperation"],
      ["query_ontology", "afterActionId"],
      ["analyze_repo_structure", "rootPath"],
      ["infer_imports", "rootPath"],
    ]) {
      const property = findTool(toolName)?.inputSchema?.properties?.[propertyName];
      assert.equal(property?.type, "string", `${toolName}.${propertyName} exposes string schema`);
      assert.equal(property?.minLength, 1, `${toolName}.${propertyName} exposes minLength`);
      assert.match(
        property?.pattern ?? "",
        /\\s/,
        `${toolName}.${propertyName} exposes whitespace guard pattern`,
      );
    }
    assert.deepEqual(
      {
        type: findTool("get_concepts")?.inputSchema?.properties?.slugs?.type,
        maxItems: findTool("get_concepts")?.inputSchema?.properties?.slugs?.maxItems,
        itemType: findTool("get_concepts")?.inputSchema?.properties?.slugs?.items?.type,
        itemMinLength: findTool("get_concepts")?.inputSchema?.properties?.slugs?.items?.minLength,
      },
      { type: "array", maxItems: 50, itemType: "string", itemMinLength: 1 },
      "get_concepts exposes batch maxItems schema",
    );
    assert.match(
      findTool("get_concepts")?.inputSchema?.properties?.slugs?.description ?? "",
      /unique tail slugs[\s\S]*frontmatter `slug` aliases[\s\S]*Max 50 per call/i,
      "get_concepts slugs schema documents alias forms and cap",
    );
    assert.deepEqual(
      findTool("get_concepts")?.inputSchema?.properties?.body?.enum,
      ["excerpt", "full"],
      "get_concepts exposes the same body delivery modes as get_concept",
    );
    assert.deepEqual(
      {
        slugMinLength:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.properties?.slug?.minLength,
        kindMinLength:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.properties?.kind?.minLength,
        titleMinLength:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.properties?.title?.minLength,
        capabilityItemMinLength:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.properties?.capabilities?.items?.minLength,
        relationFromMinLength:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.from?.minLength,
        relationToMinLength:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.to?.minLength,
        relationTypeMinLength:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.type?.minLength,
        relationTypeEnum:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.type?.enum,
        addRelationTypeEnum:
          findTool("add_relation")?.inputSchema?.properties?.type?.enum,
        analyzeIgnoreItemMinLength:
          findTool("analyze_repo_structure")?.inputSchema?.properties?.ignore?.items?.minLength,
        inferSourceItemMinLength:
          findTool("infer_imports")?.inputSchema?.properties?.sourceFolders?.items?.minLength,
        inferIgnoreItemMinLength:
          findTool("infer_imports")?.inputSchema?.properties?.ignore?.items?.minLength,
      },
      {
        slugMinLength: 1,
        kindMinLength: 1,
        titleMinLength: 1,
        capabilityItemMinLength: 1,
        relationFromMinLength: 1,
        relationToMinLength: 1,
        relationTypeMinLength: 1,
        relationTypeEnum: WRITE_RELATION_TYPE_VALUES,
        addRelationTypeEnum: WRITE_RELATION_TYPE_VALUES,
        analyzeIgnoreItemMinLength: 1,
        inferSourceItemMinLength: 1,
        inferIgnoreItemMinLength: 1,
      },
      "batch write and analysis array schemas expose strict string hints",
    );
    assert.deepEqual(
      {
        type: findTool("add_concepts")?.inputSchema?.properties?.concepts?.type,
        maxItems: findTool("add_concepts")?.inputSchema?.properties?.concepts?.maxItems,
        itemType: findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.type,
        itemAdditionalProperties:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.additionalProperties,
      },
      { type: "array", maxItems: 50, itemType: "object", itemAdditionalProperties: false },
      "add_concepts exposes batch maxItems schema",
    );
    assert.deepEqual(
      {
        type: findTool("add_relations")?.inputSchema?.properties?.relations?.type,
        maxItems: findTool("add_relations")?.inputSchema?.properties?.relations?.maxItems,
        itemType: findTool("add_relations")?.inputSchema?.properties?.relations?.items?.type,
        itemAdditionalProperties:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.additionalProperties,
      },
      { type: "array", maxItems: 50, itemType: "object", itemAdditionalProperties: false },
      "add_relations exposes batch maxItems schema",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("initialize — instructions 필드 (#45) AI agent 안내 노출", async () => {
  // The initialize response must carry instructions, so a connected agent knows
  // the authorable/reserved kind boundary, the call order, and the write tools'
  // dry-run pattern immediately. Without them, agents relearn all of it by trial
  // and error every session.
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, INIT_REQUESTS);
    const init = responses.find((r) => r.id === 1);
    assert.ok(init, "initialize 응답이 와야 함");
    const instructions = init.result?.instructions;
    assert.equal(typeof instructions, "string", "instructions 가 string 이어야");
    assert.ok(
      instructions.length > 200,
      `instructions 가 의미 있는 길이여야 (got ${instructions.length})`,
    );
    // Core keywords — drift breaks this at once
    assert.match(instructions, /five authorable kinds/i);
    assert.match(instructions, /vault-readme.*reserved reader kind/i);
    assert.match(instructions, /dry-run|confirm/i);
    assert.match(instructions, /expected_mtime/i);
    assert.match(instructions, /overwrite: true/);
    assert.match(instructions, /existing `newSlug`/);
    assert.match(instructions, /force: true/);
    assert.match(instructions, /dangling referrers/);
    for (const toolName of EXPECTED_TOOLS) {
      assert.match(instructions, new RegExp(`\\b${toolName}\\b`), `instructions mention ${toolName}`);
    }
    // The instructions must state that the batch tools are the default path, so
    // agents reach for one batch call instead of K per-row round trips. Blocks a
    // regression to stale guidance.
    assert.match(instructions, /add_concepts/);
    assert.match(instructions, /add_relations/);
    assert.match(instructions, /non-object row/);
    assert.match(instructions, /unknown row field/);
    assert.match(instructions, /ok: false/);
    assert.match(instructions, /Invalid-only batches return no row-level write metadata/);
    assert.match(instructions, /Invalid-only batches return no row-level `changed` \/ `alreadyExists` write metadata/);
    assert.match(instructions, /dry validation evidence/);
    assert.match(instructions, /get_concepts/);
    assert.match(instructions, /find_neighbors/);
    assert.match(instructions, /compile_ontology/);
    assert.match(instructions, /query_ontology/);
    assert.match(instructions, /validate_vault/);
    // Cold-start meaning extraction must fail closed instead of promoting
    // repository structure directly into accepted business concepts.
    assert.match(instructions, /semanticEvidence/);
    assert.match(instructions, /extractionContract/);
    assert.match(instructions, /observed facts, proposed meanings, and persisted shared concepts/);
    assert.match(instructions, /non-circular definition/);
    assert.match(instructions, /includes\/excludes boundary/);
    assert.match(instructions, /unsupported assertions/);
    assert.match(instructions, /implementation-name leakage/);
    assert.match(instructions, /Unknown is a valid result/);
    assert.match(instructions, /obtain explicit user approval/);
    assert.match(instructions, /read-only first-contact diagnosis/);
    assert.match(instructions, /operation:'agent_brief'/);
    assert.match(instructions, /Claude Code\/Codex handoff/);
    assert.match(instructions, /write guardrails/);
    assert.match(instructions, /relationDecisionGuide/);
    assert.match(instructions, /skip_existing/);
    assert.match(instructions, /review_inverse/);
    assert.match(instructions, /safe_to_add/);
    assert.match(instructions, /review_new_schema/);
    assert.match(instructions, /preflight_relation/);
    assert.match(instructions, /preflight_rename/);
    assert.match(instructions, /post_change_sync/);
    assert.match(instructions, /workspace_brief/);
    assert.match(instructions, /operation:'overview'/);
    assert.match(
      instructions,
      new RegExp(
        `operation:${QUERY_ONTOLOGY_OPERATIONS.map((operation) => `'${operation}'`).join("\\|")}`,
      ),
      "instructions expose the runtime query_ontology operation enum",
    );
    assert.match(instructions, /targetOperation:'overview'/);
    assert.match(instructions, /targetOperation:'project_map'/);
    assert.ok(
      instructions.includes(
        `\`targetOperation\` accepts ${QUERY_PLAN_TARGET_OPERATIONS.map((operation) => `'${operation}'`).join("|")}`,
      ),
      "instructions expose the runtime query_plan targetOperation enum",
    );
    assert.match(instructions, /health/);
    assert.match(instructions, /componentLimit/);
    assert.match(instructions, /cycleLimit/);
    assert.match(instructions, /recommendationLimit/);
    assert.match(instructions, /orderLimit/);
    assert.match(instructions, /nodeLimit/);
    assert.match(instructions, /dependencyTypes/);
    assert.match(instructions, /componentTypes/);
    assert.match(instructions, /depends_on/);
    assert.match(instructions, /contains/);
    assert.match(instructions, /describes/);
    assert.match(instructions, /nearest-value hints/);
    assert.match(instructions, /unknown arguments are rejected/i);
    assert.match(instructions, /Unknown argument "lmit" for list_concepts/);
    assert.match(instructions, /Did you mean "limit"\?/);
    assert.match(instructions, /Unknown arguments for list_concepts/);
    assert.match(instructions, /"summry" \(did you mean "summary"\?\)/);
    assert.match(instructions, /maintenance_plan/);
    assert.match(instructions, /phases.*severities.*kinds/);
    assert.match(instructions, /totalActions/);
    assert.match(instructions, /filteredActions/);
    assert.match(instructions, /remainingActions/);
    assert.match(instructions, /executableActions/);
    assert.match(instructions, /reviewActions/);
    assert.match(instructions, /byPhase/);
    assert.match(instructions, /bySeverity/);
    assert.match(instructions, /byKind/);
    assert.match(instructions, /bucket totals.*remainingActions/);
    assert.match(instructions, /cursor\.found=true/);
    assert.match(instructions, /cursor\.reason=null/);
    assert.match(instructions, /cursor\.nextAfterActionId/);
    assert.match(instructions, /last returned action id/);
    assert.match(instructions, /cursor\.hasMore/);
    assert.match(instructions, /afterActionId/);
    assert.match(instructions, /cursor\.found=false/);
    assert.match(instructions, /cursor\.reason/);
    assert.match(instructions, /zero remaining actions/);
    assert.match(instructions, /cursor\.nextAfterActionId=null/);
    assert.match(instructions, /cursor\.hasMore=false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("README first exploration — documented read-only MCP calls stay valid", async () => {
  const root = makeVault([
    {
      slug: "project",
      content: "---\nkind: project\ntitle: Project\ndomains: [domains/ai-agent-partner]\n---\n",
    },
    {
      slug: "domains/ai-agent-partner",
      content: "---\nkind: domain\ntitle: AI Agent Partner\ncapabilities: [capabilities/mcp-server]\n---\n",
    },
    {
      slug: "capabilities/mcp-server",
      content: "---\nkind: capability\ntitle: MCP Server\ndomain: domains/ai-agent-partner\nrelates: [project]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_kinds", {}),
      callTool(3, "list_concepts", {}),
      callTool(4, "get_concept", { slug: "project" }),
      callTool(5, "find_neighbors", { slug: "capabilities/mcp-server" }),
      callTool(6, "validate_vault", {}),
      callTool(7, "query_ontology", { operation: "workspace_brief" }),
      callTool(8, "query_ontology", { operation: "overview", limit: 5 }),
      callTool(9, "query_ontology", { operation: "query_plan", targetOperation: "overview" }),
      callTool(10, "query_ontology", { operation: "query_plan", targetOperation: "project_map" }),
    ]);

    const kinds = getCallParsed(responses, 2);
    assert.equal(kinds.total, 3);
    assert.equal(kinds.byKind.project, 1);
    assert.equal(kinds.byKind.domain, 1);
    assert.equal(kinds.byKind.capability, 1);
    assert.deepEqual(getCallStructured(responses, 2), kinds);

    const list = getCallParsed(responses, 3);
    assert.equal(list.total, 3);
    assert.equal(list.nodes.length, 3);
    assert.deepEqual(getCallStructured(responses, 3), list);

    const project = getCallParsed(responses, 4);
    assert.equal(project.slug, "project");
    assert.equal(project.frontmatter.kind, "project");
    assert.deepEqual(getCallStructured(responses, 4), project);

    const neighbors = getCallParsed(responses, 5);
    assert.equal(neighbors.center, "capabilities/mcp-server");
    assert.equal(neighbors.requested, "capabilities/mcp-server");
    assert.ok(neighbors.totalEdges > 0);
    assert.ok(Array.isArray(neighbors.edges));

    const validation = getCallParsed(responses, 6);
    assert.equal(validation.scanned, 3);
    assert.equal(validation.summary.problemFiles, 0);
    assert.deepEqual(getCallStructured(responses, 6), validation);

    const brief = getCallParsed(responses, 7);
    assert.equal(brief.operation, "workspace_brief");
    assert.equal(brief.summary.nodes, 3);

    const overview = getCallParsed(responses, 8);
    assert.equal(overview.operation, "overview");
    assert.equal(overview.graph.nodes, 3);
    assert.ok(Array.isArray(overview.hubs));

    const overviewPlan = getCallParsed(responses, 9);
    assert.equal(overviewPlan.operation, "query_plan");
    assert.equal(overviewPlan.targetOperation, "overview");
    assert.equal(overviewPlan.sideEffect, false);
    assert.equal(overviewPlan.estimate.strategy, "aggregate_scan");

    const projectMapPlan = getCallParsed(responses, 10);
    assert.equal(projectMapPlan.operation, "query_plan");
    assert.equal(projectMapPlan.targetOperation, "project_map");
    assert.equal(projectMapPlan.sideEffect, false);
    assert.equal(projectMapPlan.estimate.strategy, "aggregate_scan");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("tools/call — arguments 생략은 빈 object, non-object 는 명시적으로 거부", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Demo\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_kinds" },
      },
      callTool(3, "list_concepts", null),
      callTool(4, "list_concepts", []),
      callTool(5, "get_concept", "project"),
      callTool(6, "list_concepts", { lmit: 1 }),
      callTool(7, "list_kinds", { limit: 1 }),
      callTool(8, "list_concepts", { lmit: 1, summry: true }),
      callTool(9, "list_concept", {}),
    ]);
    assert.equal(isErrorResponse(responses, 2), false, "omitted arguments defaults to {}");
    const kinds = getCallParsed(responses, 2);
    assert.equal(kinds.total, 1);
    for (const id of [3, 4, 5]) {
      const text = JSON.stringify(responses.find((r) => r.id === id));
      assert.match(
        text,
        /expected record|tool arguments must be an object/i,
        `request ${id} should reject non-object arguments`,
      );
    }
    assert.equal(isErrorResponse(responses, 6), true);
    assert.match(getCallText(responses, 6), /Unknown argument "lmit" for list_concepts/i);
    assert.match(getCallText(responses, 6), /Did you mean "limit"\?/i);
    assert.equal(responses.find((r) => r.id === 6)?.result?.structuredContent?.ok, false);
    assert.match(
      responses.find((r) => r.id === 6)?.result?.structuredContent?.error ?? "",
      /Unknown argument "lmit" for list_concepts/i,
    );
    assert.equal(responses.find((r) => r.id === 6)?.result?.structuredContent?.errorCode, "unknown_argument");
    assert.deepEqual(getCallStructured(responses, 6)?.allowedArguments, ["domain", "kind", "limit", "offset", "since", "summary"]);
    assert.deepEqual(getCallStructured(responses, 6)?.receivedArguments, ["lmit"]);
    assert.equal(getCallStructured(responses, 6)?.receivedArgument, "lmit");
    assert.equal(getCallStructured(responses, 6)?.suggestion, "limit");
    assert.equal(isErrorResponse(responses, 7), true);
    assert.match(getCallText(responses, 7), /Unknown argument "limit" for list_kinds/i);
    assert.doesNotMatch(getCallText(responses, 7), /Did you mean/i);
    assert.equal(getCallStructured(responses, 7)?.errorCode, "unknown_argument");
    assert.equal(isErrorResponse(responses, 8), true);
    assert.match(getCallText(responses, 8), /Unknown arguments for list_concepts/i);
    assert.match(getCallText(responses, 8), /"lmit" \(did you mean "limit"\?\)/i);
    assert.match(getCallText(responses, 8), /"summry" \(did you mean "summary"\?\)/i);
    assert.match(getCallText(responses, 8), /Allowed arguments: domain, kind, limit, offset, since, summary/i);
    assert.equal(getCallStructured(responses, 8)?.errorCode, "unknown_argument");
    assert.deepEqual(getCallStructured(responses, 8)?.unknownArguments, [
      { name: "lmit", suggestion: "limit" },
      { name: "summry", suggestion: "summary" },
    ]);
    assert.deepEqual(getCallStructured(responses, 8)?.receivedArguments, ["lmit", "summry"]);
    assert.equal(isErrorResponse(responses, 9), true);
    assert.match(getCallText(responses, 9), /Unknown tool: list_concept/i);
    assert.match(getCallText(responses, 9), /Did you mean "list_concepts"\?/i);
    assert.match(getCallText(responses, 9), /Allowed tools: /i);
    assert.equal(getCallStructured(responses, 9)?.errorCode, "unknown_tool");
    assert.equal(getCallStructured(responses, 9)?.receivedTool, "list_concept");
    assert.equal(getCallStructured(responses, 9)?.suggestion, "list_concepts");
    assert.deepEqual(getCallStructured(responses, 9)?.allowedTools, [...EXPECTED_TOOLS].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept/get_concepts — selector one-of is enforced at runtime", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Demo\nuid: 123e4567-e89b-42d3-a456-426614174000\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "project", uid: "123e4567-e89b-42d3-a456-426614174000" }),
      callTool(3, "get_concept", {}),
      callTool(4, "get_concepts", { slugs: ["project"], uids: ["123e4567-e89b-42d3-a456-426614174000"] }),
      callTool(5, "get_concepts", {}),
    ]);
    for (const id of [2, 3, 4, 5]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} rejects non-one-of selector payload`);
      assert.equal(getCallStructured(responses, id)?.errorCode, "invalid_arguments");
    }
    assert.match(getCallText(responses, 2), /exactly one of slug or uid/i);
    assert.match(getCallText(responses, 4), /exactly one of slugs or uids/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("compile_ontology — deterministic graph artifact + indexes", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nslug: auth-domain\nkind: domain\ntitle: Auth\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndepends_on: [auth-domain]\nrelates: [missing]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "compile_ontology", { includeIndexes: true }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.version, 2);
    assert.equal(result.summary.nodes, 2);
    assert.equal(result.summary.edges, 2);
    assert.match(result.summary.graphHash, /^[a-f0-9]{64}$/);
    assert.equal(result.summary.maxMtime > 0, true);
    assert.equal(result.summary.resolvedEdges, 1);
    assert.equal(result.summary.externalEdges, 0);
    assert.equal(result.summary.unresolvedEdges, 1);
    assert.equal(result.summary.aliases, result.aliases.length);
    assert.equal(result.summary.ambiguousAliases, 0);
    assert.equal(result.summary.issues, 1);
    assert.deepEqual(
      result.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        via: edge.via,
        ref: edge.ref,
        resolved: edge.resolved,
        external: edge.external,
      })),
      [
        {
          from: "capabilities/login",
          to: "domains/auth",
          via: "dependencies",
          ref: "auth-domain",
          resolved: true,
          external: false,
        },
        {
          from: "capabilities/login",
          to: "missing",
          via: "relates",
          ref: "missing",
          resolved: false,
          external: false,
        },
      ],
    );
    assert.deepEqual(result.indexes.in["domains/auth"], [
      "capabilities/login->domains/auth:dependencies:auth-domain",
    ]);
    for (const node of result.nodes) {
      assert.equal(result.indexes.uidToSlug[node.uid], node.slug);
      assert.equal(result.indexes.slugToUid[node.slug], node.uid);
    }
    assert.ok(result.issues.some((issue) => issue.code === "dangling-graph-reference"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("analyze_repo_structure — bootstrap candidates expose structuredContent", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-analyze-")));
  try {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "sample-app", description: "Sample App" }, null, 2),
      "utf-8",
    );
    writeFileSync(repoRoot + "/README.md", "# Sample App\n\n## Auth\n\nLogin flows.\n", "utf-8");
    mkdirSync(join(repoRoot, "src", "features", "auth"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "features", "auth", "index.ts"), "export const auth = true;\n", "utf-8");

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.framework, "fsd");
    assert.deepEqual(result.project, {
      slug: "sample-app",
      title: "Sample App",
      definition: "Proposed repository purpose from README.md: Login flows.",
      evidence: ["README.md"],
      includes: ["repository-contained implementation evidence"],
      excludes: [],
      confidence: 0.5,
      uncertainty: "proposal-only: source prose is a bounded purpose witness, not a shared business assertion. Unknowns: shared business ownership is not established by repository evidence; runtime, test, and external-system behavior remain outside this bounded scan.",
    });
    assert.ok(result.domains.some((domain) => domain.slug === "domains/auth"));
    assert.ok(result.capabilities.some((capability) => capability.slug === "capabilities/auth"));
    assert.ok(result.suggestedRelations.some((relation) => relation.from === "domains/auth" && relation.to === "capabilities/auth" && relation.type === "contains"));
    assert.equal(result.proposalValidation.status, "not-provided");
    assert.equal(result.proposalValidation.canWrite, false);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("analyze_repo_structure — validates a complete meaning proposal before writes", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-proposal-")));
  try {
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "claims" }), "utf-8");
    writeFileSync(
      join(repoRoot, "README.md"),
      "# Claims\n\nTeams need reviewable claims.\n\n## Review\n\nReview owns publication-readiness decisions for claims.\n\nReview claims before publication.\n",
      "utf-8",
    );
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "product-contract.md"),
      "# Product Contract\n\nClaims provides reviewable claim publishing for teams.\n\nReview owns publication-readiness decisions for claims.\n",
      "utf-8",
    );
    mkdirSync(join(repoRoot, "src", "review"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "review", "index.ts"), "export const review = true;\n", "utf-8");
    const proposal = {
      project: {
        slug: "claims",
        title: "Claims",
        definition: "A system for publishing reviewable claims.",
        evidence: ["README.md", "docs/product-contract.md"],
        confidence: 0.9,
      },
      domains: [{
        slug: "domains/review",
        title: "Review",
        definition: "The responsibility boundary for deciding whether claims may be published.",
        evidence: ["README.md", "docs/product-contract.md"],
        confidence: 0.9,
      }],
      capabilities: [{
        slug: "capabilities/review",
        title: "Claim Review",
        definition: "Evaluate a claim before publication.",
        domain: "domains/review",
        path: "src/review",
        evidence: ["README.md", "src/review"],
        confidence: 0.9,
      }],
      elements: [],
      relations: [
        {
          from: "claims",
          to: "domains/review",
          type: "domains",
          why: "The project owns the review boundary.",
          evidence: ["README.md", "docs/product-contract.md"],
          confidence: 0.9,
        },
        {
          from: "domains/review",
          to: "capabilities/review",
          type: "capabilities",
          why: "Review is realized through claim evaluation.",
          evidence: ["README.md"],
          confidence: 0.9,
        },
      ],
      competencyAnswers: {
        scope: {
          answer: "Teams publishing reviewable claims.",
          status: "answered",
          witnesses: {
            concepts: ["claims"], relations: [], evidence: ["README.md", "docs/product-contract.md"], paths: [],
          },
        },
        domains: {
          answer: "Review owns publication readiness.",
          status: "answered",
          witnesses: {
            concepts: ["domains/review"],
            relations: [{ from: "claims", to: "domains/review", type: "domains" }],
            evidence: ["README.md", "docs/product-contract.md"], paths: [],
          },
        },
        abilities: {
          answer: "Claim Review evaluates claims.",
          status: "answered",
          witnesses: {
            concepts: ["capabilities/review"],
            relations: [{ from: "domains/review", to: "capabilities/review", type: "capabilities" }],
            evidence: ["README.md"], paths: [],
          },
        },
        evidence: {
          answer: "README and source implementation.",
          status: "answered",
          witnesses: {
            concepts: ["capabilities/review"], relations: [],
            evidence: ["src/review"], paths: ["src/review"],
          },
        },
        impact: {
          answer: "The current proposal does not prove a change-impact dependency.",
          status: "visible-gap",
          gap: "No depends_on relation is supported by the bounded evidence packet.",
          witnesses: {
            concepts: ["capabilities/review"], relations: [],
            evidence: ["README.md"], paths: [],
          },
        },
      },
    };
    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot, proposal }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.proposalValidation.status, "pass");
    assert.equal(result.proposalValidation.canWrite, false);
    assert.equal(result.proposalValidation.summary.errors, 0);
    assert.equal(result.proposalValidation.summary.warnings, 1);
    assert.equal(result.proposalValidation.summary.concepts, 3);
    assert.equal(result.proposalValidation.summary.relations, 2);
    assert.equal(result.proposalValidation.constructionLifecycle.writeEligibility, "reviewable");
    assert.equal(result.proposalValidation.constructionLifecycle.phases.length, 8);
    assert.match(result.proposalValidation.constructionLifecycle.planDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(result.proposalValidation.constructionLifecycle.sourceDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(result.proposalValidation.constructionLifecycle.requiredGapIds, [
      "proposal:visible-competency-gap:competencyAnswers.impact",
    ]);
    assert.equal(result.proposalValidation.reviewPlan.concepts.length, 3);
    assert.equal(result.proposalValidation.writePlan, undefined);

    const qualification = structuredClone(QUALIFIED_CONSTRUCTION_FIXTURE);
    qualification.qualificationId = "qualification:claims:v1";
    qualification.subject.projectSlug = "claims";
    qualification.subject.graphDigest = result.proposalValidation.constructionLifecycle.planDigest;
    qualification.subject.sourceDigest = result.proposalValidation.constructionLifecycle.sourceDigest;
    qualification.acceptance.planDigest = result.proposalValidation.constructionLifecycle.planDigest;
    qualification.acceptance.planRevision = result.proposalValidation.constructionLifecycle.planRevision;
    qualification.acceptance.acceptedGapIds = result.proposalValidation.constructionLifecycle.requiredGapIds;
    const proposalRefs = proposalCoverageRefs(result.proposalValidation.reviewPlan);
    qualification.claims.forEach((claim, index) => {
      claim.proposalRefs = [
        ...(index === 0 ? proposalRefs : [proposalRefs[0]]),
      ];
    });

    const qualified = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot, proposal, qualification }),
    ]);
    const qualifiedResult = getCallParsed(qualified.responses, 2);
    assert.equal(qualifiedResult.proposalValidation.status, "pass");
    assert.equal(qualifiedResult.proposalValidation.canWrite, true);
    assert.equal(qualifiedResult.proposalValidation.constructionLifecycle.writeEligibility, "executable");
    assert.deepEqual(
      qualifiedResult.proposalValidation.writePlan,
      result.proposalValidation.reviewPlan,
      "the public writer rows must be byte-for-JSON equal to the reviewed plan",
    );
    assert.equal(qualifiedResult.proposalValidation.writePlan.concepts.length, 3);
    assert.equal(qualifiedResult.proposalValidation.writePlan.relations.length, 2);
    assert.equal(qualifiedResult.proposalValidation.writePlan.competencyAnswers.impact.status, "visible-gap");

    const foreignProposalClaim = structuredClone(qualification);
    foreignProposalClaim.claims[0].proposalRefs = [
      ...proposalRefs.slice(0, -1),
      "concept:foreign-proposal",
    ];
    const foreignProposal = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", {
        rootPath: repoRoot,
        proposal,
        qualification: foreignProposalClaim,
      }),
    ]);
    const foreignProposalResult = getCallParsed(foreignProposal.responses, 2);
    assert.equal(foreignProposalResult.proposalValidation.canWrite, false);
    assert.equal(foreignProposalResult.proposalValidation.writePlan, undefined);
    assert.equal(foreignProposalResult.proposalValidation.constructionLifecycle.admission.tier, "hard_block");
    assert.ok(foreignProposalResult.proposalValidation.constructionLifecycle.diagnostics.some(
      ({ code }) => code === "proposal-coverage-unexpected:concept:foreign-proposal",
    ));

    const sourceHiddenMissing = structuredClone(qualification);
    sourceHiddenMissing.sourceHiddenTask.status = "not_measured";
    const blocked = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", {
        rootPath: repoRoot,
        proposal,
        qualification: sourceHiddenMissing,
      }),
    ]);
    const blockedResult = getCallParsed(blocked.responses, 2);
    assert.equal(blockedResult.proposalValidation.canWrite, false);
    assert.equal(blockedResult.proposalValidation.writePlan, undefined);
    assert.equal(
      blockedResult.proposalValidation.constructionLifecycle.firstBlockingPhase,
      "independent_source_hidden",
    );
    assert.ok(blockedResult.proposalValidation.constructionLifecycle.diagnostics.some(
      ({ code }) => code === "source-hidden-not-measured",
    ));

    const written = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: qualifiedResult.proposalValidation.writePlan.concepts,
      }),
      callTool(3, "add_relations", {
        relations: qualifiedResult.proposalValidation.writePlan.relations,
      }),
    ]);
    assert.ok(getCallParsed(written.responses, 2).concepts.every((row) => row.ok));
    assert.ok(getCallParsed(written.responses, 3).relations.every((row) => row.ok));

    const connected = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "connect_project_source", {
        projectSlug: "claims",
        rootPath: repoRoot,
        confirm: true,
      }),
    ]);
    assert.equal(getCallParsed(connected.responses, 2).projectSource.status, "verified_current");

    const finalized = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "finalize_project_meaning", {
        projectSlug: "claims",
        expected_mtime: statSync(join(vaultRoot, "claims.md")).mtimeMs,
      }),
    ]);
    assert.equal(
      isErrorResponse(finalized.responses, 2),
      false,
      getCallText(finalized.responses, 2),
    );
    const finalizedResult = getCallParsed(finalized.responses, 2);
    assert.equal(finalizedResult.ok, true);
    assert.equal(finalizedResult.meaningAssessment.dimensions.competency.questions
      .find((row) => row.id === "scope")?.witnessStatus, "resolved");
    assert.equal(JSON.stringify(finalizedResult).includes(repoRoot), false);

    const handedOff = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "agent_brief",
        project: "claims",
      }),
    ]);
    const handoffBrief = getCallParsed(handedOff.responses, 2);
    assert.equal(
      handoffBrief.meaningAssessment.dimensions.competency.status,
      "needs_evidence",
      JSON.stringify(handoffBrief.meaningAssessment),
    );
    assert.equal(handoffBrief.meaningAssessment.dimensions.competency.questions
      .find((row) => row.id === "scope")?.witnessStatus, "resolved");
    assert.equal(handoffBrief.meaningAssessment.topGap?.questionId, "impact");
    assert.equal(handoffBrief.meaningAssessment.dimensions.source.currentness, "current");
    assert.equal(JSON.stringify(handoffBrief.projectSource).includes(repoRoot), false);
    assert.equal(JSON.stringify(handoffBrief.meaningAssessment).includes(repoRoot), false);
    assert.equal(JSON.stringify(handoffBrief.meaningRepair).includes(repoRoot), false);

    const legacyProposal = {
      ...proposal,
      competencyAnswers: {
        scope: "Teams publishing reviewable claims.",
        domains: "Review owns publication readiness.",
        abilities: "Claim Review evaluates claims.",
        evidence: "README and source implementation.",
        impact: "Review decisions gate publication.",
      },
    };
    const { responses: legacyResponses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", {
        rootPath: repoRoot,
        proposal: legacyProposal,
      }),
    ]);
    const legacyResult = getCallParsed(legacyResponses, 2);
    assert.equal(legacyResult.proposalValidation.status, "fail");
    assert.equal(legacyResult.proposalValidation.canWrite, false);
    assert.equal(legacyResult.proposalValidation.writePlan, undefined);
    assert.ok(legacyResult.proposalValidation.findings.some(
      (finding) => finding.code === "unstructured-competency-answer",
    ));

    const malformedBoundaryProposal = {
      ...proposal,
      project: { ...proposal.project, includes: "Reviewable claims." },
    };
    const { responses: malformedBoundaryResponses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", {
        rootPath: repoRoot,
        proposal: malformedBoundaryProposal,
      }),
    ]);
    const malformedBoundaryResult = getCallParsed(malformedBoundaryResponses, 2);
    assert.equal(malformedBoundaryResult.proposalValidation.status, "fail");
    assert.equal(malformedBoundaryResult.proposalValidation.canWrite, false);
    assert.equal(malformedBoundaryResult.proposalValidation.writePlan, undefined);
    assert.ok(malformedBoundaryResult.proposalValidation.findings.some(
      (finding) => finding.code === "invalid-concept-boundary-list",
    ));
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("analyze_repo_structure — validates exact TypeScript import endpoints inside the proposal call", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-ts-proposal-")));
  try {
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "portable-reader" }), "utf-8");
    writeFileSync(
      join(repoRoot, "README.md"),
      "# Portable Reader\n\nA desktop reader that presents subscribed content.\n\nReading owns subscribed-content presentation.\n",
      "utf-8",
    );
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "product-contract.md"),
      "# Product Contract\n\nPortable Reader provides subscribed-content reading for desktop users.\n\nReading owns subscribed-content presentation.\n",
      "utf-8",
    );
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(
      join(repoRoot, "src", "entry.ts"),
      "import { loadItems } from './service';\nexport const start = () => loadItems();\n",
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "src", "service.ts"),
      "export const loadItems = () => [];\n",
      "utf-8",
    );

    const projectDomain = { from: "portable-reader", to: "domains/reading", type: "domains" };
    const domainCapability = { from: "domains/reading", to: "capabilities/content-reading", type: "capabilities" };
    const capabilityEntry = { from: "capabilities/content-reading", to: "elements/desktop-entry", type: "elements" };
    const capabilityService = { from: "capabilities/content-reading", to: "elements/content-service", type: "elements" };
    const dependency = { from: "elements/desktop-entry", to: "elements/content-service", type: "depends_on" };
    const proposal = {
      project: {
        slug: "portable-reader",
        title: "Portable Reader",
        definition: "A desktop product for reading subscribed content.",
        evidence: ["README.md", "docs/product-contract.md"],
        confidence: 0.9,
      },
      domains: [{
        slug: "domains/reading",
        title: "Reading",
        definition: "The responsibility boundary for presenting subscribed content.",
        evidence: ["README.md", "docs/product-contract.md"],
        confidence: 0.9,
      }],
      capabilities: [{
        slug: "capabilities/content-reading",
        title: "Content reading",
        definition: "Load and present subscribed content in the desktop product.",
        domain: "domains/reading",
        path: "src",
        evidence: ["README.md"],
        confidence: 0.9,
      }],
      elements: [
        {
          slug: "elements/desktop-entry",
          title: "Desktop entry",
          definition: "The desktop source entry that starts content loading.",
          domain: "domains/reading",
          path: "src/entry.ts",
          evidence: ["src/entry.ts"],
          confidence: 0.9,
        },
        {
          slug: "elements/content-service",
          title: "Content service",
          definition: "The source boundary that loads subscribed content.",
          domain: "domains/reading",
          path: "src/service.ts",
          evidence: ["src/service.ts"],
          confidence: 0.9,
        },
      ],
      relations: [
        { ...projectDomain, why: "The project owns the reading boundary.", evidence: ["README.md", "docs/product-contract.md"], confidence: 0.9 },
        { ...domainCapability, why: "Reading is realized through content loading and presentation.", evidence: ["README.md"], confidence: 0.9 },
        { ...capabilityEntry, why: "The desktop entry implements content reading.", evidence: ["src/entry.ts"], confidence: 0.9 },
        { ...capabilityService, why: "The content service implements content reading.", evidence: ["src/service.ts"], confidence: 0.9 },
        { ...dependency, why: "The desktop entry statically imports the content service.", evidence: ["src/entry.ts", "src/service.ts"], confidence: 0.9 },
      ],
      competencyAnswers: {
        scope: {
          answer: "Desktop users read subscribed content.",
          status: "answered",
          witnesses: { concepts: ["portable-reader"], relations: [], evidence: ["README.md", "docs/product-contract.md"], paths: [] },
        },
        domains: {
          answer: "Reading owns content presentation.",
          status: "answered",
          witnesses: { concepts: ["domains/reading"], relations: [projectDomain], evidence: ["README.md", "docs/product-contract.md"], paths: [] },
        },
        abilities: {
          answer: "Content reading loads and presents subscriptions.",
          status: "answered",
          witnesses: { concepts: ["capabilities/content-reading"], relations: [domainCapability], evidence: ["README.md"], paths: [] },
        },
        evidence: {
          answer: "The entry and service files are exact implementation witnesses.",
          status: "answered",
          witnesses: {
            concepts: ["capabilities/content-reading", "elements/desktop-entry", "elements/content-service"],
            relations: [capabilityEntry, capabilityService],
            evidence: ["src/entry.ts", "src/service.ts"],
            paths: ["src", "src/entry.ts", "src/service.ts"],
          },
        },
        impact: {
          answer: "Changing the service can affect the desktop entry that imports it.",
          status: "answered",
          witnesses: {
            concepts: ["elements/desktop-entry", "elements/content-service"],
            relations: [dependency],
            evidence: ["src/entry.ts", "src/service.ts"],
            paths: [],
          },
        },
      },
    };

    const reversedProposal = structuredClone(proposal);
    reversedProposal.relations[4] = {
      ...reversedProposal.relations[4],
      from: "elements/content-service",
      to: "elements/desktop-entry",
      why: "The content service statically imports the desktop entry.",
    };
    reversedProposal.competencyAnswers.impact.witnesses.relations = [{
      from: "elements/content-service",
      to: "elements/desktop-entry",
      type: "depends_on",
    }];

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot, proposal }),
      callTool(3, "analyze_repo_structure", { rootPath: repoRoot, proposal: reversedProposal }),
    ]);
    const result = getCallParsed(responses, 2);
    const reversedResult = getCallParsed(responses, 3);
    assert.equal(result.proposalValidation.status, "pass", JSON.stringify(result.proposalValidation.findings));
    assert.equal(result.proposalValidation.canWrite, false);
    assert.ok(result.proposalValidation.reviewPlan);
    assert.equal(
      result.proposalValidation.findings.some(({ code }) =>
        ["unknown-citation", "unobserved-python-import-dependency"].includes(code)),
      false,
      JSON.stringify(result.proposalValidation.findings),
    );
    assert.equal(reversedResult.proposalValidation.status, "fail");
    assert.ok(
      reversedResult.proposalValidation.findings.some(
        ({ code }) => code === "unobserved-python-import-dependency",
      ),
      JSON.stringify(reversedResult.proposalValidation.findings),
    );
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports — import graph exposes structuredContent", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-infer-")));
  try {
    mkdirSync(join(repoRoot, "src", "features", "auth"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "entities", "user"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "shared", "api"), { recursive: true });
    writeFileSync(
      join(repoRoot, "src", "features", "auth", "index.ts"),
      [
        'import { user } from "../../entities/user";',
        'import "@/shared/api/client";',
        'import "zod";',
        'import "./missing";',
        'export const auth = user;',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(join(repoRoot, "src", "entities", "user", "index.ts"), "export const user = true;\n", "utf-8");
    writeFileSync(join(repoRoot, "src", "shared", "api", "client.ts"), "export const client = true;\n", "utf-8");

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.rootPath, repoRoot);
    assert.equal(result.filesScanned, 3);
    assert.ok(result.edges.some((edge) => edge.from === "src/features/auth/index.ts" && edge.to === "src/entities/user/index.ts" && edge.kind === "static"));
    assert.ok(result.edges.some((edge) => edge.from === "src/features/auth/index.ts" && edge.to === "src/shared/api/client.ts"));
    assert.ok(result.externalImports.some((entry) => entry.from === "src/features/auth/index.ts" && entry.spec === "zod"));
    // Slugs are flat identifiers (decided 2026-08-01) — a module slug is the role name only.
    assert.ok(result.moduleEdges.some((edge) => edge.from === "capabilities/auth" && edge.to === "elements/user" && edge.count >= 1));
    assert.ok(result.moduleEdges.some((edge) => edge.from === "capabilities/auth" && edge.to === "elements/client" && edge.count >= 1));
    assert.equal(result.reconciliationSummary.unresolvedImports, 1);
    assert.match(result.reconciliationSummary.hint, /unresolved import/i);
    assert.doesNotMatch(result.reconciliationSummary.hint, /are in sync/i);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("inspect_architecture — profile intent and observed imports produce an agent brief", async () => {
  const vaultRoot = makeVault([
    {
      slug: "architecture/payments",
      content: [
        "---",
        "architecture_schema: architecture-profile/v1",
        "profile_uid: 22c86542-7512-4b6e-8c73-77be4730c772",
        "profile_slug: payments-core",
        "project_uid: e91d8a44-a95b-4faf-840d-e71c8b2d935c",
        "title: Payments Core",
        "patterns: [dependency:hexagonal]",
        "scope_paths: [src/payments/**]",
        "role_domain: [src/payments/domain/**]",
        "role_adapter: [src/payments/adapters/**]",
        "allow_domain: []",
        "allow_adapter: [domain]",
        "evidence: [ARCHITECTURE.md]",
        "---",
        "",
        "# Payments architecture",
        "",
      ].join("\n"),
    },
  ]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-architecture-")));
  try {
    mkdirSync(join(repoRoot, "src", "payments", "domain"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "payments", "adapters"), { recursive: true });
    writeFileSync(
      join(repoRoot, "src", "payments", "domain", "payment.ts"),
      'import { save } from "../adapters/postgres";\nexport const payment = save;\n',
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "src", "payments", "adapters", "postgres.ts"),
      "export const save = true;\n",
      "utf-8",
    );

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "inspect_architecture", { rootPath: repoRoot, profileSlug: "payments-core" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.contract, "architectureBrief:v1");
    assert.equal(result.sideEffect, 0);
    assert.equal(result.profile.slug, "payments-core");
    assert.deepEqual(result.profile.dependencyUsages, ["value", "type_only"]);
    assert.equal(result.conformance.status, "violated");
    assert.deepEqual(result.conformance.violations[0], {
      fromRole: "domain",
      toRole: "adapter",
      from: "src/payments/domain/payment.ts",
      to: "src/payments/adapters/postgres.ts",
      kind: "static",
      importUsage: "value",
      rule: "allow-domain",
    });
    assert.equal(result.conformance.unknown.unknownImportUsages, 0);
    assert.equal(result.agentPlanContract.contract, "architectureChangePlan:v1");
    // The measured stamp (2026-08-27): a dated receipt of the exact source
    // state. The tmp repository is not a git checkout, so the stamp must be a
    // folder fingerprint and must not carry anything sha-shaped.
    // Reconciled 2026-08-29, and the default flipped with the encoding. This fixture declares
    // neither key: on the branch that meant type-only edges were free, and under the encoding that
    // shipped it means both usages are governed until a profile says otherwise. Excluding them is
    // a reviewed declaration now, never a tool default.
    assert.deepEqual(result.profile.dependencyUsages, ["value", "type_only"]);
    assert.ok(!Number.isNaN(Date.parse(result.measured.at)));
    assert.equal(result.measured.tool.name, "ontology-atlas");
    assert.equal(typeof result.measured.tool.version, "string");
    assert.equal(result.measured.source.kind, "folder");
    assert.match(result.measured.source.fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.equal("revision" in result.measured.source, false);
    assert.equal(result.conformance.excludedByUsage, 0);
    assert.equal(result.conformance.source.importUsageCounts.value >= 1, true);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports — Go package evidence stays typed while focus and index return bounded summaries", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-go-summary-")));
  try {
    writeFileSync(join(repoRoot, "go.mod"), "module example.test/sample\n", "utf-8");
    mkdirSync(join(repoRoot, "cmd", "sample"), { recursive: true });
    mkdirSync(join(repoRoot, "internal", "store"), { recursive: true });
    writeFileSync(
      join(repoRoot, "cmd", "sample", "main.go"),
      'package sample\n\nimport "example.test/sample/internal/store"\n\nvar _ = store.Ready\n',
      "utf-8",
    );
    writeFileSync(join(repoRoot, "internal", "store", "store.go"), "package store\n\nconst Ready = true\n", "utf-8");

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot, reconcile: false }),
      callTool(3, "infer_imports", {
        rootPath: repoRoot,
        sourceFolders: ["source"],
        ignore: ["ignored-dir"],
        maxFiles: 7,
        reviewMode: "focus",
        focusPath: "cmd/sample/main.go",
      }),
      callTool(4, "index_project", { rootPath: repoRoot }),
    ]);
    const full = getCallParsed(responses, 2);
    const focused = getCallParsed(responses, 3);
    const indexed = getCallParsed(responses, 4);

    assert.equal(full.packageImportEvidence.contract, "goPackageImports:v1");
    assert.equal(full.packageImportEvidence.packageImports.length, 1);
    assert.equal(full.packageImportEvidence.moduleEdges.length, 1);
    assert.equal(full.edges.length, 0, "Go package imports must not enter legacy file edges");

    const expectedSummary = {
      contract: "goPackageImports:v1",
      filesScanned: 2,
      fileScanLimited: false,
      packageImports: 1,
      moduleEdges: 1,
      fullEvidenceCall: {
        tool: "infer_imports",
        arguments: {
          rootPath: repoRoot,
          sourceFolders: ["source"],
          ignore: ["ignored-dir"],
          maxFiles: 7,
          reviewMode: "full",
          allowLargeResponse: true,
        },
        purpose: "Read the complete typed Go package-import evidence; focus only contains legacy file edges.",
      },
    };
    assert.deepEqual(focused.packageImportEvidenceSummary, expectedSummary);
    assert.deepEqual(focused.focusReview.edges, []);
    assert.match(focused.focusReview.interpretation, /legacy file edges only/i);
    assert.equal(indexed.imports.moduleEdges, 0);
    assert.equal(indexed.imports.packageImports, 1);
    assert.equal(indexed.imports.packageModuleEdges, 1);
    assert.equal(indexed.plan.importRelations, 1);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports auto delivery — oversized omitted calls compact, explicit full stays available, and raw scans fail closed", async () => {
  const vaultRoot = makeVault([
    {
      slug: "capabilities/legacy",
      // This fixture tests "readable, but no import". Without a path, the new
      // contract makes it notJudgeableByImports and the stale follow-up test disappears.
      content: "---\nkind: capability\ntitle: Legacy\npath: src/legacy.ts\ndependencies: [capabilities/target]\n---\n",
    },
    {
      slug: "capabilities/target",
      content: "---\nkind: capability\ntitle: Target\npath: src/target.ts\n---\n",
    },
  ]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-infer-auto-delivery-")));
  try {
    mkdirSync(join(repoRoot, "src", "shared", "runtime"), { recursive: true });
    writeFileSync(
      join(repoRoot, "src", "shared", "runtime", "client.ts"),
      "export const client = true;\n",
      "utf-8",
    );
    for (let index = 0; index < 160; index += 1) {
      const featureDir = join(repoRoot, "src", "features", `feature-${String(index).padStart(3, "0")}`);
      mkdirSync(featureDir, { recursive: true });
      writeFileSync(
        join(featureDir, "index.ts"),
        'import { client } from "../../shared/runtime/client";\nexport const enabled = client;\n',
        "utf-8",
      );
    }
    const before = readdirSync(vaultRoot, { recursive: true });

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot }),
      callTool(3, "infer_imports", { rootPath: repoRoot, reviewMode: "next" }),
      callTool(4, "infer_imports", { rootPath: repoRoot, reviewMode: "full" }),
      callTool(5, "infer_imports", {
        rootPath: repoRoot,
        reviewMode: "full",
        allowLargeResponse: true,
      }),
      callTool(6, "infer_imports", { rootPath: repoRoot, reconcile: false }),
      callTool(7, "infer_imports", {
        rootPath: repoRoot,
        reviewMode: "focus",
        focusPath: "src/shared/runtime/client.ts",
        focusDirection: "both",
        focusLimit: 25,
      }),
    ], 10_000);

    const automatic = getCallParsed(responses, 2);
    const explicitNext = getCallParsed(responses, 3);
    const explicitFull = getCallParsed(responses, 5);
    const focused = getCallParsed(responses, 7);
    assert.equal(automatic.contract, "inferImportsReview:v1");
    assert.equal(automatic.edges, undefined);
    assert.equal(automatic.moduleEdges, undefined);
    assert.equal(automatic.staleEdgeFollowUp.status, "full_follow_up_required");
    assert.equal(automatic.staleEdgeFollowUp.count, 1);
    assert.deepEqual(automatic.staleEdgeFollowUp.nextCall, {
      tool: "infer_imports",
      arguments: { rootPath: repoRoot, reviewMode: "full", allowLargeResponse: true },
      purpose: "Read full reconciliation before judging stale vault edges; compact delivery omits stale details.",
    });
    assert.equal(
      JSON.stringify(automatic).length < 6_144,
      true,
      `automatic compact response was ${JSON.stringify(automatic).length} bytes`,
    );
    assert.deepEqual(automatic.delivery, {
      selection: "automatic_compact",
      reason: "estimated_full_response_exceeds_limit",
      estimatedFullResponseBytes: automatic.delivery.estimatedFullResponseBytes,
      automaticLimitBytes: 131_072,
      explicitFullAvailable: true,
      explicitFullArguments: {
        reviewMode: "full",
        allowLargeResponse: true,
      },
    });
    assert.equal(automatic.delivery.estimatedFullResponseBytes > automatic.delivery.automaticLimitBytes, true);
    const { delivery: _automaticDelivery, ...automaticWithoutDelivery } = automatic;
    assert.deepEqual(automaticWithoutDelivery, explicitNext);

    assert.equal(isErrorResponse(responses, 4), true);
    assert.deepEqual(getCallStructured(responses, 4), {
      ok: false,
      errorCode: "tool_error",
      error: getCallStructured(responses, 4).error,
      largeResponseConfirmationRequired: true,
      estimatedFullResponseBytes: getCallStructured(responses, 4).estimatedFullResponseBytes,
      automaticLimitBytes: 131_072,
      retryArguments: {
        reviewMode: "full",
        allowLargeResponse: true,
      },
      boundedAlternative: {
        reviewMode: "next",
      },
    });
    assert.match(getCallStructured(responses, 4).error, /allowLargeResponse:true/i);

    assert.ok(Array.isArray(explicitFull.edges));
    assert.ok(Array.isArray(explicitFull.moduleEdges));
    assert.equal(explicitFull.moduleEdges.length, 160);
    assert.equal(explicitFull.contract, undefined);

    assert.equal(focused.contract, "inferImportsFocus:v1");
    assert.equal(JSON.stringify(focused).length < 32_768, true);
    assert.deepEqual(focused.focusReview.summary, {
      incoming: 160,
      outgoing: 0,
      selected: 160,
      returned: 25,
      limited: true,
    });
    assert.equal(focused.focusReview.edges.length, 25);
    assert.equal(focused.focusReview.edges.every((edge) => edge.to === "src/shared/runtime/client.ts"), true);
    assert.equal(focused.focusReview.cursor.total, 160);
    assert.equal(focused.focusReview.cursor.remaining, 135);
    assert.equal(focused.focusReview.writeAllowed, false);

    assert.equal(isErrorResponse(responses, 6), true);
    assert.match(
      JSON.stringify(responses.find((response) => response.id === 6)),
      /estimated full response.*exceeds.*128 KiB.*reconcile:true.*reviewMode.*full/is,
    );
    assert.deepEqual(getCallStructured(responses, 6), {
      ok: false,
      errorCode: "tool_error",
      error: getCallStructured(responses, 6).error,
      estimatedFullResponseBytes: getCallStructured(responses, 6).estimatedFullResponseBytes,
      automaticLimitBytes: 131_072,
      requiredForCompact: {
        reconcile: true,
        loadableActiveVault: true,
      },
      explicitFullOverride: {
        reviewMode: "full",
        allowLargeResponse: true,
      },
    });
    assert.equal(
      getCallStructured(responses, 6).estimatedFullResponseBytes > 131_072,
      true,
    );
    assert.deepEqual(readdirSync(vaultRoot, { recursive: true }), before, "delivery selection must write zero vault bytes");
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("Rust and Autotools C MCP evidence — analyze, infer, and index preserve provenance and bounded import coverage", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-rust-evidence-")));
  try {
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(
      join(repoRoot, "Cargo.toml"),
      [
        "[package]",
        'name = "conditional-engine"',
        "",
        "[features]",
        "portable = []",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "src", "lib.rs"),
      '#[cfg(feature = "portable")]\nmod portable;\nuse crate::portable::run;\n',
      "utf-8",
    );
    writeFileSync(join(repoRoot, "src", "portable.rs"), "pub fn run() {}\n", "utf-8");
    writeFileSync(join(repoRoot, "configure.ac"), "AC_INIT([conditional-engine], [1.0])\nAC_PROG_CC\n", "utf-8");
    writeFileSync(join(repoRoot, "Makefile.am"), "bin_PROGRAMS = native-check\nnative_check_SOURCES = src/native.c\n", "utf-8");
    writeFileSync(join(repoRoot, "src", "native.c"), "int main(void) { return 0; }\n", "utf-8");

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot }),
      callTool(3, "infer_imports", { rootPath: repoRoot }),
      callTool(4, "index_project", { rootPath: repoRoot }),
    ]);
    const analyze = getCallParsed(responses, 2);
    const imports = getCallParsed(responses, 3);
    const index = getCallParsed(responses, 4);

    assert.deepEqual(getCallStructured(responses, 2), analyze);
    assert.equal(analyze.configurationEvidence.contract, "rustFeatureConfigurationEvidence:v1");
    assert.equal(analyze.configurationEvidence.writePolicy.writeAllowed, false);
    assert.equal(analyze.configurationEvidence.claimBoundary.semanticDependency, false);
    assert.deepEqual(
      analyze.configurationEvidence.packages[0].features[0].references[0],
      {
        path: "src/lib.rs",
        line: 1,
        form: "cfg",
        meaning: "conditional_inclusion",
        polarity: "positive",
        predicate: 'feature = "portable"',
        sourceRole: "production",
      },
    );

    assert.deepEqual(getCallStructured(responses, 3), imports);
    assert.equal(imports.filesScanned, 2);
    assert.deepEqual(
      imports.edges.map((edge) => [edge.from, edge.to]),
      [
        ["src/lib.rs", "src/portable.rs"],
      ],
    );
    assert.deepEqual(imports.unresolved, [
      {
        from: "src/lib.rs",
        spec: '#[cfg(feature = "portable")]\nmod portable',
        reason: "unsupported-static-form",
      },
    ]);
    assert.deepEqual(imports.coverage.detectedUnsupportedLanguages, ["c"]);
    assert.equal(imports.coverage.allDetectedLanguagesSupported, false);
    assert.equal(imports.coverage.zeroEdgesMeaning, "no_supported_static_import_edges_observed");

    assert.deepEqual(getCallStructured(responses, 4), index);
    assert.equal(index.sideEffect, 0);
    assert.equal(index.configurationEvidence.contract, "rustFeatureConfigurationEvidence:v1");
    assert.deepEqual(index.imports.coverage, imports.coverage);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports reviewMode next — one bounded non-writing relation review advances by cursor", async () => {
  const vaultRoot = makeVault([
    { slug: "capabilities/auth", content: "---\nkind: capability\ntitle: Auth\n---\n\nAuthenticates a user.\n" },
    { slug: "elements/client", content: "---\nkind: element\ntitle: API Client\n---\n\nCalls the remote API.\n" },
    { slug: "elements/user", content: "---\nkind: element\ntitle: User Entity\n---\n\nRepresents the signed-in user.\n" },
  ]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-infer-review-")));
  try {
    mkdirSync(join(repoRoot, "src", "features", "auth"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "entities", "user"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "shared", "api"), { recursive: true });
    writeFileSync(
      join(repoRoot, "src", "features", "auth", "index.ts"),
      'import { user } from "../../entities/user";\nimport "@/shared/api/client";\nexport const auth = user;\n',
      "utf-8",
    );
    writeFileSync(join(repoRoot, "src", "entities", "user", "index.ts"), "export const user = true;\n", "utf-8");
    writeFileSync(join(repoRoot, "src", "shared", "api", "client.ts"), "export const client = true;\n", "utf-8");
    const readReviewVault = () => [
      readFileSync(join(vaultRoot, "capabilities", "auth.md"), "utf-8"),
      readFileSync(join(vaultRoot, "elements", "client.md"), "utf-8"),
      readFileSync(join(vaultRoot, "elements", "user.md"), "utf-8"),
    ];
    const before = readReviewVault();

    const { responses: firstResponses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot, reviewMode: "next" }),
    ]);
    const first = getCallParsed(firstResponses, 2);
    assert.deepEqual(getCallStructured(firstResponses, 2), first);
    assert.equal(first.contract, "inferImportsReview:v1");
    assert.equal(JSON.stringify(first).length < 5_120, true);
    assert.equal(first.nextReview.contract, "nextRelationReview:v1");
    assert.equal(first.nextReview.writeAllowed, false);
    assert.equal(first.nextReview.proposedAction, undefined);
    assert.equal(first.edges, undefined);
    assert.equal(first.moduleEdges, undefined);
    assert.equal(first.reconciliation, undefined);
    assert.deepEqual(readReviewVault(), before, "review must write zero vault bytes");

    const { responses: secondResponses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", {
        rootPath: repoRoot,
        reviewMode: "next",
        afterReviewId: first.nextReview.reviewId,
      }),
    ]);
    const second = getCallParsed(secondResponses, 2);
    assert.notEqual(second.nextReview.reviewId, first.nextReview.reviewId);
    assert.equal(second.nextReview.cursor.hasMore, false);
    assert.deepEqual(readReviewVault(), before, "cursor reads must remain side-effect free");
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports reviewMode next — fresh vault returns one endpoint-modelling packet without the full firehose", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-infer-fresh-review-")));
  try {
    mkdirSync(join(repoRoot, "source", "features", "alpha"), { recursive: true });
    mkdirSync(join(repoRoot, "source", "features", "beta"), { recursive: true });
    writeFileSync(
      join(repoRoot, "source", "features", "alpha", "index.ts"),
      'import { beta } from "../beta";\nexport const alpha = beta;\n',
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "source", "features", "beta", "index.ts"),
      "export const beta = true;\n",
      "utf-8",
    );

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot, reviewMode: "next" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(JSON.stringify(result).length < 5_120, true);
    assert.equal(result.nextReview.candidate.from, "capabilities/alpha");
    assert.equal(result.nextReview.candidate.to, "capabilities/beta");
    assert.deepEqual(result.nextReview.candidate.absentEndpoints, [
      "capabilities/alpha",
      "capabilities/beta",
    ]);
    assert.deepEqual(result.nextReview.nextCalls, []);
    assert.equal(result.nextReview.decision.questionEligibility, "blocked_missing_vault_endpoints");
    assert.equal(result.nextReview.endpointModelling.analysisCall.tool, "analyze_repo_structure");
    assert.deepEqual(result.nextReview.endpointModelling.analysisCall.arguments, { rootPath: repoRoot });
    assert.deepEqual(result.nextReview.endpointModelling.proposalValidation.requiredArguments, ["rootPath", "proposal"]);
    assert.deepEqual(result.nextReview.endpointModelling.proposalValidation.fieldsAfterKindDecision, {
      common: ["slug", "title", "definition", "evidence", "confidence"],
      byKind: {
        project: [],
        domain: [],
        capability: ["domain"],
        element: ["domain", "path"],
      },
    });
    assert.equal(result.nextReview.endpointModelling.proposalValidation.endpointDrafts.length, 2);
    assert.deepEqual(
      result.nextReview.endpointModelling.proposalValidation.endpointDrafts.map((draft) => ({
        endpoint: draft.endpoint,
        slugCandidate: draft.slugCandidate,
      })),
      [
        { endpoint: "capabilities/alpha", slugCandidate: "capabilities/alpha" },
        { endpoint: "capabilities/beta", slugCandidate: "capabilities/beta" },
      ],
    );
    assert.ok(result.nextReview.endpointModelling.proposalValidation.endpointDrafts.every(
      (draft) => draft.kindDecision === "human_meaning_required",
    ));
    assert.equal(result.nextReview.endpointModelling.resumeCall.tool, "infer_imports");
    assert.deepEqual(result.nextReview.endpointModelling.resumeCall.arguments, {
      rootPath: repoRoot,
      reviewMode: "next",
    });
    assert.equal(result.nextReview.endpointModelling.observedPathsByEndpoint.length, 2);
    assert.ok(result.nextReview.decision.required.includes("vault_endpoints"));
    assert.match(result.nextReview.decision.ask, /model.*endpoint.*before.*approval/i);
    assert.equal(result.nextReview.writeAllowed, false);
    assert.equal(result.edges, undefined);
    assert.equal(result.moduleEdges, undefined);
    assert.equal(result.reviewQueue.total, 1);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports reviewMode next — test-only type evidence stays visible without a product dependency approval question", async () => {
  const vaultRoot = makeVault([
    { slug: "capabilities/a", content: "---\nkind: capability\ntitle: A\n---\n\nA product ability.\n" },
    { slug: "capabilities/b", content: "---\nkind: capability\ntitle: B\n---\n\nA supporting ability.\n" },
  ]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-infer-test-scope-")));
  try {
    mkdirSync(join(repoRoot, "src", "features", "a"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "features", "b"), { recursive: true });
    writeFileSync(
      join(repoRoot, "src", "features", "a", "index.test.ts"),
      'import type { B } from "../b/index";\nexport const fixture: B = { ok: true };\n',
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "src", "features", "b", "index.ts"),
      'export type B = { ok: boolean };\n',
      "utf-8",
    );

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot, reviewMode: "next" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.nextReview.candidate.evidenceQualification.status, "product_value_not_observed");
    assert.equal(result.nextReview.candidate.evidenceQualification.productValueCount, 0);
    assert.equal(result.nextReview.candidate.sourceEvidence[0].sourceRole, "test");
    assert.equal(result.nextReview.candidate.sourceEvidence[0].importUsage, "type_only");
    assert.equal(result.nextReview.decision.questionEligibility, "additional_product_meaning_evidence_required");
    assert.match(result.nextReview.decision.ask, /do not ask.*approve.*depends_on.*import alone/i);
    assert.equal(result.nextReview.writeAllowed, false);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("index_project — repo analysis, import indexing, and vault validation expose one read-only plan", async () => {
  const vaultRoot = makeVault([
    {
      slug: "project",
      content: "---\nslug: sample-app\nkind: project\ntitle: Existing Sample App\n---\n",
    },
  ]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-index-")));
  try {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "sample-app", description: "Sample App" }, null, 2),
      "utf-8",
    );
    writeFileSync(repoRoot + "/README.md", "# Sample App\n\n## Auth\n\n", "utf-8");
    mkdirSync(join(repoRoot, "src", "features", "auth"), { recursive: true });
    mkdirSync(join(repoRoot, "src", "features", "billing"), { recursive: true });
    mkdirSync(join(repoRoot, "docs", "ontology", "capabilities"), { recursive: true });
    writeFileSync(
      join(repoRoot, "docs", "ontology", "capabilities", "auth.md"),
      [
        "---",
        "kind: capability",
        "title: Auth",
        "elements:",
        "  - src/features/auth",
        "---",
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "src", "features", "auth", "index.ts"),
      "import { billing } from '../billing';\nexport const auth = billing;\n",
      "utf-8",
    );
    writeFileSync(join(repoRoot, "src", "features", "billing", "index.ts"), "export const billing = true;\n", "utf-8");

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "index_project", { rootPath: repoRoot }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.mode, "plan");
    assert.equal(result.sideEffect, 0);
    assert.equal(result.rootPath, repoRoot);
    assert.equal(result.analyze.framework, "fsd");
    assert.equal(result.plan.concepts, 4);
    assert.deepEqual(result.plan.conceptDelta, {
      candidates: 4,
      existing: 1,
      ambiguous: 0,
      new: 3,
      limited: false,
      sampleAmbiguousSlugs: [],
      sampleNewSlugs: ["capabilities/auth", "capabilities/billing", "domains/auth"],
    });
    assert.equal(result.plan.suggestedRelations, 4);
    assert.ok(result.plan.importRelations >= 1);
    assert.equal(result.meaningGate.policy, "business-first");
    assert.equal(result.meaningGate.sourceStructureRole, "implementation-evidence");
    assert.equal(result.meaningGate.businessOntology.domains, 0);
    assert.equal(result.meaningGate.businessOntology.capabilities, 1);
    assert.equal(result.meaningGate.businessOntology.evidence, 1);
    assert.deepEqual(result.meaningGate.businessOntology.evidenceRows, [
      {
        slug: "capabilities/auth",
        kind: "capability",
        source: "docs/ontology/capabilities/auth.md",
      },
    ]);
    assert.equal(result.meaningGate.proposedBusinessOntology.domains, 1);
    assert.equal(result.meaningGate.proposedBusinessOntology.capabilities, 1);
    assert.equal(result.meaningGate.implementationEvidence.elements, 0);
    assert.equal(result.meaningGate.implementationEvidence.reviewRequiredCapabilities, 1);
    assert.deepEqual(result.meaningGate.implementationEvidence.reviewRequiredRows, [
      {
        slug: "capabilities/billing",
        reason: "implementation-only: source folder is implementation evidence, not proof of a shared capability meaning; add business outcome and stable responsibility evidence before promoting this capability",
        evidence: { source: "src/features/billing" },
      },
    ]);
    assert.equal(result.extractionContract.assertionPolicy.automaticBusinessAssertions, 0);
    assert.equal(result.extractionContract.assertionPolicy.humanApprovalRequired, true);
    assert.match(result.meaningGate.reviewQuestions[0], /business\/product/);
    assert.equal(result.validation.problemFiles, 0);
    assert.equal(result.next.applyTool, "add_concepts; add_relation only after semantic rationale + human approval");
    assert.match(result.next.review, /CLI apply never promotes inferred imports to depends_on/);
    assert.deepEqual(result.next.reviewCalls, [
      {
        tool: "analyze_repo_structure",
        arguments: { rootPath: repoRoot },
      },
      {
        tool: "infer_imports",
        arguments: { rootPath: repoRoot },
      },
    ]);
    assert.equal(existsSync(join(vaultRoot, "sample-app.md")), false);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("index_project — Python package and import boundaries reach the public read-only plan", async () => {
  const vaultRoot = makeVault([]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-index-python-")));
  try {
    writeFileSync(
      join(repoRoot, "README.rst"),
      "Protocol Client\n###############\n\nA standardized diagnostic protocol client.\n",
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "setup.py"),
      [
        "setup(",
        "    name='protocol-client',",
        "    description='Standardized diagnostic protocol client',",
        "    python_requires='>=3.9',",
        ")",
      ].join("\n"),
      "utf-8",
    );
    mkdirSync(join(repoRoot, "diagnostic_client"), { recursive: true });
    writeFileSync(join(repoRoot, "diagnostic_client", "__init__.py"), "", "utf-8");
    mkdirSync(join(repoRoot, "diagnostic_client", "services"), { recursive: true });
    writeFileSync(join(repoRoot, "diagnostic_client", "Request.py"), "", "utf-8");
    writeFileSync(join(repoRoot, "diagnostic_client", "connections.py"), "", "utf-8");
    writeFileSync(join(repoRoot, "diagnostic_client", "services", "__init__.py"), "", "utf-8");
    writeFileSync(
      join(repoRoot, "diagnostic_client", "client.py"),
      [
        "from diagnostic_client import Request, services",
        "from diagnostic_client.connections import BaseConnection",
      ].join("\n"),
      "utf-8",
    );

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "index_project", { rootPath: repoRoot }),
      callTool(3, "analyze_repo_structure", { rootPath: repoRoot }),
      callTool(4, "infer_imports", { rootPath: repoRoot, reconcile: false }),
    ]);
    const result = getCallParsed(responses, 2);
    const analyze = getCallParsed(responses, 3);
    const imports = getCallParsed(responses, 4);

    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.deepEqual(getCallStructured(responses, 3), analyze);
    assert.deepEqual(getCallStructured(responses, 4), imports);
    assert.deepEqual(result.analyze.project, {
      slug: "protocol-client",
      title: "Protocol Client",
      definition: "Proposed repository purpose from README.rst: A standardized diagnostic protocol client.",
      evidence: ["README.rst"],
      includes: ["repository-contained implementation evidence"],
      excludes: [],
      confidence: 0.5,
      uncertainty: "proposal-only: source prose is a bounded purpose witness, not a shared business assertion. Unknowns: shared business ownership is not established by repository evidence; runtime, test, and external-system behavior remain outside this bounded scan.",
    });
    assert.equal(result.analyze.elements, 5);
    assert.equal(result.plan.concepts, 6);
    assert.deepEqual(result.plan.conceptDelta.sampleNewSlugs, [
      "elements/client",
      "elements/connections",
      "elements/diagnostic-client",
      "elements/request",
      "elements/services",
      "protocol-client",
    ]);
    assert.deepEqual(
      result.semanticEvidence.map((row) => [row.source, row.role]),
      [
        ["README.rst", "mission"],
        ["setup.py", "package-contract"],
      ],
    );
    assert.equal(result.imports.filesScanned, 5);
    assert.equal(result.imports.moduleEdges, 3);
    assert.equal(result.plan.importRelations, 3);
    assert.deepEqual(
      analyze.elements.map((row) => [row.slug, row.path]).sort(),
      [
        ["elements/client", "diagnostic_client/client.py"],
        ["elements/connections", "diagnostic_client/connections.py"],
        ["elements/diagnostic-client", "diagnostic_client"],
        ["elements/request", "diagnostic_client/Request.py"],
        ["elements/services", "diagnostic_client/services"],
      ],
    );
    assert.equal(analyze.capabilities.length, 0);
    assert.ok(
      imports.edges.some(
        (edge) =>
          edge.from === "diagnostic_client/client.py" &&
          edge.to === "diagnostic_client/services/__init__.py" &&
          edge.kind === "static",
      ),
    );
    assert.equal(existsSync(join(vaultRoot, "protocol-client.md")), false);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports — Python package-internal symlink escape is rejected at the MCP boundary", async () => {
  const vaultRoot = makeVault([]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-index-python-symlink-")));
  const outsideRoot = mkdtempSync(join(tmpdir(), "ontology-atlas-index-python-outside-"));
  try {
    mkdirSync(join(repoRoot, "pkg"), { recursive: true });
    writeFileSync(join(repoRoot, "pkg", "__init__.py"), "", "utf-8");
    writeFileSync(
      join(repoRoot, "pkg", "client.py"),
      "from pkg.escaped import Secret\n",
      "utf-8",
    );
    writeFileSync(join(outsideRoot, "__init__.py"), "", "utf-8");
    symlinkSync(outsideRoot, join(repoRoot, "pkg", "escaped"));

    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "infer_imports", { rootPath: repoRoot, reconcile: false }),
    ]);
    const result = getCallParsed(responses, 2);

    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(
      result.edges.some((edge) => edge.to === "pkg/escaped/__init__.py"),
      false,
    );
    assert.equal(
      result.moduleEdges.some((edge) => edge.to === "elements/escaped"),
      false,
    );
    assert.ok(
      result.unresolved.some(
        (row) =>
          row.from === "pkg/client.py" &&
          row.spec === "pkg.escaped" &&
          row.reason === "alias-not-found",
      ),
    );
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

await test("index_project — ambiguous aliases stay in review instead of becoming new concepts", async () => {
  const vaultRoot = makeVault([
    {
      slug: "domains/shared",
      content: "---\nkind: domain\ntitle: Shared Domain\n---\n",
    },
    {
      slug: "capabilities/shared",
      content: "---\nkind: capability\ntitle: Shared Capability\ndomain: domains/shared\n---\n",
    },
  ]);
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-index-ambiguous-")));
  try {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "shared", description: "Shared" }, null, 2),
      "utf-8",
    );
    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "index_project", {
        rootPath: repoRoot,
        skipImports: true,
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(result.plan.conceptDelta, {
      candidates: 1,
      existing: 0,
      ambiguous: 1,
      new: 0,
      limited: false,
      sampleAmbiguousSlugs: ["shared"],
      sampleNewSlugs: [],
    });
    assert.match(result.next.review, /manually resolve ambiguous aliases/);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("query_ontology — compiled graph engine neighbors/path/all_paths/query_plan/centrality/communities/similar_nodes/explain_relation/reachability/pattern_walk/impact/blast_radius/subgraph/overview/schema/facets/match_nodes/match_edges/node_profile/domain_profile/domain_matrix/project_scope/project_map/relation_check/components/lineage/containment_tree/cycles/topological_order/recommend_relations/growth_plan/maintenance_plan/agent_brief/workspace_brief/health", async () => {
  const root = makeVault([
    {
      slug: "project",
      content: "---\nkind: project\ntitle: Project\ndomains: [auth-domain]\n---\n",
    },
    {
      slug: "domains/auth",
      content: "---\nslug: auth-domain\nkind: domain\ntitle: Auth\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndomain: auth-domain\ndepends_on: [auth-domain]\nelements: [src/auth/login.ts]\n---\n",
    },
    {
      slug: "capabilities/session",
      content:
        "---\nkind: capability\ntitle: Session\ndepends_on: [capabilities/login]\n---\n",
    },
  ]);
  try {
    mkdirSync(join(root, ".ontology-atlas"), { recursive: true });
    writeFileSync(join(root, ".ontology-atlas", "project-sources.json"), JSON.stringify({
      contractVersion: 1,
      bindings: [{
        projectSlug: "project",
        sourceId: "src_fixture",
        rootPath: "/private/fixture/root",
        kind: "git",
        boundAt: "2026-08-02T09:00:00.000Z",
        receipt: {
          contractVersion: 1,
          projectSlug: "project",
          sourceId: "src_fixture",
          sourceKind: "git",
          sourceRevision: "abc123",
          sourceFingerprint: "git:abc123:clean",
          graphHash: "old-graph",
          measuredAt: "2026-08-02T10:00:00.000Z",
          status: "verified_current",
          currentness: "current",
          topGap: null,
          nextAction: { id: "use_current_evidence" },
          witnessSummary: { total: 1, supported: 1, missing: 0 },
          witnesses: [{ id: "login", nodeSlug: "capabilities/login", role: "implementation", path: "src/auth/login.ts", supported: true }],
          diagnostics: { dirty: false, truncated: false },
        },
      }],
    }));
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "neighbors",
        slug: "auth-domain",
        direction: "incoming",
        types: ["dependencies"],
      }),
      callTool(3, "query_ontology", {
        operation: "path",
        from: "capabilities/session",
        to: "auth-domain",
      }),
      callTool(4, "query_ontology", {
        operation: "all_paths",
        from: "capabilities/session",
        to: "auth-domain",
      }),
      callTool(5, "query_ontology", {
        operation: "explain_relation",
        from: "capabilities/session",
        to: "auth-domain",
      }),
      callTool(6, "query_ontology", {
        operation: "reachability",
        slug: "capabilities/session",
        depth: 3,
        types: ["dependencies"],
      }),
      callTool(7, "query_ontology", {
        operation: "pattern_walk",
        slug: "project",
        pattern: ["domains"],
      }),
      callTool(8, "query_ontology", {
        operation: "impact",
        slug: "domains/auth",
        depth: 2,
      }),
      callTool(9, "query_ontology", {
        operation: "blast_radius",
        slug: "domains/auth",
        depth: 2,
      }),
      callTool(10, "query_ontology", {
        operation: "subgraph",
        slug: "auth-domain",
        depth: 2,
        direction: "incoming",
      }),
      callTool(11, "query_ontology", {
        operation: "overview",
        limit: 2,
      }),
      callTool(12, "query_ontology", {
        operation: "schema",
      }),
      callTool(13, "query_ontology", {
        operation: "facets",
        limit: 2,
      }),
      callTool(14, "query_ontology", {
        operation: "match_nodes",
        kind: "capability",
        minInDegree: 1,
        sort: "inDegree",
      }),
      callTool(15, "query_ontology", {
        operation: "match_edges",
        fromKind: "capability",
        type: "depends_on",
        toKind: "domain",
      }),
      callTool(16, "query_ontology", {
        operation: "node_profile",
        slug: "capabilities/login",
      }),
      callTool(17, "query_ontology", {
        operation: "domain_profile",
        slug: "auth-domain",
      }),
      callTool(18, "query_ontology", {
        operation: "domain_matrix",
        project: "project",
        types: ["depends_on"],
      }),
      callTool(19, "query_ontology", {
        operation: "project_scope",
      }),
      callTool(20, "query_ontology", {
        operation: "project_map",
      }),
      callTool(21, "query_ontology", {
        operation: "relation_check",
        from: "capabilities/session",
        to: "auth-domain",
        type: "depends_on",
      }),
      callTool(22, "query_ontology", {
        operation: "components",
      }),
      callTool(23, "query_ontology", {
        operation: "lineage",
        slug: "auth-domain",
      }),
      callTool(24, "query_ontology", {
        operation: "containment_tree",
        slug: "auth-domain",
      }),
      callTool(25, "query_ontology", {
        operation: "cycles",
      }),
      callTool(26, "query_ontology", {
        operation: "topological_order",
      }),
      callTool(27, "query_ontology", {
        operation: "recommend_relations",
      }),
      callTool(28, "query_ontology", {
        operation: "growth_plan",
      }),
      callTool(29, "query_ontology", {
        operation: "workspace_brief",
      }),
      callTool(30, "query_ontology", {
        operation: "health",
      }),
      callTool(80, "query_ontology", {
        operation: "health",
        componentLimit: 1,
        cycleLimit: 1,
        recommendationLimit: 1,
        orderLimit: 1,
        dependencyTypes: ["dependencies"],
        componentTypes: ["domain", "contains"],
      }),
      callTool(31, "query_ontology", {
        operation: "query_plan",
        targetOperation: "all_paths",
        from: "capabilities/session",
        to: "auth-domain",
        maxHops: 3,
        types: ["depends_on"],
      }),
      callTool(32, "query_ontology", {
        operation: "centrality",
        types: ["depends_on"],
        limit: 2,
      }),
      callTool(33, "query_ontology", {
        operation: "communities",
        types: ["depends_on"],
        limit: 3,
      }),
      callTool(34, "query_ontology", {
        operation: "similar_nodes",
        candidateSlug: "capabilities/login-flow",
        title: "Login",
        kind: "capability",
        domain: "auth-domain",
        limit: 2,
      }),
      callTool(35, "query_ontology", {
        operation: "maintenance_plan",
        limit: 5,
      }),
      callTool(36, "query_ontology", {
        operation: "agent_brief",
        project: "project",
        limit: 5,
      }),
    ]);
    const neighbors = getCallParsed(responses, 2);
    assert.deepEqual(neighbors.nodes.map((node) => node.slug), ["capabilities/login"]);
    assert.equal(neighbors.compiledSummary.nodes, 4);

    const path = getCallParsed(responses, 3);
    assert.equal(path.found, true);
    assert.deepEqual(path.hops, [
      "capabilities/session",
      "capabilities/login",
      "domains/auth",
    ]);

    const allPaths = getCallParsed(responses, 4);
    assert.equal(allPaths.operation, "all_paths");
    assert.equal(allPaths.found, true);
    assert.equal(allPaths.totalPaths, 2);
    assert.deepEqual(allPaths.byLength, { 2: 2 });

    const explanation = getCallParsed(responses, 5);
    assert.equal(explanation.operation, "explain_relation");
    assert.equal(explanation.verdict, "path");
    assert.equal(explanation.shortestPath.hopCount, 2);
    assert.deepEqual(explanation.commonNeighbors.rows.map((row) => row.slug), [
      "capabilities/login",
    ]);

    const reachability = getCallParsed(responses, 6);
    assert.equal(reachability.operation, "reachability");
    assert.equal(reachability.start, "capabilities/session");
    assert.equal(reachability.summary.reachableNodes, 2);
    assert.deepEqual(
      reachability.layers.map((layer) => ({
        distance: layer.distance,
        nodes: layer.nodes.map((node) => node.slug),
      })),
      [
        { distance: 1, nodes: ["capabilities/login"] },
        { distance: 2, nodes: ["domains/auth"] },
      ],
    );

    const patternWalk = getCallParsed(responses, 7);
    assert.equal(patternWalk.operation, "pattern_walk");
    assert.equal(patternWalk.start, "project");
    assert.deepEqual(patternWalk.pattern, ["domains"]);
    assert.deepEqual(patternWalk.endNodes.map((node) => node.slug), ["domains/auth"]);
    assert.deepEqual(patternWalk.paths.rows.map((row) => row.path), [
      ["project", "domains/auth"],
    ]);

    const impact = getCallParsed(responses, 8);
    assert.deepEqual(
      impact.nodes.map((row) => ({ slug: row.slug, distance: row.distance })),
      [
        { slug: "capabilities/login", distance: 1 },
        { slug: "capabilities/session", distance: 2 },
      ],
    );

    const blastRadius = getCallParsed(responses, 9);
    assert.equal(blastRadius.operation, "blast_radius");
    assert.equal(blastRadius.center, "domains/auth");
    assert.equal(blastRadius.risk, "unknown");
    assert.deepEqual(blastRadius.qualification, {
      status: "review_required",
      basis: "declared_dependencies",
      completeness: "unknown",
      sourceBacked: false,
      declaredEdges: 2,
      declaredWithRationaleEdges: 0,
      reviewRequiredEdges: 2,
      sourceBackedEdges: 0,
    });
    assert.deepEqual(blastRadius.summary, {
      affectedNodes: 2,
      affectedEdges: 2,
      affectedKinds: 1,
      affectedDomains: 1,
      crossDomainEdges: 0,
    });
    assert.deepEqual(blastRadius.byKind, { capability: 2 });
    assert.deepEqual(blastRadius.byDomain, { "domains/auth": 1 });

    const subgraph = getCallParsed(responses, 10);
    assert.equal(subgraph.seed, "domains/auth");
    assert.deepEqual(subgraph.nodes.map((row) => row.slug), [
      "domains/auth",
      "capabilities/login",
      "project",
      "capabilities/session",
    ]);
    assert.equal(subgraph.edges.length, 4);

    const overview = getCallParsed(responses, 11);
    assert.equal(overview.graph.nodes, 4);
    assert.equal(overview.byKind.capability, 2);
    assert.equal(overview.byKind.project, 1);
    assert.deepEqual(overview.hubs.map((hub) => hub.slug), [
      "capabilities/login",
      "domains/auth",
    ]);

    const schema = getCallParsed(responses, 12);
    assert.equal(schema.totalPatterns, 5);
    assert.ok(
      schema.patterns.some(
        (pattern) =>
          pattern.fromKind === "capability" &&
          pattern.relation === "dependencies" &&
          pattern.toKind === "domain",
      ),
    );

    const facets = getCallParsed(responses, 13);
    assert.equal(facets.operation, "facets");
    assert.equal(facets.graph.nodes, 4);
    assert.equal(facets.nodes.byKind.capability, 2);
    assert.equal(facets.nodes.byKind.project, 1);
    assert.equal(facets.edges.byResolution.external, 1);

    const matchNodes = getCallParsed(responses, 14);
    assert.equal(matchNodes.operation, "match_nodes");
    assert.deepEqual(matchNodes.nodes.map((node) => node.slug), ["capabilities/login"]);
    assert.equal(matchNodes.nodes[0].inDegree, 1);

    const matchEdges = getCallParsed(responses, 15);
    assert.equal(matchEdges.operation, "match_edges");
    assert.equal(matchEdges.totalMatches, 1);
    assert.deepEqual(matchEdges.edges.map((edge) => `${edge.from}->${edge.to}:${edge.via}`), [
      "capabilities/login->domains/auth:dependencies",
    ]);

    const nodeProfile = getCallParsed(responses, 16);
    assert.equal(nodeProfile.operation, "node_profile");
    assert.equal(nodeProfile.center, "capabilities/login");
    assert.deepEqual(nodeProfile.degree, { in: 1, out: 3, total: 4 });
    assert.equal(nodeProfile.edges.outgoing.total, 3);

    const domainProfile = getCallParsed(responses, 17);
    assert.equal(domainProfile.operation, "domain_profile");
    assert.equal(domainProfile.domain, "domains/auth");
    assert.deepEqual(domainProfile.parents.projects.map((project) => project.slug), ["project"]);
    assert.equal(domainProfile.summary.nodes, 2);
    assert.equal(domainProfile.summary.capabilities, 1);
    assert.equal(domainProfile.summary.internalEdges, 2);
    assert.equal(domainProfile.summary.externalEdges, 1);
    assert.deepEqual(domainProfile.capabilities.nodes.map((node) => node.slug), [
      "capabilities/login",
    ]);

    const domainMatrix = getCallParsed(responses, 18);
    assert.equal(domainMatrix.operation, "domain_matrix");
    assert.equal(domainMatrix.project, "project");
    assert.deepEqual(domainMatrix.filters, {
      types: ["dependencies"],
      relationTypes: ["depends_on"],
    });
    assert.equal(domainMatrix.summary.domains, 1);
    assert.equal(domainMatrix.summary.crossDomainEdges, 0);
    assert.equal(domainMatrix.summary.externalEdges, 0);

    const projectScope = getCallParsed(responses, 19);
    assert.equal(projectScope.operation, "project_scope");
    assert.equal(projectScope.project, "project");
    assert.equal(projectScope.summary.nodes, 3);
    assert.equal(projectScope.summary.internalEdges, 3);
    assert.equal(projectScope.summary.externalEdges, 1);

    const projectMap = getCallParsed(responses, 20);
    assert.equal(projectMap.operation, "project_map");
    assert.equal(projectMap.project, "project");
    assert.equal(projectMap.summary.nodes, 3);
    assert.equal(projectMap.summary.domains, 1);
    assert.equal(projectMap.summary.capabilities, 1);
    assert.equal(projectMap.summary.externalEdges, 1);
    assert.deepEqual(projectMap.domains.map((domain) => domain.slug), ["domains/auth"]);
    assert.deepEqual(projectMap.domains[0].capabilities.nodes.map((node) => node.slug), [
      "capabilities/login",
    ]);

    const relationCheck = getCallParsed(responses, 21);
    assert.equal(relationCheck.relation, "dependencies");
    assert.equal(relationCheck.exists, false);
    assert.equal(relationCheck.verdict, "matches_existing_schema");
    assert.equal(relationCheck.recommendation.decision, "safe_to_add");
    assert.equal(relationCheck.schemaPattern.toKind, "domain");
    assert.ok(Array.isArray(relationCheck.inverseEdges));
    assert.equal(relationCheck.proposedAction, null);
    assert.deepEqual(relationCheck.approvalGate, {
      status: "semantic_approval_required",
      writeAllowed: false,
      required: ["observable_ability", "semantic_rationale", "explicit_human_approval", "why"],
      next: "Explain which observable ability fails without the target, ask for approval of the exact direction and rationale, then call add_relation with a nonblank why.",
    });
    assert.ok(Array.isArray(relationCheck.nearbyPatterns));

    const components = getCallParsed(responses, 22);
    assert.equal(components.totalComponents, 1);
    assert.equal(components.largestSize, 4);
    assert.equal(components.singletonCount, 0);
    assert.deepEqual(components.components[0].nodes.map((node) => node.slug), [
      "capabilities/login",
      "capabilities/session",
      "domains/auth",
      "project",
    ]);

    const lineage = getCallParsed(responses, 23);
    assert.equal(lineage.center, "domains/auth");
    assert.equal(lineage.ancestors.total, 1);
    assert.deepEqual(lineage.ancestors.nodes.map((row) => row.slug), ["project"]);
    assert.deepEqual(lineage.descendants.nodes.map((row) => row.slug), [
      "capabilities/login",
    ]);

    const containmentTree = getCallParsed(responses, 24);
    assert.equal(containmentTree.operation, "containment_tree");
    assert.equal(containmentTree.root, "domains/auth");
    assert.deepEqual(containmentTree.roots[0].children.map((child) => child.slug), [
      "capabilities/login",
    ]);

    const cycles = getCallParsed(responses, 25);
    assert.equal(cycles.totalCycles, 0);
    assert.deepEqual(cycles.relationTypes, ["dependencies"]);

    const topologicalOrder = getCallParsed(responses, 26);
    assert.equal(topologicalOrder.acyclic, true);
    assert.deepEqual(topologicalOrder.order.map((row) => row.slug), [
      "domains/auth",
      "capabilities/login",
      "capabilities/session",
    ]);

    const recommendations = getCallParsed(responses, 27);
    assert.equal(recommendations.totalRecommendations, 1);
    assert.deepEqual(recommendations.recommendations.map((row) => row.proposedAction.args), [
      {
        from: "domains/auth",
        to: "capabilities/login",
        type: "capabilities",
      },
    ]);

    const growthPlan = getCallParsed(responses, 28);
    assert.equal(growthPlan.operation, "growth_plan");
    assert.equal(growthPlan.summary.relationRecommendations, 1);
    assert.equal(growthPlan.summary.externalElementRefs, 1);
    assert.equal(growthPlan.summary.danglingReferences, 0);
    assert.equal(growthPlan.summary.totalActions, 2);

    const workspaceBrief = getCallParsed(responses, 29);
    assert.equal(workspaceBrief.operation, "workspace_brief");
    assert.equal(workspaceBrief.status, "needs_attention");
    assert.equal(workspaceBrief.summary.nodes, 4);
    assert.equal(workspaceBrief.summary.projects, 1);
    assert.equal(workspaceBrief.summary.growthActions, 2);
    assert.deepEqual(workspaceBrief.projects.maps.map((project) => project.project), ["project"]);
    assert.ok(workspaceBrief.nextActions.some((action) => action.kind === "materialize_external_elements"));

    const health = getCallParsed(responses, 30);
    assert.equal(health.operation, "health");
    assert.equal(health.status, "needs_attention");
    assert.equal(health.summary.nodes, 4);
    assert.equal(health.summary.dependencyCycles, 0);
    assert.equal(health.summary.relationRecommendations, 1);
    assert.equal(health.checks.find((check) => check.id === "relation_recommendations").status, "warn");

    const tunedHealth = getCallParsed(responses, 80);
    assert.equal(tunedHealth.operation, "health");
    assert.equal(tunedHealth.summary.nodes, 4);

    const queryPlan = getCallParsed(responses, 31);
    assert.equal(queryPlan.operation, "query_plan");
    assert.equal(queryPlan.targetOperation, "all_paths");
    assert.equal(queryPlan.sideEffect, false);
    assert.equal(queryPlan.normalized.from, "capabilities/session");
    assert.equal(queryPlan.normalized.to, "domains/auth");
    assert.deepEqual(queryPlan.normalized.types, ["dependencies"]);
    assert.equal(queryPlan.estimate.strategy, "bounded_path_enumeration");
    assert.equal(queryPlan.estimate.edgeScans, 4);
    assert.equal(queryPlan.estimate.costClass, "low");
    assert.equal(queryPlan.normalized.limit, 25);

    const centrality = getCallParsed(responses, 32);
    assert.equal(centrality.operation, "centrality");
    assert.equal(centrality.graph.nodes, 4);
    assert.equal(centrality.graph.resolvedEdges, 2);
    assert.deepEqual(centrality.rankings.pageRank.map((row) => row.slug), [
      "domains/auth",
      "capabilities/login",
    ]);
    assert.deepEqual(centrality.rankings.bridges.map((row) => row.slug), [
      "capabilities/login",
      "domains/auth",
    ]);

    const communities = getCallParsed(responses, 33);
    assert.equal(communities.operation, "communities");
    assert.equal(communities.summary.communities, 2);
    assert.equal(communities.summary.largestSize, 3);
    assert.deepEqual(communities.communities[0].nodes.map((node) => node.slug), [
      "capabilities/login",
      "capabilities/session",
      "domains/auth",
    ]);

    const similarNodes = getCallParsed(responses, 34);
    assert.equal(similarNodes.operation, "similar_nodes");
    assert.equal(similarNodes.source.mode, "candidate");
    assert.deepEqual(similarNodes.matches.map((row) => row.node.slug), [
      "capabilities/login",
      "capabilities/session",
    ]);
    assert.equal(similarNodes.matches[0].signals.title, 0.35);

    const maintenancePlan = getCallParsed(responses, 35);
    assert.equal(maintenancePlan.operation, "maintenance_plan");
    assert.equal(maintenancePlan.sideEffect, false);
    assert.equal(maintenancePlan.summary.relationRecommendations, 1);
    assert.equal(maintenancePlan.summary.externalElementRefs, 1);
    assert.equal(maintenancePlan.cursor.found, true);
    assert.equal(maintenancePlan.cursor.reason, null);
    assert.equal(maintenancePlan.byKind.add_missing_relation, 1);
    assert.deepEqual(maintenancePlan.actions.slice(0, 2).map((action) => action.kind), [
      "add_missing_relation",
      "materialize_external_element",
    ]);
    assert.match(maintenancePlan.actions[0].id, /^maint_[a-f0-9]{8}$/);
    assert.match(maintenancePlan.cursor.nextAfterActionId, /^maint_[a-f0-9]{8}$/);
    assert.equal(maintenancePlan.actions[0].executable, true);

    const agentBrief = getCallParsed(responses, 36);
    assert.equal(agentBrief.operation, "agent_brief");
    assert.equal(agentBrief.sideEffect, false);
    assert.equal(agentBrief.status, "needs_attention");
    assert.equal(agentBrief.readiness.status, "needs_shape");
    assert.equal(agentBrief.readiness.meaningfulNodes, 2);
    assert.equal(agentBrief.graph.nodes, 3);
    assert.equal(agentBrief.graph.projects, 1);
    assert.doesNotMatch(JSON.stringify(agentBrief.entrypoints), /capabilities\/session/);
    assert.doesNotMatch(JSON.stringify(agentBrief.businessOntologyLens), /capabilities\/session/);
    assert.ok(
      agentBrief.health.validation.problems.some((problem) => problem.slug === "capabilities/session"),
      "full detail keeps whole-vault validation findings even when graph guidance is project-scoped",
    );
    assert.equal(agentBrief.projectSlug, "project");
    assert.equal(agentBrief.projectSource.status, "review_required");
    assert.equal(agentBrief.projectSource.currentness, "stale");
    assert.equal(agentBrief.projectSource.topGap.id, "ontology_changed");
    assert.equal(agentBrief.projectSource.receipt.contractVersion, 1);
    assert.doesNotMatch(JSON.stringify(agentBrief.projectSource), /\/private\/fixture\/root/);
    assert.deepEqual(agentBrief.firstCalls.map((call) => call.arguments.operation), [
      "workspace_brief",
      "health",
      "query_plan",
      "node_profile",
      "relation_check",
    ]);
    assert.equal(agentBrief.firstCalls[4].arguments.from, "domains/auth");
    assert.equal(agentBrief.firstCalls[4].arguments.to, "capabilities/login");
    assert.equal(agentBrief.firstCalls[4].arguments.type, "depends_on");
    assert.equal(agentBrief.businessOntologyLens.policy, "business-first");
    assert.deepEqual(agentBrief.businessOntologyLens.readOrder, ["outcome", "domain", "capability", "element"]);
    assert.ok(agentBrief.businessOntologyLens.businessDomains.includes("domains/auth"));
    assert.ok(agentBrief.businessOntologyLens.capabilityOutcomes.includes("capabilities/login"));
    assert.deepEqual(agentBrief.businessOntologyLens.decisionQuestions, [
      "What business outcome should this ontology explain or improve?",
      "Which business/product domain boundary does this code change?",
      "What capability claim can a planner, marketer, or leader discuss?",
      "Which implementation evidence proves or disproves that capability?",
    ]);
    assert.match(
      agentBrief.businessOntologyLens.guidance.join("\n"),
      /do not treat paths, APIs, routes, or commands as the ontology root/i,
    );
    const hasCliFallback = (suffix) => agentBrief.cliFallbackCommands.some((command) => command.endsWith(suffix));
    assert.ok(agentBrief.cliFallbackCommands.every((command) => !command.startsWith("ontology-atlas ")));
    assert.ok(hasCliFallback(" facets [vault] --limit 10"));
    assert.ok(hasCliFallback(" schema [vault] --limit 20"));
    assert.ok(hasCliFallback(" hubs [vault] --plan --limit 10 --types depends_on,relates"));
    assert.ok(hasCliFallback(" domain-matrix [vault] --limit 10"));
    assert.ok(hasCliFallback(" match-nodes [vault] --plan --kind capability --min-degree 2 --sort degree --limit 10"));
    assert.ok(hasCliFallback(" match-edges [vault] --plan --types depends_on --limit 20"));
    assert.ok(hasCliFallback(" all-paths domains/auth capabilities/login [vault] --plan --force --max-hops 3 --types depends_on,relates --search-budget 1000 --limit 10"));
    assert.ok(agentBrief.cliFallbackCommands.some((command) => /(?:^|\s)pattern-walk(?:\s|$)/.test(command)));
    assert.ok(agentBrief.cliFallbackCommands.some((command) => /(?:^|\s)project-map(?:\s|$)/.test(command)));
    assert.ok(hasCliFallback(" explain domains/auth capabilities/login [vault] --direction undirected --max-hops 5 --types depends_on,relates --limit 10"));
    assert.deepEqual(agentBrief.graphDbQueryPack.map((item) => item.id), [
      "graph_facets",
      "node_scan",
      "edge_scan",
      "domain_coupling",
      "path_evidence",
      "business_questions",
    ]);
    assert.deepEqual(agentBrief.graphDbQueryPack.flatMap((item) => item.calls).map((call) => call.arguments.operation), [
      "facets",
      "schema",
      "query_plan",
      "match_nodes",
      "query_plan",
      "match_edges",
      "domain_matrix",
      "query_plan",
      "centrality",
      "query_plan",
      "all_paths",
      "explain_relation",
      "facets",
      "query_plan",
      "match_nodes",
      "domain_matrix",
      "query_plan",
      "match_nodes",
      "query_plan",
      "match_edges",
    ]);
    assert.deepEqual(agentBrief.playbooks.map((playbook) => playbook.id), [
      "refactor_impact",
      "onboarding_map",
      "coupling_audit",
      "graph_traversal",
    ]);
    assert.equal(agentBrief.playbooks[0].calls[3].arguments.operation, "blast_radius");
    assert.deepEqual(agentBrief.playbooks[1].calls.map((call) => call.arguments.operation), [
      "workspace_brief",
      "domain_matrix",
      "query_plan",
      "match_nodes",
      "node_profile",
    ]);
    assert.equal(agentBrief.playbooks[1].calls[2].arguments.targetOperation, "match_nodes");
    assert.equal(agentBrief.playbooks[1].calls[2].arguments.kind, "capability");
    assert.equal(agentBrief.playbooks[1].calls[3].arguments.minDegree, 2);
    assert.deepEqual(agentBrief.playbooks[2].calls.map((call) => call.arguments.operation), [
      "health",
      "domain_matrix",
      "query_plan",
      "centrality",
      "query_plan",
      "match_edges",
    ]);
    assert.equal(agentBrief.playbooks[2].calls[4].arguments.targetOperation, "match_edges");
    assert.deepEqual(agentBrief.playbooks[2].calls[5].arguments.types, ["depends_on"]);
    assert.deepEqual(agentBrief.playbooks[3].calls.map((call) => call.arguments.operation), [
      "schema",
      "query_plan",
      "all_paths",
      "pattern_walk",
      "project_map",
    ]);
    assert.equal(agentBrief.playbooks[3].calls[1].arguments.targetOperation, "all_paths");
    assert.equal(agentBrief.playbooks[3].calls[1].arguments.searchBudget, 1000);
    assert.equal(agentBrief.playbooks[3].calls[2].arguments.searchBudget, 1000);
    assert.ok(agentBrief.entrypoints.some((entrypoint) => entrypoint.slug === "domains/auth"));
    assert.deepEqual(agentBrief.writeGuardrails.map((guardrail) => guardrail.id), [
      "preflight_relation",
      "preflight_rename",
      "post_change_sync",
    ]);
    assert.deepEqual(agentBrief.writeGuardrails[0].calls.map((call) => call.arguments.operation), [
      "relation_check",
      "path",
    ]);
    assert.equal(agentBrief.writeGuardrails[1].calls[0].tool, "find_backlinks");
    assert.deepEqual(agentBrief.writeGuardrails[2].calls.map((call) => call.arguments?.operation ?? call.tool), [
      "health",
      "cycles",
      "growth_plan",
      "maintenance_plan",
      "validate_vault",
    ]);
    assert.deepEqual(agentBrief.relationDecisionGuide.map((row) => row.decision), [
      "skip_existing",
      "review_inverse",
      "safe_to_add",
      "review_new_schema",
    ]);
    assert.match(agentBrief.writePolicy.join("\n"), /Run read tools first/);
    assert.match(agentBrief.writePolicy.join("\n"), /relationDecisionGuide/);
    assert.match(agentBrief.writePolicy.join("\n"), /find_backlinks before rename_concept/);
    assert.match(agentBrief.writePolicy.join("\n"), /Definition\/Includes.*not exhaustive.*only\/all\/every\/exactly/);
    assert.match(agentBrief.writePolicy.join("\n"), /bounded packet.*same atomic claim.*measurement qualifier/);
    assert.match(agentBrief.handoffPrompt, /Definition\/Includes.*not exhaustive.*only\/all\/every\/exactly/s);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology health/workspace_brief/agent_brief — summary history is batched and reused", async () => {
  if (process.platform === "win32") return;
  const root = makeVault([
    {
      slug: "project",
      content: "---\nkind: project\ntitle: Project\ndomains: [domains/core]\n---\n\n# Project\n",
    },
    {
      slug: "domains/core",
      content: "---\nkind: domain\ntitle: Core\ncapabilities: [capabilities/run]\n---\n\n# Core\n\nStable meaning.\n",
    },
    {
      slug: "capabilities/run",
      content: "---\nkind: capability\ntitle: Run\ndomain: domains/core\n---\n\n# Run\n",
    },
  ]);
  const wrapper = makeGitTraceWrapper();
  const realGit = realpathSync("/usr/bin/git");
  try {
    execFileSync(realGit, ["-C", root, "init", "--quiet"]);
    execFileSync(realGit, ["-C", root, "config", "user.email", "atlas@example.invalid"]);
    execFileSync(realGit, ["-C", root, "config", "user.name", "Ontology Atlas"]);
    execFileSync(realGit, ["-C", root, "add", "."]);
    execFileSync(realGit, ["-C", root, "commit", "--quiet", "-m", "initial ontology"], {
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
        GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
      },
    });
    writeFileSync(
      join(root, "domains/core.md"),
      "---\nuid: 00000000-0000-4000-8000-000000000002\nkind: domain\ntitle: Core\ncapabilities: [capabilities/run, capabilities/review]\n---\n\n# Core\n\nStable meaning.\n",
      "utf8",
    );
    writeFileSync(
      join(root, "capabilities/review.md"),
      "---\nuid: 00000000-0000-4000-8000-000000000004\nkind: capability\ntitle: Review\ndomain: domains/core\n---\n\n# Review\n",
      "utf8",
    );
    execFileSync(realGit, ["-C", root, "add", "."]);
    execFileSync(realGit, ["-C", root, "commit", "--quiet", "-m", "expand core membership"], {
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-01-02T00:00:00Z",
        GIT_COMMITTER_DATE: "2026-01-02T00:00:00Z",
      },
    });

    const tracedEnv = {
      OATLAS_GIT_TRACE: wrapper.tracePath,
      OATLAS_REAL_GIT: realGit,
      PATH: `${wrapper.root}:${process.env.PATH}`,
    };
    const firstAnswer = await rpcForRepo(root, root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "health" }),
      callTool(3, "query_ontology", { operation: "workspace_brief" }),
      callTool(4, "query_ontology", { operation: "agent_brief", project: "project" }),
    ], 1_500, tracedEnv);
    const health = getCallParsed(firstAnswer.responses, 2);
    const brief = getCallParsed(firstAnswer.responses, 3);
    const agentBrief = getCallParsed(firstAnswer.responses, 4);
    assert.equal(health.operation, "health");
    assert.equal(brief.operation, "workspace_brief");
    assert.equal(agentBrief.operation, "agent_brief");
    for (const [label, validation] of [
      ["health", health.validation],
      ["workspace_brief", brief.health?.validation],
      ["agent_brief", agentBrief.health?.validation],
    ]) {
      assert.equal(validation?.summaryFreshness?.checked, true, `${label} keeps summaryFreshness`);
      assert.ok(
        validation.summaryFreshness.stale.some((row) => row.slug === "domains/core"),
        `${label} keeps the stale-summary verdict`,
      );
    }
    assert.equal(
      gitCalls(wrapper.tracePath, "log").length,
      1,
      "one union history log is shared across all three first-answer operations",
    );
    assert.equal(
      gitCalls(wrapper.tracePath, "show").length,
      0,
      "per-revision git show processes must stay collapsed into one object batch",
    );
    assert.equal(
      gitCalls(wrapper.tracePath, "cat-file").length,
      1,
      "all revision bodies are read through one git cat-file batch",
    );

    writeFileSync(wrapper.tracePath, "", "utf8");
    const fullValidation = await rpcForRepo(root, root, [
      ...INIT_REQUESTS,
      callTool(2, "validate_vault"),
    ], 1_500, tracedEnv);
    const validation = getCallParsed(fullValidation.responses, 2);
    assert.equal(validation.summaryFreshness.checked, true);
    assert.ok(
      validation.summaryFreshness.stale.some((row) => row.slug === "domains/core"),
      "validate_vault must keep the stale-summary verdict",
    );
    assert.ok(
      gitCalls(wrapper.tracePath, "log").length === 1
        && gitCalls(wrapper.tracePath, "show").length === 0
        && gitCalls(wrapper.tracePath, "cat-file").length === 1,
      "validate_vault must keep reading Git history for summary freshness",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (wrapper) rmSync(wrapper.root, { recursive: true, force: true });
  }
});

await test("query_ontology health/workspace_brief — validator findings cannot report healthy", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\ndomains: [domains/core]\n---\n" },
    { slug: "domains/core", content: "---\nkind: domain\ntitle: Core\ncapabilities: [capabilities/run]\n---\n" },
    /*
     * Structurally connected, but the graph still has a finding.
     *
     * ⚠️ 2026-08-11 — the finding used to be "a capability with no domain". But
     * this fixture's `domains/core` **contains that capability**, so when the
     * false positive of telling a node with a parent that it has none was fixed
     * (`containment-parent`), this test went green with it. The point of the test
     * is "never report healthy while a finding exists", so it now uses **a
     * different, real finding** — one reference pointing at a node that does not exist.
     */
    { slug: "capabilities/run", content: "---\nkind: capability\ntitle: Run\ndomain: domains/core\nelements: [elements/worker]\ndepends_on: [capabilities/missing]\n---\n" },
    { slug: "elements/worker", content: "---\nkind: element\ntitle: Worker\ndomain: domains/core\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "health" }),
      callTool(3, "query_ontology", { operation: "workspace_brief" }),
      callTool(4, "query_ontology", { operation: "agent_brief" }),
    ]);
    const health = getCallParsed(responses, 2);
    const brief = getCallParsed(responses, 3);
    const agentBrief = getCallParsed(responses, 4);
    assert.equal(health.status, "needs_attention");
    assert.equal(health.validation.summary.warningFiles, 1);
    assert.equal(health.checks.find((check) => check.id === "vault_validation").status, "warn");
    assert.equal(brief.status, "needs_attention");
    assert.equal(brief.health.validation.summary.warningFiles, 1);
    assert.equal(brief.health.checks.find((check) => check.id === "vault_validation").status, "warn");
    // The wording states **what was looked at** (2026-08-01). It used to merge two
    // kinds of warning into one number, so when this check warned on a vault
    // `validate` called clean, there was no way to tell which kind those were.
    // This tmp vault is outside a git repository, so code paths were never
    // measured at all — and it says so.
    const validationAction = brief.nextActions.find((action) => action.id === "vault_validation");
    assert.equal(validationAction.kind, "validate_vault");
    assert.equal(validationAction.severity, "warn");
    assert.equal(validationAction.count, 1);
    assert.match(validationAction.message, /^1 warning\(s\) require review\./);
    assert.match(validationAction.message, /source paths were NOT checked/);
    assert.equal(brief.health.checks.find((check) => check.id === "vault_validation").pathsChecked, false);
    assert.equal(agentBrief.status, "needs_attention");
    assert.equal(agentBrief.readiness.status, "needs_attention");
    assert.equal(agentBrief.readiness.score, 75);
    assert.equal(agentBrief.nextActions[0].id, "meaning_assessment");
    assert.equal(agentBrief.nextActions.find((action) => action.id === "vault_validation").kind, "validate_vault");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology health/workspace_brief — meaning assessment cannot report healthy", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\ndomains: [domains/core]\n---\n" },
    { slug: "domains/core", content: "---\nkind: domain\ntitle: Core\ncapabilities: [capabilities/run]\n---\n" },
    { slug: "capabilities/run", content: "---\nkind: capability\ntitle: Run\ndomain: domains/core\nelements: [elements/worker]\n---\n" },
    { slug: "elements/worker", content: "---\nkind: element\ntitle: Worker\ndomain: domains/core\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "health" }),
      callTool(3, "query_ontology", { operation: "workspace_brief" }),
    ]);
    const health = getCallParsed(responses, 2);
    const brief = getCallParsed(responses, 3);
    const meaningCheck = health.checks.find((check) => check.id === "meaning_assessment");
    assert.equal(meaningCheck?.status, "warn");
    assert.match(meaningCheck?.message ?? "", /competency_not_authored/);
    assert.match(meaningCheck?.message ?? "", /Nothing is broken/);
    assert.match(meaningCheck?.message ?? "", /finalize_project_meaning/);
    assert.doesNotMatch(meaningCheck?.message ?? "", /assessment_input_invalid/);
    assert.equal(health.status, "needs_attention");
    assert.equal(brief.status, "needs_attention");
    assert.equal(brief.health.checks.find((check) => check.id === "meaning_assessment")?.status, "warn");
    assert.equal(brief.nextActions[0]?.id, "meaning_assessment");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology health — authored answers without a finalize receipt ask for the receipt, not for authoring", async () => {
  // The third state (measured 2026-08-31 on this repository's own dogfood
  // vault): all five competency answers are written in the project document,
  // but no finalize receipt exists in this vault's sidecar. The gap id stays
  // `competency_not_authored` (decision 2026-08-17 (28) named the missing
  // receipt that way, and the id is read by agents), but the instruction must
  // change: a person who already wrote the answers must not be told to write
  // them. The only missing step is calling finalize_project_meaning.
  const answer = (text) => ({
    status: "answered",
    answer: text,
    witnesses: { concepts: [], relations: [], evidence: [], paths: [] },
  });
  const authoredSection = renderProjectCompetencyMarkdown({
    scope: answer("The project scope answer."),
    domains: answer("The domains answer."),
    abilities: answer("The abilities answer."),
    evidence: answer("The evidence answer."),
    impact: answer("The impact answer."),
  });
  const root = makeVault([
    {
      slug: "project",
      content: `---\nkind: project\ntitle: Project\ndomains: [domains/core]\n---\n\n## Definition\n\nA project.\n\n${authoredSection}`,
    },
    { slug: "domains/core", content: "---\nkind: domain\ntitle: Core\ncapabilities: [capabilities/run]\n---\n" },
    { slug: "capabilities/run", content: "---\nkind: capability\ntitle: Run\ndomain: domains/core\nelements: [elements/worker]\n---\n" },
    { slug: "elements/worker", content: "---\nkind: element\ntitle: Worker\ndomain: domains/core\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "health" }),
    ]);
    const health = getCallParsed(responses, 2);
    const meaningCheck = health.checks.find((check) => check.id === "meaning_assessment");
    assert.equal(meaningCheck?.status, "warn");
    assert.match(meaningCheck?.message ?? "", /competency_not_authored/);
    assert.match(meaningCheck?.message ?? "", /no finalize receipt/);
    assert.match(meaningCheck?.message ?? "", /finalize_project_meaning/);
    // The wrong instruction for this state: the section exists and parses, so
    // the message must not send the author back to writing it.
    assert.doesNotMatch(meaningCheck?.message ?? "", /Fill in/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology health/workspace_brief — clean projectless graph stays healthy", async () => {
  const root = makeVault([
    { slug: "domains/core", content: "---\nkind: domain\ntitle: Core\ncapabilities: [capabilities/run]\n---\n" },
    { slug: "capabilities/run", content: "---\nkind: capability\ntitle: Run\ndomain: domains/core\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "health" }),
      callTool(3, "query_ontology", { operation: "workspace_brief" }),
    ]);
    const health = getCallParsed(responses, 2);
    const brief = getCallParsed(responses, 3);
    assert.equal(health.status, "healthy");
    assert.equal(health.checks.some((check) => check.id === "meaning_assessment"), false);
    assert.equal(brief.status, "healthy");
    assert.equal(brief.health.checks.some((check) => check.id === "meaning_assessment"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — tmp vault 의 노드 수 정확히 보고", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
    { slug: "noframe", content: "# Just a doc" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.total, 2, "kind 있는 노드 2 개만 카운트");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — 500개를 넘는 vault도 offset 페이지로 누락 없이 복원", async () => {
  const root = makeVault(
    Array.from({ length: 503 }, (_, index) => ({
      slug: `capabilities/node-${String(index).padStart(4, "0")}`,
      content: `---\nkind: capability\ntitle: Node ${index}\n---\n`,
    })),
  );
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { limit: 500 }),
      callTool(3, "list_concepts", { offset: 500, limit: 500 }),
      callTool(4, "list_concepts", { offset: 504, limit: 500 }),
    ]);
    const first = getCallParsed(responses, 2);
    const second = getCallParsed(responses, 3);
    const outOfRange = getCallStructured(responses, 4);
    assert.equal(first.total, 503);
    assert.equal(first.returned, 500);
    assert.equal(first.limited, true);
    assert.deepEqual(first.pagination, {
      offset: 0,
      limit: 500,
      total: 503,
      returned: 500,
      hasMore: true,
      nextOffset: 500,
    });
    assert.equal(second.returned, 3);
    assert.equal(second.limited, false);
    assert.equal(second.pagination.nextOffset, null);
    const slugs = [...first.nodes, ...second.nodes].map((node) => node.slug);
    assert.equal(new Set(slugs).size, 503);
    assert.equal(slugs.length, 503);
    assert.equal(outOfRange?.ok, false);
    assert.equal(outOfRange?.errorCode, "invalid_arguments");
    assert.match(String(outOfRange?.error), /offset.*503.*Received: 504/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — 100/125/500 pagination boundary contract", async () => {
  const root = makeVault(
    Array.from({ length: 126 }, (_, index) => ({
      slug: `capabilities/boundary-${String(index).padStart(3, "0")}`,
      content: `---\nkind: capability\ntitle: Boundary ${index}\n---\n`,
    })),
  );
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
      callTool(3, "list_concepts", { limit: 125 }),
      callTool(4, "list_concepts", { limit: 500 }),
      callTool(5, "list_concepts", { limit: 501 }),
    ]);
    const defaultPage = getCallParsed(responses, 2);
    const middlePage = getCallParsed(responses, 3);
    const maxPage = getCallParsed(responses, 4);
    const overMax = getCallStructured(responses, 5);
    assert.equal(defaultPage.pagination.limit, 100);
    assert.equal(defaultPage.returned, 100);
    assert.equal(defaultPage.limited, true);
    assert.equal(defaultPage.pagination.nextOffset, 100);
    assert.equal(middlePage.pagination.limit, 125);
    assert.equal(middlePage.returned, 125);
    assert.equal(middlePage.limited, true);
    assert.equal(middlePage.pagination.nextOffset, 125);
    assert.equal(maxPage.pagination.limit, 500);
    assert.equal(maxPage.returned, 126);
    assert.equal(maxPage.limited, false);
    assert.equal(maxPage.pagination.nextOffset, null);
    assert.equal(overMax?.ok, false);
    assert.equal(overMax?.errorCode, "invalid_arguments");
    assert.match(String(overMax?.error), /limit must be <= 500/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — domain 필터 (R+)", async () => {
  // Answers a common query ("all capabilities under auth") in one call without the
  // query_concepts DSL. Only capability/element kinds are meaningful, but the
  // filter applies uniformly across kinds.
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n",
    },
    {
      slug: "capabilities/login",
      content: "---\nkind: capability\ntitle: Login\ndomain: auth\n---\n",
    },
    {
      slug: "capabilities/logout",
      content: "---\nkind: capability\ntitle: Logout\ndomain: auth\n---\n",
    },
    {
      slug: "capabilities/billing-charge",
      content: "---\nkind: capability\ntitle: Charge\ndomain: billing\n---\n",
    },
    {
      slug: "elements/auth-token",
      content: "---\nkind: element\ntitle: Token\ndomain: auth\n---\n",
    },
  ]);
  try {
    // domain=auth only — capability 2 + element 1 = 3 (the domain itself has no domain:)
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "auth" }),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 3, "domain=auth → 3");
    assert.ok(out1.nodes.every((n) => n.domain === "auth"));

    // domain=auth + kind=capability → 2 (login, logout)
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "auth", kind: "capability" }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 2, "domain=auth + kind=capability → 2");

    // A domain with no matches → empty result, no throw
    const { responses: r3 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "totally-unknown" }),
    ]);
    const out3 = getCallParsed(r3, 2);
    assert.equal(out3.total, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_evidence — 각 match 에 prose excerpt 동봉 (R+)", async () => {
  // One find_evidence call gives an agent both *which docs reference this* and
  // *what those docs are about*, with no follow-up get_concept.
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content:
        "---\nkind: capability\ntitle: Auth\n---\n\n# Auth\n\n인증 흐름의 핵심 capability — 로그인/로그아웃 일원화.\n",
    },
    {
      slug: "domains/billing",
      content:
        "---\nkind: domain\ntitle: Billing\ncapabilities: [auth]\n---\n\n# Billing\n\n결제 도메인 — auth 와 함께 사용자 세션 검증.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_evidence", { title: "auth" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.ok(Array.isArray(result.matches));
    assert.ok(result.matches.length >= 1);
    for (const m of result.matches) {
      assert.match(m.uid, /^[0-9a-f-]{36}$/, `${m.slug}.uid`);
      assert.equal(typeof m.excerpt, "string");
      // No markdown table syntax or # heading may appear
      assert.doesNotMatch(m.excerpt, /^#/);
      assert.doesNotMatch(m.excerpt, /^\|/);
    }
    // The domains/billing match is its first prose paragraph
    const billing = result.matches.find((m) => m.slug === "domains/billing");
    if (billing) {
      assert.match(billing.excerpt, /결제 도메인/);
    }
    // Response-shape consistency across the read tools: domain + mtime included
    for (const m of result.matches) {
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * **Loose documents must not take first place in evidence** (measured 2026-08-08).
 *
 * A vault is an ordinary markdown folder, so meeting notes, memos, and drafts live
 * alongside nodes — by design (`kind:` is the membership test, and without it a
 * document is outside the graph). The problem was that evidence search mixed the
 * two **without distinguishing them**: once every body match scores the same (0.3),
 * the ordering is effectively **alphabetical by slug**.
 *
 * Measured on a vault of 3,000 loose documents: asking about "token issuance"
 * returned five memos in the top five and not one real node. On a small vault, a
 * coffee-chat memo saying *"there was no evidence"* came back as evidence. Yet this
 * tool's description tells the agent *"the most relevant **node** is matches[0]"* —
 * it was calling a non-node a node and handing it over first.
 *
 * The fix is not «hide the loose documents». A person's memo is sometimes the real
 * evidence, and hiding it breaks the local-first promise. Three things instead:
 * ① on a tie, **nodes first** ② per-row honesty via `isNode` ③ `nodesOnly` so the
 * agent can narrow.
 */
/**
 * **A document outside the graph must not be returned as a concept** (measured 2026-08-08).
 *
 * `get_concept('notes/coffee-chat')` — a memo with no frontmatter at all — returned
 * a normal response: an excerpt, empty neighbors, empty outgoingEdges, and **zero
 * warnings**. A document that has frontmatter but no `kind:` at least gets a
 * `missing-kind` warning, while genuinely loose prose got no marker whatsoever —
 * the least signal in the most common case.
 *
 * The tool is named `get_concept`, so the response asserts «this is a concept».
 * It is not rejected (reading a person's notes is legitimate); it **says what it
 * is handing over**.
 */
/**
 * **Both ends of a relation must be nodes** (measured 2026-08-08).
 *
 * `add_relation({from: <node>, to: "notes/daily/day-1"})` succeeded with
 * `ok: true`. The existence check asked **«is there a .md by that name»** rather
 * than «is that a node» — so it rejected nonexistent slugs correctly and let a
 * diary memo through.
 *
 * It is caught afterwards (`danglingReferences` in the same response, compile's
 * `dangling-graph-reference`, the maintenance queue). But that is **after the
 * write**, and in between the graph holds a relation the compiler will discard.
 * The write gate saying it first is cheaper.
 */
await test("add_relation — 그래프 밖 문서는 관계 끝이 될 수 없다", async () => {
  const root = makeVault([
    {
      slug: "capabilities/checkout",
      content:
        "---\nkind: capability\ntitle: 결제\ndomain: domains/orders\n---\n\n# 결제\n\n본문.\n",
    },
    { slug: "notes/daily/day-1", content: "오늘 한 일 메모.\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "capabilities/checkout",
        to: "notes/daily/day-1",
        type: "relates",
      }),
    ]);
    const text = getCallText(responses, 2);
    assert.match(text, /Error/i, `잡문을 관계 끝으로 받아 줬다: ${text}`);
    // Why it cannot happen, and where to go instead — this repository's refusal grammar.
    assert.match(text, /not a graph node|kind/i, `이유를 안 말한다: ${text}`);
    assert.match(text, /absorb_document|add_concept|kind:/i, `길을 안 알려준다: ${text}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("relation tools — depends_on 별칭 키로 쓴 엣지도 같은 엣지다 (중복 추가 없음, 제거 가능)", async () => {
  /*
   * Caught in the 2026-09-01 review. The read layer canonicalizes the
   * `depends_on:` authoring alias, but the write layer read only the literal
   * `dependencies` key: add_relation appended a duplicate under a second key,
   * remove_relation answered "does not exist" for an edge get_concept rendered,
   * and neighbors.dependencies contradicted outgoingEdges from the same doc.
   */
  const root = makeVault([
    {
      slug: "capabilities/payment",
      content:
        "---\nkind: capability\ntitle: 결제\ndomain: domains/orders\ndepends_on:\n  - capabilities/session\n---\n\n# 결제\n\n본문.\n",
    },
    {
      slug: "capabilities/session",
      content:
        "---\nkind: capability\ntitle: 세션\ndomain: domains/orders\n---\n\n# 세션\n\n본문.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "capabilities/payment" }),
      callTool(3, "add_relation", {
        from: "capabilities/payment",
        to: "capabilities/session",
        type: "depends_on",
        why: "결제 쓰기 경로가 세션 검증을 지난다",
      }),
      callTool(4, "remove_relation", {
        from: "capabilities/payment",
        to: "capabilities/session",
        type: "depends_on",
        confirm: true,
      }),
      callTool(5, "get_concept", { slug: "capabilities/payment" }),
    ]);

    // The read side sees the aliased edge in BOTH shapes it serves.
    const before = getCallParsed(responses, 2);
    assert.deepEqual(before.neighbors.dependencies, ["capabilities/session"],
      `neighbors 가 별칭 엣지를 못 본다: ${JSON.stringify(before.neighbors)}`);
    assert.ok(
      before.outgoingEdges.some((e) => e.to === "capabilities/session" && e.via === "dependencies"),
      `outgoingEdges 에 별칭 엣지가 없다: ${JSON.stringify(before.outgoingEdges)}`,
    );

    // The same edge, so adding it again is a no-op — not a duplicate under a second key.
    const added = getCallParsed(responses, 3);
    assert.equal(added.alreadyExists, true, `별칭 엣지를 새 엣지로 잘못 세었다: ${JSON.stringify(added)}`);

    // And it can be removed through the tool.
    const removed = getCallParsed(responses, 4);
    assert.equal(removed.changed, true, `별칭 엣지를 제거하지 못했다: ${JSON.stringify(removed)}`);

    const after = getCallParsed(responses, 5);
    assert.deepEqual(after.neighbors.dependencies, [], "제거 후에도 엣지가 남아 있다");
    assert.equal(after.frontmatter.depends_on, undefined, "별칭 키가 캐노니컬 키로 접히지 않았다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — 그래프 밖 문서는 그렇다고 말한다", async () => {
  const root = makeVault([
    { slug: "notes/coffee-chat", content: "민수랑 결제 얘기함. 근거는 없었음.\n" },
    {
      slug: "capabilities/real-node",
      content:
        "---\nkind: capability\ntitle: 진짜 노드\ndomain: domains/example\n---\n\n# 진짜 노드\n\n본문.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "notes/coffee-chat" }),
      callTool(3, "get_concept", { slug: "capabilities/real-node" }),
    ]);
    const junk = getCallParsed(responses, 2);
    assert.equal(junk.isNode, false, "그래프 밖 문서인데 isNode 가 false 가 아니다");
    assert.ok(Array.isArray(junk.warnings) && junk.warnings.length > 0, "경고가 하나도 없다");
    assert.ok(
      junk.warnings.some((w) => /not a graph node|그래프 밖/i.test(String(w.message ?? w))),
      `그래프 밖이라는 말이 없다: ${JSON.stringify(junk.warnings)}`,
    );

    // Real nodes are untouched — this repair must add no noise to the normal path.
    // (Other legitimate warnings are not forbidden; what this test protects is
    //  that the words "outside the graph" do not appear on them.)
    const node = getCallParsed(responses, 3);
    assert.equal(node.isNode, true);
    assert.ok(
      !(node.warnings ?? []).some((w) => w.code === "not-a-graph-node"),
      `정상 노드에 「그래프 밖」 경고가 붙었다: ${JSON.stringify(node.warnings)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_evidence — 같은 점수면 노드가 잡문보다 먼저, 행마다 isNode", async () => {
  const root = makeVault([
    // By slug alphabetisation the loose document wins (aaa… < capabilities/…).
    {
      slug: "aaa-meeting-note",
      content: "민수랑 얘기함. 토큰 발급이 느리다는 말이 나왔는데 근거는 없었음.\n",
    },
    {
      slug: "aab-scratch",
      content: "---\ntitle: 낙서\n---\n\n토큰 발급 관련 아이디어 메모.\n",
    },
    {
      slug: "capabilities/token-issue",
      content:
        "---\nkind: capability\ntitle: 접근 토큰\n---\n\n# 접근 토큰\n\n토큰 발급 절차를 소유한다.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_evidence", { title: "토큰 발급" }),
      callTool(3, "find_evidence", { title: "토큰 발급", nodesOnly: true }),
    ]);
    const all = getCallParsed(responses, 2);
    assert.ok(all.matches.length >= 3, "세 문서가 다 매치되어야 이 시험이 성립한다");
    // ① Nodes first — an equal score (body match 0.3) must not lose to slug alphabetisation.
    assert.equal(
      all.matches[0].slug,
      "capabilities/token-issue",
      `노드가 1등이 아니다: ${all.matches.map((m) => m.slug).join(", ")}`,
    );
    // ② Per-row honesty — leaving an absent kind as «unwritten» makes the reader guess.
    for (const m of all.matches) {
      assert.equal(typeof m.isNode, "boolean", `${m.slug}.isNode`);
    }
    assert.equal(all.matches.find((m) => m.slug === "aaa-meeting-note").isNode, false);
    const nonNode = all.matches.find((m) => m.slug === "aaa-meeting-note");
    assert.equal(nonNode.uid, undefined, "ordinary markdown must not invent a graph UID");
    assert.equal(nonNode.kind, undefined, "ordinary markdown must not invent a graph kind");
    const node = all.matches.find((m) => m.slug === "capabilities/token-issue");
    assert.equal(node.isNode, true);
    assert.match(node.uid, /^[0-9a-f-]{36}$/);
    assert.equal(node.kind, "capability");
    // When loose documents are mixed in, say so — along with how the agent can narrow.
    assert.match(String(all.nonNodeHint ?? ""), /nodesOnly/);

    // ③ It can be narrowed.
    const onlyNodes = getCallParsed(responses, 3);
    assert.ok(onlyNodes.matches.length >= 1);
    assert.ok(
      onlyNodes.matches.every((m) => m.isNode === true),
      "nodesOnly 인데 잡문이 남았다",
    );
    assert.equal(onlyNodes.nonNodeHint, undefined, "좁힌 결과에 안내가 또 붙었다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_evidence — 0 hits 면 growthHint (near-title 후보 또는 add_concept 스캐폴드) (과제 ⑧)", async () => {
  const root = makeVault([
    {
      slug: "capabilities/token-issue",
      content: "---\nkind: capability\ntitle: Token Issue\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_evidence", { title: "Token Issuance" }),
      callTool(3, "find_evidence", { title: "Completely Unrelated Concept" }),
    ]);

    const near = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), near);
    assert.equal(near.matches.length, 0);
    assert.ok(near.growthHint, "expected growthHint on 0-hit response");
    assert.match(near.growthHint.reason, /No vault doc mentions "Token Issuance"/);
    assert.equal(near.growthHint.exampleCall.tool, "get_concept");
    assert.equal(near.growthHint.exampleCall.args.slug, "capabilities/token-issue");

    const noNear = getCallParsed(responses, 3);
    assert.equal(noNear.matches.length, 0);
    assert.ok(noNear.growthHint, "expected growthHint on 0-hit response");
    assert.deepEqual(noNear.growthHint.exampleCall, {
      tool: "add_concept",
      args: {
        slug: "completely-unrelated-concept",
        kind: "element",
        title: "Completely Unrelated Concept",
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — summary opt-in (R+) — 각 노드에 prose 요약", async () => {
  // One call gives an agent the node list plus what each is about, with no N
  // follow-up get_concept calls. Absent from the response when summary:false (default).
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content:
        "---\nkind: capability\ntitle: Auth\n---\n\n# Auth\n\n인증 흐름 일원화 capability — 로그인/로그아웃.\n",
    },
    {
      slug: "capabilities/billing",
      content:
        "---\nkind: capability\ntitle: Billing\n---\n\n결제 처리 — 카드 + 페이팔.\n",
    },
  ]);
  try {
    // default: no summary
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    for (const node of out1.nodes) {
      assert.equal(node.summary, undefined, "default 에선 summary 안 들어감");
    }

    // summary:true → a prose summary on every node
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { summary: true }),
    ]);
    const out2 = getCallParsed(r2, 2);
    for (const node of out2.nodes) {
      assert.equal(typeof node.summary, "string", `${node.slug}.summary 가 string`);
    // No markdown heading or table syntax (prose only)
      assert.doesNotMatch(node.summary, /^#/);
      assert.doesNotMatch(node.summary, /^\|/);
    }
    const auth = out2.nodes.find((n) => n.slug === "capabilities/auth");
    assert.match(auth.summary, /인증 흐름/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — since 필터 (R+) — incremental sync", async () => {
  // Passing the max mtime captured from a previous list response as `since` sends
  // *only what changed*. Strict mtime > since means resending the same max
  // double-fetches nothing.
  const root = makeVault([
    { slug: "old", content: "---\nkind: capability\ntitle: Old\n---\n" },
    { slug: "newer", content: "---\nkind: capability\ntitle: Newer\n---\n" },
  ]);
  try {
    // Pass 1: full list — capture both nodes' mtimes
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    const maxMtime = Math.max(...out1.nodes.map((n) => n.mtime));

    // Pass 2: since=maxMtime — 0 rows, because the comparison is strict
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 0, "since=max → 0건 (재전송 방지)");

    // Pass 3: since=maxMtime - 1 — at least 1 row (the most recent node)
    const { responses: r3 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime - 1 }),
    ]);
    const out3 = getCallParsed(r3, 2);
    assert.ok(out3.total >= 1, "since=max-1 → 1+ 건");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — 각 노드에 mtime 포함 (R+)", async () => {
  // Same meaning as get_concept's mtime. One list call tells an agent which nodes
  // changed recently, so it can sort or filter with no follow-up get_concept.
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.total, 2);
    for (const node of result.nodes) {
      assert.equal(typeof node.mtime, "number", `${node.slug}.mtime 은 number`);
      assert.ok(node.mtime > 0, `${node.slug}.mtime > 0`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_backlinks — 매치 row 에 domain + mtime 포함 (R+)", async () => {
  // An agent reading backlinks immediately knows the domain and the change time.
  // Same shape as list_concepts: two views of one mental model exposing consistent fields.
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content: "---\nkind: capability\ntitle: Auth\ndomain: identity\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndomain: identity\nrelates: [capabilities/auth]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_backlinks", { slug: "capabilities/auth" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.total, 1);
    const m = result.matches[0];
    assert.match(m.uid, /^[0-9a-f-]{36}$/);
    assert.equal(m.slug, "capabilities/login");
    assert.equal(m.kind, "capability");
    assert.equal(m.domain, "identity");
    assert.equal(typeof m.mtime, "number");
    assert.ok(m.mtime > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_backlinks — target alias 와 legacy depends_on 을 canonical graph edge 로 읽음", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nslug: auth-domain\nkind: domain\ntitle: Auth\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndepends_on: [auth-domain]\n---\n",
    },
    {
      slug: "capabilities/logout",
      content:
        "---\nkind: capability\ntitle: Logout\nrelates: [domains/auth]\n---\nSee [[auth-domain]].",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_backlinks", { slug: "auth-domain" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.target, "auth-domain");
    assert.equal(result.total, 2);
    assert.deepEqual(
      result.matches.map((match) => ({
        slug: match.slug,
        matchedKeys: match.matchedKeys,
        matchedInBody: match.matchedInBody,
      })),
      [
        {
          slug: "capabilities/login",
          matchedKeys: ["dependencies"],
          matchedInBody: undefined,
        },
        {
          slug: "capabilities/logout",
          matchedKeys: ["relates"],
          matchedInBody: true,
        },
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_neighbors — one-hop graph subgraph 를 방향/타입 기준으로 반환", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\ncapabilities: [capabilities/login]\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndomain: domains/auth\ndependencies: [elements/token]\nrelates: [missing-node]\n---\n",
    },
    {
      slug: "elements/token",
      content: "---\nkind: element\ntitle: Token\ndomain: domains/auth\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_neighbors", { slug: "login" }),
      callTool(3, "find_neighbors", {
        slug: "login",
        direction: "incoming",
        types: ["capabilities"],
      }),
      callTool(4, "find_neighbors", {
        slug: "login",
        direction: "outgoing",
        types: ["depends_on"],
      }),
      callTool(5, "get_concept", { slug: "login" }),
    ]);
    const both = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), both);
    assert.equal(both.center, "capabilities/login");
    assert.equal(both.requested, "login");
    assert.equal(both.totalEdges, 4);
    assert.deepEqual(
      both.edges.map((edge) => `${edge.direction}:${edge.via}:${edge.from}->${edge.to}`),
      [
        "incoming:capabilities:domains/auth->capabilities/login",
        "outgoing:dependencies:capabilities/login->elements/token",
        "outgoing:domain:capabilities/login->domains/auth",
        "outgoing:relates:capabilities/login->missing-node",
      ],
    );
    assert.equal(both.edges.find((edge) => edge.via === "relates").resolved, false);
    assert.deepEqual(
      both.nodes.map((node) => node.slug),
      ["domains/auth", "elements/token"],
    );
    for (const node of both.nodes) assert.match(node.uid, /^[0-9a-f-]{36}$/);

    const incoming = getCallParsed(responses, 3);
    assert.deepEqual(getCallStructured(responses, 3), incoming);
    assert.deepEqual(incoming.types, ["capabilities"]);
    assert.deepEqual(incoming.edges, [
      {
        direction: "incoming",
        from: "domains/auth",
        to: "capabilities/login",
        via: "capabilities",
        ref: "capabilities/login",
        resolved: true,
      },
    ]);

    const dependsOn = getCallParsed(responses, 4);
    assert.deepEqual(getCallStructured(responses, 4), dependsOn);
    assert.deepEqual(dependsOn.types, ["dependencies"]);
    assert.deepEqual(dependsOn.edges, [
      {
        direction: "outgoing",
        from: "capabilities/login",
        to: "elements/token",
        via: "dependencies",
        ref: "elements/token",
        resolved: true,
      },
    ]);

    const login = getCallParsed(responses, 5);
    assert.ok(
      login.outgoingEdges.some(
        (edge) => edge.via === "dependencies" && edge.to === "elements/token",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_path — structuredContent 로 shortest path 계약을 노출", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n",
    },
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndomain: domains/auth\ndependencies: [elements/token]\n---\n",
    },
    {
      slug: "elements/token",
      content: "---\nkind: element\ntitle: Token\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_path", { from: "login", to: "elements/token" }),
      callTool(3, "find_path", { from: "login", to: "missing-node" }),
    ]);
    const found = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), found);
    assert.equal(found.from, "login");
    assert.equal(found.to, "elements/token");
    assert.equal(found.found, true);
    assert.equal(found.hopCount, 1);
    assert.deepEqual(found.hops, ["capabilities/login", "elements/token"]);
    for (const node of found.nodes) assert.match(node.uid, /^[0-9a-f-]{36}$/);
    assert.deepEqual(found.edges, [
      { from: "capabilities/login", to: "elements/token", via: "dependencies" },
    ]);

    const missing = getCallParsed(responses, 3);
    assert.deepEqual(getCallStructured(responses, 3), missing);
    assert.deepEqual(missing, {
      from: "login",
      to: "missing-node",
      found: false,
      reason: "no path found (or maxHops exceeded)",
      // "to" is absent from the vault while "login" is present, so the suggestion
      // is an add_concept scaffold, not add_relation.
      growthHint: {
        reason: '"missing-node" does not resolve to a vault node.',
        suggestion:
          "A path cannot exist to an endpoint that is not in the vault yet. Add it first if it describes a real capability/element/domain.",
        exampleCall: {
          tool: "add_concept",
          args: { slug: "missing-node", kind: "element", title: "Missing Node" },
        },
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_path / get_concept — edges carry the stored relation_notes rationale, and omit the key without one", async () => {
  // The same pair the dogfood vault carries: capabilities/cli-developer-entry
  // depends on capabilities/mcp-server with a one-sentence why. An agent that
  // wrote it through add_relation(why) must read it back through the read tools.
  const why =
    "The terminal command surface delegates ontology reads, writes, and verification to the same MCP contracts.";
  const root = makeVault([
    {
      slug: "capabilities/cli-developer-entry",
      content:
        "---\nkind: capability\ntitle: CLI Developer Entry\ndomain: domains/agent-integration\n" +
        "dependencies: [capabilities/mcp-server]\nrelates: [capabilities/vault-ontology]\n" +
        `relation_notes: { capabilities/mcp-server: "${why}" }\n---\n`,
    },
    {
      slug: "capabilities/mcp-server",
      content: "---\nkind: capability\ntitle: MCP Server\ndomain: domains/agent-integration\n---\n",
    },
    {
      slug: "capabilities/vault-ontology",
      content: "---\nkind: capability\ntitle: Vault Ontology\ndomain: domains/agent-integration\n---\n",
    },
    { slug: "domains/agent-integration", content: "---\nkind: domain\ntitle: Agent Integration\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_path", { from: "capabilities/cli-developer-entry", to: "capabilities/mcp-server" }),
      callTool(3, "find_path", { from: "capabilities/cli-developer-entry", to: "capabilities/vault-ontology" }),
      callTool(4, "get_concept", { slug: "capabilities/cli-developer-entry" }),
    ]);
    const withNote = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), withNote);
    assert.deepEqual(withNote.edges, [
      { from: "capabilities/cli-developer-entry", to: "capabilities/mcp-server", via: "dependencies", rationale: why },
    ]);

    const withoutNote = getCallParsed(responses, 3);
    assert.deepEqual(withoutNote.edges, [
      { from: "capabilities/cli-developer-entry", to: "capabilities/vault-ontology", via: "relates" },
    ]);
    assert.equal("rationale" in withoutNote.edges[0], false);

    const concept = getCallParsed(responses, 4);
    assert.deepEqual(getCallStructured(responses, 4).outgoingEdges, concept.outgoingEdges);
    assert.deepEqual(concept.outgoingEdges, [
      { to: "capabilities/mcp-server", via: "dependencies", rationale: why },
      { to: "capabilities/vault-ontology", via: "relates" },
      { to: "domains/agent-integration", via: "domain" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_neighbors/get_concept — legacy depends_on frontmatter 를 dependencies edge 로 읽음", async () => {
  const root = makeVault([
    {
      slug: "capabilities/login",
      content:
        "---\nkind: capability\ntitle: Login\ndepends_on: [elements/token]\n---\n",
    },
    {
      slug: "elements/token",
      content: "---\nkind: element\ntitle: Token\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_neighbors", {
        slug: "login",
        direction: "outgoing",
        types: ["depends_on"],
      }),
      callTool(3, "get_concept", { slug: "login" }),
    ]);
    const neighbors = getCallParsed(responses, 2);
    assert.deepEqual(neighbors.types, ["dependencies"]);
    assert.deepEqual(neighbors.edges, [
      {
        direction: "outgoing",
        from: "capabilities/login",
        to: "elements/token",
        via: "dependencies",
        ref: "elements/token",
        resolved: true,
      },
    ]);
    const login = getCallParsed(responses, 3);
    assert.deepEqual(login.outgoingEdges, [
      { to: "elements/token", via: "dependencies" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP read/query tools — invalid numeric and direction options are rejected", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndependencies: [b]\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { limit: 0 }),
      callTool(3, "list_concepts", { since: -1 }),
      callTool(4, "find_neighbors", { slug: "a", limit: 501 }),
      callTool(5, "find_neighbors", { slug: "a", direction: "sideways" }),
      callTool(6, "find_path", { from: "a", to: "b", maxHops: -1 }),
      callTool(7, "query_concepts", { filter: "kind=capability", limit: "10" }),
      callTool(8, "compile_ontology", { nodesOffset: -1 }),
      callTool(9, "compile_ontology", { edgesLimit: 1.5 }),
      callTool(10, "query_ontology", {
        operation: "neighbors",
        slug: "a",
        direction: "sideways",
      }),
      callTool(11, "query_ontology", { operation: "centrality", iterations: 101 }),
      callTool(12, "query_ontology", { operation: "cycles", depth: -1 }),
      callTool(13, "find_neighbors", { slug: "a", types: ["depends_on", 123] }),
      callTool(14, "find_orphans", { excludeKinds: ["vault-readme", false] }),
      callTool(15, "query_ontology", {
        operation: "neighbors",
        slug: "a",
        types: ["depends_on", 123],
      }),
      callTool(16, "query_ontology", {
        operation: "pattern_walk",
        slug: "a",
        pattern: ["dependencies", null],
      }),
      callTool(17, "query_ontology", {
        operation: "maintenance_plan",
        phases: ["repair", 7],
      }),
      callTool(18, "find_neighbors", { slug: "a", types: ["depends_on", " "] }),
      callTool(19, "query_ontology", {
        operation: "neighbors",
        slug: "a",
        types: [" depends_on"],
      }),
      callTool(20, "query_ontology", {
        operation: "pattern_walk",
        slug: "a",
        pattern: ["dependencies\0"],
      }),
      callTool(21, "list_concepts", { summary: "true" }),
      callTool(22, "find_neighbors", { slug: "a", includeNodes: "false" }),
      callTool(23, "compile_ontology", { includeIndexes: 1 }),
      callTool(24, "compile_ontology", { summary: "true" }),
      callTool(25, "query_ontology", {
        operation: "neighbors",
        slug: "a",
        includeExternal: "true",
      }),
      callTool(26, "query_ontology", {
        operation: "maintenance_plan",
        executableOnly: 1,
      }),
      callTool(27, "query_ontology", {
        operation: "match_nodes",
        hasIncoming: "false",
      }),
      callTool(28, "query_ontology", { operation: "overview", limit: 501 }),
      callTool(29, "query_ontology", { operation: "components", nodeLimit: 501 }),
      callTool(30, "query_ontology", { operation: "project_map", itemLimit: 501 }),
      callTool(31, "query_ontology", { operation: "reachability", slug: "a", depth: 21 }),
      callTool(32, "query_ontology", { operation: "path", from: "a", to: "b", maxHops: 21 }),
      callTool(33, "analyze_repo_structure", { rootPath: " ." }),
      callTool(34, "analyze_repo_structure", { maxDepth: 11 }),
      callTool(35, "analyze_repo_structure", { ignore: ["dist", " "] }),
      callTool(36, "infer_imports", { rootPath: ".\0" }),
      callTool(37, "infer_imports", { sourceFolders: ["src", " lib"] }),
      callTool(38, "infer_imports", { ignore: ["dist", 7] }),
      callTool(39, "infer_imports", { maxFiles: 0 }),
      callTool(40, "infer_imports", { maxFiles: 50001 }),
      callTool(41, "compile_ontology", { nodesLimit: 0 }),
      callTool(42, "query_ontology", { operation: "match_nodes", minDegree: -1 }),
      callTool(43, "query_ontology", { operation: "match_nodes", maxDegree: 1.5 }),
      callTool(44, "query_ontology", { operation: "match_nodes", sort: "mtime" }),
      callTool(45, "query_ontology", { operation: "recommend_relations", kind: "domain" }),
      callTool(46, "find_path", { from: "a", to: "b", maxHops: 21 }),
      callTool(47, "list_concepts", { limit: 501 }),
      callTool(48, "query_concepts", { filter: "kind=capability", limit: 501 }),
      callTool(49, "compile_ontology", { nodesLimit: 501 }),
      callTool(50, "compile_ontology", { edgesLimit: 501 }),
      callTool(51, "query_ontology", {}),
      callTool(52, "query_ontology", { operation: "not_real" }),
      callTool(53, "query_ontology", {
        operation: "query_plan",
        targetOperation: "not_real",
      }),
      callTool(54, "query_ontology", { operation: "overveiw" }),
      callTool(55, "query_ontology", {
        operation: "query_plan",
        targetOperation: "overveiw",
      }),
      callTool(56, "find_neighbors", { slug: "a", direction: "incomng" }),
      callTool(57, "query_ontology", { operation: "health", componentLimit: 501 }),
      callTool(58, "query_ontology", { operation: "health", dependencyTypes: [" dependencies"] }),
      callTool(59, "query_ontology", { operation: "workspace_brief", componentLimit: 501 }),
      callTool(60, "query_ontology", { operation: "maintenance_plan", phases: ["repiar"] }),
      callTool(61, "query_ontology", { operation: "maintenance_plan", severities: ["fatal"] }),
      callTool(62, "query_ontology", { operation: "maintenance_plan", kinds: ["add_mising_relation"] }),
      callTool(63, "query_ontology", { operation: "health", dependencyTypes: ["depend_on"] }),
      callTool(64, "query_ontology", { operation: "workspace_brief", componentTypes: ["capabilties"] }),
      callTool(65, "query_ontology", {
        operation: "relation_check",
        from: "a",
        to: "b",
        type: "depend_on",
      }),
      callTool(66, "query_ontology", { operation: "match_nodes", kind: "capabilty" }),
      callTool(67, "query_ontology", { operation: "match_edges", fromKind: "capabilty" }),
      callTool(68, "query_ontology", { operation: "match_edges", toKind: "externl" }),
      callTool(69, "find_neighbors", { slug: "a", types: ["depend_on"] }),
      callTool(70, "find_orphans", { kind: "capabilty" }),
      callTool(71, "find_orphans", { excludeKinds: ["capabilty"] }),
      callTool(72, "query_concepts", { filter: "kind=capabilty" }),
      callTool(73, "query_concepts", { filter: "has(capabilties)" }),
      callTool(74, "query_concepts", { filter: "knd=capability" }),
      callTool(75, "list_concepts", { kind: "capabilty" }),
    ]);
    for (const id of [
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
      38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
      55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71,
      72, 73, 74, 75,
    ]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} should be rejected`);
    }
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /limit must be a positive integer/i);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /since must be a non-negative finite number/i);
    assert.match(responses.find((r) => r.id === 4).result.content[0].text, /limit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 5).result.content[0].text, /direction must be one of/i);
    assert.match(responses.find((r) => r.id === 6).result.content[0].text, /maxHops must be a non-negative integer/i);
    assert.match(responses.find((r) => r.id === 7).result.content[0].text, /limit must be a positive integer/i);
    assert.match(responses.find((r) => r.id === 8).result.content[0].text, /nodesOffset must be a non-negative integer/i);
    assert.match(responses.find((r) => r.id === 9).result.content[0].text, /edgesLimit must be a positive integer/i);
    assert.match(responses.find((r) => r.id === 42).result.content[0].text, /minDegree must be a non-negative integer/i);
    assert.match(responses.find((r) => r.id === 43).result.content[0].text, /maxDegree must be a non-negative integer/i);
    assert.match(responses.find((r) => r.id === 10).result.content[0].text, /direction must be one of/i);
    assert.match(responses.find((r) => r.id === 11).result.content[0].text, /iterations must be <= 100/i);
    assert.match(responses.find((r) => r.id === 12).result.content[0].text, /depth must be a non-negative integer/i);
    assert.match(responses.find((r) => r.id === 13).result.content[0].text, /types must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 14).result.content[0].text, /excludeKinds must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 15).result.content[0].text, /types must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 41).result.content[0].text, /nodesLimit must be a positive integer/i);
    assert.match(responses.find((r) => r.id === 44).result.content[0].text, /sort must be one of/i);
    assert.match(responses.find((r) => r.id === 45).result.content[0].text, /kind must be one of: capability, element/i);
    assert.match(responses.find((r) => r.id === 46).result.content[0].text, /maxHops must be <= 20/i);
    assert.match(responses.find((r) => r.id === 47).result.content[0].text, /limit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 48).result.content[0].text, /limit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 49).result.content[0].text, /nodesLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 50).result.content[0].text, /edgesLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 51).result.content[0].text, /operation must be a non-empty string/i);
    assert.match(responses.find((r) => r.id === 52).result.content[0].text, /operation must be one of/i);
    assert.match(responses.find((r) => r.id === 53).result.content[0].text, /targetOperation must be one of/i);
    assert.match(responses.find((r) => r.id === 54).result.content[0].text, /Did you mean "overview"\?/i);
    assert.equal(getCallStructured(responses, 54)?.valueName, "operation");
    assert.equal(getCallStructured(responses, 54)?.receivedValue, "overveiw");
    assert.equal(getCallStructured(responses, 54)?.suggestion, "overview");
    assertStructuredValueRepair(responses, 54, {
      valueName: "operation",
      receivedValue: "overveiw",
      suggestion: "overview",
      allowedValues: QUERY_ONTOLOGY_OPERATIONS,
    });
    assert.match(responses.find((r) => r.id === 55).result.content[0].text, /Did you mean "overview"\?/i);
    assertStructuredValueRepair(responses, 55, {
      valueName: "targetOperation",
      receivedValue: "overveiw",
      suggestion: "overview",
      allowedValues: QUERY_PLAN_TARGET_OPERATIONS,
    });
    assert.match(responses.find((r) => r.id === 56).result.content[0].text, /Did you mean "incoming"\?/i);
    assertStructuredValueRepair(responses, 56, {
      valueName: "direction",
      receivedValue: "incomng",
      suggestion: "incoming",
      allowedValues: ["outgoing", "incoming", "both"],
    });
    assert.match(responses.find((r) => r.id === 57).result.content[0].text, /componentLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 58).result.content[0].text, /dependencyTypes items must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 59).result.content[0].text, /componentLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 60).result.content[0].text, /phases items must be one of: validate, repair, link, materialize, review/i);
    assert.match(responses.find((r) => r.id === 60).result.content[0].text, /Received: "repiar"/i);
    assert.match(responses.find((r) => r.id === 60).result.content[0].text, /Did you mean "repair"\?/i);
    assertStructuredValueRepair(responses, 60, {
      valueName: "phases items",
      receivedValue: "repiar",
      suggestion: "repair",
      allowedValues: MAINTENANCE_PHASE_VALUES,
    });
    assert.match(responses.find((r) => r.id === 61).result.content[0].text, /severities items must be one of: fail, warn, info/i);
    assert.match(responses.find((r) => r.id === 61).result.content[0].text, /Received: "fatal"/i);
    assert.match(responses.find((r) => r.id === 61).result.content[0].text, /Did you mean "fail"\?/i);
    assertStructuredValueRepair(responses, 61, {
      valueName: "severities items",
      receivedValue: "fatal",
      suggestion: "fail",
      allowedValues: MAINTENANCE_SEVERITY_VALUES,
    });
    assert.match(responses.find((r) => r.id === 62).result.content[0].text, /kinds items must be one of: inspect_compile_issue, break_dependency_cycle, canonicalize_graph_arrays, resolve_dangling_reference, add_missing_relation, materialize_external_element, unassigned_node, empty_domain/i);
    assert.match(responses.find((r) => r.id === 62).result.content[0].text, /Received: "add_mising_relation"/i);
    assert.match(responses.find((r) => r.id === 62).result.content[0].text, /Did you mean "add_missing_relation"\?/i);
    assertStructuredValueRepair(responses, 62, {
      valueName: "kinds items",
      receivedValue: "add_mising_relation",
      suggestion: "add_missing_relation",
      allowedValues: MAINTENANCE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 63).result.content[0].text, /dependencyTypes items must be one of/i);
    assert.match(responses.find((r) => r.id === 63).result.content[0].text, /Received: "depend_on"/i);
    assert.match(responses.find((r) => r.id === 63).result.content[0].text, /Did you mean "depends_on"\?/i);
    assertStructuredValueRepair(responses, 63, {
      valueName: "dependencyTypes items",
      receivedValue: "depend_on",
      suggestion: "depends_on",
      allowedValues: RELATION_TYPE_VALUES,
    });
    assert.match(responses.find((r) => r.id === 64).result.content[0].text, /componentTypes items must be one of/i);
    assert.match(responses.find((r) => r.id === 64).result.content[0].text, /Received: "capabilties"/i);
    assert.match(responses.find((r) => r.id === 64).result.content[0].text, /Did you mean "capabilities"\?/i);
    assertStructuredValueRepair(responses, 64, {
      valueName: "componentTypes items",
      receivedValue: "capabilties",
      suggestion: "capabilities",
      allowedValues: RELATION_TYPE_VALUES,
    });
    assert.match(responses.find((r) => r.id === 65).result.content[0].text, /type must be one of/i);
    assert.match(responses.find((r) => r.id === 65).result.content[0].text, /Received: "depend_on"/i);
    assert.match(responses.find((r) => r.id === 65).result.content[0].text, /Did you mean "depends_on"\?/i);
    assertStructuredValueRepair(responses, 65, {
      valueName: "type",
      receivedValue: "depend_on",
      suggestion: "depends_on",
      allowedValues: RELATION_TYPE_VALUES,
    });
    assert.match(responses.find((r) => r.id === 66).result.content[0].text, /kind must be one of/i);
    assert.match(responses.find((r) => r.id === 66).result.content[0].text, /Received: "capabilty"/i);
    assert.match(responses.find((r) => r.id === 66).result.content[0].text, /Did you mean "capability"\?/i);
    assertStructuredValueRepair(responses, 66, {
      valueName: "kind",
      receivedValue: "capabilty",
      suggestion: "capability",
      allowedValues: NODE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 67).result.content[0].text, /fromKind must be one of/i);
    assert.match(responses.find((r) => r.id === 67).result.content[0].text, /Received: "capabilty"/i);
    assert.match(responses.find((r) => r.id === 67).result.content[0].text, /Did you mean "capability"\?/i);
    assertStructuredValueRepair(responses, 67, {
      valueName: "fromKind",
      receivedValue: "capabilty",
      suggestion: "capability",
      allowedValues: NODE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 68).result.content[0].text, /toKind must be one of/i);
    assert.match(responses.find((r) => r.id === 68).result.content[0].text, /Received: "externl"/i);
    assert.match(responses.find((r) => r.id === 68).result.content[0].text, /Did you mean "external"\?/i);
    assertStructuredValueRepair(responses, 68, {
      valueName: "toKind",
      receivedValue: "externl",
      suggestion: "external",
      allowedValues: EDGE_TARGET_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 69).result.content[0].text, /types items must be one of/i);
    assert.match(responses.find((r) => r.id === 69).result.content[0].text, /Received: "depend_on"/i);
    assert.match(responses.find((r) => r.id === 69).result.content[0].text, /Did you mean "depends_on"\?/i);
    assertStructuredValueRepair(responses, 69, {
      valueName: "types items",
      receivedValue: "depend_on",
      suggestion: "depends_on",
      allowedValues: RELATION_TYPE_VALUES,
    });
    assert.match(responses.find((r) => r.id === 70).result.content[0].text, /kind must be one of/i);
    assert.match(responses.find((r) => r.id === 70).result.content[0].text, /Received: "capabilty"/i);
    assert.match(responses.find((r) => r.id === 70).result.content[0].text, /Did you mean "capability"\?/i);
    assertStructuredValueRepair(responses, 70, {
      valueName: "kind",
      receivedValue: "capabilty",
      suggestion: "capability",
      allowedValues: NODE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 71).result.content[0].text, /excludeKinds items must be one of/i);
    assert.match(responses.find((r) => r.id === 71).result.content[0].text, /Received: "capabilty"/i);
    assert.match(responses.find((r) => r.id === 71).result.content[0].text, /Did you mean "capability"\?/i);
    assertStructuredValueRepair(responses, 71, {
      valueName: "excludeKinds items",
      receivedValue: "capabilty",
      suggestion: "capability",
      allowedValues: NODE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 72).result.content[0].text, /kind must be one of/i);
    assert.match(responses.find((r) => r.id === 72).result.content[0].text, /Received: "capabilty"/i);
    assert.match(responses.find((r) => r.id === 72).result.content[0].text, /Did you mean "capability"\?/i);
    assertStructuredValueRepair(responses, 72, {
      valueName: "kind",
      receivedValue: "capabilty",
      suggestion: "capability",
      allowedValues: NODE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 73).result.content[0].text, /has key must be one of/i);
    assert.match(responses.find((r) => r.id === 73).result.content[0].text, /Received: "capabilties"/i);
    assert.match(responses.find((r) => r.id === 73).result.content[0].text, /Did you mean "capabilities"\?/i);
    assertStructuredValueRepair(responses, 73, {
      valueName: "has key",
      receivedValue: "capabilties",
      suggestion: "capabilities",
      allowedValues: GRAPH_ARRAY_KEYS,
    });
    assert.match(responses.find((r) => r.id === 74).result.content[0].text, /key must be one of/i);
    assert.match(responses.find((r) => r.id === 74).result.content[0].text, /Received: "knd"/i);
    assert.match(responses.find((r) => r.id === 74).result.content[0].text, /Did you mean "kind"\?/i);
    assertStructuredValueRepair(responses, 74, {
      valueName: "key",
      receivedValue: "knd",
      suggestion: "kind",
      allowedValues: EQUALITY_FILTER_KEYS,
    });
    assert.match(responses.find((r) => r.id === 75).result.content[0].text, /kind must be one of/i);
    assert.match(responses.find((r) => r.id === 75).result.content[0].text, /Received: "capabilty"/i);
    assert.match(responses.find((r) => r.id === 75).result.content[0].text, /Did you mean "capability"\?/i);
    assertStructuredValueRepair(responses, 75, {
      valueName: "kind",
      receivedValue: "capabilty",
      suggestion: "capability",
      allowedValues: NODE_KIND_VALUES,
    });
    assert.match(responses.find((r) => r.id === 16).result.content[0].text, /pattern must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 17).result.content[0].text, /phases must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 18).result.content[0].text, /types items must be non-empty strings/i);
    assert.match(responses.find((r) => r.id === 19).result.content[0].text, /types items must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 20).result.content[0].text, /pattern items must not contain a null byte/i);
    assert.match(responses.find((r) => r.id === 21).result.content[0].text, /summary must be a boolean/i);
    assert.match(responses.find((r) => r.id === 22).result.content[0].text, /includeNodes must be a boolean/i);
    assert.match(responses.find((r) => r.id === 23).result.content[0].text, /includeIndexes must be a boolean/i);
    assert.match(responses.find((r) => r.id === 24).result.content[0].text, /summary must be a boolean/i);
    assert.match(responses.find((r) => r.id === 25).result.content[0].text, /includeExternal must be a boolean/i);
    assert.match(responses.find((r) => r.id === 26).result.content[0].text, /executableOnly must be a boolean/i);
    assert.match(responses.find((r) => r.id === 27).result.content[0].text, /hasIncoming must be a boolean/i);
    assert.match(responses.find((r) => r.id === 28).result.content[0].text, /limit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 29).result.content[0].text, /nodeLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 30).result.content[0].text, /itemLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 31).result.content[0].text, /depth must be <= 20/i);
    assert.match(responses.find((r) => r.id === 32).result.content[0].text, /maxHops must be <= 20/i);
    assert.match(responses.find((r) => r.id === 33).result.content[0].text, /rootPath must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 34).result.content[0].text, /maxDepth must be <= 10/i);
    assert.match(responses.find((r) => r.id === 35).result.content[0].text, /ignore items must be non-empty strings/i);
    assert.match(responses.find((r) => r.id === 36).result.content[0].text, /rootPath must not contain a null byte/i);
    assert.match(responses.find((r) => r.id === 37).result.content[0].text, /sourceFolders items must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 38).result.content[0].text, /ignore must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 39).result.content[0].text, /maxFiles must be a positive integer/i);
    assert.match(responses.find((r) => r.id === 40).result.content[0].text, /maxFiles must be <= 50000/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP read/query tools — blank/padded scalar string inputs are rejected", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndependencies: [b]\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(21, "list_concepts", { kind: " capability" }),
      callTool(22, "list_concepts", { domain: "auth\0" }),
      callTool(2, "get_concept", { slug: " a" }),
      callTool(3, "find_evidence", { title: " " }),
      callTool(4, "find_backlinks", { slug: "a\0" }),
      callTool(5, "find_neighbors", { slug: " a" }),
      callTool(6, "find_path", { from: " a", to: "b" }),
      callTool(7, "find_path", { from: "a", to: " " }),
      callTool(8, "find_orphans", { kind: " capability" }),
      callTool(9, "query_concepts", { filter: " kind=capability" }),
      callTool(10, "query_ontology", { operation: "neighbors", slug: " a" }),
      callTool(11, "query_ontology", {
        operation: "query_plan",
        targetOperation: " path",
        from: "a",
        to: "b",
      }),
      callTool(12, "query_ontology", { operation: "similar_nodes", title: " " }),
      callTool(13, "get_concepts", { slugs: ["a", " b", ""] }),
    ]);
    for (const id of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 21, 22]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} should be rejected`);
    }
    assert.match(responses.find((r) => r.id === 21).result.content[0].text, /kind must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /title must be a non-empty string/i);
    assert.match(responses.find((r) => r.id === 4).result.content[0].text, /slug must not contain a null byte/i);
    assert.match(responses.find((r) => r.id === 5).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 6).result.content[0].text, /from must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 7).result.content[0].text, /to must be a non-empty string/i);
    assert.match(responses.find((r) => r.id === 8).result.content[0].text, /kind must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 9).result.content[0].text, /filter must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 10).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 11).result.content[0].text, /targetOperation must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 12).result.content[0].text, /title must be a non-empty string/i);
    assert.match(responses.find((r) => r.id === 22).result.content[0].text, /domain must not contain a null byte/i);

    const batch = getCallParsed(responses, 13);
    assert.equal(batch.concepts[0].ok, true);
    assert.equal(batch.concepts[1].ok, false);
    assert.match(batch.concepts[1].error, /slug must not have leading or trailing whitespace/i);
    assert.equal(batch.concepts[2].ok, false);
    assert.match(batch.concepts[2].error, /slug must be a non-empty string/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_concepts — 매치 row 에 mtime 포함 (R+)", async () => {
  // Same shape as list_concepts / find_backlinks / find_orphans, for read-tool
  // response consistency: an agent handles DSL query results with no extra call.
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: x\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\ndomain: x\n---\n" },
    { slug: "c", content: "---\nkind: domain\ntitle: C\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_concepts", { filter: "kind=capability" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.total, 2);
    for (const m of result.matches) {
      assert.match(m.uid, /^[0-9a-f-]{36}$/, `${m.slug}.uid`);
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_concepts — 0 rows 면 growthHint (부재 kind/domain 사실 또는 필터 완화 제안) (과제 ⑧)", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: auth\nelements: [x]\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      // "project" is a valid kind enum but this vault has none.
      callTool(2, "query_concepts", { filter: "kind=project" }),
      // "auth" domain exists; "billing" has none.
      callTool(3, "query_concepts", { filter: "domain=billing" }),
      // Both kind and domain exist — only the combination yields 0 rows ("a" has elements).
      callTool(4, "query_concepts", { filter: "kind=capability AND domain=auth AND NOT has(elements)" }),
    ]);

    const missingKind = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), missingKind);
    assert.equal(missingKind.total, 0);
    assert.ok(missingKind.growthHint, "expected growthHint on 0-row response");
    assert.match(missingKind.growthHint.reason, /kind="project" has 0 nodes in this vault/);
    assert.deepEqual(missingKind.growthHint.exampleCall, { tool: "list_kinds", args: {} });

    const missingDomain = getCallParsed(responses, 3);
    assert.equal(missingDomain.total, 0);
    assert.match(missingDomain.growthHint.reason, /domain="billing" has 0 nodes in this vault/);

    const generic = getCallParsed(responses, 4);
    assert.equal(generic.total, 0);
    assert.match(generic.growthHint.reason, /matched 0 rows for filter/);
    assert.match(generic.growthHint.suggestion, /Loosen the filter/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_concepts — depends_on alias in has() matches canonical dependencies", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndependencies: [b]\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
    { slug: "c", content: "---\nkind: capability\ntitle: C\ndepends_on: [b]\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_concepts", { filter: "has(depends_on)" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.parsedAs, "has(dependencies)");
    assert.deepEqual(result.matches.map((row) => row.slug), ["a", "c"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_concepts — limited reflects hidden rows, not exact page fill", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: x\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\ndomain: x\n---\n" },
    { slug: "c", content: "---\nkind: domain\ntitle: C\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_concepts", { filter: "kind=capability", limit: 2 }),
      callTool(3, "query_concepts", { filter: "kind=capability", limit: 1 }),
    ]);
    const exact = getCallParsed(responses, 2);
    assert.equal(exact.total, 2);
    assert.equal(exact.matches.length, 2);
    assert.equal(exact.limited, false);

    const truncated = getCallParsed(responses, 3);
    assert.equal(truncated.total, 2);
    assert.equal(truncated.matches.length, 1);
    assert.equal(truncated.limited, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology pattern_walk — exact branch limit keeps all MCP paths", async () => {
  const root = makeVault([
    {
      slug: "project",
      content:
        "---\nkind: project\ntitle: Project\ndomains: [domains/auth, domains/billing]\n---\n",
    },
    {
      slug: "domains/auth",
      content:
        "---\nkind: domain\ntitle: Auth\ncapabilities: [capabilities/login]\n---\n",
    },
    {
      slug: "domains/billing",
      content:
        "---\nkind: domain\ntitle: Billing\ncapabilities: [capabilities/invoice]\n---\n",
    },
    {
      slug: "capabilities/login",
      content: "---\nkind: capability\ntitle: Login\n---\n",
    },
    {
      slug: "capabilities/invoice",
      content: "---\nkind: capability\ntitle: Invoice\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "pattern_walk",
        slug: "project",
        pattern: ["domains", "capabilities"],
        limit: 2,
      }),
      callTool(3, "query_ontology", {
        operation: "pattern_walk",
        slug: "project",
        pattern: ["domains", "capabilities"],
        limit: 1,
      }),
    ]);
    const exact = getCallParsed(responses, 2);
    assert.equal(exact.paths.total, 2);
    assert.equal(exact.paths.limited, false);
    assert.deepEqual(
      exact.paths.rows.map((row) => row.end),
      ["capabilities/login", "capabilities/invoice"],
    );

    const truncated = getCallParsed(responses, 3);
    assert.equal(truncated.paths.total, 2);
    assert.equal(truncated.paths.limited, true);
    assert.equal(truncated.paths.rows.length, 1);
    assert.deepEqual(
      truncated.paths.rows.map((row) => row.end),
      ["capabilities/login"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology all_paths — limited exposes hidden MCP paths", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\nrelates: [b, c, e, f]\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\nrelates: [d]\n---\n" },
    { slug: "c", content: "---\nkind: capability\ntitle: C\nrelates: [d]\n---\n" },
    { slug: "e", content: "---\nkind: capability\ntitle: E\nrelates: [d]\n---\n" },
    { slug: "f", content: "---\nkind: capability\ntitle: F\nrelates: [d]\n---\n" },
    { slug: "d", content: "---\nkind: capability\ntitle: D\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "all_paths",
        from: "a",
        to: "d",
        maxHops: 2,
        limit: 4,
      }),
      callTool(3, "query_ontology", {
        operation: "all_paths",
        from: "a",
        to: "d",
        maxHops: 2,
        limit: 2,
      }),
    ]);
    const exact = getCallParsed(responses, 2);
    assert.equal(exact.totalPaths, 4);
    assert.equal(exact.limited, false);
    assert.equal(exact.paths.length, 4);

    const truncated = getCallParsed(responses, 3);
    assert.equal(truncated.totalPaths, 4);
    assert.equal(truncated.limited, true);
    assert.equal(truncated.paths.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_orphans — orphan row 에 domain + mtime 포함 (R+)", async () => {
  // Same shape as list_concepts / find_backlinks, so an agent can sort or filter
  // orphans straight from the response with no follow-up get_concept.
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n", // referenced by 0 — orphan
    },
    {
      slug: "capabilities/orphan-cap",
      content:
        "---\nkind: capability\ntitle: Orphan\ndomain: identity\n---\n", // Do not reference anything here → orphan
    },
    {
      slug: "capabilities/used-cap",
      content:
        "---\nkind: capability\ntitle: Used\ndomain: identity\nrelates: [capabilities/orphan-cap]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "find_orphans"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    // domains/auth + used-cap (nothing references used-cap) — both are orphans
    assert.ok(result.total >= 1);
    for (const o of result.orphans) {
      assert.match(o.uid, /^[0-9a-f-]{36}$/, `${o.slug}.uid`);
      assert.equal(typeof o.mtime, "number", `${o.slug}.mtime number`);
      assert.ok(o.mtime > 0);
    }
    const usedCap = result.orphans.find((o) => o.slug === "capabilities/used-cap");
    if (usedCap) {
      assert.equal(usedCap.domain, "identity");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept 응답에 mtime (R11 #8) 포함", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\n---\nbody" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "foo" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.slug, "foo");
    assert.equal(typeof result.mtime, "number");
    assert.ok(result.mtime > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — 존재하지 않는 slug 는 growthHint 를 실은 error 로 (과제 ⑧)", async () => {
  const root = makeVault([
    { slug: "capabilities/login", content: "---\nkind: capability\ntitle: Login\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
    // A tail-substring near miss exists (login) — the did-you-mean branch.
      callTool(2, "get_concept", { slug: "capabilities/log" }),
    // No near miss at all — the add_concept scaffold branch.
      callTool(3, "get_concept", { slug: "totally-unrelated-thing" }),
    ]);

    assert.equal(isErrorResponse(responses, 2), true);
    const withCandidate = getCallStructured(responses, 2);
    assert.equal(withCandidate.errorCode, "not_found");
    assert.equal(withCandidate.error, "Doc not found: capabilities/log");
    assert.equal(withCandidate.missingSlug, "capabilities/log");
    assert.deepEqual(withCandidate.similarSlugs, ["capabilities/login"]);
    assert.deepEqual(withCandidate.recoveryTools, ["list_concepts", "find_evidence"]);
    assert.equal(withCandidate.createTool, "add_concept");
    assert.ok(withCandidate.growthHint, "expected growthHint on not-found error");
    assert.match(withCandidate.growthHint.reason, /"capabilities\/log" does not resolve/);
    assert.deepEqual(withCandidate.growthHint.exampleCall, {
      tool: "get_concept",
      args: { slug: "capabilities/login" },
    });

    assert.equal(isErrorResponse(responses, 3), true);
    const withoutCandidate = getCallStructured(responses, 3);
    assert.equal(withoutCandidate.error, "Doc not found: totally-unrelated-thing");
    assert.deepEqual(withoutCandidate.growthHint.exampleCall, {
      tool: "add_concept",
      args: { slug: "totally-unrelated-thing", kind: "element", title: "Totally Unrelated Thing" },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — graph neighbors 와 outgoingEdges 포함", async () => {
  const root = makeVault([
    {
      slug: "project",
      content:
        "---\nkind: project\ntitle: Project\ndomains: [identity]\ncapabilities: [capabilities/auth]\ncontains: [documents/guide]\n---\nbody",
    },
    {
      slug: "capabilities/auth",
      content:
        "---\nkind: capability\ntitle: Auth\ndomain: identity\nelements: [token]\ndependencies: [storage]\nrelates: [security]\ndescribes: [documents/auth]\n---\nbody",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "capabilities/auth" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(result.neighbors.domain, "identity");
    assert.deepEqual(result.neighbors.elements, ["token"]);
    assert.deepEqual(result.neighbors.dependencies, ["storage"]);
    assert.deepEqual(result.neighbors.relates, ["security"]);
    assert.deepEqual(result.neighbors.describes, ["documents/auth"]);
    assert.deepEqual(result.outgoingEdges, [
      { to: "token", via: "elements" },
      { to: "storage", via: "dependencies" },
      { to: "security", via: "relates" },
      { to: "documents/auth", via: "describes" },
      { to: "identity", via: "domain" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept/get_concepts — tail/frontmatter slug alias 를 canonical slug 로 읽음", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nslug: auth-domain\nkind: domain\ntitle: Auth\n---\nbody D",
    },
    {
      slug: "capabilities/login",
      content: "---\nkind: capability\ntitle: Login\ndomain: domains/auth\n---\nbody L",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "login" }),
      callTool(3, "get_concept", { slug: "auth-domain" }),
      callTool(4, "get_concepts", { slugs: ["login", "auth-domain", "missing"] }),
    ]);
    const login = getCallParsed(responses, 2);
    const domain = getCallParsed(responses, 3);
    const batch = getCallParsed(responses, 4);
    assert.equal(login.slug, "capabilities/login");
    assert.equal(login.frontmatter.title, "Login");
    assert.equal(domain.slug, "domains/auth");
    assert.equal(domain.frontmatter.title, "Auth");
    assert.deepEqual(
      batch.concepts.map((row) => row.slug),
      ["capabilities/login", "domains/auth", "missing"],
    );
    assert.equal(batch.concepts[0].ok, true);
    assert.equal(batch.concepts[1].ok, true);
    assert.equal(batch.concepts[2].ok, false);
    assert.match(batch.concepts[2].error, /not found/i);
    assert.deepEqual(getCallStructured(responses, 4), batch);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept/add_relation — ambiguous alias 는 명시적 에러로 surface", async () => {
  const root = makeVault([
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Auth\n---\n" },
    { slug: "capabilities/auth", content: "---\nkind: capability\ntitle: Auth\n---\n" },
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "auth" }),
      callTool(3, "add_relation", {
        from: "project",
        to: "auth",
        type: "domains",
      }),
      callTool(4, "get_concept", { slug: "domains/auth" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(getCallText(responses, 2), /Ambiguous tail slug alias "auth"/);
    assert.equal(isErrorResponse(responses, 3), true);
    assert.match(getCallText(responses, 3), /Ambiguous tail slug alias "auth"/);
    const exact = getCallParsed(responses, 4);
    assert.equal(exact.slug, "domains/auth");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("identity reads — list/get/batch expose uid beside canonical slug and resolve exact uid selectors", async () => {
  const alphaUid = "11111111-1111-4111-8111-111111111111";
  const betaUid = "22222222-2222-4222-8222-222222222222";
  const root = makeVault([
    {
      slug: "alpha",
      content: `---\nuid: ${alphaUid}\nkind: capability\ntitle: Alpha\n---\nAlpha body`,
    },
    {
      slug: "beta",
      content: `---\nuid: ${betaUid}\nkind: element\ntitle: Beta\n---\nBeta body`,
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
      callTool(3, "get_concept", { slug: "alpha" }),
      callTool(4, "get_concept", { uid: betaUid }),
      callTool(5, "get_concepts", { uids: [betaUid, alphaUid] }),
      callTool(6, "get_concept", { slug: "alpha", uid: alphaUid }),
    ]);

    assert.deepEqual(
      getCallParsed(responses, 2).nodes.map(({ uid, slug }) => ({ uid, slug })),
      [
        { uid: alphaUid, slug: "alpha" },
        { uid: betaUid, slug: "beta" },
      ],
    );
    assert.deepEqual(
      (({ uid, slug }) => ({ uid, slug }))(getCallParsed(responses, 3)),
      { uid: alphaUid, slug: "alpha" },
    );
    assert.deepEqual(
      (({ uid, slug }) => ({ uid, slug }))(getCallParsed(responses, 4)),
      { uid: betaUid, slug: "beta" },
    );
    assert.deepEqual(
      getCallParsed(responses, 5).concepts.map(({ uid, slug }) => ({ uid, slug })),
      [
        { uid: betaUid, slug: "beta" },
        { uid: alphaUid, slug: "alpha" },
      ],
    );
    assert.equal(isErrorResponse(responses, 6), true);
    assert.match(getCallText(responses, 6), /exactly one of slug or uid/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// get_concepts batch reader: K slugs in one round trip. Input order is preserved,
// and a missing slug surfaces as an `{ ok: false, error }` row instead of aborting.
await test("get_concepts — 배치 read, 입력 순서 보존 + partial result", async () => {
  const root = makeVault([
    { slug: "alpha", content: "---\nkind: capability\ntitle: Alpha\n---\nbody A" },
    { slug: "beta", content: "---\nkind: element\ntitle: Beta\n---\nbody B" },
    { slug: "gamma", content: "---\nkind: capability\ntitle: Gamma\n---\nbody G" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: ["beta", "missing-slug", "alpha"] }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.concepts.length, 3, "concepts row 수 = 입력 slugs 수");
    // Order preserved: input [beta, missing, alpha] → output in the same order.
    assert.equal(result.concepts[0].slug, "beta");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[0].frontmatter.title, "Beta");
    assert.match(result.concepts[0].excerpt, /body B/);
    assert.equal(typeof result.concepts[0].neighbors, "object");
    assert.deepEqual(result.concepts[0].outgoingEdges, []);
    assert.equal(typeof result.concepts[0].mtime, "number");
    assert.ok(result.concepts[0].mtime > 0);
    // Missing slug → ok:false with an error message; the batch survives.
    assert.equal(result.concepts[1].slug, "missing-slug");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /not found/i);
    assert.equal(result.concepts[1].errorCode, "not_found");
    assert.equal(result.concepts[1].missingSlug, "missing-slug");
    assert.deepEqual(result.concepts[1].similarSlugs, []);
    assert.deepEqual(result.concepts[1].recoveryTools, ["list_concepts", "find_evidence"]);
    assert.equal(result.concepts[1].createTool, "add_concept");
    assert.equal(result.concepts[1].growthHint.exampleCall.tool, "add_concept");
    // The valid slug after it is processed normally.
    assert.equal(result.concepts[2].slug, "alpha");
    assert.equal(result.concepts[2].ok, true);
    assert.equal(result.concepts[2].frontmatter.title, "Alpha");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concepts — invalid slug rows are isolated as partial results", async () => {
  const root = makeVault([
    { slug: "alpha", content: "---\nkind: capability\ntitle: Alpha\n---\nbody A" },
    { slug: "beta", content: "---\nkind: element\ntitle: Beta\n---\nbody B" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: ["alpha", " beta", "", null, 123, "beta"] }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts.length, 6, "concepts row 수 = 입력 slugs 수");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[0].slug, "alpha");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /slug must not have leading or trailing whitespace/i);
    assert.equal(result.concepts[2].ok, false);
    assert.match(result.concepts[2].error, /slug must be a non-empty string/i);
    assert.equal(result.concepts[3].ok, false);
    assert.equal(result.concepts[3].slug, null);
    assert.match(result.concepts[3].error, /slug must be a non-empty string/i);
    assert.equal(result.concepts[4].ok, false);
    assert.equal(result.concepts[4].slug, 123);
    assert.match(result.concepts[4].error, /slug must be a non-empty string/i);
    assert.equal(result.concepts[5].ok, true);
    assert.equal(result.concepts[5].slug, "beta");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// get_concepts empty-array and cap (50) gates: a normal empty response vs an error.
await test("get_concepts — 빈 slugs[] → 빈 concepts[], 51개 → error", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\n---\n" },
  ]);
  try {
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: [] }),
    ]);
    const empty = getCallParsed(r1, 2);
    assert.deepEqual(empty.concepts, []);

    // 51 entries → error response (the batch call itself throws; MCP serialises the error).
    const tooMany = Array.from({ length: 51 }, (_, i) => `s${i}`);
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: tooMany }),
    ]);
    // The server throws, so the MCP response carries isError content or an error
    // field. Only checked for our cap message ("Too many slugs") in the text.
    const text = JSON.stringify(r2.find((r) => r.id === 2));
    assert.match(text, /Too many slugs|50/i);
    assert.equal(getCallStructured(r2, 2)?.errorCode, "invalid_arguments");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// add_concepts batch writer, so an /ontology-bootstrap flow lands several nodes in
// one call. Input order is preserved and results are partial (one row failing does
// not abort the batch).
await test("add_concepts — 배치 write, 순서 보존 + partial result", async () => {
  const root = makeVault([
    { slug: "exist", content: "---\nkind: capability\ntitle: Exist\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "alpha", kind: "capability", title: "Alpha", domain: "auth" },
          // existing slug → ok:false
          { slug: "exist", kind: "capability", title: "Existing" },
          { slug: "beta", kind: "element", title: "Beta", domain: "auth" },
          // missing required → ok:false
          { slug: "gamma", kind: "capability" },
        ],
      }),
      // Verify the landed rows with a list after the batch
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.concepts.length, 4, "concepts row 수 = 입력 길이");
    // Order preserved: alpha → exist (fail) → beta → gamma (fail)
    assert.equal(result.concepts[0].slug, "alpha");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(typeof result.concepts[0].filePath, "string");
    assert.equal(result.concepts[0].changed, true);
    assert.equal(result.concepts[1].slug, "exist");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /already exists|exist/i);
    assert.equal(result.concepts[1].errorCode, "conflict");
    assert.equal(result.concepts[1].conflictSlug, "exist");
    assert.deepEqual(result.concepts[1].recoveryTools, ["patch_concept", "rename_concept"]);
    assert.deepEqual(result.concepts[1].avoidTools, ["delete_concept"]);
    assert.equal(result.concepts[2].slug, "beta");
    assert.equal(result.concepts[2].ok, true);
    assert.equal(result.concepts[3].slug, "gamma");
    assert.equal(result.concepts[3].ok, false);
    assert.match(result.concepts[3].error, /required|title/i);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "batch concept postWriteMaintenance");
    assert.equal(result.concepts[0].postWriteMaintenance, undefined);
    // The list response gains alpha and beta; gamma is absent.
    const list = getCallParsed(responses, 3);
    const slugs = list.nodes.map((n) => n.slug).sort();
    assert.ok(slugs.includes("alpha"), "alpha land");
    assert.ok(slugs.includes("beta"), "beta land");
    assert.ok(slugs.includes("exist"), "exist 그대로");
    assert.ok(!slugs.includes("gamma"), "gamma fail → land 안 됨");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concept/add_concepts — implementation path is preserved as evidence", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", {
        slug: "elements/router",
        kind: "element",
        title: "Router",
        domain: "domains/navigation",
        path: "src/router.ts",
      }),
      callTool(3, "add_concepts", {
        concepts: [{
          slug: "elements/store",
          kind: "element",
          title: "Store",
          domain: "domains/data",
          path: "src/store.ts",
        }],
      }),
      callTool(4, "get_concepts", { slugs: ["elements/router", "elements/store"] }),
    ]);
    assert.equal(isErrorResponse(responses, 2), false);
    assert.equal(getCallParsed(responses, 3).concepts[0].ok, true);
    const docs = getCallParsed(responses, 4).concepts;
    assert.equal(docs[0].frontmatter.path, "src/router.ts");
    assert.equal(docs[1].frontmatter.path, "src/store.ts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Authorship `created_by` (decision ledger, 2026-07-31) ──────────────────
//
// A write that came through this server was made by **an agent** — the call path
// itself proves it, so it cannot be forged. Retroactive inference is forbidden and
// absence is unknown. The pure contract (value conventions, schema, query filters)
// belongs to `tests/contract/created-by-provenance.contract.test.ts`; this measures
// **what the running server actually leaves on disk**.

function writeHeartbeat(root, agent) {
  mkdirSync(join(root, ".ontology-atlas"), { recursive: true });
  writeFileSync(
    join(root, ".ontology-atlas", "agent-activity.json"),
    JSON.stringify({ agent, state: "editing", updatedAt: new Date().toISOString() }),
    "utf-8",
  );
}

await test("add_concept/add_concepts — created_by 는 활동 로그와 같은 신원으로 찍힌다", async () => {
  const root = makeVault([]);
  writeHeartbeat(root, "codex");
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", { slug: "capabilities/single", kind: "capability", title: "Single", domain: "auth" }),
      callTool(3, "add_concepts", {
        concepts: [{ slug: "capabilities/batch", kind: "capability", title: "Batch", domain: "auth" }],
      }),
      callTool(4, "get_concepts", { slugs: ["capabilities/single", "capabilities/batch"] }),
      // The other side of "show only what a human made" — an agent's write is not counted as human.
      callTool(5, "query_concepts", { filter: "created_by=human" }),
      callTool(6, "query_concepts", { filter: 'created_by="agent:codex"' }),
    ]);
    const docs = getCallParsed(responses, 4).concepts;
    assert.equal(docs[0].frontmatter.created_by, "agent:codex", "single write stamps the heartbeat agent");
    assert.equal(docs[1].frontmatter.created_by, "agent:codex", "batch write stamps the same identity");
    assert.equal(getCallParsed(responses, 5).total, 0, "agent writes never count as human");
    assert.equal(getCallParsed(responses, 6).total, 2, "created_by filter selects the agent's nodes");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concept/add_concepts — 하트비트가 없으면 이름만 모른다 (사람으로 떨어지지 않는다)", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", { slug: "capabilities/nameless", kind: "capability", title: "Nameless", domain: "auth" }),
      callTool(3, "get_concept", { slug: "capabilities/nameless" }),
      callTool(4, "query_concepts", { filter: "created_by=human" }),
    ]);
    assert.equal(getCallParsed(responses, 3).frontmatter.created_by, "agent:unknown");
    assert.equal(getCallParsed(responses, 4).total, 0, "an unnamed agent is still not a human");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The `agent` field of the activity log (activity.jsonl) knows one step more than
// created_by: even with no heartbeat (deliberate registration), the initialize
// greeting's clientInfo.name is recorded (2026-08-13 — the piece that names the
// activity of claude-code/codex sessions that connect without registering). The
// created_by stamp still trusts the heartbeat alone, because that value is written
// permanently into the vault and must not admit an automatic guess (decision
// ledger, 2026-07-31). The pure precedence logic belongs to activity-log.test.mjs;
// this measures the wiring — whether the server really persists the greeted name.
await test("add_concept/add_concepts — 활동 기록 agent 는 하트비트 없이도 연결 인사 이름을 남긴다", async () => {
  const noHeartbeat = makeVault([]);
  const withHeartbeat = makeVault([]);
  writeHeartbeat(withHeartbeat, "codex");
  try {
    await rpc(noHeartbeat, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", { slug: "capabilities/hello", kind: "capability", title: "Hello", domain: "auth" }),
    ]);
    const readLastAgent = (root) => {
      const lines = readFileSync(join(root, ".ontology-atlas", "activity.jsonl"), "utf-8").trim().split("\n");
      assert.ok(lines.length > 0, "활동 기록이 비어 있으면 이 테스트는 공회전이다");
      return JSON.parse(lines[lines.length - 1]).agent;
    };
    assert.equal(readLastAgent(noHeartbeat), "test", "INIT_REQUESTS 의 clientInfo.name 이 남아야 한다");

    await rpc(withHeartbeat, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", { slug: "capabilities/hello", kind: "capability", title: "Hello", domain: "auth" }),
    ]);
    assert.equal(readLastAgent(withHeartbeat), "codex", "하트비트가 있으면 인사 이름보다 우선한다");
  } finally {
    rmSync(noHeartbeat, { recursive: true, force: true });
    rmSync(withHeartbeat, { recursive: true, force: true });
  }
});

// 2026-08-16 — the bug where the reason for a batch-written relation **vanished
// from the activity record only**. `why` reached the frontmatter, but
// `summarizeWrite`'s batch branch returned `{target, summary}` alone, so it was
// dropped from the log line. In that state all 15 activity lines in a live vault
// read `why: null`, and that nearly became **evidence for the wrong conclusion**
// ("the conversation happens outside the app, so no reason is recorded").
await test("add_relations — 배치로 쓴 관계도 활동 기록에 이유를 남긴다", async () => {
  const root = makeVault([
    { slug: "capabilities/a", content: "---\nslug: capabilities/a\nkind: capability\ntitle: A\ndomain: auth\n---\n\n# A\n" },
    { slug: "capabilities/b", content: "---\nslug: capabilities/b\nkind: capability\ntitle: B\ndomain: auth\n---\n\n# B\n" },
    { slug: "capabilities/c", content: "---\nslug: capabilities/c\nkind: capability\ntitle: C\ndomain: auth\n---\n\n# C\n" },
  ]);
  try {
    await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", {
        relations: [
          { from: "capabilities/a", to: "capabilities/b", type: "depends_on", why: "토큰 검증이 세션 조회를 먼저 한다" },
          { from: "capabilities/a", to: "capabilities/c", type: "depends_on", why: "감사 줄을 남기지 못하면 보내지 않는다" },
        ],
      }),
    ]);
    const lines = readFileSync(join(root, ".ontology-atlas", "activity.jsonl"), "utf-8").trim().split("\n");
    assert.ok(lines.length > 0, "활동 기록이 비어 있으면 이 테스트는 공회전이다");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.tool, "add_relations");
    assert.ok(last.why, "배치 관계의 이유가 기록에서 사라졌다");
    assert.match(last.why, /토큰 검증/, "첫 행의 이유가 없다");
    assert.match(last.why, /감사 줄/, "둘째 행의 이유가 없다");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relations — 같은 이유가 반복되면 한 번만 적는다", async () => {
  // Ten rows sharing a reason would print it ten times and become unreadable.
  const root = makeVault([
    { slug: "capabilities/a", content: "---\nslug: capabilities/a\nkind: capability\ntitle: A\ndomain: auth\n---\n\n# A\n" },
    { slug: "capabilities/b", content: "---\nslug: capabilities/b\nkind: capability\ntitle: B\ndomain: auth\n---\n\n# B\n" },
    { slug: "capabilities/c", content: "---\nslug: capabilities/c\nkind: capability\ntitle: C\ndomain: auth\n---\n\n# C\n" },
  ]);
  try {
    await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", {
        relations: [
          { from: "capabilities/a", to: "capabilities/b", type: "depends_on", why: "같은 이유" },
          { from: "capabilities/a", to: "capabilities/c", type: "depends_on", why: "같은 이유" },
        ],
      }),
    ]);
    const lines = readFileSync(join(root, ".ontology-atlas", "activity.jsonl"), "utf-8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal((last.why.match(/같은 이유/g) ?? []).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — created_by 는 보존되고 덮어쓸 수 없다", async () => {
  const root = makeVault([
    {
      slug: "capabilities/by-hand",
      content: "---\nslug: capabilities/by-hand\nkind: capability\ntitle: By Hand\ncreated_by: human\n---\n\n# By Hand\n",
    },
    {
      slug: "capabilities/unknown-origin",
      content: "---\nslug: capabilities/unknown-origin\nkind: capability\ntitle: Unknown Origin\n---\n\n# Unknown Origin\n",
    },
  ]);
  writeHeartbeat(root, "codex");
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      // A patch is not authorship — an agent refining a human's node leaves the origin human.
      callTool(2, "patch_concept", { slug: "capabilities/by-hand", frontmatter: { domain: "auth" } }),
      callTool(3, "get_concept", { slug: "capabilities/by-hand" }),
      // A patch never invents an origin for a node that has none.
      callTool(4, "patch_concept", { slug: "capabilities/unknown-origin", frontmatter: { domain: "auth" } }),
      callTool(5, "get_concept", { slug: "capabilities/unknown-origin" }),
      // A patch claiming to be human is rejected.
      callTool(6, "patch_concept", { slug: "capabilities/unknown-origin", frontmatter: { created_by: "human" } }),
    ]);
    assert.equal(getCallParsed(responses, 3).frontmatter.created_by, "human", "patch preserves an existing stamp");
    const unknownOrigin = getCallParsed(responses, 5).frontmatter;
    assert.equal(unknownOrigin.domain, "auth", "the patch itself still lands");
    assert.equal(
      Object.hasOwn(unknownOrigin, "created_by"),
      false,
      "absence stays absence — patching never invents an origin",
    );
    assert.equal(isErrorResponse(responses, 6), true, "created_by cannot be patched");
    assert.match(
      responses.find((r) => r.id === 6).result.content[0].text,
      /created_by cannot be patched/i,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("absorb_document — 흡수한 노드도 에이전트 저작으로 찍힌다", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "ontology-atlas-absorb-origin-"));
  const vault = join(repoRoot, "vault");
  mkdirSync(vault);
  writeHeartbeat(vault, "codex");
  const sourcePath = join(repoRoot, "AGENTS.md");
  writeFileSync(
    sourcePath,
    ["# Agent Guide", "", "## Security Policy", "", "Always review destructive changes before applying them.", ""].join("\n"),
    "utf-8",
  );
  try {
    const { responses } = await rpc(
      vault,
      [
        ...INIT_REQUESTS,
        callTool(2, "absorb_document", { filePath: sourcePath, confirm: true }),
        callTool(3, "query_concepts", { filter: 'created_by="agent:codex"' }),
        callTool(4, "query_concepts", { filter: "created_by=human" }),
      ],
      3000,
      { OATLAS_REPO_ROOT: repoRoot },
    );
    const applied = getCallParsed(responses, 2);
    assert.equal(applied.ok, true);
    assert.ok(applied.written.length > 0, "absorb wrote at least one node");
    assert.equal(getCallParsed(responses, 3).total, applied.written.length, "every absorbed node carries the agent stamp");
    assert.equal(getCallParsed(responses, 4).total, 0, "absorption is never human authorship");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("add_concept/add_concepts — 명시한 빈 body 는 기본 본문으로 대체하지 않음", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", {
        slug: "single-empty-body",
        kind: "document",
        title: "Single Empty Body",
        body: "",
      }),
      callTool(3, "add_concepts", {
        concepts: [
          {
            slug: "batch-empty-body",
            kind: "document",
            title: "Batch Empty Body",
            body: "",
          },
          {
            slug: "batch-default-body",
            kind: "document",
            title: "Batch Default Body",
          },
        ],
      }),
      callTool(4, "get_concept", { slug: "single-empty-body" }),
      callTool(5, "get_concept", { slug: "batch-empty-body" }),
      callTool(6, "get_concept", { slug: "batch-default-body" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), false);
    assert.deepEqual(getCallStructured(responses, 2), getCallParsed(responses, 2));
    const batch = getCallParsed(responses, 3);
    assert.equal(batch.concepts[0].ok, true);
    assert.equal(batch.concepts[1].ok, true);
    assert.equal(getCallParsed(responses, 4).excerpt, "");
    assert.equal(getCallParsed(responses, 5).excerpt, "");
    assert.notEqual(getCallParsed(responses, 6).excerpt, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// add_concepts empty-array and cap (50) gates, pinning the same batch contract on
// the writer side as get_concepts and add_relations.
await test("add_concepts — 빈 concepts[] → 빈 results, 51개 → error", async () => {
  const root = makeVault([]);
  try {
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", { concepts: [] }),
    ]);
    const result = getCallParsed(r1, 2);
    assert.deepEqual(result.concepts, []);

    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      slug: `cap-${i}`,
      kind: "capability",
      title: `Cap ${i}`,
      domain: "test",
    }));
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", { concepts: tooMany }),
    ]);
    const text = JSON.stringify(r2.find((r) => r.id === 2));
    assert.match(text, /Too many concepts|50/i);
    assert.equal(getCallStructured(r2, 2)?.errorCode, "invalid_arguments");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// add_concepts detects duplicate slugs within the input up front, so the second row
// gets a clearer error (row label plus first-seen index) than "already exists".
await test("add_concepts — 입력 내 중복 slug 두번째는 ok:false", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "dup", kind: "capability", title: "First", domain: "x" },
          { slug: "dup", kind: "capability", title: "Second", domain: "y" },
        ],
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "첫 row land");
    assert.equal(result.concepts[1].ok, false, "두번째 동일 slug 는 fail");
    assert.match(result.concepts[1].error, /concepts\[1\] duplicate slug in input batch/i);
    assert.match(result.concepts[1].error, /first seen at concepts\[0\]/i);
    assert.equal(result.concepts[1].errorCode, "conflict");
    assert.equal(result.concepts[1].rowName, "concepts[1]");
    assert.equal(result.concepts[1].conflictSubject, "Duplicate slug in input batch");
    assert.equal(result.concepts[1].conflictSlug, "dup");
    assert.equal(result.concepts[1].firstSeenAt, "concepts[0]");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The same slug is an error (data protection), but the same title on a different
// slug lands both with a near-duplicate advisory — catching bootstrap's #1 failure
// mode (splitting one concept into two nodes) in the first batch, by in-batch
// comparison with no vault load.
await test("add_concepts — 같은 title 의 두번째 row 는 land 하되 near-duplicate warning", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "alpha", kind: "capability", title: "Shared Title", domain: "x" },
          { slug: "beta", kind: "capability", title: "shared   title", domain: "x" },
        ],
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "첫 row land");
    assert.ok(
      !(result.concepts[0].warnings ?? []).some((w) => /already exists/i.test(w)),
      "첫 row 는 dup 경고 없음",
    );
    assert.equal(result.concepts[1].ok, true, "두번째 row 도 land (advisory, 막지 않음)");
    assert.ok(
      (result.concepts[1].warnings ?? []).some(
        (w) => /already exists at "alpha"/i.test(w) && /patch_concept/i.test(w),
      ),
      "두번째 row 는 정규화 동일 title 에 대한 near-duplicate 경고",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — object 가 아닌 row 는 row-level error 로 격리", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "ok", kind: "capability", title: "OK" },
          null,
          "not-object",
          [],
        ],
      }),
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "valid row still lands");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /concepts\[1\] must be an object/i);
    assert.equal(result.concepts[2].ok, false);
    assert.match(result.concepts[2].error, /concepts\[2\] must be an object/i);
    assert.equal(result.concepts[3].ok, false);
    assert.match(result.concepts[3].error, /concepts\[3\] must be an object/i);
    const list = getCallParsed(responses, 3);
    assert.ok(list.nodes.some((node) => node.slug === "ok"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — blank/padded scalar row 는 row-level error 로 격리", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "ok", kind: "capability", title: "OK", domain: "x" },
          { slug: " padded", kind: "capability", title: "Padded Slug", domain: "x" },
          { slug: "bad-title", kind: "capability", title: " Bad Title", domain: "x" },
          { slug: "bad-domain", kind: "capability", title: "Bad Domain", domain: " x" },
          { slug: "blank-title", kind: "capability", title: "   ", domain: "x" },
        ],
      }),
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "valid row still lands");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /slug must not have leading or trailing whitespace/i);
    assert.equal(result.concepts[2].ok, false);
    assert.match(result.concepts[2].error, /title must not have leading or trailing whitespace/i);
    assert.equal(result.concepts[3].ok, false);
    assert.match(result.concepts[3].error, /domain must not have leading or trailing whitespace/i);
    assert.equal(result.concepts[4].ok, false);
    assert.match(result.concepts[4].error, /title must be a non-empty string/i);
    const list = getCallParsed(responses, 3);
    assert.deepEqual(list.nodes.map((node) => node.slug), ["ok"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — unknown row field 는 row-level error 로 격리", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "ok", kind: "capability", title: "OK", domain: "x" },
          {
            slug: "typo-title",
            kind: "capability",
            title: "Typo Title",
            domain: "x",
            titel: "ignored typo",
          },
          {
            slug: "multi-typo",
            kind: "capability",
            title: "Multi Typo",
            domain: "x",
            titel: "ignored typo",
            domian: "ignored typo",
          },
        ],
      }),
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "valid row still lands");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /Unknown field "titel" in concepts\[1\]/i);
    assert.match(result.concepts[1].error, /Did you mean "title"\?/i);
    assert.match(result.concepts[1].error, /Received fields: domain, kind, slug, titel, title/i);
    assert.equal(result.concepts[1].errorCode, "invalid_arguments");
    assert.equal(result.concepts[1].rowName, "concepts[1]");
    assert.equal(result.concepts[1].receivedField, "titel");
    assert.equal(result.concepts[1].suggestion, "title");
    assert.deepEqual(result.concepts[1].unknownFields, [{ name: "titel", suggestion: "title" }]);
    assert.deepEqual(result.concepts[1].receivedFields, ["domain", "kind", "slug", "titel", "title"]);
    assert.equal(result.concepts[2].ok, false);
    assert.match(result.concepts[2].error, /Unknown fields in concepts\[2\]/i);
    assert.match(result.concepts[2].error, /"titel" \(did you mean "title"\?\)/i);
    assert.match(result.concepts[2].error, /"domian" \(did you mean "domain"\?\)/i);
    assert.match(result.concepts[2].error, /Received fields: domain, domian, kind, slug, titel, title/i);
    assert.deepEqual(result.concepts[2].unknownFields, [
      { name: "titel", suggestion: "title" },
      { name: "domian", suggestion: "domain" },
    ]);
    const list = getCallParsed(responses, 3);
    assert.deepEqual(list.nodes.map((node) => node.slug), ["ok"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP slug conflicts expose structured recovery fields", async () => {
  const root = makeVault([
    { slug: "exist", content: "---\nkind: capability\ntitle: Exist\n---\n" },
    { slug: "target", content: "---\nkind: capability\ntitle: Target\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", {
        slug: "exist",
        kind: "capability",
        title: "Existing",
      }),
      callTool(3, "rename_concept", {
        oldSlug: "exist",
        newSlug: "target",
        confirm: true,
      }),
      callTool(4, "rename_concept", {
        oldSlug: "exist",
        newSlug: "target",
        confirm: true,
        overwrite: true,
      }),
    ]);

    assert.equal(isErrorResponse(responses, 2), true);
    const existingDoc = getCallStructured(responses, 2);
    assert.equal(existingDoc.errorCode, "conflict");
    assert.equal(existingDoc.conflictSubject, "Doc already exists");
    assert.equal(existingDoc.conflictSlug, "exist");
    assert.deepEqual(existingDoc.recoveryTools, ["patch_concept", "rename_concept"]);
    assert.deepEqual(existingDoc.avoidTools, ["delete_concept"]);

    assert.equal(isErrorResponse(responses, 3), true);
    const existingTarget = getCallStructured(responses, 3);
    assert.equal(existingTarget.errorCode, "conflict");
    assert.equal(existingTarget.conflictSubject, "Target slug already exists");
    assert.equal(existingTarget.conflictSlug, "target");
    assert.deepEqual(existingTarget.recoveryTools, ["rename_concept"]);
    assert.equal(existingTarget.overwriteOption, "overwrite");

    assert.equal(isErrorResponse(responses, 4), false);
    const overwritten = getCallStructured(responses, 4);
    assert.equal(overwritten.ok, true);
    assert.equal(overwritten.moved, true);
    const targetDoc = readFileSync(join(root, "target.md"), "utf-8");
    assert.match(targetDoc, /title: Exist/);
    assert.doesNotMatch(targetDoc, /title: Target/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/*
 * Bug sweep 2026-09-01, reproduced: on macOS/Windows a wrong-case slug passes
 * `existsSync` while backlink matching is a case-sensitive string comparison, so
 * `rename_concept{oldSlug:"capabilities/Auth"}` deleted `auth.md`, redirected
 * **0** backlinks, and reported success — and `delete_concept` deleted a
 * referenced node without `force` because `findBacklinks` saw no referrers.
 * Destructive tools now resolve the caller's spelling to the on-disk one first.
 */
await test("MCP rename_concept with a wrong-case oldSlug still redirects backlinks", async () => {
  const root = makeVault([
    { slug: "capabilities/auth", content: "---\nkind: capability\ntitle: Auth\n---\n" },
    {
      slug: "d1",
      content: "---\nkind: document\ntitle: D1\ncapabilities: [capabilities/auth]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "capabilities/Auth",
        newSlug: "capabilities/authn",
        confirm: true,
      }),
    ]);
    assert.equal(isErrorResponse(responses, 2), false);
    const renamed = getCallStructured(responses, 2);
    assert.equal(renamed.ok, true);
    assert.equal(renamed.moved, true);
    assert.equal(renamed.oldSlug, "capabilities/auth");
    assert.equal(renamed.backlinkUpdates.totalUpdated, 1);
    assert.equal(existsSync(join(root, "capabilities", "auth.md")), false);
    assert.equal(existsSync(join(root, "capabilities", "authn.md")), true);
    const referrer = readFileSync(join(root, "d1.md"), "utf-8");
    assert.match(referrer, /capabilities\/authn/);
    assert.doesNotMatch(referrer, /capabilities\/auth\b(?!n)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP rename_concept refuses a target that case-collides with another document", async () => {
  const root = makeVault([
    { slug: "capabilities/auth", content: "---\nkind: capability\ntitle: Auth\n---\n" },
    { slug: "capabilities/search", content: "---\nkind: capability\ntitle: Search\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "capabilities/search",
        newSlug: "capabilities/AUTH",
        confirm: true,
      }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(getCallText(responses, 2), /letter case/i);
    assert.equal(existsSync(join(root, "capabilities", "search.md")), true);
    assert.equal(existsSync(join(root, "capabilities", "auth.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP delete_concept with a wrong-case slug still sees its backlinks", async () => {
  const root = makeVault([
    { slug: "capabilities/auth", content: "---\nkind: capability\ntitle: Auth\n---\n" },
    {
      slug: "d1",
      content: "---\nkind: document\ntitle: D1\ncapabilities: [capabilities/auth]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "delete_concept", { slug: "capabilities/Auth", confirm: true }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(getCallText(responses, 2), /backlink/i);
    assert.equal(existsSync(join(root, "capabilities", "auth.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP rename_concept preserves a frontmatter slug alias that differs from the file slug", async () => {
  // The dogfood pattern: project.md carries a user-facing `slug: ontology-atlas`
  // alias other documents reference by that spelling. Rename used to overwrite
  // the alias with newSlug, severing every alias-form ref silently.
  const root = makeVault([
    {
      slug: "capabilities/auth",
      content: "---\nkind: capability\ntitle: Auth\nslug: auth-alias\n---\n",
    },
    {
      slug: "d1",
      content: "---\nkind: document\ntitle: D1\ncapabilities: [auth-alias]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "capabilities/auth",
        newSlug: "capabilities/authn",
        confirm: true,
      }),
      callTool(3, "find_backlinks", { slug: "capabilities/authn" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), false);
    const renamedDoc = readFileSync(join(root, "capabilities", "authn.md"), "utf-8");
    assert.match(renamedDoc, /slug: auth-alias/);
    const backlinks = getCallStructured(responses, 3);
    assert.deepEqual(backlinks.matches.map((row) => row.slug), ["d1"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP delete_concept treats an ambiguous-tail referrer as a blocking backlink", async () => {
  // capabilities/foo and elements/foo share a tail; d1's `capabilities: [foo]`
  // could mean either. Deleting a candidate without force must be refused —
  // before the shared ref index, findBacklinks saw no referrer for either node
  // and the safety gate waved the delete through (bug sweep 2026-09-01).
  const root = makeVault([
    { slug: "capabilities/foo", content: "---\nkind: capability\ntitle: Foo Cap\n---\n" },
    { slug: "elements/foo", content: "---\nkind: element\ntitle: Foo El\n---\n" },
    {
      slug: "d1",
      content: "---\nkind: document\ntitle: D1\ncapabilities: [foo]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "delete_concept", { slug: "capabilities/foo", confirm: true }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(getCallText(responses, 2), /backlink/i);
    assert.equal(existsSync(join(root, "capabilities", "foo.md")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP write tools — finalize project meaning survives a fresh MCP process and fails closed after a body edit", async () => {
  const competency = renderProjectCompetencyMarkdown({
    scope: {
      answer: "The project enables one bounded checkout outcome.",
      status: "answered",
      witnesses: { concepts: ["project"], relations: [], evidence: ["README.md"], paths: [] },
    },
    domains: {
      answer: "Core owns the checkout responsibility boundary.",
      status: "answered",
      witnesses: {
        concepts: ["domains/core"],
        relations: [{ from: "project", to: "domains/core", type: "contains" }],
        evidence: ["README.md"],
        paths: [],
      },
    },
    abilities: {
      answer: "Search realizes one observable product ability.",
      status: "answered",
      witnesses: {
        concepts: ["capabilities/search"],
        relations: [{ from: "domains/core", to: "capabilities/search", type: "contains" }],
        evidence: ["src/search.ts"],
        paths: [],
      },
    },
    evidence: {
      answer: "The search and checkout modules are the implementation entrypoints.",
      status: "answered",
      witnesses: {
        concepts: ["capabilities/checkout", "capabilities/search"],
        relations: [],
        evidence: ["src/checkout.ts", "src/search.ts"],
        paths: ["src/checkout.ts", "src/search.ts"],
      },
    },
    impact: {
      answer: "Checkout depends on search.",
      status: "answered",
      witnesses: {
        concepts: ["capabilities/checkout", "capabilities/search"],
        relations: [{ from: "capabilities/checkout", to: "capabilities/search", type: "depends_on" }],
        evidence: ["src/checkout.ts"],
        paths: [],
      },
    },
  });
  const root = makeVault([
    {
      slug: "project",
      content: `---\nslug: project\nkind: project\ntitle: Project\npath: README.md\ncontains: [domains/core]\n---\n## Definition\n\nSynthetic project.\n\n${competency}`,
    },
    {
      slug: "domains/core",
      content: "---\nslug: domains/core\nkind: domain\ntitle: Core\ncontains: [capabilities/checkout, capabilities/search]\n---\n",
    },
    {
      slug: "capabilities/search",
      content: "---\nslug: capabilities/search\nkind: capability\ntitle: Search\ndomain: domains/core\npath: src/search.ts\n---\n",
    },
    {
      slug: "capabilities/checkout",
      content: "---\nslug: capabilities/checkout\nkind: capability\ntitle: Checkout\ndomain: domains/core\npath: src/checkout.ts\ndependencies: [capabilities/search]\n---\n",
    },
  ]);
  try {
    const graphHash = buildProjectSourceGraphHash("project", loadVaultDocs(root));
    mkdirSync(join(root, ".ontology-atlas"), { recursive: true });
    writeFileSync(join(root, ".ontology-atlas", "project-sources.json"), JSON.stringify({
      contractVersion: 1,
      bindings: [{
        projectSlug: "project",
        sourceId: "source_project",
        rootPath: "/private/synthetic/project",
        kind: "git",
        boundAt: "2026-08-02T10:00:00.000Z",
        receipt: {
          contractVersion: 1,
          projectSlug: "project",
          sourceId: "source_project",
          sourceKind: "git",
          sourceRevision: "abc123",
          sourceFingerprint: "git:abc123:clean",
          graphHash,
          measuredAt: "2026-08-02T10:00:01.000Z",
          status: "verified_current",
          currentness: "current",
          topGap: null,
          nextAction: { id: "use_current_evidence" },
          witnessSummary: { total: 3, supported: 3, missing: 0 },
          witnesses: [
            { id: "project_readme", nodeSlug: "project", role: "scope", path: "README.md", supported: true },
            { id: "search_path", nodeSlug: "capabilities/search", role: "implementation", path: "src/search.ts", supported: true },
            { id: "checkout_path", nodeSlug: "capabilities/checkout", role: "implementation", path: "src/checkout.ts", supported: true },
          ],
          diagnostics: { dirty: false, truncated: false },
        },
      }],
    }), "utf8");

    const projectPath = join(root, "project.md");
    const first = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "finalize_project_meaning", {
        projectSlug: "project",
        expected_mtime: statSync(projectPath).mtimeMs,
      }),
    ]);
    const finalized = getCallParsed(first.responses, 2);
    assert.equal(finalized.ok, true);
    assert.equal(finalized.projectSlug, "project");
    assert.equal(JSON.stringify(finalized).includes("/private/synthetic"), false);

    const second = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "agent_brief", project: "project" }),
    ]);
    const brief = getCallParsed(second.responses, 2);
    assert.equal(brief.meaningAssessment.status, "review_required");
    assert.equal(brief.status, "needs_attention");
    assert.equal(brief.readiness.status, "needs_attention");
    assert.ok(brief.readiness.score < 100);
    assert.ok(brief.nextActions.some((action) => action.id === "meaning_assessment"));
    assert.equal(brief.meaningAssessment.dimensions.competency.status, "answered");
    assert.equal(brief.meaningAssessment.dimensions.source.currentness, "unavailable");
    assert.equal(JSON.stringify(brief.meaningAssessment).includes("src/search.ts"), false);

    writeFileSync(projectPath, `${readFileSync(projectPath, "utf8")}\nHuman edit.\n`, "utf8");
    const third = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "agent_brief", project: "project" }),
    ]);
    const edited = getCallParsed(third.responses, 2);
    assert.equal(edited.meaningAssessment.status, "invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("MCP write tools — blank/padded string inputs are rejected before disk writes", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", {
        slug: "   ",
        kind: "capability",
        title: "Blank Slug",
      }),
      callTool(3, "add_concept", {
        slug: " padded",
        kind: "capability",
        title: "Padded Slug",
      }),
      callTool(4, "add_relation", {
        from: "a",
        to: " b ",
        type: "relates",
      }),
      callTool(5, "patch_concept", {
        slug: "a",
        frontmatter: ["not", "object"],
      }),
      callTool(6, "add_concepts", {
        concepts: [
          { slug: "ok", kind: "capability", title: "OK" },
          { slug: "   ", kind: "capability", title: "Bad" },
        ],
      }),
      callTool(7, "rename_concept", {
        oldSlug: " a ",
        newSlug: "renamed-a",
        confirm: true,
      }),
      callTool(8, "merge_concepts", {
        fromSlug: "a",
        intoSlug: " b ",
        confirm: true,
      }),
      callTool(9, "delete_concept", {
        slug: " b ",
        confirm: true,
      }),
      callTool(10, "list_concepts"),
      callTool(11, "add_concept", {
        slug: "array-bad",
        kind: "capability",
        title: "Array Bad",
        capabilities: ["ok", " "],
      }),
      callTool(12, "add_concept", {
        slug: "array-padded",
        kind: "capability",
        title: "Array Padded",
        elements: [" element"],
      }),
      callTool(13, "rename_concept", {
        oldSlug: "a",
        newSlug: "renamed-a",
        confirm: "true",
      }),
      callTool(14, "rename_concept", {
        oldSlug: "a",
        newSlug: "renamed-a",
        overwrite: 1,
      }),
      callTool(15, "merge_concepts", {
        fromSlug: "a",
        intoSlug: "b",
        confirm: "true",
      }),
      callTool(16, "delete_concept", {
        slug: "a",
        confirm: "true",
      }),
      callTool(17, "delete_concept", {
        slug: "a",
        force: "true",
      }),
      callTool(18, "add_relation", {
        from: "a",
        to: "b",
        type: "relates",
        expected_mtime: "123",
      }),
      callTool(19, "patch_concept", {
        slug: "a",
        frontmatter: { title: "A2" },
        expected_mtime: -1,
      }),
      callTool(20, "rename_concept", {
        oldSlug: "a",
        newSlug: "renamed-a",
        expected_mtime: Number.NaN,
      }),
      callTool(21, "merge_concepts", {
        fromSlug: "a",
        intoSlug: "b",
        expected_mtime: "123",
      }),
      callTool(22, "delete_concept", {
        slug: "a",
        expected_mtime: -1,
      }),
      callTool(23, "add_relations", {
        relations: [
          { from: "a", to: "b", type: "relates", expected_mtime: "123" },
        ],
      }),
    ]);
    for (const id of [
      2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} should be rejected`);
    }
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /slug must be a non-empty string/i);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 4).result.content[0].text, /to must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 5).result.content[0].text, /frontmatter must be an object/i);

    const batch = getCallParsed(responses, 6);
    assert.equal(batch.concepts[0].ok, true, "valid batch row still lands");
    assert.equal(batch.concepts[1].ok, false, "invalid batch row is isolated");
    assert.match(batch.concepts[1].error, /slug must be a non-empty string/i);

    assert.match(responses.find((r) => r.id === 7).result.content[0].text, /oldSlug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 8).result.content[0].text, /intoSlug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 9).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 11).result.content[0].text, /capabilities items must be non-empty strings/i);
    assert.match(responses.find((r) => r.id === 12).result.content[0].text, /elements items must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 13).result.content[0].text, /confirm must be a boolean/i);
    assert.match(responses.find((r) => r.id === 14).result.content[0].text, /overwrite must be a boolean/i);
    assert.match(responses.find((r) => r.id === 15).result.content[0].text, /confirm must be a boolean/i);
    assert.match(responses.find((r) => r.id === 16).result.content[0].text, /confirm must be a boolean/i);
    assert.match(responses.find((r) => r.id === 17).result.content[0].text, /force must be a boolean/i);
    assert.match(responses.find((r) => r.id === 18).result.content[0].text, /expected_mtime must be a non-negative finite number/i);
    assert.match(responses.find((r) => r.id === 19).result.content[0].text, /expected_mtime must be a non-negative finite number/i);
    assert.match(responses.find((r) => r.id === 20).result.content[0].text, /expected_mtime must be a non-negative finite number/i);
    assert.match(responses.find((r) => r.id === 21).result.content[0].text, /expected_mtime must be a non-negative finite number/i);
    assert.match(responses.find((r) => r.id === 22).result.content[0].text, /expected_mtime must be a non-negative finite number/i);
    const relationBatch = getCallParsed(responses, 23);
    assert.equal(relationBatch.relations[0].ok, false);
    assert.match(relationBatch.relations[0].error, /expected_mtime must be a non-negative finite number/i);

    const list = getCallParsed(responses, 10);
    const slugs = list.nodes.map((node) => node.slug);
    assert.ok(slugs.includes("ok"));
    assert.ok(!slugs.includes("   "));
    assert.ok(!slugs.includes(" padded"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// add_relations batch writer, landing analyze_repo_structure (suggestedRelations)
// and infer_imports (moduleEdges) output in one call. Result rows preserve input
// order, frontmatter relation arrays get a canonical sort, the operation is
// idempotent (a repeated edge returns alreadyExists), and a missing slug fails at row level.
await test("add_relations — 배치 write, row 순서 보존 + canonical sort + partial", async () => {
  const root = makeVault([
    { slug: "p", content: "---\nkind: project\ntitle: P\n---\n" },
    { slug: "c1", content: "---\nkind: capability\ntitle: C1\ndomain: x\n---\n" },
    { slug: "c2", content: "---\nkind: capability\ntitle: C2\ndomain: x\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", {
        relations: [
          { from: "p", to: "c2", type: "contains", why: "P contains the C2 capability." },
          // Accumulating on the same `from` — readDoc re-reads each time, so nothing is lost
          { from: "p", to: "c1", type: "contains" },
          // Idempotent — the same edge twice
          { from: "p", to: "c1", type: "contains" },
          // missing target → ok:false
          { from: "p", to: "missing", type: "contains" },
          // unknown type → ok:false
          { from: "p", to: "c1", type: "weird-type" },
          // close type typo → ok:false with nearest-value hint
          { from: "p", to: "c1", type: "depend_on" },
        ],
      }),
      callTool(3, "get_concept", { slug: "p" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.relations.length, 6, "relations row 수 = 입력 길이");
    // Order preserved
    assert.equal(result.relations[0].ok, true);
    assert.equal(result.relations[0].to, "c2");
    assert.equal(result.relations[0].key, "contains");
    assert.equal(result.relations[0].changed, true);
    assert.equal(result.relations[1].ok, true);
    assert.equal(result.relations[1].to, "c1");
    // Idempotent — the second is alreadyExists
    assert.equal(result.relations[2].ok, true);
    assert.equal(result.relations[2].alreadyExists, true);
    // missing target
    assert.equal(result.relations[3].ok, false);
    assert.match(result.relations[3].error, /does not exist|missing/i);
    assert.equal(result.relations[3].errorCode, "not_found");
    assert.equal(result.relations[3].missingSlug, "missing");
    assert.equal(result.relations[3].createTool, "add_concept");
    assert.deepEqual(result.relations[3].recoveryTools, ["list_concepts", "find_evidence"]);
    // unknown type
    assert.equal(result.relations[4].ok, false);
    assert.match(result.relations[4].error, /type must be one of/i);
    assert.match(result.relations[4].error, /Received: "weird-type"/i);
    assert.equal(result.relations[4].errorCode, "invalid_arguments");
    assert.equal(result.relations[4].valueName, "type");
    assert.equal(result.relations[4].receivedValue, "weird-type");
    // close type typo
    assert.equal(result.relations[5].ok, false);
    assert.match(result.relations[5].error, /type must be one of/i);
    assert.match(result.relations[5].error, /Received: "depend_on"/i);
    assert.match(result.relations[5].error, /Did you mean "depends_on"\?/i);
    assert.equal(result.relations[5].suggestion, "depends_on");
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "batch relation postWriteMaintenance");
    assert.equal(result.relations[0].postWriteMaintenance, undefined);
    // p.contains lands deduplicated and sorted by edge set
    const p = getCallParsed(responses, 3);
    assert.deepEqual(p.frontmatter.contains, ["c1", "c2"]);
    assert.equal(p.frontmatter.relation_notes.c2, "P contains the C2 capability.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// add_relations empty-array and cap gates.
await test("add_relations — 빈 relations[] → 빈 results, 51개 → error", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
  ]);
  try {
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", { relations: [] }),
    ]);
    const empty = getCallParsed(r1, 2);
    assert.deepEqual(empty.relations, []);

    const tooMany = Array.from({ length: 51 }, () => ({
      from: "a",
      to: "a",
      type: "relates",
    }));
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", { relations: tooMany }),
    ]);
    const text = JSON.stringify(r2.find((r) => r.id === 2));
    assert.match(text, /Too many relations|50/i);
    assert.equal(getCallStructured(r2, 2)?.errorCode, "invalid_arguments");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relations — object 가 아닌 row 는 row-level error 로 격리", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", {
        relations: [
          { from: "a", to: "b", type: "relates" },
          null,
          "not-object",
          [],
        ],
      }),
      callTool(3, "get_concept", { slug: "a" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.relations[0].ok, true, "valid row still lands");
    assert.equal(result.relations[1].ok, false);
    assert.match(result.relations[1].error, /relations\[1\] must be an object/i);
    assert.equal(result.relations[2].ok, false);
    assert.match(result.relations[2].error, /relations\[2\] must be an object/i);
    assert.equal(result.relations[3].ok, false);
    assert.match(result.relations[3].error, /relations\[3\] must be an object/i);
    const concept = getCallParsed(responses, 3);
    assert.deepEqual(concept.frontmatter.relates, ["b"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relations — blank/padded scalar row 는 row-level error 로 격리", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", {
        relations: [
          { from: "a", to: "b", type: "relates" },
          { from: " a", to: "b", type: "relates" },
          { from: "a", to: " b", type: "relates" },
          { from: "a", to: "b", type: " relates" },
          { from: "", to: "b", type: "relates" },
        ],
      }),
      callTool(3, "get_concept", { slug: "a" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.relations[0].ok, true, "valid row still lands");
    assert.equal(result.relations[1].ok, false);
    assert.match(result.relations[1].error, /from must not have leading or trailing whitespace/i);
    assert.equal(result.relations[2].ok, false);
    assert.match(result.relations[2].error, /to must not have leading or trailing whitespace/i);
    assert.equal(result.relations[3].ok, false);
    assert.match(result.relations[3].error, /type must not have leading or trailing whitespace/i);
    assert.equal(result.relations[4].ok, false);
    assert.match(result.relations[4].error, /from must be a non-empty string/i);
    const concept = getCallParsed(responses, 3);
    assert.deepEqual(concept.frontmatter.relates, ["b"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relations — unknown row field 는 row-level error 로 격리", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relations", {
        relations: [
          { from: "a", to: "b", type: "relates" },
          { from: "a", to: "b", type: "contains", relation: "relates" },
          { from: "a", to: "b", type: "contains", relation: "relates", frm: "a" },
        ],
      }),
      callTool(3, "get_concept", { slug: "a" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.relations[0].ok, true, "valid row still lands");
    assert.equal(result.relations[1].ok, false);
    assert.match(result.relations[1].error, /Unknown field "relation" in relations\[1\]/i);
    assert.match(result.relations[1].error, /Did you mean "type"\?/i);
    assert.match(result.relations[1].error, /Received fields: from, relation, to, type/i);
    assert.equal(result.relations[1].errorCode, "invalid_arguments");
    assert.equal(result.relations[1].rowName, "relations[1]");
    assert.equal(result.relations[1].receivedField, "relation");
    assert.equal(result.relations[1].suggestion, "type");
    assert.deepEqual(result.relations[1].unknownFields, [{ name: "relation", suggestion: "type" }]);
    assert.equal(result.relations[2].ok, false);
    assert.match(result.relations[2].error, /Unknown fields in relations\[2\]/i);
    assert.match(result.relations[2].error, /"relation" \(did you mean "type"\?\)/i);
    assert.match(result.relations[2].error, /"frm" \(did you mean "from"\?\)/i);
    assert.match(result.relations[2].error, /Received fields: frm, from, relation, to, type/i);
    assert.deepEqual(result.relations[2].unknownFields, [
      { name: "relation", suggestion: "type" },
      { name: "frm", suggestion: "from" },
    ]);
    const concept = getCallParsed(responses, 3);
    assert.deepEqual(concept.frontmatter.relates, ["b"]);
    assert.equal(concept.frontmatter.contains, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// validate_vault — the whole vault's health in one agent call.
await test("validate_vault — clean vault: scanned/problems[]/summary 시그너처", async () => {
  const root = makeVault([
    { slug: "p", content: "---\nkind: project\ntitle: P\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "validate_vault", {}),
    ]);
    const r = getCallParsed(responses, 2);
    assert.equal(typeof r.scanned, "number");
    assert.deepEqual(r.problems, []);
    assert.equal(r.summary.errorFiles, 0);
    assert.equal(r.summary.warningFiles, 0);
    assert.deepEqual(r.summary.byCode, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("validate_vault — empty-kind error 와 missing-expected-field warning 모두 surface", async () => {
  const root = makeVault([
    { slug: "broken", content: "---\nkind:\ntitle: X\n---\n" },
    { slug: "capWithoutDomain", content: "---\nkind: capability\ntitle: A\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "validate_vault", {}),
    ]);
    const r = getCallParsed(responses, 2);
    assert.ok(r.problems.length >= 2);
    // byCode aggregation
    assert.ok(r.summary.byCode["empty-kind"]);
    assert.equal(r.summary.byCode["empty-kind"].severity, "error");
    assert.ok(r.summary.byCode["missing-expected-field"]);
    assert.equal(
      r.summary.byCode["missing-expected-field"].severity,
      "warning",
    );
    assert.ok(r.summary.errorFiles >= 1);
    assert.ok(r.summary.warningFiles >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("validate_vault — dangling graph reference warning surface", async () => {
  const root = makeVault([
    {
      slug: "a",
      content: "---\nkind: project\ntitle: A\ndependencies: [missing]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "validate_vault", {}),
    ]);
    const r = getCallParsed(responses, 2);
    const problem = r.problems.find((p) => p.slug === "a");
    assert.ok(problem, "a 문제 row");
    assert.ok(
      problem.issues.some((i) => i.code === "dangling-graph-reference"),
    );
    assert.equal(
      r.summary.byCode["dangling-graph-reference"].severity,
      "warning",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("validate_vault — duplicate uid across primary and merged history is a whole-vault hard error", async () => {
  const claimedUid = "11111111-1111-4111-8111-111111111111";
  const root = makeVault([
    {
      slug: "a",
      content: `---\nuid: ${claimedUid}\nkind: document\ntitle: A\n---\n`,
    },
    {
      slug: "b",
      content: `---\nuid: 22222222-2222-4222-8222-222222222222\nmerged_uids: [${claimedUid}]\nkind: document\ntitle: B\n---\n`,
    },
    {
      slug: "c",
      content: `---\nuid: 33333333-3333-4333-8333-333333333333\nmerged_uids: [${claimedUid}]\nkind: document\ntitle: C\n---\n`,
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "validate_vault"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.summary.errorFiles, 3);
    assert.equal(result.summary.byCode["duplicate-uid"].severity, "error");
    assert.equal(result.summary.byCode["duplicate-uid"].count, 3);
    assert.deepEqual(
      result.problems
        .filter((problem) => problem.issues.some((issue) => issue.code === "duplicate-uid"))
        .map((problem) => problem.slug),
      ["a", "b", "c"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — expected_mtime stale 면 conflict error response", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        slug: "foo",
        frontmatter: { title: "Updated" },
        expected_mtime: 1, // ms=1 — deliberately mismatched
      }),
    ]);
    assert.ok(
      isErrorResponse(responses, 2),
      "stale expected_mtime 은 isError:true 여야",
    );
    const text = responses.find((r) => r.id === 2).result.content[0].text;
    assert.match(text, /conflict|VaultConflictError|modified externally/i);
    assert.equal(getCallStructured(responses, 2)?.ok, false);
    assert.equal(getCallStructured(responses, 2)?.errorCode, "vault_conflict");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — graph 배열 patch 는 canonical set 으로 저장", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: project\ntitle: Foo\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        slug: "foo",
        frontmatter: {
          domains: ["domains/z", "domains/a", "domains/z"],
          dependencies: ["b", "a", "b"],
        },
      }),
      callTool(3, "get_concept", { slug: "foo" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), false);
    const patched = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), patched);
    assert.equal(patched.changed, true);
    assertPostWriteMaintenanceShape(patched.postWriteMaintenance, "patch_concept postWriteMaintenance");
    const result = getCallParsed(responses, 3);
    assert.deepEqual(result.frontmatter.domains, ["domains/a", "domains/z"]);
    assert.deepEqual(result.frontmatter.dependencies, ["a", "b"]);
    assert.deepEqual(result.outgoingEdges, [
      { to: "domains/a", via: "domains" },
      { to: "domains/z", via: "domains" },
      { to: "a", via: "dependencies" },
      { to: "b", via: "dependencies" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("broader fallback — get mtime, patch full array, validate; is_a relation call stays unavailable", async () => {
  const root = makeVault([
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Authentication\n---\n" },
    {
      slug: "capabilities/session-auth",
      content: "---\nkind: capability\ntitle: Session Authentication\ndomain: domains/auth\n---\n",
    },
    {
      slug: "capabilities/token-auth",
      content: "---\nkind: capability\ntitle: Token Authentication\ndomain: domains/auth\n---\n",
    },
  ]);
  try {
    const firstRead = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "capabilities/token-auth" }),
    ]);
    const expectedMtime = getCallParsed(firstRead.responses, 2).mtime;

    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        slug: "capabilities/token-auth",
        expected_mtime: expectedMtime,
        frontmatter: { broader: ["capabilities/session-auth"] },
      }),
      callTool(3, "validate_vault", {}),
      callTool(4, "get_concept", { slug: "capabilities/token-auth" }),
      callTool(5, "add_relation", {
        from: "capabilities/token-auth",
        to: "capabilities/session-auth",
        type: "is_a",
        why: "Both concepts describe authentication abilities.",
      }),
    ]);

    assert.equal(getCallParsed(responses, 2).changed, true);
    assert.deepEqual(getCallParsed(responses, 3).problems, []);
    const patched = getCallParsed(responses, 4);
    assert.deepEqual(patched.frontmatter.broader, ["capabilities/session-auth"]);
    assert.deepEqual(patched.outgoingEdges, [
      { to: "capabilities/session-auth", via: "broader" },
      { to: "domains/auth", via: "domain" },
    ]);
    assert.equal(isErrorResponse(responses, 5), true);
    assert.match(responses.find((response) => response.id === 5).result.content[0].text, /type must be one of/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — graph 배열 patch 는 배열 string item 만 허용", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: project\ntitle: Foo\ndomains: [domains/a]\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        slug: "foo",
        frontmatter: { domains: "domains/b" },
      }),
      callTool(3, "patch_concept", {
        slug: "foo",
        frontmatter: { dependencies: ["ok", 7] },
      }),
      callTool(4, "patch_concept", {
        slug: "foo",
        frontmatter: { relates: [" "] },
      }),
      callTool(5, "patch_concept", {
        slug: "foo",
        frontmatter: { elements: [" element"] },
      }),
      callTool(6, "patch_concept", {
        slug: "foo",
        frontmatter: { domains: null },
      }),
      callTool(7, "get_concept", { slug: "foo" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(
      responses.find((r) => r.id === 2).result.content[0].text,
      /frontmatter\.domains must be an array of strings/i,
    );
    assert.equal(isErrorResponse(responses, 3), true);
    assert.match(
      responses.find((r) => r.id === 3).result.content[0].text,
      /frontmatter\.dependencies must be an array of strings/i,
    );
    assert.equal(isErrorResponse(responses, 4), true);
    assert.match(
      responses.find((r) => r.id === 4).result.content[0].text,
      /frontmatter\.relates items must be non-empty strings/i,
    );
    assert.equal(isErrorResponse(responses, 5), true);
    assert.match(
      responses.find((r) => r.id === 5).result.content[0].text,
      /frontmatter\.elements items must not have leading or trailing whitespace/i,
    );
    assert.equal(isErrorResponse(responses, 6), false, "null still deletes a graph array key");
    const result = getCallParsed(responses, 7);
    assert.equal(Object.hasOwn(result.frontmatter, "domains"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — 핵심 scalar frontmatter 와 body 타입을 검증", async () => {
  const root = makeVault([
    { slug: "foo", content: "---\nkind: capability\ntitle: Foo\ndomain: domains/a\nslug: foo-alias\n---\nbody\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        slug: "foo",
        frontmatter: { kind: "unknown" },
      }),
      callTool(3, "patch_concept", {
        slug: "foo",
        frontmatter: { kind: null },
      }),
      callTool(4, "patch_concept", {
        slug: "foo",
        frontmatter: { domain: ["domains/b"] },
      }),
      callTool(5, "patch_concept", {
        slug: "foo",
        frontmatter: { slug: " alias" },
      }),
      callTool(6, "patch_concept", {
        slug: "foo",
        body: null,
      }),
      callTool(7, "patch_concept", {
        slug: "foo",
        frontmatter: { kind: "document", domain: null, slug: null },
        body: "",
      }),
      callTool(8, "get_concept", { slug: "foo" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(
      responses.find((r) => r.id === 2).result.content[0].text,
      /frontmatter\.kind must be one of/i,
    );
    assert.equal(isErrorResponse(responses, 3), true);
    assert.match(
      responses.find((r) => r.id === 3).result.content[0].text,
      /kind cannot be deleted/i,
    );
    assert.equal(isErrorResponse(responses, 4), true);
    assert.match(
      responses.find((r) => r.id === 4).result.content[0].text,
      /frontmatter\.domain must be a non-empty string/i,
    );
    assert.equal(isErrorResponse(responses, 5), true);
    assert.match(
      responses.find((r) => r.id === 5).result.content[0].text,
      /frontmatter\.slug must not have leading or trailing whitespace/i,
    );
    assert.equal(isErrorResponse(responses, 6), true);
    assert.match(
      responses.find((r) => r.id === 6).result.content[0].text,
      /body must be a string/i,
    );
    assert.equal(isErrorResponse(responses, 7), false, "valid scalar patch still lands");
    const result = getCallParsed(responses, 8);
    assert.equal(result.frontmatter.kind, "document");
    assert.equal(Object.hasOwn(result.frontmatter, "domain"), false);
    assert.equal(Object.hasOwn(result.frontmatter, "slug"), false);
    assert.equal(result.excerpt, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("rename_concept dry-run — preview 만, 디스크 변경 0", async () => {
  const root = makeVault([
    { slug: "old-target", content: "---\nkind: capability\ntitle: Old\n---\n" },
    {
      slug: "ref",
      content:
        "---\nkind: project\ntitle: Ref\ndependencies: [old-target]\nrelation_notes:\n  old-target: Starts the local MCP process\n---\n",
    },
  ]);
  try {
    const beforeOld = readFileSync(join(root, "old-target.md"), "utf-8");
    const beforeRef = readFileSync(join(root, "ref.md"), "utf-8");
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "old-target",
        newSlug: "new-target",
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assertDestructivePreview(result, {
      canConfirm: true,
      wouldChange: true,
      label: "rename_concept preview",
    });
    assert.equal(result.moved, false);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
    assert.equal(Object.hasOwn(result.backlinkUpdates, "plan"), false);
    const noteBefore = result.backlinkUpdates.updates[0].beforeKeys.find(
      (row) => row.key === "relation_notes",
    );
    const noteAfter = result.backlinkUpdates.updates[0].afterKeys.find(
      (row) => row.key === "relation_notes",
    );
    assert.deepEqual(noteBefore?.before, { "old-target": "Starts the local MCP process" });
    assert.deepEqual(noteAfter?.after, { "new-target": "Starts the local MCP process" });
    assert.equal(result.changed, undefined);
    assert.equal(result.postWriteMaintenance, undefined);
    assert.equal(readFileSync(join(root, "old-target.md"), "utf-8"), beforeOld);
    assert.equal(existsSync(join(root, "new-target.md")), false);
    assert.equal(readFileSync(join(root, "ref.md"), "utf-8"), beforeRef);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("rename_concept confirm:true — 파일 이동 + backlink redirect", async () => {
  const root = makeVault([
    { slug: "old-target", content: "---\nkind: capability\ntitle: Old\n---\n" },
    {
      slug: "ref",
      content:
        "---\nkind: project\ntitle: Ref\ndependencies: [old-target]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "old-target",
        newSlug: "new-target",
        confirm: true,
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.ok, true);
    assert.equal(result.previewReady, false);
    assert.equal(result.canConfirm, false);
    assert.equal(result.wouldChange, false);
    assert.deepEqual(result.blockedReasons, []);
    assert.equal(result.moved, true);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
    assert.equal(Object.hasOwn(result.backlinkUpdates, "plan"), false);
    assert.equal(result.backlinkUpdates.updates[0].slug, "ref");
    assert.equal(result.backlinkUpdates.updates[0].title, "Ref");
    assert.equal(result.changed, true);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "rename_concept postWriteMaintenance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("graph destructive writes — missing slug errors include recovery hints", async () => {
  const root = makeVault([
    { slug: "capabilities/mcp-server", content: "---\nkind: capability\ntitle: MCP Server\n---\n" },
    { slug: "into", content: "---\nkind: capability\ntitle: Into\n---\n" },
    { slug: "from", content: "---\nkind: capability\ntitle: From\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "mcp-server",
        newSlug: "capabilities/agent-server",
      }),
      callTool(3, "merge_concepts", {
        fromSlug: "mcp-server",
        intoSlug: "into",
      }),
      callTool(4, "merge_concepts", {
        fromSlug: "from",
        intoSlug: "mcp-server",
      }),
      callTool(5, "delete_concept", {
        slug: "mcp-server",
        confirm: true,
      }),
    ]);

    for (const id of [2, 3, 4, 5]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} should be rejected`);
      const text = responses.find((r) => r.id === id).result.content[0].text;
      assert.match(text, /Use list_concepts\(\) to see all slugs/);
      assert.match(text, /Similar slugs in this vault: "capabilities\/mcp-server"/);
    }
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /Source slug does not exist in vault/);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /fromSlug does not exist in vault/);
    assert.match(responses.find((r) => r.id === 4).result.content[0].text, /intoSlug does not exist in vault/);
    assert.match(responses.find((r) => r.id === 5).result.content[0].text, /Doc not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("merge_concepts confirm:true — fromSlug 삭제 + backlink redirect", async () => {
  const root = makeVault([
    { slug: "from", content: "---\nkind: capability\ntitle: From\n---\n# From\n\nMerge body for captured excerpt." },
    { slug: "into", content: "---\nkind: capability\ntitle: Into\n---\n" },
    {
      slug: "ref",
      content: "---\nkind: project\ndependencies: [from]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "merge_concepts", {
        fromSlug: "from",
        intoSlug: "into",
        confirm: true,
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.ok, true);
    assert.equal(result.previewReady, false);
    assert.equal(result.canConfirm, false);
    assert.equal(result.wouldChange, false);
    assert.deepEqual(result.blockedReasons, []);
    assert.equal(result.deleted, true);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
    assert.equal(Object.hasOwn(result.backlinkUpdates, "plan"), false);
    assert.equal(result.changed, true);
    assert.equal(result.capturedFrom.frontmatter.title, "From");
    assert.equal(result.capturedFrom.body, "# From\n\nMerge body for captured excerpt.");
    assert.equal(result.capturedFrom.bodyExcerpt, "Merge body for captured excerpt.");
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "merge_concepts postWriteMaintenance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("merge_concepts confirm:true — survivor uid is preserved and source identity history is absorbed", async () => {
  const fromUid = "11111111-1111-4111-8111-111111111111";
  const fromHistoricalUid = "44444444-4444-4444-8444-444444444444";
  const intoUid = "22222222-2222-4222-8222-222222222222";
  const intoHistoricalUid = "33333333-3333-4333-8333-333333333333";
  const root = makeVault([
    {
      slug: "from",
      content: `---\nuid: ${fromUid}\nmerged_uids: [${fromHistoricalUid}]\nkind: document\ntitle: From\n---\nFrom body`,
    },
    {
      slug: "into",
      content: `---\nuid: ${intoUid}\nmerged_uids: [${intoHistoricalUid}]\nkind: document\ntitle: Into\n---\nInto body`,
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "merge_concepts", {
        fromSlug: "from",
        intoSlug: "into",
        confirm: true,
      }),
      callTool(3, "get_concept", { slug: "into" }),
    ]);
    const merged = getCallParsed(responses, 2);
    assert.equal(merged.fromUid, fromUid);
    assert.equal(merged.intoUid, intoUid);
    assert.deepEqual(merged.absorbedUids, [fromUid, fromHistoricalUid]);

    const survivor = getCallParsed(responses, 3);
    assert.equal(survivor.uid, intoUid);
    assert.deepEqual(survivor.frontmatter.merged_uids, [
      fromUid,
      intoHistoricalUid,
      fromHistoricalUid,
    ].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("merge_concepts dry-run — preview 만, 디스크 변경 0", async () => {
  const root = makeVault([
    { slug: "from", content: "---\nkind: capability\ntitle: From\n---\n| raw | table |\n| --- | --- |\n\nDry-run source summary." },
    { slug: "into", content: "---\nkind: capability\ntitle: Into\n---\n" },
    {
      slug: "ref",
      content: "---\nkind: project\ntitle: Ref\ndependencies: [from]\n---\n",
    },
  ]);
  try {
    const beforeFrom = readFileSync(join(root, "from.md"), "utf-8");
    const beforeRef = readFileSync(join(root, "ref.md"), "utf-8");
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "merge_concepts", {
        fromSlug: "from",
        intoSlug: "into",
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.ok, false);
    assertDestructivePreview(result, {
      canConfirm: true,
      wouldChange: true,
      label: "merge_concepts preview",
    });
    assert.equal(result.deleted, false);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
    assert.equal(result.backlinkUpdates.updates[0].slug, "ref");
    assert.equal(result.backlinkUpdates.updates[0].title, "Ref");
    assert.equal(result.capturedFrom.frontmatter.title, "From");
    assert.equal(result.capturedFrom.bodyExcerpt, "Dry-run source summary.");
    assert.match(result.message, /confirm:true/);
    assert.equal(result.changed, undefined);
    assert.equal(result.postWriteMaintenance, undefined);
    assert.equal(readFileSync(join(root, "from.md"), "utf-8"), beforeFrom);
    assert.equal(readFileSync(join(root, "ref.md"), "utf-8"), beforeRef);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("merge_concepts — survivor expected_into_mtime 충돌도 쓰기 전에 차단한다", async () => {
  const root = makeVault([
    { slug: "from", content: "---\nkind: capability\ntitle: From\n---\n" },
    { slug: "into", content: "---\nkind: capability\ntitle: Into\n---\n" },
  ]);
  try {
    const beforeFrom = readFileSync(join(root, "from.md"), "utf-8");
    const beforeInto = readFileSync(join(root, "into.md"), "utf-8");
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "merge_concepts", {
        fromSlug: "from",
        intoSlug: "into",
        confirm: true,
        expected_into_mtime: 1,
      }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(responses.find((row) => row.id === 2).result.content[0].text, /conflict|modified externally/i);
    assert.equal(readFileSync(join(root, "from.md"), "utf-8"), beforeFrom);
    assert.equal(readFileSync(join(root, "into.md"), "utf-8"), beforeInto);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("delete_concept confirm:true — 삭제 후 post-write maintenance summary 반환", async () => {
  const root = makeVault([
    { slug: "gone", content: "---\nkind: capability\ntitle: Gone\n---\n- list item\n\nDelete body for captured excerpt." },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "delete_concept", {
        slug: "gone",
        confirm: true,
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, false);
    assert.equal(result.previewReady, false);
    assert.equal(result.canConfirm, false);
    assert.equal(result.wouldChange, false);
    assert.deepEqual(result.blockedReasons, []);
    assert.equal(result.changed, true);
    assert.equal(result.captured.frontmatter.title, "Gone");
    assert.equal(result.captured.body, "- list item\n\nDelete body for captured excerpt.");
    assert.equal(result.captured.bodyExcerpt, "Delete body for captured excerpt.");
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "delete_concept postWriteMaintenance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("delete_concept dry-run — backlink preview 만, 디스크 변경 0", async () => {
  const root = makeVault([
    { slug: "gone", content: "---\nkind: capability\ntitle: Gone\n---\n" },
    { slug: "ref", content: "---\nkind: project\ntitle: Ref\ndependencies: [gone]\n---\n" },
  ]);
  try {
    const beforeGone = readFileSync(join(root, "gone.md"), "utf-8");
    const beforeRef = readFileSync(join(root, "ref.md"), "utf-8");
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "delete_concept", { slug: "gone" }),
      callTool(3, "delete_concept", { slug: "gone", force: true }),
    ]);
    const result = getCallParsed(responses, 2);
    const forcedPreview = getCallParsed(responses, 3);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.ok, false);
    assertDestructivePreview(result, {
      canConfirm: false,
      wouldChange: true,
      blocked: 1,
      label: "delete_concept backlink-blocked preview",
    });
    assert.equal(result.slug, "gone");
    assert.equal(result.backlinks.length, 1);
    assert.match(result.message, /force:true/);
    assertDestructivePreview(forcedPreview, {
      canConfirm: true,
      wouldChange: true,
      label: "delete_concept force preview",
    });
    assert.equal(result.changed, undefined);
    assert.equal(result.postWriteMaintenance, undefined);
    assert.equal(readFileSync(join(root, "gone.md"), "utf-8"), beforeGone);
    assert.equal(readFileSync(join(root, "ref.md"), "utf-8"), beforeRef);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("identity destructive previews — rename/reclassify/delete expose uid and merge exposes both uids", async () => {
  const fromUid = "11111111-1111-4111-8111-111111111111";
  const intoUid = "22222222-2222-4222-8222-222222222222";
  const root = makeVault([
    {
      slug: "from",
      content: `---\nuid: ${fromUid}\nkind: capability\ntitle: From\ndomain: domain\n---\nFrom body`,
    },
    {
      slug: "into",
      content: `---\nuid: ${intoUid}\nkind: capability\ntitle: Into\ndomain: domain\n---\nInto body`,
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", { oldSlug: "from", newSlug: "renamed" }),
      callTool(3, "reclassify_concept", { slug: "from", newKind: "document" }),
      callTool(4, "merge_concepts", { fromSlug: "from", intoSlug: "into" }),
      callTool(5, "delete_concept", { slug: "from" }),
    ]);

    assert.equal(getCallParsed(responses, 2).uid, fromUid);
    assert.equal(getCallParsed(responses, 3).uid, fromUid);
    assert.deepEqual(
      (({ fromUid: actualFromUid, intoUid: actualIntoUid }) => ({
        fromUid: actualFromUid,
        intoUid: actualIntoUid,
      }))(getCallParsed(responses, 4)),
      { fromUid, intoUid },
    );
    assert.equal(getCallParsed(responses, 5).uid, fromUid);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — corrupt doc 있으면 vaultWarnings 카운트 (R11 #23)", async () => {
  const root = makeVault([
    { slug: "ok", content: "---\nkind: capability\ntitle: OK\n---\n" },
    {
      slug: "corrupt",
      content: "---\nkind: project\n# unclosed frontmatter — no closing ---",
    },
    { slug: "weird", content: "---\nkind: bogus-kind\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(result.vaultWarnings, "vaultWarnings 필드 존재");
    assert.ok(
      result.vaultWarnings.errorCount >= 1,
      "unclosed-frontmatter 1+ error",
    );
    assert.ok(
      result.vaultWarnings.warningCount >= 1,
      "unknown-kind 1+ warning",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — dangling graph reference 도 vaultWarnings 에 포함", async () => {
  const root = makeVault([
    {
      slug: "a",
      content: "---\nkind: project\ntitle: A\ndependencies: [missing]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(result.vaultWarnings, "vaultWarnings 필드 존재");
    assert.equal(result.vaultWarnings.errorCount, 0);
    assert.equal(result.vaultWarnings.warningCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — corrupt doc 응답에 warnings 노출 (R11 #23)", async () => {
  const root = makeVault([
    { slug: "weird", content: "---\nkind: bogus\n---\nbody" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "weird" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(Array.isArray(result.warnings), "warnings 필드는 배열");
    assert.ok(
      result.warnings.some((w) => w.code === "unknown-kind"),
      "unknown-kind issue 포함",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — dangling outgoing graph reference 를 warnings 에 포함", async () => {
  const root = makeVault([
    {
      slug: "a",
      content: "---\nkind: project\ntitle: A\ndependencies: [missing]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "a" }),
      callTool(3, "get_concepts", { slugs: ["a"] }),
    ]);
    const single = getCallParsed(responses, 2);
    const batch = getCallParsed(responses, 3);
    assert.ok(
      single.warnings.some((w) => w.code === "dangling-graph-reference"),
    );
    assert.ok(
      batch.concepts[0].warnings.some(
        (w) => w.code === "dangling-graph-reference",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — a new depends_on requires a nonblank rationale before any write", async () => {
  const root = makeVault([
    { slug: "capabilities/a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "capabilities/b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const before = readFileSync(join(root, "capabilities", "a.md"), "utf-8");
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "capabilities/a",
        to: "capabilities/b",
        type: "depends_on",
      }),
      callTool(3, "add_relations", {
        relations: [{
          from: "capabilities/a",
          to: "capabilities/b",
          type: "depends_on",
          why: "   ",
        }],
      }),
    ]);
    assert.match(responses.find((row) => row.id === 2).result.content[0].text, /why.*required.*depends_on/i);
    const batch = getCallParsed(responses, 3);
    assert.equal(batch.relations[0].ok, false);
    assert.match(batch.relations[0].error, /why.*required.*depends_on/i);
    assert.equal(readFileSync(join(root, "capabilities", "a.md"), "utf-8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation approved fixture — why, validate, compile, and impact stay one truthful flow", async () => {
  const root = makeVault([
    { slug: "capabilities/a", content: "---\nkind: capability\ntitle: A\n---\n" },
    { slug: "capabilities/b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  const why = "A cannot provide its approved observable ability without B.";
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "capabilities/a",
        to: "capabilities/b",
        type: "depends_on",
        why,
      }),
      callTool(3, "validate_vault"),
      callTool(4, "compile_ontology"),
      callTool(5, "query_ontology", {
        operation: "impact",
        slug: "capabilities/b",
        depth: 1,
      }),
    ], 3000);

    const write = getCallParsed(responses, 2);
    const validation = getCallParsed(responses, 3);
    const compile = getCallParsed(responses, 4);
    const impact = getCallParsed(responses, 5);
    assert.equal(write.changed, true);
    assert.equal(validation.summary.errorFiles, 0);
    assert.equal(compile.nodeCount, 2);
    assert.equal(compile.edgeCount, 1);
    assert.equal(compile.resolvedEdgeCount, 1);
    assert.deepEqual(impact.nodes.map((row) => row.slug), ["capabilities/a"]);
    assert.deepEqual(impact.qualification, {
      status: "declared_with_rationale",
      basis: "declared_dependencies",
      completeness: "unknown",
      sourceBacked: false,
      declaredEdges: 1,
      declaredWithRationaleEdges: 1,
      reviewRequiredEdges: 0,
      sourceBackedEdges: 0,
    });
    const source = readFileSync(join(root, "capabilities", "a.md"), "utf-8");
    assert.match(source, /dependencies: \[capabilities\/b\]/);
    assert.match(source, /relation_notes:/);
    assert.match(source, /capabilities\/b: A cannot provide its approved observable ability without B\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — missing endpoints include recovery and create hints", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
    { slug: "capabilities/mcp-server", content: "---\nkind: capability\ntitle: MCP Server\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "mcp",
        to: "project",
        type: "relates",
      }),
      callTool(3, "add_relation", {
        from: "project",
        to: "mcp",
        type: "relates",
      }),
      callTool(4, "add_relation", {
        from: "project",
        to: "missing-new-node",
        type: "relates",
      }),
    ]);

    for (const id of [2, 3, 4]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} should be rejected`);
      const text = responses.find((r) => r.id === id).result.content[0].text;
      assert.match(text, /Use list_concepts\(\) to see all slugs/);
      assert.match(text, /find_evidence\(\{title:"[^"]+"\}\)/);
      assert.match(text, /add_concept\(slug, kind, title\)/);
    }
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /Source slug does not exist in vault/);
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /Similar slugs in this vault: "capabilities\/mcp-server"/);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /Target slug does not exist in vault/);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /Similar slugs in this vault: "capabilities\/mcp-server"/);
    assert.match(responses.find((r) => r.id === 4).result.content[0].text, /Target slug does not exist in vault/);

    const missingSource = getCallStructured(responses, 2);
    assert.equal(missingSource.errorCode, "not_found");
    assert.equal(missingSource.missingSubject, "Source slug does not exist in vault");
    assert.equal(missingSource.missingSlug, "mcp");
    assert.deepEqual(missingSource.recoveryTools, ["list_concepts", "find_evidence"]);
    assert.equal(missingSource.createTool, "add_concept");
    assert.deepEqual(missingSource.similarSlugs, ["capabilities/mcp-server"]);

    const missingTarget = getCallStructured(responses, 4);
    assert.equal(missingTarget.errorCode, "not_found");
    assert.equal(missingTarget.missingSubject, "Target slug does not exist in vault");
    assert.equal(missingTarget.missingSlug, "missing-new-node");
    assert.deepEqual(missingTarget.recoveryTools, ["list_concepts", "find_evidence"]);
    assert.equal(missingTarget.createTool, "add_concept");
    assert.deepEqual(missingTarget.similarSlugs, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — 같은 edge 두번 추가 시 alreadyExists:true (idempotent)", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: project\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "a",
        to: "b",
        type: "depends_on",
        why: "A cannot provide its observable ability without B.",
      }),
      callTool(3, "add_relation", { from: "a", to: "b", type: "depends_on" }),
    ]);
    const first = getCallParsed(responses, 2);
    const second = getCallParsed(responses, 3);
    assert.deepEqual(getCallStructured(responses, 2), first);
    assert.deepEqual(getCallStructured(responses, 3), second);
    assert.equal(first.ok, true);
    assert.equal(first.alreadyExists, undefined);
    assert.equal(first.changed, true);
    assertPostWriteMaintenanceShape(first.postWriteMaintenance, "single relation postWriteMaintenance");
    assert.equal(second.ok, true);
    assert.equal(second.alreadyExists, true);
    assert.equal(second.changed, false);
    assert.equal(second.postWriteMaintenance, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — 기존 relation 배열도 중복 제거 + 정렬", async () => {
  const root = makeVault([
    {
      slug: "a",
      content: "---\nkind: project\ntitle: A\ndependencies: [z, b]\n---\n",
    },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
    { slug: "m", content: "---\nkind: capability\ntitle: M\n---\n" },
    { slug: "z", content: "---\nkind: capability\ntitle: Z\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "a",
        to: "m",
        type: "depends_on",
        why: "A requires M to preserve its observable project behavior.",
      }),
      callTool(3, "get_concept", { slug: "a" }),
    ]);
    const first = getCallParsed(responses, 2);
    const a = getCallParsed(responses, 3);
    assert.equal(first.ok, true);
    assert.deepEqual(a.frontmatter.dependencies, ["b", "m", "z"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — graph containment 배열 키도 직접 write", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Auth\n---\n" },
    { slug: "domains/billing", content: "---\nkind: domain\ntitle: Billing\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "project",
        to: "domains/billing",
        type: "domains",
      }),
      callTool(3, "add_relation", {
        from: "project",
        to: "domains/auth",
        type: "domains",
      }),
      callTool(4, "get_concept", { slug: "project" }),
    ]);
    assert.equal(getCallParsed(responses, 2).ok, true);
    assert.equal(getCallParsed(responses, 3).ok, true);
    const project = getCallParsed(responses, 4);
    assert.deepEqual(project.frontmatter.domains, ["domains/auth", "domains/billing"]);
    assert.deepEqual(project.outgoingEdges, [
      { to: "domains/auth", via: "domains" },
      { to: "domains/billing", via: "domains" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — domain 타입은 inline parent domain 을 설정", async () => {
  const root = makeVault([
    { slug: "capabilities/login", content: "---\nkind: capability\ntitle: Login\n---\n" },
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Auth\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "capabilities/login",
        to: "domains/auth",
        type: "domain",
      }),
      callTool(3, "add_relation", {
        from: "capabilities/login",
        to: "domains/auth",
        type: "domain",
      }),
      callTool(4, "get_concept", { slug: "capabilities/login" }),
    ]);
    assert.equal(getCallParsed(responses, 2).ok, true);
    assert.equal(getCallParsed(responses, 3).alreadyExists, true);
    const login = getCallParsed(responses, 4);
    assert.equal(login.frontmatter.domain, "domains/auth");
    assert.ok(
      login.outgoingEdges.some(
        (edge) => edge.to === "domains/auth" && edge.via === "domain",
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — tail/frontmatter slug alias 를 canonical slug 로 저장", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
    {
      slug: "domains/auth",
      content: "---\nslug: auth-domain\nkind: domain\ntitle: Auth\n---\n",
    },
    { slug: "capabilities/login", content: "---\nkind: capability\ntitle: Login\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "project",
        to: "auth",
        type: "domains",
      }),
      callTool(3, "add_relation", {
        from: "login",
        to: "auth-domain",
        type: "domain",
      }),
      callTool(4, "get_concept", { slug: "project" }),
      callTool(5, "get_concept", { slug: "capabilities/login" }),
    ]);
    const projectEdge = getCallParsed(responses, 2);
    const loginEdge = getCallParsed(responses, 3);
    assert.equal(projectEdge.to, "domains/auth");
    assert.equal(loginEdge.from, "capabilities/login");
    assert.equal(loginEdge.to, "domains/auth");
    const project = getCallParsed(responses, 4);
    const login = getCallParsed(responses, 5);
    assert.deepEqual(project.frontmatter.domains, ["domains/auth"]);
    assert.equal(login.frontmatter.domain, "domains/auth");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("connection_info — active vault/repo roots and resolution sources are explicit", async () => {
  const root = makeVault([]);
  const repoRoot = dirname(root);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "connection_info"),
    ], 1500, { OATLAS_REPO_ROOT: repoRoot });
    const info = getCallParsed(responses, 2);
    assert.equal(info.vaultRoot, root);
    assert.equal(info.repoRoot, repoRoot);
    assert.equal(info.vaultResolution, "OATLAS_VAULT");
    assert.equal(info.repoResolution, "OATLAS_REPO_ROOT");
    assert.equal(info.server.name, "ontology-atlas-mcp");
    assert.equal(info.server.readOnly, false);
    assert.equal(info.server.toolCount, EXPECTED_TOOLS.length);
    assert.ok(info.server.toolNames.includes("git_history"));
    assert.ok(info.server.toolNames.includes("query_ontology"));
    assert.match(info.server.toolsetHash, /^[a-f0-9]{64}$/);
    assert.equal(info.restartRequiredForRootChange, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("connection_info — repository root auto-discovers from a nested Git vault", async () => {
  const root = mkdtempSync(join(tmpdir(), "ontology-atlas-repo-discovery-"));
  const vault = join(root, "docs", "ontology");
  try {
    mkdirSync(vault, { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n");
    writeFileSync(
      join(vault, "feature.md"),
      "---\nslug: feature\nkind: element\ntitle: Feature\npath: src/feature.ts\n---\n",
    );
    execFileSync("git", ["-C", root, "init", "-b", "main"], { stdio: "ignore" });
    const { responses } = await rpc(vault, [
      ...INIT_REQUESTS,
      callTool(2, "connection_info"),
      callTool(3, "validate_vault"),
    ]);
    const info = getCallParsed(responses, 2);
    const validation = getCallParsed(responses, 3);
    assert.equal(info.repoRoot, realpathSync(root));
    assert.equal(info.repoResolution, "git.rev-parse");
    assert.equal(validation.pathDrift.repoRoot, realpathSync(root));
    assert.equal(validation.pathDrift.drifts.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("initialize — read-only inventory matches the actually advertised toolset", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      callTool(3, "connection_info"),
    ], 1500, { OATLAS_READ_ONLY: "1" });
    const listed = responses.find((row) => row.id === 2)?.result?.tools ?? [];
    assertInstructionToolInventoryMatches(
      responses.find((response) => response.id === 1),
      listed,
    );
    const info = getCallParsed(responses, 3);
    assert.equal(info.server.readOnly, true);
    assert.equal(info.server.toolCount, EXPECTED_READ_TOOLS.length);
    assert.deepEqual(info.server.toolNames, listed.map((tool) => tool.name));
    assert.ok(info.server.toolNames.includes("git_history"));
    assert.ok(!info.server.toolNames.includes("git_snapshot"));
    assert.match(info.server.toolsetHash, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("builder_context — persisted Workshop focus, positions, and agent handoff", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\ncanvasPosition:\n  x: 100\n  y: 80\n---\n",
    },
    {
      slug: "capabilities/login",
      content: "---\nkind: capability\ntitle: Login\ndomain: domains/auth\ncanvasPosition:\n  x: 340\n  y: 80\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "builder_context",
        slug: "domains/auth",
        direction: "incoming",
        depth: 1,
      }),
      callTool(3, "query_ontology", {
        operation: "builder_context",
        slug: "domain:auth",
        direction: "incoming",
        depth: 1,
      }),
    ]);
    const context = getCallParsed(responses, 2);
    const roundTrip = getCallParsed(responses, 3);
    assert.equal(context.operation, "builder_context");
    assert.equal(context.focus, "domains/auth");
    assert.equal(context.source, "persisted_vault");
    assert.equal(context.builder.href, "/topology/?p=domain%3Aauth&workbench=edit");
    assert.equal(context.builder.unsavedDraftsIncluded, false);
    assert.equal(roundTrip.focus, context.focus);
    assert.deepEqual(roundTrip.builder, context.builder);
    assert.deepEqual(context.nodes.map((row) => row.canvasPosition), [
      { x: 100, y: 80 },
      { x: 340, y: 80 },
    ]);
    assert.ok(context.agentHandoff.writeTools.includes("patch_concept"));
    assert.match(context.agentHandoff.constraints.join("\n"), /expected_mtime/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology — unresolved compiled slug exposes structured recovery fields", async () => {
  const root = makeVault([
    {
      slug: "capabilities/login",
      content: "---\nkind: capability\ntitle: Login\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "builder_context",
        slug: "capabilities/logn",
      }),
    ]);

    assert.equal(isErrorResponse(responses, 2), true);
    const structured = getCallStructured(responses, 2);
    assert.equal(structured.errorCode, "not_found");
    assert.equal(structured.missingSubject, "slug");
    assert.equal(structured.missingSlug, "capabilities/logn");
    assert.deepEqual(structured.similarSlugs, ["capabilities/login"]);
    assert.deepEqual(structured.recoveryTools, ["list_concepts", "find_evidence"]);
    assert.equal(structured.createTool, "add_concept");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("absorb_document — repo boundary, symlink escape, explicit opt-in, and backup guard", async () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "ontology-atlas-absorb-repo-"));
  const vault = join(repoRoot, "vault");
  const outsideRoot = mkdtempSync(join(tmpdir(), "ontology-atlas-absorb-outside-"));
  mkdirSync(vault);
  const source = [
    "# Agent Guide",
    "",
    "## Security Policy",
    "",
    "Always review destructive changes before applying them.",
    "",
  ].join("\n");
  const insidePath = join(repoRoot, "AGENTS.md");
  const outsidePath = join(outsideRoot, "AGENTS.md");
  const symlinkPath = join(repoRoot, "linked-agents.md");
  writeFileSync(insidePath, source, "utf-8");
  writeFileSync(outsidePath, source, "utf-8");
  symlinkSync(outsidePath, symlinkPath);
  try {
    const first = await rpc(vault, [
      ...INIT_REQUESTS,
      callTool(2, "absorb_document", { filePath: insidePath }),
      callTool(3, "absorb_document", { filePath: outsidePath }),
      callTool(4, "absorb_document", { filePath: outsidePath, confirm: true }),
      callTool(5, "absorb_document", { filePath: symlinkPath }),
    ], 2500, { OATLAS_REPO_ROOT: repoRoot });
    const insidePreview = getCallParsed(first.responses, 2);
    const outsidePreview = getCallParsed(first.responses, 3);
    const symlinkPreview = getCallParsed(first.responses, 5);
    assert.equal(insidePreview.outsideRepo, false);
    assertDestructivePreview(insidePreview, {
      canConfirm: true,
      wouldChange: true,
      label: "inside-repo absorb preview",
    });
    assert.equal(outsidePreview.outsideRepo, true);
    assertDestructivePreview(outsidePreview, {
      canConfirm: false,
      wouldChange: true,
      blocked: 1,
      label: "outside-repo absorb preview",
    });
    assert.match(outsidePreview.blockedReasons[0], /allowOutsideRepo:true/);
    assert.equal(isErrorResponse(first.responses, 4), true);
    assert.match(first.responses.find((row) => row.id === 4).result.content[0].text, /outside repoRoot/);
    assert.equal(symlinkPreview.outsideRepo, true, "inside symlink cannot bypass the canonical repo boundary");
    assert.equal(symlinkPreview.canConfirm, false);
    assert.equal(readFileSync(outsidePath, "utf-8"), source);
    assert.equal(existsSync(`${outsidePath}.pre-absorb.bak`), false);
    assert.deepEqual(readdirSync(vault), [], "blocked confirmation writes no vault nodes");

    const second = await rpc(vault, [
      ...INIT_REQUESTS,
      callTool(2, "absorb_document", { filePath: outsidePath, allowOutsideRepo: true }),
      callTool(3, "absorb_document", {
        filePath: outsidePath,
        allowOutsideRepo: true,
        confirm: true,
      }),
    ], 3000, { OATLAS_REPO_ROOT: repoRoot });
    const optedInPreview = getCallParsed(second.responses, 2);
    const applied = getCallParsed(second.responses, 3);
    assertDestructivePreview(optedInPreview, {
      canConfirm: true,
      wouldChange: true,
      label: "outside-repo opted-in absorb preview",
    });
    assert.equal(applied.ok, true);
    assert.equal(applied.outsideRepo, true);
    assert.equal(applied.previewReady, false);
    assert.equal(applied.canConfirm, false);
    assert.equal(applied.wouldChange, false);
    assert.deepEqual(applied.blockedReasons, []);
    assert.equal(existsSync(`${outsidePath}.pre-absorb.bak`), true);
    assert.equal(readFileSync(`${outsidePath}.pre-absorb.bak`, "utf-8"), source);
    assert.notEqual(readFileSync(outsidePath, "utf-8"), source);

    const third = await rpc(vault, [
      ...INIT_REQUESTS,
      callTool(2, "absorb_document", { filePath: outsidePath, allowOutsideRepo: true }),
    ], 2000, { OATLAS_REPO_ROOT: repoRoot });
    const backupBlocked = getCallParsed(third.responses, 2);
    assertDestructivePreview(backupBlocked, {
      canConfirm: false,
      wouldChange: true,
      blocked: 1,
      label: "existing-backup absorb preview",
    });
    assert.match(backupBlocked.blockedReasons[0], /backup already exists/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

await test("absorb_document — 실패한 confirm 은 볼트도 원문도 바꾸지 않는다 (all-or-nothing)", async () => {
  // Caught in the 2026-09-01 review: the confirm path wrote sections in a bare
  // loop, so a mid-loop failure left a half-absorbed vault and the retry minted
  // -2-suffixed duplicates. The write must be one unit like rename/merge.
  if (process.platform === "win32") return; // chmod-based fault injection
  const repoRoot = mkdtempSync(join(tmpdir(), "ontology-atlas-absorb-atomic-"));
  const vault = join(repoRoot, "vault");
  mkdirSync(vault);
  const source = [
    "# Agent Guide",
    "",
    "## Security Policy",
    "",
    "Always review destructive changes before applying them.",
    "",
    "## Review Policy",
    "",
    "Never merge without a second review of the diff.",
    "",
  ].join("\n");
  const sourcePath = join(repoRoot, "AGENTS.md");
  writeFileSync(sourcePath, source, "utf-8");
  chmodSync(vault, 0o555); // every section write fails — the strictest partial-failure shape
  try {
    const { responses } = await rpc(vault, [
      ...INIT_REQUESTS,
      callTool(2, "absorb_document", { filePath: sourcePath, confirm: true }),
    ], 2500, { OATLAS_REPO_ROOT: repoRoot });
    assert.equal(isErrorResponse(responses, 2), true, "confirm on a read-only vault must fail");
    const text = responses.find((row) => row.id === 2).result.content[0].text;
    assert.match(text, /rolled back|unchanged/i, `실패가 원상복구를 말하지 않는다: ${text}`);
    chmodSync(vault, 0o755);
    assert.deepEqual(readdirSync(vault), [], "실패한 confirm 이 노드를 남겼다");
    assert.equal(readFileSync(sourcePath, "utf-8"), source, "실패한 confirm 이 원문을 건드렸다");
    assert.equal(existsSync(`${sourcePath}.pre-absorb.bak`), false, "실패한 confirm 이 백업을 남겼다");
  } finally {
    chmodSync(vault, 0o755);
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("git_status/git_snapshot — validated dry-run and vault-only local commit", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
  ]);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Atlas Integration");
    git("config", "user.email", "atlas@example.test");
    writeFileSync(join(root, "outside.txt"), "outside v1\n");
    git("add", ".");
    git("commit", "-m", "initial");
    const expectedHead = git("rev-parse", "HEAD");
    const projectPath = join(root, "project.md");
    writeFileSync(
      projectPath,
      readFileSync(projectPath, "utf-8").replace("title: Project", "title: Updated Project"),
    );

    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "git_status"),
      callTool(3, "git_history", { limit: 5 }),
      callTool(4, "git_snapshot"),
      callTool(5, "git_snapshot", {
        confirm: true,
        expectedHead,
        message: "docs(ontology): snapshot integration vault",
      }),
      callTool(6, "git_status"),
    ], 3000, { OATLAS_REPO_ROOT: root });
    const status = getCallParsed(responses, 2);
    const history = getCallParsed(responses, 3);
    const preview = getCallParsed(responses, 4);
    const committed = getCallParsed(responses, 5);
    const clean = getCallParsed(responses, 6);
    assert.equal(status.counts.total, 1);
    assert.equal(history.operation, "git_history");
    assert.deepEqual(history.commits.map((row) => row.subject), ["initial"]);
    assert.equal(history.limited, false);
    assert.equal(history.hasMore, false);
    assert.equal(history.shallow, false);
    assert.equal(history.historyComplete, true);
    assert.equal(preview.dryRun, true);
    assert.equal(preview.previewReady, true);
    assert.equal(preview.canConfirm, true);
    assert.equal(preview.wouldChange, true);
    assert.deepEqual(preview.blockedReasons, []);
    assert.equal(preview.expectedHead, expectedHead);
    assert.equal(preview.validation.errorFiles, 0);
    assert.equal(preview.pushSupported, false);
    assert.equal(committed.committed, true);
    assert.equal(committed.previewReady, false);
    assert.equal(committed.canConfirm, false);
    assert.equal(committed.wouldChange, false);
    assert.deepEqual(committed.blockedReasons, []);
    assert.notEqual(committed.commitHash, expectedHead);
    assert.equal(clean.counts.total, 0);
    assert.equal(git("show", "--pretty=", "--name-only", "HEAD"), "project.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("git_snapshot — validation errors remain previewable but block confirmation", async () => {
  const root = makeVault([
    { slug: "broken", content: "---\nkind: project\ntitle: Broken\n" },
  ]);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Atlas Integration");
    git("config", "user.email", "atlas@example.test");
    git("add", ".");
    git("commit", "-m", "initial");
    writeFileSync(join(root, "broken.md"), "---\nkind: project\ntitle: Still Broken\n", "utf-8");

    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "git_snapshot"),
    ], 2500, { OATLAS_REPO_ROOT: root });
    const preview = getCallParsed(responses, 2);
    assert.equal(preview.previewReady, true);
    assert.equal(preview.wouldChange, true);
    assert.equal(preview.canConfirm, false);
    assert.ok(preview.validation.errorFiles > 0);
    assert.match(preview.blockedReasons.join("\n"), /validate_vault reports .* error/i);
    assert.equal(preview.risk.level, "high");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("remove_relation — dry-run then confirmed removal also removes rationale", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\ncontains: [domains/auth]\nrelation_notes: { domains/auth: Owns auth }\n---\n" },
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Auth\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "project", to: "domains/auth", type: "contains" }),
      callTool(3, "remove_relation", { from: "project", to: "domains/auth", type: "contains", confirm: true }),
      callTool(4, "remove_relation", { from: "project", to: "domains/auth", type: "contains" }),
      callTool(5, "get_concept", { slug: "project" }),
    ]);
    assertDestructivePreview(getCallParsed(responses, 2), {
      canConfirm: true,
      wouldChange: true,
      label: "remove_relation preview",
    });
    assert.equal(getCallParsed(responses, 2).changed, false);
    assert.equal(getCallParsed(responses, 3).changed, true);
    assertDestructivePreview(getCallParsed(responses, 4), {
      canConfirm: false,
      wouldChange: false,
      blocked: 1,
      label: "remove_relation no-op preview",
    });
    const project = getCallParsed(responses, 5);
    assert.deepEqual(project.frontmatter.contains, []);
    assert.equal(project.frontmatter.relation_notes, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("replace_relation — atomically replaces target/type and rationale", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\ncontains: [domains/auth]\nrelation_notes: { domains/auth: Old reason }\n---\n" },
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Auth\n---\n" },
    { slug: "domains/identity", content: "---\nkind: domain\ntitle: Identity\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "replace_relation", {
        from: "project", oldTo: "domains/auth", oldType: "contains",
        newTo: "domains/identity", newType: "domains", why: "Canonical ownership",
      }),
      callTool(3, "replace_relation", {
        from: "project", oldTo: "domains/auth", oldType: "contains",
        newTo: "domains/identity", newType: "domains", why: "Canonical ownership", confirm: true,
      }),
      callTool(4, "get_concept", { slug: "project" }),
    ]);
    assertDestructivePreview(getCallParsed(responses, 2), {
      canConfirm: true,
      wouldChange: true,
      label: "replace_relation preview",
    });
    assert.equal(getCallParsed(responses, 3).changed, true);
    const project = getCallParsed(responses, 4);
    assert.deepEqual(project.frontmatter.contains, []);
    assert.deepEqual(project.frontmatter.domains, ["domains/identity"]);
    assert.equal(project.frontmatter.relation_notes["domains/identity"], "Canonical ownership");
    assert.equal(project.frontmatter.relation_notes["domains/auth"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("replace_relation — converting to depends_on demands a why when none can be inherited", async () => {
  // add_relation hard-requires a nonblank why for every new depends_on edge;
  // replace_relation used to bypass that contract when converting an edge that
  // carried no prior relation note (bug sweep 2026-09-01).
  const root = makeVault([
    { slug: "capabilities/a", content: "---\nkind: capability\ntitle: A\nrelates: [capabilities/b]\n---\n" },
    { slug: "capabilities/b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "replace_relation", {
        from: "capabilities/a", oldTo: "capabilities/b", oldType: "relates",
        newTo: "capabilities/b", newType: "depends_on", confirm: true,
      }),
      callTool(3, "replace_relation", {
        from: "capabilities/a", oldTo: "capabilities/b", oldType: "relates",
        newTo: "capabilities/b", newType: "depends_on", why: "Uses b's session store", confirm: true,
      }),
      callTool(4, "get_concept", { slug: "capabilities/a" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(getCallText(responses, 2), /why is required/i);
    assert.equal(isErrorResponse(responses, 3), false);
    const a = getCallParsed(responses, 4);
    assert.deepEqual(a.frontmatter.dependencies, ["capabilities/b"]);
    assert.equal(a.frontmatter.relation_notes["capabilities/b"], "Uses b's session store");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("relation writes — canonicalize stored tail aliases without duplicate or false missing errors", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\ncapabilities: [cap-a]\nrelation_notes: { cap-a: Alias reason }\n---\n",
    },
    { slug: "capabilities/cap-a", content: "---\nkind: capability\ntitle: Capability A\ndomain: domains/auth\n---\n" },
    { slug: "capabilities/cap-b", content: "---\nkind: capability\ntitle: Capability B\ndomain: domains/auth\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", {
        from: "domains/auth", to: "capabilities/cap-a", type: "capabilities",
      }),
      callTool(3, "replace_relation", {
        from: "domains/auth", oldTo: "cap-a", oldType: "capabilities",
        newTo: "cap-b", newType: "capabilities",
      }),
      callTool(4, "replace_relation", {
        from: "domains/auth", oldTo: "cap-a", oldType: "capabilities",
        newTo: "cap-b", newType: "capabilities", confirm: true,
      }),
      callTool(5, "get_concept", { slug: "domains/auth" }),
    ]);
    const addExisting = getCallParsed(responses, 2);
    assert.equal(addExisting.alreadyExists, true);
    assert.equal(addExisting.changed, false);
    assertDestructivePreview(getCallParsed(responses, 3), {
      canConfirm: true,
      wouldChange: true,
      label: "replace_relation tail-alias preview",
    });
    assert.equal(getCallParsed(responses, 4).changed, true);
    const domain = getCallParsed(responses, 5);
    assert.deepEqual(domain.frontmatter.capabilities, ["capabilities/cap-b"]);
    assert.equal(domain.frontmatter.relation_notes["capabilities/cap-b"], "Alias reason");
    assert.equal(domain.frontmatter.relation_notes["cap-a"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("remove_relation — resolves stored frontmatter-slug aliases and their rationale keys", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\ncapabilities: [legacy-cap]\nrelation_notes: { legacy-cap: Legacy reason }\n---\n",
    },
    {
      slug: "capabilities/canonical-cap",
      content: "---\nslug: legacy-cap\nkind: capability\ntitle: Canonical Capability\ndomain: domains/auth\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", {
        from: "domains/auth", to: "capabilities/canonical-cap", type: "capabilities",
      }),
      callTool(3, "remove_relation", {
        from: "domains/auth", to: "legacy-cap", type: "capabilities", confirm: true,
      }),
      callTool(4, "get_concept", { slug: "domains/auth" }),
    ]);
    assertDestructivePreview(getCallParsed(responses, 2), {
      canConfirm: true,
      wouldChange: true,
      label: "remove_relation frontmatter-alias preview",
    });
    assert.equal(getCallParsed(responses, 2).removedRationale, "Legacy reason");
    assert.equal(getCallParsed(responses, 3).changed, true);
    const domain = getCallParsed(responses, 4);
    assert.deepEqual(domain.frontmatter.capabilities, []);
    assert.equal(domain.frontmatter.relation_notes, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * ⚠️ Until 2026-08-01 this case used a **path-shaped slug**
 * (`elements/src/entities/claim`), and it had been failing ever since #806 started
 * rejecting that form at the write gate. Nobody saw it because this file **was not
 * wired into any workflow** (`checks.yml` dropped it over a 162s runtime, noting it
 * was *"a separate step's job"* — that step was never created). The slug is flat now.
 */
await test("reclassify_concept — kind/slug/domain/body and backlinks move together", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\ncontains: [capabilities/claim]\n---\n" },
    { slug: "domains/review", content: "---\nkind: domain\ntitle: Review\n---\n" },
    {
      slug: "capabilities/claim",
      content: `---\nslug: capabilities/claim\nkind: capability\ntitle: Claim\n---\n\n${defaultBody("capability", "Claim")}\n`,
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "reclassify_concept", {
        slug: "capabilities/claim", newSlug: "elements/claim-entity",
        newKind: "element", domain: "domains/review",
      }),
      callTool(3, "reclassify_concept", {
        slug: "capabilities/claim", newSlug: "elements/claim-entity",
        newKind: "element", domain: "domains/review", confirm: true,
      }),
      callTool(4, "get_concept", { slug: "elements/claim-entity" }),
      callTool(5, "get_concept", { slug: "project" }),
    ]);
    const preview = getCallParsed(responses, 2);
    assertDestructivePreview(preview, {
      canConfirm: true,
      wouldChange: true,
      label: "reclassify_concept preview",
    });
    assert.equal(Object.hasOwn(preview.backlinkUpdates, "plan"), false);
    const reclassified = getCallParsed(responses, 3);
    assert.equal(reclassified.changed, true);
    assert.equal(Object.hasOwn(reclassified.backlinkUpdates, "plan"), false);
    const claim = getCallParsed(responses, 4);
    assert.equal(claim.frontmatter.kind, "element");
    assert.equal(claim.frontmatter.domain, "domains/review");
    assert.match(claim.excerpt, /distinct implementation role/i);
    assert.deepEqual(getCallParsed(responses, 5).frontmatter.contains, ["elements/claim-entity"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// 2026-08-01 — an agent handed only the vault ended its answer with "there may be
// more in the body but I could not confirm". The construction rules require the
// evidence to be written in the body, and the read tool returned the first
// paragraph without even saying it was cut. The contract this test protects is two
// lines: give the whole thing when asked, and say so when you did not.
await test("body delivery — 전체 본문을 받을 수 있고 잘림은 조용하지 않다", async () => {
  const ruledBody = [
    "## 정의",
    "",
    "워크스페이스 안에서 앱을 만드는 능력.",
    "",
    "## 근거",
    "",
    "- `app/src/editor/index.ts`",
    "",
    "## 확신도",
    "",
    "높음 — 경로를 직접 열어 확인했다.",
  ].join("\n");
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
    {
      slug: "capabilities/app-authoring",
      content: `---\nkind: capability\ntitle: App Authoring\ndomain: domains/app\nelements: [elements/editor]\n---\n${ruledBody}\n`,
    },
    {
      slug: "elements/editor",
      content: "---\nkind: element\ntitle: Editor\ndomain: domains/app\n---\n한 단락짜리 본문.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "capabilities/app-authoring" }),
      callTool(3, "get_concept", { slug: "capabilities/app-authoring", body: "full" }),
      callTool(4, "get_concept", { slug: "elements/editor" }),
      callTool(5, "get_concepts", { slugs: ["capabilities/app-authoring"], body: "full" }),
      callTool(6, "find_evidence", { title: "App Authoring" }),
      callTool(7, "list_concepts", { summary: true }),
      callTool(8, "get_concept", { slug: "elements/editor", body: "outline" }),
    ]);

    // ① The default stays an excerpt — but it reports the cut and the call that fetches the rest.
    const excerptRead = getCallParsed(responses, 2);
    assert.equal(excerptRead.excerpt, "워크스페이스 안에서 앱을 만드는 능력.");
    assert.equal(excerptRead.body, undefined);
    assert.equal(excerptRead.bodyInfo.mode, "excerpt");
    assert.equal(excerptRead.bodyInfo.truncated, true);
    assert.ok(excerptRead.bodyInfo.omittedChars > 0);
    assert.match(excerptRead.bodyInfo.hint, /body: "full"/);

    // ② full carries evidence and confidence too, and does not bill the same text again as an excerpt.
    const fullRead = getCallParsed(responses, 3);
    assert.match(fullRead.body, /## 근거/);
    assert.match(fullRead.body, /app\/src\/editor\/index\.ts/);
    assert.match(fullRead.body, /## 확신도/);
    assert.equal(fullRead.excerpt, undefined);
    assert.equal(fullRead.bodyInfo.mode, "full");
    assert.equal(fullRead.bodyInfo.truncated, false);
    assert.equal(fullRead.bodyInfo.hint, undefined);

    // ③ A fully delivered body gets no false truncation warning.
    const wholeRead = getCallParsed(responses, 4);
    assert.equal(wholeRead.bodyInfo.truncated, false);

    // ④ The batch takes the same parameters.
    const batch = getCallParsed(responses, 5);
    assert.equal(batch.concepts[0].ok, true);
    assert.match(batch.concepts[0].body, /## 확신도/);
    assert.equal(batch.concepts[0].bodyInfo.mode, "full");

    // ⑤ find_evidence reports truncation too, and names the follow-up call.
    const evidence = getCallParsed(responses, 6);
    const hit = evidence.matches.find((m) => m.slug === "capabilities/app-authoring");
    assert.equal(hit.excerptTruncated, true);
    assert.ok(hit.bodyChars > hit.excerpt.length);
    assert.match(evidence.bodyHint, /body: "full"/);

    // ⑥ The same holds for list_concepts summaries.
    const listed = getCallParsed(responses, 7);
    const row = listed.nodes.find((n) => n.slug === "capabilities/app-authoring");
    assert.equal(row.summaryTruncated, true);
    assert.match(listed.summaryHint, /body: "full"/);
    const shortRow = listed.nodes.find((n) => n.slug === "elements/editor");
    assert.equal(shortRow.summaryTruncated, undefined);

    // ⑦ An unknown mode fails while naming the allowed values, rather than quietly falling back to excerpt.
    assert.match(getCallText(responses, 8), /excerpt, full/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief — selected project and compact task handoff stay bounded and consistent", async () => {
  const root = makeVault([
    {
      slug: "project-a",
      content: "---\nkind: project\ntitle: Encoding Library\ndomains: [domains/encoding]\n---\n## Definition\n\nA library that writes encoded values.\n\n## Excludes\n\n- Behavior not established by the bounded vault.\n",
    },
    {
      slug: "domains/encoding",
      content: "---\nkind: domain\ntitle: Encoding\ncapabilities: [capabilities/write-values]\n---\n## Definition\n\nEncoding owns value production.\n",
    },
    {
      slug: "capabilities/write-values",
      content: "---\nkind: capability\ntitle: Write DER Values\ndomain: domains/encoding\nelements: [elements/writer]\npath: src/writer.rs\n---\n## Definition\n\nWrite DER Values is the broad ability to produce encoded values.\n\n## Evidence\n\n- `src/writer.rs`\n\n## Uncertainty\n\nThe bounded vault does not establish optional SET ordering behavior or complete change impact.\n",
    },
    {
      slug: "elements/writer",
      content: "---\nkind: element\ntitle: Writer Implementation\ndomain: domains/encoding\npath: src/writer.rs\n---\n## Definition\n\nWriter Implementation anchors the broad writing capability.\n\n## Uncertainty\n\nThe concrete SET symbol and focused test path are not recorded.\n",
    },
    {
      slug: "project-b",
      content: "---\nkind: project\ntitle: Starter Project\ndomains: [domains/example]\n---\n",
    },
    {
      slug: "domains/example",
      content: "---\nkind: domain\ntitle: Example Domain\ncapabilities: [capabilities/example]\n---\n",
    },
    {
      slug: "capabilities/example",
      content: "---\nkind: capability\ntitle: Example Capability\ndomain: domains/example\nelements: [elements/example]\n---\n",
    },
    {
      slug: "elements/example",
      content: "---\nkind: element\ntitle: Example Element\ndomain: domains/example\n---\n",
    },
  ]);
  try {
    const task = "Fix DER SET ordering when an optional value writes no bytes; preserve rejection for present out-of-order elements.";
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "agent_brief", project: "project-a" }),
      callTool(3, "query_ontology", {
        operation: "agent_brief",
        project: "project-a",
        detail: "compact",
        task,
      }),
      callTool(4, "query_ontology", {
        operation: "agent_brief",
        project: "project-a",
        detail: "compact",
      }),
      callTool(5, "query_ontology", { operation: "agent_brief" }),
      callTool(6, "query_ontology", {
        operation: "agent_brief",
        project: "project-a",
        detail: "compact",
        task: "x".repeat(2001),
      }),
      callTool(7, "query_ontology", {
        operation: "agent_brief",
        project: "project-a",
        task: "Task without compact detail",
      }),
      callTool(8, "query_ontology", {
        operation: "health",
        detail: "compact",
      }),
      callTool(9, "query_ontology", {
        operation: "agent_brief",
        project: "project-a",
        detail: "full",
      }),
    ], 3000);

    const full = getCallParsed(responses, 2);
    assert.deepEqual(getCallParsed(responses, 9), full, "omitted detail and explicit full remain byte-shape compatible");
    assert.equal(full.operation, "agent_brief");
    assert.equal(full.projectSlug, "project-a");
    assert.equal(full.graph.nodes, 4);
    assert.equal(full.graph.projects, 1);
    assert.equal(full.readiness.projects, 1);
    assert.equal(full.readiness.meaningfulNodes, 3);
    assert.ok(full.entrypoints.every((row) => !row.slug.includes("example")));
    assert.doesNotMatch(JSON.stringify(full), /project-b|domains\/example|capabilities\/example|elements\/example/);
    assert.match(
      full.handoffPrompt,
      new RegExp(`Current readiness: ${full.readiness.status} ${full.readiness.score}/100;`),
    );
    assert.match(full.handoffPrompt, new RegExp(`status ${full.status}\\.`));

    const compact = getCallParsed(responses, 3);
    assert.equal(compact.contract, "agentBriefCompact:v2");
    assert.equal(compact.operation, "agent_brief");
    assert.equal(compact.detail, "compact");
    assert.equal(compact.sideEffect, false);
    assert.equal(compact.project.slug, "project-a");
    assert.deepEqual(compact.project.scope, {
      nodes: 4,
      domains: 1,
      capabilities: 1,
      elements: 1,
      internalEdges: 5,
    });
    assert.equal(compact.task.requestLocal, true);
    assert.equal(compact.task.persisted, false);
    assert.equal(compact.task.text, undefined);
    assert.doesNotMatch(JSON.stringify(compact), new RegExp(task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(compact.validation.status, "pass");
    assert.equal(compact.validation.scope, "whole_vault");
    assert.equal(compact.validation.problemFiles, 0);
    assert.equal(compact.focus.capability.slug, "capabilities/write-values");
    assert.equal(compact.focus.capability.claimStatus, "recorded_bounded_claim");
    assert.deepEqual(compact.focus.evidenceAnchors.map((row) => row.slug), ["elements/writer"]);
    assert.deepEqual(compact.focus.evidenceAnchors.map((row) => row.path), ["src/writer.rs"]);
    assert.equal(compact.focus.taskNavigation.status, "blocked");
    assert.equal(compact.focus.taskNavigation.blockedBy, "source_not_current");
    assert.equal(compact.focus.taskNavigation.primary, null);
    assert.equal(compact.focus.impact.completeness, "unknown");
    assert.ok(compact.focus.unknowns.length > 0);
    assert.ok(compact.nextReads.some((row) => row.tool === "get_concepts" && row.arguments.body === "full"));
    assert.deepEqual(compact.fullDetail, {
      tool: "query_ontology",
      arguments: { operation: "agent_brief", project: "project-a", detail: "full" },
      reason: "Read complete diagnostics only when compact is insufficient.",
    });
    assert.deepEqual(compact.safety, {
      humanApprovalRequiredForMeaningWrites: true,
      automaticWrite: false,
      automaticFinalize: false,
      structuralReadinessIsSemanticApproval: false,
    });
    assert.equal(Object.hasOwn(compact, "playbooks"), false);
    assert.equal(Object.hasOwn(compact, "cliFallbackCommands"), false);
    assert.doesNotMatch(JSON.stringify(compact), /project-b|domains\/example|capabilities\/example|elements\/example/);
    assert.ok(
      Buffer.byteLength(JSON.stringify(compact, null, 2), "utf8") <= 12000,
      "compact agent brief must fit the 12 KiB first-contact budget",
    );
    assert.match(compact.handoffPrompt, new RegExp(`Current source: ${compact.currentness.source.status}/${compact.currentness.source.currentness}`));
    assert.match(compact.handoffPrompt, /Task navigation: blocked/);
    assert.match(compact.handoffPrompt, new RegExp(`Meaning: ${compact.currentness.meaning.status}`));
    assert.doesNotMatch(
      loadVaultDocs(root).map((doc) => `${doc.frontmatter?.title ?? ""}\n${doc.body}`).join("\n"),
      new RegExp(task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      "compact task text must not be persisted into vault Markdown",
    );

    for (const [id, pattern] of [
      [4, /detail "compact" requires task/i],
      [5, /project is required when the vault contains multiple project nodes/i],
      [6, /task must contain at most 2000 characters/i],
      [7, /task is only valid.*detail "compact"/i],
      [8, /detail is only valid.*agent_brief/i],
    ]) {
      assert.equal(isErrorResponse(responses, id), true);
      assert.match(getCallStructured(responses, id)?.error ?? "", pattern);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief: persisted claim boundaries outrank task noun overlap", async () => {
  const root = makeVault([
    {
      slug: "project",
      content: "---\nkind: project\ntitle: Policy Runtime\ndomains: [domains/policy]\n---\n## Definition\n\nA runtime that evaluates collateral policy.\n",
    },
    {
      slug: "domains/policy",
      content: "---\nkind: domain\ntitle: Policy\ncapabilities: [capabilities/policy-appraisal, capabilities/expiry-diagnostics]\n---\n## Definition\n\nPolicy owns collateral acceptance and its reporting boundary.\n",
    },
    {
      slug: "capabilities/policy-appraisal",
      content: [
        "---",
        "kind: capability",
        "title: Policy Appraisal",
        "domain: domains/policy",
        "---",
        "## Definition",
        "",
        "Evaluate whether collateral remains acceptable before expiry using a configured safety margin.",
        "",
        "## Includes",
        "",
        "- Reject collateral when remaining validity is below the safety margin.",
        "",
        "## Excludes",
        "",
        "- Post-expiry diagnostic reporting.",
        "",
      ].join("\n"),
    },
    {
      slug: "capabilities/expiry-diagnostics",
      content: [
        "---",
        "kind: capability",
        "title: Expiry Diagnostics",
        "domain: domains/policy",
        "---",
        "## Definition",
        "",
        "Report why expired collateral was rejected and expose validity-margin diagnostics.",
        "",
        "## Includes",
        "",
        "- Post-expiry diagnostic reporting.",
        "",
        "## Excludes",
        "",
        "- Deciding pre-expiry acceptance policy.",
        "",
      ].join("\n"),
    },
  ]);
  const taskCases = [
    [
      "Before expiry, reject collateral whose remaining validity is below a safety margin; do not add post-expiry diagnostics.",
      "capabilities/policy-appraisal",
    ],
    [
      "Implement a pre-expiry validity-margin rejection policy; diagnostics after expiry are out of scope.",
      "capabilities/policy-appraisal",
    ],
    [
      "Decide pre-expiry acceptance from remaining collateral validity and leave diagnostic reporting unchanged.",
      "capabilities/policy-appraisal",
    ],
    [
      "Add post-expiry diagnostics explaining rejected collateral; do not change pre-expiry acceptance policy.",
      "capabilities/expiry-diagnostics",
    ],
  ];
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      ...taskCases.map(([task], index) => callTool(index + 2, "query_ontology", {
        operation: "agent_brief",
        project: "project",
        detail: "compact",
        task,
      })),
    ], 3000);

    assert.equal(taskCases.length, 4, "the MCP boundary-routing gate must exercise real subjects");
    for (const [index, [task, expectedSlug]] of taskCases.entries()) {
      const compact = getCallParsed(responses, index + 2);
      assert.equal(compact.focus.capability?.slug, expectedSlug, task);
      assert.match(compact.focus.selectionPolicy, /Definition, Includes, and Excludes compatibility/);
      assert.equal(compact.task.text, undefined);
      assert.doesNotMatch(JSON.stringify(compact), new RegExp(task.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(compact.safety.automaticWrite, false);
      assert.equal(compact.safety.automaticFinalize, false);
      assert.ok(Buffer.byteLength(JSON.stringify(compact, null, 2), "utf8") <= 12000);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief: current reviewed coordinates become one exact task-navigation batch", async () => {
  const vault = makeVault([
    {
      slug: "project",
      content: "---\nkind: project\ntitle: Encoding Library\ndomains: [domains/encoding]\n---\n## Definition\n\nA library that writes encoded values.\n",
    },
    {
      slug: "domains/encoding",
      content: "---\nkind: domain\ntitle: Encoding\ncapabilities: [capabilities/write-values]\n---\n## Definition\n\nEncoding owns value production.\n",
    },
    {
      slug: "capabilities/write-values",
      content: "---\nkind: capability\ntitle: Write DER Values\ndomain: domains/encoding\nelements: [elements/writer]\n---\n## Definition\n\nWrite DER Values produces encoded output.\n",
    },
    {
      slug: "elements/writer",
      content: `---
kind: element
title: Writer Implementation
domain: domains/encoding
path: src/writer.ts
---
## Definition

Writer Implementation anchors encoded output.

## Evidence

- Primary implementation: \`src/writer.ts#writeDerSet\`
- Supporting implementation: \`src/writer.ts#writeOptionalValue\`
- Focused test: \`tests/writer.test.ts#writes optional DER SET values\`

## Includes

DER SET output ordering and optional values.

## Excludes

DER parsing and unrelated encodings.
`,
    },
  ]);
  const repo = mkdtempSync(join(tmpdir(), "ontology-atlas-task-navigation-repo-"));
  try {
    mkdirSync(join(repo, "src"), { recursive: true });
    mkdirSync(join(repo, "tests"), { recursive: true });
    writeFileSync(
      join(repo, "src/writer.ts"),
      "export function writeDerSet() { return writeOptionalValue(); }\nexport function writeOptionalValue() { return true; }\n",
    );
    writeFileSync(
      join(repo, "tests/writer.test.ts"),
      "test('writes optional DER SET values', () => {});\n",
    );
    const connected = await rpcForRepo(vault, repo, [
      ...INIT_REQUESTS,
      callTool(2, "connect_project_source", {
        projectSlug: "project",
        rootPath: repo,
        confirm: true,
      }),
    ]);
    assert.equal(getCallParsed(connected.responses, 2).projectSource.status, "verified_current");

    const { responses } = await rpcForRepo(vault, repo, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", {
        operation: "agent_brief",
        project: "project",
        detail: "compact",
        task: "Write an optional DER SET value.",
      }),
    ], 3000);
    const compact = getCallParsed(responses, 2);
    const compactText = getCallText(responses, 2);
    assert.equal(compactText, compact.handoffPrompt);
    assert.equal(compact.contract, "agentBriefCompact:v2");
    assert.equal(compact.focus.taskNavigation.status, "ready");
    assert.deepEqual(compact.focus.taskNavigation.primary, {
      path: "src/writer.ts",
      symbol: "writeDerSet",
      role: "primary",
      line: 1,
      endLine: 1,
      sourceStatus: "supported_current",
    });
    assert.equal(compact.focus.taskNavigation.supporting.symbol, "writeOptionalValue");
    assert.equal(compact.focus.taskNavigation.tests[0].symbol, "writes optional DER SET values");
    assert.equal(compact.focus.taskNavigation.readPlan.targetCount, 3);
    assert.match(compact.handoffPrompt, /Primary: "src\/writer\.ts#writeDerSet:1"/);
    assert.match(compact.handoffPrompt, /Focused tests: \["tests\/writer\.test\.ts#writes optional DER SET values:1"\]/);
    assert.match(compact.handoffPrompt, /IN: "DER SET output ordering and optional values\."/);
    assert.match(compact.handoffPrompt, /OUT: "DER parsing and unrelated encodings\."/);
    assert.match(compact.handoffPrompt, /Verify: runner unknown/);
    assert.match(compact.handoffPrompt, /Read: .*stop_on_match/);
    assert.match(compact.handoffPrompt, /Tests: named positive \+ negative regression; exact observable output\./);
    assert.equal(JSON.stringify(compact).includes(repo), false, "private source root must not cross MCP output");
    assert.ok(Buffer.byteLength(JSON.stringify(compact, null, 2), "utf8") <= 12000);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief — read-only known-task wire path stays below 20000 characters", async () => {
  const scratch = mkdtempSync(join(tmpdir(), "ontology-atlas-compact-wire-"));
  const vault = join(scratch, "vault");
  const repo = resolve(__dirname, "../..");
  cpSync(resolve(repo, "docs/ontology"), vault, {
    recursive: true,
    filter: (source) => !source.split(/[\\/]/).includes(".ontology-atlas"),
  });
  try {
    const connected = await rpcForRepo(vault, repo, [
      ...INIT_REQUESTS,
      callTool(2, "connect_project_source", {
        projectSlug: "ontology-atlas",
        rootPath: repo,
        confirm: true,
      }),
    ], 10_000);
    assert.equal(getCallParsed(connected.responses, 2).projectSource.status, "verified_current");

    const { responses } = await rpcForRepo(vault, repo, [
      ...INIT_REQUESTS,
      callTool(2, "connection_info", {}),
      callTool(3, "query_ontology", {
        operation: "agent_brief",
        project: "ontology-atlas",
        detail: "compact",
        task: "Change the task-scoped compact agent brief projection.",
      }),
    ], 10_000, { OATLAS_READ_ONLY: "1" });
    const connectionResponse = responses.find((row) => row.id === 2);
    const compactResponse = responses.find((row) => row.id === 3);
    assert.ok(connectionResponse?.result, "connection_info must return one wire result");
    assert.ok(compactResponse?.result, "compact agent_brief must return one wire result");
    const compact = getCallParsed(responses, 3);
    assert.equal(compact.focus.taskNavigation.status, "ready");
    assert.equal(compact.focus.taskNavigation.currentness, "current");
    assert.equal(compact.focus.verification.runner, "package-script");
    assert.equal(compact.focus.verification.manifest, "mcp/package.json");
    assert.ok(Buffer.byteLength(JSON.stringify(compact, null, 2), "utf8") <= 12000);
    const wireCharacters = JSON.stringify(connectionResponse).length + JSON.stringify(compactResponse).length;
    assert.ok(
      wireCharacters < 20_000,
      `connection_info + compact read-only wire path must stay below 20000 characters; received ${wireCharacters}`,
    );
    assert.equal(JSON.stringify(compactResponse).includes(repo), false, "wire response must not expose the private root");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief — a valid 501-node project keeps full and compact handoffs", async () => {
  const elementSlugs = Array.from({ length: 500 }, (_, index) => `elements/unit-${String(index + 1).padStart(3, "0")}`);
  const root = makeVault([
    {
      slug: "large-project",
      content: `---\nkind: project\ntitle: Large Project\nelements: [${elementSlugs.join(", ")}]\n---\n## Definition\n\nA bounded large project.\n`,
    },
    ...elementSlugs.map((slug, index) => ({
      slug,
      content: `---\nkind: element\ntitle: Unit ${index + 1}\npath: src/unit-${index + 1}.ts\n---\n## Definition\n\nA concrete unit.\n`,
    })),
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "project_scope", project: "large-project", limit: 500 }),
      callTool(3, "query_ontology", { operation: "agent_brief", project: "large-project", detail: "full" }),
      callTool(4, "query_ontology", {
        operation: "agent_brief",
        project: "large-project",
        detail: "compact",
        task: "Inspect an unrelated lunar camera behavior.",
      }),
    ], 10_000);
    const publicScope = getCallParsed(responses, 2);
    assert.equal(publicScope.nodes.total, 501);
    assert.equal(publicScope.nodes.limited, true);
    assert.equal(publicScope.nodes.rows.length, 500);
    const full = getCallParsed(responses, 3);
    assert.equal(full.graph.nodes, 501);
    assert.equal(full.compiledSummary.nodes, 501);
    assert.equal(full.projectSlug, "large-project");
    assert.equal(full.meaningAssessment.status, "invalid");
    const compact = getCallParsed(responses, 4);
    assert.equal(compact.project.scope.nodes, 501);
    assert.equal(compact.focus.status, "not_recorded");
    assert.equal(compact.currentness.meaning.status, "invalid");
    assert.ok(Buffer.byteLength(JSON.stringify(compact, null, 2), "utf8") <= 12000);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const skippedSuffix = skipped > 0 ? `, ${skipped} skipped` : "";
console.log(`\nintegration: ${passed} passed, ${failed} failed${skippedSuffix}`);
if (TEST_NAME_PATTERN && matched === 0) {
  console.error(formatNoTestMatchMessage("MCP", TEST_FILTER));
  process.exit(1);
}
if (failed > 0) process.exit(1);
