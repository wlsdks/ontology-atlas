// Tool-handler integration tests: build a tmp vault, boot the server over stdio
// JSON-RPC (verify.mjs's pattern), call a tool, check the response.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  expectedToolTitle,
} from "../scripts/verify/tools-list/inventory.mjs";
import { IMPORT_EDGE_KIND_VALUES, IMPORT_UNRESOLVED_REASON_VALUES } from "./infer-imports.mjs";
import { VAULT_ISSUE_CODE_VALUES } from "./validate.mjs";
import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from "./ontology-engine.mjs";
import { GRAPH_ARRAY_KEYS } from "./vault/graph/relation-refs.mjs";
import { loadVaultDocs } from "./vault/documents/document-cache.mjs";
import { analysisRecordFileName, serializeAnalysisRecord } from './analysis-history/analysis-record.mts';
import { buildProjectSourceGraphHash } from "./project-source/project-source-graph-hash.mjs";
import { renderProjectCompetencyMarkdown } from "./project-meaning/project-meaning-receipt.mjs";
import { defaultBody } from "./schema.mjs";
import { RETIRED_TOOL_REPLACEMENTS, TOOL_BY_NAME, TOOL_INPUT_CONTRACT_BY_NAME, TOOL_OUTPUT_CONTRACT_BY_NAME } from "./server/registry.mjs";
import { advertisedOutputSchema } from "./server/advertised-output-schema.mjs";
import {
  formatNoTestMatchMessage,
  formatTestFilterSuffix,
  resolveTestNamePattern,
} from "../../scripts/lib/ci/test-name-pattern.mjs";
import { runJsonRpcProcess } from "../../scripts/lib/mcp-test-rpc.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "javascript-server.mjs");
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
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  }
}

function test(name, body) {
  if (TEST_NAME_PATTERN && !TEST_NAME_PATTERN.test(name)) {
    skipped += 1;
    return Promise.resolve();
  }
  matched += 1;
  return body()
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((error) => {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message ?? error}`);
      if (error.stack) console.error(error.stack);
    });
}

console.log(
  TEST_NAME_PATTERN
    ? `integration (${formatTestFilterSuffix(TEST_FILTER)})`
    : "integration",
);

/**
 * A body that answers every meaning check, per kind. validate_vault reads prose,
 * so makeVault fills a blank fixture body with this (as it supplies `uid:`); a
 * fixture that writes its own body keeps it and still gets the findings.
 */
const FINISHED_BODY_BY_KIND = {
  domain:
    "\nOwns a stable responsibility this codebase keeps in one place, whatever moves inside it.\n\n" +
    "## Includes\n\n- The work this area is answerable for\n\n" +
    "## Excludes\n\n- The neighbouring area it is most often confused with\n\n" +
    "## Uncertainty\n\n- Which callers outside the repository depend on it was never established\n",
  capability:
    "\nTurns a reviewed folder of Markdown into a graph a reader can walk without opening code.\n\n" +
    "## Includes\n\n- Reading frontmatter relations from every document\n\n" +
    "## Excludes\n\n- Drawing the result on screen, which a separate surface owns\n\n" +
    "## Uncertainty\n\n- The symlinked-subtree case was never measured\n",
  element:
    "\nHolds the one address every caller resolves through, so a moved surface renames in one place.\n\n" +
    "## Uncertainty\n\n- The fallback for an older build was not read\n",
};

/** The body a fixture left blank, filled in for the kinds that have body duties. */
function withFinishedBody(content) {
  if (!/^---\r?\n/.test(content)) return content;
  const match = /(?:^|\r?\n)kind\s*:\s*([A-Za-z-]+)/m.exec(content);
  const body = FINISHED_BODY_BY_KIND[match?.[1]?.trim() ?? ""];
  if (!body) return content;
  const close = content.search(/\r?\n---\r?\n/);
  if (close === -1) return content;
  /*
   * A body that is only the `# Title` line counts as blank: it repeats `title`.
   */
  const afterClose = content
    .slice(close)
    .replace(/^\r?\n---\r?\n/, "")
    .split("\n")
    .filter((line) => line.trim() !== "" && !/^#\s+/.test(line.trim()))
    .join("\n");
  if (afterClose.trim() !== "") return content;
  // The `# Title` line is kept for fixtures that assert on the excerpt.
  const kept = content.slice(close).replace(/^\r?\n---\r?\n/, "").replace(/\s+$/, "");
  return content.slice(0, close) + "\n---\n" + kept + "\n" + body;
}

function makeVault(seed = []) {
  const root = mkdtempSync(join(tmpdir(), "ontology-atlas-int-"));
  for (const [index, { slug, content }] of seed.entries()) {
    const fullPath = join(root, `${slug}.md`);
    mkdirSync(dirname(fullPath), { recursive: true });
    const seededContent = /^---\r?\n/.test(content) && /(?:^|\r?\n)kind\s*:/m.test(content) && !/(?:^|\r?\n)uid\s*:/m.test(content)
      ? content.replace(
          /^---(\r?\n)/,
          `---$1uid: 00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}$1`,
        )
      : content;
    writeFileSync(fullPath, withFinishedBody(seededContent), "utf-8");
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

/** Only a hang reaches this: stdin closes as soon as every id has answered, so a green run never waits on it. */
const HANG_TIMEOUT_MS = 30_000;

/**
 * Spawns the server on a tmp vault, sends the requests, and collects every
 * response; then stdin closes and the server must exit cleanly.
 */
function rpc(vaultRoot, requests, extraEnv = {}) {
  return runJsonRpcProcess({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...process.env, OATLAS_VAULT: vaultRoot, ...extraEnv },
    requests,
    timeoutMs: HANG_TIMEOUT_MS,
  });
}

function rpcForRepo(vaultRoot, repoRoot, requests, extraEnv = {}) {
  return rpc(vaultRoot, requests, {
    OATLAS_REPO_ROOT: repoRoot,
    ...extraEnv,
  });
}

/** The oldest supported protocol version is tested deliberately, so legacy clients keep connecting. */
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
  const response = responses.find((r) => r.id === id);
  if (!response) throw new Error(`no response for id ${id}`);
  if (response.error) throw new Error(`error response: ${JSON.stringify(response.error)}`);
  const text = response.result?.content?.[0]?.text;
  if (!text) throw new Error(`no text in response id ${id}`);
  return text;
}

function getCallParsed(responses, id) {
  const structured = getCallStructured(responses, id);
  if (structured?.contract === "agentBriefCompact:v3") return structured;
  return JSON.parse(getCallText(responses, id));
}

/** The breadth map and source-only reads arrive as one text block with no structuredContent. */
function getCallTextAlone(responses, id) {
  const text = getCallText(responses, id);
  const { result } = responses.find((r) => r.id === id);
  assert.equal(result.structuredContent, undefined, `response ${id} sends its rows as text alone`);
  assert.equal(result.content.length, 1, `response ${id} is one text block`);
  return text;
}

/** The unit paths a flat breadth map lists, one row each under its `Units:` header. */
function unitPaths(text) {
  const lines = text.split("\n");
  const rows = lines.slice(lines.findIndex((line) => line.startsWith("Units: ")) + 1);
  return rows.slice(0, rows.findIndex((line) => line === "")).map((line) => line.split(" | ")[0]);
}

function getCallStructured(responses, id) {
  const response = responses.find((r) => r.id === id);
  if (!response) throw new Error(`no response for id ${id}`);
  if (response.error) throw new Error(`error response: ${JSON.stringify(response.error)}`);
  return response.result?.structuredContent;
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
  const response = responses.find((r) => r.id === id);
  if (!response) return false;
  return response.result?.isError === true;
}

function assertPostWriteMaintenanceShape(value, label = "postWriteMaintenance") {
  assert.deepEqual(Object.keys(value ?? {}), ["nextAction", "stepsAboutTouched"], `${label} is the next step and a count`);
  assert.ok(Number.isInteger(value.stepsAboutTouched) && value.stepsAboutTouched >= 0, `${label} counts the steps about the touched nodes`);
  if (value.nextAction === null) {
    assert.equal(value.stepsAboutTouched, 0, `${label} has no next step only when no step is left`);
  } else {
    assertCompactMaintenanceActionShape(value.nextAction, `${label} nextAction`);
    assert.ok(value.stepsAboutTouched >= 1, `${label} counts the step it names`);
  }
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
    assert.equal(action.proposedAction.tool, "add_relations", `${label} add_missing_relation uses add_relations`);
    assert.ok(action.nodes?.from?.slug, `${label} add_missing_relation exposes from node`);
    assert.ok(action.nodes?.to?.slug, `${label} add_missing_relation exposes to node`);
    const [relation] = action.proposedAction.args.relations;
    assert.equal(relation.from, action.nodes.from.slug, `${label} add_missing_relation from matches args`);
    assert.equal(relation.to, action.nodes.to.slug, `${label} add_missing_relation to matches args`);
    assert.equal(typeof relation.type, "string", `${label} add_missing_relation exposes relation type`);
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

// Single tools name their batch twins so an agent reading only the list knows
// the one-call alternative exists.
await test("tools/list — a retired tool stays out of the list and answers with its replacement", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nslug: project\nkind: project\ntitle: Project\n---\nBody.\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      callTool(3, "list_kinds"),
      callTool(4, "list_concepts", { limit: 1 }),
    ]);
    const listed = new Set(responses.find((r) => r.id === 2).result.tools.map((tool) => tool.name));
    for (const name of RETIRED_TOOL_REPLACEMENTS.keys()) {
      assert.equal(listed.has(name), false, `${name} is retired and must stay out of tools/list`);
    }
    const retired = responses.find((r) => r.id === 3).result;
    assert.notEqual(retired.isError, true, "a retired tool still answers");
    assert.equal(
      retired.content.at(-1).text,
      `list_kinds is retired from tools/list and will be removed; its replacement is ${RETIRED_TOOL_REPLACEMENTS.get("list_kinds")}.`,
    );
    assert.deepEqual(retired.structuredContent.byKind, getCallStructured(responses, 4).census.byKind);
    assert.equal(responses.find((r) => r.id === 4).result.content.length, 1, "an advertised tool carries no retirement note");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("tools/list — each single-item tool description cross-references its batch twin", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      { jsonrpc: "2.0", id: 99, method: "tools/list", params: {} },
    ]);
    const list = responses.find((r) => r.id === 99);
    assert.ok(list);
    assert.ok(Array.isArray(list.result?.tools));
    for (const tool of list.result.tools) {
      const contract = TOOL_OUTPUT_CONTRACT_BY_NAME.get(tool.name);
      assert.deepEqual(tool.outputSchema, contract ? advertisedOutputSchema(contract) : undefined, `${tool.name} advertises the shallow form of its output contract`);
    }
    // The checks below read the full output contracts behind the advertised schemas.
    const tools = list.result.tools.map((tool) => (tool.outputSchema ? { ...tool, outputSchema: TOOL_OUTPUT_CONTRACT_BY_NAME.get(tool.name) } : tool));
    assert.ok(
      tools.every((tool) => tool.inputSchema?.additionalProperties === false),
      "tools/list schemas reject unknown top-level arguments",
    );
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [...EXPECTED_TOOLS].sort(),
      "tools/list registry must match verify inventory",
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
    // A retired tool is still answered, so its definition keeps the contract it is held to.
    const retiredTool = (name) => {
      const tool = TOOL_BY_NAME.get(name);
      return tool?.outputSchema ? { ...tool, outputSchema: TOOL_OUTPUT_CONTRACT_BY_NAME.get(name) } : tool;
    };
    const findTool = (name) => tools.find((t) => t.name === name) ?? (RETIRED_TOOL_REPLACEMENTS.has(name) ? retiredTool(name) : undefined);
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
    assert.deepEqual(listConcepts?.outputSchema?.properties?.nodes?.items?.required, ["slug", "title", "mtime"]);
    assert.equal(listConcepts?.outputSchema?.properties?.nodes?.items?.properties?.mtime?.type, "number");
    assert.equal(listConcepts?.outputSchema?.properties?.nodes?.items?.additionalProperties, false);
    assert.deepEqual(listConcepts?.outputSchema?.properties?.vaultWarnings?.required, ["errorCount", "warningCount"]);
    assert.equal(listConcepts?.outputSchema?.properties?.vaultWarnings?.additionalProperties, false);
    const getConceptTool = findTool("get_concept");
    assert.equal(getConceptTool?.outputSchema?.type, "object");
    assert.deepEqual(getConceptTool?.outputSchema?.required, ["uid", "slug", "isNode", "frontmatter", "bodyInfo", "neighbors", "outgoingEdges", "review", "mtime"]);
    assert.equal(getConceptTool?.inputSchema?.properties?.uid?.pattern, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assert.equal(getConceptTool?.inputSchema?.oneOf, undefined, "Claude-compatible input avoids top-level oneOf");
    assert.match(getConceptTool?.description ?? "", /exactly one selector/i);
    assert.deepEqual(getConceptTool?.inputSchema?.properties?.body?.enum, ["excerpt", "full"]);
    assert.deepEqual(getConceptTool?.outputSchema?.properties?.bodyInfo?.required, ["mode", "totalChars", "returnedChars", "truncated"]);
    assert.equal(getConceptTool?.outputSchema?.additionalProperties, false);
    assert.equal(getConceptTool?.outputSchema?.properties?.frontmatter?.type, "object");
    assert.equal(getConceptTool?.outputSchema?.properties?.isNode?.type, "boolean");
    assert.deepEqual(getConceptTool?.outputSchema?.properties?.review?.required, ["state", "currentness"]);
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
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.isNode?.type, "boolean");
    assert.deepEqual(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.review?.required, ["state", "currentness"]);
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
    assert.match(
      listConcepts?.description ?? "",
      /by text with `mentions`[\s\S]*ranks the nodes whose title, relations or body say it[\s\S]*plain Markdown pages[\s\S]*adds `matchedIn`, `score` and an `excerpt` to each row/i,
      "list_concepts description documents the mentions search",
    );
    assert.match(
      listConcepts?.inputSchema?.properties?.mentions?.description ?? "",
      /case-insensitive[\s\S]*best match first/i,
      "list_concepts mentions schema documents matching behavior",
    );
    assert.equal(listConcepts?.outputSchema?.properties?.query?.type, "string");
    assert.deepEqual(listConcepts?.outputSchema?.properties?.nodes?.items?.properties?.matchedIn?.enum, ["frontmatter", "body"]);
    assert.equal(listConcepts?.outputSchema?.properties?.nodes?.items?.properties?.score?.type, "number");
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
    assert.deepEqual(findBacklinks?.outputSchema?.properties?.matches?.items?.required, ["slug", "isNode", "title", "mtime"]);
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
    assert.match(
      listConcepts?.description ?? "",
      /by a predicate with `filter`/i,
      "list_concepts description documents the filter",
    );
    assert.equal(listConcepts?.outputSchema?.properties?.filter?.type, "string");
    assert.equal(listConcepts?.outputSchema?.properties?.parsedAs?.type, "string");
    assert.equal(listConcepts?.outputSchema?.properties?.growthHint?.type, "object");
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
      "referencedOnlyCount",
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
    const analyzeRepo = findTool("analyze_repo_structure");
    assert.match(
      analyzeRepo?.description ?? "",
      /Read-only; nothing is written[\s\S]*breadth map[\s\S]*every product unit[\s\S]*entry points[\s\S]*names no node[\s\S]*Up to 16 selectors[\s\S]*never an instruction or approval/i,
      "analyze_repo_structure description says the default survey is a breadth map",
    );
    assert.match(
      analyzeRepo?.inputSchema?.properties?.rootPath?.description ?? "",
      /Repository root to analyze[\s\S]*Defaults to the MCP server cwd/i,
      "analyze_repo_structure rootPath schema documents default root",
    );
    assert.equal(analyzeRepo?.inputSchema?.properties?.ignore?.maxItems, 200);
    assert.equal(analyzeRepo?.outputSchema, undefined, "the breadth map and source reads are text rows, so the tool declares no outputSchema");
    assert.equal(analyzeRepo?.inputSchema?.additionalProperties, false);
    assert.deepEqual(Object.keys(analyzeRepo?.inputSchema?.properties ?? {}).sort(), ["ignore", "rootPath", "sourceOnly", "sourceReads"], "the survey takes no proposal, qualification or depth");
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
      /walk TS\/JS files in a code repo and infer file-level \+ module-level import edges[\s\S]*root Python packages[\s\S]*side effect 0 \(vault frontmatter NOT modified\)[\s\S]*source-backed review candidates[\s\S]*bounded exact file-edge `evidence` receipt[\s\S]*focusPath[\s\S]*incoming\/outgoing[\s\S]*omit `reviewMode`[\s\S]*128 KiB[\s\S]*exactly one compact, non-writing `nextRelationReview:v1` packet[\s\S]*delivery receipt[\s\S]*rationale_review_required[\s\S]*ask the user[\s\S]*add_relation[\s\S]*`why`/i,
      "infer_imports description documents dependency-ingest safety workflow",
    );
    assert.match(
      inferImports?.inputSchema?.properties?.maxFiles?.description ?? "",
      /default 5000[\s\S]*avoid pathological monorepos/i,
      "infer_imports maxFiles schema documents hard stop",
    );
    assert.equal(inferImports?.inputSchema?.properties?.maxFiles?.maximum, 50000);
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
      /conforms, violated and unknown[\s\S]*unclassified import usage[\s\S]*never count as compliance/i,
    );
    const listKinds = findTool("list_kinds");
    assert.match(
      listKinds?.description ?? "",
      /Vault kind distribution[\s\S]*quick census[\s\S]*size up the vault without paging through list_concepts/i,
      "list_kinds description documents census workflow",
    );
    assert.equal(listKinds?.outputSchema?.type, "object");
    assert.deepEqual(listKinds?.outputSchema?.required, ["total", "byKind", "referencedOnlyTotal", "conceptsIncludingReferenced"]);
    assert.equal(listKinds?.outputSchema?.additionalProperties, false);
    assert.equal(listKinds?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.total?.minimum, 0);
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.type, "object");
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.additionalProperties?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.additionalProperties?.minimum, 0);
    assert.equal(listKinds?.outputSchema?.properties?.referencedOnlyTotal?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.referencedOnlyTotal?.minimum, 0);
    assert.equal(listKinds?.outputSchema?.properties?.conceptsIncludingReferenced?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.conceptsIncludingReferenced?.minimum, 0);
    const validateVault = findTool("validate_vault");
    assert.match(
      validateVault?.description ?? "",
      /validate every doc in the vault[\s\S]*per-doc \+ per-code aggregate[\s\S]*first-contact before writes[\s\S]*before \/ after a batch write[\s\S]*side effect 0/i,
      "validate_vault description documents first-contact health workflow",
    );
    assert.equal(validateVault?.outputSchema?.type, "object");
    assert.deepEqual(validateVault?.outputSchema?.required, ["scanned", "problems", "summary", "summaryFreshness", "pathDrift"]);
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
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.mtime?.type, "number");
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.filePath, undefined);
    assert.equal(addConcepts?.outputSchema?.properties?.findings?.items?.type, "string");
    assert.equal(addConcepts?.outputSchema?.properties?.coverage?.type, "object");
    assert.equal(addConcepts?.outputSchema?.properties?.postWriteMaintenance, undefined);
    const addConcept = findTool("add_concept");
    assert.equal(addConcept?.outputSchema?.type, "object");
    assert.deepEqual(addConcept?.outputSchema?.required, ["ok", "slug", "changed", "mtime"]);
    assert.equal(addConcept?.outputSchema?.additionalProperties, false);
    assert.equal(addConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(addConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.mtime?.type, "number");
    assert.equal(addConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(addConcept?.outputSchema?.properties?.warnings?.items?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.findings?.items?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.filePath, undefined);
    assert.equal(addConcept?.outputSchema?.properties?.postWriteMaintenance, undefined);
    const addRelations = findTool("add_relations");
    assert.equal(addRelations?.outputSchema?.type, "object");
    assert.deepEqual(addRelations?.outputSchema?.required, ["relations"]);
    assert.equal(addRelations?.outputSchema?.additionalProperties, false);
    assert.deepEqual(addRelations?.outputSchema?.properties?.relations?.items?.required, ["ok", "from", "to", "type"]);
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.additionalProperties, false);
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.ok?.type, "boolean");
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.alreadyExists?.type, "boolean");
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.receivedValue?.type, "string");
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.key, undefined);
    assert.equal(addRelations?.outputSchema?.properties?.findings?.items?.type, "string");
    assert.equal(addRelations?.outputSchema?.properties?.postWriteMaintenance, undefined);
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
    assert.equal(addRelation?.outputSchema?.properties?.findings?.items?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.key, undefined);
    assert.equal(addRelation?.outputSchema?.properties?.postWriteMaintenance, undefined);
    const patchConcept = findTool("patch_concept");
    assert.equal(patchConcept?.outputSchema?.type, "object");
    assert.deepEqual(patchConcept?.outputSchema?.required, ["ok"]);
    assert.equal(patchConcept?.inputSchema?.properties?.patches?.maxItems, 20);
    assert.deepEqual(patchConcept?.outputSchema?.properties?.patches?.items?.required, ["ok", "slug", "changed", "mtime"]);
    assert.equal(patchConcept?.outputSchema?.additionalProperties, false);
    assert.equal(patchConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(patchConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(patchConcept?.outputSchema?.properties?.mtime?.type, "number");
    assert.equal(patchConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(patchConcept?.outputSchema?.properties?.findings?.items?.type, "string");
    assert.equal(patchConcept?.outputSchema?.properties?.filePath, undefined);
    assert.equal(patchConcept?.outputSchema?.properties?.postWriteMaintenance, undefined);
    const renameConcept = findTool("rename_concept");
    assert.equal(renameConcept?.outputSchema?.type, "object");
    assert.deepEqual(renameConcept?.outputSchema?.required, [
      "ok", "dryRun", "previewReady", "canConfirm", "wouldChange", "blockedReasons",
      "uid", "oldSlug", "newSlug", "sourcePath", "targetPath", "backlinkUpdates",
    ]);
    assert.equal(renameConcept?.outputSchema?.additionalProperties, false);
    assert.deepEqual(renameConcept?.inputSchema?.required, ["oldSlug"]);
    assert.equal(renameConcept?.inputSchema?.properties?.newKind?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.newKind?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.bodyAction?.type, "string");
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
    assert.deepEqual(deleteConcept?.outputSchema?.properties?.backlinks?.items?.required, ["slug", "isNode", "title", "mtime"]);
    assert.equal(deleteConcept?.outputSchema?.properties?.backlinks?.items?.additionalProperties, false);
    const deleteBacklinkRow = deleteConcept?.outputSchema?.properties?.backlinksAtDelete?.items;
    assert.equal(deleteBacklinkRow?.properties?.uid?.pattern, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.slug, "delete backlink slug");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.kind, "delete backlink kind");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.title, "delete backlink title");
    assert.equal(deleteBacklinkRow?.properties?.domain?.type, "string");
    assertCleanStringSchema(deleteBacklinkRow?.properties?.matchedKeys?.items, "delete backlink matchedKeys item");
    assert.equal(deleteBacklinkRow?.properties?.matchedInBody?.type, "boolean");
    assert.equal(deleteConcept?.outputSchema?.properties?.captured?.type, "object");
    assert.deepEqual(deleteConcept?.outputSchema?.properties?.captured?.required, ["frontmatter"]);
    assert.equal(deleteConcept?.outputSchema?.properties?.captured?.additionalProperties, false);
    assert.equal(deleteConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const destructivePreviewTools = [
      "remove_relation",
      "rename_concept",
      "merge_concepts",
      "delete_concept",
      "absorb_document",
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
      getCs && /a bad row returns `\{ok:false, error\}`/.test(getCs) && /later valid slugs still resolve/.test(getCs),
      "get_concepts partial-row recovery hint",
    );
    assert.ok(findN && /one-hop graph neighborhood/i.test(findN), "find_neighbors graph hint");
    assert.ok(compile && /deterministic graph artifact/i.test(compile), "compile_ontology compiler hint");
    assert.ok(query && /Read-only; side effect 0/i.test(query), "query_ontology engine hint");
    const afterActionIdDescription = findTool("query_ontology")?.inputSchema?.properties?.afterActionId?.description ?? "";
    assert.match(afterActionIdDescription, /cursor\.nextAfterActionId while cursor\.hasMore/, "query_ontology maintenance cursor hint");
    assert.ok(
      validate && /first-contact before writes/i.test(validate),
      "validate_vault first-contact before writes hint",
    );
    assert.ok(addC && /add_concepts/.test(addC), "add_concept → add_concepts hint");
    assert.match(
      addCs ?? "",
      /Invalid-only batches return no row-level write metadata, no `findings` and no `coverage`/,
      "add_concepts invalid-only batches are visibly non-writing",
    );
    assert.ok(addR && /add_relations/.test(addR), "add_relation → add_relations hint");
    assert.match(
      addR ?? "",
      /invalid `type` is rejected[\s\S]*no `changed`, `alreadyExists`, or `findings` write metadata/,
      "add_relation invalid-type preflight is visibly non-writing",
    );
    assert.match(
      addRs ?? "",
      /Invalid-only batches return no row-level `changed` \/ `alreadyExists` write metadata and no top-level `findings`/,
      "add_relations invalid-only batches are visibly non-writing",
    );
    for (const toolName of ["add_concept", "add_concepts", "add_relation", "add_relations", "patch_concept"]) {
      assert.match(findTool(toolName)?.description ?? "", /`findings`/, `${toolName} describes the findings on the nodes it wrote`);
    }
    for (const toolName of [
      "rename_concept",
      "merge_concepts",
      "delete_concept",
    ]) {
      const description = findTool(toolName)?.description ?? "";
      assert.match(description, /`postWriteMaintenance` \(nextAction, stepsAboutTouched\)/, `${toolName} describes the one next step`);
      const postWriteSchema = findTool(toolName)?.outputSchema?.properties?.postWriteMaintenance;
      assert.deepEqual(postWriteSchema?.required, ["nextAction", "stepsAboutTouched"], `${toolName} answers the next step and a count`);
      assert.equal(postWriteSchema?.additionalProperties, false, `${toolName} closes postWriteMaintenance schema`);
      assert.equal(postWriteSchema?.properties?.stepsAboutTouched?.type, "integer", `${toolName} counts steps in whole numbers`);
      const nextAction = postWriteSchema?.properties?.nextAction;
      assert.deepEqual(nextAction?.type, ["object", "null"], `${toolName} has no next step when nothing is left`);
      assert.deepEqual(
        nextAction?.required,
        ["id", "phase", "kind", "severity", "score", "executable", "reason"],
        `${toolName} exposes the compact action schema`,
      );
      assert.deepEqual(
        nextAction?.properties?.proposedAction?.properties?.tool?.enum,
        ["add_concepts", "add_relations", "patch_concept"],
        `${toolName} names the call that settles the step`,
      );
      assert.deepEqual(
        nextAction?.properties?.proposedAction?.properties?.args?.oneOf?.map((schema) => schema.required),
        [["concepts"], ["relations"], ["slug", "frontmatter", "expected_mtime"]],
        `${toolName} exposes proposedAction args variants`,
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
      /summary[\s\S]*max 200 chars[\s\S]*without a follow-up `get_concepts` call[\s\S]*Default false/i,
      "list_concepts summary schema documents preview and payload tradeoff",
    );
    assert.match(
      findTool("list_concepts")?.inputSchema?.properties?.limit?.description ?? "",
      /Default 100/,
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
      /defaults to 100/i,
      "find_neighbors limit schema documents default and cap",
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
      /default 5/i,
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
      /Counts, graphHash and maxMtime only[\s\S]*cheap polling for cache invalidation/i,
      "compile_ontology summary schema documents cheap polling behavior",
    );
    assert.match(
      findTool("compile_ontology")?.inputSchema?.properties?.nodesLimit?.description ?? "",
      /`nodesOffset`/,
      "compile_ontology nodesLimit schema documents pagination cap",
    );
    assert.match(
      findTool("list_concepts")?.inputSchema?.properties?.filter?.description ?? "",
      /`key=value`[\s\S]*quote a value holding spaces[\s\S]*`has\(key\)`[\s\S]*Combine with AND, OR, NOT/i,
      "list_concepts filter schema documents operators and quoting",
    );
    assert.match(
      findTool("query_ontology")?.description ?? "",
      /impact \(what depends on a node, declared `depends_on` only\)[\s\S]*relation_check \(preflight before add_relations[\s\S]*connection_info\(\{guide:"query"\}\)/,
      "query_ontology description keeps the depends_on impact rule and points at the query guide",
    );
    assert.match(
      findTool("query_ontology")?.description ?? "",
      /agent_brief \(the project brief; `project` when the vault has more than one\)/,
      "query_ontology description names the one project brief",
    );
    assert.deepEqual(
      Object.keys(findTool("query_ontology")?.inputSchema?.properties ?? {}).filter((key) => ["detail", "task", "iterations", "nodeLimit", "componentLimit", "cycleLimit", "recommendationLimit", "orderLimit", "dependencyTypes", "componentTypes", "relation", "fromKind", "toKind", "minDegree", "maxDegree", "minInDegree", "minOutDegree", "maxDepth"].includes(key)),
      [],
      "query_ontology no longer takes the compact brief, the tuning limits or the degree filters",
    );
    assert.deepEqual(
      {
        type: findTool("query_ontology")?.inputSchema?.properties?.limit?.type,
        minimum: findTool("query_ontology")?.inputSchema?.properties?.limit?.minimum,
        maximum: findTool("query_ontology")?.inputSchema?.properties?.limit?.maximum,
        depthMaximum: findTool("query_ontology")?.inputSchema?.properties?.depth?.maximum,
        maxHopsMaximum: findTool("query_ontology")?.inputSchema?.properties?.maxHops?.maximum,
        typesEnum: findTool("query_ontology")?.inputSchema?.properties?.types?.items?.enum,
        patternEnum: findTool("query_ontology")?.inputSchema?.properties?.pattern?.items?.enum,
        typeEnum: findTool("query_ontology")?.inputSchema?.properties?.type?.enum,
        kindEnum: findTool("query_ontology")?.inputSchema?.properties?.kind?.enum,
        phasesEnum: findTool("query_ontology")?.inputSchema?.properties?.phases?.items?.enum,
        severitiesEnum: findTool("query_ontology")?.inputSchema?.properties?.severities?.items?.enum,
        maintenanceKindsEnum: findTool("query_ontology")?.inputSchema?.properties?.kinds?.items?.enum,
        afterActionIdDescription: findTool("query_ontology")?.inputSchema?.properties?.afterActionId?.description,
      },
      {
        type: "integer",
        minimum: 1,
        maximum: 500,
        depthMaximum: 20,
        maxHopsMaximum: 20,
        typesEnum: RELATION_TYPE_VALUES,
        patternEnum: RELATION_TYPE_VALUES,
        typeEnum: RELATION_TYPE_VALUES,
        kindEnum: NODE_KIND_VALUES,
        phasesEnum: MAINTENANCE_PHASE_VALUES,
        severitiesEnum: MAINTENANCE_SEVERITY_VALUES,
        maintenanceKindsEnum: MAINTENANCE_KIND_VALUES,
        afterActionIdDescription:
          "maintenance_plan: resume after this id; pass cursor.nextAfterActionId while cursor.hasMore. An unknown id returns an empty page with cursor.found=false.",
      },
      "query_ontology exposes its numeric caps and relation, kind and maintenance enums",
    );
    assert.deepEqual(
      findTool("query_ontology")?.inputSchema?.properties?.sort?.enum,
      ["degree", "inDegree", "outDegree", "slug"],
      "query_ontology exposes the match_nodes sort",
    );
    assert.equal(findTool("query_ontology")?.inputSchema?.properties?.hasIncoming?.type, "boolean");
    assert.deepEqual(
      {
        maxFilesType: findTool("infer_imports")?.inputSchema?.properties?.maxFiles?.type,
        maxFilesMinimum: findTool("infer_imports")?.inputSchema?.properties?.maxFiles?.minimum,
        maxFilesMaximum: findTool("infer_imports")?.inputSchema?.properties?.maxFiles?.maximum,
      },
      {
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
    const queryOperations = findTool("query_ontology")?.inputSchema?.properties?.operation?.enum ?? [];
    assert.deepEqual(
      queryOperations,
      [
        "neighbors", "path", "query_plan", "communities", "similar_nodes", "explain_relation", "reachability",
        "pattern_walk", "impact", "blast_radius", "subgraph", "overview", "schema", "facets", "match_nodes",
        "node_profile", "domain_matrix", "project_scope", "project_map", "relation_check", "components", "lineage",
        "containment_tree", "cycles", "recommend_relations", "growth_plan", "maintenance_plan", "agent_brief",
        "analysis_record", "workspace_brief", "health",
      ],
      "query_ontology exposes the runtime operation enum",
    );
    for (const retired of ["all_paths", "centrality", "match_edges", "domain_profile", "builder_context", "topological_order"]) {
      assert.ok(!queryOperations.includes(retired), `${retired} is no longer an operation`);
    }
    assert.deepEqual(
      findTool("query_ontology")?.inputSchema?.properties?.targetOperation?.enum,
      queryOperations.filter((operation) => operation !== "query_plan" && operation !== "analysis_record"),
      "query_ontology exposes query_plan targetOperation enum",
    );
    for (const [toolName, propertyName] of [
      ["list_concepts", "kind"],
      ["list_concepts", "domain"],
      ["get_concept", "slug"],
      ["list_concepts", "mentions"],
      ["list_concepts", "filter"],
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
      ["query_ontology", "slug"],
      ["query_ontology", "targetOperation"],
      ["query_ontology", "afterActionId"],
      ["analyze_repo_structure", "rootPath"],
      ["infer_imports", "rootPath"],
    ]) {
      assert.equal(findTool(toolName)?.inputSchema?.properties?.[propertyName]?.type, "string", `${toolName}.${propertyName} exposes string schema`);
      const contract = TOOL_INPUT_CONTRACT_BY_NAME.get(toolName)?.properties?.[propertyName];
      assert.equal(contract?.minLength, 1, `${toolName}.${propertyName} server contract keeps minLength`);
      assert.match(
        contract?.pattern ?? "",
        /\\s/,
        `${toolName}.${propertyName} server contract keeps the whitespace guard pattern`,
      );
    }
    assert.deepEqual(
      {
        type: findTool("get_concepts")?.inputSchema?.properties?.slugs?.type,
        maxItems: findTool("get_concepts")?.inputSchema?.properties?.slugs?.maxItems,
        itemType: findTool("get_concepts")?.inputSchema?.properties?.slugs?.items?.type,
        itemMinLength: TOOL_INPUT_CONTRACT_BY_NAME.get("get_concepts")?.properties?.slugs?.items?.minLength,
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
          TOOL_INPUT_CONTRACT_BY_NAME.get("add_concepts")?.properties?.concepts?.items?.properties?.kind?.minLength,
        titleMinLength:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.properties?.title?.minLength,
        capabilityItemMinLength:
          findTool("add_concepts")?.inputSchema?.properties?.concepts?.items?.properties?.capabilities?.items?.minLength,
        relationFromMinLength:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.from?.minLength,
        relationToMinLength:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.to?.minLength,
        relationTypeMinLength:
          TOOL_INPUT_CONTRACT_BY_NAME.get("add_relations")?.properties?.relations?.items?.properties?.type?.minLength,
        relationTypeEnum:
          findTool("add_relations")?.inputSchema?.properties?.relations?.items?.properties?.type?.enum,
        addRelationTypeEnum:
          findTool("add_relation")?.inputSchema?.properties?.type?.enum,
        analyzeIgnoreItemMinLength:
          TOOL_INPUT_CONTRACT_BY_NAME.get("analyze_repo_structure")?.properties?.ignore?.items?.minLength,
        inferSourceItemMinLength:
          TOOL_INPUT_CONTRACT_BY_NAME.get("infer_imports")?.properties?.sourceFolders?.items?.minLength,
        inferIgnoreItemMinLength:
          TOOL_INPUT_CONTRACT_BY_NAME.get("infer_imports")?.properties?.ignore?.items?.minLength,
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

await test("initialize — exposes agent guidance in the instructions field", async () => {
  // A connected agent learns the kinds, the build order and where the long rules
  // are from initialize; each tool's own contract is its description, and the
  // long rules arrive whole through connection_info({guide}).
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "connection_info", { guide: "write_safety" }),
      callTool(3, "connection_info", { guide: "meta_model" }),
      callTool(4, "connection_info", { guide: "construction" }),
    ]);
    const init = responses.find((r) => r.id === 1);
    assert.ok(init);
    const instructions = init.result?.instructions;
    assert.equal(typeof instructions, "string");
    assert.ok(
      instructions.length > 200 && instructions.length <= 2048,
      `instructions must be meaningful and fit the 2,048 characters a host may keep (got ${instructions.length})`,
    );
    assert.match(instructions, /## Construction card/);
    assert.match(instructions, /add_concepts[\s\S]*add_relations[\s\S]*validate_vault[\s\S]*connect_project_source[\s\S]*finalize_project_meaning/);
    assert.match(instructions, /connection_info\(\{guide\}\)/);
    assert.doesNotMatch(instructions, /## Tool inventory|qualification|writePlan|independent evaluator/);

    const writeSafety = getCallParsed(responses, 2).guideText;
    assert.match(writeSafety, /expected_mtime/);
    assert.match(writeSafety, /overwrite: true/);
    assert.match(writeSafety, /existing `newSlug`/);
    assert.match(writeSafety, /force: true/);
    assert.match(writeSafety, /dangling referrers/);
    const metaModel = getCallParsed(responses, 3).guideText;
    assert.match(metaModel, /five authorable kinds/i);
    assert.match(metaModel, /vault-readme.*reserved reader kind/i);
    const construction = getCallParsed(responses, 4).guideText;
    assert.match(construction, /teammate says aloud/);
    assert.match(construction, /depends_on/);
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
      callTool(2, "list_concepts", { limit: 1 }),
      callTool(3, "list_concepts", {}),
      callTool(4, "get_concepts", { slugs: ["project"] }),
      callTool(5, "query_ontology", { operation: "neighbors", slug: "capabilities/mcp-server" }),
      callTool(6, "validate_vault", {}),
      callTool(7, "query_ontology", { operation: "workspace_brief" }),
      callTool(8, "query_ontology", { operation: "overview", limit: 5 }),
      callTool(9, "query_ontology", { operation: "query_plan", targetOperation: "overview" }),
      callTool(10, "query_ontology", { operation: "query_plan", targetOperation: "project_map" }),
    ]);

    const { census } = getCallParsed(responses, 2);
    assert.equal(census.total, 3);
    assert.equal(census.byKind.project, 1);
    assert.equal(census.byKind.domain, 1);
    assert.equal(census.byKind.capability, 1);
    assert.deepEqual(getCallStructured(responses, 2).census, census);

    const list = getCallParsed(responses, 3);
    assert.equal(list.total, 3);
    assert.equal(list.nodes.length, 3);
    assert.deepEqual(getCallStructured(responses, 3), list);

    const [project] = getCallParsed(responses, 4).concepts;
    assert.equal(project.slug, "project");
    assert.equal(project.frontmatter.kind, "project");
    assert.deepEqual(getCallStructured(responses, 4).concepts[0], project);

    const neighbors = getCallParsed(responses, 5);
    assert.equal(neighbors.operation, "neighbors");
    assert.equal(neighbors.center, "capabilities/mcp-server");
    assert.ok(neighbors.total > 0);
    assert.ok(neighbors.edges.length > 0);

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

await test("read_source — a repository code path is refused with the call that reads it", async () => {
  // A refused path outside sources/ names the code reader in its exact call shape.
  const vaultRoot = makeVault();
  try {
    const { responses } = await rpc(vaultRoot, [
      ...INIT_REQUESTS,
      callTool(2, "read_source", { path: "src/options.rs", from: 276, limit: 195 }),
      callTool(3, "read_source", { path: "../outside.md" }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    const text = JSON.stringify(responses.find((r) => r.id === 2));
    assert.match(text, /analyze_repo_structure/);
    assert.match(text, /sourceReads/);
    assert.match(text, /src\/options\.rs/);
    // A traversal is still refused on the path rule, with no reader offered.
    assert.equal(isErrorResponse(responses, 3), true);
    assert.doesNotMatch(JSON.stringify(responses.find((r) => r.id === 3)), /analyze_repo_structure/);
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
  }
});

await test("tools/call — omitted arguments become an empty object and non-object arguments are rejected", async () => {
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
    assert.deepEqual(getCallStructured(responses, 6)?.allowedArguments, ["domain", "filter", "kind", "limit", "mentions", "offset", "since", "summary"]);
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
    assert.match(getCallText(responses, 8), /Allowed arguments: domain, filter, kind, limit, mentions, offset, since, summary/i);
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

await test("analyze_repo_structure — the survey is a breadth map over MCP and names no node", async () => {
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
    const survey = getCallTextAlone(responses, 2);
    assert.match(survey, /^Breadth map of /);
    assert.deepEqual(unitPaths(survey), ["src/features"]);
    assert.doesNotMatch(survey, /domains\/|capabilities\/|proposalValidation/, "the survey names no candidate node");
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("analyze_repo_structure — reads answer source-only and never repeat the map", async () => {
  const root = makeVault();
  writeFileSync(join(root, 'index.ts'), 'export function readSetting(value = 2) { return value; }\n');
  const reads = [{ path: 'index.ts', startLine: 1, maxLines: 10 }];
  try {
    const { responses } = await rpcForRepo(root, root, [...INIT_REQUESTS,
      { jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} },
      callTool(2, 'analyze_repo_structure', { sourceReads: reads }),
      callTool(3, 'analyze_repo_structure', { sourceOnly: true, sourceReads: reads }),
      callTool(4, 'analyze_repo_structure', { sourceOnly: false, sourceReads: reads }),
      callTool(6, 'analyze_repo_structure', {}),
    ], { OATLAS_READ_ONLY: '1' });
    const compact = getCallTextAlone(responses, 3);
    const map = getCallTextAlone(responses, 6);
    assert.match(compact, /^Source reads in .*: 1 read, 0 outlined, 0 not returned\. .*nothing was written/);
    assert.match(compact, /^== read index\.ts L1-L1 of 1 lines$/m);
    assert.doesNotMatch(compact, /Breadth map|^Units: |writePlan|canWrite/m, 'the reads never repeat the map or offer a write');
    assert.equal(getCallTextAlone(responses, 2), compact);
    assert.equal(getCallTextAlone(responses, 4), compact);
    assert.match(map, /^Breadth map of /);
    assert.equal(responses.find((row) => row.id === 5).result.tools
      .find((tool) => tool.name === 'analyze_repo_structure').outputSchema, undefined);
    assert.equal(loadVaultDocs(root).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await test("analyze_repo_structure — source-only rejects missing reads and answers a retired lifecycle argument with the replacement", async () => {
  const root = makeVault();
  const reads = [{ path: 'index.ts', startLine: 1, maxLines: 1 }];
  try {
    const invalid = [{ sourceOnly: true }, { sourceOnly: true, sourceReads: [] },
      { sourceOnly: true, sourceReads: Array(17).fill(reads[0]) },
      { sourceOnly: 'true', sourceReads: reads },
      { sourceOnly: true, sourceReads: reads, proposal: {} },
      { sourceOnly: true, sourceReads: reads, qualification: {} },
      { sourceOnly: true, sourceReads: reads, view: 'analysis' },
      { sourceOnly: true, sourceReads: reads, maxDepth: 2 }];
    const { responses } = await rpcForRepo(root, root, [...INIT_REQUESTS,
      ...invalid.map((args, i) => callTool(i + 2, 'analyze_repo_structure', args)),
    ]);
    for (const [i] of invalid.entries()) {
      const result = responses.find((row) => row.id === i + 2).result;
      assert.equal(result.isError, true);
      assert.notEqual(result.structuredContent.errorCode, 'unknown_argument');
      assert.match(result.structuredContent.error, i < 4 ? /sourceOnly|sourceReads/ : /is retired|retired:/);
      if (i >= 4) assert.equal(result.structuredContent.errorCode, 'invalid_arguments');
    }
    assert.equal(loadVaultDocs(root).length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await test("analyze_repo_structure — source-only retains refusal and continuation boundaries", async () => {
  const root = makeVault();
  writeFileSync(join(root, 'index.ts'), 'export const value = 1;\n');
  writeFileSync(join(root, '.env'), 'SECRET=value\n');
  symlinkSync(join(root, 'index.ts'), join(root, 'link.ts'));
  const reads = [{ path: 'index.ts', startLine: 1, maxLines: 1, expectedSha256: '0'.repeat(64) },
    { path: '.env', startLine: 1, maxLines: 1 },
    { path: '../outside.ts', startLine: 1, maxLines: 1 },
    { path: 'link.ts', startLine: 1, maxLines: 1 }];
  try {
    const { responses } = await rpcForRepo(root, root, [...INIT_REQUESTS,
      callTool(2, 'analyze_repo_structure', { sourceOnly: true, sourceReads: reads }),
      callTool(3, 'analyze_repo_structure', { sourceOnly: true,
        sourceReads: [{ path: 'index.ts', mode: 'outline' }] }),
    ], { OATLAS_READ_ONLY: '1' });
    const packet = getCallTextAlone(responses, 2);
    assert.match(packet, /: 0 read, 0 outlined, 4 not returned\. /);
    for (const read of reads) assert.match(packet, new RegExp(`^== refused ${read.path.replace(/\./g, '\\.')}: [a-z_]+$`, 'm'), read.path);
    assert.doesNotMatch(packet, /pinned|```|SECRET/, 'a refusal carries no text and no citation');
    const outline = getCallTextAlone(responses, 3);
    assert.match(outline, /: 0 read, 1 outlined, 0 not returned\. /);
    assert.match(outline, /^== outline index\.ts \(/m);
    assert.doesNotMatch(outline, /pinned|```/, 'an outline carries no source text and no citation');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await test("analyze_repo_structure — round-trips bounded sourceReads through MCP", async () => {
  const vaultRoot = makeVault();
  const repoRoot = realpathSync(mkdtempSync(join(tmpdir(), "ontology-atlas-source-read-")));
  try {
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "source-read" }), "utf-8");
    mkdirSync(join(repoRoot, "src"));
    writeFileSync(join(repoRoot, "src", "policy.ts"), "const allow = true;\r\nexport { allow };\r\n", "utf-8");
    const { responses } = await rpcForRepo(vaultRoot, repoRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", {
        rootPath: repoRoot,
        sourceReads: [
          { path: "src/policy.ts", startLine: 1, maxLines: 1 },
          { path: "src/missing.ts", startLine: 1, maxLines: 1 },
        ],
      }),
    ]);
    const result = getCallTextAlone(responses, 2);
    assert.match(result, /^Source reads in .*: 1 read, 0 outlined, 1 not returned\. /);
    assert.ok(result.includes("\n```\nconst allow = true;\r\n```\n"), "the line exactly as it is in the file");
    assert.match(result, /^cite src\/policy\.ts:L1-L1 pinned source:src\/policy\.ts#L1-L1@sha256:[a-f0-9]{64}$/m);
    assert.match(result, /^== refused src\/missing\.ts: not_found$/m);
    assert.equal(result.split("pinned ").length, 2, "only the read row carries a citation");
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
    // Slugs are flat identifiers: a module slug is the role name only.
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
    // The stamp is a dated receipt of the source state; the tmp repository is no
    // git checkout, so it is a folder fingerprint with nothing sha-shaped. With
    // neither usage key declared, both usages are governed until a profile says
    // otherwise.
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

await test("infer_imports — Go package evidence stays typed while focus returns a bounded summary", async () => {
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
    ]);
    const full = getCallParsed(responses, 2);
    const focused = getCallParsed(responses, 3);

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
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports auto delivery — oversized omitted calls compact, explicit full stays available, and raw scans fail closed", async () => {
  const vaultRoot = makeVault([
    {
      slug: "capabilities/legacy",
      // "Readable, but no import": without a path the edge would be
      // notJudgeableByImports and the stale follow-up would not appear.
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
    ]);

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

await test("Rust and Autotools C MCP evidence — the survey and infer_imports keep bounded import coverage", async () => {
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
    ]);
    assert.match(getCallTextAlone(responses, 2), /^Breadth map of /);
    const imports = getCallParsed(responses, 3);

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
    assert.equal(result.nextReview.endpointModelling.addConceptsStep.tool, "add_concepts");
    assert.deepEqual(result.nextReview.endpointModelling.addConceptsStep.fieldsAfterKindDecision, {
      common: ["slug", "title", "definition", "evidence", "confidence"],
      byKind: {
        project: [],
        domain: [],
        capability: ["domain"],
        element: ["domain", "path"],
      },
    });
    assert.equal(result.nextReview.endpointModelling.addConceptsStep.endpointDrafts.length, 2);
    assert.deepEqual(
      result.nextReview.endpointModelling.addConceptsStep.endpointDrafts.map((draft) => ({
        endpoint: draft.endpoint,
        slugCandidate: draft.slugCandidate,
      })),
      [
        { endpoint: "capabilities/alpha", slugCandidate: "capabilities/alpha" },
        { endpoint: "capabilities/beta", slugCandidate: "capabilities/beta" },
      ],
    );
    assert.ok(result.nextReview.endpointModelling.addConceptsStep.endpointDrafts.every(
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

await test("infer_imports — Python package and import boundaries resolve inside the package", async () => {
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
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot }),
      callTool(3, "infer_imports", { rootPath: repoRoot, reconcile: false }),
    ]);
    const imports = getCallParsed(responses, 3);

    assert.match(getCallTextAlone(responses, 2), /^Breadth map of /);
    assert.deepEqual(getCallStructured(responses, 3), imports);
    assert.equal(imports.filesScanned, 5);
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

await test("query_ontology — compiled graph engine neighbors/path/query_plan/communities/similar_nodes/explain_relation/reachability/pattern_walk/impact/blast_radius/subgraph/overview/schema/facets/match_nodes/node_profile/project_scope/project_map/relation_check/components/lineage/containment_tree/cycles/recommend_relations/growth_plan/maintenance_plan/agent_brief/workspace_brief/health", async () => {
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
        sort: "inDegree",
      }),
      callTool(16, "query_ontology", {
        operation: "node_profile",
        slug: "capabilities/login",
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
      callTool(31, "query_ontology", {
        operation: "query_plan",
        targetOperation: "path",
        from: "capabilities/session",
        to: "auth-domain",
        maxHops: 3,
        types: ["depends_on"],
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
    assert.deepEqual(matchNodes.nodes.map((node) => node.slug), ["capabilities/login", "capabilities/session"]);
    assert.equal(matchNodes.nodes[0].inDegree, 1);

    const nodeProfile = getCallParsed(responses, 16);
    assert.equal(nodeProfile.operation, "node_profile");
    assert.equal(nodeProfile.center, "capabilities/login");
    assert.deepEqual(nodeProfile.degree, { in: 1, out: 3, total: 4 });
    assert.equal(nodeProfile.edges.outgoing.total, 3);

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
      next: "Explain which observable ability fails without the target, ask for approval of the exact direction and rationale, then call add_relations with a nonblank why on the row.",
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

    const recommendations = getCallParsed(responses, 27);
    assert.equal(recommendations.totalRecommendations, 1);
    assert.deepEqual(recommendations.recommendations.map((row) => row.proposedAction.args.relations[0]), [
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
    assert.equal(health.relationCensus.compilerDeclarations.count, health.summary.edges);
    assert.equal(health.relationCensus.compilerDeclarations.count, health.compiledSummary.edges);
    assert.deepEqual(health.relationCensus.compilerDeclarations.reportedAt, [
      "summary.edges",
      "compiledSummary.edges",
    ]);
    assert.equal(
      health.relationCensus.canonicalMapCensus.unit,
      "deduplicated_normalized_typed_edges",
    );
    assert.equal(health.relationCensus.canonicalMapCensus.countAvailable, false);
    assert.equal(health.checks.find((check) => check.id === "relation_recommendations").status, "warn");

    const queryPlan = getCallParsed(responses, 31);
    assert.equal(queryPlan.operation, "query_plan");
    assert.equal(queryPlan.targetOperation, "path");
    assert.equal(queryPlan.sideEffect, false);
    assert.equal(queryPlan.normalized.from, "capabilities/session");
    assert.equal(queryPlan.normalized.to, "domains/auth");
    assert.deepEqual(queryPlan.normalized.types, ["dependencies"]);

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
    const briefValidation = agentBrief.health.validation;
    assert.ok(
      briefValidation.problems.some((problem) => problem.slug === "capabilities/session"),
      "full detail keeps whole-vault validation findings even when graph guidance is project-scoped",
    );
    assert.deepEqual(
      {
        offset: briefValidation.problemsPagination.offset,
        limit: briefValidation.problemsPagination.limit,
        total: briefValidation.problemsPagination.total,
      },
      { offset: 0, limit: 3, total: briefValidation.summary.problemFiles },
    );
    assert.equal(briefValidation.problems.length, Math.min(3, briefValidation.summary.problemFiles));
    assert.equal(briefValidation.nextCall.tool, "validate_vault");
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
    assert.equal(Object.hasOwn(agentBrief, "cliFallbackCommands"), false);
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
    assert.match(agentBrief.handoffPrompt, /bounded claims, not inventories: never say only, all, every or exactly/);
    assert.match(agentBrief.handoffPrompt, /relation_check before add_relations and find_backlinks before rename_concept/);
    for (const cut of ["businessOntologyLens", "relationDecisionGuide", "writePolicy"]) {
      assert.equal(Object.hasOwn(agentBrief, cut), false, `${cut} is in the guides, not in every brief`);
    }
    for (const cut of ["graphDbQueryPack", "playbooks", "traversalStrategy", "resultContracts", "navigation"]) {
      assert.equal(Object.hasOwn(agentBrief, cut), false, `${cut} is cut from the brief`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('query_ontology analysis archive — restores a raw record without graph meaning and rejects unsafe ids', async () => {
  const root = makeVault();
  const record = {
    schema: 'atlas-analysis/v1', recordType: 'run', id: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-05T08:00:00.000Z', mode: 'meaning',
    scope: { projectSlug: null, projectUid: null, targetSlugs: [], profileSlug: null },
    request: { id: 'user-1', text: 'Review the boundary.', parentRunId: null },
    origin: { surface: 'map', runtimeId: 'test', sessionId: null, userEventId: 'user-1', answerEventId: 'answer-1', startedAt: '2026-09-05T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    basis: { graphHash: null, sourceFingerprint: null, profileHash: null, documents: [] }, evidence: [], observations: [], profileSnapshot: null, toolReads: [], sourceAccess: 'unproven', findings: [], qualification: { status: 'unverified', reasons: ['no_evidence'] }, answer: 'An answer without a structured finding.\nUnknown: business policy.\n',
  };
  try {
    const directory = join(root, '.ontology-atlas/analyses');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, analysisRecordFileName(record)), serializeAnalysisRecord(record));
    const { responses } = await rpc(root, [...INIT_REQUESTS,
      callTool(11, 'query_ontology', { operation: 'analysis_record', recordId: record.id }),
      callTool(12, 'query_ontology', { operation: 'analysis_record', recordId: '../secret' }),
      callTool(14, 'compile_ontology'),
    ]);
    assert.deepEqual(getCallParsed(responses, 11).record, record);
    assert.equal(isErrorResponse(responses, 12), true);
    assert.equal(getCallParsed(responses, 14).nodeCount, 0);
    assert.equal(readFileSync(join(directory, analysisRecordFileName(record)), 'utf8'), serializeAnalysisRecord(record));
  } finally { rmSync(root, { recursive: true, force: true }); }
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
    ], tracedEnv);
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
      assert.ok(validation.summaryFreshness.stale >= 1, `${label} keeps the stale-summary count`);
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
    ], tracedEnv);
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
     * Structurally connected with a real finding (a reference to a missing node):
     * healthy must never be reported while a finding exists. The domain contains
     * the capability, so a missing-`domain:` finding would not count.
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
    // The wording states what was looked at: this tmp vault is outside git, so code
    // paths were never measured, and it says so.
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
  // Answers written in the project document but no finalize receipt: the gap id
  // stays `competency_not_authored` (agents read it), but the instruction must
  // be to call finalize_project_meaning, not to write the answers again.
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

await test("list_concepts — reports the exact node count of a tmp vault", async () => {
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
    assert.equal(result.total, 2, "counts only the two nodes with a kind");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — offset pages restore a vault of over 500 nodes without loss", async () => {
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

await test("list_concepts — domain filter", async () => {
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
    // Two capabilities and one element; the domain itself has no domain:.
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "auth" }),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 3, "domain=auth → 3");
    assert.ok(out1.nodes.every((n) => n.domain === "auth"));

    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { domain: "auth", kind: "capability" }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 2, "domain=auth + kind=capability → 2");

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

await test("list_concepts mentions — each row carries its uid, mtime, matchedIn, score and, on request, a prose summary", async () => {
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
      callTool(2, "list_concepts", { mentions: "auth", summary: true }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.query, "auth");
    assert.ok(result.nodes.length >= 1);
    for (const m of result.nodes) {
      assert.match(m.uid, /^[0-9a-f-]{36}$/, `${m.slug}.uid`);
      assert.ok(["frontmatter", "body"].includes(m.matchedIn), `${m.slug}.matchedIn`);
      assert.equal(typeof m.score, "number", `${m.slug}.score`);
      assert.equal(typeof m.summary, "string");
      assert.doesNotMatch(m.summary, /^#/);
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
    assert.equal(result.nodes[0].slug, "capabilities/auth", "the node titled for the text ranks first");
    const billing = result.nodes.find((m) => m.slug === "domains/billing");
    assert.match(billing.summary, /결제 도메인/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Both relation ends must be nodes: the existence check asked "is there a .md",
 * so a diary memo passed. Later channels catch it, but only after the write.
 */
await test("add_relation — a document outside the graph cannot be a relation endpoint", async () => {
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
    assert.match(text, /Error/i, `accepted a non-node document as a relation endpoint: ${text}`);
    // Why it cannot happen, and where to go instead — this repository's refusal grammar.
    assert.match(text, /not a graph node|kind/i, `does not state the reason: ${text}`);
    assert.match(text, /absorb_document|add_concept|kind:/i, `does not state the way forward: ${text}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("relation tools — an edge written under the depends_on alias key is the same edge (no duplicate add, removable)", async () => {
  /*
   * The read layer canonicalizes the `depends_on:` alias, so the write layer must
   * too: no duplicate under a second key, and remove_relation finds the edge
   * get_concept renders.
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

    const before = getCallParsed(responses, 2);
    assert.deepEqual(before.neighbors.dependencies, ["capabilities/session"],
      `neighbors misses the alias edge: ${JSON.stringify(before.neighbors)}`);
    assert.ok(
      before.outgoingEdges.some((e) => e.to === "capabilities/session" && e.via === "dependencies"),
      `outgoingEdges lacks the alias edge: ${JSON.stringify(before.outgoingEdges)}`,
    );

    const added = getCallParsed(responses, 3);
    assert.equal(added.alreadyExists, true, `counted the alias edge as a new edge: ${JSON.stringify(added)}`);

    const removed = getCallParsed(responses, 4);
    assert.equal(removed.changed, true, `could not remove the alias edge: ${JSON.stringify(removed)}`);

    const after = getCallParsed(responses, 5);
    assert.deepEqual(after.neighbors.dependencies, [], "the edge remains after removal");
    assert.equal(after.frontmatter.depends_on, undefined, "the alias key was not folded into the canonical key");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * A document outside the graph is not rejected (reading notes is legitimate),
 * but get_concept says what it is handing over.
 */
await test("get_concept — says so for a document outside the graph", async () => {
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
    assert.equal(junk.isNode, false, "isNode is not false for a document outside the graph");
    assert.ok(Array.isArray(junk.warnings) && junk.warnings.length > 0, "no warning at all");
    assert.ok(
      junk.warnings.some((w) => /not a graph node|그래프 밖/i.test(String(w.message ?? w))),
      `no outside-the-graph warning: ${JSON.stringify(junk.warnings)}`,
    );

    // Real nodes must not carry the "outside the graph" warning.
    const node = getCallParsed(responses, 3);
    assert.equal(node.isNode, true);
    assert.ok(
      !(node.warnings ?? []).some((w) => w.code === "not-a-graph-node"),
      `a real node got an outside-the-graph warning: ${JSON.stringify(node.warnings)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Evidence ranking: on equal scores the order was alphabetical by slug, so memos
 * outranked nodes. Loose documents stay visible (a memo may be real evidence),
 * but nodes rank first on a tie, each row carries `isNode`, and `nodesOnly` narrows.
 */
await test("list_concepts mentions — plain Markdown pages answer as isNode:false below nodes of equal score, each row with an excerpt", async () => {
  const root = makeVault([
    {
      slug: "aaa-meeting-note",
      content: "민수랑 얘기함. 토큰 발급이 느리다는 말이 나왔는데 근거는 없었음.\n",
    },
    {
      slug: "capabilities/token-issue",
      content:
        "---\nkind: capability\ntitle: 접근 토큰\n---\n\n# 접근 토큰\n\n토큰 발급 절차를 소유한다.\n",
    },
    {
      slug: "elements/token-store",
      content:
        "---\nkind: element\ntitle: 저장소\n---\n\n# 저장소\n\n토큰 발급 기록을 보관한다.\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { mentions: "토큰 발급" }),
      callTool(3, "list_concepts", { mentions: "토큰", kind: "element" }),
    ]);
    const all = getCallParsed(responses, 2);
    assert.deepEqual(
      all.nodes.map((m) => [m.slug, m.isNode]),
      [["capabilities/token-issue", true], ["elements/token-store", true], ["aaa-meeting-note", false]],
      "the memo answers last: its body ties the element's, and a node outranks a page of equal score",
    );
    assert.equal(all.total, 3);
    const memo = all.nodes[2];
    assert.equal(memo.uid, undefined);
    assert.equal(memo.kind, undefined);
    assert.match(memo.excerpt, /토큰 발급이 느리다/);
    assert.match(all.nonNodeHint, /1 of 3 row\(s\) are not graph nodes/);
    for (const row of all.nodes) assert.equal(typeof row.excerpt, "string", `${row.slug} carries an excerpt`);
    const narrowed = getCallParsed(responses, 3);
    assert.deepEqual(narrowed.nodes.map((m) => m.slug), ["elements/token-store"], "mentions joins kind as AND");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts mentions — zero hits return a growthHint (near-title candidates or an add_concept scaffold)", async () => {
  const root = makeVault([
    {
      slug: "capabilities/token-issue",
      content: "---\nkind: capability\ntitle: Token Issue\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { mentions: "Token Issuance" }),
      callTool(3, "list_concepts", { mentions: "Completely Unrelated Concept" }),
    ]);

    const near = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), near);
    assert.equal(near.nodes.length, 0);
    assert.ok(near.growthHint, "expected growthHint on 0-hit response");
    assert.match(near.growthHint.reason, /No vault node mentions "Token Issuance"/);
    assert.deepEqual(near.growthHint.exampleCall, { tool: "get_concepts", args: { slugs: ["capabilities/token-issue"] } });

    const noNear = getCallParsed(responses, 3);
    assert.equal(noNear.nodes.length, 0);
    assert.ok(noNear.growthHint, "expected growthHint on 0-hit response");
    assert.deepEqual(noNear.growthHint.exampleCall, {
      tool: "add_concepts",
      args: {
        concepts: [{ slug: "completely-unrelated-concept", kind: "element", title: "Completely Unrelated Concept" }],
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — summary opt-in adds a prose summary to each node", async () => {
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
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    for (const node of out1.nodes) {
      assert.equal(node.summary, undefined, "no summary by default");
    }

    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { summary: true }),
    ]);
    const out2 = getCallParsed(r2, 2);
    for (const node of out2.nodes) {
      assert.equal(typeof node.summary, "string", `${node.slug}.summary`);
      assert.doesNotMatch(node.summary, /^#/);
      assert.doesNotMatch(node.summary, /^\|/);
    }
    const auth = out2.nodes.find((n) => n.slug === "capabilities/auth");
    assert.match(auth.summary, /인증 흐름/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — since filter for incremental sync", async () => {
  // `since` is strict (mtime > since), so resending the max fetches nothing.
  const root = makeVault([
    { slug: "old", content: "---\nkind: capability\ntitle: Old\n---\n" },
    { slug: "newer", content: "---\nkind: capability\ntitle: Newer\n---\n" },
  ]);
  try {
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    const maxMtime = Math.max(...out1.nodes.map((n) => n.mtime));

    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 0, "since=max returns 0 rows (no resend)");

    const { responses: r3 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime - 1 }),
    ]);
    const out3 = getCallParsed(r3, 2);
    assert.ok(out3.total >= 1, "since=max-1 returns at least one row");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — each node carries its mtime", async () => {
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
      assert.equal(typeof node.mtime, "number", `${node.slug}.mtime`);
      assert.ok(node.mtime > 0, `${node.slug}.mtime > 0`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_backlinks — each match row carries domain and mtime", async () => {
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

await test("find_backlinks — reads a target alias and legacy depends_on as canonical graph edges", async () => {
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

await test("find_neighbors — returns the one-hop graph subgraph by direction and type", async () => {
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

await test("find_path — exposes the shortest-path contract in structuredContent", async () => {
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
      // "to" is missing while "login" exists, so the hint is an add_concept scaffold.
      growthHint: {
        reason: '"missing-node" does not resolve to a vault node.',
        suggestion:
          "A path cannot exist to an endpoint that is not in the vault yet. Add it first if it describes a real capability/element/domain.",
        exampleCall: {
          tool: "add_concepts",
          args: { concepts: [{ slug: "missing-node", kind: "element", title: "Missing Node" }] },
        },
      },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("find_path / get_concept — edges carry the stored relation_notes rationale, and omit the key without one", async () => {
  // An edge written through add_relation(why) must read back with its why.
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

await test("find_neighbors/get_concept — read legacy depends_on frontmatter as dependencies edges", async () => {
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
      callTool(7, "list_concepts", { filter: "kind=capability", limit: "10" }),
      callTool(8, "compile_ontology", { nodesOffset: -1 }),
      callTool(9, "compile_ontology", { edgesLimit: 1.5 }),
      callTool(10, "query_ontology", {
        operation: "neighbors",
        slug: "a",
        direction: "sideways",
      }),
      callTool(12, "query_ontology", { operation: "cycles", depth: -1 }),
      callTool(13, "find_neighbors", { slug: "a", types: ["depends_on", 123] }),
      callTool(14, "list_concepts", { mentions: 7 }),
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
      callTool(30, "query_ontology", { operation: "project_map", itemLimit: 501 }),
      callTool(31, "query_ontology", { operation: "reachability", slug: "a", depth: 21 }),
      callTool(32, "query_ontology", { operation: "path", from: "a", to: "b", maxHops: 21 }),
      callTool(33, "analyze_repo_structure", { rootPath: " ." }),
      callTool(35, "analyze_repo_structure", { ignore: ["dist", " "] }),
      callTool(36, "infer_imports", { rootPath: ".\0" }),
      callTool(37, "infer_imports", { sourceFolders: ["src", " lib"] }),
      callTool(38, "infer_imports", { ignore: ["dist", 7] }),
      callTool(39, "infer_imports", { maxFiles: 0 }),
      callTool(40, "infer_imports", { maxFiles: 50001 }),
      callTool(41, "compile_ontology", { nodesLimit: 0 }),
      callTool(44, "query_ontology", { operation: "match_nodes", sort: "mtime" }),
      callTool(45, "query_ontology", { operation: "recommend_relations", kind: "domain" }),
      callTool(46, "find_path", { from: "a", to: "b", maxHops: 21 }),
      callTool(47, "list_concepts", { limit: 501 }),
      callTool(48, "list_concepts", { filter: "kind=capability", limit: 501 }),
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
      callTool(60, "query_ontology", { operation: "maintenance_plan", phases: ["repiar"] }),
      callTool(61, "query_ontology", { operation: "maintenance_plan", severities: ["fatal"] }),
      callTool(62, "query_ontology", { operation: "maintenance_plan", kinds: ["add_mising_relation"] }),
      callTool(65, "query_ontology", {
        operation: "relation_check",
        from: "a",
        to: "b",
        type: "depend_on",
      }),
      callTool(66, "query_ontology", { operation: "match_nodes", kind: "capabilty" }),
      callTool(69, "find_neighbors", { slug: "a", types: ["depend_on"] }),
      callTool(72, "list_concepts", { filter: "kind=capabilty" }),
      callTool(73, "list_concepts", { filter: "has(capabilties)" }),
      callTool(74, "list_concepts", { filter: "knd=capability" }),
      callTool(75, "list_concepts", { kind: "capabilty" }),
    ]);
    for (const id of [
      2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 35, 36, 37,
      38, 39, 40, 41, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
      55, 56, 60, 61, 62, 65, 66, 69,
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
    assert.match(responses.find((r) => r.id === 10).result.content[0].text, /direction must be one of/i);
    assert.match(responses.find((r) => r.id === 12).result.content[0].text, /depth must be a non-negative integer/i);
    assert.match(responses.find((r) => r.id === 13).result.content[0].text, /types must be an array of strings/i);
    assert.match(responses.find((r) => r.id === 14).result.content[0].text, /mentions must be a non-empty string/i);
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
    assert.match(responses.find((r) => r.id === 69).result.content[0].text, /types items must be one of/i);
    assert.match(responses.find((r) => r.id === 69).result.content[0].text, /Received: "depend_on"/i);
    assert.match(responses.find((r) => r.id === 69).result.content[0].text, /Did you mean "depends_on"\?/i);
    assertStructuredValueRepair(responses, 69, {
      valueName: "types items",
      receivedValue: "depend_on",
      suggestion: "depends_on",
      allowedValues: RELATION_TYPE_VALUES,
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
    assert.match(responses.find((r) => r.id === 30).result.content[0].text, /itemLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 31).result.content[0].text, /depth must be <= 20/i);
    assert.match(responses.find((r) => r.id === 32).result.content[0].text, /maxHops must be <= 20/i);
    assert.match(responses.find((r) => r.id === 33).result.content[0].text, /rootPath must not have leading or trailing whitespace/i);
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
      callTool(3, "list_concepts", { mentions: " " }),
      callTool(4, "find_backlinks", { slug: "a\0" }),
      callTool(5, "find_neighbors", { slug: " a" }),
      callTool(6, "find_path", { from: " a", to: "b" }),
      callTool(7, "find_path", { from: "a", to: " " }),
      callTool(9, "list_concepts", { filter: " kind=capability" }),
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
    for (const id of [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 21, 22]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} should be rejected`);
    }
    assert.match(responses.find((r) => r.id === 21).result.content[0].text, /kind must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /mentions must be a non-empty string/i);
    assert.match(responses.find((r) => r.id === 4).result.content[0].text, /slug must not contain a null byte/i);
    assert.match(responses.find((r) => r.id === 5).result.content[0].text, /slug must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 6).result.content[0].text, /from must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 7).result.content[0].text, /to must be a non-empty string/i);
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

await test("list_concepts filter — each match row carries its mtime", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: x\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\ndomain: x\n---\n" },
    { slug: "c", content: "---\nkind: domain\ntitle: C\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { filter: "kind=capability" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.total, 2);
    for (const m of result.nodes) {
      assert.match(m.uid, /^[0-9a-f-]{36}$/, `${m.slug}.uid`);
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts filter — zero rows return a growthHint (a missing kind/domain fact or a filter relaxation)", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: auth\nelements: [x]\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      // A valid kind this vault has none of.
      callTool(2, "list_concepts", { filter: "kind=project" }),
      callTool(3, "list_concepts", { filter: "domain=billing" }),
      // Kind and domain both exist; only the combination yields 0 rows.
      callTool(4, "list_concepts", { filter: "kind=capability AND domain=auth AND NOT has(elements)" }),
    ]);

    const missingKind = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), missingKind);
    assert.equal(missingKind.total, 0);
    assert.ok(missingKind.growthHint, "expected growthHint on 0-row response");
    assert.match(missingKind.growthHint.reason, /kind="project" has 0 nodes in this vault/);
    assert.deepEqual(missingKind.growthHint.exampleCall, { tool: "list_concepts", args: { limit: 1 } });

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

await test("list_concepts filter — depends_on alias in has() matches canonical dependencies", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndependencies: [b]\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
    { slug: "c", content: "---\nkind: capability\ntitle: C\ndepends_on: [b]\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { filter: "has(depends_on)" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.parsedAs, "has(dependencies)");
    assert.deepEqual(result.nodes.map((row) => row.slug), ["a", "c"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts filter — limited reflects hidden rows, not exact page fill", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: capability\ntitle: A\ndomain: x\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\ndomain: x\n---\n" },
    { slug: "c", content: "---\nkind: domain\ntitle: C\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { filter: "kind=capability", limit: 2 }),
      callTool(3, "list_concepts", { filter: "kind=capability", limit: 1 }),
    ]);
    const exact = getCallParsed(responses, 2);
    assert.equal(exact.total, 2);
    assert.equal(exact.nodes.length, 2);
    assert.equal(exact.limited, false);

    const truncated = getCallParsed(responses, 3);
    assert.equal(truncated.total, 2);
    assert.equal(truncated.nodes.length, 1);
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

await test("query_ontology match_nodes — hasIncoming:false lists the nodes nothing points to", async () => {
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n", // referenced by 0 — orphan
    },
    {
      slug: "capabilities/orphan-cap",
      content:
        "---\nkind: capability\ntitle: Orphan\ndomain: identity\n---\n", // referenced by used-cap, so not an orphan
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
      callTool(2, "query_ontology", { operation: "match_nodes", hasIncoming: false }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.filters.hasIncoming, false);
    assert.deepEqual(
      result.nodes.map((node) => node.slug).sort(),
      ["capabilities/used-cap", "domains/auth"],
    );
    for (const node of result.nodes) {
      assert.match(node.uid, /^[0-9a-f-]{36}$/, `${node.slug}.uid`);
      assert.equal(node.inDegree, 0, `${node.slug}.inDegree`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept response carries the mtime", async () => {
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

await test("get_concept — an unknown slug returns an error carrying a growthHint", async () => {
  const root = makeVault([
    { slug: "capabilities/login", content: "---\nkind: capability\ntitle: Login\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
    // A tail-substring near miss exists: the did-you-mean branch.
      callTool(2, "get_concept", { slug: "capabilities/log" }),
    // No near miss: the add_concept scaffold branch.
      callTool(3, "get_concept", { slug: "totally-unrelated-thing" }),
    ]);

    assert.equal(isErrorResponse(responses, 2), true);
    const withCandidate = getCallStructured(responses, 2);
    assert.equal(withCandidate.errorCode, "not_found");
    assert.equal(withCandidate.error, "Doc not found: capabilities/log");
    assert.equal(withCandidate.missingSlug, "capabilities/log");
    assert.deepEqual(withCandidate.similarSlugs, ["capabilities/login"]);
    assert.deepEqual(withCandidate.recoveryTools, ["list_concepts"]);
    assert.equal(withCandidate.createTool, "add_concepts");
    assert.ok(withCandidate.growthHint, "expected growthHint on not-found error");
    assert.match(withCandidate.growthHint.reason, /"capabilities\/log" does not resolve/);
    assert.deepEqual(withCandidate.growthHint.exampleCall, {
      tool: "get_concepts",
      args: { slugs: ["capabilities/login"] },
    });

    assert.equal(isErrorResponse(responses, 3), true);
    const withoutCandidate = getCallStructured(responses, 3);
    assert.equal(withoutCandidate.error, "Doc not found: totally-unrelated-thing");
    assert.deepEqual(withoutCandidate.growthHint.exampleCall, {
      tool: "add_concepts",
      args: { concepts: [{ slug: "totally-unrelated-thing", kind: "element", title: "Totally Unrelated Thing" }] },
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — includes graph neighbors and outgoingEdges", async () => {
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

await test("get_concept/get_concepts — read a tail or frontmatter slug alias as the canonical slug", async () => {
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

await test("get_concept/add_relation — an ambiguous alias surfaces as an explicit error", async () => {
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

await test("get_concepts — batch read keeps input order and returns partial results", async () => {
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
    assert.equal(result.concepts.length, 3, "one concepts row per input slug");
    assert.equal(result.concepts[0].slug, "beta");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[0].frontmatter.title, "Beta");
    assert.match(result.concepts[0].excerpt, /body B/);
    assert.equal(typeof result.concepts[0].neighbors, "object");
    assert.deepEqual(result.concepts[0].outgoingEdges, []);
    assert.equal(typeof result.concepts[0].mtime, "number");
    assert.ok(result.concepts[0].mtime > 0);
    assert.equal(result.concepts[1].slug, "missing-slug");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /not found/i);
    assert.equal(result.concepts[1].errorCode, "not_found");
    assert.equal(result.concepts[1].missingSlug, "missing-slug");
    assert.deepEqual(result.concepts[1].similarSlugs, []);
    assert.deepEqual(result.concepts[1].recoveryTools, ["list_concepts"]);
    assert.equal(result.concepts[1].createTool, "add_concepts");
    assert.equal(result.concepts[1].growthHint.exampleCall.tool, "add_concepts");
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
    assert.equal(result.concepts.length, 6, "one concepts row per input slug");
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

await test("get_concepts — empty slugs[] returns empty concepts[], 51 slugs is an error", async () => {
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

    const tooMany = Array.from({ length: 51 }, (_, i) => `s${i}`);
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: tooMany }),
    ]);
    // The error text is checked for the cap message only.
    const text = JSON.stringify(r2.find((r) => r.id === 2));
    assert.match(text, /Too many slugs|50/i);
    assert.equal(getCallStructured(r2, 2)?.errorCode, "invalid_arguments");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — batch write keeps order and returns partial results", async () => {
  const root = makeVault([
    { slug: "exist", content: "---\nkind: capability\ntitle: Exist\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "alpha", kind: "capability", title: "Alpha", domain: "auth" },
          { slug: "exist", kind: "capability", title: "Existing" },
          { slug: "beta", kind: "element", title: "Beta", domain: "auth" },
          { slug: "gamma", kind: "capability" },
        ],
      }),
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.concepts.length, 4, "one concepts row per input");
    assert.equal(result.concepts[0].slug, "alpha");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(typeof result.concepts[0].mtime, "number");
    assert.equal(result.concepts[0].filePath, undefined, "no absolute path leaves the server");
    assert.equal(result.concepts[0].changed, true);
    assert.equal(result.concepts[1].mtime, undefined, "a refused row carries no write metadata");
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
    assert.equal(result.postWriteMaintenance, undefined);
    assert.ok(result.findings.length > 0, "the dangling domain on the written rows is a finding");
    for (const line of result.findings) {
      assert.match(line, /"(alpha|beta)"/, "each finding is about a node this call wrote");
    }
    const list = getCallParsed(responses, 3);
    const slugs = list.nodes.map((n) => n.slug).sort();
    assert.ok(slugs.includes("alpha"), "alpha land");
    assert.ok(slugs.includes("beta"), "beta land");
    assert.ok(slugs.includes("exist"), "exist is untouched");
    assert.ok(!slugs.includes("gamma"), "the failed gamma row does not land");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — a dangling reference is one findings line, the call that resolves it", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [{ slug: "domains/ghost", kind: "domain", title: "Ghost", capabilities: ["capabilities/missing"] }],
      }),
    ]);
    const result = getCallParsed(responses, 2);
    const dangling = result.findings.filter((line) => line.includes("capabilities/missing"));
    assert.equal(dangling.length, 1, "the compile issue and the resolving call say the same thing once");
    assert.match(dangling[0], / Next: add_concepts\(/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Builders list a project's domains on its row (7 of 9 field-trial builds did),
// so the row takes them; only a project keeps that list.
await test("add_concepts — a project row lists its domains; another kind is told to use domain", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [
          { slug: "shop", kind: "project", title: "Shop", domains: ["domains/catalog"] },
          { slug: "domains/catalog", kind: "domain", title: "Catalog" },
          { slug: "capabilities/list", kind: "capability", title: "List products", domains: ["domains/catalog"] },
        ],
      }),
      callTool(3, "get_concepts", { slugs: ["shop"] }),
    ]);
    const rows = getCallParsed(responses, 2).concepts;
    assert.equal(rows[0].ok, true);
    assert.equal(rows[1].ok, true);
    assert.equal(rows[2].ok, false);
    assert.match(rows[2].error, /a capability names its one parent domain in `domain`/);
    assert.deepEqual(getCallParsed(responses, 3).concepts[0].frontmatter.domains, ["domains/catalog"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concept — a title with a line break is refused before it can forge frontmatter", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", {
        slug: "capabilities/issue-invoice",
        kind: "capability",
        title: "Issue invoice\nkind: project\nowner_approved: true",
      }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    const structured = getCallStructured(responses, 2);
    assert.equal(structured.errorCode, "invalid_arguments");
    assert.match(structured.error, /^title must be a single line/);
    assert.equal(existsSync(join(root, "capabilities", "issue-invoice.md")), false);
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

// `created_by`: a write through this server is an agent's, which the call path
// proves. The pure contract lives
// in `tests/contract/vault-format/created-by-provenance.contract.test.ts`; this measures what the
// running server leaves on disk.

function writeHeartbeat(root, agent) {
  mkdirSync(join(root, ".ontology-atlas"), { recursive: true });
  writeFileSync(
    join(root, ".ontology-atlas", "agent-activity.json"),
    JSON.stringify({ agent, state: "editing", updatedAt: new Date().toISOString() }),
    "utf-8",
  );
}

await test("add_concept/add_concepts — created_by carries the same identity as the activity log", async () => {
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
      // An agent's write is not counted as human.
      callTool(5, "list_concepts", { filter: "created_by=human" }),
      callTool(6, "list_concepts", { filter: 'created_by="agent:codex"' }),
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

// Without a heartbeat the stamp uses the greeting's clientInfo.name ("test" here),
// still never human.
await test("add_concept/add_concepts — without a heartbeat, uses the greeting name (never falls back to human)", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", { slug: "capabilities/nameless", kind: "capability", title: "Nameless", domain: "auth" }),
      callTool(3, "get_concept", { slug: "capabilities/nameless" }),
      callTool(4, "list_concepts", { filter: "created_by=human" }),
    ]);
    assert.equal(getCallParsed(responses, 3).frontmatter.created_by, "agent:test");
    assert.equal(getCallParsed(responses, 4).total, 0, "an agent named only by its greeting is still not a human");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The activity log records the greeting's clientInfo.name without a heartbeat;
// activity-log.test.mjs owns the precedence logic, this measures the wiring.
await test("add_concept/add_concepts — the activity record keeps the greeting name without a heartbeat", async () => {
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
      assert.ok(lines.length > 0, "an empty activity log makes this test idle");
      return JSON.parse(lines[lines.length - 1]).agent;
    };
    assert.equal(readLastAgent(noHeartbeat), "test", "the INIT_REQUESTS clientInfo.name must remain");

    await rpc(withHeartbeat, [
      ...INIT_REQUESTS,
      callTool(2, "add_concept", { slug: "capabilities/hello", kind: "capability", title: "Hello", domain: "auth" }),
    ]);
    assert.equal(readLastAgent(withHeartbeat), "codex", "a heartbeat wins over the greeting name");
  } finally {
    rmSync(noHeartbeat, { recursive: true, force: true });
    rmSync(withHeartbeat, { recursive: true, force: true });
  }
});

// A batch-written relation's why must reach the activity log, not only the
// frontmatter.
await test("add_relations — batch relations also leave their reasons in the activity log", async () => {
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
    assert.ok(lines.length > 0, "an empty activity log makes this test idle");
    const last = JSON.parse(lines[lines.length - 1]);
    assert.equal(last.tool, "add_relations");
    assert.ok(last.why, "the batch relation reasons vanished from the log");
    assert.match(last.why, /토큰 검증/, "the first row has no reason");
    assert.match(last.why, /감사 줄/, "the second row has no reason");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relations — a repeated reason is written once", async () => {
  // Ten rows sharing a reason would print it ten times.
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

await test("patch_concept — created_by is preserved and cannot be overwritten", async () => {
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
      // A patch is not authorship: refining a human's node keeps the origin human.
      callTool(2, "patch_concept", { slug: "capabilities/by-hand", frontmatter: { domain: "auth" } }),
      callTool(3, "get_concept", { slug: "capabilities/by-hand" }),
      callTool(4, "patch_concept", { slug: "capabilities/unknown-origin", frontmatter: { domain: "auth" } }),
      callTool(5, "get_concept", { slug: "capabilities/unknown-origin" }),
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

await test("absorb_document — absorbed nodes are also stamped as agent-authored", async () => {
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
        callTool(3, "list_concepts", { filter: 'created_by="agent:codex"' }),
        callTool(4, "list_concepts", { filter: "created_by=human" }),
      ],
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

await test("add_concept/add_concepts — an explicit empty body is not replaced with the default body", async () => {
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

await test("add_concepts — empty concepts[] returns empty results, 51 rows is an error", async () => {
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

// An in-input duplicate gets the row label and first-seen index, clearer than
// "already exists".
await test("add_concepts — the second duplicate slug in one input is ok:false", async () => {
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
    assert.equal(result.concepts[0].ok, true, "the first row lands");
    assert.equal(result.concepts[1].ok, false, "the second row with the same slug fails");
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

// Same title on a different slug lands with an advisory, caught by in-batch
// comparison without loading the vault.
await test("add_concepts — a second row with the same title lands with a near-duplicate warning", async () => {
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
    assert.equal(result.concepts[0].ok, true, "the first row lands");
    assert.ok(
      !(result.concepts[0].warnings ?? []).some((w) => /already exists/i.test(w)),
      "the first row has no duplicate warning",
    );
    assert.equal(result.concepts[1].ok, true, "the second row also lands (advisory, not blocking)");
    assert.ok(
      (result.concepts[1].warnings ?? []).some(
        (w) => /already exists at "alpha"/i.test(w) && /patch_concept/i.test(w),
      ),
      "the second row warns of a near-duplicate normalized title",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — a row titled like a node already in the vault lands with a near-duplicate warning", async () => {
  const root = makeVault([
    { slug: "capabilities/issue-invoice", content: "---\nkind: capability\ntitle: Issue an invoice\ndomain: domains/billing\n---\nIssues an invoice.\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_concepts", {
        concepts: [{ slug: "capabilities/invoice-issuing", kind: "capability", title: "Issue an invoice", domain: "domains/billing" }],
      }),
    ]);
    const [row] = getCallParsed(responses, 2).concepts;
    assert.equal(row.ok, true, "the row lands (advisory, not blocking)");
    assert.ok(
      (row.warnings ?? []).some((w) => /already exists at "capabilities\/issue-invoice"/.test(w) && /patch_concept/.test(w)),
      "the row names the existing node and patch_concept",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_concepts — a non-object row is isolated as a row-level error", async () => {
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

await test("add_concepts — a blank or padded scalar row is isolated as a row-level error", async () => {
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

await test("add_concepts — an unknown row field is isolated as a row-level error", async () => {
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
 * On macOS a wrong-case slug passes `existsSync` while backlink matching is
 * case-sensitive, so destructive tools resolve to the on-disk spelling first.
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
  // A frontmatter `slug:` alias other documents reference must survive a rename.
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
  // capabilities/foo and elements/foo share a tail, so d1's `capabilities: [foo]`
  // could mean either; deleting a candidate without force must be refused.
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

await test("add_relations — batch write keeps row order, sorts canonically and returns partial results", async () => {
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
          // Accumulating on one `from`: each row re-reads the doc.
          { from: "p", to: "c1", type: "contains" },
          { from: "p", to: "c1", type: "contains" },
          { from: "p", to: "missing", type: "contains" },
          { from: "p", to: "c1", type: "weird-type" },
          { from: "p", to: "c1", type: "depend_on" },
        ],
      }),
      callTool(3, "get_concept", { slug: "p" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.relations.length, 6, "one relations row per input");
    assert.equal(result.relations[0].ok, true);
    assert.equal(result.relations[0].to, "c2");
    // `contains` from a project to a capability is stored under the typed key, which the row's type names.
    assert.equal(result.relations[0].type, "capabilities");
    assert.equal(result.relations[0].key, undefined);
    assert.equal(result.mtimes, undefined, "no row passed expected_mtime, so no mtime proves a read");
    assert.equal(result.relations[0].changed, true);
    assert.equal(result.relations[1].ok, true);
    assert.equal(result.relations[1].to, "c1");
    assert.equal(result.relations[2].ok, true);
    assert.equal(result.relations[2].alreadyExists, true);
    assert.equal(result.relations[3].ok, false);
    assert.match(result.relations[3].error, /does not exist|missing/i);
    assert.equal(result.relations[3].errorCode, "not_found");
    assert.equal(result.relations[3].missingSlug, "missing");
    assert.equal(result.relations[3].createTool, "add_concepts");
    assert.deepEqual(result.relations[3].recoveryTools, ["list_concepts"]);
    assert.equal(result.relations[4].ok, false);
    assert.match(result.relations[4].error, /type must be one of/i);
    assert.match(result.relations[4].error, /Received: "weird-type"/i);
    assert.equal(result.relations[4].errorCode, "invalid_arguments");
    assert.equal(result.relations[4].valueName, "type");
    assert.equal(result.relations[4].receivedValue, "weird-type");
    assert.equal(result.relations[5].ok, false);
    assert.match(result.relations[5].error, /type must be one of/i);
    assert.match(result.relations[5].error, /Received: "depend_on"/i);
    assert.match(result.relations[5].error, /Did you mean "depends_on"\?/i);
    assert.equal(result.relations[5].suggestion, "depends_on");
    assert.equal(result.postWriteMaintenance, undefined);
    assert.equal(result.relations[3].changed, undefined, "a refused row carries no write metadata");
    for (const line of result.findings ?? []) {
      assert.match(line, /"p"/, "each finding is about the node this call wrote");
    }
    const p = getCallParsed(responses, 3);
    assert.deepEqual(p.frontmatter.capabilities, ["c1", "c2"]);
    assert.equal(p.frontmatter.contains, undefined);
    assert.equal(p.frontmatter.relation_notes.c2, "P contains the C2 capability.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relations — empty relations[] returns empty results, 51 rows is an error", async () => {
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

await test("add_relations — a non-object row is isolated as a row-level error", async () => {
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

await test("add_relations — a blank or padded scalar row is isolated as a row-level error", async () => {
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

await test("add_relations — an unknown row field is isolated as a row-level error", async () => {
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

await test("validate_vault — a clean vault returns the scanned/problems[]/summary shape", async () => {
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

await test("validate_vault — surfaces both an empty-kind error and a missing-expected-field warning", async () => {
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
    assert.ok(problem, "problem row for a");
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

await test("patch_concept — a stale expected_mtime returns a conflict error response", async () => {
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
      "a stale expected_mtime must be isError:true",
    );
    const text = responses.find((r) => r.id === 2).result.content[0].text;
    assert.match(text, /conflict|VaultConflictError|modified externally/i);
    assert.equal(getCallStructured(responses, 2)?.ok, false);
    assert.equal(getCallStructured(responses, 2)?.errorCode, "vault_conflict");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept patches — one call writes every node and leaves one audit line per node", async () => {
  const root = makeVault([
    { slug: "capabilities/foo", content: "---\nkind: capability\ntitle: Foo\n---\n" },
    { slug: "capabilities/bar", content: "---\nkind: capability\ntitle: Bar\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        patches: [
          { slug: "capabilities/foo", frontmatter: { title: "Foo renamed" } },
          { slug: "capabilities/bar", body: "Replaced body.\n" },
        ],
      }),
    ]);
    const answer = getCallStructured(responses, 2);
    assert.equal(answer.ok, true);
    assert.deepEqual(answer.patches.map((row) => [row.slug, row.ok, row.changed]), [
      ["capabilities/foo", true, true],
      ["capabilities/bar", true, true],
    ]);
    assert.match(readFileSync(join(root, "capabilities/foo.md"), "utf-8"), /title: Foo renamed/);
    assert.match(readFileSync(join(root, "capabilities/bar.md"), "utf-8"), /Replaced body/);
    const entries = readFileSync(join(root, ".ontology-atlas", "activity.jsonl"), "utf-8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(entries.filter((entry) => entry.tool === "patch_concept").map((entry) => entry.target).sort(), ["capabilities/bar", "capabilities/foo"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept patches — a patch that fails puts the earlier nodes back and a mixed call is refused", async () => {
  const root = makeVault([
    { slug: "capabilities/foo", content: "---\nkind: capability\ntitle: Foo\n---\n" },
    { slug: "capabilities/bar", content: "---\nkind: capability\ntitle: Bar\n---\n" },
  ]);
  try {
    const fooBefore = readFileSync(join(root, "capabilities/foo.md"), "utf-8");
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "patch_concept", {
        patches: [
          { slug: "capabilities/foo", frontmatter: { title: "Never kept" } },
          { slug: "capabilities/bar", frontmatter: { title: "Stale" }, expected_mtime: 1 },
        ],
      }),
      callTool(3, "patch_concept", { slug: "capabilities/foo", patches: [{ slug: "capabilities/bar", body: "x" }] }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true);
    assert.match(responses.find((r) => r.id === 2).result.content[0].text, /patches\[1\] \(capabilities\/bar\).*No node was changed/s);
    assert.equal(readFileSync(join(root, "capabilities/foo.md"), "utf-8"), fooBefore);
    assert.equal(isErrorResponse(responses, 3), true);
    assert.match(responses.find((r) => r.id === 3).result.content[0].text, /either `patches` or `slug`/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("patch_concept — a graph array patch is stored as a canonical set", async () => {
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
    assert.equal(typeof patched.mtime, "number");
    assert.equal(patched.filePath, undefined, "no absolute path leaves the server");
    assert.equal(patched.postWriteMaintenance, undefined);
    assert.ok(patched.findings.length > 0, "the domains the patch names do not exist yet");
    for (const line of patched.findings) {
      assert.match(line, /"foo"/, "each finding is about the node this call wrote");
    }
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

await test("patch_concept — a graph array patch accepts only arrays of strings", async () => {
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

await test("patch_concept — validates core scalar frontmatter and body types", async () => {
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

await test("rename_concept dry-run — preview only, no disk change", async () => {
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

await test("rename_concept confirm:true — moves the file and redirects backlinks", async () => {
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

await test("merge_concepts confirm:true — deletes fromSlug and redirects backlinks", async () => {
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

await test("merge_concepts dry-run — preview only, no disk change", async () => {
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

await test("merge_concepts — a survivor expected_into_mtime conflict is also blocked before writing", async () => {
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

await test("delete_concept confirm:true — returns a post-write maintenance summary after deleting", async () => {
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

await test("delete_concept dry-run — backlink preview only, no disk change", async () => {
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

await test("identity destructive previews — rename (slug or kind) and delete expose uid and merge exposes both uids", async () => {
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
      callTool(3, "rename_concept", { oldSlug: "from", newKind: "document" }),
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

await test("list_concepts — counts corrupt documents in vaultWarnings", async () => {
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
    assert.ok(result.vaultWarnings);
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

await test("list_concepts — includes dangling graph references in vaultWarnings", async () => {
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
    assert.ok(result.vaultWarnings);
    assert.equal(result.vaultWarnings.errorCount, 0);
    assert.equal(result.vaultWarnings.warningCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — exposes warnings for a corrupt document", async () => {
  const root = makeVault([
    { slug: "weird", content: "---\nkind: bogus\n---\nbody" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concept", { slug: "weird" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.ok(Array.isArray(result.warnings));
    assert.ok(
      result.warnings.some((w) => w.code === "unknown-kind"),
      "includes the unknown-kind issue",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("get_concept — includes dangling outgoing graph references in warnings", async () => {
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
    ]);

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
      assert.match(text, /list_concepts\(\{mentions:"[^"]+"\}\)/);
      assert.match(text, /add_concepts\(\{concepts:\[\{slug, kind, title\}\]\}\)/);
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
    assert.deepEqual(missingSource.recoveryTools, ["list_concepts"]);
    assert.equal(missingSource.createTool, "add_concepts");
    assert.deepEqual(missingSource.similarSlugs, ["capabilities/mcp-server"]);

    const missingTarget = getCallStructured(responses, 4);
    assert.equal(missingTarget.errorCode, "not_found");
    assert.equal(missingTarget.missingSubject, "Target slug does not exist in vault");
    assert.equal(missingTarget.missingSlug, "missing-new-node");
    assert.deepEqual(missingTarget.recoveryTools, ["list_concepts"]);
    assert.equal(missingTarget.createTool, "add_concepts");
    assert.deepEqual(missingTarget.similarSlugs, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — adding the same edge twice returns alreadyExists:true (idempotent)", async () => {
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
    assert.equal(first.key, undefined);
    assert.equal(first.postWriteMaintenance, undefined);
    assert.equal(second.ok, true);
    assert.equal(second.alreadyExists, true);
    assert.equal(second.changed, false);
    assert.equal(second.findings, undefined, "an edge that already existed wrote nothing to report on");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("add_relation — also deduplicates and sorts an existing relation array", async () => {
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

await test("add_relation — writes graph containment array keys directly", async () => {
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

await test("add_relation — the domain type sets the inline parent domain", async () => {
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

await test("add_relation — stores a tail or frontmatter slug alias as the canonical slug", async () => {
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
    ], { OATLAS_REPO_ROOT: repoRoot });
    const connectionInfo = getCallParsed(responses, 2);
    assert.equal(connectionInfo.vaultRoot, root);
    assert.equal(connectionInfo.repoRoot, repoRoot);
    assert.equal(connectionInfo.vaultResolution, "OATLAS_VAULT");
    assert.equal(connectionInfo.repoResolution, "OATLAS_REPO_ROOT");
    assert.equal(connectionInfo.server.name, "ontology-atlas-mcp");
    assert.equal(connectionInfo.server.readOnly, false);
    assert.equal(connectionInfo.server.toolCount, EXPECTED_TOOLS.length);
    assert.ok(connectionInfo.server.toolNames.includes("list_concepts"));
    assert.ok(connectionInfo.server.toolNames.includes("query_ontology"));
    assert.match(connectionInfo.server.toolsetHash, /^[a-f0-9]{64}$/);
    assert.equal(connectionInfo.restartRequiredForRootChange, true);
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
    const connectionInfo = getCallParsed(responses, 2);
    const validation = getCallParsed(responses, 3);
    assert.equal(connectionInfo.repoRoot, realpathSync(root));
    assert.equal(connectionInfo.repoResolution, "git.rev-parse");
    assert.equal(validation.pathDrift.repoRoot, realpathSync(root));
    assert.equal(validation.pathDrift.drifts.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("connection_info — a read-only server names exactly the advertised toolset", async () => {
  const root = makeVault([]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      callTool(3, "connection_info"),
    ], { OATLAS_READ_ONLY: "1" });
    const listed = responses.find((row) => row.id === 2)?.result?.tools ?? [];
    const connectionInfo = getCallParsed(responses, 3);
    assert.equal(connectionInfo.server.readOnly, true);
    assert.equal(connectionInfo.server.toolCount, EXPECTED_READ_TOOLS.length);
    assert.deepEqual(connectionInfo.server.toolNames, listed.map((tool) => tool.name));
    assert.ok(connectionInfo.server.toolNames.includes("list_concepts"));
    assert.ok(!connectionInfo.server.toolNames.includes("add_concepts"));
    assert.match(connectionInfo.server.toolsetHash, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("construction profile — connection_info and tools/list agree and retain cold-start tools", async () => {
  const root = makeVault();
  try {
    const expected = ['connection_info', 'list_concepts', 'get_concepts',
      'find_backlinks', 'query_ontology', 'read_source',
      'analyze_repo_structure', 'infer_imports', 'add_concepts', 'add_relations',
      'patch_concept', 'validate_vault', 'compile_ontology', 'connect_project_source', 'finalize_project_meaning'];
    for (const readOnly of ['0', '1']) {
      const { responses } = await rpc(root, [...INIT_REQUESTS,
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, callTool(3, 'connection_info'),
        callTool(4, 'add_concepts', { concepts: [{ slug: 'domains/example', kind: 'domain', title: 'Example' }] }),
      ], { OATLAS_TOOL_PROFILE: 'construction', OATLAS_READ_ONLY: readOnly });
      const listed = responses.find((row) => row.id === 2).result.tools;
      const names = expected.filter((name) => readOnly === '0' || EXPECTED_READ_TOOLS.includes(name));
      assert.deepEqual(listed.map((tool) => tool.name).sort(), names.sort());
      const connectionInfo = getCallParsed(responses, 3);
      assert.deepEqual(connectionInfo.server.toolNames, listed.map((tool) => tool.name));
      assert.equal(connectionInfo.server.toolCount, readOnly === '0' ? 15 : 10);
      assert.match(connectionInfo.server.toolsetHash, /^[a-f0-9]{64}$/);
      for (const tool of listed) {
        assert.equal(tool.inputSchema.additionalProperties, false);
        assert.equal(typeof tool.annotations.readOnlyHint, 'boolean');
      }
      const result = responses.find((row) => row.id === 4).result;
      assert.equal(result.isError === true, readOnly === '1');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await test("construction profile — invalid selection refuses startup and full restores every tool", async () => {
  const root = makeVault();
  try {
    for (const profile of ['unexpected', ' ']) {
      await assert.rejects(() => rpc(root, INIT_REQUESTS, { OATLAS_TOOL_PROFILE: profile }), /OATLAS_TOOL_PROFILE/);
    }
    const { responses } = await rpc(root, [...INIT_REQUESTS,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ], { OATLAS_TOOL_PROFILE: 'full', OATLAS_READ_ONLY: '0' });
    assert.deepEqual(responses.find((row) => row.id === 2).result.tools.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await test("construction profile — discovery does not bypass consent for an omitted known write", async () => {
  const root = makeVault();
  try {
    const { responses } = await rpc(root, [...INIT_REQUESTS,
      callTool(2, 'add_concept', { slug: 'domains/example', kind: 'domain', title: 'Example' }),
    ], { OATLAS_TOOL_PROFILE: 'construction', OATLAS_READ_ONLY: '0', OATLAS_WRITE_CONSENT: '1' });
    const result = responses.find((row) => row.id === 2).result;
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.errorCode, 'tool_error');
    assert.match(result.structuredContent.error, /no "elicitation" capability/);
    assert.equal(existsSync(join(root, 'domains/example.md')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
        operation: "node_profile",
        slug: "capabilities/logn",
      }),
    ]);

    assert.equal(isErrorResponse(responses, 2), true);
    const structured = getCallStructured(responses, 2);
    assert.equal(structured.errorCode, "not_found");
    assert.equal(structured.missingSubject, "slug");
    assert.equal(structured.missingSlug, "capabilities/logn");
    assert.deepEqual(structured.similarSlugs, ["capabilities/login"]);
    assert.deepEqual(structured.recoveryTools, ["list_concepts"]);
    assert.equal(structured.createTool, "add_concepts");
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
    ], { OATLAS_REPO_ROOT: repoRoot });
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
    ], { OATLAS_REPO_ROOT: repoRoot });
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
    ], { OATLAS_REPO_ROOT: repoRoot });
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

await test("absorb_document — a failed confirm changes neither the vault nor the source (all-or-nothing)", async () => {
  // A mid-loop failure must not leave a half-absorbed vault whose retry mints
  // -2-suffixed duplicates.
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
    ], { OATLAS_REPO_ROOT: repoRoot });
    assert.equal(isErrorResponse(responses, 2), true, "confirm on a read-only vault must fail");
    const text = responses.find((row) => row.id === 2).result.content[0].text;
    assert.match(text, /rolled back|unchanged/i, `the failure does not say it restored the state: ${text}`);
    chmodSync(vault, 0o755);
    assert.deepEqual(readdirSync(vault), [], "the failed confirm left a node");
    assert.equal(readFileSync(sourcePath, "utf-8"), source, "the failed confirm touched the source");
    assert.equal(existsSync(`${sourcePath}.pre-absorb.bak`), false, "the failed confirm left a backup");
  } finally {
    chmodSync(vault, 0o755);
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("retired names — each cut or folded tool answers tool_retired with the call that replaces it", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\n---\n" },
  ]);
  const expectations = {
    git_status: /your own git: `git -C <repoRoot> status -- <vault>`/,
    git_history: /your own git: `git -C <repoRoot> log -- <vault>`/,
    git_snapshot: /your own git: `git -C <vaultRoot> add -- \. && git -C <vaultRoot> commit -m "<why>" -- \.`, not during a merge or rebase, and never push/,
    list_constellations: /get_constellation with no `id`/,
    find_evidence: /list_concepts\(\{ mentions: "text" \}\)/,
    find_orphans: /query_ontology\(\{ operation: 'match_nodes', hasIncoming: false \}\)/,
    query_concepts: /list_concepts\(\{ filter \}\)/,
    replace_relation: /remove_relation\(\{ from, to, type, replaceWith: \{ to, type, why \}, confirm \}\)/,
    reclassify_concept: /rename_concept\(\{ oldSlug, newKind, domain, body, confirm \}\)/,
  };
  try {
    const names = Object.keys(expectations);
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      ...names.map((name, index) => callTool(index + 2, name, {})),
    ]);
    names.forEach((name, index) => {
      const id = index + 2;
      assert.equal(isErrorResponse(responses, id), true, `${name} must not run`);
      const structured = getCallStructured(responses, id);
      assert.equal(structured.errorCode, "tool_retired", `${name} error code`);
      assert.equal(structured.retiredTool, name);
      assert.match(structured.replacement, expectations[name], `${name} names its replacement`);
      assert.match(getCallText(responses, id), new RegExp(`${name} is retired and no longer runs; use `));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("match_nodes hasIncoming:false answers the orphan question from the files, as find_orphans did", async () => {
  const root = makeVault([
    { slug: "projects/shop", content: "---\nkind: project\ntitle: Shop\ndomains:\n  - domains/billing\n---\n" },
    { slug: "domains/billing", content: "---\nkind: domain\ntitle: Billing\ncapabilities:\n  - capabilities/charge\n---\n" },
    // `ledger` names two nodes: an ambiguous short reference counts for each of them.
    { slug: "capabilities/charge", content: "---\nkind: capability\ntitle: Charge a card\ndomain: domains/billing\nelements:\n  - ledger\n---\n" },
    { slug: "elements/ledger", content: "---\nkind: element\ntitle: Ledger\ndomain: domains/billing\n---\n" },
    // An invalid uid makes the compile fail closed; the orphan question still answers.
    { slug: "elements/archive/ledger", content: "---\nuid: not-a-uid\nkind: element\ntitle: Archived ledger\ndomain: domains/billing\n---\n" },
    { slug: "capabilities/refund", content: "---\nkind: capability\ntitle: Refund a payment\ndomain: domains/billing\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "compile_ontology", {}),
      callTool(3, "query_ontology", { operation: "match_nodes", hasIncoming: false }),
      callTool(4, "query_ontology", { operation: "match_nodes", hasIncoming: false, excludeKinds: [], limit: 1 }),
      callTool(5, "query_ontology", { operation: "match_nodes", hasIncoming: false, excludeKinds: [], limit: 1, offset: 1 }),
    ]);
    assert.equal(isErrorResponse(responses, 2), true, "the invalid uid stops the compile");
    const orphans = getCallStructured(responses, 3);
    assert.equal(orphans.source, "vault_files");
    assert.deepEqual(orphans.nodes.map((node) => node.slug), ["capabilities/refund"]);
    assert.equal(orphans.totalMatches, 1);
    assert.deepEqual(orphans.pagination, { offset: 0, limit: 100, returned: 1, total: 1, hasMore: false, nextOffset: null });
    assert.deepEqual(orphans.filters.excludeKinds, ["project", "vault-readme"]);
    const first = getCallStructured(responses, 4);
    const second = getCallStructured(responses, 5);
    assert.deepEqual([first.pagination.hasMore, first.pagination.nextOffset, first.totalMatches], [true, 1, 2]);
    assert.deepEqual(
      [...first.nodes, ...second.nodes].map((node) => node.slug).sort(),
      ["capabilities/refund", "projects/shop"],
    );
    assert.equal(second.pagination.hasMore, false);
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
    // `contains` is no kind's scaffold list, so its last entry takes the key with it.
    assert.equal(project.frontmatter.contains, undefined);
    assert.equal(project.frontmatter.relation_notes, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/*
 * A removal leaves the bytes creation would have: the key goes with its last
 * entry and `relation_notes` with its last reason; only a kind's scaffold list
 * returns to `[]`. Asserted on the file, since get_concept reads absent and
 * empty alike.
 */
await test("remove_relation with and without replaceWith — an emptied key is deleted, a scaffold list returns to []", async () => {
  const WIKI_PAGES = [
    "---",
    "uid: c9f6fc1b-8321-47ce-bd51-78b1f1c1389f",
    "slug: capabilities/wiki-pages",
    "kind: capability",
    "title: Wiki pages",
    "domain: domains/meaning",
    "elements: [elements/page-contract]",
    "dependencies: [elements/frontmatter-parser]",
    "relates: [capabilities/library]",
    'relation_notes: { elements/frontmatter-parser: "wiki-schema.mjs imports parser.mjs." }',
    "---",
    "",
    "Pages that cite their sources.",
    "",
  ].join("\n");
  const root = makeVault([
    { slug: "capabilities/wiki-pages", content: WIKI_PAGES },
    { slug: "capabilities/library", content: "---\nuid: 4d2f7c1e-5b3a-4c8d-9e0f-1a2b3c4d5e6f\nkind: capability\ntitle: Library\ndomain: domains/meaning\n---\n" },
    { slug: "elements/frontmatter-parser", content: "---\nuid: 5e3a8d2f-6c4b-4d9e-8f1a-2b3c4d5e6f7a\nkind: element\ntitle: Frontmatter parser\ndomain: domains/meaning\n---\n" },
    { slug: "elements/page-contract", content: "---\nuid: 6f4b9e3a-7d5c-4e0f-9a2b-3c4d5e6f7a8b\nkind: element\ntitle: Page contract\ndomain: domains/meaning\n---\n" },
    { slug: "domains/meaning", content: "---\nuid: 7a5c0f4b-8e6d-4f1a-8b3c-4d5e6f7a8b9c\nkind: domain\ntitle: Meaning\n---\n" },
  ]);
  const file = join(root, "capabilities/wiki-pages.md");
  const lines = () => readFileSync(file, "utf8").split("\n");
  try {
    await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "capabilities/wiki-pages", to: "capabilities/library", type: "relates", confirm: true }),
    ]);
    assert.equal(lines().some((line) => line.startsWith("relates:")), false, `relates: stayed behind:\n${lines().join("\n")}`);

    await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "capabilities/wiki-pages", to: "elements/frontmatter-parser", type: "depends_on", confirm: true }),
    ]);
    assert.equal(lines().some((line) => line.startsWith("dependencies:")), false, `dependencies: stayed behind:\n${lines().join("\n")}`);
    assert.equal(lines().some((line) => line.startsWith("relation_notes:")), false, `relation_notes: stayed behind:\n${lines().join("\n")}`);

    await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "capabilities/wiki-pages", to: "elements/page-contract", type: "elements", confirm: true }),
    ]);
    assert.ok(lines().includes("elements: []"), `a capability's scaffold list did not return to []:\n${lines().join("\n")}`);

    writeFileSync(file, WIKI_PAGES);
    await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "capabilities/wiki-pages", to: "capabilities/library", type: "relates", replaceWith: { to: "capabilities/library", type: "depends_on", why: "The library reads the page contract." }, confirm: true }),
    ]);
    assert.equal(lines().some((line) => line.startsWith("relates:")), false, `remove_relation replaceWith left relates: behind:\n${lines().join("\n")}`);
    assert.ok(
      lines().some((line) => line.startsWith("dependencies: [") && line.includes("capabilities/library")),
      `remove_relation replaceWith did not land the new edge:\n${lines().join("\n")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("remove_relation replaceWith — atomically replaces target/type and rationale", async () => {
  const root = makeVault([
    { slug: "project", content: "---\nkind: project\ntitle: Project\ncontains: [domains/auth]\nrelation_notes: { domains/auth: Old reason }\n---\n" },
    { slug: "domains/auth", content: "---\nkind: domain\ntitle: Auth\n---\n" },
    { slug: "domains/identity", content: "---\nkind: domain\ntitle: Identity\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "project", to: "domains/auth", type: "contains", replaceWith: { to: "domains/identity", type: "domains", why: "Canonical ownership" } }),
      callTool(3, "remove_relation", { from: "project", to: "domains/auth", type: "contains", replaceWith: { to: "domains/identity", type: "domains", why: "Canonical ownership" }, confirm: true }),
      callTool(4, "get_concept", { slug: "project" }),
    ]);
    assertDestructivePreview(getCallParsed(responses, 2), {
      canConfirm: true,
      wouldChange: true,
      label: "remove_relation replaceWith preview",
    });
    assert.equal(getCallParsed(responses, 3).changed, true);
    const project = getCallParsed(responses, 4);
    assert.equal(project.frontmatter.contains, undefined);
    assert.deepEqual(project.frontmatter.domains, ["domains/identity"]);
    assert.equal(project.frontmatter.relation_notes["domains/identity"], "Canonical ownership");
    assert.equal(project.frontmatter.relation_notes["domains/auth"], undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("remove_relation replaceWith — converting to depends_on demands a why when none can be inherited", async () => {
  // remove_relation with replaceWith must enforce add_relation's nonblank why on a new
  // depends_on edge.
  const root = makeVault([
    { slug: "capabilities/a", content: "---\nkind: capability\ntitle: A\nrelates: [capabilities/b]\n---\n" },
    { slug: "capabilities/b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "remove_relation", { from: "capabilities/a", to: "capabilities/b", type: "relates", replaceWith: { to: "capabilities/b", type: "depends_on" }, confirm: true }),
      callTool(3, "remove_relation", { from: "capabilities/a", to: "capabilities/b", type: "relates", replaceWith: { to: "capabilities/b", type: "depends_on", why: "Uses b's session store" }, confirm: true }),
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
      callTool(3, "remove_relation", { from: "domains/auth", to: "cap-a", type: "capabilities", replaceWith: { to: "cap-b", type: "capabilities" } }),
      callTool(4, "remove_relation", { from: "domains/auth", to: "cap-a", type: "capabilities", replaceWith: { to: "cap-b", type: "capabilities" }, confirm: true }),
      callTool(5, "get_concept", { slug: "domains/auth" }),
    ]);
    const addExisting = getCallParsed(responses, 2);
    assert.equal(addExisting.alreadyExists, true);
    assert.equal(addExisting.changed, false);
    assertDestructivePreview(getCallParsed(responses, 3), {
      canConfirm: true,
      wouldChange: true,
      label: "remove_relation replaceWith tail-alias preview",
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

await test("rename_concept newKind — kind/slug/domain/body and backlinks move together", async () => {
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
      callTool(2, "rename_concept", { oldSlug: "capabilities/claim", newSlug: "elements/claim-entity", newKind: "element", domain: "domains/review" }),
      callTool(3, "rename_concept", { oldSlug: "capabilities/claim", newSlug: "elements/claim-entity", newKind: "element", domain: "domains/review", confirm: true }),
      callTool(4, "get_concept", { slug: "elements/claim-entity" }),
      callTool(5, "get_concept", { slug: "project" }),
    ]);
    const preview = getCallParsed(responses, 2);
    assertDestructivePreview(preview, {
      canConfirm: true,
      wouldChange: true,
      label: "rename_concept newKind preview",
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

/*
 * A reclassified node's entry follows it into the list for its new kind, or is
 * named in `warnings` when the referrer's kind keeps no such list.
 */
await test("rename_concept newKind — typed list entries follow the new kind, or are named in warnings", async () => {
  const root = makeVault([
    { slug: "domains/workbench", content: "---\nkind: domain\ntitle: Workbench\ncapabilities: [capabilities/memories, capabilities/map]\nelements: [elements/camera]\n---\n" },
    { slug: "capabilities/map", content: "---\nkind: capability\ntitle: Map\ndomain: domains/workbench\n---\n" },
    { slug: "elements/camera", content: "---\nkind: element\ntitle: Camera\ndomain: domains/workbench\n---\n" },
    { slug: "capabilities/memories", content: "---\nslug: capabilities/memories\nkind: capability\ntitle: Memories\ndomain: domains/workbench\n---\n" },
    { slug: "capabilities/recall", content: "---\nkind: capability\ntitle: Recall\ndomain: domains/workbench\nelements: [elements/recall-index]\n---\n" },
    { slug: "elements/recall-index", content: "---\nkind: element\ntitle: Recall index\ndomain: domains/workbench\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", { oldSlug: "capabilities/memories", newSlug: "elements/memories", newKind: "element", domain: "domains/workbench", confirm: true }),
      callTool(3, "rename_concept", { oldSlug: "elements/recall-index", newKind: "capability", domain: "domains/workbench" }),
    ]);
    const moved = getCallParsed(responses, 2);
    assert.equal(moved.changed, true);
    assert.equal(moved.warnings, undefined);
    const workbench = readFileSync(join(root, "domains/workbench.md"), "utf8");
    assert.match(workbench, /capabilities: \[capabilities\/map\]\n/);
    assert.match(workbench, /elements: \[elements\/camera, elements\/memories\]\n/);

    const kept = getCallParsed(responses, 3);
    assert.equal(kept.dryRun, true);
    assert.deepEqual(kept.backlinkUpdates, { updates: [], totalUpdated: 0 });
    assert.equal(kept.warnings.length, 1);
    assert.match(kept.warnings[0], /"capabilities\/recall" still lists "elements\/recall-index" under elements:/);
    assert.match(kept.warnings[0], /remove_relation\(\{from:"capabilities\/recall", to:"elements\/recall-index", type:"elements"\}\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The construction rules put evidence in the body, so the read tools give the
// whole body when asked and say so when they cut.
await test("body delivery — the full body is available and truncation is never silent", async () => {
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
      callTool(6, "list_concepts", { mentions: "App Authoring", summary: true }),
      callTool(7, "list_concepts", { summary: true }),
      callTool(8, "get_concept", { slug: "elements/editor", body: "outline" }),
    ]);

    const excerptRead = getCallParsed(responses, 2);
    assert.equal(excerptRead.excerpt, "워크스페이스 안에서 앱을 만드는 능력.");
    assert.equal(excerptRead.body, undefined);
    assert.equal(excerptRead.bodyInfo.mode, "excerpt");
    assert.equal(excerptRead.bodyInfo.truncated, true);
    assert.ok(excerptRead.bodyInfo.omittedChars > 0);
    assert.match(excerptRead.bodyInfo.hint, /body: "full"/);

    // `full` does not repeat the same text as an excerpt.
    const fullRead = getCallParsed(responses, 3);
    assert.match(fullRead.body, /## 근거/);
    assert.match(fullRead.body, /app\/src\/editor\/index\.ts/);
    assert.match(fullRead.body, /## 확신도/);
    assert.equal(fullRead.excerpt, undefined);
    assert.equal(fullRead.bodyInfo.mode, "full");
    assert.equal(fullRead.bodyInfo.truncated, false);
    assert.equal(fullRead.bodyInfo.hint, undefined);

    const wholeRead = getCallParsed(responses, 4);
    assert.equal(wholeRead.bodyInfo.truncated, false);

    const batch = getCallParsed(responses, 5);
    assert.equal(batch.concepts[0].ok, true);
    assert.match(batch.concepts[0].body, /## 확신도/);
    assert.equal(batch.concepts[0].bodyInfo.mode, "full");

    const evidence = getCallParsed(responses, 6);
    const hit = evidence.nodes.find((m) => m.slug === "capabilities/app-authoring");
    assert.equal(hit.summaryTruncated, true);
    assert.match(evidence.summaryHint, /body: "full"/);

    const listed = getCallParsed(responses, 7);
    const row = listed.nodes.find((n) => n.slug === "capabilities/app-authoring");
    assert.equal(row.summaryTruncated, true);
    assert.match(listed.summaryHint, /body: "full"/);
    const shortRow = listed.nodes.find((n) => n.slug === "elements/editor");
    assert.equal(shortRow.summaryTruncated, undefined);

    // An unknown mode names the allowed values instead of falling back to excerpt.
    assert.match(getCallText(responses, 8), /excerpt, full/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief — the selected project is the whole brief and a retired compact request is refused", async () => {
  const root = makeVault([
    {
      slug: "project-a",
      // The evidence limit sits under `## Uncertainty`, not Excludes,
      // as `epistemic-exclusion` prescribes.
      content: "---\nkind: project\ntitle: Encoding Library\ndomains: [domains/encoding]\n---\n## Definition\n\nA library that writes encoded values.\n\n## Excludes\n\n- Decoding, which a separate library owns.\n\n## Uncertainty\n\n- Behavior not established by the bounded vault.\n",
    },
    {
      slug: "domains/encoding",
      // The brief must report a clean vault, so the fixture must be one.
      content: "---\nkind: domain\ntitle: Encoding\ncapabilities: [capabilities/write-values]\n---\n## Definition\n\nEncoding owns turning in-memory values into the bytes a decoder on another machine can read.\n\n## Includes\n\n- Producing the byte form of every value this library writes\n\n## Excludes\n\n- Parsing bytes back into values, which the decoding side owns\n\n## Uncertainty\n\n- Whether callers outside this repository depend on the byte order was never established\n",
    },
    {
      slug: "capabilities/write-values",
      content: "---\nkind: capability\ntitle: Write DER Values\ndomain: domains/encoding\nelements: [elements/writer]\npath: src/writer.rs\n---\n## Definition\n\nWrite DER Values is the broad ability to produce encoded output a decoder elsewhere accepts.\n\n## Includes\n\n- Emitting the byte form of every supported value\n\n## Excludes\n\n- Choosing which values a caller should send, which the caller decides\n\n## Evidence\n\n- `src/writer.rs`\n\n## Uncertainty\n\nThe bounded vault does not establish optional SET ordering behavior or complete change impact.\n",
    },
    {
      slug: "elements/writer",
      content: "---\nkind: element\ntitle: Writer Implementation\ndomain: domains/encoding\npath: src/writer.rs\n---\n## Definition\n\nWriter Implementation anchors the broad writing ability in one concrete Rust module callers reach.\n\n## Uncertainty\n\nThe concrete SET symbol and focused test path are not recorded.\n",
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
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "query_ontology", { operation: "agent_brief", project: "project-a" }),
      callTool(3, "query_ontology", { operation: "agent_brief", project: "project-a", detail: "compact", task: "Fix DER SET ordering." }),
      callTool(4, "query_ontology", { operation: "agent_brief" }),
      callTool(5, "query_ontology", { operation: "agent_brief", project: "project-a", task: "Task without compact detail" }),
      callTool(6, "query_ontology", { operation: "health", detail: "compact" }),
    ]);

    const full = getCallParsed(responses, 2);
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
    assert.equal(Object.hasOwn(full, "focus"), false, "the brief carries no task navigation");

    for (const id of [3, 5, 6]) {
      assert.equal(isErrorResponse(responses, id), true, `request ${id} is refused`);
      assert.equal(getCallStructured(responses, id)?.errorCode, "invalid_arguments");
      assert.match(getCallStructured(responses, id)?.error ?? "", /detail|task/i);
    }
    assert.equal(isErrorResponse(responses, 4), true);
    assert.match(getCallStructured(responses, 4)?.error ?? "", /project is required when the vault contains multiple project nodes/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("query_ontology agent_brief — a valid 501-node project keeps its full brief", async () => {
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
      callTool(3, "query_ontology", { operation: "agent_brief", project: "large-project" }),
    ]);
    const publicScope = getCallParsed(responses, 2);
    assert.equal(publicScope.nodes.total, 501);
    assert.equal(publicScope.nodes.limited, true);
    assert.equal(publicScope.nodes.rows.length, 500);
    const full = getCallParsed(responses, 3);
    assert.equal(full.graph.nodes, 501);
    assert.equal(full.compiledSummary.nodes, 501);
    assert.equal(full.projectSlug, "large-project");
    assert.equal(full.meaningAssessment.status, "invalid");
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
