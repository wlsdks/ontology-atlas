// Runs the dogfood walk: starts this checkout's stdio server on the repository's own ontology vault,
// sends every step of `walk-requests.mjs`, and prints one line per step. Exits 1 when an answer is
// not what its step names, when tools/list or the instructions drift from the inventory, or when the
// server wrote a warning to stderr.
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeInstructionsFailure } from "../../../mcp/scripts/verify/checks/initialize.mjs";
import { structuredContentFailure } from "../../../mcp/scripts/verify/checks/structured-content.mjs";
import { parseJsonRpcResponses } from "../../../mcp/scripts/json-rpc-lines.mjs";
import { toolsListInventoryFailure } from "../../../mcp/scripts/verify/tools-list/inventory.mjs";
import { advertisedOutputSchemaFailure, withOutputContracts } from "../../../mcp/scripts/verify/tools-list/output-contracts.mjs";
import { toolsListSchemaFailure } from "../../../mcp/scripts/verify/tools-list/schema.mjs";
import { COLORS } from "./colors.mjs";
import {
  dogfoodTimeoutErrorMessage,
  dogfoodUsage,
  parseDogfoodArgs,
  parseDogfoodTimeoutMs,
} from "./cli-args.mjs";
import {
  DISCOVERY_IDS,
  discoveryRequests,
  selectTargets,
  walkRequests,
  walkSteps,
} from "./walk-requests.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SERVER = join(ROOT, "mcp", "src", "index.js");
const VAULT = join(ROOT, "docs", "ontology");

/** Sends the requests, closes stdin, and returns every answer by id once the server exits. */
function exchange(requests, timeoutMs) {
  return new Promise((resolveExchange) => {
    const server = spawn(process.execPath, [SERVER], {
      env: { ...process.env, OATLAS_VAULT: VAULT },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      server.kill();
    }, timeoutMs);
    server.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    server.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    server.on("close", () => {
      clearTimeout(timer);
      const answers = new Map(parseJsonRpcResponses(stdout).map((answer) => [answer.id, answer]));
      resolveExchange({ answers, stderr, timedOut });
    });
    server.stdin.write(requests.map((request) => `${JSON.stringify(request)}\n`).join(""));
    server.stdin.end();
  });
}

function textOf(answer) {
  return answer?.result?.content?.[0]?.text ?? "";
}

function parsedText(answer) {
  try {
    return JSON.parse(textOf(answer));
  } catch {
    return undefined;
  }
}

/** What is wrong with the answer to one step, or null. */
export function stepFailure(step, answer) {
  if (!answer) return "no answer";
  if (answer.error) return `protocol error: ${answer.error.message}`;
  const refusal = answer.result?.isError === true;
  if (step.expect.kind === "refused") {
    if (!refusal) return "was not refused";
    return textOf(answer).includes(step.expect.sentence) ? null : `refusal does not say "${step.expect.sentence}": ${textOf(answer).slice(0, 160)}`;
  }
  if (refusal) return `refused: ${textOf(answer).slice(0, 200)}`;
  const parsed = parsedText(answer);
  if (parsed === undefined) {
    return answer.result?.structuredContent === undefined ? null : "text is not JSON beside structuredContent";
  }
  const structured = structuredContentFailure(answer, parsed, "answer");
  if (structured && answer.result?.structuredContent !== undefined) return structured;
  if (step.expect.kind === "dryRun" && !(parsed.dryRun === true && parsed.ok === false)) {
    return "a preview must say dryRun:true and ok:false";
  }
  return null;
}

/** What is wrong with the handshake and tools/list answers, as a list. */
export function surfaceFailures(initialize, toolsList) {
  const tools = toolsList?.result?.tools;
  const failures = [initializeInstructionsFailure(initialize), toolsListInventoryFailure(tools)];
  if (Array.isArray(tools)) {
    // The advertised schemas are a cut of the full output contracts; the cut is checked first, then the contracts.
    failures.push(advertisedOutputSchemaFailure(tools), toolsListSchemaFailure(withOutputContracts(tools)));
  }
  return failures.filter(Boolean);
}

/** stderr lines that are neither the connection notice nor empty. */
export function stderrWarnings(stderr) {
  return String(stderr)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("[ontology-atlas-mcp] connected."));
}

export async function runDogfoodWalk() {
  const args = parseDogfoodArgs();
  if (args.help) {
    console.log(dogfoodUsage());
    return 0;
  }
  if (args.error) {
    console.error(`${args.error}\n\n${dogfoodUsage()}`);
    return 2;
  }
  const timeoutRaw = process.env.OATLAS_DOGFOOD_TIMEOUT_MS;
  const timeoutMs = parseDogfoodTimeoutMs(timeoutRaw);
  if (timeoutMs === false) {
    console.error(dogfoodTimeoutErrorMessage(timeoutRaw));
    return 1;
  }

  console.log(`${COLORS.bold}Dogfood walk${COLORS.reset} ${COLORS.dim}(vault=${VAULT})${COLORS.reset}`);
  const discovery = await exchange(discoveryRequests(), timeoutMs);
  if (discovery.timedOut) {
    console.error(`target discovery timed out after ${timeoutMs}ms; raise OATLAS_DOGFOOD_TIMEOUT_MS`);
    return 1;
  }
  let targets;
  try {
    const page = (id) => parsedText(discovery.answers.get(id));
    targets = selectTargets({
      projects: page(DISCOVERY_IDS.projects),
      domains: page(DISCOVERY_IDS.domains),
      capabilities: page(DISCOVERY_IDS.capabilities),
    });
  } catch (error) {
    console.error(`target discovery failed: ${error.message}`);
    return 1;
  }
  console.log(`${COLORS.dim}targets: ${targets.projectSlug} -> ${targets.domainSlug} -> ${targets.capabilitySlug}${COLORS.reset}`);

  const steps = walkSteps(targets, { repositoryRoot: ROOT });
  const walk = await exchange(walkRequests(steps), timeoutMs);
  const failures = [];
  const record = (label, failure) => {
    console.log(failure ? `  ${COLORS.red}x${COLORS.reset} ${label}: ${failure}` : `  ${COLORS.green}ok${COLORS.reset} ${label}`);
    if (failure) failures.push(`${label}: ${failure}`);
  };
  if (walk.timedOut) {
    failures.push(`timed out after ${timeoutMs}ms; raise OATLAS_DOGFOOD_TIMEOUT_MS`);
    console.error(failures.at(-1));
  }
  for (const failure of surfaceFailures(walk.answers.get(1), walk.answers.get(5))) record("initialize and tools/list", failure);
  for (const step of steps) record(step.label, stepFailure(step, walk.answers.get(step.id)));
  for (const line of stderrWarnings(walk.stderr)) record("stderr", line);

  console.log(failures.length === 0
    ? `\n${COLORS.green}dogfood walk passed: ${steps.length} steps${COLORS.reset}`
    : `\n${COLORS.red}dogfood walk failed: ${failures.length} of ${steps.length} steps${COLORS.reset}`);
  return failures.length === 0 ? 0 : 1;
}
