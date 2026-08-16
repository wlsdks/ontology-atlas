// `ontology-atlas export [vault] --format jsonld|graphml|json` — interop
// export surface. Runs the deterministic MCP `compile_ontology`, adapts the
// artifact into a portable standard format, and writes it to stdout.
//
//   jsonld   RDF 1.1 JSON-LD (rdflib / Protégé / triplestores)
//   graphml  XML graph (Gephi / Cytoscape / NetworkX)
//   json     the raw compile artifact (nodes/edges/graphHash), unchanged
//
// Serialization is delegated to cli/src/lib/interop-format.mjs — the same pure
// functions the web ERD builder uses (kept in lock-step by
// tests/contract/interop-format.contract.test.ts). Payload → stdout only;
// status + errors → stderr, so `export ... | neo4j-admin import` is safe.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { describeExportOmissions } from '../lib/export-omissions.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { buildGraphML, buildJsonLd } from '../lib/interop-format.mjs';
import {
  closestAllowedValue,
  formatUnknownFlagError,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const FORMATS = ['jsonld', 'graphml', 'json'];
const DEFAULT_FORMAT = 'jsonld';
const ALLOWED_FLAGS = ['--vault', '--format'];

export async function runExport(args) {
  // Pipe-safety — `export ... | head` (or any reader that closes early) makes
  // the large stdout payload fail with EPIPE. Swallow it instead of crashing
  // with an unhandled 'error' event.
  process.stdout.on('error', (err) => {
    if (err && err.code === 'EPIPE') process.exit(0);
    throw err;
  });

  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  const vaultRoot = resolveVaultRoot(parsed.vault);
  let artifact;
  try {
    // Full graph — no pagination — so the export is a complete snapshot.
    artifact = await callMcpTool(vaultRoot, 'compile_ontology', {});
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (!Array.isArray(artifact?.nodes) || !Array.isArray(artifact?.edges)) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  compile_ontology response missing nodes/edges arrays; cannot export\n`,
    );
    return 2;
  }

  const graph = { nodes: artifact.nodes, edges: artifact.edges };
  let payload;
  try {
    if (parsed.format === 'json') {
      payload = JSON.stringify(artifact, null, 2) + '\n';
    } else if (parsed.format === 'graphml') {
      payload = buildGraphML(graph);
    } else {
      payload = buildJsonLd(graph);
    }
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  process.stdout.write(payload);

  // Provenance to stderr — never pollutes the piped payload.
  const hash =
    typeof artifact.graphHash === 'string' ? artifact.graphHash.slice(0, 8) : 'none';
  process.stderr.write(
    `${COLORS.dim}exported ${parsed.format} · ${artifact.nodeCount ?? artifact.nodes.length} nodes · ` +
      `${artifact.edgeCount ?? artifact.edges.length} edges · graphHash ${hash}${COLORS.reset}\n`,
  );

  /*
   * **안 담긴 것도 말한다** (2026-08-17 실측).
   *
   * 노드와 관계는 정말 다 나간다. 그런데 우리 볼트의 관계 이유 7개
   * (`relation_notes`)는 하나도 안 나가고, 구현 경로도 마찬가지다. 이 저장소가
   * 스스로 적어 둔 말이 있다 — *"근거 없는 엣지는 마인드맵 선이지 온톨로지
   * 주장이 아니다."* Protégé 로 옮긴 사람은 「80 노드 · 174 관계」를 보고
   * 다 가져온 줄 안다.
   *
   * 담는 칸 목록을 여기 손으로 적지 않는다 — 스키마가 늘면 조용히 낡는다.
   * **방금 내놓은 payload 에서 뽑는다.**
   */
  const omissions = describeExportOmissions({
    nodes: artifact.nodes,
    edges: artifact.edges,
    carriedKeys: carriedKeysOf(parsed.format, payload),
    // 오늘 두 형식 모두 엣지에 이유를 안 싣는다. 담게 되면 여기만 고친다.
    carriesEdgeRationale: false,
  });
  if (omissions.sentence) {
    process.stderr.write(`${COLORS.dim}${omissions.sentence}${COLORS.reset}\n`);
  }
  return 0;
}

/**
 * 이 형식이 실제로 담은 노드 칸들 — **내놓은 결과에서 뽑는다.**
 * 목록을 손으로 적으면 스키마가 늘 때 조용히 낡고, 그러면 「다 담았다」고
 * 말하면서 안 담게 된다.
 */
function carriedKeysOf(format, payload) {
  // `json` 은 컴파일 산출물 원본이라 잃는 것이 없다.
  if (format === 'json') return null;
  if (format === 'jsonld') {
    try {
      const graph = JSON.parse(payload)['@graph'];
      const keys = new Set();
      for (const node of Array.isArray(graph) ? graph : []) {
        for (const key of Object.keys(node ?? {})) keys.add(key);
      }
      return [...keys];
    } catch {
      // 못 읽으면 아무것도 단정하지 않는다 — 틀린 손실 목록보다 침묵이 낫다.
      return null;
    }
  }
  if (format === 'graphml') {
    return [...new Set([...payload.matchAll(/<key[^>]*attr\.name="([^"]+)"/g)].map((m) => m[1]))];
  }
  return null;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const flags = { vault: null, format: DEFAULT_FORMAT };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--format') flags.format = parseRequiredFlagValue('--format', args[++i]);
    else if (a.startsWith('--format=')) flags.format = parseRequiredFlagValue('--format', a.slice('--format='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (!FORMATS.includes(flags.format)) {
    const suggestion = closestAllowedValue(flags.format, FORMATS);
    return {
      error:
        `unknown --format "${flags.format}".` +
        (suggestion ? ` Did you mean ${suggestion}?` : '') +
        ` Allowed: ${FORMATS.join(', ')}.`,
    };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { ...flags, vault: vaultResult.vault };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas export [vault] [--format jsonld|graphml|json]\n\n` +
      `Export the compiled ontology to a portable interchange format.\n\n` +
      `Options:\n` +
      `  --format jsonld   RDF 1.1 JSON-LD: rdflib / Protégé / triplestores (default)\n` +
      `  --format graphml  XML graph: Gephi / Cytoscape / NetworkX\n` +
      `  --format json     raw deterministic compile artifact (nodes/edges/graphHash)\n` +
      `  --vault path      vault root (default: cwd or OATLAS_VAULT)\n\n` +
      `The payload is written to stdout (pipe-safe); status goes to stderr.\n` +
      `Node identity is the permanent UID URN: urn:uuid:<uid>; slug remains readable data.\n` +
      `This export is a snapshot; the compiler graphHash is its version. External / dangling\n` +
      `refs are omitted (an interop snapshot never mints phantom nodes).\n`,
  );
}
