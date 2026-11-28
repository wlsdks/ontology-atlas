#!/usr/bin/env node
/**
 * MCP server verify CLI: checks in one command that a registered server boots,
 * lists its tools, and passes the first-contact read calls and destructive dry-runs.
 *
 * Usage:
 *   node mcp/scripts/verify.mjs [vault] [--vault <dir>] [--timeout-ms <n>]
 *   OATLAS_VAULT=<dir> OATLAS_VERIFY_TIMEOUT_MS=<n> npm run verify
 *
 * Exit 0 when every check passes, 1 with a diagnostic otherwise.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { parseJsonRpcResponses } from './json-rpc-lines.mjs';

import { cleanupAbsorbFixture, ensureAbsorbFixture } from './verify/absorb-fixture.mjs';
import { listConceptsFailure } from './verify/checks/concept-reads.mjs';
import { firstContactLocalProbeFailure } from './verify/checks/connection-scope.mjs';
import {
  verifyCountConsistencyFailure,
  verifyCountConsistencySummary,
} from './verify/checks/count-consistency.mjs';
import {
  structuredContentFailure,
  structuredContentVerifySummary,
} from './verify/checks/structured-content.mjs';
import {
  emptyVerifyVaultFailure,
  parseVerifyArgs,
  parseVerifyKillGraceMs,
  parseVerifyTimeoutMs,
  parserSmokeFailure,
  serverSignalFailure,
  serverStartupFailure,
  verifyKillGraceValueErrorMessage,
  verifyRetryEnvForVault,
  verifySuccessMessage,
  verifyTimeoutFailure,
  verifyTimeoutValueErrorMessage,
  verifyUsage,
  verifyVaultPathError,
} from './verify/cli.mjs';
import { log } from './verify/output.mjs';
import { PARSER_TEST, REPO_ROOT, SERVER_ENTRY } from './verify/paths.mjs';
import { verifyBriefs } from './verify/phases/briefs.mjs';
import { verifyCompile } from './verify/phases/compile.mjs';
import { verifyConceptReads } from './verify/phases/concept-reads.mjs';
import { verifyDiagnosis } from './verify/phases/diagnosis.mjs';
import { verifyGraphQueries } from './verify/phases/graph-queries.mjs';
import { verifyHandshake } from './verify/phases/handshake.mjs';
import { verifyImportAnalysis } from './verify/phases/import-analysis.mjs';
import { verifyMaintenanceCursor } from './verify/phases/maintenance-cursor.mjs';
import { verifyQueryPlans } from './verify/phases/query-plans.mjs';
import { verifyStrictArguments, verifyStrictFilters } from './verify/phases/strict-arguments.mjs';
import { verifyVaultCensus } from './verify/phases/vault-census.mjs';
import { verifyWriteSafety } from './verify/phases/write-safety.mjs';
import {
  firstContactErrorFailure,
  firstContactMissingResponseLabels,
  hasAllFirstContactResponses,
  hasFirstContactErrorResponse,
  initialExpectedFirstContactIds,
} from './verify/requests/first-contact-ids.mjs';
import { buildFirstContactRequests } from './verify/requests/first-contact.mjs';
import {
  allGraphQuerySmokeResponseIds,
  buildDestructiveDryRunSmokeRequests,
  buildGetConceptSmokeSlug,
  buildGetConceptsSmokeSlugs,
  buildGraphQuerySmokeArgs,
  buildGraphQuerySmokeRequests,
  buildLimitedListConceptsFilterSmokeRequest,
  buildPatchConflictGuardSmokeRequest,
} from './verify/requests/follow-ups.mjs';

// Runs the same suite against the compiled app binary, spawned without arguments:
// passing from source and what the user receives can differ.
const SERVER_BIN_OVERRIDE = process.env.OATLAS_MCP_SERVER_BIN || '';
const SERVER_COMMAND = SERVER_BIN_OVERRIDE || process.execPath;
const SERVER_COMMAND_ARGS = SERVER_BIN_OVERRIDE ? [] : [SERVER_ENTRY];
const IS_MAIN = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');

const VERIFY_ARGS = parseVerifyArgs({ isMain: IS_MAIN });
const VAULT = VERIFY_ARGS.vault;
const VERIFY_TIMEOUT_MS_RAW = VERIFY_ARGS.timeoutMsRaw;

function verifyTimeoutMs() {
  return parseVerifyTimeoutMs(VERIFY_TIMEOUT_MS_RAW);
}

async function step1ParserSmoke() {
  log('info', 'step 1: parser smoke test');
  return new Promise((res) => {
    const proc = spawn(process.execPath, [PARSER_TEST], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    proc.stdout.on('data', (b) => (stdout += stdoutDecoder.write(b)));
    proc.stderr.on('data', (b) => (stderr += stderrDecoder.write(b)));
    proc.on('close', (code, signal) => {
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      if (code === 0 && /passed/.test(stdout)) {
        log('ok', stdout.trim().split('\n').slice(-1)[0]);
        res(true);
      } else {
        log('fail', parserSmokeFailure(code, signal));
        if (stdout) console.error(stdout);
        if (stderr) console.error(stderr);
        res(false);
      }
    });
  });
}

async function step2BootAndCall() {
  const timeoutMs = verifyTimeoutMs();
  if (timeoutMs === false) {
    log('fail', 'verify timeout must be a positive integer');
    return false;
  }
  const killGraceMs = parseVerifyKillGraceMs();
  if (killGraceMs === false) {
    log('fail', verifyKillGraceValueErrorMessage());
    return false;
  }
  log('info', `step 2: server boot + tools/list + list_concepts/census/project probe/get_concepts/list_concepts mentions/find_backlinks/list_concepts filter/limited list_concepts filter/analyze_repo_structure/infer_imports/orphan match_nodes/destructive dry-runs (vault=${VAULT}, timeout=${timeoutMs}ms)`);

  // The absorb_document dry-run request (id 69) reads this fixture, so it must exist
  // before the batch is sent; the finally below removes it.
  ensureAbsorbFixture();
  const requests = buildFirstContactRequests();
  // Everything after the first list_concepts waits for its answer: an empty vault then
  // exits before the repository scans start, instead of queueing behind them.
  const firstBatchEnd = requests.findIndex((request) => request.id === 3) + 1;
  const firstBatch = requests.slice(0, firstBatchEnd).map((request) => JSON.stringify(request));
  const restBatch = requests.slice(firstBatchEnd).map((request) => JSON.stringify(request));

  try {
    return await new Promise((res) => {
    const proc = spawn(SERVER_COMMAND, SERVER_COMMAND_ARGS, {
      env: { ...process.env, OATLAS_VAULT: VAULT, OATLAS_REPO_ROOT: REPO_ROOT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let timedOut = false;
    let completed = false;
    let sentFirstContactRest = false;
    let sentGetConceptSmoke = false;
    let sentGetConceptsSmoke = false;
    let sentFindBacklinksSmoke = false;
    let sentLimitedQueryConceptsSmoke = false;
    let sentGraphQuerySmoke = false;
    let sentDestructiveDryRunSmoke = false;
    let sentMaintenanceResumeSmoke = false;
    let destructiveDryRunExpectedResponses = [];
    let earlyEmptyVaultPayload = null;
    const expectedFirstContactIds = initialExpectedFirstContactIds();
    let limitedFilterSmoke = null;
    let timer = null;
    let killTimer = null;
    const stopServer = () => {
      proc.kill('SIGTERM');
      if (!killTimer) {
        killTimer = setTimeout(() => proc.kill('SIGKILL'), killGraceMs);
        killTimer.unref?.();
      }
    };
    proc.stdout.on('data', (b) => {
      stdout += stdoutDecoder.write(b);
      if (!sentGetConceptsSmoke || !sentFindBacklinksSmoke || !sentLimitedQueryConceptsSmoke || !sentGraphQuerySmoke || !sentDestructiveDryRunSmoke) {
        const listResponse = parseJsonRpcResponses(stdout).find((response) => response?.id === 3 && response?.result);
        const projectResponse = parseJsonRpcResponses(stdout).find((response) => response?.id === 18 && response?.result);
        if (listResponse) {
          let listPayload = null;
          let projectPayload = null;
          try {
            listPayload = JSON.parse(listResponse.result.content?.[0]?.text || '{}');
          } catch {
            listPayload = null;
          }
          if (listPayload && emptyVerifyVaultFailure(listPayload)) {
            earlyEmptyVaultPayload = listPayload;
            completed = true;
            if (timer) clearTimeout(timer);
            stopServer();
            return;
          }
          if (!sentFirstContactRest) {
            sentFirstContactRest = true;
            if (restBatch.length > 0) proc.stdin.write(restBatch.join('\n') + '\n');
          }
          if (projectResponse) {
            try {
              projectPayload = JSON.parse(projectResponse.result.content?.[0]?.text || '{}');
            } catch {
              projectPayload = null;
            }
          }
          if (!sentGetConceptsSmoke) {
            sentGetConceptsSmoke = true;
            proc.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 11,
              method: 'tools/call',
              params: {
                name: 'get_concepts',
                arguments: { slugs: buildGetConceptsSmokeSlugs(listPayload) },
              },
            }) + '\n');
          }
          if (!sentGetConceptSmoke) {
            sentGetConceptSmoke = true;
            const slug = buildGetConceptSmokeSlug(listPayload);
            if (slug) {
              expectedFirstContactIds.add(31);
              proc.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 31,
                method: 'tools/call',
                params: {
                  name: 'get_concepts',
                  arguments: { slugs: [slug] },
                },
              }) + '\n');
            }
          }
          if (!sentFindBacklinksSmoke) {
            sentFindBacklinksSmoke = true;
            const slug = buildGetConceptSmokeSlug(listPayload);
            if (slug) {
              expectedFirstContactIds.add(33);
              proc.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 33,
                method: 'tools/call',
                params: {
                  name: 'find_backlinks',
                  arguments: { slug },
                },
              }) + '\n');
            }
          }
          if (!sentLimitedQueryConceptsSmoke) {
            sentLimitedQueryConceptsSmoke = true;
            limitedFilterSmoke = buildLimitedListConceptsFilterSmokeRequest(listPayload);
            if (limitedFilterSmoke?.request) {
              expectedFirstContactIds.add(37);
              proc.stdin.write(JSON.stringify(limitedFilterSmoke.request) + '\n');
            }
          }
          if (!sentDestructiveDryRunSmoke) {
            sentDestructiveDryRunSmoke = true;
            const destructiveDryRunPlan = buildDestructiveDryRunSmokeRequests(listPayload);
            for (const id of destructiveDryRunPlan.expectedResponseIds) expectedFirstContactIds.add(id);
            destructiveDryRunExpectedResponses = destructiveDryRunPlan.requests.map((request) => [
              request.params.name,
              request.id,
            ]);
            if (destructiveDryRunPlan.requests.length > 0) {
              proc.stdin.write(destructiveDryRunPlan.requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
            }
            const patchConflictGuardRequest = buildPatchConflictGuardSmokeRequest(listPayload);
            if (patchConflictGuardRequest) {
              expectedFirstContactIds.add(patchConflictGuardRequest.id);
              proc.stdin.write(JSON.stringify(patchConflictGuardRequest) + '\n');
            }
          }
          if (!sentGraphQuerySmoke && projectResponse) {
            sentGraphQuerySmoke = true;
            const graphSmoke = buildGraphQuerySmokeArgs(listPayload, projectPayload);
            const graphSmokePlan = buildGraphQuerySmokeRequests(graphSmoke);
            for (const id of allGraphQuerySmokeResponseIds()) {
              if (!graphSmokePlan.expectedResponseIds.includes(id)) expectedFirstContactIds.delete(id);
            }
            if (graphSmokePlan.requests.length > 0) {
              proc.stdin.write(graphSmokePlan.requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
            }
          }
        }
      }
      if (!sentMaintenanceResumeSmoke) {
        const maintenanceReadyResponse = parseJsonRpcResponses(stdout).find((response) => response?.id === 26 && response?.result);
        if (maintenanceReadyResponse) {
          sentMaintenanceResumeSmoke = true;
          let maintenanceReadyPayload = null;
          try {
            maintenanceReadyPayload = JSON.parse(maintenanceReadyResponse.result.content?.[0]?.text || '{}');
          } catch {
            maintenanceReadyPayload = null;
          }
          const afterActionId = maintenanceReadyPayload?.actions?.[0]?.id;
          if (typeof afterActionId === 'string' && afterActionId.length > 0) {
            expectedFirstContactIds.add(30);
            proc.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 30,
              method: 'tools/call',
              params: {
                name: 'query_ontology',
                arguments: { operation: 'maintenance_plan', afterActionId, limit: 5 },
              },
            }) + '\n');
          }
        }
      }
      const liveResponses = parseJsonRpcResponses(stdout);
      if (
        !completed
        && (hasAllFirstContactResponses(stdout, expectedFirstContactIds)
          || hasFirstContactErrorResponse(stdout, expectedFirstContactIds))
      ) {
        completed = true;
        if (timer) clearTimeout(timer);
        stopServer();
      }
    });
    proc.stderr.on('data', (b) => (stderr += stderrDecoder.write(b)));

    proc.stdin.write(firstBatch.join('\n') + '\n');
    timer = setTimeout(() => {
      timedOut = true;
      stopServer();
    }, timeoutMs);

    proc.on('close', (_code, signal) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      const responses = parseJsonRpcResponses(stdout);

      const initRes = responses.find((r) => r.id === 1);
      const callRes = responses.find((r) => r.id === 3);
      const projectProbeRes = responses.find((r) => r.id === 18);
      const missingLabels = firstContactMissingResponseLabels(responses, expectedFirstContactIds);
      const errorRes = responses.find((response) => (
        expectedFirstContactIds.has(response?.id) && response?.error
      ));

      if (errorRes) {
        log('fail', firstContactErrorFailure(errorRes));
        return res(false);
      }

      if (timedOut && missingLabels.length > 0) {
        log('fail', `${verifyTimeoutFailure(timeoutMs)} Missing responses: ${missingLabels.join(', ')}`);
        if (stderr) console.error(stderr.slice(0, 300));
        return res(false);
      }

      if (signal && !completed && missingLabels.length > 0) {
        log('fail', serverSignalFailure(signal, stderr, verifyRetryEnvForVault(VAULT)));
        return res(false);
      }

      const localScopeFailure = firstContactLocalProbeFailure(responses, {
        repoRoot: REPO_ROOT,
        vaultRoot: VAULT,
      });
      if (localScopeFailure) {
        log('fail', localScopeFailure);
        return res(false);
      }
      log('ok', 'connection_info: active vault/repo roots match the verifier scope (wrong_vault fail-closed)');

      if (earlyEmptyVaultPayload) {
        if (!initRes || !initRes.result) {
          log('fail', serverStartupFailure(stderr, verifyRetryEnvForVault(VAULT)));
          return res(false);
        }
        log('ok', `initialize OK: server ${initRes.result.serverInfo?.name}@${initRes.result.serverInfo?.version}`);
        if (!callRes || !callRes.result) {
          log('fail', 'no list_concepts response');
          return res(false);
        }
        const listFailure = listConceptsFailure(earlyEmptyVaultPayload);
        if (listFailure) {
          log('fail', listFailure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(callRes, earlyEmptyVaultPayload, 'list_concepts');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `list_concepts: vault total ${earlyEmptyVaultPayload.total} nodes (vaultRoot ${earlyEmptyVaultPayload.vaultRoot})`);
        log('fail', emptyVerifyVaultFailure(earlyEmptyVaultPayload));
        return res(false);
      }

      if (!initRes || !initRes.result) {
        log('fail', serverStartupFailure(stderr, verifyRetryEnvForVault(VAULT)));
        return res(false);
      }
      log('ok', `initialize OK: server ${initRes.result.serverInfo?.name}@${initRes.result.serverInfo?.version}`);

      if (!verifyHandshake(responses, { initRes })) return res(false);
      if (!verifyStrictArguments(responses)) return res(false);
      const writeSafety = verifyWriteSafety(responses, { destructiveDryRunExpectedResponses });
      if (!writeSafety) return res(false);
      const { destructiveDryRunCount } = writeSafety;
      if (!verifyStrictFilters(responses)) return res(false);
      const maintenanceCursor = verifyMaintenanceCursor(responses);
      if (!maintenanceCursor) return res(false);
      const { maintenanceResumeVerified, maintenanceResumeSkipped } = maintenanceCursor;
      const conceptReads = verifyConceptReads(responses, {
        limitedFilterSmoke,
        callRes,
        projectProbeRes,
      });
      if (!conceptReads) return res(false);
      const {
        listPayload,
        graphSmokeArgs,
        getConceptVerified,
        findBacklinksVerified,
        limitedQueryConceptsVerified,
      } = conceptReads;
      if (!verifyImportAnalysis(responses)) return res(false);
      const vaultCensus = verifyVaultCensus(responses, { projectProbeRes });
      if (!vaultCensus) return res(false);
      const { kindsPayload, validationPayload } = vaultCensus;
      if (!verifyBriefs(responses)) return res(false);
      if (!verifyDiagnosis(responses)) return res(false);
      const compile = verifyCompile(responses);
      if (!compile) return res(false);
      const { compilePayload } = compile;
      const queryPlans = verifyQueryPlans(responses);
      if (!queryPlans) return res(false);
      const { overviewPayload } = queryPlans;
      const graphQueries = verifyGraphQueries(responses, { graphSmokeArgs });
      if (!graphQueries) return res(false);

      const countFailure = verifyCountConsistencyFailure({
        kinds: kindsPayload,
        list: listPayload,
        validation: validationPayload,
        compiled: compilePayload,
        overview: overviewPayload,
      });
      if (countFailure) {
        log('fail', countFailure);
        return res(false);
      }
      const countSummary = verifyCountConsistencySummary({
        kinds: kindsPayload,
        list: listPayload,
        compiled: compilePayload,
        overview: overviewPayload,
      });
      if (countSummary) {
        log('ok', `read census consistency: ${countSummary}`);
      }
      log(
        'ok',
        `structuredContent: ${structuredContentVerifySummary({
          hasNode: Boolean(graphSmokeArgs?.hasNode),
          hasProject: Boolean(graphSmokeArgs?.hasProject),
          hasGetConcept: getConceptVerified,
          hasFindBacklinks: findBacklinksVerified,
          hasLimitedQueryConcepts: limitedQueryConceptsVerified,
          hasCompileIndexes: true,
          hasMaintenanceResume: maintenanceResumeVerified,
          hasMaintenanceResumeSkipped: maintenanceResumeSkipped,
          destructiveDryRunCount,
        })}`,
      );
      res(true);
    });

    proc.on('error', (err) => {
      log('fail', `server spawn failed: ${err.message}`);
      res(false);
    });
    });
  } finally {
    cleanupAbsorbFixture();
  }
}

async function main() {
  if (VERIFY_ARGS.help) {
    process.stdout.write(verifyUsage());
    return 0;
  }
  if (VERIFY_ARGS.error) {
    process.stderr.write(`\n[ontology-atlas-mcp verify]\n\n\x1b[31m✗\x1b[0m ${VERIFY_ARGS.error}\n`);
    process.stderr.write(verifyUsage());
    return 1;
  }
  if (verifyTimeoutMs() === false) {
    process.stderr.write(`\n[ontology-atlas-mcp verify]\n\n\x1b[31m✗\x1b[0m ${verifyTimeoutValueErrorMessage(VERIFY_TIMEOUT_MS_RAW, verifyRetryEnvForVault(VAULT))}\n`);
    return 1;
  }
  if (parseVerifyKillGraceMs() === false) {
    process.stderr.write(`\n[ontology-atlas-mcp verify]\n\n\x1b[31m✗\x1b[0m ${verifyKillGraceValueErrorMessage()}\n`);
    process.stderr.write(verifyUsage());
    return 1;
  }
  const vaultPathError = verifyVaultPathError(VAULT);
  if (vaultPathError) {
    process.stderr.write(`\n[ontology-atlas-mcp verify]\n\n\x1b[31m✗\x1b[0m ${vaultPathError}\n`);
    process.stderr.write(verifyUsage());
    return 1;
  }
  console.log('\n[ontology-atlas-mcp verify]\n');
  const ok1 = await step1ParserSmoke();
  if (!ok1) return 1;
  const ok2 = await step2BootAndCall();
  if (!ok2) return 1;
  console.log(`\n\x1b[32m${verifySuccessMessage()}\x1b[0m\n`);
  return 0;
}

if (IS_MAIN) {
  process.exitCode = await main();
}
