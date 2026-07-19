// JSON-RPC client for the dogfood MCP walk: spawns the stdio server, chunks
// write batches, decodes stdout/stderr, and exposes response lookup helpers.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  expectedResponseIds,
  hasAllResponses,
  hasAnyErrorResponse,
  missingResponseLabels,
  parseJsonRpcResponses,
} from "../../../mcp/scripts/json-rpc-lines.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "../../..");
export const SERVER = join(ROOT, "mcp", "src", "index.js");
export const VAULT = join(ROOT, "docs", "ontology");

const DOGFOOD_RESPONSE_LABELS = new Map([
  [1, "initialize"],
  [2, "list_kinds"],
  [3, "list_concepts"],
  [4, "find_evidence"],
  [5, "find_path"],
  [6, "find_backlinks"],
  [7, "find_orphans"],
  [8, "validate_vault"],
  [9, "workspace_brief"],
  [10, "health"],
  [11, "compile_ontology"],
  [12, "pattern_walk"],
  [13, "all_paths"],
  [14, "all_paths_query_plan"],
  [15, "overview"],
  [16, "get_concepts"],
  [17, "project_map_query_plan"],
  [18, "project_map"],
  [19, "domain_profile"],
  [20, "domain_matrix"],
  [21, "components"],
  [22, "relation_check"],
  [23, "maintenance_plan"],
  [24, "growth_plan"],
  [25, "recommend_relations"],
  [26, "cycles"],
  [27, "topological_order"],
  [28, "lineage"],
  [29, "containment_tree"],
  [30, "reachability"],
  [31, "impact"],
  [32, "blast_radius"],
  [33, "subgraph"],
  [34, "schema"],
  [35, "facets"],
  [36, "match_nodes"],
  [37, "match_edges"],
  [38, "node_profile"],
  [39, "centrality"],
  [40, "communities"],
  [41, "similar_nodes"],
  [42, "explain_relation"],
  [43, "neighbors"],
  [44, "path"],
  [45, "project_scope"],
  [46, "strict_args"],
  [47, "strict_enum"],
  [48, "project_probe"],
  [49, "health_tuned"],
  [50, "workspace_brief_tuned"],
  [51, "strict_maintenance_phase_filter"],
  [52, "strict_maintenance_severity_filter"],
  [53, "strict_maintenance_kind_filter"],
  [54, "maintenance_plan_missing_cursor"],
  [55, "tools_list"],
  [56, "query_concepts"],
  [57, "analyze_repo_structure"],
  [58, "infer_imports"],
  [59, "strict_multi_args"],
  [60, "query_concepts_limited"],
  [61, "strict_relation_filter"],
  [62, "compile_ontology_indexes"],
  [63, "rename_concept_dry_run"],
  [64, "merge_concepts_dry_run"],
  [65, "delete_concept_dry_run"],
  [66, "strict_relation_check"],
  [67, "strict_graph_kind_filter"],
  [68, "strict_graph_from_kind_filter"],
  [69, "strict_graph_to_kind_filter"],
  [70, "strict_add_relation"],
  [71, "strict_recommend_relations_kind_filter"],
  [72, "strict_recommend_relations_unsupported_kind_filter"],
  [73, "strict_match_nodes_sort_filter"],
  [74, "strict_match_edges_type_filter"],
  [75, "strict_find_neighbors_type_filter"],
  [76, "strict_find_orphans_kind_filter"],
  [77, "strict_find_orphans_exclude_kind_filter"],
  [78, "strict_query_concepts_kind_filter"],
  [79, "strict_query_concepts_has_key_filter"],
  [80, "strict_list_concepts_kind_filter"],
  [81, "get_concepts_batch_cap"],
  [82, "add_concepts_batch_cap"],
  [83, "add_relations_batch_cap"],
  [84, "strict_unknown_tool"],
  [85, "add_concepts_row_repair"],
  [86, "add_relations_row_repair"],
]);

const RPC_WRITE_BATCH_SIZE = 40;

export function rpc(requests, timeoutMs = 3000) {
  return new Promise((resolveP, rejectP) => {
    const expectedIds = expectedResponseIds(requests);
    const chunks = chunkRequests(requests, RPC_WRITE_BATCH_SIZE);
    const sentIds = new Set();
    let nextChunkIndex = 0;
    const proc = spawn(process.execPath, [SERVER], {
      env: { ...process.env, OATLAS_VAULT: VAULT },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutDecoder = createUtf8Accumulator();
    const stderrDecoder = createUtf8Accumulator();
    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let timer = null;
    const writeNextChunk = () => {
      const chunk = chunks[nextChunkIndex];
      if (!chunk) return;
      nextChunkIndex += 1;
      for (const id of expectedResponseIds(chunk)) {
        sentIds.add(id);
      }
      proc.stdin.write(chunk.map((r) => JSON.stringify(r)).join("\n") + "\n");
    };
    proc.stdout.on("data", (b) => {
      stdout = stdoutDecoder.write(b);
      if (completed) return;
      if (hasAnyErrorResponse(stdout, expectedIds)) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill("SIGTERM");
        return;
      }
      while (nextChunkIndex < chunks.length && hasAllResponses(stdout, sentIds)) {
        writeNextChunk();
      }
      if (hasAllResponses(stdout, expectedIds)) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill("SIGTERM");
      }
    });
    proc.stderr.on("data", (b) => {
      stderr = stderrDecoder.write(b);
    });

    writeNextChunk();
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.on("close", () => {
      if (timer) clearTimeout(timer);
      stdout = stdoutDecoder.end();
      stderr = stderrDecoder.end();
      const responses = parseRpcResponses(stdout);
      resolveP({ responses, stderr, timedOut });
    });
    proc.on("error", rejectP);
  });
}

function chunkRequests(requests, size) {
  const chunks = [];
  for (let index = 0; index < requests.length; index += size) {
    chunks.push(requests.slice(index, index + size));
  }
  return chunks;
}

export { DOGFOOD_RESPONSE_LABELS, expectedResponseIds, missingResponseLabels };

export function parseRpcResponses(stdout) {
  return parseJsonRpcResponses(stdout);
}

export function createUtf8Accumulator() {
  const decoder = new StringDecoder("utf8");
  let text = "";
  return {
    write(chunk) {
      text += decoder.write(chunk);
      return text;
    },
    end() {
      text += decoder.end();
      return text;
    },
  };
}

export function shouldFinishRpc(stdout, expectedIds) {
  return hasAnyErrorResponse(stdout, expectedIds) || hasAllResponses(stdout, expectedIds);
}

export function getResult(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) return null;
  if (res.error) return { error: res.error };
  const text = res.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

export function getRpcResult(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) return null;
  if (res.error) return { error: res.error };
  return res.result ?? null;
}

export function getRpcResponse(responses, id) {
  return responses.find((r) => r.id === id) ?? null;
}
