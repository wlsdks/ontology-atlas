// MCP 도구 핸들러 통합 test (R11 #20).
//
// verify.mjs 의 spawn + stdio JSON-RPC 패턴을 test framework 에 옮김. tmp
// vault 만들어 server boot → 도구 호출 → response 검증 → cleanup.
//
// 단위 helper test (parser / vault / redirect-backlinks 등) 가 cover 하지
// 않는 *도구 핸들러 자체* 의 input → routing → output 흐름 회귀 차단.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_DESTRUCTIVE_TOOLS,
  EXPECTED_IDEMPOTENT_TOOLS,
  EXPECTED_READ_TOOLS,
  EXPECTED_TOOLS,
  expectedToolTitle,
} from "../scripts/verify.mjs";
import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
} from "./ontology-engine.mjs";
import {
  formatNoTestMatchMessage,
  formatTestFilterSuffix,
  resolveTestNamePattern,
} from "../../scripts/lib/test-name-pattern.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "index.js");

let passed = 0;
let failed = 0;
let skipped = 0;
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
  const root = mkdtempSync(join(tmpdir(), "omot-int-"));
  for (const { slug, content } of seed) {
    const fullPath = join(root, `${slug}.md`);
    // subdir slug ("capabilities/foo") 도 자동 mkdir — fixture writer 가
    // top-level 외에도 자유롭게 디렉터리 구조 표현 가능.
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }
  return root;
}

/**
 * tmp vault 에 server spawn → requests JSON-RPC 로 보내고 모든 응답 수집.
 * 1.5s timeout 후 SIGTERM. 응답 = JSON.parse 가능한 stdout line 들.
 */
function rpc(vaultRoot, requests, timeoutMs = 1500) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn("node", [SERVER_ENTRY], {
      env: { ...process.env, OMOT_VAULT: vaultRoot },
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
  return JSON.parse(getCallText(responses, id));
}

function getCallStructured(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) throw new Error(`no response for id ${id}`);
  if (res.error) throw new Error(`error response: ${JSON.stringify(res.error)}`);
  return res.result?.structuredContent;
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

// R+ — cycle 39: 단일 도구 (get_concept · add_concept · add_relation) 의
// description 이 batch 짝 (get_concepts · add_concepts · add_relations) 을
// 명시 cross-reference. agent 가 tool list 만 보고도 K-round-trip 대안을
// 인지. drift 시 즉시 회귀.
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
    const listConcepts = findTool("list_concepts");
    assert.equal(listConcepts?.outputSchema?.type, "object");
    assert.deepEqual(listConcepts?.outputSchema?.required, ["total", "vaultRoot", "nodes"]);
    assert.equal(listConcepts?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(listConcepts?.outputSchema?.properties?.vaultRoot?.type, "string");
    assert.equal(listConcepts?.outputSchema?.properties?.nodes?.items?.properties?.mtime?.type, "number");
    assert.deepEqual(listConcepts?.outputSchema?.properties?.vaultWarnings?.required, ["errorCount", "warningCount"]);
    const getConceptTool = findTool("get_concept");
    assert.equal(getConceptTool?.outputSchema?.type, "object");
    assert.deepEqual(getConceptTool?.outputSchema?.required, ["slug", "frontmatter", "excerpt", "neighbors", "outgoingEdges", "mtime"]);
    assert.equal(getConceptTool?.outputSchema?.properties?.frontmatter?.type, "object");
    assert.deepEqual(getConceptTool?.outputSchema?.properties?.neighbors?.required, ["domains", "domain", "capabilities", "elements", "dependencies", "relates", "contains", "describes"]);
    assert.equal(getConceptTool?.outputSchema?.properties?.outgoingEdges?.items?.properties?.via?.type, "string");
    assert.equal(getConceptTool?.outputSchema?.properties?.mtime?.type, "number");
    const getConceptsTool = findTool("get_concepts");
    assert.equal(getConceptsTool?.outputSchema?.type, "object");
    assert.deepEqual(getConceptsTool?.outputSchema?.required, ["concepts"]);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.type, "array");
    assert.deepEqual(getConceptsTool?.outputSchema?.properties?.concepts?.items?.required, ["ok", "slug"]);
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.ok?.type, "boolean");
    assert.equal(getConceptsTool?.outputSchema?.properties?.concepts?.items?.properties?.mtime?.type, "number");
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
    assert.equal(findEvidence?.outputSchema?.properties?.matches?.type, "array");
    assert.deepEqual(findEvidence?.outputSchema?.properties?.matches?.items?.required, ["slug", "kind", "title", "mtime", "matchedIn", "excerpt"]);
    assert.deepEqual(findEvidence?.outputSchema?.properties?.matches?.items?.properties?.matchedIn?.enum, ["frontmatter", "body"]);
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
    assert.equal(findBacklinks?.outputSchema?.properties?.total?.type, "integer");
    assert.deepEqual(findBacklinks?.outputSchema?.properties?.matches?.items?.required, ["slug", "kind", "title", "mtime"]);
    assert.equal(findBacklinks?.outputSchema?.properties?.matches?.items?.properties?.matchedKeys?.items?.type, "string");
    const findNeighbors = findTool("find_neighbors");
    assert.equal(findNeighbors?.outputSchema?.type, "object");
    assert.deepEqual(findNeighbors?.outputSchema?.required, ["center", "requested", "direction", "totalEdges", "limited", "edges"]);
    assert.deepEqual(findNeighbors?.outputSchema?.properties?.direction?.enum, ["outgoing", "incoming", "both"]);
    assert.equal(findNeighbors?.outputSchema?.properties?.totalEdges?.type, "integer");
    assert.deepEqual(findNeighbors?.outputSchema?.properties?.edges?.items?.required, ["direction", "from", "to", "via", "ref", "resolved"]);
    assert.deepEqual(findNeighbors?.outputSchema?.properties?.nodes?.items?.required, ["slug", "kind", "title", "mtime"]);
    const findPath = findTool("find_path");
    assert.equal(findPath?.outputSchema?.type, "object");
    assert.deepEqual(findPath?.outputSchema?.required, ["from", "to", "found"]);
    assert.equal(findPath?.outputSchema?.properties?.found?.type, "boolean");
    assert.equal(findPath?.outputSchema?.properties?.hopCount?.type, "integer");
    assert.equal(findPath?.outputSchema?.properties?.hops?.items?.type, "string");
    assert.deepEqual(findPath?.outputSchema?.properties?.edges?.items?.required, ["from", "to", "via"]);
    const findOrphans = findTool("find_orphans");
    assert.equal(findOrphans?.outputSchema?.type, "object");
    assert.deepEqual(findOrphans?.outputSchema?.required, ["total", "orphans"]);
    assert.equal(findOrphans?.outputSchema?.properties?.total?.type, "integer");
    assert.deepEqual(findOrphans?.outputSchema?.properties?.orphans?.items?.required, ["slug", "kind", "title", "mtime"]);
    assert.equal(findOrphans?.outputSchema?.properties?.orphans?.items?.properties?.mtime?.type, "number");
    const queryConcepts = findTool("query_concepts");
    assert.equal(queryConcepts?.outputSchema?.type, "object");
    assert.deepEqual(queryConcepts?.outputSchema?.required, ["filter", "parsedAs", "total", "matches", "limited"]);
    assert.equal(queryConcepts?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(queryConcepts?.outputSchema?.properties?.limited?.type, "boolean");
    assert.deepEqual(queryConcepts?.outputSchema?.properties?.matches?.items?.required, ["slug", "kind", "title", "mtime"]);
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
    assert.equal(compileOntology?.outputSchema?.properties?.graphHash?.type, "string");
    assert.equal(compileOntology?.outputSchema?.properties?.nodeCount?.type, "integer");
    assert.equal(compileOntology?.outputSchema?.properties?.byKind?.additionalProperties?.type, "integer");
    const analyzeRepo = findTool("analyze_repo_structure");
    assert.equal(analyzeRepo?.outputSchema?.type, "object");
    assert.deepEqual(analyzeRepo?.outputSchema?.required, ["rootPath", "framework", "domains", "capabilities", "elements", "suggestedRelations", "skipped"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.framework?.enum, ["fsd", "next", "generic"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.capabilities?.items?.required, ["slug", "title", "evidence"]);
    assert.deepEqual(analyzeRepo?.outputSchema?.properties?.suggestedRelations?.items?.required, ["from", "to", "type"]);
    const inferImports = findTool("infer_imports");
    assert.equal(inferImports?.outputSchema?.type, "object");
    assert.deepEqual(inferImports?.outputSchema?.required, ["rootPath", "filesScanned", "edges", "externalImports", "unresolved", "moduleEdges"]);
    assert.equal(inferImports?.outputSchema?.properties?.filesScanned?.type, "integer");
    assert.deepEqual(inferImports?.outputSchema?.properties?.edges?.items?.required, ["from", "to", "kind"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.edges?.items?.properties?.kind?.enum, ["static", "dynamic", "require", "reexport", "side"]);
    assert.deepEqual(inferImports?.outputSchema?.properties?.moduleEdges?.items?.required, ["from", "to", "count"]);
    assert.equal(inferImports?.outputSchema?.properties?.moduleEdges?.items?.properties?.count?.minimum, 1);
    assert.match(inferImports?.description ?? "", /common @\/\* aliases/);
    assert.match(inferImports?.description ?? "", /resolved to src\/ · lib\/ · app\//);
    assert.match(inferImports?.description ?? "", /alias-not-found/);
    assert.doesNotMatch(inferImports?.description ?? "", /aliases \(@\/\) → external \(not resolved\)/);
    const listKinds = findTool("list_kinds");
    assert.equal(listKinds?.outputSchema?.type, "object");
    assert.deepEqual(listKinds?.outputSchema?.required, ["total", "byKind"]);
    assert.equal(listKinds?.outputSchema?.properties?.total?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.total?.minimum, 0);
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.type, "object");
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.additionalProperties?.type, "integer");
    assert.equal(listKinds?.outputSchema?.properties?.byKind?.additionalProperties?.minimum, 0);
    const validateVault = findTool("validate_vault");
    assert.equal(validateVault?.outputSchema?.type, "object");
    assert.deepEqual(validateVault?.outputSchema?.required, ["scanned", "problems", "summary"]);
    assert.equal(validateVault?.outputSchema?.properties?.scanned?.type, "integer");
    assert.equal(validateVault?.outputSchema?.properties?.problems?.type, "array");
    assert.equal(validateVault?.outputSchema?.properties?.summary?.properties?.byCode?.additionalProperties?.properties?.files?.items?.type, "string");
    const addConcepts = findTool("add_concepts");
    assert.equal(addConcepts?.outputSchema?.type, "object");
    assert.deepEqual(addConcepts?.outputSchema?.required, ["concepts"]);
    assert.deepEqual(addConcepts?.outputSchema?.properties?.concepts?.items?.required, ["slug", "ok"]);
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.ok?.type, "boolean");
    assert.equal(addConcepts?.outputSchema?.properties?.concepts?.items?.properties?.warnings?.items?.type, "string");
    assert.equal(addConcepts?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const addConcept = findTool("add_concept");
    assert.equal(addConcept?.outputSchema?.type, "object");
    assert.deepEqual(addConcept?.outputSchema?.required, ["ok", "slug", "filePath", "changed"]);
    assert.equal(addConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(addConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.filePath?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(addConcept?.outputSchema?.properties?.warnings?.items?.type, "string");
    assert.equal(addConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const addRelations = findTool("add_relations");
    assert.equal(addRelations?.outputSchema?.type, "object");
    assert.deepEqual(addRelations?.outputSchema?.required, ["relations"]);
    assert.deepEqual(addRelations?.outputSchema?.properties?.relations?.items?.required, ["ok", "from", "to", "type"]);
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.ok?.type, "boolean");
    assert.equal(addRelations?.outputSchema?.properties?.relations?.items?.properties?.alreadyExists?.type, "boolean");
    assert.equal(addRelations?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const addRelation = findTool("add_relation");
    assert.equal(addRelation?.outputSchema?.type, "object");
    assert.deepEqual(addRelation?.outputSchema?.required, ["ok", "from", "to", "type"]);
    assert.equal(addRelation?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(addRelation?.outputSchema?.properties?.from?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.to?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.type?.type, "string");
    assert.equal(addRelation?.outputSchema?.properties?.alreadyExists?.type, "boolean");
    assert.equal(addRelation?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const patchConcept = findTool("patch_concept");
    assert.equal(patchConcept?.outputSchema?.type, "object");
    assert.deepEqual(patchConcept?.outputSchema?.required, ["ok", "slug", "filePath", "changed", "postWriteMaintenance"]);
    assert.equal(patchConcept?.outputSchema?.properties?.ok?.type, "boolean");
    assert.equal(patchConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(patchConcept?.outputSchema?.properties?.filePath?.type, "string");
    assert.equal(patchConcept?.outputSchema?.properties?.changed?.type, "boolean");
    assert.equal(patchConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const renameConcept = findTool("rename_concept");
    assert.equal(renameConcept?.outputSchema?.type, "object");
    assert.deepEqual(renameConcept?.outputSchema?.required, ["ok", "oldSlug", "newSlug", "sourcePath", "targetPath", "moved", "backlinkUpdates"]);
    assert.equal(renameConcept?.outputSchema?.properties?.oldSlug?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.newSlug?.type, "string");
    assert.equal(renameConcept?.outputSchema?.properties?.moved?.type, "boolean");
    assert.equal(renameConcept?.outputSchema?.properties?.backlinkUpdates?.type, "object");
    assert.equal(renameConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const mergeConcepts = findTool("merge_concepts");
    assert.equal(mergeConcepts?.outputSchema?.type, "object");
    assert.deepEqual(mergeConcepts?.outputSchema?.required, ["ok", "fromSlug", "intoSlug", "fromPath", "deleted", "backlinkUpdates", "capturedFrom"]);
    assert.equal(mergeConcepts?.outputSchema?.properties?.fromSlug?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.intoSlug?.type, "string");
    assert.equal(mergeConcepts?.outputSchema?.properties?.deleted?.type, "boolean");
    assert.equal(mergeConcepts?.outputSchema?.properties?.capturedFrom?.type, "object");
    assert.equal(mergeConcepts?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const deleteConcept = findTool("delete_concept");
    assert.equal(deleteConcept?.outputSchema?.type, "object");
    assert.deepEqual(deleteConcept?.outputSchema?.required, ["ok", "slug", "filePath"]);
    assert.equal(deleteConcept?.outputSchema?.properties?.slug?.type, "string");
    assert.equal(deleteConcept?.outputSchema?.properties?.filePath?.type, "string");
    assert.equal(deleteConcept?.outputSchema?.properties?.backlinks?.items?.type, "object");
    assert.equal(deleteConcept?.outputSchema?.properties?.backlinksAtDelete?.items?.type, "object");
    assert.equal(deleteConcept?.outputSchema?.properties?.captured?.type, "object");
    assert.equal(deleteConcept?.outputSchema?.properties?.postWriteMaintenance?.type, "object");
    const findDesc = (name) => findTool(name)?.description;
    const getC = findDesc("get_concept");
    const getCs = findDesc("get_concepts");
    const findN = findDesc("find_neighbors");
    const compile = findDesc("compile_ontology");
    const query = findDesc("query_ontology");
    const validate = findDesc("validate_vault");
    const addC = findDesc("add_concept");
    const addR = findDesc("add_relation");
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
    assert.ok(addR && /add_relations/.test(addR), "add_relation → add_relations hint");
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
      assert.match(description, /next action pointers|nextExecutableAction/, `${toolName} describes next action pointers`);
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
          "components/communities/health/workspace_brief only: positive integer max node summaries per component/community group. Defaults to 25 for components/communities and 10 for health, capped at 500.",
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
        componentTypesItem:
          findTool("query_ontology")?.inputSchema?.properties?.componentTypes?.items?.type,
        phasesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.phases?.items?.enum,
        severitiesEnum:
          findTool("query_ontology")?.inputSchema?.properties?.severities?.items?.enum,
        maintenanceKindsEnum:
          findTool("query_ontology")?.inputSchema?.properties?.kinds?.items?.enum,
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
        componentTypesItem: "string",
        phasesEnum: MAINTENANCE_PHASE_VALUES,
        severitiesEnum: MAINTENANCE_SEVERITY_VALUES,
        maintenanceKindsEnum: MAINTENANCE_KIND_VALUES,
        afterActionIdDescription:
          "maintenance_plan only: stable action id cursor; return actions after this id. Without afterActionId the ready page reports cursor.found=true and cursor.reason=null; cursor.nextAfterActionId matches the last returned action id (or null for an empty page), and cursor.hasMore matches whether more remaining actions exist after this page. nextExecutableAction/nextReviewAction point only at the first executable/review action in the returned page and preserve that action id, executable flag, phase, kind, and severity. Bucket totals (byPhase, bySeverity, byKind) match remainingActions for the returned cursor. Unknown cursors return an empty page with cursor.found=false, cursor.reason, zero remaining actions, cursor.nextAfterActionId=null, cursor.hasMore=false, and no next actions.",
        componentTypesDescription:
          "health/workspace_brief only: relation types used for connected-component checks. Defaults to the full graph relation set.",
      },
      "query_ontology exposes health/workspace_brief tuning controls",
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
  // initialize 응답에 instructions 가 있어야 연결된 agent (Claude Code 등) 가
  // kind 계층 / 호출 순서 / write 도구 dry-run 패턴을 즉시 인지. 누락 시
  // agent 는 매 세션 시행착오로 학습 — 명시 가드.
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
    // 핵심 키워드 — drift 시 즉시 깨짐
    assert.match(instructions, /kind hierarchy/i);
    assert.match(instructions, /dry-run|confirm/i);
    assert.match(instructions, /expected_mtime/i);
    assert.match(instructions, /overwrite: true/);
    assert.match(instructions, /existing `newSlug`/);
    assert.match(instructions, /force: true/);
    assert.match(instructions, /dangling referrers/);
    for (const toolName of EXPECTED_TOOLS) {
      assert.match(instructions, new RegExp(`\\b${toolName}\\b`), `instructions mention ${toolName}`);
    }
    // R+ — cycle 36: batch tools 가 기본 path 임을 instructions 가 안내해야.
    // agent 가 per-row K-round-trip 패턴 대신 batch 1-call 을 default 로
    // 사용하도록 stale 안내 회귀 차단.
    assert.match(instructions, /add_concepts/);
    assert.match(instructions, /add_relations/);
    assert.match(instructions, /non-object row/);
    assert.match(instructions, /unknown row field/);
    assert.match(instructions, /ok: false/);
    assert.match(instructions, /get_concepts/);
    assert.match(instructions, /find_neighbors/);
    assert.match(instructions, /compile_ontology/);
    assert.match(instructions, /query_ontology/);
    assert.match(instructions, /validate_vault/);
    assert.match(instructions, /read-only first-contact diagnosis/);
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
    assert.equal(isErrorResponse(responses, 7), true);
    assert.match(getCallText(responses, 7), /Unknown argument "limit" for list_kinds/i);
    assert.doesNotMatch(getCallText(responses, 7), /Did you mean/i);
    assert.equal(isErrorResponse(responses, 8), true);
    assert.match(getCallText(responses, 8), /Unknown arguments for list_concepts/i);
    assert.match(getCallText(responses, 8), /"lmit" \(did you mean "limit"\?\)/i);
    assert.match(getCallText(responses, 8), /"summry" \(did you mean "summary"\?\)/i);
    assert.match(getCallText(responses, 8), /Allowed arguments: domain, kind, limit, since, summary/i);
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
    assert.equal(result.version, 1);
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
    assert.ok(result.issues.some((issue) => issue.code === "dangling-graph-reference"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("analyze_repo_structure — bootstrap candidates expose structuredContent", async () => {
  const vaultRoot = makeVault();
  const repoRoot = mkdtempSync(join(tmpdir(), "omot-analyze-"));
  try {
    writeFileSync(
      join(repoRoot, "package.json"),
      JSON.stringify({ name: "sample-app", description: "Sample App" }, null, 2),
      "utf-8",
    );
    writeFileSync(repoRoot + "/README.md", "# Sample App\n\n## Auth\n\nLogin flows.\n", "utf-8");
    mkdirSync(join(repoRoot, "src", "features", "auth"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "features", "auth", "index.ts"), "export const auth = true;\n", "utf-8");

    const { responses } = await rpc(vaultRoot, [
      ...INIT_REQUESTS,
      callTool(2, "analyze_repo_structure", { rootPath: repoRoot }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.framework, "fsd");
    assert.deepEqual(result.project, { slug: "sample-app", title: "Sample App" });
    assert.ok(result.domains.some((domain) => domain.slug === "domains/auth"));
    assert.ok(result.capabilities.some((capability) => capability.slug === "capabilities/auth"));
    assert.ok(result.suggestedRelations.some((relation) => relation.from === "sample-app" && relation.to === "capabilities/auth" && relation.type === "contains"));
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("infer_imports — import graph exposes structuredContent", async () => {
  const vaultRoot = makeVault();
  const repoRoot = mkdtempSync(join(tmpdir(), "omot-infer-"));
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
        'export const auth = user;',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(join(repoRoot, "src", "entities", "user", "index.ts"), "export const user = true;\n", "utf-8");
    writeFileSync(join(repoRoot, "src", "shared", "api", "client.ts"), "export const client = true;\n", "utf-8");

    const { responses } = await rpc(vaultRoot, [
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
    assert.ok(result.moduleEdges.some((edge) => edge.from === "capabilities/auth" && edge.to === "capabilities/user" && edge.count >= 1));
    assert.ok(result.moduleEdges.some((edge) => edge.from === "capabilities/auth" && edge.to === "elements/src/shared/api/client" && edge.count >= 1));
  } finally {
    rmSync(vaultRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

await test("query_ontology — compiled graph engine neighbors/path/all_paths/query_plan/centrality/communities/similar_nodes/explain_relation/reachability/pattern_walk/impact/blast_radius/subgraph/overview/schema/facets/match_nodes/match_edges/node_profile/domain_profile/domain_matrix/project_scope/project_map/relation_check/components/lineage/containment_tree/cycles/topological_order/recommend_relations/growth_plan/maintenance_plan/workspace_brief/health", async () => {
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
        { slug: "project", distance: 1 },
        { slug: "capabilities/session", distance: 2 },
      ],
    );

    const blastRadius = getCallParsed(responses, 9);
    assert.equal(blastRadius.operation, "blast_radius");
    assert.equal(blastRadius.center, "domains/auth");
    assert.equal(blastRadius.risk, "medium");
    assert.deepEqual(blastRadius.summary, {
      affectedNodes: 3,
      affectedEdges: 4,
      affectedKinds: 2,
      affectedDomains: 1,
      crossDomainEdges: 0,
    });
    assert.deepEqual(blastRadius.byKind, { capability: 2, project: 1 });
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
    assert.equal(domainMatrix.summary.domains, 1);
    assert.equal(domainMatrix.summary.crossDomainEdges, 0);
    assert.equal(domainMatrix.summary.externalEdges, 1);

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
    assert.equal(relationCheck.schemaPattern.toKind, "domain");

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

await test("list_concepts — domain 필터 (R+)", async () => {
  // "all capabilities under auth" 같은 흔한 query 를 query_concepts DSL 없이
  // 한 호출로. capability/element kind 만 의미 있지만 모든 kind 에 일관 적용.
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
    // domain=auth 만 — capability 2 + element 1 = 3 (domain 자체는 domain: 없음)
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

    // 매칭 없는 domain → 빈 결과 (throw 없이)
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
  // agent 가 find_evidence 한 호출로 *어떤 doc 이 reference 하는지* + *그 doc
  // 이 무슨 내용인지* 둘 다 받음. 추가 get_concept 없이.
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
      assert.equal(typeof m.excerpt, "string");
      // markdown table syntax / # heading 은 안 들어가야
      assert.doesNotMatch(m.excerpt, /^#/);
      assert.doesNotMatch(m.excerpt, /^\|/);
    }
    // domains/billing 매치는 첫 prose 단락 ("결제 도메인 — auth 와 함께...")
    const billing = result.matches.find((m) => m.slug === "domains/billing");
    if (billing) {
      assert.match(billing.excerpt, /결제 도메인/);
    }
    // R+ — read tool 5종 응답 shape 일관성: domain + mtime 동봉
    for (const m of result.matches) {
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("list_concepts — summary opt-in (R+) — 각 노드에 prose 요약", async () => {
  // agent 가 한 호출로 "vault 노드 list + 무슨 내용인지" 모두 받음. 후속
  // get_concept N 회 안 함. summary:false (default) 일 때는 응답에 안 들어감.
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
    // default: summary 없음
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    for (const node of out1.nodes) {
      assert.equal(node.summary, undefined, "default 에선 summary 안 들어감");
    }

    // summary:true → 모든 노드에 prose 요약
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { summary: true }),
    ]);
    const out2 = getCallParsed(r2, 2);
    for (const node of out2.nodes) {
      assert.equal(typeof node.summary, "string", `${node.slug}.summary 가 string`);
      // markdown heading / table syntax 안 들어가야 (prose 만)
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
  // agent 가 이전 list 응답에서 캡처한 max mtime 을 since 로 패스 → vault 의
  // *바뀐 것만* 전송. strict mtime > since 로 같은 max 재전송해도 double-fetch 0.
  const root = makeVault([
    { slug: "old", content: "---\nkind: capability\ntitle: Old\n---\n" },
    { slug: "newer", content: "---\nkind: capability\ntitle: Newer\n---\n" },
  ]);
  try {
    // 1차: 전체 list — 두 노드의 mtime 캡처
    const { responses: r1 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts"),
    ]);
    const out1 = getCallParsed(r1, 2);
    assert.equal(out1.total, 2);
    const maxMtime = Math.max(...out1.nodes.map((n) => n.mtime));

    // 2차: since=maxMtime — strict > 라 0건 (모두 stale)
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "list_concepts", { since: maxMtime }),
    ]);
    const out2 = getCallParsed(r2, 2);
    assert.equal(out2.total, 0, "since=max → 0건 (재전송 방지)");

    // 3차: since=maxMtime - 1 — 1건 이상 (가장 최근 노드)
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
  // get_concept 의 mtime 과 같은 의미. agent 가 list 한 호출로 "어느 노드가
  // 최근에 변경됐나" 파악 가능 — 후속 get_concept 없이 sort/filter.
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
  // agent 가 backlinks 받자마자 "어느 도메인 / 언제 변경" 파악. list_concepts
  // 와 동일 shape — 같은 mental model 의 두 view 가 일관 필드 노출.
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
    assert.deepEqual(found.edges, [
      { from: "capabilities/login", to: "elements/token", via: "dependencies" },
    ]);

    const missing = getCallParsed(responses, 3);
    assert.deepEqual(getCallStructured(responses, 3), missing);
    assert.deepEqual(missing, {
      from: "login",
      to: "missing-node",
      found: false,
      reason: "경로 없음 (또는 maxHops 초과)",
    });
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
    ]);
    for (const id of [
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
      38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
      55, 56, 57, 58, 59, 60, 61, 62,
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
    assert.match(responses.find((r) => r.id === 55).result.content[0].text, /Did you mean "overview"\?/i);
    assert.match(responses.find((r) => r.id === 56).result.content[0].text, /Did you mean "incoming"\?/i);
    assert.match(responses.find((r) => r.id === 57).result.content[0].text, /componentLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 58).result.content[0].text, /dependencyTypes items must not have leading or trailing whitespace/i);
    assert.match(responses.find((r) => r.id === 59).result.content[0].text, /componentLimit must be <= 500/i);
    assert.match(responses.find((r) => r.id === 60).result.content[0].text, /phases items must be one of: validate, repair, link, materialize, review/i);
    assert.match(responses.find((r) => r.id === 61).result.content[0].text, /severities items must be one of: fail, warn, info/i);
    assert.match(responses.find((r) => r.id === 62).result.content[0].text, /kinds items must be one of: inspect_compile_issue, break_dependency_cycle, canonicalize_graph_arrays, resolve_dangling_reference, add_missing_relation, materialize_external_element, unassigned_node, empty_domain/i);
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
  // list_concepts / find_backlinks / find_orphans 와 동일 shape — read tool
  // 응답 일관성. agent 가 DSL query 결과를 sort/filter 추가 호출 없이 처리.
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
      assert.equal(typeof m.mtime, "number", `${m.slug}.mtime number`);
      assert.ok(m.mtime > 0);
    }
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
  // list_concepts / find_backlinks 와 동일 shape. agent 가 orphans 받자마자
  // sort/filter 가능 — 후속 get_concept 없이.
  const root = makeVault([
    {
      slug: "domains/auth",
      content: "---\nkind: domain\ntitle: Auth\n---\n", // referenced by 0 — orphan
    },
    {
      slug: "capabilities/orphan-cap",
      content:
        "---\nkind: capability\ntitle: Orphan\ndomain: identity\n---\n", // 어느 곳도 reference 안 함 → orphan
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
    // domains/auth + used-cap (어느 곳도 used-cap 을 reference 안 함) — 둘 다 orphan
    assert.ok(result.total >= 1);
    for (const o of result.orphans) {
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

// R+ — get_concepts 배치 reader. K개 slug → 1 round trip. 입력 순서 보존,
// missing slug 는 batch 를 abort 하지 않고 { ok: false, error } 행으로 surface.
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
    // 순서 보존: 입력 [beta, missing, alpha] → 출력 같은 순서.
    assert.equal(result.concepts[0].slug, "beta");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[0].frontmatter.title, "Beta");
    assert.equal(typeof result.concepts[0].mtime, "number");
    assert.ok(result.concepts[0].mtime > 0);
    // missing slug → ok:false, error message, batch 살아남음.
    assert.equal(result.concepts[1].slug, "missing-slug");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /not found/i);
    // 그 다음 valid 한 slug 는 정상 처리.
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

// R+ — get_concepts 빈 배열 / cap (50) 가드. 정상 빈 응답 vs error.
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

    // 51개 → error response (batch 호출 자체가 throw, MCP 가 error 직렬화).
    const tooMany = Array.from({ length: 51 }, (_, i) => `s${i}`);
    const { responses: r2 } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "get_concepts", { slugs: tooMany }),
    ]);
    // server 는 throw → MCP 응답에 isError content 또는 error 필드. text 안에
    // 우리 cap 메시지 ("Too many slugs") 가 있는지로만 검증.
    const text = JSON.stringify(r2.find((r) => r.id === 2));
    assert.match(text, /Too many slugs|50/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — add_concepts 배치 writer. /ontology-bootstrap 흐름이 여러 노드를 한
// 호출에 land. 입력 순서 보존, partial result (한 row 의 실패가 batch 를
// abort 하지 않음).
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
      // batch 후 list 로 land 된 row 검증
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.concepts.length, 4, "concepts row 수 = 입력 길이");
    // 순서 보존: alpha → exist (fail) → beta → gamma (fail)
    assert.equal(result.concepts[0].slug, "alpha");
    assert.equal(result.concepts[0].ok, true);
    assert.equal(result.concepts[1].slug, "exist");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /already exists|exist/i);
    assert.equal(result.concepts[2].slug, "beta");
    assert.equal(result.concepts[2].ok, true);
    assert.equal(result.concepts[3].slug, "gamma");
    assert.equal(result.concepts[3].ok, false);
    assert.match(result.concepts[3].error, /required|title/i);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "batch concept postWriteMaintenance");
    assert.equal(result.concepts[0].postWriteMaintenance, undefined);
    // list 응답에 alpha + beta 가 추가됨, gamma 는 안 됨.
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

// R+ — add_concepts 빈 배열 / cap (50) 가드. get_concepts/add_relations 와
// 같은 batch 계약을 writer 쪽에도 명시 고정한다.
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — add_concepts 입력 내 중복 slug 사전 감지. 두번째 동일 slug row 는
// "이미 존재" 가 아닌 "duplicate slug in input batch" 로 더 명확한 에러.
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
    assert.match(result.concepts[1].error, /duplicate slug in input batch/i);
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
        ],
      }),
      callTool(3, "list_concepts"),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.concepts[0].ok, true, "valid row still lands");
    assert.equal(result.concepts[1].ok, false);
    assert.match(result.concepts[1].error, /Unknown field "titel" in concepts\[1\]/i);
    const list = getCallParsed(responses, 3);
    assert.deepEqual(list.nodes.map((node) => node.slug), ["ok"]);
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

// R+ — add_relations 배치 writer. analyze_repo_structure (suggestedRelations)
// / infer_imports (moduleEdges) 출력을 한 호출에 land. 결과 row 는 입력 순서 보존,
// frontmatter relation 배열은 canonical sort, idempotent (같은 edge 두번 →
// 두번째는 alreadyExists), missing slug 은 row-level fail.
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
          { from: "p", to: "c2", type: "contains" },
          // 같은 from 으로 누적 — readDoc 이 매번 다시 읽어 누락 없음
          { from: "p", to: "c1", type: "contains" },
          // idempotent — 같은 edge 두번
          { from: "p", to: "c1", type: "contains" },
          // missing target → ok:false
          { from: "p", to: "missing", type: "contains" },
          // unknown type → ok:false
          { from: "p", to: "c1", type: "weird-type" },
        ],
      }),
      callTool(3, "get_concept", { slug: "p" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.relations.length, 5, "relations row 수 = 입력 길이");
    // 순서 보존
    assert.equal(result.relations[0].ok, true);
    assert.equal(result.relations[0].to, "c2");
    assert.equal(result.relations[1].ok, true);
    assert.equal(result.relations[1].to, "c1");
    // idempotent — 두번째는 alreadyExists
    assert.equal(result.relations[2].ok, true);
    assert.equal(result.relations[2].alreadyExists, true);
    // missing target
    assert.equal(result.relations[3].ok, false);
    assert.match(result.relations[3].error, /does not exist|missing/i);
    // unknown type
    assert.equal(result.relations[4].ok, false);
    assert.match(result.relations[4].error, /Unknown relation type|weird-type/i);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "batch relation postWriteMaintenance");
    assert.equal(result.relations[0].postWriteMaintenance, undefined);
    // p.contains 는 edge set 기준으로 중복 제거 + 정렬되어 land
    const p = getCallParsed(responses, 3);
    assert.deepEqual(p.frontmatter.contains, ["c1", "c2"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — add_relations 빈 배열 / cap 가드.
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
        ],
      }),
      callTool(3, "get_concept", { slug: "a" }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.equal(result.relations[0].ok, true, "valid row still lands");
    assert.equal(result.relations[1].ok, false);
    assert.match(result.relations[1].error, /Unknown field "relation" in relations\[1\]/i);
    const concept = getCallParsed(responses, 3);
    assert.deepEqual(concept.frontmatter.relates, ["b"]);
    assert.equal(concept.frontmatter.contains, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// R+ — cycle 46: validate_vault tool. agent 가 vault 전체 health 한 호출에.
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
        expected_mtime: 1, // ms=1 — 분명히 안 맞음
      }),
    ]);
    assert.ok(
      isErrorResponse(responses, 2),
      "stale expected_mtime 은 isError:true 여야",
    );
    const text = responses.find((r) => r.id === 2).result.content[0].text;
    assert.match(text, /conflict|VaultConflictError|modified externally/i);
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
        "---\nkind: project\ntitle: Ref\ndependencies: [old-target]\n---\n",
    },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "rename_concept", {
        oldSlug: "old-target",
        newSlug: "new-target",
      }),
    ]);
    const result = getCallParsed(responses, 2);
    assert.deepEqual(getCallStructured(responses, 2), result);
    assert.equal(result.dryRun, true);
    assert.equal(result.moved, false);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
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
    assert.equal(result.moved, true);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
    assert.equal(result.changed, true);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "rename_concept postWriteMaintenance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("merge_concepts confirm:true — fromSlug 삭제 + backlink redirect", async () => {
  const root = makeVault([
    { slug: "from", content: "---\nkind: capability\ntitle: From\n---\n" },
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
    assert.equal(result.deleted, true);
    assert.equal(result.backlinkUpdates.totalUpdated, 1);
    assert.equal(result.changed, true);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "merge_concepts postWriteMaintenance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test("delete_concept confirm:true — 삭제 후 post-write maintenance summary 반환", async () => {
  const root = makeVault([
    { slug: "gone", content: "---\nkind: capability\ntitle: Gone\n---\n" },
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
    assert.equal(result.changed, true);
    assertPostWriteMaintenanceShape(result.postWriteMaintenance, "delete_concept postWriteMaintenance");
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

await test("add_relation — 같은 edge 두번 추가 시 alreadyExists:true (idempotent)", async () => {
  const root = makeVault([
    { slug: "a", content: "---\nkind: project\ntitle: A\n---\n" },
    { slug: "b", content: "---\nkind: capability\ntitle: B\n---\n" },
  ]);
  try {
    const { responses } = await rpc(root, [
      ...INIT_REQUESTS,
      callTool(2, "add_relation", { from: "a", to: "b", type: "depends_on" }),
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
      callTool(2, "add_relation", { from: "a", to: "m", type: "depends_on" }),
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

const skippedSuffix = skipped > 0 ? `, ${skipped} skipped` : "";
console.log(`\nintegration: ${passed} passed, ${failed} failed${skippedSuffix}`);
if (TEST_NAME_PATTERN && passed === 0) {
  console.error(formatNoTestMatchMessage("MCP", TEST_FILTER));
  process.exit(1);
}
if (failed > 0) process.exit(1);
