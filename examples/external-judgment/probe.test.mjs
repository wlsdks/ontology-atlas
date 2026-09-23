import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

import { buildProbeRequest, runProbe } from './probe.mjs';

const scratch = [];

afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function auditDir() {
  const path = mkdtempSync(join(tmpdir(), 'atlas-judgment-'));
  scratch.push(path);
  return path;
}

test('preview shows the exact bounded request and never calls the provider', async () => {
  let calls = 0;
  const result = await runProbe({
    send: false,
    fetchImpl: async () => { calls += 1; throw new Error('unexpected network call'); },
  });
  assert.equal(calls, 0);
  assert.equal(result.mode, 'preview');
  assert.deepEqual(result.request, buildProbeRequest());
  assert.equal(result.request.model, 'jev-latest');
  assert.deepEqual(Object.keys(result.request.questions), ['supported_claim', 'wrong_owner_claim', 'unresolved_claim']);
});

test('send records the exact transfer before HTTP and returns advice without the key', async () => {
  const directory = auditDir();
  let calls = 0;
  const result = await runProbe({
    send: true,
    apiKey: 'test-secret-never-log',
    auditDir: directory,
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
      assert.equal(options.headers.Authorization, 'Bearer test-secret-never-log');
      assert.deepEqual(JSON.parse(options.body), buildProbeRequest());
      const files = readdirSync(directory);
      assert.equal(files.length, 1);
      const before = readFileSync(join(directory, files[0]), 'utf8');
      assert.match(before, /"status":"prepared"/);
      assert.doesNotMatch(before, /test-secret-never-log/);
      return new Response(JSON.stringify({
        model: 'jev-1.13.0',
        answers: {
          supported_claim: { type: 'choice', choice: 'supported', probabilities: { supported: 0.9, contradicted: 0.05, insufficient: 0.05 }, confidence: 0.8 },
          wrong_owner_claim: { type: 'choice', choice: 'contradicted', probabilities: { supported: 0.1, contradicted: 0.8, insufficient: 0.1 }, confidence: 0.7 },
          unresolved_claim: { type: 'choice', choice: 'insufficient', probabilities: { supported: 0.1, contradicted: 0.1, insufficient: 0.8 }, confidence: 0.7 },
        },
        usage: { input_tokens: 120, output_tokens: 20 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.mode, 'result');
  assert.equal(result.answers.wrong_owner_claim.choice, 'contradicted');
  assert.equal(result.answers.unresolved_claim.choice, 'insufficient');
  assert.equal(result.model, 'jev-1.13.0');
  const receipt = readFileSync(result.auditPath, 'utf8');
  assert.match(receipt, /"status":"completed"/);
  assert.doesNotMatch(receipt, /test-secret-never-log/);
  assert.doesNotMatch(JSON.stringify(result), /test-secret-never-log/);
});

test('missing key and unsafe audit target fail before network', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error('unexpected network call'); };
  await assert.rejects(runProbe({ send: true, apiKey: '', auditDir: auditDir(), fetchImpl }), /TYPESAFE_API_KEY/);
  const file = join(auditDir(), 'not-a-directory');
  writeFileSync(file, 'keep');
  await assert.rejects(runProbe({ send: true, apiKey: 'test', auditDir: file, fetchImpl }), /audit/i);
  assert.equal(calls, 0);
});

test('provider failure leaves a prepared and failed receipt without echoing response text', async () => {
  const directory = auditDir();
  await assert.rejects(runProbe({
    send: true,
    apiKey: 'test-secret-never-log',
    auditDir: directory,
    fetchImpl: async () => new Response('test-secret-never-log', { status: 401 }),
  }), /HTTP 401/);
  const receipt = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8');
  assert.match(receipt, /"status":"prepared"/);
  assert.match(receipt, /"status":"failed"/);
  assert.doesNotMatch(receipt, /test-secret-never-log/);
});

test('invalid choice distributions fail instead of looking like a judgment', async () => {
  const directory = auditDir();
  await assert.rejects(runProbe({
    send: true,
    apiKey: 'test-secret-never-log',
    auditDir: directory,
    fetchImpl: async () => new Response(JSON.stringify({
      model: 'jev-1.13.0',
      answers: {
        supported_claim: { type: 'choice', choice: 'supported', probabilities: { supported: 0.9, contradicted: 0.9, insufficient: 0.1 }, confidence: 0.8 },
        wrong_owner_claim: { type: 'choice', choice: 'contradicted', probabilities: { supported: 0.1, contradicted: 0.8, insufficient: 0.1 }, confidence: 0.7 },
        unresolved_claim: { type: 'choice', choice: 'insufficient', probabilities: { supported: 0.1, contradicted: 0.1, insufficient: 0.8 }, confidence: 0.7 },
      },
    }), { status: 200 }),
  }), /invalid answer/);
  const receipt = readFileSync(join(directory, readdirSync(directory)[0]), 'utf8');
  assert.match(receipt, /"status":"failed"/);
  assert.doesNotMatch(receipt, /test-secret-never-log/);
});
