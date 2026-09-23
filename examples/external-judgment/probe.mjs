import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { argv, env, stderr, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const CHOICES = {
  supported: 'The supplied evidence directly supports the claim.',
  contradicted: 'The supplied evidence directly conflicts with the claim.',
  insufficient: 'The supplied evidence cannot settle the claim.',
};

// Fixed, synthetic text: this probe never opens a vault or repository file.
export function buildProbeRequest() {
  return {
    model: MODEL,
    state: {
      evidence: 'Load accepts a custom merge callback and uses it while combining maps. Merge and MergeAt create fresh default options and do not read the callback supplied to Load.',
      claims: {
        supported: 'Load can use a caller-supplied merge callback.',
        wrong_owner: 'MergeAt uses the custom merge callback supplied to Load.',
        unresolved: 'Load preserves the input keys in their original iteration order.',
      },
    },
    questions: {
      supported_claim: {
        type: 'choice',
        instructions: 'Given only `evidence`, how does it relate to `claims.supported`?',
        criteria: CHOICES,
      },
      wrong_owner_claim: {
        type: 'choice',
        instructions: 'Given only `evidence`, how does it relate to `claims.wrong_owner`?',
        criteria: CHOICES,
      },
      unresolved_claim: {
        type: 'choice',
        instructions: 'Given only `evidence`, how does it relate to `claims.unresolved`?',
        criteria: CHOICES,
      },
    },
  };
}

function reserveReceipt(directory, payload) {
  if (!directory) throw new Error('An --audit-dir is required before any transfer.');
  const root = resolve(directory);
  let stat;
  try { stat = lstatSync(root); } catch { throw new Error('The audit directory must already exist.'); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error('The audit directory must be a private, non-symlink directory (mode 0700).');
  }
  const path = resolve(root, `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.jsonl`);
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1) throw new Error('The audit receipt is not a private regular file.');
    const prepared = {
      status: 'prepared',
      at: new Date().toISOString(),
      destination: ENDPOINT,
      model: MODEL,
      input: 'fixed synthetic claim/evidence set',
      bytes: Buffer.byteLength(payload),
      sha256: createHash('sha256').update(payload).digest('hex'),
    };
    writeSync(fd, `${JSON.stringify(prepared)}\n`);
    fsyncSync(fd);
    return { fd, path };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function finishReceipt(receipt, status, details = {}) {
  writeSync(receipt.fd, `${JSON.stringify({ status, at: new Date().toISOString(), ...details })}\n`);
  fsyncSync(receipt.fd);
}

function validatedAnswers(body) {
  if (!body || typeof body !== 'object' || typeof body.model !== 'string' || !body.answers || typeof body.answers !== 'object') {
    throw new Error('The provider response did not match the documented answer shape.');
  }
  const answers = {};
  for (const id of ['supported_claim', 'wrong_owner_claim', 'unresolved_claim']) {
    const answer = body.answers[id];
    if (answer?.type !== 'choice' || !Object.hasOwn(CHOICES, answer.choice) ||
        !answer.probabilities || typeof answer.probabilities !== 'object' ||
        !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
      throw new Error('The provider response did not match the documented answer shape.');
    }
    const probabilities = {};
    for (const choice of Object.keys(CHOICES)) {
      const value = answer.probabilities[choice];
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error('The provider response did not match the documented answer shape.');
      }
      probabilities[choice] = value;
    }
    if (Math.abs(Object.values(probabilities).reduce((sum, value) => sum + value, 0) - 1) > 0.02) {
      throw new Error('The provider response did not match the documented answer shape.');
    }
    answers[id] = { choice: answer.choice, probabilities, confidence: answer.confidence };
  }
  return { model: body.model, answers };
}

export async function runProbe({ send = false, apiKey = env.TYPESAFE_API_KEY, auditDir, fetchImpl = fetch } = {}) {
  const request = buildProbeRequest();
  if (!send) return { mode: 'preview', destination: ENDPOINT, request };
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY in the local environment before --send.');
  const payload = JSON.stringify(request);
  const receipt = reserveReceipt(auditDir, payload);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: payload,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}.`);
    const result = validatedAnswers(await response.json());
    finishReceipt(receipt, 'completed', { httpStatus: response.status, responseModel: result.model });
    return { mode: 'result', ...result, auditPath: receipt.path, meaningAccepted: false };
  } catch (error) {
    finishReceipt(receipt, 'failed', { reason: /^Provider returned HTTP \d+\.$/.test(error?.message ?? '') ? error.message : 'request-or-response-error' });
    if (/^Provider returned HTTP \d+\.$/.test(error?.message ?? '')) throw error;
    throw new Error('The request failed or returned an invalid answer; see the local receipt.');
  } finally {
    closeSync(receipt.fd);
  }
}

function usage() {
  return 'Usage: node examples/external-judgment/probe.mjs [--preview] | --send --audit-dir=<private-directory>\n' +
    'Preview prints the exact fixed synthetic request. --send transmits it to TypeSafe using TYPESAFE_API_KEY and writes a local receipt before HTTP.\n';
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) { stdout.write(usage()); return 0; }
  const send = args.includes('--send');
  const auditArgs = args.filter((arg) => arg.startsWith('--audit-dir='));
  if (auditArgs.length > 1 || args.filter((arg) => arg === '--send').length > 1 ||
      args.some((arg) => !['--preview', '--send'].includes(arg) && !arg.startsWith('--audit-dir=')) ||
      (send && args.includes('--preview')) || (!send && auditArgs.length)) {
    stderr.write(usage());
    return 2;
  }
  try {
    const result = await runProbe({ send, auditDir: auditArgs[0]?.slice('--audit-dir='.length) });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (argv[1] && resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(argv.slice(2));
}
